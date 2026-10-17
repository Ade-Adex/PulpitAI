// Electron entry point: wires windows, services and IPC together.
// Each concern lives in its own module under electron/.
import { app, BrowserWindow } from 'electron';
import { createMainWindow } from './windows/mainWindow.js';
import { SettingsStore } from './services/settingsStore.js';
import { TranscriptionPipeline } from './services/pipeline.js';
import { OverlayServer } from './services/overlayServer.js';
import { registerMediaPermissions } from './services/mediaPermissions.js';
import { registerIpcHandlers } from './ipc/handlers.js';

const IS_DEV = !!process.env.PULPIT_DEV_URL;
const IS_SMOKE_TEST = process.argv.includes('--smoke-test');

// Shared services (created once, injected where needed).
export const settings = new SettingsStore();
export const pipeline = new TranscriptionPipeline(settings);
export const overlayServer = new OverlayServer(settings);

let mainWindow = null;

export function getMainWindow() {
  return mainWindow;
}

// Broadcast every finished segment to the app UI and the overlay clients.
pipeline.on('segment', (segment) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('segment:new', segment);
  }
  overlayServer.broadcastSegment(segment);
});

pipeline.on('status', (status) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('pipeline:status', status);
  }
});

async function start() {
  registerMediaPermissions();
  registerIpcHandlers({ settings, pipeline, overlayServer });

  await overlayServer.start();

  mainWindow = createMainWindow(IS_DEV);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

if (IS_SMOKE_TEST) {
  // Quick boot check used by `npm run smoke`: starts the overlay server,
  // prints its URL, and exits without opening any window.
  app.whenReady().then(async () => {
    await overlayServer.start();
    console.log(`[smoke] overlay server listening on ${overlayServer.url}`);
    overlayServer.stop();
    app.exit(0);
  });
} else {
  app.whenReady().then(start);
}

app.on('window-all-closed', () => {
  overlayServer.stop();
  app.quit();
});
