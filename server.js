'use strict';
/**
 * Phone Party Arcade - server
 * - Phục vụ file tĩnh trong /public
 * - WebSocket tại /ws (tự cài đặt, KHÔNG cần npm install)
 * - Mỗi phòng có 1 host (PC) và tối đa 8 người chơi (điện thoại)
 * - Mặc định chạy HTTP (ổn định nhất cho điện thoại). HTTPS tự ký chỉ bật khi chạy với --https
 * - MẶC ĐỊNH ONLINE: tự mở đường hầm HTTPS công khai để điện thoại ở mạng nào cũng quét QR chơi được
 *   (chỉ muốn chơi trong nhà: chạy với --lan hoặc LAN_ONLY=1)
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const dgram = require('dgram');
const { createTunnel } = require('./tunnel');
const vendor = require('./vendor');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_PLAYERS = 8;
const PALETTE = ['#ff4d4d', '#3db2ff', '#ffd23f', '#4dff88', '#c77dff', '#ff9f1c', '#2ee6d6', '#ff6fb5'];
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.mjs': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

/* ---------- TLS tùy chọn (chỉ khi chạy với --https) ---------- */
// Chứng chỉ tự ký thường làm WebSocket trên iPhone bị chặn => mặc định dùng HTTP.
// Muốn cảm biến nghiêng + HTTPS hợp lệ: dùng chế độ "khác Wi-Fi" (đường hầm) hoặc deploy online.
let tls = null;
const wantTls = (process.env.USE_HTTPS === '1' || process.argv.includes('--https')) && process.env.NO_TLS !== '1';
if (wantTls) {
  try {
    tls = {
      key: fs.readFileSync(path.join(__dirname, 'certs', 'key.pem')),
      cert: fs.readFileSync(path.join(__dirname, 'certs', 'cert.pem')),
    };
  } catch (e) { console.log('  Chưa có certs/ — chạy "npm run cert" trước. Đang dùng HTTP.'); }
}

/* ---------- Địa chỉ mạng LAN ---------- */
const VIRTUAL_NIC = /(vmware|virtualbox|vbox|vethernet|hyper-v|wsl|docker|br-|veth|virbr|utun|tailscale|zerotier|loopback|bluetooth|pseudo|vpn|tap|tun)/i;

function routeIP() {
  // IP của card mạng đang dùng để ra Internet/router (tốt hơn đoán theo tên card)
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (!done) { done = true; resolve(v); } };
    try {
      const s = dgram.createSocket('udp4');
      s.on('error', () => { try { s.close(); } catch (e) {} fin(null); });
      s.connect(80, '1.1.1.1', () => {
        let ip = null;
        try { ip = s.address().address; } catch (e) {}
        try { s.close(); } catch (e) {}
        fin(ip && ip !== '0.0.0.0' ? ip : null);
      });
      setTimeout(() => fin(null), 800);
    } catch (e) { fin(null); }
  });
}

function lanIPs(primary) {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const i of list || []) {
      if ((i.family === 'IPv4' || i.family === 4) && !i.internal && !i.address.startsWith('169.254.')) {
        out.push({ ip: i.address, virtual: VIRTUAL_NIC.test(name) });
      }
    }
  }
  const score = (o) => (o.ip === primary ? 100 : 0) + (o.virtual ? -50 : 0) +
    (o.ip.startsWith('192.168.') ? 3 : o.ip.startsWith('10.') ? 2 : /^172\.(1[6-9]|2\d|3[01])\./.test(o.ip) ? 1 : 0);
  out.sort((a, b) => score(b) - score(a));
  return out.map((o) => o.ip);
}

let ipCache = { t: 0, list: [] };
async function currentIPs() {
  if (Date.now() - ipCache.t < 4000) return ipCache.list;
  const list = lanIPs(await routeIP());
  ipCache = { t: Date.now(), list };
  return list;
}

