import { connect } from '/js/net.js';
import { HATS, FACES, BODIES, FINISHES, COLORS, cleanLook, randomLook } from '/js/looks.js';
import { avatarSVG } from '/js/avatar.js';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);

const state = { x: 0, y: 0, a: 0, b: 0 };
let me = null;
let joined = false;
let gyroOn = false;
let gyroInv = false;
let gyroX = 0;
let cfg = { gyro: false };

/* ---------- Vào phòng ---------- */
const store = {
  get(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* chế độ riêng tư */ } },
};
const savedName = store.get('pp_name');
$('name').value = savedName;
if (q.get('c')) $('code').value = q.get('c').toUpperCase().slice(0, 4);

function tokenKey(code) { return 'pp_token_' + code; }

/* ---------- Trang phục ---------- */
let look = (() => { try { return cleanLook(JSON.parse(store.get('pp_look') || '{}')); } catch (e) { return cleanLook({}); } })();
let myColor = '#7c8cff';
let lookOpen = false;
function paintAvatar() { $('avatar').innerHTML = avatarSVG(look, myColor, { crop: true }); }

function sendJoin() {
  const code = wantCode;
  net.send({ t: 'join', code, name: wantName, look, token: store.get(tokenKey(code)) || undefined });
}
function doJoin() {
  const code = $('code').value.trim().toUpperCase();
  const name = $('name').value.trim();
  if (code.length < 4) { $('err').textContent = 'Mã phòng gồm 4 chữ cái'; return; }
  store.set('pp_name', name);
  $('err').textContent = '';
  wantCode = code; wantName = name; pendingJoin = true;
  if (net.ready) { sendJoin(); setBtn('Đang vào phòng…', true); }
  else setBtn('Đang chờ kết nối…', true); // sẽ tự vào ngay khi nối được
  // nếu 8 giây vẫn chưa vào được thì mở lại nút
  clearTimeout(joinT);
  joinT = setTimeout(() => { if (!joined) { pendingJoin = false; setBtn('Vào chơi', false); if (!$('err').textContent) $('err').textContent = net.ready ? 'Phòng không phản hồi, thử lại' : 'Chưa kết nối được tới máy chủ'; } }, 8000);
}
let wantCode = '', wantName = '', pendingJoin = false, joinT = 0, fails = 0;
function setBtn(t, dis) { $('go').textContent = t; $('go').disabled = !!dis; }
function setNet(cls, text) { $('net').className = 'netbox ' + cls; $('netTxt').textContent = text; }

const net = connect({
  onOpen() {
    fails = 0;
    $('status').textContent = '';
    setNet('ok', 'Đã kết nối máy chủ');
    $('netTip').classList.add('hidden');
    if (pendingJoin || (me && wantCode)) sendJoin();
  },
  onClose() {
    fails++;
    $('status').textContent = 'Mất kết nối… đang nối lại';
    setNet(fails > 1 ? 'bad' : 'wait', fails > 1 ? 'Không kết nối được máy chủ' : 'Đang kết nối lại…');
    if (fails >= 2 && !joined) {
      const tip = $('netTip');
      tip.classList.remove('hidden');
      tip.innerHTML = location.protocol === 'https:' && !/\.(lhr\.life|trycloudflare\.com|onrender\.com|serveo)/.test(location.host)
        ? 'Địa chỉ HTTPS tự ký thường bị iPhone chặn. Hãy tắt <b>--https</b> trên PC và chạy <b>npm start</b>.'
        : 'Điện thoại chưa tới được PC. Kiểm tra: <b>cùng Wi-Fi</b>? Windows Firewall? Hoặc chọn <b>Mọi mạng / 4G</b> trên màn hình PC rồi quét lại mã QR.';
    }
  },
  onMessage(m) {
    switch (m.t) {
      case 'joined':
        pendingJoin = false; clearTimeout(joinT); setBtn('Vào chơi', false);
        me = m; joined = true;
        store.set(tokenKey(m.code), m.token);
        $('join').classList.add('hidden');
        $('pad').classList.remove('hidden');
        $('me').textContent = m.name;
        if (m.look) look = cleanLook(m.look);
        setMyColor(m.color);
        const tc = document.querySelector('meta[name=theme-color]'); if (tc) tc.content = '#070914';
        startPing();
        $('status').textContent = '';
        break;
      case 'err':
        pendingJoin = false; clearTimeout(joinT); setBtn('Vào chơi', false);
        if (!joined) $('err').textContent = m.msg; else $('status').textContent = m.msg;
        break;
      case 'cfg': applyCfg(m); break;
      case 'look': {
        look = cleanLook(m.look); setMyColor(m.color); store.set('pp_look', JSON.stringify(look));
        const n = $('lkNote');
        if (m.note) { n.textContent = '⚠️ ' + m.note; n.classList.add('warn'); }
        else { n.textContent = 'Chọn đồ, nhân vật trên màn hình PC đổi theo ngay.'; n.classList.remove('warn'); }
        if (lookOpen) renderLooks();
        break;
      }
      case 'vib': if (navigator.vibrate) navigator.vibrate(m.ms || 40); break;
      case 'pong': {
        const ms = Math.round(performance.now() - pingAt);
        const el = $('ping'); el.textContent = ms + ' ms'; el.className = 'chip ping' + (ms > 160 ? ' bad' : ms > 70 ? ' mid' : '');
        break;
      }
      case 'hostlost': $('status').textContent = 'PC mất kết nối, đang chờ…'; break;
      case 'hostback': $('status').textContent = ''; break;
    }
  },
});

