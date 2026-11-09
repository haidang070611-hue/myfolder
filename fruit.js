import * as THREE from 'three';
import { clamp, rand, fmtTime, makeFX } from '/js/util.js';
import { std, glow, mesh, T } from '/js/gfx.js';
import { setupScene, spawnBeans, pushApart, showBean } from '/js/party.js';
import { tick, pulse, stick, idle, chance } from '/js/bots.js';

const HX = 10.5, DURATION = 45, TOP = 17;
const KINDS = { apple: [0xe8333f, 1, 0.45], orange: [0xff9a1f, 1, 0.5], gold: [0xffd23f, 3, 0.55], bomb: [0x16161c, -3, 0.5] };
let S = null;

export default {
  id: 'fruit',
  name: 'Hứng Trái Cây',
  emoji: '🍎',
  cat: 'party',
  bots: 4,
  color: '#ff8a3d',
  tag: '1-8 người · 45 giây',
  desc: 'Trái cây rơi từ trên trời! Chạy trái/phải để hứng bằng giỏ trên đầu. Táo, cam +1, trái vàng +3. Bom đen rơi trúng giỏ: -3 điểm và bị choáng.',
  cfg: { a: 'LAO', b: '', gyro: false, hideStick: false, hint: 'Gạt trái/phải để hứng · A lao nhanh · tránh bom đen' },

  init(ctx) {
    const scene = ctx.scene;
    setupScene(ctx, { bg: 0x8fc4f0, sky: [0x3a86e0, 0xcfe8ff, 0x7a9a6a, [0.3, 0.6, 0.7]], size: 28, cam: [0, 8.5, 25], look: [0, 6.2, 0], fogNear: 70, fogFar: 160, light: { sun: 3, hemi: 0.75, dir: [0.4, 1, 0.9] } });
    const ground = mesh(new THREE.BoxGeometry(HX * 2 + 14, 1, 14), std(0xffffff, { map: T.grass(14), roughness: 1, envMapIntensity: 0.1 }), false, true);
    ground.position.set(0, -0.5, -1); scene.add(ground);
    // hàng cây phía sau
    const trunk = std(0x6b4a2b, { roughness: 1 }), leaf = std(0x2b8a45, { roughness: 0.9 });
    for (let i = -6; i <= 6; i++) { const x = i * 4.2 + ((i * 7) % 3); const t = mesh(new THREE.CylinderGeometry(0.4, 0.55, 3.4, 8), trunk); t.position.set(x, 1.7, -7); scene.add(t); const l = mesh(new THREE.SphereGeometry(2.4 + ((i * 5) % 3) * 0.3, 14, 10), leaf); l.position.set(x, 4.6, -7); scene.add(l); }
    S = { ctx, fx: makeFX(THREE, scene), items: [], t: 0, time: 0, spawnT: 0.5, bombT: 4, over: false, lastHud: -1 };
    S.geo = new THREE.SphereGeometry(1, 16, 12);
    S.mats = {}; for (const k in KINDS) S.mats[k] = std(KINDS[k][0], { roughness: k === 'bomb' ? 0.35 : 0.3, metalness: k === 'gold' ? 0.8 : k === 'bomb' ? 0.6 : 0.05, emissive: k === 'gold' ? 0x6a4a00 : 0x000000, emissiveIntensity: 0.9 });
    S.ents = spawnBeans(ctx, (i, n) => [(i - (n - 1) / 2) * 2.6, 0], () => ({ score: 0, dash: 0, cd: 0, stun: 0, catches: 0 }));
    const basketM = std(0x9a6a36, { map: T.noise('weave', [150, 104, 56], 50, 3), roughness: 0.9 });
    for (const e of S.ents) {
      e.fx = 0; e.fz = 1; e.ang = 0;
      const b = new THREE.Group();
      const bowl = mesh(new THREE.CylinderGeometry(1.15, 0.8, 0.7, 18, 1, true), basketM); bowl.material.side = THREE.DoubleSide;
      const rim = mesh(new THREE.TorusGeometry(1.15, 0.08, 6, 24), std(0x6a4520), false); rim.rotation.x = Math.PI / 2; rim.position.y = 0.35;
      b.add(bowl, rim); b.position.y = 2.5; e.g.add(b); e.basket = b;
    }
    ctx.hud.title('Hứng Trái Cây');
    this.hud();
  },

  hud() { S.ctx.hud.board([...S.ents].sort((a, b) => b.score - a.score).map((e) => ({ color: e.p.color, name: e.p.name, text: `${e.score}${e.stun > 0 ? ' 😵' : ''}` }))); },

  spawn(kind) {
    const s = S, k = KINDS[kind];
    const m = new THREE.Mesh(s.geo, s.mats[kind]); m.castShadow = true;
    const x = rand(-HX + 0.8, HX - 0.8), r = k[2];
    m.scale.setScalar(r);
    if (kind === 'bomb') { const f = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 6), std(0x5a4632), false); f.position.y = 1.2; f.scale.setScalar(1 / r * 0.6); m.add(f); const sp = mesh(new THREE.SphereGeometry(0.18, 8, 6), glow(0xffb020, 4), false); sp.position.y = 1.55; sp.scale.setScalar(1 / r * 0.6); m.add(sp); }
    m.position.set(x, TOP, rand(-0.3, 0.3));
    s.ctx.scene.add(m);
    s.items.push({ m, x, y: TOP, vy: -rand(4, 7) * (1 + s.t * 0.012), kind, r });
  },

  update(dt) {
    const s = S, ctx = s.ctx;
    s.time += dt; s.t += dt; s.fx.update(dt);
    ctx.hud.timer(fmtTime(Math.max(0, DURATION - s.t)));
    s.spawnT -= dt; s.bombT -= dt;
    if (s.spawnT <= 0) { s.spawnT = clamp(0.62 - s.t * 0.006, 0.28, 0.62) / Math.max(1, Math.sqrt(s.ents.length) * 0.7); this.spawn(Math.random() < 0.1 ? 'gold' : Math.random() < 0.5 ? 'apple' : 'orange'); }
    if (s.bombT <= 0) { s.bombT = clamp(2.2 - s.t * 0.03, 0.9, 2.2) / Math.max(1, s.ents.length * 0.25); this.spawn('bomb'); }

    for (const e of s.ents) {
      e.cd -= dt; e.dash -= dt; e.stun -= dt;
      const lock = e.stun > 0;
      const ix = lock ? 0 : e.p.input.x;
      e.vx += ix * 60 * dt; e.vx *= Math.exp(-6 * dt);
      const mx = e.dash > 0 ? 17 : 9.5;
      e.vx = clamp(e.vx, -mx, mx);
      e.x = clamp(e.x + e.vx * dt, -HX, HX);
      if (!lock && e.p.press.a && e.cd <= 0) { e.vx += (e.p.input.x || (e.vx >= 0 ? 1 : -1)) * 12; e.dash = 0.25; e.cd = 1.4; ctx.sfx.dash(); s.fx.ring(e.x, 0, '#ffffff', 2, 0.25); }
    }
    pushApart(s.ents, 0.6, 0.3);
    for (const e of s.ents) { e.z = 0; e.fx = e.vx * 0.04; e.fz = 1; }

    for (let i = s.items.length - 1; i >= 0; i--) {
      const it = s.items[i];
      it.vy -= 3 * dt; it.y += it.vy * dt;
      it.m.position.set(it.x, it.y, it.m.position.z); it.m.rotation.z += dt * 2; it.m.rotation.x += dt;
      let gone = false;
      if (it.y < 3.1 && it.y > 1.5) for (const e of s.ents) {
        if (e.stun > 0 && it.kind === 'bomb') continue;
        if (Math.abs(it.x - e.x) < 1.15 + it.r * 0.4) {
          const v = KINDS[it.kind][1];
          if (it.kind === 'bomb') { e.score = Math.max(0, e.score + v); e.stun = 1.1; ctx.sfx.boom(); ctx.shake(0.45); ctx.vibrate(e.p.id, 250); s.fx.burst(e.x, 2.8, 0, '#ff7a2a', 20, 10); }
          else { e.score += v; e.catches++; if (v === 3) ctx.sfx.gem(); else ctx.sfx.coin(); ctx.vibrate(e.p.id, 20); s.fx.burst(e.x, 2.8, 0, it.kind === 'gold' ? '#ffd23f' : '#ffffff', 6, 5); e.basket.scale.y = 0.75; }
          gone = true; this.hud(); break;
        }
      }
      if (!gone && it.y < it.r) { s.fx.burst(it.x, 0.3, 0, it.kind === 'bomb' ? '#ff7a2a' : '#ffd0a0', 6, 5); gone = true; if (it.kind === 'bomb') ctx.sfx.crack(); }
      if (gone) { ctx.scene.remove(it.m); s.items.splice(i, 1); }
    }
    for (const e of s.ents) {
      showBean(e, dt, s.time);
      e.g.rotation.y = 0; e.g.rotation.z = e.stun > 0 ? Math.sin(s.time * 30) * 0.2 : 0;
      e.basket.scale.y += (1 - e.basket.scale.y) * Math.min(1, dt * 12);
    }
    if (Math.floor(s.t * 3) !== s.lastHud) { s.lastHud = Math.floor(s.t * 3); this.hud(); }
    if (!s.over && s.t >= DURATION) {
      s.over = true;
      ctx.finish([...s.ents].sort((a, b) => b.score - a.score).map((e) => ({ id: e.p.id, text: `${e.score} điểm · hứng ${e.catches}` })));
    }
  },

  think(dt) {
    const s = S;
    for (const e of s.ents) {
      const p = e.p;
      if (!p.bot || !tick(p, dt, 0.08)) continue;
      if (e.stun > 0) { idle(p); continue; }
      let best = null, bs = -1e9;
      for (const it of s.items) {
        if (it.kind === 'bomb') continue;
        const tFall = Math.max(0.05, (it.y - 2.4) / Math.abs(it.vy));
        const need = Math.abs(it.x - e.x) / 9.5;
        if (need > tFall + 0.15) continue;   // không kịp tới
        const sc = (it.kind === 'gold' ? 6 : 0) - tFall;
        if (sc > bs) { bs = sc; best = it; }
      }
      let tx = best ? best.x : e.x;
      for (const it of s.items) if (it.kind === 'bomb' && it.y < 9 && Math.abs(it.x - tx) < 1.8) { tx += (tx >= it.x ? 1 : -1) * 2.2; }
      const dx = clamp(tx - e.x, -3, 3) / 3;
      stick(p, Math.abs(dx) < 0.08 ? 0 : dx, 0);
    }
  },

  dispose() { if (S) { S.fx.dispose(); S.geo.dispose(); for (const k in S.mats) S.mats[k].dispose(); S = null; } },
};