/* ---------- Đường hầm công khai ---------- */
const tunnel = createTunnel({ port: PORT, log: (m) => console.log(m), keepAlive: true });
// Đang chạy trên dịch vụ hosting (Render, Railway, Fly...) thì đã có địa chỉ công khai, không cần đường hầm
const HOSTED = !!(process.env.RENDER || process.env.RAILWAY_ENVIRONMENT || process.env.FLY_APP_NAME || process.env.DYNO || process.env.K_SERVICE);
const LAN_ONLY = process.env.LAN_ONLY === '1' || process.argv.includes('--lan');
const FIXED_URL = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '';
if (FIXED_URL) tunnel.setManual(FIXED_URL);
const WANT_ONLINE = !LAN_ONLY && !HOSTED && !FIXED_URL;   // mặc định: tự bật đường hầm

// chỉ máy chạy server (không phải khách qua đường hầm) mới được bật/tắt đường hầm
function isLocalReq(req, needHeader = true) {
  const a = req.socket.remoteAddress || '';
  const loop = a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
  const proxied = ['x-forwarded-for', 'x-forwarded-host', 'cf-connecting-ip', 'forwarded', 'x-real-ip'].some((h) => req.headers[h]);
  // khách đi qua đường hầm luôn có Host là tên miền công khai; máy chủ thì truy cập bằng localhost / địa chỉ IP
  const host = String(req.headers.host || '').replace(/:\d+$/, '');
  const hostOk = host === 'localhost' || host === '[::1]' || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  return loop && !proxied && hostOk && (!needHeader || req.headers['x-pp'] === '1');
}

/* ---------- HTTP tĩnh ---------- */
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    return res.end('ok');
  }
  if (url.pathname === '/api/info') {
    const t = tunnel.status;
    return json(res, 200, {
      ips: await currentIPs(), port: PORT, secure: !!tls,
      publicUrl: t.state === 'on' ? t.url : null,
      online: WANT_ONLINE,
      tunnel: { state: t.state, via: t.via, verified: t.verified, tried: t.tried, note: t.note, restarts: t.restarts },
      canTunnel: isLocalReq(req, false),
    });
  }
  if (url.pathname === '/api/tunnel') {
    if (!isLocalReq(req)) return json(res, 403, { error: 'Chỉ bật được từ chính máy đang chạy server' });
    if (req.method === 'POST') tunnel.start();
    else if (req.method === 'DELETE') tunnel.stop();
    return json(res, 200, tunnel.status);
  }
  let p;
  try { p = decodeURIComponent(url.pathname); } catch (e) { res.writeHead(400); return res.end('bad'); }
  if (p === '/') p = '/index.html';
  if (p === '/play') p = '/controller.html';
  if (p === '/check') p = '/check.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (file !== PUBLIC && !file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Không tìm thấy'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

/* ---------- WebSocket tối giản ---------- */
const allSockets = new Set();

class WS {
  constructor(socket) {
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.frags = [];
    this.alive = true;
    this.lastSeen = Date.now();
    this.onmessage = () => {};
    this.onclose = () => {};
    this.role = null;
    this.room = null;
    this.pid = null;
    socket.setNoDelay(true);
    socket.setTimeout(0);
    socket.on('data', (d) => {
      this.lastSeen = Date.now();
      this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
      try { this.parse(); } catch (e) { this.terminate(); }
    });
    const end = () => {
      if (!this.alive) return;
      this.alive = false;
      allSockets.delete(this);
      try { this.onclose(); } catch (e) { console.error(e); }
    };
    socket.on('close', end);
    socket.on('error', end);
    allSockets.add(this);
  }

