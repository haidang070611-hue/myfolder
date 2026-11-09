// Nạp Three.js: ưu tiên file tải sẵn /vendor, rồi tới các CDN. Có CDN nào chạy được là chơi được.
const V = '0.160.0';
const SOURCES = [
  { name: 'local', three: '/vendor/three/build/three.module.js', addons: '/vendor/three/examples/jsm/', qr: '/vendor/qrcode.min.js' },
  { name: 'jsdelivr', three: `https://cdn.jsdelivr.net/npm/three@${V}/build/three.module.js`, addons: `https://cdn.jsdelivr.net/npm/three@${V}/examples/jsm/`, qr: 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js' },
  { name: 'unpkg', three: `https://unpkg.com/three@${V}/build/three.module.js`, addons: `https://unpkg.com/three@${V}/examples/jsm/`, qr: 'https://unpkg.com/qrcode-generator@1.4.4/qrcode.js' },
];

async function alive(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 5000);
  try { const r = await fetch(url, { method: 'HEAD', signal: ctl.signal }); return r.ok; }
  catch (e) { return false; } finally { clearTimeout(t); }
}

function loadScript(src) {
  return new Promise((res) => {
    const s = document.createElement('script');
    s.src = src; s.onload = () => res(true); s.onerror = () => res(false);
    document.head.appendChild(s);
  });
}

function fail(msg) {
  document.body.insertAdjacentHTML('beforeend',
    `<div style="position:fixed;inset:0;display:grid;place-items:center;background:#0b0d1a;z-index:99;padding:24px;text-align:center">
      <div style="max-width:560px"><h2>Không tải được thư viện 3D</h2><p style="color:#98a0cc;line-height:1.6">${msg}</p>
      <p style="color:#98a0cc;line-height:1.6">Cách khắc phục: nối Internet rồi chạy <b>npm run vendor</b> một lần (tải sẵn về máy), sau đó mở lại trang.</p></div></div>`);
}

(async () => {
  let src = null;
  for (const s of SOURCES) { if (await alive(s.three)) { src = s; break; } }
  if (!src) return fail('Cả file nội bộ lẫn CDN (jsDelivr, unpkg) đều không truy cập được.');
  const map = document.createElement('script');
  map.type = 'importmap';
  map.textContent = JSON.stringify({ imports: { three: src.three, 'three/addons/': src.addons } });
  document.head.appendChild(map);
  window.__src = src.name;
  // thư viện QR: thử nguồn đã chọn, rồi các nguồn còn lại
  const qrList = [src.qr, ...SOURCES.map((s) => s.qr).filter((u) => u !== src.qr)];
  (async () => { for (const u of qrList) { if (await loadScript(u)) { window.dispatchEvent(new Event('qrready')); return; } } })();
  try { await import('/js/host.js'); }
  catch (e) { console.error(e); fail('Lỗi khi khởi động game: ' + (e && e.message)); }
})();