$('go').addEventListener('click', () => { requestWake(); doJoin(); });
$('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('name').focus(); });
$('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });
// quét QR lần sau (đã có tên) -> tự vào phòng luôn
if (q.get('c') && savedName) setTimeout(doJoin, 50);

function setMyColor(c) {
  myColor = c;
  document.documentElement.style.setProperty('--pc', c);
  paintAvatar();
}

/* ---------- Màn hình chọn trang phục ---------- */
const LK_TABS = [['hat', '🎩 Mũ', HATS], ['face', '😎 Mặt', FACES], ['body', '🧣 Thân', BODIES], ['color', '🎨 Màu'], ['finish', '✨ Chất liệu', FINISHES]];
let lkTab = 'hat', sendLookT = 0;
function renderLooks() {
  $('lkPrev').innerHTML = avatarSVG(look, look.color || myColor);
  $('lkTabs').innerHTML = LK_TABS.map(([id, label]) => `<button class="lk-tab${id === lkTab ? ' on' : ''}" data-t="${id}">${label}</button>`).join('');
  const grid = $('lkGrid');
  const keepTop = grid.dataset.tab === lkTab ? grid.scrollTop : 0;   // giữ nguyên vị trí cuộn khi chọn đồ
  const tabsEl = $('lkTabs'), keepLeft = tabsEl.scrollLeft;
  grid.dataset.tab = lkTab;
  if (lkTab === 'color') {
    grid.innerHTML = COLORS.map((c) => `<button class="lk-opt sw${(look.color || myColor).toLowerCase() === c ? ' on' : ''}" data-v="${c}" style="background:${c};color:${c}" aria-label="${c}"></button>`).join('');
  } else {
    const list = LK_TABS.find((t) => t[0] === lkTab)[2];
    grid.innerHTML = list.map(([id, emoji, label]) => `<button class="lk-opt${look[lkTab] === id ? ' on' : ''}" data-v="${id}"><span class="e">${emoji}</span>${label}</button>`).join('');
  }
  grid.scrollTop = keepTop; tabsEl.scrollLeft = keepLeft;
}
function setLook(field, v) {
  look = cleanLook(Object.assign({}, look, { [field]: v }));
  store.set('pp_look', JSON.stringify(look));
  renderLooks(); paintAvatar();
  clearTimeout(sendLookT);
  sendLookT = setTimeout(() => net.send({ t: 'look', look }), 120);   // gửi dồn để PC đổi nhân vật gần như tức thì
}
function openLooks(on) {
  lookOpen = on;
  $('looks').classList.toggle('hidden', !on);
  state.x = state.y = state.a = state.b = 0;
  if (on) renderLooks();
}
$('lookBtn').addEventListener('click', () => openLooks(true));
$('lkDone').addEventListener('click', () => openLooks(false));
$('lkRand').addEventListener('click', () => { const r = randomLook(look.color); look = cleanLook(Object.assign(r, { color: look.color })); setLook('hat', look.hat); });
$('lkTabs').addEventListener('click', (e) => { const b = e.target.closest('.lk-tab'); if (b) { lkTab = b.dataset.t; renderLooks(); } });
$('lkGrid').addEventListener('click', (e) => { const b = e.target.closest('.lk-opt'); if (b) setLook(lkTab, b.dataset.v); });

/* ---------- Cấu hình giao diện theo game ---------- */
function applyCfg(m) {
  cfg = Object.assign({ gyro: false, title: '', a: 'A', b: 'B', hideStick: false }, m);
  $('title').textContent = cfg.title || 'Sẵn sàng';
  $('lookBtn').classList.toggle('hidden', !cfg.lobby);
  if (!cfg.lobby && lookOpen) openLooks(false);
  $('status').textContent = cfg.hint || '';
  $('btnA').textContent = cfg.a;
  $('btnB').textContent = cfg.b;
  $('wrapB').classList.toggle('off', !cfg.b);
  $('btnA').style.fontSize = cfg.a && cfg.a.length > 5 ? 'clamp(11px, 3.2vw, 16px)' : '';
  $('btnB').style.fontSize = cfg.b && cfg.b.length > 5 ? 'clamp(11px, 3.2vw, 16px)' : '';
  const bc = $('botchip'); bc.classList.toggle('hidden', !cfg.bots); bc.textContent = '🤖 +' + (cfg.bots || 0);
  $('stick').style.visibility = cfg.hideStick ? 'hidden' : 'visible';
  $('gyroBtn').classList.toggle('hidden', !cfg.gyro);
  $('invBtn').classList.toggle('hidden', !cfg.gyro);
  if (!cfg.gyro && gyroOn) setGyro(false);
}

/* ---------- Joystick ---------- */
const stick = $('stick'), knob = $('knob');
let stickId = null;
function stickMove(e) {
  const r = stick.getBoundingClientRect();
  const R = r.width / 2;
  let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R);
  const d = Math.hypot(dx, dy), max = R * 0.62;
  if (d > max) { dx = dx / d * max; dy = dy / d * max; }
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
  let nx = dx / max, ny = dy / max;
  const m = Math.hypot(nx, ny);
  if (m < 0.12) { nx = 0; ny = 0; }
  state.x = nx; state.y = ny; // y dương = kéo xuống
}
stick.addEventListener('pointerdown', (e) => { stickId = e.pointerId; stick.classList.add('on'); stick.setPointerCapture(e.pointerId); stickMove(e); });
stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) stickMove(e); });
const stickEnd = (e) => {
  if (e.pointerId !== stickId) return;
  stickId = null; knob.style.transform = ''; state.x = 0; state.y = 0; stick.classList.remove('on');
};
stick.addEventListener('pointerup', stickEnd);
stick.addEventListener('pointercancel', stickEnd);