  parse() {
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      const op = b[0] & 15;
      const fin = !!(b[0] & 128);
      const masked = !!(b[1] & 128);
      let len = b[1] & 127;
      let off = 2;
      if (len === 126) {
        if (b.length < 4) return;
        len = b.readUInt16BE(2); off = 4;
      } else if (len === 127) {
        if (b.length < 10) return;
        len = Number(b.readBigUInt64BE(2)); off = 10;
      }
      if (len > (1 << 20)) { this.terminate(); return; }
      const hdr = off + (masked ? 4 : 0);
      if (b.length < hdr + len) return;
      let payload = b.subarray(hdr, hdr + len);
      if (masked) {
        const mask = b.subarray(off, off + 4);
        const out = Buffer.allocUnsafe(len);
        for (let i = 0; i < len; i++) out[i] = payload[i] ^ mask[i & 3];
        payload = out;
      }
      this.buf = b.subarray(hdr + len);
      if (op === 8) { this.close(); return; }
      if (op === 9) { this.frame(0xA, payload); continue; }
      if (op === 0xA) continue;
      if (op === 1 || op === 0) {
        this.frags.push(payload);
        if (fin) {
          const msg = Buffer.concat(this.frags).toString('utf8');
          this.frags = [];
          this.onmessage(msg);
        }
      }
    }
  }

  frame(op, payload) {
    if (!this.alive) return;
    const len = payload.length;
    let h;
    if (len < 126) h = Buffer.from([0x80 | op, len]);
    else if (len < 65536) { h = Buffer.alloc(4); h[0] = 0x80 | op; h[1] = 126; h.writeUInt16BE(len, 2); }
    else { h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(len), 2); }
    try { this.socket.write(Buffer.concat([h, payload])); } catch (e) { /* socket đã đóng */ }
  }
  send(obj) { this.frame(1, Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj))); }
  close() { if (this.alive) { this.frame(8, Buffer.alloc(0)); try { this.socket.end(); } catch (e) {} } }
  terminate() { try { this.socket.destroy(); } catch (e) {} }
}

/* ---------- Bảo vệ khi mở ra Internet ---------- */
const MAX_ROOMS = 40;
const MAX_SOCKETS = 400;
const MAX_SOCKETS_PER_IP = 60;      // cả quán net dùng chung 1 IP công khai vẫn đủ chỗ
const isLoopbackOrPrivate = (a) => /^(::1|127\.|::ffff:127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|fc|fd)/i.test(a || '');
/** IP thật của khách: đi qua đường hầm / proxy thì đọc từ header (chỉ tin header khi kết nối tới từ proxy nội bộ) */
function clientIP(req) {
  const a = req.socket.remoteAddress || '';
  if (isLoopbackOrPrivate(a)) {
    const h = req.headers['cf-connecting-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (h) return h;
  }
  return a;
}
const ipSockets = new Map();        // ip -> số kết nối đang mở
const joinFails = new Map();        // ip -> { n, until, t0 }: đoán mã phòng sai quá nhiều thì bị khóa tạm
function joinBlocked(ip) { const f = joinFails.get(ip); return !!f && f.until > Date.now(); }
function joinFailed(ip) {
  const now = Date.now();
  let f = joinFails.get(ip);
  if (!f || now - f.t0 > 60000) f = { n: 0, until: 0, t0: now };
  f.n++;
  if (f.n >= 12) f.until = now + 120000;
  joinFails.set(ip, f);
}
setInterval(() => { const now = Date.now(); for (const [k, f] of joinFails) if (now - f.t0 > 180000 && f.until < now) joinFails.delete(k); }, 60000).unref();

/* ---------- Phòng ---------- */
const rooms = new Map();
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += LETTERS[crypto.randomInt(LETTERS.length)];
    if (!rooms.has(c)) return c;
  }
}
const pub = (p) => ({ id: p.id, name: p.name, color: p.color, look: p.look || null, connected: !!p.ws });

/* ---------- Trang phục: chỉ nhận id chữ thường ngắn + màu hex, client tự bỏ qua id lạ ---------- */
const ID = (v, d) => (typeof v === 'string' && /^[a-z]{1,10}$/.test(v) ? v : d);
function cleanLook(l) {
  l = l && typeof l === 'object' ? l : {};
  return { hat: ID(l.hat, 'none'), face: ID(l.face, 'none'), body: ID(l.body, 'none'), finish: ID(l.finish, 'gloss'), color: typeof l.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(l.color) ? l.color.toLowerCase() : '' };
}
/** Áp trang phục cho người chơi. Màu phải khác màu của người khác trong phòng. Trả về ghi chú nếu bị từ chối màu. */
function applyLook(room, p, raw) {
  const look = cleanLook(raw);
  let note = '';
  if (look.color) {
    const clash = [...room.players.values()].some((o) => o !== p && String(o.color).toLowerCase() === look.color);
    if (clash) { note = 'Màu này đã có người chọn'; look.color = p.color; } else p.color = look.color;
  } else look.color = p.color;
  p.look = look;
  return note;
}
const listPlayers = (r) => [...r.players.values()].map(pub);
const num = (v) => { v = Number(v); return Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0; };

