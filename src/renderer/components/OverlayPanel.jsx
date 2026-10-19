import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { effectiveProvider } from '../lib/providers.js';

// Shows the overlay URL, a copy button, the built-in overlay window, and a
// one-click Demo ⇄ Live switch so users can verify the stream overlay with
// simulated captions before going live with the real microphone.
export default function OverlayPanel({ settings, onSave }) {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    api.getOverlayInfo().then(setInfo);
  }, []);

  if (!info) return null;

  const copy = () => navigator.clipboard.writeText(info.url);

  const demoMode = settings ? effectiveProvider(settings) === 'demo' : false;
  const toggleMode = () => onSave({ provider: demoMode ? 'auto' : 'demo' });

  return (
    <section className="panel">
      <h2 className="panel__title">Livestream Overlay</h2>
      <div className="overlay-row overlay-row--mode">
        <span className={`overlay-mode-badge ${demoMode ? 'overlay-mode-badge--demo' : 'overlay-mode-badge--live'}`}>
          {demoMode ? 'DEMO MODE' : 'LIVE MODE'}
        </span>
        <button className="btn btn--ghost btn--small" onClick={toggleMode}>
          {demoMode ? 'Go Live' : 'Test with Demo'}
        </button>
      </div>
      <p className="hint">
        {demoMode
          ? 'Demo mode: simulated captions stream to OBS/browser so you can verify the overlay end-to-end — no API key needed.'
          : 'Live mode: only real microphone speech reaches the stream overlay — demo text never appears on stream.'}
      </p>
      <p className="hint">
        In OBS: <em>Add Source → Browser</em>, paste this URL, set 1920×1080, and tick
        &quot;Shutdown source when not visible&quot; <strong>off</strong>.
      </p>
      <p className="hint">
        In vMix: open the overlay window below, then add a <em>Desktop Capture</em> of it — or use
        a browser source tool. For capture without transparency, add <code>?bg=green</code> to
        the URL and chroma-key it.
      </p>
      <div className="overlay-row">
        <code className="overlay-url">{info.url}</code>
        <button className="btn btn--ghost btn--small" onClick={copy}>
          Copy
        </button>
        <button className="btn btn--ghost btn--small" onClick={() => api.openOverlayWindow()}>
          Open window
        </button>
      </div>
    </section>
  );
}
