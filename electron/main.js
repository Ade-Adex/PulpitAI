// Electron entry point: wires windows, services and IPC together.
// Each concern lives in its own module under electron/.
import { app, BrowserWindow, Menu } from 'electron';
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

// Forward every segment to the app UI. The overlay only receives captions
// that are safe for the LIVE stream: in demo mode simulated captions are the
// whole point (testing OBS/browser wiring), but when a live provider was
// requested, fallback demo text must never reach the stream.
function shouldBroadcast(segment) {
  return !segment.demo || segment.requestedProvider === 'demo';
}

function forwardSegment(segment) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('segment:new', segment);
  }
  if (shouldBroadcast(segment)) overlayServer.broadcastSegment(segment);
}

pipeline.on('segment', forwardSegment);
pipeline.on('segment:partial', forwardSegment);

pipeline.on('status', (status) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('pipeline:status', status);
  }
});

// Inject the canonical PulpitAI Origin header on outgoing requests to the
// Christ BC gateway. Chromium treats `Origin` as a forbidden header name in
// the renderer, so a manually-set header is silently dropped and the gateway
// sees the app's real origin (file:// / app://) instead, causing
// origin_not_allowed. Re-injecting it from the main process (where headers
// are mutable) keeps origin validation intact for the desktop app.
// (Origin injection removed: the desktop app is a server-side client and
// sends no Origin header, so origin restrictions only apply to browser
// clients. Keys work whether or not allowed origins are configured.)
function registerOriginHeader() {}

async function start() {
  // No native menu bar (File/Edit/View/Window/Help) — this is a consumer
  // app, not an editor. Removes the menu entirely on Windows/Linux.
  Menu.setApplicationMenu(null);

  registerMediaPermissions();
  registerOriginHeader();
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
