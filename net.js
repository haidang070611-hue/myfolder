// Kết nối WebSocket có tự động nối lại
export function connect({ onOpen, onMessage, onClose } = {}) {
  let ws = null;
  let retry = 0;
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

  function open() {
    ws = new WebSocket(url);
    ws.onopen = () => { retry = 0; onOpen && onOpen(); };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      onMessage && onMessage(m);
    };
    ws.onclose = () => {
      onClose && onClose();
      retry = Math.min(retry + 1, 6);
      setTimeout(open, 400 * retry);
    };
    ws.onerror = () => {};
  }
  open();

  return {
    send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); },
    get ready() { return !!ws && ws.readyState === 1; },
  };
}
