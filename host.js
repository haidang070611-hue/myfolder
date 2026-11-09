import * as THREE from 'three';
import { connect } from '/js/net.js';
import { sfx, unlockAudio, audioReady, toggleMusic } from '/js/audio.js';
import { addLights, nameSprite, disposeTree, esc } from '/js/util.js';
import { createGfx, resizeGfx, render as gfxRender, cycleQuality, prepScene, std, glow, mesh, T, skyDome, gfx } from '/js/gfx.js';
import { makeBean } from '/js/models.js';
import bumper from '/games/bumper.js';
import race from '/games/race.js';
import tanks from '/games/tanks.js';
import hotbomb from '/games/hotbomb.js';
import soccer from '/games/soccer.js';
import hill from '/games/hill.js';
import coins from '/games/coins.js';
import tiles from '/games/tiles.js';
import paint from '/games/paint.js';
import meteor from '/games/meteor.js';
import dodgeball from '/games/dodgeball.js';
import snake from '/games/snake.js';
import colors from '/games/colors.js';
import zombie from '/games/zombie.js';
import obstacle from '/games/obstacle.js';
import redlight from '/games/redlight.js';
import chairs from '/games/chairs.js';
import jumprope from '/games/jumprope.js';
import tugwar from '/games/tugwar.js';
import sprint from '/games/sprint.js';
import reflex from '/games/reflex.js';
import { LEVELS, BOT_NAMES } from '/js/bots.js';
import { cleanLook, sameLook, randomLook } from '/js/looks.js';
import { avatarSVG } from '/js/avatar.js';
import whack from '/games/whack.js';
import balloon from '/games/balloon.js';
import darts from '/games/darts.js';
import fruit from '/games/fruit.js';
import crossy from '/games/crossy.js';
import stack from '/games/stack.js';
import hoops from '/games/hoops.js';
import invaders from '/games/invaders.js';
import bigfish from '/games/bigfish.js';
import memory from '/games/memory.js';
import flag from '/games/flag.js';
import icerink from '/games/icerink.js';
import maze from '/games/maze.js';
import bomber from '/games/bomber.js';

const GAMES = [bumper, race, tanks, hotbomb, soccer, hill, coins, tiles, paint, meteor, dodgeball, snake, colors, zombie, obstacle, redlight, sprint, chairs, jumprope, reflex, tugwar,
  whack, balloon, darts, fruit, crossy, stack, hoops, invaders, bigfish, memory, flag, icerink, maze, bomber];
const CATS = [['all', '✨ Tất cả'], ['race', '🏁 Đua'], ['fight', '⚔️ Đối kháng'], ['party', '🎉 Party'], ['team', '🤝 Đồng đội']];
const BOT_COLORS = ['#ff7a8a', '#ffd23f', '#4dff88', '#38c8ff', '#b36cff', '#ff9a3d', '#7ef0e0', '#f08cff'];
const BOT_ID0 = 200;
const store = {
  get(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* bỏ qua */ } },
};
const POINTS = [10, 7, 5, 3, 2, 1, 1, 1];
const KB_ID = 100;
const $ = (id) => document.getElementById(id);

