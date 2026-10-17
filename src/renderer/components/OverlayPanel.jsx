import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

// Shows the overlay URL, a copy button, and the built-in overlay window.
export default function OverlayPanel() {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    api.getOverlayInfo().then(setInfo);
  }, []);

  if (!info) return null;

  const copy = () => navigator.clipboard.writeText(info.url);

  return (
    <section className="panel">
      <h2 className="panel__title">Livestream Overlay</h2>
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
