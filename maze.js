import * as THREE from 'three';
import { rand, clamp, fmtTime, makeFX } from '/js/util.js';
import { std, glow, mesh, T } from '/js/gfx.js';
import { setupScene, spawnBeans, stepBean, pushApart, showBean, circleRect } from '/js/party.js';
import { tick, pulse, stick, idle, toward, nearest, wobble, chance, bfsStep } from '/js/bots.js';

const W = 19, H = 11, CS = 1.7, DURATION = 75;
const SLOTS = [[9, 1], [9, 9], [1, 5], [17, 5], [5, 3], [13, 7], [5, 7], [13, 3]];
const PELLETS = [[1, 1], [17, 1], [1, 9], [17, 9]];
let S = null;
const wx = (c) => (c - (W - 1) / 2) * CS, wz = (r) => (r - (H - 1) / 2) * CS;
const cellOf = (x, z) => [clamp(Math.round(x / CS + (W - 1) / 2), 0, W - 1), clamp(Math.round(z / CS + (H - 1) / 2), 0, H - 1)];

function carve() {
  const solid = new Array(W * H).fill(true);
  const open = (c, r) => { solid[c + r * W] = false; };
  const seen = new Set(), st = [[1, 1]];
  open(1, 1); seen.add(1 + W);
  while (st.length) {
    const [c, r] = st[st.length - 1];
    const nb = [[2, 0], [-2, 0], [0, 2], [0, -2]].map(([a, b]) => [c + a, r + b]).filter(([x, y]) => x > 0 && y > 0 && x < W - 1 && y < H - 1 && !seen.has(x + y * W));
    if (!nb.length) { st.pop(); continue; }
    const [nc, nr] = nb[Math.floor(Math.random() * nb.length)];
    open((c + nc) / 2, (r + nr) / 2); open(nc, nr); seen.add(nc + nr * W); st.push([nc, nr]);
  }
  for (let r = 1; r < H - 1; r++) for (let c = 1; c < W - 1; c++) { // khoét thêm cho có vòng, đỡ bí
    if (solid[c + r * W] && (c + r) % 2 === 1 && Math.random() < 0.28) open(c, r);
  }
  return solid;
}