/* ================= Renderer (PBR + bloom, tự hạ chất lượng nếu máy yếu) ================= */
const canvas = $('c');
await createGfx(canvas);
const renderer = gfx.renderer;
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600);
function resize() {
  resizeGfx(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', () => { resize(); try { measureStage(); } catch (e) { /* chưa khởi tạo */ } });
resize();

/* ================= Người chơi ================= */
const players = new Map();
let roomCode = '';
let lanInfo = { ips: [], port: location.port, secure: location.protocol === 'https:', publicUrl: null, tunnel: {} };
let ipIndex = 0;

function upsert(info) {
  let p = players.get(info.id);
  if (!p) {
    p = { id: info.id, name: info.name, color: info.color, look: cleanLook(info.look), connected: true, input: { x: 0, y: 0, a: 0, b: 0 }, prev: { a: 0, b: 0 }, press: { a: 0, b: 0 }, total: 0, nav: false };
    players.set(info.id, p);
  } else {
    p.name = info.name; p.color = info.color;
    if (info.look) p.look = cleanLook(info.look);
    p.connected = info.connected !== false;
  }
  return p;
}
const roster = () => [...players.values()].filter((p) => p.connected);
const zero = (p) => { p.input.x = p.input.y = p.input.a = p.input.b = 0; };

/* ================= Mạng ================= */
let currentCfg = null;
const net = connect({
  onOpen() {
    $('conn').classList.add('hidden');
    let saved = '';
    let savedKey = '';
    try { saved = sessionStorage.getItem('pp_room') || ''; savedKey = sessionStorage.getItem('pp_room_key') || ''; } catch (e) {}
    net.send({ t: 'host', code: saved, key: savedKey });
  },
  onClose() { $('conn').classList.remove('hidden'); },
  onMessage(m) {
    switch (m.t) {
      case 'room': {
        roomCode = m.code;
        try { sessionStorage.setItem('pp_room', m.code); if (m.key) sessionStorage.setItem('pp_room_key', m.key); } catch (e) {}
        const seen = new Set();
        for (const i of m.players) { upsert(i); seen.add(i.id); }
        for (const id of [...players.keys()]) if (id !== KB_ID && !seen.has(id)) players.delete(id);
        renderLobbyUI(); renderQR();
        if (currentCfg) net.send({ t: 'all', data: currentCfg });
        break;
      }
      case 'join': {
        const p = upsert({ id: m.id, name: m.name, color: m.color, look: m.look });
        p.connected = true;
        sfx.join();
        if (currentCfg) net.send({ t: 'to', id: m.id, data: currentCfg });
        renderLobbyUI();
        break;
      }
      case 'look': {
        const p = players.get(m.id);
        if (p) { p.color = m.color; p.look = cleanLook(m.look); sfx.select(); renderLobbyUI(); }
        break;
      }
      case 'drop': { const p = players.get(m.id); if (p) { p.connected = false; zero(p); } renderLobbyUI(); break; }
      case 'leave': { players.delete(m.id); sfx.leave(); renderLobbyUI(); break; }
      case 'in': {
        const p = players.get(m.id);
        if (p) { p.input.x = m.x; p.input.y = m.y; p.input.a = m.a; p.input.b = m.b; }
        break;
      }
    }
  },
});
function pushCfg(cfg) {
  currentCfg = Object.assign({ t: 'cfg', title: '', a: 'A', b: 'B', gyro: false, hint: '' }, cfg);
  net.send({ t: 'all', data: currentCfg });
}
const vibrate = (id, ms = 60) => { if (id < KB_ID) net.send({ t: 'to', id, data: { t: 'vib', ms } }); };

/* ================= Bot (người chơi máy) ================= */
let botMode = store.get('pp_botmode', 'auto');   // auto: chỉ bù khi chơi 1 mình · fill: luôn bù cho đủ · off: tắt
let botLevel = store.get('pp_botlevel', 'mid');
if (!['auto', 'fill', 'off'].includes(botMode)) botMode = 'auto';
if (!LEVELS[botLevel]) botLevel = 'mid';
const botPool = [];   // giữ điểm tích lũy của bot qua các ván
let activeBots = [];
const allPlayers = () => [...players.values(), ...activeBots];
const findPlayer = (id) => players.get(id) || botPool.find((b) => b.id === id);

/** Số bot cần ghép cho game def với `humans` người thật. */
function botsNeeded(def, humans) {
  if (botMode === 'off' || humans < 1) return 0;
  const target = Math.min(8, def.bots ?? 4);
  if (botMode === 'auto' && humans > 1) return 0;
  return Math.max(0, Math.min(8 - humans, target - humans));
}
function makeBots(n, humanList) {
  const used = new Set(humanList.map((p) => p.color.toLowerCase()));
  const free = BOT_COLORS.filter((c) => !used.has(c));
  const list = [];
  for (let i = 0; i < n; i++) {
    let b = botPool[i];
    if (!b) {
      b = { id: BOT_ID0 + i, name: '🤖 ' + BOT_NAMES[i % BOT_NAMES.length], bot: true, connected: true, total: 0, input: { x: 0, y: 0, a: 0, b: 0 }, prev: { a: 0, b: 0 }, press: { a: 0, b: 0 }, nav: false, ai: null };
      botPool[i] = b;
    }
    b.color = free[i % free.length] || BOT_COLORS[i % BOT_COLORS.length];
    if (!b.look) b.look = randomLook(b.color);
    b.look.color = b.color;
    b.skill = Math.min(1, Math.max(0.25, LEVELS[botLevel] * (0.9 + 0.2 * ((i * 37) % 10) / 10)));
    b.ai = null; zero(b); b.prev.a = b.prev.b = 0; b.press.a = b.press.b = 0;
    list.push(b);
  }
  return list;
}

/* ================= Bàn phím = 1 người chơi ================= */
const keys = new Set();
function kbInput() {
  const p = players.get(KB_ID);
  if (!p) return;
  const k = (c) => keys.has(c);
  p.input.x = (k('ArrowRight') || k('KeyD') ? 1 : 0) - (k('ArrowLeft') || k('KeyA') ? 1 : 0);
  p.input.y = (k('ArrowDown') || k('KeyS') ? 1 : 0) - (k('ArrowUp') || k('KeyW') ? 1 : 0);
  p.input.a = k('Space') || k('KeyJ') || k('KeyZ') ? 1 : 0;
  p.input.b = k('KeyK') || k('KeyX') ? 1 : 0;
}
window.addEventListener('keydown', (e) => {
  unlockAudio();
  if (e.code === 'KeyM') toggleMusic();
  if (e.code === 'KeyQ') { const l = cycleQuality(window.innerWidth, window.innerHeight); toast('Đồ họa: ' + ({ high: 'CAO (bloom + MSAA)', med: 'TRUNG BÌNH', low: 'THẤP (máy yếu)' })[l]); }
  if (e.code === 'KeyF') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); }
  if (e.code === 'Escape' && phase !== 'lobby') enterLobby();
  if (phase === 'lobby' && !players.has(KB_ID)) {
    if (e.code === 'ArrowLeft') moveSel(-1);
    if (e.code === 'ArrowRight') moveSel(1);
    if (e.code === 'ArrowDown') moveSel(COLS);
    if (e.code === 'ArrowUp') moveSel(-COLS);
    if (e.code === 'Tab') nextCat();
    if (e.code === 'Enter') startGame(listGame(sel));
  }
  if (phase === 'results' && resultsT > 1 && e.code === 'Enter') replay();
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys.add(e.code); kbInput();
});
window.addEventListener('keyup', (e) => { keys.delete(e.code); kbInput(); });
window.addEventListener('blur', () => { keys.clear(); kbInput(); });
window.addEventListener('pointerdown', () => { unlockAudio(); $('audioHint').style.opacity = 0; }, { once: false });

$('addKb').addEventListener('click', () => {
  if (players.has(KB_ID)) return;
  upsert({ id: KB_ID, name: 'Bàn phím', color: '#e8e8ff' });
  sfx.join(); renderLobbyUI();
  toast('WASD/mũi tên = di chuyển · Space hoặc J = A · K = B');
});

