'use strict';
/**
 * Tải sẵn Three.js + thư viện QR về public/vendor để chạy không cần CDN (và nhanh hơn).
 * Chạy: npm run vendor   (cần Internet 1 lần). server.js cũng tự thử khi khởi động.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const V = '0.160.0';
const BASE = `https://cdn.jsdelivr.net/npm/three@${V}/`;
const OUT = path.join(__dirname, 'public', 'vendor');
const ENTRY = [
  'build/three.module.js',
  'examples/jsm/postprocessing/EffectComposer.js',
  'examples/jsm/postprocessing/RenderPass.js',
  'examples/jsm/postprocessing/UnrealBloomPass.js',
  'examples/jsm/postprocessing/OutputPass.js',
  'examples/jsm/postprocessing/ShaderPass.js',
  'examples/jsm/environments/RoomEnvironment.js',
  'examples/jsm/geometries/RoundedBoxGeometry.js',
];
const QR_URL = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';

function get(url, hops = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 20000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 5) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).href, hops + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(url + ' -> HTTP ' + res.statusCode)); }
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout ' + url)));
  });
}

function write(rel, buf) {
  const f = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, buf);
}

const have = () => fs.existsSync(path.join(OUT, 'three', 'build', 'three.module.js')) &&
  fs.existsSync(path.join(OUT, 'three', 'examples', 'jsm', 'postprocessing', 'OutputPass.js')) &&
  fs.existsSync(path.join(OUT, 'qrcode.min.js'));

async function ensure(log = console.log) {
  if (have()) return true;
  log('  Đang tải Three.js về public/vendor (1 lần, cần Internet)…');
  const seen = new Set();
  const queue = [...ENTRY];
  while (queue.length) {
    const rel = queue.pop();
    if (seen.has(rel)) continue;
    seen.add(rel);
    const buf = await get(BASE + rel);
    write(path.join('three', rel), buf);
    if (rel.includes('examples/jsm')) {
      for (const m of buf.toString('utf8').matchAll(/from\s+'(\.[^']+)'/g)) {
        queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1])));
      }
    }
  }
  write('qrcode.min.js', await get(QR_URL));
  log(`  Đã tải xong ${seen.size + 1} file. Game giờ chạy được kể cả khi PC không có Internet.`);
  return true;
}

module.exports = { ensure, have };

if (require.main === module) {
  ensure().catch((e) => { console.error('Không tải được: ' + e.message); process.exit(1); });
}
