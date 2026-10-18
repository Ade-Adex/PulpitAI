/* PulpitAI overlay client.
   Connects to the local overlay WebSocket server, renders captions. */

(() => {
  const captionsEl = document.getElementById('captions');
  const params = new URLSearchParams(location.search);

  // Chroma-key mode: ?bg=green paints a green background.
  if (params.get('bg') === 'green') document.body.classList.add('bg-green');

  let config = {
    showYorubaLine: true,
    captionPosition: 'bottom',
    captionFontSize: 28,
    maxCaptions: 3,
    captionIdleSeconds: 8,
  };

  // Apply config from server (non-blocking).
  fetch('/overlay-config')
    .then((r) => r.json())
    .then((c) => { config = { ...config, ...c }; applyConfig(); })
    .catch(() => {});

  function applyConfig() {
    captionsEl.className = `captions position-${config.captionPosition || 'bottom'}`;
    document.querySelectorAll('.caption .english').forEach((el) => {
      el.style.fontSize = `${config.captionFontSize}px`;
    });
    document.querySelectorAll('.caption .yoruba').forEach((el) => {
      el.style.fontSize = `${Math.round(config.captionFontSize * 0.72)}px`;
    });
  }

  function addCaption(segment) {
    const card = document.createElement('div');
    card.className = 'caption';

    if (config.showYorubaLine && segment.yoruba) {
      const y = document.createElement('div');
      y.className = 'yoruba';
      y.textContent = segment.yoruba;
      card.appendChild(y);
    }

    const e = document.createElement('div');
    e.className = 'english';
    e.textContent = segment.english || segment.yoruba || '';
    e.style.fontSize = `${config.captionFontSize}px`;
    card.appendChild(e);

    captionsEl.appendChild(card);
    applyConfig();

    // Trim to maxCaptions.
    while (captionsEl.children.length > config.maxCaptions) {
      captionsEl.removeChild(captionsEl.firstChild);
    }

    // Auto-fade after idle seconds.
    setTimeout(() => {
      card.classList.add('fade-out');
      setTimeout(() => card.remove(), 700);
    }, config.captionIdleSeconds * 1000);
  }

  // ---- WebSocket ----
  function connect() {
    const ws = new WebSocket(`ws://${location.host}/overlay-ws`);

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'segment') addCaption(msg.segment);
        if (msg.type === 'history' && Array.isArray(msg.segments)) {
          // Render recent history so a late-joining OBS source isn't empty.
          msg.segments.forEach((s) => addCaption(s));
        }
      } catch { /* ignore malformed messages */ }
    };

    ws.onclose = () => setTimeout(connect, 1500); // auto-reconnect
  }

  connect();
})();