/* ================= UI tiện ích ================= */
let toastT = 0;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800);
}
let bannerT = 0;
const rowEls = new Map();
const hud = {
  title(t) { $('hTitle').textContent = t; },
  timer(t) { const el = $('hTimer'); if (el.textContent !== t) el.textContent = t; },
  board(rows) {
    const box = $('hBoard');
    const seen = new Set();
    rows.forEach((r, i) => {
      const key = r.name + '|' + r.color;
      seen.add(key);
      let el = rowEls.get(key);
      if (!el) {
        el = document.createElement('div'); el.className = 'hrow';
        el.innerHTML = '<span class="nm"></span><span class="tx"></span>';
        el.style.setProperty('--c', r.color); el.firstChild.textContent = r.name;
        el.style.transform = `translateY(${i * 46}px)`;
        box.appendChild(el); rowEls.set(key, el);
      }
      el.style.transform = `translateY(${i * 46}px)`;
      el.classList.toggle('dead', !!r.dead);
      const tx = el.lastChild, txt = String(r.text ?? '');
      if (tx.textContent !== txt) { tx.textContent = txt; tx.classList.remove('bump'); void tx.offsetWidth; tx.classList.add('bump'); }
    });
    for (const [k, el] of rowEls) if (!seen.has(k)) { el.remove(); rowEls.delete(k); }
    box.style.height = rows.length * 46 + 'px';
  },
  clearBoard() { $('hBoard').innerHTML = ''; rowEls.clear(); },
  banner(text, ms = 0, small = false, color = '') {
    const b = $('banner');
    b.textContent = text;
    b.classList.toggle('sm', small);
    b.style.setProperty('--bc', color || '#ffffff');
    b.classList.toggle('show', !!text);
    clearTimeout(bannerT);
    if (ms) bannerT = setTimeout(() => b.classList.remove('show'), ms);
  },
  hideBanner() { clearTimeout(bannerT); $('banner').classList.remove('show'); },
};

/* ================= Sảnh chờ ================= */
const lobby = { scene: new THREE.Scene(), blobs: new Map(), t: 0, motes: null };
{
  const s = lobby.scene;
  prepScene(s);
  s.add(skyDome(0x070a18, 0x1c2350, 0x05060e, [0.2, 0.6, -0.5], 0x8aa0ff));
  s.fog = new THREE.Fog(0x0b0d1a, 28, 80);
  addLights(THREE, s, 20, { sun: 1.8, hemi: 0.4, color: 0xcdd8ff, sky: 0x8aa0ff, ground: 0x151936 });
  // sàn bóng loáng phản chiếu + lưới neon
  const floor = mesh(new THREE.CircleGeometry(45, 80), std(0xffffff, { map: T.grid(60), roughness: 0.28, metalness: 0.7, envMapIntensity: 1.1 }), false, true);
  floor.rotation.x = -Math.PI / 2;
  s.add(floor);
  for (const r of [7, 11, 16]) { const ring = mesh(new THREE.TorusGeometry(r, 0.06, 8, 96), glow(0x6f7bff, 2.2), false); ring.rotation.x = Math.PI / 2; ring.position.y = 0.03; s.add(ring); }
  // sân khấu bóng loáng + viền neon + 3 chùm đèn sân khấu quét chậm
  const stage = mesh(new THREE.CylinderGeometry(10.5, 11, 0.5, 72), std(0x10142e, { roughness: 0.22, metalness: 0.85, envMapIntensity: 1.3 }), false, true);
  stage.position.set(0, -0.25, -2); s.add(stage);
  const edge = mesh(new THREE.TorusGeometry(10.5, 0.09, 10, 96), glow(0x8a9bff, 2.8), false); edge.rotation.x = Math.PI / 2; edge.position.set(0, 0.02, -2); s.add(edge);
  lobby.beams = [[-7, 0xff6fb5], [0, 0x7c8cff], [7, 0x2ee6d6]].map(([x, col]) => {
    const geo = new THREE.ConeGeometry(3.6, 18, 32, 1, true); geo.translate(0, -9, 0);   // đỉnh nón ở gốc để xoay quanh đèn
    const cone = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    cone.position.set(x, 18, -4); s.add(cone);
    const lamp = mesh(new THREE.SphereGeometry(0.4, 12, 8), glow(col, 4), false); lamp.position.set(x, 18, -4); s.add(lamp);
    return cone;
  });
  // bụi sáng lơ lửng
  const n = 160, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 50; pos[i * 3 + 1] = Math.random() * 14; pos[i * 3 + 2] = (Math.random() - 0.5) * 40 - 5; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  lobby.motes = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9fb0ff, size: 0.12, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.add(lobby.motes);
}
/* Vùng giữa màn hình (giữa cột QR bên trái và cột chọn game bên phải): nơi người chơi xuất hiện */
const stageBox = { xc: 0, w: 0, W: 0, H: 0, t: 0, rows: 1, perRow: 4 };
function measureStage() {
  const W = window.innerWidth, H = window.innerHeight;
  const el = $('stage');
  const r = el && el.offsetParent !== null ? el.getBoundingClientRect() : null;
  if (r && r.width > 140) { stageBox.xc = r.left + r.width / 2; stageBox.w = r.width; }
  else { stageBox.xc = W / 2; stageBox.w = W; }
  stageBox.W = W; stageBox.H = H;
}
let viewKey = '';
function applyLobbyView() {
  const { xc, W, H } = stageBox;
  const key = `${Math.round(xc)}|${W}|${H}`;
  if (key === viewKey) return;
  viewKey = key;
  // dời tâm khung hình 3D về giữa vùng trống: người chơi không bị cột bên phải che
  if (Math.abs(xc - W / 2) < 2) camera.clearViewOffset();
  else camera.setViewOffset(W, H, W / 2 - xc, 0, W, H);
}
function clearLobbyView() { viewKey = ''; camera.clearViewOffset(); }

