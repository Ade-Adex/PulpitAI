// TranscriptionPipeline: the heart of the app.
// Audio chunk -> STT provider -> Yoruba + English -> 'segment' event.
// Providers: openai (Whisper + GPT), gemini (one free call does both),
// demo (scripted captions, no key). 'auto' picks the first keyed provider.
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import { transcribeAudio } from './stt/openaiWhisper.js';
import { transcribeAndTranslate as geminiProcess } from './stt/geminiAudio.js';
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
  #drain() {
    const emitNext = async () => {
      while (this.#inFlight.has(this.#emitted)) {
        const result = await this.#inFlight.get(this.#emitted);
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
          await runGemini();
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
        id: crypto.randomUUID(),
        yoruba,
        english,
        at: Date.now(),
        audioSec,
        latencyMs: Date.now() - startedAt,
        demo: provider === 'demo',
        provider,
        fellBack,
      };

      this.emit('segment', segment);
      this.emit('status', { state: 'idle' });
      return segment;
    } catch (err) {
      this.emit('status', { state: 'error', message: err.message });
      throw err;
    }
  }
}