/* ---------- Nút A / B ---------- */
function bindBtn(id, key) {
  const el = $(id);
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId); el.classList.add('down'); state[key] = 1; if (navigator.vibrate) navigator.vibrate(8);
    const r = el.getBoundingClientRect(), d = document.createElement('i');
    d.className = 'rip'; d.style.left = e.clientX - r.left + 'px'; d.style.top = e.clientY - r.top + 'px';
    el.appendChild(d); setTimeout(() => d.remove(), 520);
  });
  const up = () => { el.classList.remove('down'); state[key] = 0; };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}
bindBtn('btnA', 'a');
bindBtn('btnB', 'b');

/* ---------- Cảm biến nghiêng ---------- */
function orient(e) {
  if (e.gamma == null) return;
  const ang = (screen.orientation && screen.orientation.angle != null) ? screen.orientation.angle : (window.orientation || 0);
  let t;
  switch (((ang % 360) + 360) % 360) {
    case 90: t = e.beta; break;
    case 270: t = -e.beta; break;
    case 180: t = -e.gamma; break;
    default: t = e.gamma;
  }
  t = Math.max(-40, Math.min(40, t || 0)) / 40;
  if (Math.abs(t) < 0.05) t = 0;
  gyroX = gyroInv ? -t : t;
}

async function setGyro(on) {
  if (on) {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') { $('status').textContent = 'Chưa được cấp quyền cảm biến'; return; }
      }
    } catch (e) { $('status').textContent = 'Không bật được cảm biến'; return; }
    if (!window.isSecureContext) { $('status').textContent = 'Cảm biến cần HTTPS (xem README), tạm dùng joystick'; }
    window.addEventListener('deviceorientation', orient);
    gyroOn = true;
  } else {
    window.removeEventListener('deviceorientation', orient);
    gyroOn = false; gyroX = 0;
  }
  $('gyroBtn').textContent = 'Nghiêng: ' + (gyroOn ? 'BẬT' : 'TẮT');
  $('gyroBtn').classList.toggle('on', gyroOn);
}
$('gyroBtn').addEventListener('click', () => setGyro(!gyroOn));
$('invBtn').addEventListener('click', () => { gyroInv = !gyroInv; $('invBtn').classList.toggle('on', gyroInv); });

/* ---------- Gửi input ---------- */
let last = '';
let lastSent = 0;
setInterval(() => {
  if (!joined || lookOpen) return;
  const x = gyroOn ? gyroX : state.x;
  const msg = { t: 'in', x: +x.toFixed(3), y: +state.y.toFixed(3), a: state.a, b: state.b };
  const s = JSON.stringify(msg);
  const now = performance.now();
  if (s !== last || now - lastSent > 250) { net.send(msg); last = s; lastSent = now; }
}, 1000 / 60);

/* ---------- Giữ màn hình sáng + chặn cử chỉ ---------- */
let wake = null;
async function requestWake() { try { if (navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); } catch (e) {} }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && joined) requestWake(); });
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (e.target.tagName !== 'INPUT' && !e.target.closest('.sheet')) e.preventDefault(); }, { passive: false });

/* ---------- Đo ping ---------- */
let pingAt = 0, pingT = 0;
function startPing() {
  clearInterval(pingT);
  const go = () => { if (net.ready) { pingAt = performance.now(); net.send({ t: 'ping', n: 1 }); } };
  go(); pingT = setInterval(go, 2000);
}