function syncBlobs(dt) {
  const list = roster();
  for (const [id, b] of lobby.blobs) {
    if (!list.find((p) => p.id === id)) { lobby.scene.remove(b); disposeTree(b); lobby.blobs.delete(id); }
  }
  // bao nhiêu người đứng được trên một hàng tùy bề rộng vùng giữa
  const worldPerPx = (2 * Math.tan((camera.fov * Math.PI) / 360) * 16.6) / Math.max(300, stageBox.H);
  const stageWorld = stageBox.w * worldPerPx * 0.95;
  const perRow = Math.max(3, Math.min(5, Math.floor(stageWorld / 3.4)));
  const SPACING = Math.max(2.5, Math.min(3.4, stageWorld / perRow));
  const rows = Math.max(1, Math.ceil(list.length / perRow));
  const per = Math.ceil(list.length / rows);
  stageBox.rows = rows; stageBox.perRow = per;
  list.forEach((p, i) => {
    let b = lobby.blobs.get(p.id);
    const key = p.color + '|' + p.name + '|' + JSON.stringify(p.look);
    if (b && b.userData.key !== key) {
      // đổi trang phục/tên/màu: dựng lại nhân vật tại chỗ (giữ vị trí, nhảy lên một cái cho vui)
      const old = b; lobby.scene.remove(old); disposeTree(old); lobby.blobs.delete(p.id);
      b = null; lobby.keep = { pos: old.position.clone(), seed: old.userData.seed };
    }
    if (!b) {
      b = makeBean(p.color, p.look);
      b.scale.setScalar(1.5);
      const label = nameSprite(THREE, p.name, p.color);
      label.position.y = 2.7; b.add(label);
      b.userData.label = label; b.userData.key = key; b.userData.seed = lobby.keep ? lobby.keep.seed : Math.random() * 6;
      if (lobby.keep) { b.position.copy(lobby.keep.pos); b.userData.drop = 0; b.userData.pop = 1; lobby.keep = null; }
      else b.userData.drop = 1;   // người mới vào từ trên cao, nảy xuống
      lobby.scene.add(b); lobby.blobs.set(p.id, b);
    }
    if (b.userData.pop > 0) b.userData.pop = Math.max(0, b.userData.pop - dt * 3);
    const row = Math.floor(i / per), col = i % per;
    const inRow = Math.min(per, list.length - row * per);
    const x = (col - (inRow - 1) / 2) * SPACING;
    const z = -row * 3.6;
    b.position.x += (x - b.position.x) * Math.min(1, dt * 6);
    b.position.z += (z - b.position.z) * Math.min(1, dt * 6);
    if (b.userData.drop > 0) b.userData.drop = Math.max(0, b.userData.drop - dt * 2.2);
    const hop = Math.abs(Math.sin(lobby.t * 2.5 + b.userData.seed));
    b.position.y = hop * 0.9 + b.userData.drop * b.userData.drop * 9 + Math.sin((b.userData.pop || 0) * Math.PI) * 0.8;
    if (b.userData.prop) b.userData.prop.rotation.y += dt * 22;
    if (b.userData.wings) { const f = Math.sin(lobby.t * 7) * 0.2; b.userData.wings[0].rotation.z = 0.5 + f; b.userData.wings[1].rotation.z = -0.5 - f; }
    b.userData.body.scale.set(1 + (1 - hop) * 0.06, 1 - (1 - hop) * 0.08, 1 + (1 - hop) * 0.06);
    b.rotation.y = Math.sin(lobby.t * 0.8 + i) * 0.5;
  });
}

