import * as THREE from 'three';
import { rand, fmtTime, makeFX } from '/js/util.js';
import { std, glow, mesh, T } from '/js/gfx.js';
import { setupScene, spawnBeans, stepBean, pushApart, clampRect, showBean, hudRows, ringMesh } from '/js/party.js';
import { tick, pulse, stick, idle, wobble, chance } from '/js/bots.js';

const HX = 13, HZ = 8, LIMIT = 75;
let S = null;

export default {
  id: 'dodgeball',
  name: 'Né Bóng',
  emoji: '🏐',
  color: '#ff7a3d',
  cat: 'party',
  bots: 4,
  tag: '1-8 người · còn sống tới cuối',
  desc: 'Bóng bắn vào sàn từ mọi phía, càng lúc càng nhanh. Chạm bóng là bị loại. Bấm A để lao né. Ai trụ lâu nhất thắng!',
  cfg: { a: 'LAO', b: '', gyro: false, hideStick: false, hint: 'Né bóng · A để lao' },

  init(ctx) {
    const scene = ctx.scene;
    setupScene(ctx, { bg: 0x1a1020, size: 24, cam: [0, 24, 14], look: [0, 0, 0.5], light: { sun: 2.4, hemi: 0.6 } });
    const floor = mesh(new THREE.BoxGeometry(HX * 2 + 2, 1, HZ * 2 + 2), std(0xffffff, { map: T.plate([8, 5], [92, 60, 70]), roughness: 0.45, metalness: 0.4 }), false, true);
    floor.position.y = -0.5; scene.add(floor);
    const rail = glow(0xff7a3d, 2.2);
    for (const [x, z, w, d] of [[0, -HZ - 0.5, HX * 2 + 2, 0.25], [0, HZ + 0.5, HX * 2 + 2, 0.25], [-HX - 0.5, 0, 0.25, HZ * 2 + 1], [HX + 0.5, 0, 0.25, HZ * 2 + 1]]) {
      const m = mesh(new THREE.BoxGeometry(w, 0.3, d), rail, false); m.position.set(x, 0.15, z); scene.add(m);
    }
    S = { ctx, fx: makeFX(THREE, scene), balls: [], t: 0, time: 0, spawnT: 1.2, over: false, lastHud: -1, deaths: 0 };
    S.ballGeo = new THREE.SphereGeometry(0.6, 16, 12);
    S.ballMat = std(0xff6a2a, { roughness: 0.3, metalness: 0.1, emissive: 0x7a1a00, emissiveIntensity: 0.9 });
    S.ents = spawnBeans(ctx, (i, n) => [(i - (n - 1) / 2) * 2.6, 0], () => ({ cd: 0, dash: 0, out: -1 }));
    ctx.hud.title('Né Bóng');
    this.hud();
  },

  hud() { S.ctx.hud.board(hudRows([...S.ents].sort((a, b) => (b.alive - a.alive) || (b.out - a.out)), (e) => (e.alive ? '😀' : `💥 ${e.out.toFixed(0)}s`))); },

  spawnBall() {
    const s = S;
    const alive = s.ents.filter((e) => e.alive);
    if (!alive.length) return;
    const tgt = alive[Math.floor(Math.random() * alive.length)];
    const side = Math.floor(Math.random() * 4);
    let x, z;
    if (side === 0) { x = -HX - 1; z = rand(-HZ, HZ); } else if (side === 1) { x = HX + 1; z = rand(-HZ, HZ); }
    else if (side === 2) { x = rand(-HX, HX); z = -HZ - 1; } else { x = rand(-HX, HX); z = HZ + 1; }
    const sp = 7 + Math.min(8, s.t * 0.11) + Math.random() * 2;
    const tx = tgt.x + rand(-2.2, 2.2), tz = tgt.z + rand(-2.2, 2.2);
    const d = Math.hypot(tx - x, tz - z) || 1;
    const m = mesh(s.ballGeo, s.ballMat); m.position.set(x, 0.65, z);
    const warn = ringMesh(0xff7a3d, 1.1, 0.2, 0.9); warn.position.set(x, 0.07, z);
    s.ctx.scene.add(m, warn);
    s.balls.push({ m, warn, x, z, vx: ((tx - x) / d) * sp, vz: ((tz - z) / d) * sp, age: 0, bounces: 0 });
    s.ctx.sfx.warn();
  },

  think(dt) {
    const s = S;
    for (const e of s.ents) {
      const p = e.p;
      if (!p.bot || !tick(p, dt, 0.07)) continue;
      if (!e.alive) { idle(p); continue; }
      let mx = 0, mz = 0, worst = 9, tmin = 9;
      for (const b of s.balls) {
        if (b.age < 0.8) continue;
        const rx = b.x - e.x, rz = b.z - e.z, v2 = b.vx * b.vx + b.vz * b.vz || 1;
        const tc = Math.max(0, Math.min(1.6, -(rx * b.vx + rz * b.vz) / v2));
        const cx = rx + b.vx * tc, cz = rz + b.vz * tc, cd = Math.hypot(cx, cz);
        if (cd < 2.1) {
          const w = (2.1 - cd) * (1.8 - tc) * 1.4;
          const L = cd || 1; mx -= (cx / L) * w; mz -= (cz / L) * w;
          if (cd < worst) { worst = cd; tmin = tc; }
        }
      }
      // tránh mép + nghiêng về giữa sàn
      mx += -e.x * 0.03 + (Math.abs(e.x) > HX - 1.5 ? -Math.sign(e.x) * 1.5 : 0);
      mz += -e.z * 0.04 + (Math.abs(e.z) > HZ - 1.5 ? -Math.sign(e.z) * 1.5 : 0);
      mx += wobble(p, 0.5); mz += wobble(p, 0.5);
      stick(p, mx, mz);
      if (worst < 1.3 && tmin < 0.35 && e.cd <= 0 && chance(p, 0.8)) pulse(p, 'a');
    }
  },

  update(dt) {
    const s = S, ctx = s.ctx;
    s.time += dt; s.t += dt; s.fx.update(dt);
    ctx.hud.timer(fmtTime(Math.max(0, LIMIT - s.t)));
    s.spawnT -= dt;
    if (s.spawnT <= 0) {
      const per = Math.max(0.28, 1.25 - s.t * 0.016) / (0.8 + s.ents.length * 0.18);
      s.spawnT = per; this.spawnBall();
      if (s.t > 25 && Math.random() < 0.35) this.spawnBall();
    }
    for (const e of s.ents) {
      if (!e.alive) continue;
      e.cd -= dt; e.dash -= dt;
      stepBean(e, dt, { acc: 56, drag: 5.4, max: e.dash > 0 ? 15 : 9.2 });
      if (e.p.press.a && e.cd <= 0) { e.vx += e.fx * 13; e.vz += e.fz * 13; e.dash = 0.25; e.cd = 1.6; ctx.sfx.dash(); s.fx.ring(e.x, e.z, '#ffffff', 2, 0.3); }
    }
    const live = s.ents.filter((e) => e.alive);
    pushApart(live, 0.62, 0.5);
    for (const e of live) clampRect(e, HX - 0.7, HZ - 0.7);

    for (let i = s.balls.length - 1; i >= 0; i--) {
      const b = s.balls[i];
      b.age += dt;
      if (b.age < 0.8) { b.warn.material.opacity = 0.4 + 0.5 * Math.abs(Math.sin(b.age * 18)); b.m.position.y = 0.65; b.m.scale.setScalar(0.4 + b.age * 0.75); continue; }
      if (b.warn.parent) { ctx.scene.remove(b.warn); b.warn.geometry.dispose(); b.warn.material.dispose(); }
      b.x += b.vx * dt; b.z += b.vz * dt;
      if (b.age > 1.2) { // vào sân rồi mới nảy tường
        if (Math.abs(b.x) > HX - 0.4) { b.vx *= -1; b.x = Math.sign(b.x) * (HX - 0.4); b.bounces++; }
        if (Math.abs(b.z) > HZ - 0.4) { b.vz *= -1; b.z = Math.sign(b.z) * (HZ - 0.4); b.bounces++; }
      }
      b.m.position.set(b.x, 0.65 + Math.abs(Math.sin(s.time * 5 + i)) * 0.15, b.z);
      b.m.rotation.x += dt * 6; b.m.rotation.z += dt * 4;
      for (const e of live) {
        if (!e.alive || Math.hypot(e.x - b.x, e.z - b.z) > 1.1) continue;
        e.alive = false; e.out = s.t; e.g.visible = false; s.deaths++;
        ctx.sfx.boom(); ctx.shake(0.5); ctx.vibrate(e.p.id, 300);
        s.fx.burst(e.x, 1, e.z, e.p.color, 22, 10); s.fx.ring(e.x, e.z, '#ffb347', 5, 0.5);
        this.hud();
      }
      if (b.bounces > 3 || b.age > 14) { ctx.scene.remove(b.m); s.balls.splice(i, 1); }
    }

    for (const e of s.ents) if (e.alive) showBean(e, dt, s.time);
    if (Math.floor(s.t * 2) !== s.lastHud) { s.lastHud = Math.floor(s.t * 2); this.hud(); }
    const aliveN = s.ents.filter((e) => e.alive).length;
    const n = s.ents.length;
    if (!s.over && ((n > 1 && aliveN <= 1) || aliveN === 0 || s.t >= LIMIT)) {
      s.over = true;
      const rank = [...s.ents].sort((a, b) => (b.alive - a.alive) || (b.out - a.out));
      ctx.finish(rank.map((e) => ({ id: e.p.id, text: e.alive ? 'sống sót 🏆' : `trụ ${e.out.toFixed(1)}s` })));
    }
  },

  dispose() {
    if (S) {
      for (const b of S.balls) if (b.warn.parent) { b.warn.geometry.dispose(); b.warn.material.dispose(); }
      S.fx.dispose(); S.ballGeo.dispose(); S.ballMat.dispose(); S = null;
    }
  },
};
