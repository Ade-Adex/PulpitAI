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

      try {
        if (provider === 'gemini') {
          try {
            await runGeminiStream();
          } catch (streamErr) {
            // Quota/auth errors will fail identically non-streaming — bubble
            // straight to the fallback chain. Transient stream issues only:
            // retry once without streaming.
            if (/429|rate|quota|40[13]/i.test(streamErr.message)) throw streamErr;
            console.warn('[pipeline] Gemini streaming failed, retrying plain:', streamErr.message);
            await runGemini();
          }
        } else if (provider === 'openai') {
          await runOpenAI();
        } else {
          await runDemo();
        }
      } catch (firstErr) {
        // Gemini 429 / quota exceeded → fall back to OpenAI, then Demo.
        // OpenAI failure → fall back to Demo.
        if (provider === 'gemini' && s.apiKey) {
          provider = 'openai';
          fellBack = true;
          this.emit('status', { state: 'transcribing' });
          await runOpenAI();
        } else if (provider === 'openai') {
          provider = 'demo';
          fellBack = true;
          this.emit('status', { state: 'transcribing' });
          await runDemo();
        } else if (provider === 'gemini') {
          provider = 'demo';
          fellBack = true;
          this.emit('status', { state: 'transcribing' });
          await runDemo();
        } else {
          throw firstErr;
        }
      }

      if (fellBack) {
        // In live mode a demo fallback keeps the app transcript going, but the
        // stream overlay must never show simulated text — say so clearly.
        const overlayNote =
          provider === 'demo' && requested !== 'demo'
            ? ' Demo captions appear in-app only — the stream overlay is paused until a live provider recovers.'
            : ' Captions continue.';
        this.emit('status', {
          state: 'warning',
          message: `Switched to ${provider} (primary provider rate-limited or unavailable).${overlayNote}`,
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


