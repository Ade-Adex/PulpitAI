import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Dev needs 'unsafe-inline' scripts for Vite/React Fast Refresh's injected
// bootstrap script; production stays strict ('self' only).
const CSP_PROD =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob: mediastream:; connect-src 'self'";
const CSP_DEV =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob: mediastream:; connect-src 'self' ws://localhost:5173 http://localhost:5173 ws://127.0.0.1:5173 http://127.0.0.1:5173";

const CSP_TAG = /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")([^"]*)(")/i;

function cspPlugin(isDev) {
  const csp = isDev ? CSP_DEV : CSP_PROD;
  return {
    name: 'pulpitai-csp',
    transformIndexHtml(html) {
      return html.replace(CSP_TAG, (_match, open, _old, close) => `${open}${csp}${close}`);
    },
  };
}

// The React renderer lives in src/renderer and is bundled to dist/renderer.
// Electron loads it from the Vite dev server in dev, or from disk in production.
export default defineConfig(({ command }) => ({
  root: fileURLToPath(new URL('./src/renderer', import.meta.url)),
  base: './',
  plugins: [react(), cspPlugin(command === 'serve')],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: fileURLToPath(new URL('./dist/renderer', import.meta.url)),
    emptyOutDir: true,
  },
}));
