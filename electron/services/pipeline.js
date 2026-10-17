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
  #queue = Promise.resolve(); // serialises jobs so captions stay in order

  constructor(settings) {
    super();
    this.#settings = settings;
  }

  // Queue a chunk for processing. Resolves with the finished segment.
  // Jobs run one at a time - preaching is sequential, so captions stay in order.
  enqueue(audioBlob) {
    const job = this.#queue.then(() => this.#process(audioBlob));
    this.#queue = job.catch(() => {}); // keep the chain alive after errors
    return job;
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
    const provider = this.#resolveProvider(s);
    const demo = provider === 'demo';

    this.emit('status', { state: 'transcribing' });
    try {
      let yoruba = '';
      let english = '';
      let audioSec = null;

      if (provider === 'gemini') {
        // One free-tier call transcribes AND translates.
        const result = await geminiProcess({
          apiKey: s.geminiApiKey,
          model: s.geminiModel,
          audioBlob,
        });
        yoruba = result.yoruba;
        english = result.english;
      } else if (provider === 'demo') {
        const result = await mockTranscribe(audioBlob);
        yoruba = result.text;
        english = result.english;
        audioSec = result.durationSec ?? null;
      } else {
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
        demo,
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


