'use strict';
/**
 * Đường hầm công khai (HTTPS) để điện thoại ở BẤT KỲ mạng nào (4G, Wi-Fi khác...) đều vào được.
 *
 * Thứ tự thử:
 *   1. cloudflared  - ổn định nhất, miễn phí, không cần tài khoản. Nếu máy chưa có, TỰ TẢI về thư mục ./bin (1 lần).
 *   2. ssh -> localhost.run
 *   3. ssh -> serveo.net
 *   4. ssh -> pinggy.io
 * (ssh có sẵn trên Windows 10/11, macOS, Linux)
 *
 * Tự dựng lại đường hầm nếu bị đứt (keepAlive).
 */
const { spawn, spawnSync } = require('child_process');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const NULL_DEV = process.platform === 'win32' ? 'NUL' : '/dev/null';
const BIN_DIR = path.join(__dirname, 'bin');
const CF_BASE = 'https://github.com/cloudflare/cloudflared/releases/latest/download/';

/** Tên file cloudflared phù hợp hệ điều hành / CPU (null nếu không có bản dựng sẵn) */
function cfAsset(platform = process.platform, arch = process.arch) {
  const map = {
    win32: { x64: 'cloudflared-windows-amd64.exe', arm64: 'cloudflared-windows-amd64.exe', ia32: 'cloudflared-windows-386.exe' },
    darwin: { x64: 'cloudflared-darwin-amd64.tgz', arm64: 'cloudflared-darwin-arm64.tgz' },
    linux: { x64: 'cloudflared-linux-amd64', arm64: 'cloudflared-linux-arm64', arm: 'cloudflared-linux-arm' },
  };
  const file = map[platform] && map[platform][arch];
  return file ? { file, url: CF_BASE + file, tgz: file.endsWith('.tgz') } : null;
}
const localBin = (platform = process.platform) => path.join(BIN_DIR, platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');

function works(cmd) {
  try { return spawnSync(cmd, ['--version'], { timeout: 10000, windowsHide: true, stdio: 'ignore' }).status === 0; }
  catch (e) { return false; }
}
/** cloudflared đã có sẵn (trong ./bin hoặc PATH) thì trả về đường dẫn, chưa có trả về null */
function findCloudflared() {
  // CLOUDFLARED_BIN=đường-dẫn: chỉ định sẵn file cloudflared muốn dùng (không tìm chỗ khác)
  if (process.env.CLOUDFLARED_BIN) return works(process.env.CLOUDFLARED_BIN) ? process.env.CLOUDFLARED_BIN : null;
  const lb = localBin();
  if (fs.existsSync(lb) && works(lb)) return lb;
  if (works('cloudflared')) return 'cloudflared';
  return null;
}

function download(url, dest, onPct, hops = 0) {
  return new Promise((resolve, reject) => {
    const req = (url.startsWith('http:') ? http : https).get(url, { timeout: 25000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 6) {
        res.resume();
        return resolve(download(new URL(res.headers.location, url).href, dest, onPct, hops + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const total = Number(res.headers['content-length']) || 0;
      let got = 0;
      const out = fs.createWriteStream(dest);
      res.on('data', (d) => { got += d.length; if (total && onPct) onPct(Math.floor((got / total) * 100)); });
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve(dest)));
      out.on('error', reject);
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('hết thời gian chờ')));
  });
}

/** Tải cloudflared về ./bin/ (chỉ chạy khi chưa có). Trả về đường dẫn file chạy được. */
async function downloadCloudflared(onPct = () => {}) {
  const a = cfAsset();
  if (!a) throw new Error(`chưa hỗ trợ ${process.platform}/${process.arch}`);
  fs.mkdirSync(BIN_DIR, { recursive: true });
  const dest = localBin();
  const tmp = path.join(BIN_DIR, a.file + '.part');
  try {
    await download(a.url, tmp, onPct);
    if (a.tgz) {
      const r = spawnSync('tar', ['-xzf', tmp, '-C', BIN_DIR], { stdio: 'ignore' });
      if (r.status !== 0) throw new Error('giải nén .tgz thất bại (cần lệnh tar)');
      fs.rmSync(tmp, { force: true });
    } else {
      fs.rmSync(dest, { force: true });
      fs.renameSync(tmp, dest);
    }
    if (process.platform !== 'win32') fs.chmodSync(dest, 0o755);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
  if (!works(dest)) { fs.rmSync(dest, { force: true }); throw new Error('file tải về không chạy được'); }
  return dest;
}

function methods(port) {
  const ssh = ['-o', 'StrictHostKeyChecking=no', '-o', `UserKnownHostsFile=${NULL_DEV}`,
    '-o', 'ServerAliveInterval=20', '-o', 'ConnectTimeout=10'];
  return [
    // cloudflared: cmd được điền lúc chạy (tìm sẵn hoặc tự tải). http2 chạy được cả khi mạng chặn UDP/QUIC
    { via: 'cloudflared', needs: 'cloudflared', cmd: null,
      args: ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', `http://localhost:${port}`],
      re: /https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/i },
    { via: 'localhost.run', cmd: 'ssh', args: [...ssh, '-o', 'ExitOnForwardFailure=yes', '-R', `80:localhost:${port}`, 'nokey@localhost.run'],
      re: /https:\/\/(?!admin\.)[a-z0-9-]+\.(?:lhr\.life|localhost\.run)/i },
    { via: 'serveo', cmd: 'ssh', args: [...ssh, '-o', 'ExitOnForwardFailure=yes', '-R', `80:localhost:${port}`, 'serveo.net'],
      re: /https:\/\/[a-z0-9-]+\.serveo(?:usercontent)?\.net/i },
    { via: 'pinggy', cmd: 'ssh', args: [...ssh, '-p', '443', `-R0:localhost:${port}`, 'free.pinggy.io'],
      re: /https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.pinggy(?:-free)?\.(?:link|io)/i },
  ];
}

function createTunnel({ port, log = () => {}, list = methods(port), keepAlive = false, findBin = findCloudflared, getBin = downloadCloudflared, autoDownload = process.env.NO_AUTO_DOWNLOAD !== '1' }) {
  const st = { state: 'off', url: null, via: null, tried: [], verified: false, note: '', restarts: 0 };
  let child = null;
  let gen = 0;            // tăng mỗi lần start/stop để bỏ qua sự kiện cũ
  let wanted = false;     // người dùng muốn đường hầm chạy (để tự dựng lại khi đứt)
  let retryT = null;

  function reset(state) { st.state = state; st.url = null; st.via = null; st.verified = false; st.note = ''; }
  function killChild() { if (child) { try { child.kill(); } catch (e) { /* đã tắt */ } child = null; } }
  function scheduleRetry(ms) {
    clearTimeout(retryT);
    if (!keepAlive || !wanted) return;
    retryT = setTimeout(() => { if (wanted && (st.state === 'off' || st.state === 'error')) api.start(true); }, ms);
    if (retryT.unref) retryT.unref();
  }

  // Chờ cho đến khi chính địa chỉ công khai trả lời /healthz (tối đa 15s)
  const VERIFY_MS = Number(process.env.TUNNEL_VERIFY_MS) || 15000;
  function verify(url, my, done) {
    const t0 = Date.now();
    (function poll() {
      if (my !== gen) return;
      const req = https.get(url + '/healthz', { timeout: 4000 }, (res) => {
        res.resume();
        if (res.statusCode === 200) return done(true);
        again();
      });
      req.on('error', again);
      req.on('timeout', () => { req.destroy(); });
      function again() { if (Date.now() - t0 > VERIFY_MS) done(false); else setTimeout(poll, 1500); }
    })();
  }

  async function resolveCmd(m, my) {
    if (!m.needs) return m.cmd;
    let bin = findBin();
    if (bin) return bin;
    if (!autoDownload) throw new Error('chưa cài');
    st.note = 'Đang tải cloudflared về máy (1 lần, ~35MB)…';
    log('  ' + st.note);
    let last = -1;
    bin = await getBin((pct) => { if (my === gen && pct !== last && pct % 5 === 0) { last = pct; st.note = `Đang tải cloudflared… ${pct}%`; } });
    st.note = '';
    log('  Đã tải cloudflared.');
    return bin;
  }

  async function attempt(i, my) {
    if (my !== gen) return;
    const m = list[i];
    if (!m) {
      reset('error');
      st.note = '';
      log('  Không tạo được đường hầm. Đã thử: ' + st.tried.map((t) => `${t.via} (${t.reason})`).join(', '));
      scheduleRetry(90000);
      return;
    }
    st.via = m.via;
    let cmd;
    try { cmd = await resolveCmd(m, my); }
    catch (e) { st.note = ''; st.tried.push({ via: m.via, reason: e.message }); return attempt(i + 1, my); }
    if (my !== gen) return;
    log(`  Đang tạo đường hầm bằng ${m.via}…`);
    st.note = `Đang kết nối bằng ${m.via}…`;
    let found = false, failed = false, buf = '';
    let c;
    try { c = spawn(cmd, m.args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }); }
    catch (e) { st.tried.push({ via: m.via, reason: e.message }); return attempt(i + 1, my); }
    child = c;
    const fail = (reason) => {
      if (failed || found || my !== gen) return;
      failed = true; clearTimeout(timer);
      try { c.kill(); } catch (e) { /* ignore */ }
      st.tried.push({ via: m.via, reason });
      attempt(i + 1, my);
    };
    const timer = setTimeout(() => fail('quá thời gian'), 30000);
    const onData = (d) => {
      if (found || failed || my !== gen) return;
      buf += d.toString();
      if (buf.length > 30000) buf = buf.slice(-8000);
      const mt = buf.match(m.re);
      if (!mt) return;
      found = true; clearTimeout(timer);
      const url = mt[0].replace(/\/$/, '');
      verify(url, my, (ok) => {
        if (my !== gen) return;
        st.state = 'on'; st.url = url; st.via = m.via; st.verified = ok; st.note = '';
        log(`  Đường hầm sẵn sàng (${m.via}): ${url}${ok ? '' : '  (chưa kiểm tra được, thử mở link trên điện thoại)'}`);
      });
    };
    c.stdout.on('data', onData);
    c.stderr.on('data', onData);
    c.stdin.on('error', () => {});
    c.on('error', (e) => fail(e.code === 'ENOENT' ? 'chưa cài' : e.message));
    c.on('exit', (code) => {
      if (my !== gen) return;
      if (!found) return fail('thoát mã ' + code);
      if (child === c) {
        child = null; reset('off');
        log('  Đường hầm bị đứt' + (wanted && keepAlive ? ', đang dựng lại…' : '.'));
        scheduleRetry(3000);
      }
    });
  }

  const api = {
    get status() { return { state: st.state, url: st.url, via: st.via, verified: st.verified, tried: st.tried, note: st.note, restarts: st.restarts }; },
    start(isRetry = false) {
      if (st.state === 'starting' || st.state === 'on') return;
      wanted = true;
      if (isRetry) st.restarts++;
      gen++; killChild(); st.tried = []; reset('starting');
      attempt(0, gen);
    },
    stop() { wanted = false; clearTimeout(retryT); gen++; killChild(); reset('off'); },
    setManual(url) { wanted = false; gen++; killChild(); st.state = 'on'; st.url = String(url).replace(/\/$/, ''); st.via = 'PUBLIC_URL'; st.verified = true; },
  };
  return api;
}

module.exports = { createTunnel, methods, cfAsset, findCloudflared, downloadCloudflared, localBin, download };
