// User settings persisted as JSON in the OS app-data folder.
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULTS = {
  // Provider: 'auto' (OpenAI key -> Gemini key -> demo), or force one.
  provider: 'auto',
  apiKey: '',
  sttModel: 'whisper-1', // supports Yoruba (yo)
  translatorModel: 'gpt-4o-mini',
  // Google Gemini (free tier - great for testing; see aistudio.google.com)
  geminiApiKey: '',
  geminiModel: 'gemini-3.8-flash',
  // Caption behaviour
  showYorubaLine: true,
  captionPosition: 'bottom', // 'bottom' | 'top'
  captionFontSize: 42,
  maxCaptions: 3,
  captionIdleSeconds: 12, // clear overlay after this much silence
  transcriptFontSize: 14, // px, app transcript panel
  showTimestamps: true,
  showLatency: true,
  autoScroll: true,
  theme: 'dark', // 'dark' | 'light'
  accentColor: '#4da3ff',
  alwaysOnTop: false,

  // Overlay server
  overlayPort: 8787,
  // Audio / VAD
  vadThreshold: 0.018, //0..1, RMS silence gate
  vadSilenceMs: 400, // ms of silence that ends an utterance (lower = faster captions)
  maxUtteranceMs: 6000, // force-send even if still talking (lower = faster captions)
};

export class SettingsStore {
  #file;
  #data;

  constructor() {
    this.#file = path.join(app.getPath('userData'), 'pulpitai-settings.json');
    this.#data = { ...DEFAULTS, ...this.#load() };
  }

  #load() {
    try {
      return JSON.parse(fs.readFileSync(this.#file, 'utf8'));
    } catch {
      return {};
    }
  }

  get() {
    return { ...this.#data };
  }

  // Shallow-merge a patch, persist, and return the new settings.
  save(patch) {
    this.#data = { ...this.#data, ...patch };
    fs.mkdirSync(path.dirname(this.#file), { recursive: true });
    fs.writeFileSync(this.#file, JSON.stringify(this.#data, null, 2), 'utf8');
    return this.get();
  }
}
