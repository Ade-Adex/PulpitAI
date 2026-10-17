// OverlayServer: a tiny Express + WebSocket server that serves the caption
// overlay page. Point an OBS "Browser Source" at it, or open it in the
// frameless overlay window for vMix/OBS window capture.
import express from 'express';
import http from 'node:http';
import { WebSocketServer } from 'ws';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OVERLAY_DIR = path.join(__dirname, 'public');

export class OverlayServer {
  #settings;
  #server = null;
  #wss = null;
  #history = [];

  constructor(settings) {
    this.#settings = settings;
  }

  get port() {
    return this.#settings.get().overlayPort;
  }

  get url() {
    return `http://127.0.0.1:${this.port}/overlay`;
  }

  async start() {
    if (this.#server) return;

    const app = express();

    // Serve the overlay page at /overlay (OBS Browser Source URL).
    // Without this, Express static looks for index.html which doesn't exist
    // (the file is overlay.html), so GET /overlay returns 404.
    app.get('/overlay', (_req, res) => {
      res.sendFile(path.join(OVERLAY_DIR, 'overlay.html'));
    });

    app.use('/overlay', express.static(OVERLAY_DIR));

    // Overlay page fetches its styling once on load.
    app.get('/overlay-config', (_req, res) => {
      const s = this.#settings.get();
      res.json({
        showYorubaLine: s.showYorubaLine,
        captionPosition: s.captionPosition,
        captionFontSize: s.captionFontSize,
        maxCaptions: s.maxCaptions,
        captionIdleSeconds: s.captionIdleSeconds,
      });
    });

    this.#server = http.createServer(app);
    this.#wss = new WebSocketServer({ server: this.#server, path: '/overlay-ws' });

    this.#wss.on('connection', (ws) => {
      // Send recent captions so a late-joining OBS source isn't empty.
      ws.send(JSON.stringify({ type: 'history', segments: this.#history }));
    });

    await new Promise((resolve, reject) => {
      this.#server.once('error', reject);
      this.#server.listen(this.port, '127.0.0.1', resolve);
    });
    console.log(`[overlay] listening on ${this.url}`);
  }

  stop() {
    this.#wss?.close();
    this.#server?.close();
    this.#server = null;
    this.#wss = null;
    this.#history = [];
  }

  broadcastSegment(segment) {
    this.#history.push(segment);
    if (this.#history.length > 10) this.#history.shift();

    const message = JSON.stringify({ type: 'segment', segment });
    for (const client of this.#wss?.clients ?? []) {
      if (client.readyState === 1) client.send(message);
    }
  }
}
