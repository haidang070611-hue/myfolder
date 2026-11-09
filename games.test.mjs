// Chạy thử mọi game với "Three.js giả" để bắt lỗi logic/ReferenceError/TypeError (không kiểm tra hình ảnh).
import { register } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = path.resolve(import.meta.dirname, '..');

// 1) sinh three-stub.mjs từ mọi tên THREE.* đang được dùng
const names = new Set();
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((f) => {
  const p = path.join(d, f.name);
  if (f.isDirectory()) { if (f.name !== 'vendor') walk(p); return; }
  if (!p.endsWith('.js')) return;
  const src = fs.readFileSync(p, 'utf8');
  for (const m of src.matchAll(/THREE\.([A-Za-z0-9_]+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*'three'/g)) m[1].split(',').forEach((n) => names.add(n.trim()));
});
walk(path.join(root, 'public'));
fs.writeFileSync(path.join(root, 'test', 'three-stub.mjs'), `
function mk(store = {}) {
  const f = function () {};
  const p = new Proxy(f, {
    get(t, k) {
      if (k in store) return store[k];
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === 'then' || typeof k === 'symbol') return undefined;
      if (k === 'length') return 0;
      return (store[k] = mk());
    },
    set(t, k, v) { store[k] = v; return true; },
    apply() { return mk(); },
    construct() { return mk(); },
  });
  return p;
}
${[...names].map((n) => `export const ${n} = mk();`).join('\n')}
export default mk();
`);
register(pathToFileURL(path.join(root, 'test', 'loader.mjs')));

// 2) môi trường trình duyệt giả
globalThis.window = globalThis;
globalThis.__shadowSize = 512;
const anyFn = () => new Proxy(function () {}, { get: (t, k) => (k === 'data' ? new Uint8ClampedArray(16) : anyFn()), apply: () => anyFn() });
globalThis.document = { createElement: () => ({ getContext: () => new Proxy({}, { get: (t, k) => (k === 'createImageData' ? () => ({ data: new Uint8ClampedArray(16) }) : k === 'getImageData' ? () => ({ data: [] }) : () => ({ addColorStop() {} })), set: () => true }), width: 0, height: 0 }) };

const files = fs.readdirSync(path.join(root, 'public', 'games')).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort();
let bad = 0;
function mkPlayers(n, bots = 0) {
  return Array.from({ length: n }, (_, i) => {
    const bot = i >= n - bots;
    return { id: bot ? 200 + i : i + 1, name: (bot ? 'Bot ' : 'P') + (i + 1), color: '#ff0000', bot, skill: 0.45 + 0.25 * (i % 3), input: { x: 0, y: 0, a: 0, b: 0 }, prev: { a: 0, b: 0 }, press: { a: 0, b: 0 } };
  });
}
const stubMod = await import(pathToFileURL(path.join(root, 'test', 'three-stub.mjs')).href);
// kịch bản: [tổng người, số bot]
const SCENARIOS = [[1, 0], [2, 0], [8, 0], [4, 4], [8, 8], [1 + 3, 3], [2 + 2, 2]];
for (const f of files) {
  if (process.env.ONLY && !process.env.ONLY.split(',').includes(f)) continue;
  const game = (await import(pathToFileURL(path.join(root, 'public', 'games', f + '.js')).href)).default;
  if (!['race', 'fight', 'party', 'team'].includes(game.cat) || !(game.bots >= 2 && game.bots <= 8) || typeof game.think !== 'function') { bad++; console.log(`LỖI ${f}: thiếu cat/bots/think()`); continue; }
  for (const [n, nb] of SCENARIOS) {
    const players = mkPlayers(n, nb);
    let results = null, banners = 0, boards = 0, botActive = 0, botFrames = 0;
    const ctx = {
      THREE: stubMod, scene: new stubMod.Scene(),
      camera: { position: { set() {}, sub() {}, add() {} }, lookAt() {}, aspect: 1.78 }, renderer: {}, players,
      hud: { title() {}, timer() {}, board(r) { boards++; if (!Array.isArray(r)) throw new Error('board phải là mảng'); }, banner() { banners++; }, hideBanner() {} },
      sfx: new Proxy({}, { get: () => () => {} }), vibrate() {}, shake() {}, addLights() {},
      finish: (r) => { results = r; },
    };
    try {
      game.init(ctx);
      let seed = 12345;
      const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      const frames = 60 * 200;
      for (let k = 0; k < frames && !results; k++) {
        if (game.think) game.think(1 / 60);                       // bot điền input
        for (const p of players) {
          if (!p.bot && k % 20 === 0) { p.input.x = Math.round((rnd() - 0.5) * 2); p.input.y = Math.round((rnd() - 0.5) * 2); p.input.a = rnd() < 0.3 ? 1 : 0; p.input.b = rnd() < 0.1 ? 1 : 0; }
          if (p.bot) { botFrames++; if (p.input.x || p.input.y || p.input.a || p.input.b) botActive++; }
          p.press.a = p.input.a && !p.prev.a ? 1 : 0; p.press.b = p.input.b && !p.prev.b ? 1 : 0;
        }
        game.update(1 / 60);
        for (const p of players) { p.prev.a = p.input.a; p.prev.b = p.input.b; }
      }
      if (!results) throw new Error('game không kết thúc sau 200 giây giả lập');
      if (results.length !== n) throw new Error(`kết quả có ${results.length} dòng, cần ${n}`);
      for (const r of results) if (!players.find((p) => p.id === r.id)) throw new Error('id trong kết quả không hợp lệ');
      if (new Set(results.map((r) => r.id)).size !== n) throw new Error('kết quả trùng id');
      if (nb > 0 && !game.think) throw new Error('game chưa có think() cho bot');
      if (nb === n && botFrames && !game.idleOk && botActive / botFrames < 0.15) throw new Error(`bot gần như đứng yên (${((botActive / botFrames) * 100).toFixed(0)}% hoạt động)`);
      game.dispose && game.dispose();
      console.log(`ok  ${f.padEnd(9)} ${String(n).padStart(2)} người (${nb} bot)${nb ? ' hoạt động ' + ((botActive / botFrames) * 100).toFixed(0) + '%' : ''} · ${results.map((r) => r.text).slice(0, 2).join(' | ')}`);
    } catch (e) { bad++; console.log(`LỖI ${f} (${n} người, ${nb} bot):`, e.stack.split('\n').slice(0, 4).join('\n')); }
  }
}
// trang phục: dựng thử mọi mũ / mặt / thân / chất liệu bằng makeBean
{
  const { makeBean } = await import(pathToFileURL(path.join(root, 'public', 'js', 'models.js')).href);
  const L = await import(pathToFileURL(path.join(root, 'public', 'js', 'looks.js')).href);
  let n = 0;
  for (const h of L.HATS) for (const f of L.FACES) for (const b of L.BODIES) for (const fin of L.FINISHES) {
    try { makeBean('#3db2ff', { hat: h[0], face: f[0], body: b[0], finish: fin[0] }); n++; } catch (e) { bad++; console.log('LỖI trang phục', h[0], f[0], b[0], fin[0], e.message); }
  }
  const c = L.cleanLook({ hat: 'zzz', face: 5, color: 'red' });
  if (c.hat !== 'none' || c.face !== 'none' || c.color !== '') { bad++; console.log('LỖI cleanLook'); }
  console.log(`ok  trang phục: ${n} tổ hợp dựng được`);
}
console.log(bad ? `\n${bad} lỗi` : '\nTẤT CẢ GAME CHẠY ĐƯỢC (có bot)');
process.exit(bad ? 1 : 0);