let sel = 0, cat = 'all';
const COLS = 2; // số cột thẻ game (khớp CSS .cards)
const shown = () => GAMES.filter((g) => cat === 'all' || g.cat === cat);
const listGame = (i) => GAMES.indexOf(shown()[Math.max(0, Math.min(i, shown().length - 1))]);
function moveSel(d) {
  const n = shown().length;
  if (!n) return;
  let t = sel + d;
  if (Math.abs(d) === COLS) { if (t < 0 || t >= n) t = (sel + d + n * 4) % n; } else t = (t + n) % n;
  sel = t;
  sfx.select(); renderCards(false);
  const el = $('cards').querySelector('.card.sel');
  if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function nextCat() {
  const i = CATS.findIndex((c) => c[0] === cat);
  cat = CATS[(i + 1) % CATS.length][0]; sel = 0; sfx.select(); renderCats(); renderCards(true);
}
function renderCats() {
  const box = $('cats');
  if (!box.children.length) box.innerHTML = CATS.map(([id, label]) => `<button class="cat" data-c="${id}">${label}</button>`).join('');
  for (const b of box.children) b.classList.toggle('on', b.dataset.c === cat);
}
$('cats').addEventListener('click', (e) => {
  const b = e.target.closest('.cat'); if (!b) return;
  cat = b.dataset.c; sel = 0; sfx.select(); renderCats(); renderCards(true);
});

/* Thẻ game chỉ được tạo MỘT lần. Chọn game = đổi class, đổi thể loại = ẩn/hiện, nên không bao giờ bị tải lại. */
const cardEls = new Map();
function buildCards() {
  const box = $('cards');
  for (const g of GAMES) {
    const el = document.createElement('button');
    el.className = 'card'; el.dataset.id = g.id; el.style.setProperty('--c', g.color);
    el.innerHTML = `<div class="em">${g.emoji}</div><b>${esc(g.name)}</b><em>${esc(g.tag)}</em>`;
    box.appendChild(el); cardEls.set(g.id, el);
  }
}
function renderCards(animate) {
  const list = shown();
  if (sel >= list.length) sel = 0;
  let k = 0;
  for (const g of GAMES) {
    const el = cardEls.get(g.id), idx = list.indexOf(g);
    el.hidden = idx < 0;
    if (idx < 0) continue;
    el.dataset.i = idx;
    el.classList.toggle('sel', idx === sel);
    if (animate) { el.classList.remove('enter'); void el.offsetWidth; el.style.animationDelay = (k++ * 22) + 'ms'; el.classList.add('enter'); }
  }
  renderDetail();
}
function botLine(def) {
  const humans = roster().length || 1, n = botsNeeded(def, humans);
  return n ? `🤖 Sẽ ghép thêm ${n} bot` : (botMode === 'off' ? '🤖 Bot đang tắt' : '👥 Đủ người, không cần bot');
}
const D = {};
function buildDetail() {
  $('detail').innerHTML = '<div class="big"></div><div class="txt"><h3></h3><p></p><div class="tags"><span class="tagc"></span><span class="tagc"></span><span class="tagc" id="botTag"></span></div></div><button class="play" id="playBtn">▶ CHƠI</button>';
  const q = (sel2) => $('detail').querySelector(sel2);
  Object.assign(D, { big: q('.big'), h: q('h3'), p: q('p'), tags: $('detail').querySelectorAll('.tagc'), txt: q('.txt') });
  $('playBtn').addEventListener('click', () => { const g = shown()[sel]; if (g) startGame(GAMES.indexOf(g)); });
}
const setText = (el, t) => { if (el.textContent !== t) el.textContent = t; };
function renderDetail() {
  const g = shown()[sel];
  if (!g) return;
  const changed = D.id !== g.id;
  D.id = g.id;
  $('detail').style.setProperty('--c', g.color);
  setText(D.big, g.emoji); setText(D.h, g.name); setText(D.p, g.desc);
  setText(D.tags[0], (CATS.find((c) => c[0] === g.cat) || [0, ''])[1]); setText(D.tags[1], g.tag); setText(D.tags[2], botLine(g));
  if (changed) { D.txt.classList.remove('swap'); D.big.classList.remove('swap'); void D.txt.offsetWidth; D.txt.classList.add('swap'); D.big.classList.add('swap'); }
}
$('cards').addEventListener('click', (e) => {
  const c = e.target.closest('.card');
  if (!c) return;
  const i = +c.dataset.i;
  if (i === sel) startGame(listGame(sel)); else { sel = i; sfx.select(); renderCards(false); }
});
function syncBotUI() {
  for (const b of $('botMode').children) b.classList.toggle('on', b.dataset.v === botMode);
  for (const b of $('botLevel').children) b.classList.toggle('on', b.dataset.v === botLevel);
  $('botNote').textContent = botMode === 'off' ? 'đang tắt' : botMode === 'auto' ? 'chơi 1 mình tự có bot' : 'luôn bù cho đủ';
}
$('botMode').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; botMode = b.dataset.v; store.set('pp_botmode', botMode); sfx.select(); syncBotUI(); renderLobbyUI(); renderDetail(); });
$('botLevel').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; botLevel = b.dataset.v; store.set('pp_botlevel', botLevel); sfx.select(); syncBotUI(); });
function renderLobbyUI() {
  $('code').textContent = roomCode || '----';
  const hum = [...players.values()];
  const def = shown()[sel];
  const nb = def ? botsNeeded(def, roster().length) : 0;
  $('players').innerHTML = hum.map((p) =>
    `<span class="chip${p.connected ? '' : ' off'}" style="background:${p.color}"><span class="mini">${avatarSVG(p.look, p.color, { crop: true })}</span>${esc(p.name)}</span>`).join('') +
    Array.from({ length: hum.length ? nb : 0 }, (_, i) => `<span class="chip bot">🤖 ${esc(BOT_NAMES[i % BOT_NAMES.length])}</span>`).join('') ||
    '<span class="muted small">Chưa có ai vào… quét QR nhé!</span>';
  $('pcount').textContent = hum.length ? `${roster().length} người` : '';
  const ranked = hum.slice().sort((a, b) => b.total - a.total);
  $('board').innerHTML = ranked.some((p) => p.total > 0)
    ? '<span class="muted small">Tổng điểm:</span>' + ranked.map((p) => `<span class="lb"><i style="background:${p.color}"></i>${esc(p.name)} <b>${p.total}</b></span>`).join('')
    : '';
  $('addKb').style.display = players.has(KB_ID) ? 'none' : '';
  const sh = $('stageHint');
  if (!hum.length) {
    sh.className = 'stage-hint empty';
    sh.innerHTML = '<div class="big">👈 Quét mã QR để vào chơi</div><div class="sm">Điện thoại của bạn sẽ thành tay cầm · người chơi sẽ hiện ở đây</div>';
  } else {
    sh.className = 'stage-hint ready';
    sh.innerHTML = '<span class="keys">Gạt cần <b>↑ ↓ ← →</b> chọn game <i>·</i> <b>A</b> chơi <i>·</i> <b>B</b> đổi thể loại</span>';
  }
  const t = $('botTag'); if (t && def) t.textContent = botLine(def);
}
let netMode = 'lan';   // 'lan' | 'net' (net = link công khai, mọi mạng đều vào được)
let netPicked = false; // người dùng tự bấm tab thì không tự đổi nữa
const isLocalHost = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const lanBase = () => (lanInfo.ips.length ? `${lanInfo.secure ? 'https' : 'http'}://${lanInfo.ips[ipIndex % lanInfo.ips.length]}:${lanInfo.port}` : location.origin);
function qrMode() { return isLocalHost && netMode === 'net' && lanInfo.publicUrl ? 'pub' : 'lan'; }
function joinURL() {
  const base = !isLocalHost ? location.origin : qrMode() === 'pub' ? lanInfo.publicUrl : lanBase();
  return `${base}/play?c=${roomCode}`;
}
function renderQR() {
  if (!roomCode) return;
  const box = $('qr');
  const t = lanInfo.tunnel || {};
  $('tabLan').classList.toggle('on', netMode === 'lan');
  $('tabNet').classList.toggle('on', netMode === 'net');
  $('modeTabs').style.display = isLocalHost ? '' : 'none'; // đã online (Render...) thì không cần chọn
  const mode = qrMode();
  const pending = isLocalHost && netMode === 'net' && !lanInfo.publicUrl;   // đang chờ / lỗi đường hầm
  if (pending && !lanInfo.ips.length) {
    $('url').textContent = '…';
    box.textContent = t.state === 'error' ? 'Chưa mở được link công khai' : 'Đang mở link công khai…';
  }
  let msg = '';
  if (!isLocalHost) msg = '';
  else if (mode === 'pub') msg = '🌐 <b>Ai cũng quét được</b>, dùng 4G hay Wi-Fi nhà khác đều chơi được · có HTTPS nên cảm biến nghiêng hoạt động';
  else if (pending && t.state === 'error') {
    msg = '⚠️ Chưa mở được link công khai' + (t.tried && t.tried.length ? ` (${t.tried.map((x) => x.via).join(', ')} đều lỗi)` : '') +
      '. Kiểm tra Internet của PC rồi bấm <b>🌐 Mọi mạng</b> để thử lại. Tạm thời QR này chỉ dùng được khi <b>cùng Wi-Fi</b>.';
  } else if (pending && lanInfo.online === false) {
    msg = 'Server đang chạy chế độ chỉ trong nhà (--lan). Bấm <b>🌐 Mọi mạng</b> để mở link công khai.';
  } else if (pending) {
    msg = `⏳ Đang mở link công khai cho điện thoại ở mọi mạng… ${t.note ? '<b>' + t.note + '</b> ' : ''}QR sẽ tự đổi khi xong. Trong lúc chờ, QR này dùng được khi <b>cùng Wi-Fi</b>.`;
  } else {
    msg = `Điện thoại phải <b>cùng Wi-Fi</b> với PC.${lanInfo.ips.length > 1 ? ' Không vào được? Bấm địa chỉ để đổi sang IP khác.' : ''}`;
  }
  $('netMsg').innerHTML = msg;
  if (pending && !lanInfo.ips.length) return;
  const url = joinURL();
  $('url').textContent = url.replace(/^https?:\/\//, '').replace('?c=', '  ·  mã ');
  $('url').title = mode === 'pub' ? 'Bấm để sao chép link mời' : 'Bấm để đổi địa chỉ IP';
  try {
    if (!window.qrcode) throw new Error('chưa có thư viện QR');
    const qr = window.qrcode(0, 'M');
    qr.addData(url); qr.make();
    box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  } catch (e) {
    box.textContent = 'Chưa có mã QR — nhập địa chỉ bên dưới vào điện thoại.';
  }
}
window.addEventListener('qrready', renderQR);
$('url').addEventListener('click', () => {
  if (qrMode() === 'pub' || !isLocalHost) {
    const link = joinURL();
    const done = () => toast('📋 Đã sao chép link mời, gửi cho bạn bè là vào được');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, () => toast(link));
    else toast(link);
  } else if (lanInfo.ips.length > 1) { ipIndex++; renderQR(); }
});

