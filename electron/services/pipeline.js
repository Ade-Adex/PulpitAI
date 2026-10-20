// TranscriptionPipeline: the heart of the app.
// Audio chunk -> STT provider -> Yoruba + English -> 'segment' event.
// Providers: gemini (one call does both), groq (Whisper + Llama),
// openai (Whisper + GPT), demo (scripted captions, no key).
// 'auto' picks the first keyed provider.
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import { transcribeAudio } from './stt/openaiWhisper.js';
import { transcribeAndTranslate as geminiProcess, streamTranscribeAndTranslate } from './stt/geminiAudio.js';
import { mockTranscribe } from './stt/mockStt.js';
import { translateToEnglish } from './translation/openaiTranslator.js';

// GroQ exposes OpenAI-compatible endpoints, so the existing Whisper +
// chat-completions clients are reused with this base URL.
const GROQ_BASE = 'https://api.groq.com/openai/v1';
// GroQ retires/locks models without much notice (llama-3.3-70b-versatile
// became Enterprise-only in 2026) — keep known-good alternates so captions
// survive a rotation. Tried in order after the user's configured model.
const GROQ_CHAT_FALLBACKS = ['openai/gpt-oss-20b', 'llama-3.1-8b-instant'];
const GROQ_STT_FALLBACKS = ['whisper-large-v3-turbo'];
const REAL_PROVIDERS = ['openai', 'gemini', 'groq'];
const PROVIDER_LABELS = { openai: 'OpenAI', gemini: 'Gemini', groq: 'GroQ', demo: 'Demo' };

export class TranscriptionPipeline extends EventEmitter {
  #settings;
  #nextSeq = 0; // monotonic sequence number for each enqueued chunk
  #inFlight = new Map(); // seq -> Promise<{ seq, segment }>
  #emitted = 0; // next seq to emit (keeps captions in order)
  #geminiGate = Promise.resolve(); // serialises Gemini request pacing
  #geminiNextAt = 0; // earliest timestamp for the next Gemini request start
  #geminiBlockedUntil = 0; // after a real 429: fast-fail until this time
  #geminiBackoffStep = 0; // consecutive 429s → 15s, 30s, 60s, 120s cooldown

  constructor(settings) {
    super();
    this.#settings = settings;
  }

  // Queue a chunk for processing. Multiple chunks can be in flight at once
  // (concurrent STT calls), but segments are always emitted in capture order
  // so the transcript never gets jumbled.
  enqueue(audioBlob) {
    const seq = this.#nextSeq++;
    const promise = this.#process(audioBlob).then((segment) => ({ seq, segment }));
    this.#inFlight.set(seq, promise);
    this.#drain();
    return promise.then(({ segment }) => segment);
  }

