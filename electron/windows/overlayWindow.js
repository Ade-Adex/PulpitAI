// Frameless, transparent, click-through overlay window.
// Useful for vMix / OBS window capture when a Browser Source is not an option.
import { BrowserWindow, screen } from 'electron';

let overlayWindow = null;

export function openOverlayWindow(url) {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.focus();
    return;
  }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  overlayWindow = new BrowserWindow({
    width,
    height: 260,
    x: 0,
    y: height - 260,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Let clicks pass through to whatever is underneath.
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.loadURL(`${url}?mode=window`);

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

export function closeOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close();
  }
  overlayWindow = null;
}