const apiHeaders = { 'x-pp': '1' };
let pollT = 0;
function pollInfo() {
  clearTimeout(pollT);
  fetch('/api/info', { cache: 'no-store' }).then((r) => r.json()).then((i) => {
    const had = lanInfo.publicUrl;
    lanInfo = i;
    // mặc định (server chạy online): dùng QR công khai ngay khi sẵn sàng
    if (!netPicked && isLocalHost) netMode = i.online || i.publicUrl ? 'net' : 'lan';
    renderQR();
    if (i.publicUrl && !had) toast('🌐 Sẵn sàng! Ai cũng quét QR để chơi được, không cần cùng Wi-Fi');
    else if (i.publicUrl && had && had !== i.publicUrl) toast('🌐 Link công khai đã đổi: QR mới, người chơi cần quét lại');
    const t = i.tunnel || {};
    pollT = setTimeout(pollInfo, t.state === 'starting' || (i.online && t.state !== 'on') ? 1500 : 6000);
  }).catch(() => { pollT = setTimeout(pollInfo, 4000); });
}
$('tabLan').addEventListener('click', () => { netPicked = true; netMode = 'lan'; renderQR(); });
$('tabNet').addEventListener('click', () => {
  netPicked = true; netMode = 'net'; renderQR();
  const st = (lanInfo.tunnel || {}).state;
  if (lanInfo.publicUrl || st === 'starting') return;
  fetch('/api/tunnel', { method: 'POST', headers: apiHeaders }).then((r) => r.json()).catch(() => ({})).then(() => pollInfo());
});
pollInfo();

function updateLobby(dt) {
  lobby.t += dt;
  if (lobby.beams) lobby.beams.forEach((c, i) => { c.rotation.z = Math.sin(lobby.t * 0.5 + i * 2) * 0.2; c.rotation.x = Math.cos(lobby.t * 0.4 + i) * 0.14; });
  syncBlobs(dt);
  // chọn game bằng cần gạt trên điện thoại
  for (const p of roster()) {
    if (Math.abs(p.input.x) > 0.65 && !p.nav) { p.nav = true; moveSel(p.input.x > 0 ? 1 : -1); }
    else if (Math.abs(p.input.y) > 0.65 && !p.nav) { p.nav = true; moveSel(p.input.y > 0 ? COLS : -COLS); }
    else if (Math.abs(p.input.x) < 0.3 && Math.abs(p.input.y) < 0.3) p.nav = false;
    if (p.press.b) nextCat();
    if (p.press.a) { startGame(listGame(sel)); return; }
  }
  // camera lùi ra khi có nhiều hàng người chơi
  lobby.camT = (lobby.camT || 0) + dt;
  if (lobby.camT > 0.25 || !stageBox.W) { lobby.camT = 0; measureStage(); }
  applyLobbyView();
  const rows = stageBox.rows;
  const ty = 7 + (rows - 1) * 2.2, tz = 15 + (rows - 1) * 2.6, lz = -(rows - 1) * 1.8;
  const k = Math.min(1, dt * 4);
  lobby.cy = (lobby.cy ?? ty) + (ty - (lobby.cy ?? ty)) * k;
  lobby.cz = (lobby.cz ?? tz) + (tz - (lobby.cz ?? tz)) * k;
  lobby.lz = (lobby.lz ?? lz) + (lz - (lobby.lz ?? lz)) * k;
  camera.position.set(0, lobby.cy, lobby.cz);
  camera.lookAt(0, 1.2, lobby.lz);
}

function enterLobby() {
  if (phase !== 'lobby') flashVeil();
  if (game && game.dispose) { try { game.dispose(); } catch (e) { console.error(e); } }
  if (gscene) disposeTree(gscene);
  game = null; gscene = null; gfinish = false; activeBots = [];
  phase = 'lobby'; lastDef = null;
  hud.hideBanner(); hud.clearBoard(); $('intro').classList.remove('show'); stopConfetti();
  $('hud').classList.add('hidden');
  $('results').classList.add('hidden');
  $('lobby').classList.remove('hidden');
  pushCfg({ title: 'Chọn game', a: 'CHƠI', b: 'THỂ LOẠI', hideStick: false, lobby: true, hint: 'Gạt để chọn game · A bắt đầu · B đổi thể loại · 👕 đổi trang phục' });
  renderLobbyUI();
}

