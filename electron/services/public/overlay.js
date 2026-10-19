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

  // Upsert a caption by segment id: streaming partials update the card in
  // place and the final text overwrites the interim one — no duplicates.
  function addCaption(segment) {
    let card = captionsEl.querySelector(`[data-id="${segment.id}"]`);
    if (!card) {
      card = document.createElement('div');
      card.className = 'caption';
      card.dataset.id = segment.id;
      const y = document.createElement('div');
      y.className = 'yoruba';
      const e = document.createElement('div');
      e.className = 'english';
      card.appendChild(y);
      card.appendChild(e);
      captionsEl.appendChild(card);
    }

    const yEl = card.querySelector('.yoruba');
    const eEl = card.querySelector('.english');
    const showYoruba = config.showYorubaLine && segment.yoruba;
    yEl.style.display = showYoruba ? '' : 'none';
    yEl.textContent = segment.yoruba || '';
    eEl.textContent = segment.english || segment.yoruba || '';
    card.classList.toggle('caption--interim', !!segment.interim);

    applyConfig();

    // Trim to maxCaptions.
    while (captionsEl.children.length > config.maxCaptions) {
      captionsEl.removeChild(captionsEl.firstChild);
    }

    // Every update re-arms the idle countdown so streaming captions don't
    // fade out mid-sentence.
    clearTimeout(card._fadeTimer);
    card.classList.remove('fade-out');
    card._fadeTimer = setTimeout(() => {
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