  // Emit any completed segments whose turn has come, in sequence order.
  // Failed chunks are dropped (not rethrown) so one bad chunk can never
  // stall every later caption.
  #drain() {
    const emitNext = async () => {
      while (this.#inFlight.has(this.#emitted)) {
        const seq = this.#emitted;
        let result;
        try {
          result = await this.#inFlight.get(seq);
        } catch {
          this.#inFlight.delete(seq);
          this.#emitted++;
          continue;
        }
        this.#inFlight.delete(result.seq);
        if (result.segment) this.emit('segment', result.segment);
        this.#emitted++;
      }
    };
    emitNext();
  }

  // Mirrors effectiveProvider() in src/renderer/lib/providers.js.
  #resolveProvider(s) {
    if (['openai', 'gemini', 'groq', 'demo'].includes(s.provider)) return s.provider;
    if (s.apiKey) return 'openai';
    if (s.geminiApiKey) return 'gemini';
    if (s.groqApiKey) return 'groq';
    return 'demo';
  }

  // Serialise + pace Gemini request STARTS at least 4.5s apart (~13 req/min)
  // so fast VAD chunking can't burst past the provider's per-minute rate
  // limit — bursts were causing 429 storms where every call failed and the
  // transcript silently fell back to demo text.
  #paceGemini() {
    const run = this.#geminiGate.then(async () => {
      const wait = this.#geminiNextAt - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      this.#geminiNextAt = Date.now() + 4500;
    });
    this.#geminiGate = run.catch(() => {});
    return run;
  }

  // GroQ rotates/locks models often. Try the configured model first, then
  // known-good alternates on model_not_found, and auto-heal the saved
  // setting to whichever model actually worked.
  async #groqWithFallback(kind, s, impl) {
    const primary =
      kind === 'chat'
        ? s.groqChatModel || 'openai/gpt-oss-120b'
        : s.groqSttModel || 'whisper-large-v3';
    const alternates = kind === 'chat' ? GROQ_CHAT_FALLBACKS : GROQ_STT_FALLBACKS;
    const models = [primary, ...alternates.filter((m) => m !== primary)];
    let lastErr = null;
    for (const model of models) {
      try {
        const result = await impl(model);
        if (model !== primary) {
          try {
            this.#settings.save(kind === 'chat' ? { groqChatModel: model } : { groqSttModel: model });
          } catch {
            // Persisting the auto-heal is best-effort.
          }
          console.warn(`[pipeline] GroQ ${kind} model healed to ${model}`);
        }
        return result;
      } catch (err) {
        lastErr = err;
        // Only model-availability errors benefit from swapping models —
        // auth/quota/etc. must bubble up immediately.
        if (!/model_not_found|does not exist|\(404\)/i.test(String(err?.message))) throw err;
        console.warn(`[pipeline] GroQ ${kind} model ${model} unavailable, trying next…`);
      }
    }
    throw lastErr;
  }

  async #process(audioBlob) {
    const s = this.#settings.get();
    const startedAt = Date.now();
    const requested = this.#resolveProvider(s);
    const demo = requested === 'demo';
    // Stable id shared by the interim (partial) and final version of this
    // caption so receivers can upsert instead of duplicating.
    const id = crypto.randomUUID();

    this.emit('status', { state: 'transcribing' });
    try {
      let yoruba = '';
      let english = '';
      let audioSec = null;
      let provider = requested;
      let fellBack = false;

      const runGemini = async () => {
        const result = await geminiProcess({
          apiKey: s.geminiApiKey,
          model: s.geminiModel,
          audioBlob,
        });
        yoruba = result.yoruba;
        english = result.english;
      };

      // Streaming run: reports partial text while Gemini is still generating.
      // Partials are only emitted while this is the ONLY chunk in flight —
      // if a queue forms, interleaved partials would jumble captions.
      const runGeminiStream = async () => {
        const result = await streamTranscribeAndTranslate({
          apiKey: s.geminiApiKey,
          model: s.geminiModel,
          audioBlob,
          onPartial: (partial) => {
            if (this.#inFlight.size > 1) return; // queue forming — skip partials
            if (!partial.yoruba && !partial.english) return;
            this.emit('segment:partial', {
              id,
              yoruba: partial.yoruba,
              english: partial.english,
              at: Date.now(),
              interim: true,
              demo: false,
              requestedProvider: requested,
              provider: 'gemini',
            });
          },
        });
        yoruba = result.yoruba;
        english = result.english;
      };

      const runOpenAI = async () => {
        const stt = await transcribeAudio({
          apiKey: s.apiKey,
          model: s.sttModel,
          audioBlob,
        });
        yoruba = stt.text;
        audioSec = stt.durationSec ?? null;
        if (yoruba) {
          this.emit('status', { state: 'translating' });
          english = await translateToEnglish({
            apiKey: s.apiKey,
            model: s.translatorModel,
            yorubaText: yoruba,
          });
        }
      };

      const runDemo = async () => {
        const result = await mockTranscribe(audioBlob);
        yoruba = result.text;
        english = result.english;
        audioSec = result.durationSec ?? null;
      };

      // GroQ: Whisper transcribes Yoruba, GPT-OSS/Llama translates
      // (OpenAI-compatible endpoints via baseUrl), same two-step shape as
      // OpenAI — with model fallback so a retired model can't stall captions.
      const runGroq = async () => {
        const stt = await this.#groqWithFallback('stt', s, (model) =>
          transcribeAudio({ apiKey: s.groqApiKey, model, audioBlob, baseUrl: GROQ_BASE }),
        );
        yoruba = stt.text;
        audioSec = stt.durationSec ?? null;
        if (yoruba) {
          this.emit('status', { state: 'translating' });
          english = await this.#groqWithFallback('chat', s, (model) =>
            translateToEnglish({ apiKey: s.groqApiKey, model, yorubaText: yoruba, baseUrl: GROQ_BASE }),
          );
        }
      };

      // One runner per provider. Gemini gets pacing, stream→plain retry, and
      // an adaptive 429 cooldown: after a real quota error it fast-fails for
      // 15s→30s→60s→120s (instead of hammering Google) while the caption
      // queue stays responsive and other providers can carry the stream.
      const runnerFor = (p) => async () => {
        if (p === 'gemini') {
          const blockedMs = this.#geminiBlockedUntil - Date.now();
          if (blockedMs > 0) {
            const pause = new Error(
              `Gemini quota pause — not retrying for ${Math.ceil(blockedMs / 1000)}s to avoid more 429s.`,
            );
            pause.geminiPause = true;
            throw pause;
          }
          await this.#paceGemini();
          try {
            await runGeminiStream();
          } catch (streamErr) {
            // Quota/auth errors will fail identically non-streaming — bubble
            // up. Transient stream issues only: retry once without streaming.
            if (/429|rate|quota|40[13]/i.test(streamErr.message)) throw streamErr;
            console.warn('[pipeline] Gemini streaming failed, retrying plain:', streamErr.message);
            await this.#paceGemini();
            await runGemini();
          }
        } else if (p === 'openai') {
          await runOpenAI();
        } else if (p === 'groq') {
          await runGroq();
        } else {
          await runDemo();
        }
      };

      let lastErr = null;
      let lastErrLabel = 'Provider';
      const attempt = async (p, fn) => {
        try {
          await fn();
          if (p === 'gemini') {
            this.#geminiBackoffStep = 0;
            this.#geminiBlockedUntil = 0;
          }
          return true;
        } catch (err) {
          // Keep the most informative error: self-inflicted pause messages
          // must not overwrite a real API error from an earlier attempt.
          if (!err.geminiPause || !lastErr) {
            lastErr = err;
            lastErrLabel = PROVIDER_LABELS[p] ?? p;
          }
          // Real API 429 → start/extend the cooldown (15s → 120s cap).
          if (p === 'gemini' && !err.geminiPause && /429|quota/i.test(String(err.message))) {
            this.#geminiBackoffStep = Math.min(this.#geminiBackoffStep + 1, 5);
            this.#geminiBlockedUntil =
              Date.now() + Math.min(15000 * 2 ** (this.#geminiBackoffStep - 1), 120_000);
          }
          return false;
        }
      };

      let ok = await attempt(provider, runnerFor(provider));

      // Fallback is only ever between REAL providers (OpenAI / Gemini / GroQ,
      // whoever else has a key configured). When the user chose live mode we
      // NEVER substitute demo text — if no real provider works we pause
      // captions and surface the real error so fake scripture lines can't
      // masquerade as the sermon.
      if (!ok && requested !== 'demo') {
        const keyOf = { openai: s.apiKey, gemini: s.geminiApiKey, groq: s.groqApiKey };
        const start = Math.max(0, REAL_PROVIDERS.indexOf(requested));
        const chain = [
          ...REAL_PROVIDERS.slice(start + 1),
          ...REAL_PROVIDERS.slice(0, start),
        ];
        for (const p of chain) {
          if (p === requested || !keyOf[p]) continue;
          provider = p;
          fellBack = true;
          this.emit('status', { state: 'transcribing' });
          ok = await attempt(p, runnerFor(p));
          if (ok) break;
        }
      }

      if (!ok) {
        if (requested === 'demo') throw lastErr;
        // LIVE MODE: pause and say exactly why (e.g. 429 quota/billing).
        const detail = String(lastErr?.message ?? lastErr).replace(/\s+/g, ' ').slice(0, 240);
        let quotaNote = '';
        if (/429|quota/i.test(detail)) {
          quotaNote = /billing|plan and billing/i.test(detail)
            ? " Your key's project plan/billing needs attention — check aistudio.google.com → API keys."
            : ' Quota exceeded — captions pause and retry automatically; will try again shortly.';
          quotaNote += ' You can also switch provider in Settings (e.g. GroQ — free tier).';
        }
        this.emit('status', {
          state: 'warning',
          message: `Live captions paused — ${lastErrLabel} failed: ${detail}${quotaNote} Demo text is never shown in live mode; will retry on your next phrase.`,
        });
        this.emit('status', { state: 'idle' });
        return null;
      }

      if (fellBack) {
        this.emit('status', {
          state: 'warning',
          message: `Switched to ${PROVIDER_LABELS[provider] ?? provider} (primary provider rate-limited or unavailable). Captions continue.`,
        });
      }

      if (!yoruba) {
        this.emit('status', { state: 'idle' });
        return null; // silence / noise, not worth a caption
      }

      const segment = {
        id,
        yoruba,
        english,
        at: Date.now(),
        audioSec,
        latencyMs: Date.now() - startedAt,
        demo: provider === 'demo',
        provider,
        requestedProvider: requested,
        fellBack,
      };

      // NOTE: 'segment' is emitted by the ordered #drain() after this
      // resolves — emitting here as well duplicated every caption.
      this.emit('status', { state: 'idle' });
      return segment;
    } catch (err) {
      this.emit('status', { state: 'error', message: err.message });
      throw err;
    }
  }
}