/* ================= Vào game ================= */
let phase = 'lobby'; // lobby | count | game | results
let game = null, gscene = null, gfinish = false;
let countdown = 0, lastCount = 0, resultsT = 0;
let shake = 0, shakeOff = new THREE.Vector3();

let lastDef = null;
/* Màn che chuyển cảnh: tránh cảm giác "đơ/giật" khi game dựng cảnh và biên dịch shader */
let veilT = 0;
function showVeil(def) {
  clearTimeout(veilT);
  const v = $('veil');
  v.style.setProperty('--c', def ? def.color : '#7c8cff');
  v.innerHTML = def ? `<div class="vi"><div class="vem">${def.emoji}</div><b>${esc(def.name)}</b><div class="spin"></div></div>` : '';
  v.classList.add('on');
}
const hideVeil = () => $('veil').classList.remove('on');
function flashVeil() { showVeil(null); veilT = setTimeout(hideVeil, 240); }
function warm(sc) {
  // biên dịch shader song song trước khi vào game (không bị đứng hình ở frame đầu)
  const r = gfx.renderer;
  const timeout = new Promise((res) => setTimeout(res, 1800));
  let p = Promise.resolve();
  try { if (r.compileAsync) p = r.compileAsync(sc, camera); else r.compile(sc, camera); } catch (e) { /* bỏ qua */ }
  return Promise.race([p.catch(() => {}), timeout]);
}

function startGame(i) {
  if (phase !== 'lobby') return;
  const humans = roster();
  if (!humans.length) { toast('Cần ít nhất 1 người chơi. Quét QR hoặc thêm bàn phím.'); return; }
  phase = 'loading';
  lastDef = GAMES[i];
  showVeil(lastDef);
  setTimeout(() => beginGame(i), 260);   // chờ màn che hiện xong rồi mới dựng cảnh (dựng cảnh chạy đồng bộ)
}

function beginGame(i) {
  if (phase !== 'loading') return;
  const humans = roster();
  const def = GAMES[i];
  const nb = botsNeeded(def, humans.length);
  activeBots = makeBots(nb, humans);
  const list = [...humans, ...activeBots];
  gscene = new THREE.Scene();
  clearLobbyView();
  gfinish = false; shake = 0; shakeOff.set(0, 0, 0);
  for (const p of humans) { p.press.a = p.press.b = 0; }
  const ctx = {
    THREE, scene: gscene, camera, renderer, hud, sfx, vibrate,
    players: list,
    addLights: (size, o) => addLights(THREE, gscene, size, o),
    shake: (a) => { shake = Math.max(shake, a); },
    finish: (results) => finishGame(def, results),
  };
  game = def;
  hud.clearBoard();
  try { def.init(ctx); } catch (e) { console.error(e); toast('Lỗi khởi tạo game: ' + e.message); game = null; gscene = null; activeBots = []; phase = 'lobby'; hideVeil(); return; }
  warm(gscene).then(() => {
    if (phase !== 'loading' || game !== def) return;   // người chơi đã thoát ra menu trong lúc chờ
    phase = 'count'; countdown = 3.99; lastCount = 4;
    $('lobby').classList.add('hidden');
    $('results').classList.add('hidden'); stopConfetti();
    $('hud').classList.remove('hidden');
    hud.title(def.name); hud.timer('');
    const intro = $('intro');
    intro.style.setProperty('--c', def.color);
    intro.innerHTML = `<div class="em">${def.emoji}</div><div><b>${esc(def.name)}</b><span>${esc(def.cfg.hint || def.desc)}</span>
      <div class="who">👥 ${humans.length} người${nb ? ` · 🤖 ${nb} bot (${({ easy: 'Dễ', mid: 'Vừa', hard: 'Khó' })[botLevel]})` : ''}</div></div>`;
    intro.classList.add('show');
    pushCfg(Object.assign({ title: def.name, bots: nb, lobby: false }, def.cfg));
    hideVeil();
  });
}

function replay() {
  if (phase !== 'results' || !lastDef) return;
  const def = lastDef;
  enterLobby();
  startGame(GAMES.indexOf(def));
}

function finishGame(def, results) {
  if (gfinish || phase === 'lobby') return;
  gfinish = true;
  phase = 'results'; resultsT = 0;
  hud.hideBanner(); $('intro').classList.remove('show');
  sfx.win();
  const rows = results.map((r, i) => {
    const p = findPlayer(r.id);
    const pts = POINTS[Math.min(i, POINTS.length - 1)];
    if (p) p.total += pts;
    return { p, pts, text: r.text ?? '' };
  }).filter((r) => r.p);
  const order = [1, 0, 2]; // bục: hạng 2 - 1 - 3
  const hts = [250, 200, 150];
  const pods = rows.slice(0, 3);
  const podHtml = (pods.length >= 2 ? order : [0]).filter((k) => pods[k]).map((k) => {
    const r = pods[k];
    const h = pods.length === 1 ? 220 : hts[k] ?? 150;
    return `<div class="pod" style="animation-delay:${(2 - k) * 0.25}s"><div class="av" style="background:${r.p.color}">${k === 0 ? '<span class="crown">👑</span>' : ''}${avatarSVG(r.p.look, r.p.color, { crop: true })}</div>
      <div class="bar" style="--bc:${r.p.color};height:${h * 0.72}px;animation-delay:${(2 - k) * 0.25}s"><div class="nm">${esc(r.p.name)}</div><div class="tx">${esc(r.text)}</div><div class="pt">+${r.pts}</div></div></div>`;
  }).join('');
  const rest = rows.slice(3).map((r, i) => `<div class="rrow" style="--c:${r.p.color};animation-delay:${0.8 + i * 0.07}s"><span class="n">${i + 4}</span><span class="nm">${esc(r.p.name)}</span><span class="tx">${esc(r.text)}</span><span class="pt">+${r.pts}</span><span class="tot">${r.p.total}</span></div>`).join('');
  $('results').innerHTML = `<div class="panel res"><h2>${def.emoji} ${esc(def.name)}</h2><div class="sub">Kết quả ván này · điểm cộng dồn hiển thị ở menu</div>
    <div class="podium">${podHtml}</div>${rest ? `<div class="rest">${rest}</div>` : ''}
    <div class="keys"><button class="btn pri" id="btnAgain">↻ Chơi lại (A)</button><button class="btn" id="btnBack">☰ Về menu (B)</button></div>
    <div class="hintline">Tổng điểm: ${rows.map((r) => `${esc(r.p.name)} <b style="color:var(--gold)">${r.p.total}</b>`).join(' · ')}</div></div>`;
  $('btnAgain').addEventListener('click', replay);
  $('btnBack').addEventListener('click', () => { if (phase === 'results') enterLobby(); });
  $('results').classList.remove('hidden');
  startConfetti(rows[0] ? rows[0].p.color : '#ffd23f');
  pushCfg({ title: 'Kết quả', a: 'CHƠI LẠI', b: 'MENU', hideStick: true, hint: 'A chơi lại · B về menu' });
}

