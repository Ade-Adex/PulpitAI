// All ipcMain.handle() registrations in one place, kept thin:
// each handler delegates to a service and returns plain data.
import { ipcMain } from 'electron';
import { openOverlayWindow } from '../windows/overlayWindow.js';

export function registerIpcHandlers({ settings, pipeline, overlayServer }) {
  ipcMain.handle('settings:get', () => settings.get());

  ipcMain.handle('settings:save', (_event, patch) => {
    const before = settings.get().provider;
    const next = settings.save(patch);
    // Switching Demo ↔ Live clears the overlay replay history so captions
    // from the old mode never reappear on the stream after a reconnect.
    if (patch && patch.provider !== undefined && patch.provider !== before) {
      overlayServer.clearHistory();
    }
    return next;
  });

  ipcMain.handle('pipeline:transcribe', (_event, { audioBase64 }) => {
    const bytes = Buffer.from(audioBase64, 'base64');
    const blob = new Blob([bytes], { type: 'audio/webm' });
    return pipeline.enqueue(blob);
  });

  ipcMain.handle('pipeline:status', () => ({ state: 'idle' }));

  ipcMain.handle('overlay:info', () => ({
    url: overlayServer.url,
    port: overlayServer.port,
    running: true,
  }));

  ipcMain.handle('overlay:open-window', () => {
    openOverlayWindow(overlayServer.url);
  });
}
