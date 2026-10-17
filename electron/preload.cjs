// Preload: the ONLY bridge between React and Electron.
// Exposed as window.pulpit.* - keep it small and explicit.
// NOTE: this file is CommonJS (.cjs) on purpose - Electron preloads must use
// require(), never ESM import syntax.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pulpit', {
  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),

  // Transcription pipeline
  transcribeChunk: (payload) => ipcRenderer.invoke('pipeline:transcribe', payload),
  getPipelineStatus: () => ipcRenderer.invoke('pipeline:status'),

  // Overlay server
  getOverlayInfo: () => ipcRenderer.invoke('overlay:info'),
  openOverlayWindow: () => ipcRenderer.invoke('overlay:open-window'),

  // Events from main -> renderer
  onSegment: (callback) => {
    const listener = (_event, segment) => callback(segment);
    ipcRenderer.on('segment:new', listener);
    return () => ipcRenderer.removeListener('segment:new', listener);
  },
  onPipelineStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('pipeline:status', listener);
    return () => ipcRenderer.removeListener('pipeline:status', listener);
  },
});
