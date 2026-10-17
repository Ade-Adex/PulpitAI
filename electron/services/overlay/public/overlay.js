// Overlay client: connects to the app's WebSocket, renders caption lines,
// and fades them out after a configurable idle period.
(() => {
  const captionsEl = document.getElementById('captions');
  const params = new URLSearchParams(location.search);
  if (params.get('bg') === 'green') document.body.classList.add('bg-green');

  let config = {
    showYorubaLine: true,
    captionPosition: 'bottom',
    captionFontSize: 42,
    maxCaptions: 3,
    captionIdleSeconds: 12,
  };
  let idleTimer = null;

  async function loadConfig() {
    try {
      const res = await fetch('/overlay-config');
      config = { ...config, ...(await res.json()) };
    } catch {
      /* server not ready yet, retry on next connect */
    }
    captionsEl.classList.remove('top', 'bottom');
    captionsEl.classList.add(config.captionPosition);
    captionsEl.style.fontSize = `${config.captionFontSize}px`;
  }

  function addSegment(segment) {
    const line = document.createElement('div');
    line.className = 'line';

    if (config.showYorubaLine && segment.yoruba) {
      const y = document.createElement('div');
      y.className = 'yoruba';
      y.textContent = segment.yoruba;
      line.appendChild(y);
    }

    const e = document.createElement('div');
    e.className = 'english';
    e.textContent = segment.english || segment.yoruba;
    line.appendChild(e);

    captionsEl.appendChild(line);
    requestAnimationFrame(() => line.classList.add('visible'));

    // Keep only the newest N lines on screen.
    while (captionsEl.children.length > config.maxCaptions) {
      captionsEl.removeChild(captionsEl.firstChild);
    }

    scheduleClear();
  }

  // Fade everything out after enough silence to keep the stream clean.
  function scheduleClear() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      for (const line of [...captionsEl.children]) {
        line.classList.remove('visible');
        setTimeout(() => line.remove(), 450);
      }
    }, config.captionIdleSeconds * 1000);
  }

  function connect() {
    const ws = new WebSocket(`ws://${location.host}/overlay-ws`);

    ws.onopen = loadConfig;
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'segment') addSegment(msg.segment);
      if (msg.type === 'history') msg.segments.forEach(addSegment);
    };
    ws.onclose = () => setTimeout(connect, 1500); // auto-reconnect
  }

  connect();
})();
