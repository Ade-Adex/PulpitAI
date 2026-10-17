// Thin, typed-ish wrapper over the Electron preload bridge (window.pulpit).
// Components never touch ipcRenderer directly - they call these functions.

const bridge = window.pulpit;

export const api = {
  getSettings: () => bridge.getSettings(),
  saveSettings: (patch) => bridge.saveSettings(patch),
  transcribeChunk: (audioBase64) => bridge.transcribeChunk({ audioBase64 }),
  getOverlayInfo: () => bridge.getOverlayInfo(),
  openOverlayWindow: () => bridge.openOverlayWindow(),
  onSegment: (cb) => bridge.onSegment(cb),
  onPipelineStatus: (cb) => bridge.onPipelineStatus(cb),
};
