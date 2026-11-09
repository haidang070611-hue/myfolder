'use strict';
// Kiểm thử tunnel.js: chọn bản cloudflared theo hệ điều hành, tự tải, dự phòng sang ssh, tự dựng lại
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
process.env.TUNNEL_VERIFY_MS = '300';
const { createTunnel, cfAsset, download } = require('../tunnel');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-tun-'));
const pidFile = path.join(dir, 'pid');
const fake = path.join(dir, 'cf');
fs.writeFileSync(fake, `#!/bin/sh\necho $$ > ${pidFile}\necho "https://xyz-1.trycloudflare.com"\nexec sleep 60\n`, { mode: 0o755 });
const RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;
const until = async (fn, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await sleep(50); } return false; };

(async () => {
  // 1) chọn đúng file cloudflared
  assert.match(cfAsset('win32', 'x64').url, /cloudflared-windows-amd64\.exe$/);
  assert.match(cfAsset('darwin', 'arm64').url, /cloudflared-darwin-arm64\.tgz$/);
  assert.strictEqual(cfAsset('darwin', 'arm64').tgz, true);
  assert.match(cfAsset('linux', 'x64').url, /cloudflared-linux-amd64$/);
  assert.match(cfAsset('linux', 'arm64').url, /cloudflared-linux-arm64$/);
  assert.strictEqual(cfAsset('freebsd', 'x64'), null);
  console.log('ok  chọn bản cloudflared theo hệ điều hành');

  // 1b) hàm tải: theo chuyển hướng (GitHub trả 302), báo phần trăm, ghi đủ file
  const http = require('http');
  const payload = Buffer.alloc(300000, 7);
  const dl = http.createServer((q, r) => {
    if (q.url === '/go') { r.writeHead(302, { location: '/file' }); return r.end(); }
    if (q.url === '/404') { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-length': payload.length }); r.end(payload);
  }).listen(0);
  await new Promise((r) => dl.once('listening', r));
  const base = 'http://127.0.0.1:' + dl.address().port;
  const pcts = [];
  await download(base + '/go', path.join(dir, 'dl.bin'), (p) => pcts.push(p));
  assert.strictEqual(fs.statSync(path.join(dir, 'dl.bin')).size, payload.length);
  assert.strictEqual(pcts[pcts.length - 1], 100);
  await assert.rejects(download(base + '/404', path.join(dir, 'x.bin')), /HTTP 404/);
  dl.close();
  console.log('ok  tải file: theo chuyển hướng, báo %, báo lỗi HTTP');

  // 2) chưa có cloudflared -> tự tải -> chạy
  let notes = [];
  const t1 = createTunnel({
    port: 1, list: [{ via: 'cloudflared', needs: 'cloudflared', cmd: null, args: [], re: RE }],
    findBin: () => null, autoDownload: true,
    getBin: async (pct) => { pct(50); await sleep(30); pct(100); return fake; },
  });
  t1.start();
  const poll = setInterval(() => { const n = t1.status.note; if (n && !notes.includes(n)) notes.push(n); }, 5);
  assert(await until(() => t1.status.state === 'on'), 'tự tải rồi mở được đường hầm');
  clearInterval(poll);
  assert.strictEqual(t1.status.url, 'https://xyz-1.trycloudflare.com');
  assert(notes.some((n) => /tải cloudflared/i.test(n)), 'có báo tiến trình tải: ' + notes);
  t1.stop();
  console.log('ok  tự tải cloudflared khi máy chưa có');

  // 3) không tải được -> thử cách khác (ssh giả)
  const t2 = createTunnel({
    port: 1,
    list: [
      { via: 'cloudflared', needs: 'cloudflared', cmd: null, args: [], re: RE },
      { via: 'lệnh-không-tồn-tại', cmd: 'lenh-khong-ton-tai-xyz', args: [], re: RE },
      { via: 'dự phòng', cmd: fake, args: [], re: RE },
    ],
    findBin: () => null, autoDownload: true, getBin: async () => { throw new Error('mất mạng'); },
  });
  t2.start();
  assert(await until(() => t2.status.state === 'on'));
  assert.strictEqual(t2.status.via, 'dự phòng');
  assert.deepStrictEqual(t2.status.tried.map((x) => x.reason), ['mất mạng', 'chưa cài']);
  t2.stop();
  console.log('ok  lỗi thì tự chuyển sang cách dự phòng');

  // 4) tất cả lỗi -> state=error (không treo), có ghi lý do
  const t3 = createTunnel({ port: 1, list: [{ via: 'a', cmd: 'khong-co-a', args: [], re: RE }], findBin: () => null });
  t3.start();
  assert(await until(() => t3.status.state === 'error'));
  assert.strictEqual(t3.status.tried[0].via, 'a');
  t3.stop();
  console.log('ok  tất cả cách đều lỗi: báo lỗi rõ ràng');

  // 5) keepAlive: tiến trình bị giết thì tự dựng lại
  const t4 = createTunnel({ port: 1, list: [{ via: 'cf', cmd: fake, args: [], re: RE }], keepAlive: true });
  t4.start();
  assert(await until(() => t4.status.state === 'on'));
  process.kill(Number(fs.readFileSync(pidFile, 'utf8')));
  assert(await until(() => t4.status.state !== 'on', 3000), 'phát hiện đứt');
  assert(await until(() => t4.status.state === 'on', 9000), 'tự dựng lại');
  assert(t4.status.restarts >= 1);
  t4.stop();
  await sleep(100);
  assert.strictEqual(t4.status.state, 'off', 'stop() thì không tự dựng lại nữa');
  console.log('ok  keepAlive: đứt là tự dựng lại, stop() thì dừng hẳn');
  console.log('\nTẤT CẢ ĐẠT (tunnel)');
})().catch((e) => { console.error('\nLỖI:', e.stack || e.message); process.exitCode = 1; })
  .finally(() => { fs.rmSync(dir, { recursive: true, force: true }); setTimeout(() => process.exit(), 200); });
