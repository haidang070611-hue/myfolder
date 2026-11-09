'use strict';
// Kiểm thử server: phòng, host/phone, tải lại host giữ mã, ping, API tunnel (dùng "ssh" giả)
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const PORT = 3456;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-'));
// ssh giả: in ra URL như localhost.run rồi giữ tiến trình sống
fs.writeFileSync(path.join(dir, 'ssh'), '#!/bin/sh\necho "abc123.lhr.life tunneled with tls termination, https://abc123.lhr.life"\nexec sleep 60\n', { mode: 0o755 });

const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], {
  env: Object.assign({}, process.env, { PORT, PATH: dir + path.delimiter + process.env.PATH, NO_VENDOR: '1', LAN_ONLY: '1', NO_AUTO_DOWNLOAD: '1', CLOUDFLARED_BIN: path.join(dir, 'khong-co'), TUNNEL_VERIFY_MS: '800' }),
  stdio: ['ignore', 'pipe', 'pipe'],
});
let out = '';
srv.stdout.on('data', (d) => { out += d; });
srv.stderr.on('data', (d) => { out += d; });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client() {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const msgs = [];
  ws.onmessage = (e) => msgs.push(JSON.parse(e.data));
  const opened = new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const waitFor = async (t, ms = 2000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { const i = msgs.findIndex((m) => m.t === t); if (i >= 0) return msgs.splice(i, 1)[0]; await sleep(15); }
    throw new Error('không nhận được ' + t + ' · có: ' + JSON.stringify(msgs));
  };
  return { ws, opened, waitFor, send: (o) => ws.send(JSON.stringify(o)), msgs };
}

