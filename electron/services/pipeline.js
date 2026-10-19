// TranscriptionPipeline: the heart of the app.
// Audio chunk -> STT provider -> Yoruba + English -> 'segment' event.
// Providers: openai (Whisper + GPT), gemini (one free call does both),
// demo (scripted captions, no key). 'auto' picks the first keyed provider.
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import { transcribeAudio } from './stt/openaiWhisper.js';
import { transcribeAndTranslate as geminiProcess, streamTranscribeAndTranslate } from './stt/geminiAudio.js';
import { mockTranscribe } from './stt/mockStt.js';
import { translateToEnglish } from './translation/openaiTranslator.js';

export class TranscriptionPipeline extends EventEmitter {
  #settings;
  #nextSeq = 0; // monotonic sequence number for each enqueued chunk
  #inFlight = new Map(); // seq -> Promise<{ seq, segment }>
  #emitted = 0; // next seq to emit (keeps captions in order)
  #geminiGate = Promise.resolve(); // serialises Gemini request pacing
  #geminiNextAt = 0; // earliest timestamp for the next Gemini request start

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
    if (['openai', 'gemini', 'demo'].includes(s.provider)) return s.provider;
    if (s.apiKey) return 'openai';
    if (s.geminiApiKey) return 'gemini';
    return 'demo';
  }

  // Serialise + pace Gemini request STARTS at least 4.5s apart (~13 req/min)
  // so fast VAD chunking can't burst past the free tier's per-minute rate
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

      let lastErr = null;
      let lastErrLabel = 'Provider';
      const attempt = async (label, fn) => {
        try {
          await fn();
          return true;
        } catch (err) {
          lastErr = err;
          lastErrLabel = label;
          return false;
        }
      };

      let ok;
      if (provider === 'gemini') {
        ok = await attempt('Gemini', async () => {
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
        });
      } else if (provider === 'openai') {
        ok = await attempt('OpenAI', runOpenAI);
      } else {
        ok = await attempt('Demo', runDemo);
      }

      // Fallback is only ever between REAL providers (Gemini <-> OpenAI).
      // When the user chose live mode we NEVER substitute demo text — if no
      // real provider works we pause captions and surface the real error so
      // fake scripture lines can't masquerade as the sermon.
      if (!ok && requested !== 'demo') {
        const secondary =
          provider === 'gemini' && s.apiKey
            ? 'openai'
            : provider === 'openai' && s.geminiApiKey
              ? 'gemini'
              : null;
        if (secondary) {
          provider = secondary;
          fellBack = true;
          this.emit('status', { state: 'transcribing' });
          ok =
            secondary === 'openai'
              ? await attempt('OpenAI', runOpenAI)
              : await attempt('Gemini', async () => {
                  await this.#paceGemini();
                  await runGemini();
                });
        }
      }

      if (!ok) {
        if (requested === 'demo') throw lastErr;
        // LIVE MODE: pause and say exactly why (e.g. 429 quota exhausted).
        const detail = String(lastErr?.message ?? lastErr).replace(/\s+/g, ' ').slice(0, 240);
        const quotaNote = /429|quota/i.test(detail)
          ? ' Free-tier quota reached — captions resume automatically once it resets.'
          : '';
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
          message: `Switched to ${provider} (primary provider rate-limited or unavailable). Captions continue.`,
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


