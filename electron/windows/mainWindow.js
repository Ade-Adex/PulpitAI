// Main application window. Loads the Vite dev server in dev, or the built
// renderer from dist/renderer in production.
import { BrowserWindow, Menu } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRELOAD = path.join(__dirname, '..', 'preload.cjs');
const ICON = path.join(__dirname, '..', 'assets', 'icon.png');

export function createMainWindow(isDev) {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0e1116',
    title: 'PulpitAI - Yoruba to English Live Translator',
    icon: ICON,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Belt-and-suspenders: never show the File/Edit/View/... menu bar.
  Menu.setApplicationMenu(null);
  win.setMenu(null);

  if (isDev) {
    win.loadURL(process.env.PULPIT_DEV_URL);
    // DevTools only when explicitly requested: `npm run dev:debug`
    if (process.env.PULPIT_DEVTOOLS === '1') {
      win.webContents.openDevTools({ mode: 'detach' });
    }
    // Surface page load failures and renderer errors in the terminal, so a
    // blank window is never silent about what went wrong.
    win.webContents.on('did-fail-load', (_event, code, description) => {
      console.error(`[mainWindow] page failed to load: ${description} (${code})`);
    });
    win.webContents.on('console-message', (event) => {
      // Electron >= 32: message/level live on the event object.
      const text = event?.message;
      if (text) console.error(`[renderer] ${text}`);
    });
  } else {
    win.loadFile(path.join(__dirname, '..', '..', 'dist', 'renderer', 'index.html'));
  }

  return win;
}