function onHost(ws, m) {
  let room = m.code ? rooms.get(String(m.code).toUpperCase()) : null;
  // Chỉ chủ thật (có khóa bí mật cấp lúc tạo phòng) mới được giành lại phòng. Người lạ biết mã cũng không chiếm được.
  if (room && (typeof m.key !== 'string' || m.key !== room.key)) room = null;
  if (room && room.host && room.host !== ws) {
    // PC tải lại trang / mở lại tab: host mới thay host cũ, GIỮ NGUYÊN mã phòng để điện thoại không phải vào lại
    const old = room.host;
    old.room = null; old.role = null;
    old.close();
  }
  if (!room) {
    if (rooms.size >= MAX_ROOMS) return ws.send({ t: 'err', msg: 'Máy chủ đang quá tải, thử lại sau ít phút' });
    room = { code: newCode(), key: crypto.randomBytes(12).toString('hex'), host: null, players: new Map(), timer: null };
    rooms.set(room.code, room);
  }
  clearTimeout(room.timer);
  room.host = ws;
  ws.role = 'host';
  ws.room = room;
  ws.send({ t: 'room', code: room.code, key: room.key, players: listPlayers(room) });
  for (const p of room.players.values()) if (p.ws) p.ws.send({ t: 'hostback' });
}

function onJoin(ws, m) {
  const code = String(m.code || '').trim().toUpperCase();
  if (joinBlocked(ws.ip)) return ws.send({ t: 'err', msg: 'Thử quá nhiều lần, đợi 2 phút rồi nhập lại mã nhé' });
  const room = rooms.get(code);
  if (!room) { joinFailed(ws.ip); return ws.send({ t: 'err', msg: 'Không tìm thấy phòng ' + code }); }
  const name = String(m.name || '').replace(/[<>&"'`]/g, '').trim().slice(0, 14);
  let p = m.token ? [...room.players.values()].find((x) => x.token === m.token) : null;
  if (p) {
    if (p.ws && p.ws !== ws) { p.ws.pid = null; p.ws.room = null; p.ws.close(); }
    clearTimeout(p.timer);
    if (name) p.name = name;
  } else {
    if (room.players.size >= MAX_PLAYERS) return ws.send({ t: 'err', msg: 'Phòng đã đầy (tối đa 8 người)' });
    let id = 1;
    while (room.players.has(id)) id++;
    p = { id, name: name || 'P' + id, color: PALETTE[id - 1], token: crypto.randomBytes(8).toString('hex'), ws: null, timer: null };
    room.players.set(id, p);
  }
  p.ws = ws;
  ws.role = 'player';
  ws.room = room;
  ws.pid = p.id;
  if (m.look) applyLook(room, p, m.look);
  ws.send({ t: 'joined', id: p.id, name: p.name, color: p.color, look: p.look || null, token: p.token, code: room.code });
  if (room.host) room.host.send({ t: 'join', id: p.id, name: p.name, color: p.color, look: p.look || null });
}

function onMessage(ws, raw) {
  let m;
  try { m = JSON.parse(raw); } catch (e) { return; }
  if (!m || typeof m.t !== 'string') return;
  switch (m.t) {
    case 'ping': return ws.send({ t: 'pong', n: m.n || 0 });
    case 'host': return onHost(ws, m);
    case 'join': return onJoin(ws, m);
    case 'look': {
      if (ws.role !== 'player' || !ws.room) return;
      const p = ws.room.players.get(ws.pid);
      if (!p) return;
      const note = applyLook(ws.room, p, m.look);
      ws.send({ t: 'look', look: p.look, color: p.color, note });
      if (ws.room.host) ws.room.host.send({ t: 'look', id: p.id, look: p.look, color: p.color });
      return;
    }
    case 'in': {
      if (ws.role !== 'player' || !ws.room || !ws.room.host) return;
      ws.room.host.send({ t: 'in', id: ws.pid, x: num(m.x), y: num(m.y), a: m.a ? 1 : 0, b: m.b ? 1 : 0 });
      return;
    }
    case 'all': {
      if (ws.role !== 'host' || !ws.room) return;
      const s = JSON.stringify(m.data);
      for (const p of ws.room.players.values()) if (p.ws) p.ws.send(s);
      return;
    }
    case 'to': {
      if (ws.role !== 'host' || !ws.room) return;
      const p = ws.room.players.get(m.id);
      if (p && p.ws) p.ws.send(m.data);
      return;
    }
    default: return;
  }
}

function onClose(ws) {
  const room = ws.room;
  if (!room) return;
  if (ws.role === 'host') {
    if (room.host !== ws) return;
    room.host = null;
    for (const p of room.players.values()) if (p.ws) p.ws.send({ t: 'hostlost' });
    room.timer = setTimeout(() => {
      for (const p of room.players.values()) { clearTimeout(p.timer); if (p.ws) p.ws.close(); }
      rooms.delete(room.code);
    }, 120000);
  } else if (ws.role === 'player') {
    const p = room.players.get(ws.pid);
    if (!p || p.ws !== ws) return;
    p.ws = null;
    if (room.host) room.host.send({ t: 'drop', id: p.id });
    p.timer = setTimeout(() => {
      if (p.ws) return;
      room.players.delete(p.id);
      if (room.host) room.host.send({ t: 'leave', id: p.id });
    }, 45000);
  }
}

/* ---------- Server ---------- */
const safeHandler = (req, res) => handler(req, res).catch((e) => {
  console.error(e);
  try { res.writeHead(500); res.end('error'); } catch (e2) { /* ignore */ }
});
const server = tls ? https.createServer(tls, safeHandler) : http.createServer(safeHandler);

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://x');
  const key = req.headers['sec-websocket-key'];
  if (url.pathname !== '/ws' || !key) { socket.destroy(); return; }
  const ip = clientIP(req);
  if (allSockets.size >= MAX_SOCKETS || (ipSockets.get(ip) || 0) >= MAX_SOCKETS_PER_IP) {
    socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'); socket.destroy(); return;
  }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
  );
  const ws = new WS(socket);
  ws.ip = ip;
  ipSockets.set(ip, (ipSockets.get(ip) || 0) + 1);
  ws.onmessage = (raw) => onMessage(ws, raw);
  ws.onclose = () => {
    const n = (ipSockets.get(ip) || 1) - 1;
    if (n <= 0) ipSockets.delete(ip); else ipSockets.set(ip, n);
    onClose(ws);
  };
  if (head && head.length) { ws.buf = Buffer.from(head); try { ws.parse(); } catch (e) { ws.terminate(); } }
});

