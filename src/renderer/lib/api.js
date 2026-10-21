// Thin, typed-ish wrapper over the Electron preload bridge (window.pulpit).
// Components never touch ipcRenderer directly - they call these functions.

import {
  ChristBCHymnProvider,
  createChristBCProvider,
  ChristBCErrorCode,
} from './christbc.js';

// In a non-Electron browser (e.g. `vite` preview / dev), window.pulpit is
// undefined. Fall back to an in-memory store so the UI can boot without
// crashing — useful for development and browser-based testing.
const bridge = window.pulpit || {
  _store: {
    settings: { theme: 'dark', vadThreshold: 0.018, vadSilenceMs: 400, maxUtteranceMs: 6000 },
  },
  getSettings: () => Promise.resolve(bridge._store.settings),
  saveSettings: (patch) => {
    bridge._store.settings = { ...bridge._store.settings, ...patch };
    return Promise.resolve(bridge._store.settings);
  },
  transcribeChunk: () => Promise.resolve({ segments: [] }),
  getOverlayInfo: () => Promise.resolve({ url: '' }),
  openOverlayWindow: () => Promise.resolve(),
  onSegment: (cb) => () => {},
  onPipelineStatus: (cb) => () => {},
};

export const api = {
  getSettings: () => bridge.getSettings(),
  saveSettings: (patch) => bridge.saveSettings(patch),
  transcribeChunk: (audioBase64) => bridge.transcribeChunk({ audioBase64 }),
  getOverlayInfo: () => bridge.getOverlayInfo(),
  openOverlayWindow: () => bridge.openOverlayWindow(),
  onSegment: (cb) => bridge.onSegment(cb),
  onPipelineStatus: (cb) => bridge.onPipelineStatus(cb),

  /** Build a Christ BC Hymn API provider. Accepts per-church overrides. */
  createChristBCHymnProvider: (overrides = {}) => {
    return createChristBCProvider(overrides);
  },
};

export { ChristBCHymnProvider, createChristBCProvider, ChristBCErrorCode };
