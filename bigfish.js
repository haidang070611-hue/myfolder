import * as THREE from 'three';
import { rand, clamp, fmtTime, makeFX } from '/js/util.js';
import { std, glow, mesh, T } from '/js/gfx.js';
import { setupScene, spawnBeans, stepBean, showBean } from '/js/party.js';
import { tick, pulse, stick, idle, wobble, chance } from '/js/bots.js';

const HX = 17, HZ = 10, DURATION = 70;
let S = null;
const radius = (m) => 0.6 * Math.sqrt(m);

export default {
  id: 'bigfish',
  name: 'Cá Lớn Nuốt Cá Bé',
  emoji: '🐟',
  color: '#2ec4ff',
  cat: 'fight',
  bots: 5,
  tag: '1-8 người · 70 giây',
  desc: 'Ăn các hạt sáng để lớn lên. Ai to hơn đủ nhiều có thể NUỐT người nhỏ hơn! Càng to càng chậm. Bấm A để bơi nước rút (tốn một chút cân nặng). Cuối giờ ai nặng nhất thắng.',
  cfg: { a: 'NƯỚC RÚT', b: '', gyro: false, hideStick: false, hint: 'Ăn hạt để lớn · nuốt người nhỏ hơn · chạy khỏi người to hơn' },

  init(ctx) {
    const scene = ctx.scene;
    setupScene(ctx, { bg: 0x051a2e, size: 26, cam: [0, 29, 15], look: [0, 0, 0.5], light: { sun: 2.0, hemi: 0.75, color: 0xcfeaff } });
    const floor = mesh(new THREE.BoxGeometry(HX * 2 + 2, 1, HZ * 2 + 2), std(0xffffff, { map: T.grid(18, 'rgba(46,196,255,.45)'), roughness: 0.3, metalness: 0.6 }), false, true);
    floor.position.y = -0.5; scene.add(floor);
    const rail = glow(0x2ec4ff, 2);
    for (const [x, z, w, d] of [[0, -HZ - 0.6, HX * 2 + 2, 0.25], [0, HZ + 0.6, HX * 2 + 2, 0.25], [-HX - 0.6, 0, 0.25, HZ * 2 + 1.5], [HX + 0.6, 0, 0.25, HZ * 2 + 1.5]]) {
      const m = mesh(new THREE.BoxGeometry(w, 0.5, d), rail, false); m.position.set(x, 0.25, z); scene.add(m);
    }
    S = { ctx, fx: makeFX(THREE, scene), pel: [], t: 0, time: 0, over: false, lastHud: -1, pelT: 0 };
    S.pelGeo = new THREE.SphereGeometry(0.22, 8, 6);
    S.pelMats = [0x7dffb0, 0xffe36a, 0xff8ad8, 0x7ad8ff].map((c) => glow(c, 2.6));
    S.ents = spawnBeans(ctx, (i, n) => { const a = (i / n) * Math.PI * 2; return [Math.cos(a) * 11, Math.sin(a) * 6]; },
      () => ({ mass: 1, cd: 0, dash: 0, eaten: 0, deaths: 0, inv: 1.5 }));
    for (let i = 0; i < 30; i++) this.spawnPellet();
    ctx.hud.title('Cá Lớn Nuốt Cá Bé');
    this.hud();
  },

  hud() { S.ctx.hud.board([...S.ents].sort((a, b) => b.mass - a.mass).map((e) => ({ color: e.p.color, name: e.p.name, text: `${e.mass.toFixed(1)} kg` }))); },

  spawnPellet(x, z) {
    const s = S;
    if (x === undefined) { x = rand(-HX + 1, HX - 1); z = rand(-HZ + 1, HZ - 1); }
    const m = mesh(s.pelGeo, s.pelMats[Math.floor(Math.random() * s.pelMats.length)], false); m.position.set(x, 0.5, z);
    s.ctx.scene.add(m);
    s.pel.push({ m, x, z, ph: Math.random() * 6 });
  },

  think(dt) {
    const s = S;
    for (const e of s.ents) {
      const p = e.p;
      if (!p.bot || !tick(p, dt, 0.09)) continue;
      const r = radius(e.mass);
      let mx = 0, mz = 0, threat = 0, prey = null, pd = 1e9;
      for (const o of s.ents) {
        if (o === e || o.inv > 0) continue;
        const dx = o.x - e.x, dz = o.z - e.z, d = Math.hypot(dx, dz) || 1;
        if (o.mass > e.mass * 1.22 && d < 8 + radius(o.mass)) { const w = (8 + radius(o.mass) - d) / 8; mx -= (dx / d) * w * 3; mz -= (dz / d) * w * 3; threat = Math.max(threat, w); }
        else if (e.mass > o.mass * 1.3 && d < pd && chance(p, 0.9)) { pd = d; prey = o; }
      }
      if (threat < 0.35 && prey && pd < 11) {
        const lead = 0.25; // đón đầu
        const tx = prey.x + prey.vx * lead - e.x, tz = prey.z + prey.vz * lead - e.z, L = Math.hypot(tx, tz) || 1;
        mx += tx / L * 2; mz += tz / L * 2;
        if (pd < 5 && e.cd <= 0 && e.mass > 1.6 && chance(p, 0.6)) pulse(p, 'a');
      } else if (threat < 0.35) {
        let best = null, bd = 1e9;
        for (const q of s.pel) { const d = Math.hypot(q.x - e.x, q.z - e.z) + wobble(p, 3); if (d < bd) { bd = d; best = q; } }
        if (best) { const dx = best.x - e.x, dz = best.z - e.z, L = Math.hypot(dx, dz) || 1; mx += dx / L; mz += dz / L; }
      } else if (e.cd <= 0 && threat > 0.7 && e.mass > 1.5) pulse(p, 'a');
      // tránh mép
      if (Math.abs(e.x) > HX - 2.5) mx -= Math.sign(e.x) * 1.2;
      if (Math.abs(e.z) > HZ - 2.5) mz -= Math.sign(e.z) * 1.2;
      stick(p, mx, mz);
    }
  },

  update(dt) {
    const s = S, ctx = s.ctx;
    s.time += dt; s.t += dt; s.fx.update(dt);
    ctx.hud.timer(fmtTime(Math.max(0, DURATION - s.t)));
    s.pelT -= dt;
    if (s.pelT <= 0 && s.pel.length < 26 + s.ents.length * 3) { s.pelT = 0.25; this.spawnPellet(); }

    for (const e of s.ents) {
      e.cd -= dt; e.dash -= dt; e.inv -= dt;
      const slow = 1 / (1 + 0.09 * (e.mass - 1));
      stepBean(e, dt, { acc: 52 * slow + 12, drag: 3.6, max: (e.dash > 0 ? 14 : 8.4) * slow + 1.6 });
      if (e.p.press.a && e.cd <= 0 && e.mass > 1.15) {
        e.vx += e.fx * 11; e.vz += e.fz * 11; e.dash = 0.4; e.cd = 1.8; e.mass = Math.max(1, e.mass - 0.1);
        ctx.sfx.dash(); s.fx.ring(e.x, e.z, '#9be8ff', 2.6, 0.35);
      }
      const r = radius(e.mass);
      if (e.x > HX - r) { e.x = HX - r; e.vx = -Math.abs(e.vx) * 0.4; } else if (e.x < -HX + r) { e.x = -HX + r; e.vx = Math.abs(e.vx) * 0.4; }
      if (e.z > HZ - r) { e.z = HZ - r; e.vz = -Math.abs(e.vz) * 0.4; } else if (e.z < -HZ + r) { e.z = -HZ + r; e.vz = Math.abs(e.vz) * 0.4; }
    }
    // ăn hạt
    for (let i = s.pel.length - 1; i >= 0; i--) {
      const q = s.pel[i];
      q.m.position.y = 0.5 + Math.sin(s.time * 4 + q.ph) * 0.1;
      for (const e of s.ents) {
        if (Math.hypot(e.x - q.x, e.z - q.z) > radius(e.mass) + 0.5) continue;
        e.mass += 0.1; ctx.sfx.coin();
        ctx.scene.remove(q.m); s.pel.splice(i, 1);
        break;
      }
    }
    // nuốt người
    for (const a of s.ents) for (const b of s.ents) {
      if (a === b || a.inv > 0 || b.inv > 0 || a.mass < b.mass * 1.25) continue;
      if (Math.hypot(a.x - b.x, a.z - b.z) > radius(a.mass) * 0.9) continue;
      a.mass += b.mass * 0.7; a.eaten++; b.deaths++;
      ctx.sfx.boom(); ctx.shake(0.4); ctx.vibrate(b.p.id, 300); ctx.vibrate(a.p.id, 80);
      s.fx.burst(b.x, 1, b.z, b.p.color, 22, 10); s.fx.ring(b.x, b.z, '#ffffff', 5, 0.5);
      for (let k = 0; k < 4; k++) this.spawnPellet(b.x + rand(-2, 2), b.z + rand(-2, 2));
      b.mass = 1; b.inv = 2; b.vx = b.vz = 0;
      const ang = Math.random() * 6.28; b.x = Math.cos(ang) * 11; b.z = Math.sin(ang) * 6;
      this.hud();
    }
    for (const e of s.ents) {
      showBean(e, dt, s.time);
      const k = Math.sqrt(e.mass);
      e.g.scale.setScalar(k);
      e.g.visible = e.inv <= 0 || Math.floor(s.time * 14) % 2 === 0;
    }
    if (Math.floor(s.t * 3) !== s.lastHud) { s.lastHud = Math.floor(s.t * 3); this.hud(); }
    if (!s.over && s.t >= DURATION) {
      s.over = true;
      const rank = [...s.ents].sort((a, b) => b.mass - a.mass);
      ctx.finish(rank.map((e) => ({ id: e.p.id, text: `${e.mass.toFixed(1)} kg${e.eaten ? ` · nuốt ${e.eaten}` : ''}` })));
    }
  },

  dispose() { if (S) { S.fx.dispose(); S.pelGeo.dispose(); S.pelMats.forEach((m) => m.dispose()); S = null; } },
};