/* ---------- pháo giấy ---------- */
let confetti = null;
function startConfetti(main) {
  stopConfetti();
  const cv = $('confetti'); cv.classList.remove('hidden');
  cv.width = window.innerWidth; cv.height = window.innerHeight;
  const g = cv.getContext('2d');
  if (!g) return;
  const cols = [main, '#ffd23f', '#ff5a6e', '#4dff88', '#38c8ff', '#b36cff', '#ffffff'];
  const parts = Array.from({ length: 90 }, () => ({ x: Math.random() * cv.width, y: -Math.random() * cv.height * 0.8, vx: (Math.random() - 0.5) * 120, vy: 140 + Math.random() * 260, w: 6 + Math.random() * 8, h: 4 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 12, c: cols[Math.floor(Math.random() * cols.length)] }));
  let t0 = performance.now(), run = true;
  const step = (now) => {
    if (!run) return;
    const dt = Math.min(0.05, (now - t0) / 1000); t0 = now;
    g.clearRect(0, 0, cv.width, cv.height);
    for (const p of parts) {
      p.x += p.vx * dt + Math.sin(p.y * 0.02) * 0.6; p.y += p.vy * dt; p.r += p.vr * dt;
      if (p.y > cv.height + 20) { p.y = -20; p.x = Math.random() * cv.width; }
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.scale(1, Math.cos(p.r * 1.7)); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore();
    }
    requestAnimationFrame(step);
  };
  confetti = { stop() { run = false; g.clearRect(0, 0, cv.width, cv.height); } };
  requestAnimationFrame(step);
  setTimeout(() => { if (confetti) { const c = confetti; confetti = null; c.stop(); cv.classList.add('hidden'); } }, 7000);
}
function stopConfetti() { if (confetti) { confetti.stop(); confetti = null; } $('confetti').classList.add('hidden'); }

/* ================= Vòng lặp chính ================= */
$('btnMenu').addEventListener('click', () => { if (phase !== 'lobby') enterLobby(); });

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // bot suy nghĩ → điền input, rồi mới tính cạnh bấm cho mọi người chơi
  if (phase === 'game' && game && game.think) {
    try { game.think(dt); } catch (e) { console.error(e); }
  } else if (activeBots.length) for (const b of activeBots) zero(b);
  const everyone = allPlayers();
  for (const p of everyone) {
    p.press.a = p.input.a && !p.prev.a ? 1 : 0;
    p.press.b = p.input.b && !p.prev.b ? 1 : 0;
  }

  let scene = lobby.scene;
  if (phase === 'lobby') {
    updateLobby(dt);
  } else {
    scene = gscene;
    camera.position.sub(shakeOff);
    if (phase === 'loading') {
      // đang dựng cảnh phía sau màn che
    } else if (phase === 'count') {
      countdown -= dt;
      const n = Math.ceil(countdown);
      if (n !== lastCount) {
        lastCount = n;
        if (n > 0) { hud.banner(String(n), 0, false, ['', '#ff5a6e', '#ffd23f', '#4dff88'][n] || '#fff'); sfx.tick(); }
        else { hud.banner('BẮT ĐẦU!', 700); sfx.go(); $('intro').classList.remove('show'); }
      }
      if (game.preview) game.preview(dt);
      else { try { game.update(0); } catch (e) { /* chỉ để đặt vị trí ban đầu */ } }
      if (countdown <= 0) phase = 'game';
    } else if (phase === 'game') {
      try { game.update(dt); } catch (e) { console.error(e); toast('Lỗi trong game: ' + e.message); enterLobby(); }
    } else if (phase === 'results') {
      resultsT += dt;
      if (game && game.update && !gfinish) game.update(dt);
      if (resultsT > 1.2 && roster().some((p) => p.press.a)) replay();
      else if (resultsT > 1.2 && roster().some((p) => p.press.b)) enterLobby();
      else if (resultsT > 45) enterLobby();
    }
    if (phase === 'lobby') {
      scene = lobby.scene;
    } else {
      shake *= Math.pow(0.002, dt);
      if (shake < 0.01) shake = 0;
      shakeOff.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      camera.position.add(shakeOff);
    }
  }
  if (lobby.motes && scene === lobby.scene) lobby.motes.rotation.y += dt * 0.02;
  const verdict = gfxRender(scene || lobby.scene, camera, dt);
  if (verdict === 'down') { const l = cycleQuality(window.innerWidth, window.innerHeight); toast('Máy hơi yếu, tự hạ đồ họa xuống: ' + l.toUpperCase() + ' (phím Q để đổi)'); }

  for (const p of everyone) { p.prev.a = p.input.a; p.prev.b = p.input.b; }
}

syncBotUI();
buildCards(); buildDetail();
renderCats();
renderLobbyUI();
renderCards(true);
enterLobby();
requestAnimationFrame(frame);
setInterval(() => { if (audioReady()) $('audioHint').style.opacity = 0; }, 1000);
