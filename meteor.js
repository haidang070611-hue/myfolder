import * as THREE from 'three';
import { clamp, rand, makeFX } from '/js/util.js';
import { std, glow, mesh, T } from '/js/gfx.js';
import { setupScene, spawnBeans, stepBean, pushApart, clampCircle, showBean, discMesh, ringMesh } from '/js/party.js';
import { tick, pulse, hold, stick, idle, toward, away, nearest, wobble, chance, ai, segHitsRect } from '/js/bots.js';

const R = 15, MAXT = 120;
let S = null;

export default {
  id: 'meteor',
  name: 'Mưa Thiên Thạch',
  emoji: '☄️',
  cat: 'party',
  bots: 4,
  color: '#ff7a45',
  tag: '1-8 người · sống sót',
  desc: 'Thiên thạch rơi xuống những vòng đỏ, sau đó còn có tia quét khổng lồ. Chạy thật khéo, bấm A để lao qua tia quét. Sống lâu nhất thắng!',
  cfg: { a: 'LAO NÉ', b: '', gyro: false, hideStick: false, hint: 'Tránh vòng đỏ · A để lao (bất tử trong chốc lát)' },

  init(ctx) {
    const scene = ctx.scene;
    setupScene(ctx, { bg: 0x3a1a1c, sky: [0x1b1745, 0xff8a52, 0x2a140c, [-0.5, 0.18, 0.85]], size: 24, cam: [0, 27, 18], look: [0, 0, 1], fogNear: 60, fogFar: 150, light: { sun: 2.6, hemi: 0.5, color: 0xffb888, sky: 0xff9a70, dir: [-0.6, 0.5, 0.8] } });
    const rock = std(0xffffff, { map: T.noise('rock', [112, 90, 74], 44, 7), roughness: 0.95, envMapIntensity: 0.2 });
    const top = mesh(new THREE.CylinderGeometry(R, R + 1.2, 1.4, 72), rock, false, true); top.position.y = -0.7;
    const ground = mesh(new THREE.PlaneGeometry(300, 300), std(0x2a140e, { roughness: 1 }), false, true); ground.rotation.x = -Math.PI / 2; ground.position.y = -3;
    scene.add(top, ground);

    // tia quét
    const beam = new THREE.Group();
    const bar = mesh(new THREE.BoxGeometry(R * 2 - 0.4, 0.6, 0.55), glow(0xff3030, 3), false); bar.position.y = 0.5;
    const hub = mesh(new THREE.CylinderGeometry(0.9, 1.1, 1.2, 16), std(0x2a2d3a, { metalness: 0.8, roughness: 0.3 })); hub.position.y = 0.6;
    beam.add(bar, hub); beam.visible = false; scene.add(beam);

    S = { ctx, fx: makeFX(THREE, scene), beam, bar, rockGeo: new THREE.IcosahedronGeometry(1, 1), rockMat: std(0x3a2a24, { roughness: 0.8, emissive: 0xff4a10, emissiveIntensity: 1.6 }), shots: [], craters: [], t: 0, time: 0, st: 0, ang: 0, over: false, lastHud: -1, order: [] };
    S.ents = spawnBeans(ctx, (i, n) => { const a = (i / n) * Math.PI * 2; return [Math.cos(a) * 7, Math.sin(a) * 7]; }, () => ({ cd: 0, inv: 0, out: -1 }));
    S.ents.forEach((e) => { e.fx = -e.x / 7; e.fz = -e.z / 7; e.ang = Math.atan2(e.fx, e.fz); });
    ctx.hud.title('Mưa Thiên Thạch');
    this.hud();
  },

  hud() { S.ctx.hud.board(S.ents.map((e) => ({ color: e.p.color, name: e.p.name, text: e.alive ? '✔' : `${e.out.toFixed(1)}s`, dead: !e.alive }))); },

  kill(e, how) {
    const s = S, ctx = s.ctx;
    e.alive = false; e.out = s.t; e.g.visible = false; s.order.push(e);
    ctx.sfx.boom(); ctx.shake(0.6); ctx.vibrate(e.p.id, 350);
    s.fx.burst(e.x, 1, e.z, e.p.color, 20, 10);
    ctx.hud.banner(`${e.p.name} ${how}`, 1000, true);
    this.hud();
  },


  // ---- AI bot: né vòng đỏ, chạy cùng chiều tia quét hoặc lao xuyên qua tia, tránh mép ----
  think(dt) {
    const s = S;
    for (const e of s.ents) {
      const p = e.p;
      if (!p.bot || !tick(p, dt, 0.06)) continue;
      if (!e.alive) { idle(p); continue; }
      let mx = 0, mz = 0, danger = false;
      for (const m of s.shots) {
        const dx = e.x - m.x, dz = e.z - m.z, d = Math.hypot(dx, dz) || 1;
        const lim = m.r + 2.2;
        if (d < lim) { const w = ((lim - d) / lim) * 3 + 0.8; mx += (dx / d) * w; mz += (dz / d) * w; danger = true; }
      }
      const sw = s.t - 16;
      if (sw > 0.5) {
        const nx = Math.sin(s.ang), nz = Math.cos(s.ang);
        const across = e.x * nx + e.z * nz;
        if (across < 0.4 && across > -3.2) {          // tia đang quét tới phía sau lưng
          danger = true;
          if (sw > 3 && across > -2.3 && e.cd <= 0 && chance(p, 0.9)) { pulse(p, 'a'); mx += nx * 3; mz += nz * 3; }
          else { mx -= nx * 1.8; mz -= nz * 1.8; }
        }
      }
      const edge = Math.hypot(e.x, e.z);
      if (edge > R - 3.5) { mx -= (e.x / edge) * 1.5; mz -= (e.z / edge) * 1.5; danger = true; }
      if (danger) stick(p, mx, mz);
      else toward(p, e, Math.cos(s.t * 0.4 + p.id) * 6, Math.sin(s.t * 0.4 + p.id) * 6, 0.6, 0.5);
    }
  },

  update(dt) {
    const s = S, ctx = s.ctx;
    s.time += dt; s.t += dt; s.fx.update(dt);
    const alive = s.ents.filter((e) => e.alive);
    ctx.hud.timer(`${s.t.toFixed(1)}s`);

    // sinh thiên thạch
    s.st -= dt;
    if (s.st <= 0 && !s.over) {
      s.st = clamp(1.25 - s.t * 0.012, 0.32, 1.25) / Math.max(1, Math.sqrt(alive.length) * 0.75);
      const big = s.t > 25 && Math.random() < 0.22;
      const target = alive.length && Math.random() < 0.7 ? alive[Math.floor(Math.random() * alive.length)] : null;
      let x = target ? target.x + target.vx * 0.5 : rand(-R, R), z = target ? target.z + target.vz * 0.5 : rand(-R, R);
      const d = Math.hypot(x, z); if (d > R - 1) { x *= (R - 1) / d; z *= (R - 1) / d; }
      const r = big ? 4.2 : 2.5, delay = big ? 1.9 : 1.45;
      const warn = discMesh(0xff2a1a, r, 0.28), ring = ringMesh(0xff5a3a, r, 0.14, 0.95);
      warn.position.set(x, 0.05, z); ring.position.set(x, 0.07, z);
      const rk = new THREE.Mesh(s.rockGeo, s.rockMat); rk.scale.setScalar(big ? 1.9 : 1.1); rk.castShadow = true;
      ctx.scene.add(warn, ring, rk);
      s.shots.push({ x, z, r, delay, t: 0, warn, ring, rk });
      ctx.sfx.warn();
    }
    for (let i = s.shots.length - 1; i >= 0; i--) {
      const m = s.shots[i];
      m.t += dt;
      const p = clamp(m.t / m.delay, 0, 1);
      m.ring.material.opacity = 0.5 + 0.5 * Math.abs(Math.sin(m.t * (6 + p * 14)));
      m.rk.position.set(m.x + (1 - p) * 10, 1 + (1 - p * p) * 38, m.z - (1 - p) * 8);
      m.rk.rotation.x += dt * 4;
      if (m.t >= m.delay) {
        for (const e of alive) if (e.alive && e.inv <= 0 && Math.hypot(e.x - m.x, e.z - m.z) < m.r + 0.35) this.kill(e, 'bị thiên thạch nghiền!');
        ctx.sfx.boom(); ctx.shake(m.r > 3 ? 0.9 : 0.5);
        s.fx.burst(m.x, 0.6, m.z, '#ff8a3a', m.r > 3 ? 40 : 22, 13); s.fx.burst(m.x, 0.6, m.z, '#ffd23f', 12, 8); s.fx.ring(m.x, m.z, '#ffb347', m.r * 2, 0.6);
        const cr = discMesh(0x000000, m.r * 0.8, 0.55); cr.material.blending = THREE.NormalBlending; cr.position.set(m.x, 0.04, m.z);
        ctx.scene.add(cr); s.craters.push({ m: cr, life: 7 });
        ctx.scene.remove(m.warn, m.ring, m.rk); m.warn.geometry.dispose(); m.warn.material.dispose(); m.ring.geometry.dispose(); m.ring.material.dispose();
        s.shots.splice(i, 1);
      }
    }
    for (let i = s.craters.length - 1; i >= 0; i--) {
      const c = s.craters[i]; c.life -= dt; c.m.material.opacity = Math.min(0.55, c.life * 0.2);
      if (c.life <= 0) { ctx.scene.remove(c.m); c.m.geometry.dispose(); c.m.material.dispose(); s.craters.splice(i, 1); }
    }

    // tia quét (từ giây 16 báo trước, giây 19 bắt đầu nguy hiểm)
    const sw = s.t - 16;
    s.beam.visible = sw > 0;
    if (sw > 0) {
      const live = sw > 3;
      s.ang += dt * (live ? 0.85 + (sw - 3) * 0.012 : 0);
      s.beam.rotation.y = s.ang;
      s.bar.material.emissiveIntensity = live ? 3 + Math.sin(s.time * 14) : 0.6;
      s.bar.material.opacity = 1;
      if (live) {
        const ca = Math.cos(s.ang), sa = Math.sin(s.ang); // hướng thanh: (cos, -sin) trong mặt phẳng XZ sau khi quay quanh Y
        for (const e of alive) {
          if (!e.alive || e.inv > 0) continue;
          const along = e.x * ca - e.z * sa, across = e.x * sa + e.z * ca;
          if (Math.abs(across) < 0.95 && Math.abs(along) < R) this.kill(e, 'bị tia quét chém!');
        }
      }
    }

    for (const e of s.ents) {
      if (!e.alive) continue;
      e.cd -= dt; e.inv -= dt;
      stepBean(e, dt, { acc: 56, drag: 5, max: e.inv > 0 ? 15 : 9.6 });
      if (e.p.press.a && e.cd <= 0) { e.vx += e.fx * 15; e.vz += e.fz * 15; e.inv = 0.35; e.cd = 1.8; ctx.sfx.dash(); s.fx.ring(e.x, e.z, '#ffffff', 2.2, 0.3); }
    }
    const live = s.ents.filter((e) => e.alive);
    pushApart(live, 0.62, 0.5);
    for (const e of live) { clampCircle(e, R - 0.6); showBean(e, dt, s.time); e.g.visible = e.inv <= 0 || Math.floor(s.time * 20) % 2 === 0; }
    if (Math.floor(s.t * 4) !== s.lastHud) { s.lastHud = Math.floor(s.t * 4); this.hud(); }

    const solo = s.ents.length === 1;
    if (!s.over && ((!solo && live.length <= 1) || (solo && live.length === 0) || s.t > MAXT)) {
      s.over = true;
      const rank = [...live, ...[...s.order].reverse()];
      ctx.finish(rank.map((e) => ({ id: e.p.id, text: e.alive ? `sống sót ${s.t.toFixed(1)}s 🏆` : `trụ được ${e.out.toFixed(1)} giây` })));
    }
  },

  dispose() { if (S) { S.fx.dispose(); S.rockGeo.dispose(); S.rockMat.dispose(); S = null; } },
};