(async () => {
  await sleep(700);
  const info = await (await fetch(`http://127.0.0.1:${PORT}/api/info`)).json();
  assert(Array.isArray(info.ips), 'api/info có ips');
  assert.strictEqual(info.tunnel.state, 'off');
  assert.strictEqual(info.online, false, '--lan/LAN_ONLY: không tự bật đường hầm');
  assert.strictEqual((await fetch(`http://127.0.0.1:${PORT}/play`)).status, 200);
  assert.strictEqual((await fetch(`http://127.0.0.1:${PORT}/../server.js`)).status, 404);
  console.log('ok  http + api/info');

  // host + phone
  const host = client(); await host.opened; host.send({ t: 'host' });
  const room = await host.waitFor('room');
  assert.match(room.code, /^[A-Z]{4}$/);
  const ph = client(); await ph.opened;
  ph.send({ t: 'ping', n: 7 }); assert.strictEqual((await ph.waitFor('pong')).n, 7);
  ph.send({ t: 'join', code: 'ZZZZ', name: 'x' }); assert.match((await ph.waitFor('err')).msg, /Không tìm thấy/);
  ph.send({ t: 'join', code: room.code.toLowerCase(), name: 'An' });
  const joined = await ph.waitFor('joined'); assert.strictEqual(joined.id, 1);
  assert.strictEqual((await host.waitFor('join')).name, 'An');
  ph.send({ t: 'in', x: 0.5, y: -1, a: 1, b: 0 });
  const inp = await host.waitFor('in'); assert.deepStrictEqual([inp.x, inp.y, inp.a], [0.5, -1, 1]);
  host.send({ t: 'to', id: 1, data: { t: 'vib', ms: 5 } }); assert.strictEqual((await ph.waitFor('vib')).ms, 5);
  console.log('ok  phòng, vào phòng, input, rung');

  // trang phục: chỉ nhận dữ liệu hợp lệ, trùng màu bị từ chối, host nhận được
  ph.send({ t: 'look', look: { hat: 'crown', face: 'shades', body: '../x', finish: 'metal', color: '#00ff88' } });
  const lk = await ph.waitFor('look');
  assert.deepStrictEqual([lk.look.hat, lk.look.face, lk.look.body, lk.look.finish, lk.color], ['crown', 'shades', 'none', 'metal', '#00ff88']);
  const hl = await host.waitFor('look'); assert.strictEqual(hl.id, 1); assert.strictEqual(hl.color, '#00ff88');
  const ph3 = client(); await ph3.opened;
  ph3.send({ t: 'join', code: room.code, name: 'Bo', look: { hat: 'cat', color: '#00ff88' } });
  const j3 = await ph3.waitFor('joined'); assert.notStrictEqual(j3.color, '#00ff88', 'màu trùng bị từ chối'); assert.strictEqual(j3.look.hat, 'cat');
  ph3.ws.close(); await sleep(60);
  console.log('ok  trang phục: kiểm tra dữ liệu, chống trùng màu, báo cho PC');

  // PC tải lại trang: host mới phải GIỮ mã phòng dù host cũ chưa kịp đóng
  const host2 = client(); await host2.opened; host2.send({ t: 'host', code: room.code, key: room.key });
  const room2 = await host2.waitFor('room');
  assert.strictEqual(room2.code, room.code, 'giữ mã phòng khi host đổi');
  assert.strictEqual(room2.key, room.key);
  assert.strictEqual(room2.players.length, 2);
  assert.strictEqual(room2.players.find((x) => x.id === 1).look.hat, 'crown');
  ph.send({ t: 'in', x: 1, y: 0, a: 0, b: 0 });
  assert.strictEqual((await host2.waitFor('in')).x, 1);
  console.log('ok  host tải lại vẫn giữ mã phòng + người chơi');

  // điện thoại rớt mạng rồi vào lại bằng token
  ph.ws.close(); await sleep(100);
  const ph2 = client(); await ph2.opened;
  ph2.send({ t: 'join', code: room.code, name: 'An', token: joined.token });
  assert.strictEqual((await ph2.waitFor('joined')).id, 1);
  console.log('ok  vào lại bằng token giữ nguyên người chơi');

  // tunnel: chỉ local + có header x-pp
  assert.strictEqual((await fetch(`http://127.0.0.1:${PORT}/api/tunnel`, { method: 'POST' })).status, 403);
  assert.strictEqual((await fetch(`http://127.0.0.1:${PORT}/api/tunnel`, { method: 'POST', headers: { 'x-pp': '1', 'x-forwarded-for': '1.2.3.4' } })).status, 403);
  const r = await fetch(`http://127.0.0.1:${PORT}/api/tunnel`, { method: 'POST', headers: { 'x-pp': '1' } });
  assert.strictEqual(r.status, 200);
  let t;
  for (let i = 0; i < 60; i++) { await sleep(500); t = (await (await fetch(`http://127.0.0.1:${PORT}/api/info`)).json()); if (t.publicUrl) break; }
  // (verify tới URL giả sẽ không được, server vẫn báo "on" sau tối đa 12s)
  assert.strictEqual(t.publicUrl, 'https://abc123.lhr.life');
  assert.strictEqual(t.tunnel.via, 'localhost.run');
  await fetch(`http://127.0.0.1:${PORT}/api/tunnel`, { method: 'DELETE', headers: { 'x-pp': '1' } });
  assert.strictEqual((await (await fetch(`http://127.0.0.1:${PORT}/api/info`)).json()).publicUrl, null);
  console.log('ok  đường hầm bật/tắt, chặn truy cập từ xa');
  // đường hầm: khách đi qua đường hầm (Host là tên miền) không được bật/tắt dù tới từ 127.0.0.1
  const fakeHost = await new Promise((res) => {
    const rq = require('http').request({ host: '127.0.0.1', port: PORT, path: '/api/tunnel', method: 'DELETE', headers: { 'x-pp': '1', host: 'abc.trycloudflare.com' } }, (rs) => { rs.resume(); res(rs.statusCode); });
    rq.end();
  });
  assert.strictEqual(fakeHost, 403);

  // người lạ biết mã phòng cũng KHÔNG chiếm được quyền chủ phòng nếu thiếu khóa bí mật
  const thief = client(); await thief.opened; thief.send({ t: 'host', code: room.code });
  const troom = await thief.waitFor('room');
  assert.notStrictEqual(troom.code, room.code, 'không chiếm được phòng của người khác');
  thief.send({ t: 'host', code: room.code, key: 'doan-bua' });
  assert.notStrictEqual((await thief.waitFor('room')).code, room.code);
  ph2.send({ t: 'in', x: -1, y: 0, a: 0, b: 0 });
  assert.strictEqual((await host2.waitFor('in')).x, -1, 'host thật vẫn nhận input');
  console.log('ok  chặn chiếm phòng bằng mã (cần khóa chủ phòng)');

  // đoán bừa mã phòng quá nhiều lần thì bị khóa tạm
  const bf = client(); await bf.opened;
  let blocked = false;
  for (let i = 0; i < 20 && !blocked; i++) {
    bf.send({ t: 'join', code: 'Q' + String.fromCharCode(65 + (i % 20)) + 'ZZ', name: 'bot' });
    const e = await bf.waitFor('err');
    blocked = /quá nhiều/.test(e.msg);
  }
  assert(blocked, 'bị khóa sau nhiều lần đoán sai');
  bf.send({ t: 'join', code: room.code, name: 'bot' });
  assert.match((await bf.waitFor('err')).msg, /quá nhiều/, 'bị khóa cả khi nhập đúng mã');
  console.log('ok  giới hạn đoán mã phòng');

  // ----- server chạy mặc định: TỰ mở đường hầm (cloudflared giả), tự dựng lại khi đứt -----
  const pidFile = path.join(dir, 'cf.pid');
  const cf = path.join(dir, 'cf-fake');
  fs.writeFileSync(cf, '#!/bin/sh\nif [ "$1" = "--version" ]; then echo cloudflared fake; exit 0; fi\necho $$ > ' + pidFile + '\necho "INF |  https://fake-name-123.trycloudflare.com  |"\nexec sleep 60\n', { mode: 0o755 });
  const P2 = PORT + 1;
  let out2 = '';
  const srv2 = spawn('node', [path.join(__dirname, '..', 'server.js')], {
    env: Object.assign({}, process.env, { PORT: P2, NO_VENDOR: '1', NO_AUTO_DOWNLOAD: '1', CLOUDFLARED_BIN: cf, TUNNEL_VERIFY_MS: '800' }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  srv2.stdout.on('data', (d) => { out2 += d; }); srv2.stderr.on('data', (d) => { out2 += d; });
  try {
    const wait = async (fn, ms = 20000) => { const end = Date.now() + ms; for (;;) { const v = await fn().catch(() => null); if (v) return v; if (Date.now() > end) throw new Error('quá thời gian chờ\n' + out2); await sleep(250); } };
    const get = () => fetch(`http://127.0.0.1:${P2}/api/info`).then((r) => r.json());
    const i1 = await wait(async () => { const i = await get(); return i.publicUrl && i; });
    assert.strictEqual(i1.online, true);
    assert.strictEqual(i1.publicUrl, 'https://fake-name-123.trycloudflare.com');
    assert.strictEqual(i1.tunnel.via, 'cloudflared');
    console.log('ok  chạy mặc định là tự mở đường hầm (không cần bấm gì)');
    process.kill(Number(fs.readFileSync(pidFile, 'utf8')));           // giả lập đường hầm bị đứt
    await wait(async () => (await get()).publicUrl === null);
    const i2 = await wait(async () => { const i = await get(); return i.publicUrl && i; }, 25000);
    assert(i2.tunnel.restarts >= 1, 'đã tự dựng lại');
    console.log('ok  đường hầm đứt thì tự dựng lại');
  } finally { srv2.kill(); }
  console.log('\nTẤT CẢ ĐẠT');
})().catch((e) => { console.error('\nLỖI:', e.message, '\n--- log server ---\n' + out); process.exitCode = 1; })
  .finally(() => { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); setTimeout(() => process.exit(), 100); });
