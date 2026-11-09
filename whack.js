import * as THREE from 'three';
import { clamp, rand, fmtTime, makeFX } from '/js/util.js';
import { std, glow, mesh, T } from '/js/gfx.js';
import { setupScene, spawnBeans, stepBean, pushApart, clampRect, showBean } from '/js/party.js';
import { tick, pulse, stick, idle, nearest, chance } from '/js/bots.js';

const COLS = 4, ROWS = 3, GAP = 5.2, DURATION = 45;
let S = null;

export default {
  id: 'whack',
  name: 'Đập Chuột Chũi',
  emoji: '🔨',
  cat: 'party',
  bots: 4,
  color: '#c98a4b',
  tag: '1-8 người · 45 giây',
  desc: 'Chuột chũi thò đầu lên từ các hố! Chạy tới và bấm A để đập: chuột nâu +1, chuột vàng +3. Đừng đập chuột bom: mất điểm và bị choáng.',
  cfg: { a: 'ĐẬP!', b: '', gyro: false, hideStick: false, hint: 'Chạy tới hố có chuột · A để đập · tránh chuột bom' },

  init(ctx) {
    const scene = ctx.scene;
    setupScene(ctx, { bg: 0x1d2a18, sky: [0x4a92ee, 0xd6ecff, 0x6e7a5a, [0.4, 0.55, 0.7]], size: 24, cam: [0, 27, 16], look: [0, 0, 1.5], fogNear: 60, fogFar: 140, light: { sun: 3, hemi: 0.7 } });
    const ground = mesh(new THREE.BoxGeometry(COLS * GAP + 6, 1, ROWS * GAP + 6), std(0xffffff, { map: T.grass(10), roughness: 1, envMapIntensity: 0.1 }), false, true);
    ground.position.y = -0.5; scene.add(ground);
    const dirt = std(0x4a2f1b, { map: T.noise('dirt', [78, 52, 30], 40, 3), roughness: 1, envMapIntensity: 0.1 });
    const furM = std(0x8a5a35, { roughness: 0.9 }), goldM = std(0xffc83a, { metalness: 0.7, roughness: 0.3, emissive: 0x5a3a00, emissiveIntensity: 0.8 }), bombM = std(0x23232a, { roughness: 0.4, metalness: 0.5 });
    const eyeM = std(0xffffff, { roughness: 0.2 }), pupM = std(0x000000);
    S = { ctx, fx: makeFX(THREE, scene), holes: [], t: 0, time: 0, spawnT: 1.2, over: false, lastHud: -1 };
    for (let i = 0; i < COLS; i++) for (let j = 0; j < ROWS; j++) {
      const x = (i - (COLS - 1) / 2) * GAP, z = (j - (ROWS - 1) / 2) * GAP;
      const mound = mesh(new THREE.CylinderGeometry(1.9, 2.3, 0.4, 24), dirt, false, true); mound.position.set(x, 0.1, z); scene.add(mound);
      const hole = mesh(new THREE.CircleGeometry(1.35, 24), new THREE.MeshBasicMaterial({ color: 0x050302 }), false); hole.rotation.x = -Math.PI / 2; hole.position.set(x, 0.32, z); scene.add(hole);
      const m = new THREE.Group();
      const body = mesh(new THREE.CapsuleGeometry(0.85, 0.7, 6, 14), furM); body.position.y = 0.9;
      const nose = mesh(new THREE.SphereGeometry(0.2, 10, 8), std(0xff8fa8), false); nose.position.set(0, 1.0, 0.82);
      for (const sx of [-1, 1]) { const e = mesh(new THREE.SphereGeometry(0.16, 10, 8), eyeM, false); e.position.set(sx * 0.32, 1.35, 0.68); const p = mesh(new THREE.SphereGeometry(0.07, 8, 6), pupM, false); p.position.set(sx * 0.32, 1.35, 0.82); m.add(e, p); }
      m.add(body, nose); m.position.set(x, -2.4, z); m.visible = false;
      scene.add(m);
      S.holes.push({ x, z, m, body, kind: 'mole', st: 'down', t: 0, y: -2.4, mats: { mole: furM, gold: goldM, bomb: bombM } });
    }
    S.ents = spawnBeans(ctx, (i, n) => [(i - (n - 1) / 2) * 2.6, 9.5], () => ({ score: 0, cd: 0, stun: 0, whacks: 0 }));
    ctx.hud.title('Đập Chuột Chũi');
    this.hud();
  },

  hud() { S.ctx.hud.board([...S.ents].sort((a, b) => b.score - a.score).map((e) => ({ color: e.p.color, name: e.p.name, text: `${e.score}${e.stun > 0 ? ' 😵' : ''}` }))); },

  update(dt) {
    const s = S, ctx = s.ctx;
    s.time += dt; s.t += dt; s.fx.update(dt);
    ctx.hud.timer(fmtTime(Math.max(0, DURATION - s.t)));

    s.spawnT -= dt;
    if (s.spawnT <= 0) {
      s.spawnT = clamp(1.0 - s.t * 0.014, 0.32, 1.0) / Math.max(1, Math.sqrt(s.ents.length) * 0.8);
      const free = s.holes.filter((h) => h.st === 'down');
      if (free.length) {
        const h = free[Math.floor(Math.random() * free.length)];
        const r = Math.random();
        h.kind = r < 0.14 ? 'gold' : r < 0.3 ? 'bomb' : 'mole';
        h.body.material = h.mats[h.kind]; h.st = 'up'; h.t = clamp(1.5 - s.t * 0.012, 0.85, 1.5); h.m.visible = true;
      }
    }
    for (const h of s.holes) {
      const target = h.st === 'up' ? 0.3 : -2.4;
      h.y += (target - h.y) * Math.min(1, dt * (h.st === 'hit' ? 18 : 14));
      h.m.position.y = h.y;
      if (h.st === 'up') { h.t -= dt; if (h.t <= 0) h.st = 'down'; }
      else if (h.st === 'hit') { h.t -= dt; if (h.t <= 0) h.st = 'down'; }
      if (h.st === 'down' && h.y < -2.2) h.m.visible = false;
      if (h.st === 'up') h.m.rotation.y = Math.sin(s.time * 6 + h.x) * 0.25;
    }

    for (const e of s.ents) {
      e.cd -= dt; e.stun -= dt;
      const lock = e.stun > 0;
      stepBean(e, dt, { acc: lock ? 0 : 56, drag: 5.5, max: 8.6, lock });
      if (!lock && e.p.press.a && e.cd <= 0) {
        e.cd = 0.38;
        let best = null, bd = 2.7;
        for (const h of s.holes) { if (h.st !== 'up') continue; const d = Math.hypot(h.x - e.x, h.z - e.z); if (d < bd) { bd = d; best = h; } }
        s.fx.ring(e.x + e.fx * 1.2, e.z + e.fz * 1.2, '#ffffff', 2, 0.25);
        if (best) {
          best.st = 'hit'; best.t = 0.25;
          if (best.kind === 'bomb') { e.score = Math.max(0, e.score - 2); e.stun = 1.0; ctx.sfx.boom(); ctx.shake(0.4); ctx.vibrate(e.p.id, 250); s.fx.burst(best.x, 1.2, best.z, '#ff7a2a', 18, 10); }
          else { const v = best.kind === 'gold' ? 3 : 1; e.score += v; e.whacks++; if (v === 3) ctx.sfx.gem(); else ctx.sfx.kick(); ctx.vibrate(e.p.id, 40); s.fx.burst(best.x, 1.6, best.z, best.kind === 'gold' ? '#ffd23f' : '#c98a4b', 12, 8); }
          this.hud();
        } else ctx.sfx.dash();
      }
    }
    pushApart(s.ents, 0.62, 0.4);
    for (const e of s.ents) { clampRect(e, COLS * GAP / 2 + 1, ROWS * GAP / 2 + 3.5); showBean(e, dt, s.time); e.g.rotation.z = e.stun > 0 ? Math.sin(s.time * 30) * 0.25 : 0; }
    if (Math.floor(s.t * 3) !== s.lastHud) { s.lastHud = Math.floor(s.t * 3); this.hud(); }
    if (!s.over && s.t >= DURATION) {
      s.over = true;
      ctx.finish([...s.ents].sort((a, b) => b.score - a.score).map((e) => ({ id: e.p.id, text: `${e.score} điểm · ${e.whacks} cú đập` })));
    }
  },

  think(dt) {
    const s = S;
    for (const e of s.ents) {
      const p = e.p;
      if (!p.bot || !tick(p, dt, 0.09)) continue;
      if (e.stun > 0) { idle(p); continue; }
      const ups = s.holes.filter((h) => h.st === 'up' && h.kind !== 'bomb' && h.t > 0.35);
      let best = null, bs = -1e9;
      for (const h of ups) { const d = Math.hypot(h.x - e.x, h.z - e.z); const sc = (h.kind === 'gold' ? 5 : 0) - d; if (sc > bs) { bs = sc; best = h; } }
      if (!best) { idle(p); continue; }
      const dx = best.x - e.x, dz = best.z - e.z, d = Math.hypot(dx, dz);
      if (d > 1.5) stick(p, dx / d, dz / d); else { idle(p); if (e.cd <= 0 && chance(p, 0.9)) pulse(p, 'a'); }
    }
  },

  dispose() { if (S) { S.fx.dispose(); S = null; } },
};