export default {
  id: 'maze',
  name: 'Mê Cung Ăn Chấm',
  emoji: '👾',
  color: '#ffd23f',
  cat: 'fight',
  bots: 4,
  tag: '1-8 người · 75 giây',
  desc: 'Chạy trong mê cung ăn thật nhiều chấm vàng. Tránh các con ma đỏ: chạm vào sẽ choáng và mất điểm. Ăn chấm lớn ở 4 góc để ma hóa xanh, rồi húc ma để ăn +5! Bấm A để chạy nhanh.',
  cfg: { a: 'CHẠY NHANH', b: '', gyro: false, hideStick: false, hint: 'Ăn chấm · né ma · ăn chấm lớn rồi săn ma' },

  init(ctx) {
    const scene = ctx.scene;
    setupScene(ctx, { bg: 0x07061a, size: 30, cam: [0, 33, 17], look: [0, 0, 0.8], light: { sun: 1.9, hemi: 0.7, color: 0xdde0ff } });
    const floor = mesh(new THREE.BoxGeometry(W * CS + 2, 1, H * CS + 2), std(0xffffff, { map: T.grid(26, 'rgba(120,130,255,.35)'), roughness: 0.5, metalness: 0.4 }), false, true);
    floor.position.y = -0.5; scene.add(floor);
    const solid = carve();
    S = { ctx, fx: makeFX(THREE, scene), solid, dots: new Array(W * H).fill(null), ghosts: [], t: 0, time: 0, over: false, lastHud: -1, left: 0, scared: 0 };
    S.wallGeo = new THREE.BoxGeometry(CS, 1.6, CS); S.wallMat = std(0x2b2f78, { roughness: 0.35, metalness: 0.5, emissive: 0x1a1e66, emissiveIntensity: 0.7 });
    S.capGeo = new THREE.BoxGeometry(CS * 0.9, 0.12, CS * 0.9); S.capMat = glow(0x6f7bff, 1.8);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (solid[c + r * W]) {
      const m = mesh(S.wallGeo, S.wallMat, true, true); m.position.set(wx(c), 0.8, wz(r)); scene.add(m);
      const cp = mesh(S.capGeo, S.capMat, false); cp.position.set(wx(c), 1.62, wz(r)); scene.add(cp);
    }
    S.dotGeo = new THREE.SphereGeometry(0.17, 8, 6); S.dotMat = glow(0xffe36a, 2.2);
    S.pelGeo = new THREE.SphereGeometry(0.42, 12, 10); S.pelMat = glow(0xff9ad8, 3);
    const isPel = (c, r) => PELLETS.some(([a, b]) => a === c && b === r);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      if (solid[c + r * W] || SLOTS.some(([a, b]) => a === c && b === r) || (c === 9 && r === 5)) continue;
      const pel = isPel(c, r);
      const m = mesh(pel ? S.pelGeo : S.dotGeo, pel ? S.pelMat : S.dotMat, false); m.position.set(wx(c), 0.6, wz(r)); scene.add(m);
      S.dots[c + r * W] = { m, pel }; S.left++;
    }
    S.ghostGeo = new THREE.CapsuleGeometry(0.5, 0.35, 4, 12); S.eyeGeo = new THREE.SphereGeometry(0.13, 8, 6);
    S.ghostMat = std(0xff4d5e, { roughness: 0.4, emissive: 0xaa1a2a, emissiveIntensity: 0.5 }); S.scaredMat = std(0x3a6bff, { roughness: 0.4, emissive: 0x1a3aff, emissiveIntensity: 0.8 });
    S.eyeMat = std(0xffffff);
    const ng = clamp(2 + Math.ceil(ctx.players.length / 3), 2, 4);
    for (let i = 0; i < ng; i++) {
      const g = new THREE.Group();
      const body = mesh(S.ghostGeo, S.ghostMat); body.position.y = 0.85; g.add(body);
      for (const sx of [-1, 1]) { const e = mesh(S.eyeGeo, S.eyeMat, false); e.position.set(sx * 0.2, 1.0, 0.4); g.add(e); }
      scene.add(g);
      S.ghosts.push({ g, body, x: wx(9), z: wz(5), c: 9, r: 5, tc: 9, tr: 5, scared: 0, wait: 1.5 + i * 2, mode: i });
    }
    S.ents = spawnBeans(ctx, (i) => { const [c, r] = SLOTS[i % SLOTS.length]; return [wx(c), wz(r)]; }, () => ({ score: 0, cd: 0, dash: 0, stun: 0, inv: 0, ghosts: 0 }));
    ctx.hud.title('Mê Cung Ăn Chấm');
    this.hud();
  },

  hud() { S.ctx.hud.board([...S.ents].sort((a, b) => b.score - a.score).map((e) => ({ color: e.p.color, name: e.p.name, text: `${e.score}${e.stun > 0 ? ' 😵' : ''}` }))); },

  blockedCell(c, r) { return S.solid[c + r * W]; },

  think(dt) {
    const s = S;
    for (const e of s.ents) {
      const p = e.p;
      if (!p.bot || !tick(p, dt, 0.08)) continue;
      if (e.stun > 0) { idle(p); continue; }
      const [c, r] = cellOf(e.x, e.z);
      const danger = s.ghosts.filter((g) => g.scared <= 0 && g.wait <= 0);
      const nearG = nearest(danger, e.x, e.z);
      const near = (g, k) => Math.abs(g.c - k[0]) + Math.abs(g.r - k[1]) <= 1;
      let step = null;
      if (nearG && nearG.d < 6.2 && chance(p, 0.95)) {
        step = bfsStep(W, H, c, r, (cc, rr) => danger.every((g) => Math.hypot(wx(cc) - g.x, wz(rr) - g.z) > 7), (cc, rr) => s.solid[cc + rr * W] || danger.some((g) => near(g, [cc, rr])), 12);
        if (!step) { const dx = e.x - nearG.o.x, dz = e.z - nearG.o.z; stick(p, dx, dz); continue; }
        if (e.cd <= 0 && nearG.d < 3.4) pulse(p, 'a');
      } else {
        const scaredG = s.ghosts.filter((g) => g.scared > 1.2 && g.wait <= 0);
        const sg = nearest(scaredG, e.x, e.z);
        if (sg && sg.d < 9 && chance(p, 0.8)) { step = bfsStep(W, H, c, r, (cc, rr) => cc === sg.o.c && rr === sg.o.r, (cc, rr) => s.solid[cc + rr * W], 14); }
        if (!step) {
          const taken = new Set(s.ents.filter((o) => o !== e && o.tcell).map((o) => o.tcell));
          step = bfsStep(W, H, c, r, (cc, rr) => !!s.dots[cc + rr * W] && !(taken.has(cc + rr * W) && Math.random() < 0.6), (cc, rr) => s.solid[cc + rr * W] || danger.some((g) => near(g, [cc, rr])));
          if (step) e.tcell = step[0] + step[1] * W;
          if (!step) step = bfsStep(W, H, c, r, (cc, rr) => !!s.dots[cc + rr * W], (cc, rr) => s.solid[cc + rr * W]);
        }
      }
      if (!step) { idle(p); continue; }
      toward(p, e, wx(step[0]), wz(step[1]), 1, 0.12);
    }
  },

  update(dt) {
    const s = S, ctx = s.ctx;
    s.time += dt; s.t += dt; s.fx.update(dt);
    ctx.hud.timer(fmtTime(Math.max(0, DURATION - s.t)));
    for (const e of s.ents) {
      e.cd -= dt; e.dash -= dt; e.stun -= dt; e.inv -= dt;
      const stunned = e.stun > 0;
      stepBean(e, dt, { acc: stunned ? 0 : 58, drag: 6.2, max: e.dash > 0 ? 10.5 : 6.6, lock: stunned });
      if (!stunned && e.p.press.a && e.cd <= 0) { e.vx += e.fx * 6; e.vz += e.fz * 6; e.dash = 0.6; e.cd = 3; ctx.sfx.dash(); }
      const [c, r] = cellOf(e.x, e.z);
      for (let rr = r - 1; rr <= r + 1; rr++) for (let cc = c - 1; cc <= c + 1; cc++) {
        if (cc < 0 || rr < 0 || cc >= W || rr >= H || !s.solid[cc + rr * W]) continue;
        circleRect(e, wx(cc), wz(rr), CS / 2, CS / 2, 0.55);
      }
    }
    pushApart(s.ents, 0.55, 0.4);

    // ăn chấm
    for (const e of s.ents) {
      const [c, r] = cellOf(e.x, e.z), d = s.dots[c + r * W];
      if (!d || e.stun > 0) continue;
      if (Math.hypot(e.x - wx(c), e.z - wz(r)) > 0.9) continue;
      ctx.scene.remove(d.m); s.dots[c + r * W] = null; s.left--;
      if (d.pel) {
        e.score += 3; ctx.sfx.gem(); ctx.shake(0.25); s.fx.ring(wx(c), wz(r), '#ff9ad8', 6, 0.6);
        for (const g of s.ghosts) { g.scared = 7; }
      } else { e.score += 1; ctx.sfx.coin(); }
      this.hud();
    }

    // ma
    for (const g of s.ghosts) {
      g.wait -= dt;
      g.scared = Math.max(0, g.scared - dt);
      g.body.material = g.scared > 0 && (g.scared > 2 || Math.floor(s.time * 6) % 2) ? s.scaredMat : s.ghostMat;
      if (g.wait > 0) { g.g.position.set(g.x, 0, g.z); g.g.visible = Math.floor(s.time * 10) % 2 === 0; continue; }
      g.g.visible = true;
      const sp = g.scared > 0 ? 3.2 : 4.4 + Math.min(1.4, s.t * 0.02);
      const tx = wx(g.tc), tz = wz(g.tr), dx = tx - g.x, dz = tz - g.z, d = Math.hypot(dx, dz);
      if (d < 0.12) {
        g.c = g.tc; g.r = g.tr; g.x = tx; g.z = tz;
        const tgt = nearest(s.ents.filter((e) => e.stun <= 0 && e.inv <= 0), g.x, g.z);
        let next = null;
        if (g.scared > 0 && tgt) {
          const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => [g.c + a, g.r + b]).filter(([a, b]) => !s.solid[a + b * W]);
          next = opts.sort((p, q) => Math.hypot(wx(q[0]) - tgt.o.x, wz(q[1]) - tgt.o.z) - Math.hypot(wx(p[0]) - tgt.o.x, wz(p[1]) - tgt.o.z))[0];
        } else if (tgt && (g.mode % 2 === 0 || tgt.d < 10)) {
          const [pc, pr] = cellOf(tgt.o.x, tgt.o.z);
          const st = bfsStep(W, H, g.c, g.r, (cc, rr) => cc === pc && rr === pr, (cc, rr) => s.solid[cc + rr * W]);
          if (st) next = [st[0], st[1]];
        }
        if (!next) { const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => [g.c + a, g.r + b]).filter(([a, b]) => !s.solid[a + b * W]); next = opts[Math.floor(Math.random() * opts.length)]; }
        if (next) { g.tc = next[0]; g.tr = next[1]; }
      } else { g.x += (dx / d) * sp * dt; g.z += (dz / d) * sp * dt; g.g.rotation.y = Math.atan2(dx, dz); }
      g.g.position.set(g.x, Math.abs(Math.sin(s.time * 8 + g.mode)) * 0.1, g.z);
      for (const e of s.ents) {
        if (e.inv > 0 || Math.hypot(e.x - g.x, e.z - g.z) > 1.0) continue;
        if (g.scared > 0) {
          e.score += 5; e.ghosts++; ctx.sfx.goal(); ctx.vibrate(e.p.id, 100);
          s.fx.burst(g.x, 1, g.z, '#6f9bff', 20, 10); s.fx.ring(g.x, g.z, '#ffffff', 5, 0.5);
          g.x = wx(9); g.z = wz(5); g.c = g.tc = 9; g.r = g.tr = 5; g.scared = 0; g.wait = 3;
        } else {
          const lost = Math.min(3, e.score); e.score -= lost; e.stun = 1.4; e.inv = 2.4;
          const dd = Math.hypot(e.x - g.x, e.z - g.z) || 1; e.vx = ((e.x - g.x) / dd) * 9; e.vz = ((e.z - g.z) / dd) * 9;
          ctx.sfx.boom(); ctx.shake(0.4); ctx.vibrate(e.p.id, 250); s.fx.burst(e.x, 1, e.z, '#ff4d5e', 14, 9);
        }
        this.hud(); break;
      }
    }
    for (let i = 0; i < s.dots.length; i++) { const d = s.dots[i]; if (d && d.pel) d.m.scale.setScalar(1 + Math.sin(s.time * 7) * 0.2); }
    for (const e of s.ents) {
      showBean(e, dt, s.time);
      e.g.visible = e.inv <= 0 || e.stun > 0 || Math.floor(s.time * 14) % 2 === 0;
      e.g.rotation.z = e.stun > 0 ? Math.sin(s.time * 30) * 0.3 : 0;
    }
    if (Math.floor(s.t * 3) !== s.lastHud) { s.lastHud = Math.floor(s.t * 3); this.hud(); }
    if (!s.over && (s.t >= DURATION || s.left <= 0)) {
      s.over = true;
      const rank = [...s.ents].sort((a, b) => b.score - a.score);
      ctx.finish(rank.map((e) => ({ id: e.p.id, text: `${e.score} điểm${e.ghosts ? ` · ăn ${e.ghosts} ma` : ''}` })));
    }
  },

  dispose() {
    if (S) {
      S.fx.dispose();
      [S.wallGeo, S.capGeo, S.dotGeo, S.pelGeo, S.ghostGeo, S.eyeGeo].forEach((g) => g.dispose());
      [S.wallMat, S.capMat, S.dotMat, S.pelMat, S.ghostMat, S.scaredMat, S.eyeMat].forEach((m) => m.dispose());
      S = null;
    }
  },
};