// giữ kết nối sống (proxy như Render hay ngắt kết nối im lặng) và dọn socket chết
setInterval(() => {
  const now = Date.now();
  for (const ws of allSockets) {
    if (now - ws.lastSeen > 60000) ws.terminate();
    else ws.frame(9, Buffer.alloc(0));
  }
}, 20000);

server.listen(PORT, '0.0.0.0', async () => {
  const proto = tls ? 'https' : 'http';
  console.log('\n  PHONE PARTY ARCADE đang chạy\n');
  console.log(`  Trên PC, mở:   ${proto}://localhost:${PORT}`);
  const ips = await currentIPs();
  for (const ip of ips) console.log(`  Cùng Wi-Fi:    ${proto}://${ip}:${PORT}${ip === ips[0] ? '   <- thường là địa chỉ đúng' : ''}`);
  if (WANT_ONLINE) console.log('\n  🌐 Đang mở link công khai để điện thoại ở BẤT KỲ mạng nào cũng quét QR chơi được (mất 10-30 giây)…');
  else if (FIXED_URL) console.log(`\n  🌐 Địa chỉ công khai: ${FIXED_URL}`);
  else console.log('\n  Chế độ chỉ trong nhà (--lan): điện thoại phải cùng Wi-Fi. Bỏ --lan để cho phép chơi từ xa.');
  if (process.platform === 'win32') console.log('  Điện thoại cùng Wi-Fi mà không vào được? Chạy open-firewall.bat bằng quyền Administrator.');
  console.log('');
  if (WANT_ONLINE || process.argv.includes('--online')) tunnel.start();
  if (!vendor.have() && process.env.NO_VENDOR !== '1') vendor.ensure(console.log).catch(() => { /* offline: dùng CDN */ });
});
