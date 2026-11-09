import * as THREE from 'three';
import { rand, fmtTime, makeFX } from '/js/util.js';
import { std, glow, mesh } from '/js/gfx.js';
import { setupScene, spawnBeans, stepBean, pushApart, clampRect, showBean } from '/js/party.js';
import { tick, pulse, stick, idle, chance } from '/js/bots.js';

const COLS = 6, ROWS = 4, TS = 4.3, DURATION = 120;
const HX = (COLS * TS) / 2, HZ = (ROWS * TS) / 2;
const SYMS = [
  ['sphere', 0xff4d5e], ['cube', 0x3aa8ff], ['cone', 0xffd23f], ['torus', 0x45e07a], ['octa', 0xb36cff], ['cyl', 0xff8a3d],
  ['sphere', 0x2ee6d6], ['cube', 0xff6fb5], ['cone', 0xffffff], ['torus', 0xff4d5e], ['octa', 0xffd23f], ['cyl', 0x3aa8ff],
];
let S = null;

export default {
  id: 'memory',
  name: 'Lật Thẻ Trí Nhớ',
  emoji: '🃏',
  color: '#8a6cff',
  cat: 'party',
  idleOk: true,          // bot đứng chờ trên thẻ / chờ lật nên có lúc đứng yên
  bots: 4,
  tag: '1-8 người · 2 phút',
  desc: 'Đứng lên một thẻ úp và bấm A để lật. Lật hai thẻ giống nhau để ghi điểm và chiếm thẻ! Thẻ sai sẽ úp lại sau 1 giây, hãy nhớ vị trí. Ai ghi nhiều cặp nhất thắng.',
  cfg: { a: 'LẬT', b: '', gyro: false, hideStick: false, hint: 'Đứng trên thẻ rồi bấm A để lật · tìm cặp giống nhau' },

  init(ctx) {
    const scene = ctx.scene;
    setupScene(ctx, { bg: 0x120c26, size: 28, cam: [0, 31, 16], look: [0, 0, 0.5], light: { sun: 2.4, hemi: 0.7 } });
    S = { ctx, fx: makeFX(THREE, scene), t: 0, time: 0, over: false, lastHud: -1, cards: [], pairs: 0 };
    S.baseGeo = new THREE.BoxGeometry(TS - 0.35, 0.5, TS - 0.35);
    S.backMat = std(0x3a2f7a, { roughness: 0.4, metalness: 0.3, emissive: 0x2a1f66, emissiveIntensity: 0.5 });
    S.faceMat = std(0xf2f0ff, { roughness: 0.4 });
    S.geos = { sphere: new THREE.SphereGeometry(0.8, 18, 12), cube: new THREE.BoxGeometry(1.25, 1.25, 1.25), cone: new THREE.ConeGeometry(0.85, 1.5, 18), torus: new THREE.TorusGeometry(0.62, 0.26, 12, 24), octa: new THREE.OctahedronGeometry(0.95), cyl: new THREE.CylinderGeometry(0.65, 0.65, 1.3, 18) };
    const deck = [];
    SYMS.forEach((_, i) => { deck.push(i, i); });
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    S.symMats = SYMS.map(([, c]) => std(c, { roughness: 0.3, metalness: 0.3, emissive: c, emissiveIntensity: 0.35 }));
    deck.forEach((sym, i) => {
      const c = i % COLS, r = (i / COLS) | 0;
      const g = new THREE.Group();
      const cx = -HX + TS * (c + 0.5), cz = -HZ + TS * (r + 0.5);
      g.position.set(cx, 0, cz);
      const base = mesh(S.baseGeo, S.backMat, false, true); base.position.y = -0.1; g.add(base);
      const sm = mesh(S.geos[SYMS[sym][0]], S.symMats[sym]); sm.position.y = 1.2; sm.scale.setScalar(0.001); g.add(sm);
      scene.add(g);
      S.cards.push({ g, base, sm, sym, i, x: cx, z: cz, up: 0, anim: 0, owner: null, timer: 0, matched: false });
    });
    S.ents = spawnBeans(ctx, (i, n) => [(i - (n - 1) / 2) * 2.4, HZ + 2.4], () => ({ cd: 0, dash: 0, score: 0, first: null, wait: 0 }));
    S.ents.forEach((e) => { e.z = HZ + 2.4; });
    ctx.hud.title('Lật Thẻ Trí Nhớ');
    this.hud();
  },

  hud() { S.ctx.hud.board([...S.ents].sort((a, b) => b.score - a.score).map((e) => ({ color: e.p.color, name: e.p.name, text: `${e.score} cặp` }))); },

  cardAt(x, z) {
    const c = Math.floor((x + HX) / TS), r = Math.floor((z + HZ) / TS);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
    return S.cards[r * COLS + c];
  },

  flip(e, card) {
    const s = S, ctx = s.ctx;
    card.up = 1; card.timer = 0; card.flipper = e; card.shownBy = e;
    ctx.sfx.pass(); s.fx.ring(card.x, card.z, '#ffffff', 3, 0.3, 0.3);
    // mọi bot "nhìn thấy" lá bài này (xác suất theo trình độ)
    for (const o of s.ents) if (o.p.bot) { o.mem = o.mem || {}; if (Math.random() < 0.55 + 0.45 * o.p.skill) o.mem[card.i] = card.sym; }
    if (e.first === null) { e.first = card; card.flipT = s.time; return; }
    const a = e.first; e.first = null;
    if (a.sym === card.sym) {
      for (const c of [a, card]) { c.matched = true; c.owner = e; c.base.material = std(e.p.color, { roughness: 0.35, emissive: e.p.color, emissiveIntensity: 0.55 }); }
      e.score++; s.pairs++; ctx.sfx.gem(); ctx.vibrate(e.p.id, 100);
      s.fx.burst(a.x, 1.5, a.z, e.p.color, 14, 8); s.fx.burst(card.x, 1.5, card.z, e.p.color, 14, 8);
      for (const o of s.ents) if (o.mem) { delete o.mem[a.i]; delete o.mem[card.i]; }
      this.hud();
    } else { a.timer = card.timer = 1.1; a.mis = card.mis = true; ctx.sfx.crack(); }
  },

  think(dt) {
    const s = S;
    for (const e of s.ents) {
      const p = e.p;
      if (!p.bot || !tick(p, dt, 0.1)) continue;
      const here = this.cardAt(e.x, e.z);
      e.mem = e.mem || {};
      for (const k of Object.keys(e.mem)) if (s.cards[k].matched || (Math.random() < 0.0015 * (1.3 - p.skill))) delete e.mem[k]; // quên dần
      let target = null;
      const down = (c) => !c.matched && !c.up && !c.mis;
      if (e.first) {
        const m = Object.keys(e.mem).map(Number).find((k) => k !== e.first.i && s.cards[k].sym === e.first.sym && down(s.cards[k]));
        if (m !== undefined) target = s.cards[m];
      } else {
        const seen = {};
        for (const k of Object.keys(e.mem).map(Number)) { if (!down(s.cards[k])) continue; const sym = e.mem[k]; if (seen[sym] !== undefined) { target = s.cards[seen[sym]]; break; } seen[sym] = k; }
      }
      if (!target) {
        const pool = s.cards.filter((c) => down(c) && !(e.first && c === e.first) && e.mem[c.i] === undefined);
        const all = pool.length ? pool : s.cards.filter((c) => down(c) && !(e.first && c === e.first));
        if (e.target && down(e.target) && all.includes(e.target)) target = e.target;
        else { let bd = 1e9; for (const c of all) { const d = Math.hypot(c.x - e.x, c.z - e.z) + Math.random() * 9; if (d < bd) { bd = d; target = c; } } }
      }
      e.target = target;
      if (!target) { idle(p); continue; }
      const d = Math.hypot(target.x - e.x, target.z - e.z);
      if (here === target && d < 1.1) { idle(p); if (e.wait <= 0 && chance(p, 0.9)) pulse(p, 'a'); }
      else {
        // chống kẹt đầu đối đầu: nếu chạy chậm quá lâu thì đổi hướng vòng qua bên cạnh
        const sp = Math.hypot(e.vx, e.vz);
        e.stuck = sp < 1.2 ? (e.stuck || 0) + 1 : 0;
        if (e.stuck > 4) { e.side = (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random() * 0.8); e.stuck = -6; }
        if (e.stuck < 0) e.stuck++; else if (e.stuck === 0 && Math.random() < 0.3) e.side = 0;
        const ux = (target.x - e.x) / (d || 1), uz = (target.z - e.z) / (d || 1), sd = e.side || 0;
        stick(p, ux - uz * sd, uz + ux * sd);
      }
    }
  },

  update(dt) {
    const s = S, ctx = s.ctx;
    s.time += dt; s.t += dt; s.fx.update(dt);
    ctx.hud.timer(fmtTime(Math.max(0, DURATION - s.t)));
    for (const e of s.ents) {
      e.cd -= dt; e.dash -= dt; e.wait -= dt;
      if (e.first && s.time - e.first.flipT > 6) { e.first.up = 0; e.first = null; }   // quá lâu không lật lá thứ hai thì úp lại
      stepBean(e, dt, { acc: 52, drag: 5.4, max: e.dash > 0 ? 13 : 8.6 });
      if (e.p.press.a) {
        const c = this.cardAt(e.x, e.z);
        if (c && !c.matched && !c.up && !c.mis && e.wait <= 0) { this.flip(e, c); e.wait = 0.25; }
        else if (e.cd <= 0) { e.vx += e.fx * 9; e.vz += e.fz * 9; e.dash = 0.2; e.cd = 1.2; }
      }
    }
    pushApart(s.ents, 0.62, 0.5);
    for (const e of s.ents) clampRect(e, HX + 1.5, HZ + 3.5);
    for (const c of s.cards) {
      if (c.up && !c.matched && c.timer > 0) {
        c.timer -= dt;
        if (c.timer <= 0) { c.up = 0; c.mis = false; }
      }
      c.anim += (c.up - c.anim) * Math.min(1, dt * 10);
      const k = Math.max(0.001, c.anim);
      c.sm.scale.setScalar(k); c.sm.rotation.y += dt * 1.6 * c.anim; c.sm.position.y = 0.4 + 0.9 * c.anim + Math.sin(s.time * 3 + c.i) * 0.06 * c.anim;
      if (!c.matched) c.base.material = c.anim > 0.5 ? s.faceMat : s.backMat;
      if (c.matched) c.sm.scale.setScalar(1);
    }
    for (const e of s.ents) showBean(e, dt, s.time);
    if (Math.floor(s.t * 3) !== s.lastHud) { s.lastHud = Math.floor(s.t * 3); this.hud(); }
    if (!s.over && (s.pairs >= SYMS.length || s.t >= DURATION)) {
      s.over = true;
      const rank = [...s.ents].sort((a, b) => b.score - a.score);
      ctx.finish(rank.map((e) => ({ id: e.p.id, text: `${e.score} cặp` })));
    }
  },

  dispose() {
    if (S) {
      S.fx.dispose(); S.baseGeo.dispose(); S.backMat.dispose(); S.faceMat.dispose(); Object.values(S.geos).forEach((g) => g.dispose()); S.symMats.forEach((m) => m.dispose());
      for (const c of S.cards) if (c.matched && c.base.material) c.base.material.dispose();
      S = null;
    }
  },
};
