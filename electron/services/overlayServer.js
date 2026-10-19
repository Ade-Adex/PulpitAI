// OverlayServer: a tiny Express + WebSocket server that serves the caption
// overlay page. Point an OBS "Browser Source" at it, or open it in the
// frameless overlay window for vMix/OBS window capture.
import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import { WebSocketServer } from 'ws';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OVERLAY_DIR = path.join(__dirname, 'public');

// Read overlay assets through fs (Electron patches fs to read from asar
// transparently, so this works in both dev and packaged builds). Serving via
// fs.readFileSync + res.send avoids Express sendFile/static quirks inside
// app.asar.
function readAsset(name) {
  return fs.readFileSync(path.join(OVERLAY_DIR, name));
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
};

function serveAsset(name, res) {
  try {
    const data = readAsset(name);
    res.setHeader('Content-Type', MIME[path.extname(name)] || 'application/octet-stream');
    res.send(data);
  } catch {
    res.status(404).send('Not found');
  }
}

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
    app.get('/overlay', (_req, res) => serveAsset('overlay.html', res));

    // Overlay assets. overlay.html references them as absolute paths
    // (/overlay.css, /overlay.js) because /overlay has no trailing slash.
    // Also accept /overlay/... so a trailing-slash URL base works too.
    app.get(['/overlay.css', '/overlay/overlay.css'], (_req, res) => serveAsset('overlay.css', res));
    app.get(['/overlay.js', '/overlay/overlay.js'], (_req, res) => serveAsset('overlay.js', res));

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

  // Upsert a caption: streaming partials (segment.interim) update live but
  // are never stored in history; finals replace their interim entry by id so
  // a late-joining OBS source replays finished captions only.
  broadcastSegment(segment) {
    if (segment.interim) {
      this.#send({ type: 'segment', segment });
      return;
    }
    const idx = this.#history.findIndex((s) => s.id === segment.id);
    if (idx >= 0) {
      this.#history[idx] = segment;
    } else {
      this.#history.push(segment);
      if (this.#history.length > 10) this.#history.shift();
    }
    this.#send({ type: 'segment', segment });
  }

  // Called when the user switches Demo ↔ Live so stale captions from the
  // previous mode are never replayed to a reconnecting OBS source.
  clearHistory() {
    this.#history = [];
  }

  #send(payload) {
    const message = JSON.stringify(payload);
    for (const client of this.#wss?.clients ?? []) {
      if (client.readyState === 1) client.send(message);
    }
  }
}
