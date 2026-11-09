import * as THREE from 'three';
import { rand, clamp, fmtTime, makeFX } from '/js/util.js';
import { std, glow, mesh, T } from '/js/gfx.js';
import { setupScene, spawnBeans, stepBean, pushApart, showBean, hudRows, discMesh } from '/js/party.js';
import { tick, hold, pulse, stick, idle, nearest, wobble, chance } from '/js/bots.js';

const R = 16, DURATION = 90, HP = 5;
let S = null;

export default {
  id: 'zombie',
  name: 'Chống Zombie',
  emoji: '🧟',
  color: '#6fbf5a',
  cat: 'team',
  bots: 3,
  tag: '1-8 người · hợp tác 90 giây',
  desc: 'Cả đội cùng bảo vệ khu vực khỏi bầy zombie. Giữ A để bắn (tự ngắm con gần nhất), B ném bom nổ diện rộng. Ai hạ nhiều zombie nhất đứng đầu bảng!',
  cfg: { a: 'BẮN', b: 'BOM', gyro: false, hideStick: false, hint: 'Giữ A bắn · B ném bom · đừng để zombie chạm' },

  init(ctx) {
    const scene = ctx.scene;
    setupScene(ctx, { bg: 0x0a1210, size: 24, cam: [0, 27, 13], look: [0, 0, 0.5], light: { sun: 1.7, hemi: 0.55, color: 0xcfe0ff } });
    const floor = mesh(new THREE.CylinderGeometry(R + 1, R + 1.4, 1, 64), std(0xffffff, { map: T.asphalt(6), roughness: 0.8 }), false, true);
    floor.position.y = -0.5; scene.add(floor);
    const ring = mesh(new THREE.TorusGeometry(R + 0.6, 0.18, 8, 80), glow(0x6fbf5a, 2), false); ring.rotation.x = Math.PI / 2; ring.position.y = 0.1; scene.add(ring);
    S = { ctx, fx: makeFX(THREE, scene), z: [], bul: [], bombs: [], t: 0, time: 0, over: false, lastHud: -1, spawnT: 1.5, kills: 0, wave: 1 };
    S.zGeo = new THREE.CapsuleGeometry(0.5, 0.5, 4, 10);
    S.eyeGeo = new THREE.SphereGeometry(0.11, 8, 6);
    S.armGeo = new THREE.BoxGeometry(0.2, 0.2, 0.8);
    S.zMats = [std(0x6fbf5a, { roughness: 0.7 }), std(0x4a8a3a, { roughness: 0.7 })];
    S.eyeMat = glow(0xff2a2a, 3);
    S.bulGeo = new THREE.SphereGeometry(0.2, 8, 6);
    S.bulMat = glow(0xffe36a, 4);
    S.bombGeo = new THREE.SphereGeometry(0.4, 12, 8);
    S.bombMat = std(0x16161c, { roughness: 0.35, metalness: 0.8 });
    S.ents = spawnBeans(ctx, (i, n) => { const a = (i / n) * Math.PI * 2; return [Math.cos(a) * 3, Math.sin(a) * 3]; },
      () => ({ hp: HP, inv: 0, fire: 0, bomb: 0, kills: 0, down: -1 }));
    ctx.hud.title('Chống Zombie');
    this.hud();
  },

  hud() {
    const s = S;
    s.ctx.hud.board(hudRows([...s.ents].sort((a, b) => b.kills - a.kills), (e) => (e.alive ? `${'❤'.repeat(Math.max(0, e.hp))} ${e.kills}🧟` : `💀 ${e.kills}🧟`)));
  },

  spawnZombie() {
    const s = S;
    const a = Math.random() * Math.PI * 2;
    const big = s.kills > 8 && Math.random() < 0.12 + Math.min(0.15, s.t * 0.002);
    const g = new THREE.Group();
    const body = mesh(s.zGeo, s.zMats[big ? 1 : 0]); body.position.y = 0.9;
    const e1 = mesh(s.eyeGeo, s.eyeMat, false), e2 = mesh(s.eyeGeo, s.eyeMat, false);
    e1.position.set(-0.2, 1.15, 0.42); e2.position.set(0.2, 1.15, 0.42);
    const a1 = mesh(s.armGeo, s.zMats[big ? 1 : 0]), a2 = mesh(s.armGeo, s.zMats[big ? 1 : 0]);
    a1.position.set(-0.55, 0.95, 0.5); a2.position.set(0.55, 0.95, 0.5);
    g.add(body, e1, e2, a1, a2);
    g.scale.setScalar(big ? 1.55 : 0.95);
    const x = Math.cos(a) * (R + 1), z = Math.sin(a) * (R + 1);
    g.position.set(x, 0, z);
    s.ctx.scene.add(g);
    s.z.push({ g, x, z, hp: big ? 6 : 1 + (Math.random() < Math.min(0.4, s.t * 0.006) ? 1 : 0), big, sp: (big ? 1.9 : 2.7) + Math.min(2.2, s.t * 0.03) + Math.random() * 0.7, hit: 0, ph: Math.random() * 6 });
  },

  nearZ(x, z, maxD = 99) {
    let best = null, bd = maxD;
    for (const q of S.z) { const d = Math.hypot(q.x - x, q.z - z); if (d < bd) { bd = d; best = q; } }
    return best ? { q: best, d: bd } : null;
  },

  think(dt) {
    const s = S;
    for (const e of s.ents) {
      const p = e.p;
      if (!p.bot || !tick(p, dt, 0.09)) continue;
      if (!e.alive) { idle(p); hold(p, 'a', 0); continue; }
      const nz = this.nearZ(e.x, e.z);
      let mx = 0, mz = 0, crowd = 0;
      for (const q of s.z) {
        const dx = e.x - q.x, dz = e.z - q.z, d = Math.hypot(dx, dz) || 1;
        if (d < 6.5) { const w = (6.5 - d) / 6.5 * (q.big ? 2.2 : 1.4); mx += (dx / d) * w; mz += (dz / d) * w; crowd++; }
      }
      // giữ đội hình: tới gần đồng đội nếu lạc xa
      const mate = nearest(s.ents.filter((o) => o !== e && o.alive), e.x, e.z);
      if (mate && mate.d > 8) { mx += (mate.o.x - e.x) / mate.d * 0.6; mz += (mate.o.z - e.z) / mate.d * 0.6; }
      // quay lại giữa sân + né mép
      const rd = Math.hypot(e.x, e.z);
      mx += -e.x / (rd || 1) * Math.max(0, rd - 9) * 0.25 + (crowd ? 0 : -e.x * 0.02);
      mz += -e.z / (rd || 1) * Math.max(0, rd - 9) * 0.25 + (crowd ? 0 : -e.z * 0.02);
      mx += wobble(p, 0.4); mz += wobble(p, 0.4);
      stick(p, mx, mz);
      hold(p, 'a', !!(nz && nz.d < 14) && chance(p, 0.95));
      if (e.bomb <= 0 && crowd >= 4 && chance(p, 0.5)) pulse(p, 'b');
    }
  },

  update(dt) {
    const s = S, ctx = s.ctx;
    s.time += dt; s.t += dt; s.fx.update(dt);
    ctx.hud.timer(fmtTime(Math.max(0, DURATION - s.t)));

    s.spawnT -= dt;
    const nAlive = s.ents.filter((e) => e.alive).length || 1;
    if (s.spawnT <= 0 && s.z.length < 10 + nAlive * 5) {
      s.spawnT = Math.max(0.28, (1.5 - s.t * 0.012) / (0.7 + nAlive * 0.25));
      this.spawnZombie();
      if (s.t > 30 && Math.random() < 0.3) this.spawnZombie();
    }

    for (const e of s.ents) {
      if (!e.alive) continue;
      e.inv -= dt; e.fire -= dt; e.bomb -= dt;
      stepBean(e, dt, { acc: 54, drag: 5.4, max: 8.8 });
      const rd = Math.hypot(e.x, e.z); if (rd > R - 0.6) { e.x *= (R - 0.6) / rd; e.z *= (R - 0.6) / rd; }
      if (e.p.input.a && e.fire <= 0) {
        const t = this.nearZ(e.x, e.z, 18);
        let dx = e.fx, dz = e.fz;
        if (t) { dx = t.q.x - e.x; dz = t.q.z - e.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L; e.fx = dx; e.fz = dz; }
        e.fire = 0.2;
        const m = mesh(s.bulGeo, s.bulMat, false); m.position.set(e.x + dx * 0.8, 1, e.z + dz * 0.8); ctx.scene.add(m);
        s.bul.push({ m, x: m.position.x, z: m.position.z, vx: dx * 24, vz: dz * 24, life: 0.9, owner: e });
        ctx.sfx.shoot();
      }
      if (e.p.press.b && e.bomb <= 0) {
        e.bomb = 8; ctx.sfx.boom(); ctx.shake(0.5);
        const bx = e.x + e.fx * 3, bz = e.z + e.fz * 3;
        s.fx.ring(bx, bz, '#ff7a2a', 11, 0.6); s.fx.burst(bx, 1, bz, '#ffb347', 30, 12);
        for (let i = s.z.length - 1; i >= 0; i--) {
          const q = s.z[i];
          if (Math.hypot(q.x - bx, q.z - bz) < 6) { q.hp -= 5; if (q.hp <= 0) this.kill(i, e); }
        }
        ctx.vibrate(e.p.id, 150);
      }
    }
    pushApart(s.ents.filter((e) => e.alive), 0.62, 0.4);

    // đạn
    for (let i = s.bul.length - 1; i >= 0; i--) {
      const b = s.bul[i];
      b.x += b.vx * dt; b.z += b.vz * dt; b.life -= dt; b.m.position.x = b.x; b.m.position.z = b.z;
      let used = b.life <= 0;
      if (!used) for (let j = s.z.length - 1; j >= 0; j--) {
        const q = s.z[j];
        if (Math.hypot(q.x - b.x, q.z - b.z) < (q.big ? 1.1 : 0.75)) {
          q.hp--; q.hit = 0.12; q.x += b.vx * 0.012; q.z += b.vz * 0.012; used = true;
          s.fx.burst(b.x, 1, b.z, '#9be37a', 3, 4);
          if (q.hp <= 0) this.kill(j, b.owner);
          break;
        }
      }
      if (used) { ctx.scene.remove(b.m); s.bul.splice(i, 1); }
    }

    // zombie
    const live = s.ents.filter((e) => e.alive);
    for (const q of s.z) {
      let tgt = null, bd = 1e9;
      for (const e of live) { const d = Math.hypot(e.x - q.x, e.z - q.z); if (d < bd) { bd = d; tgt = e; } }
      if (tgt) {
        const dx = tgt.x - q.x, dz = tgt.z - q.z, L = Math.hypot(dx, dz) || 1;
        const sp = q.sp * (q.hit > 0 ? 0.3 : 1);
        q.x += (dx / L) * sp * dt; q.z += (dz / L) * sp * dt;
        q.g.rotation.y = Math.atan2(dx, dz);
        if (L < (q.big ? 1.4 : 1.0) && tgt.inv <= 0) {
          tgt.hp -= q.big ? 2 : 1; tgt.inv = 1.1; ctx.sfx.hit(); ctx.shake(0.35); ctx.vibrate(tgt.p.id, 200);
          s.fx.burst(tgt.x, 1, tgt.z, '#ff4d4d', 10, 8);
          const kx = (tgt.x - q.x) / L, kz = (tgt.z - q.z) / L; tgt.vx += kx * 9; tgt.vz += kz * 9;
          if (tgt.hp <= 0) { tgt.alive = false; tgt.down = s.t; tgt.g.visible = false; s.fx.burst(tgt.x, 1, tgt.z, tgt.p.color, 30, 11); ctx.sfx.fall(); }
          this.hud();
        }
      }
      q.hit -= dt; q.ph += dt * 6;
      q.g.position.set(q.x, Math.abs(Math.sin(q.ph)) * 0.12, q.z);
      q.g.rotation.z = Math.sin(q.ph) * 0.07;
    }
    for (let i = 0; i < s.z.length; i++) for (let j = i + 1; j < s.z.length; j++) {
      const a = s.z[i], b = s.z[j];
      let dx = b.x - a.x, dz = b.z - a.z; const d = Math.hypot(dx, dz);
      if (d < 0.8 && d > 1e-6) { dx /= d; dz /= d; const o = (0.8 - d) / 2; a.x -= dx * o; a.z -= dz * o; b.x += dx * o; b.z += dz * o; }
    }

    for (const e of s.ents) {
      if (!e.alive) continue;
      showBean(e, dt, s.time);
      e.g.visible = e.inv <= 0 || Math.floor(s.time * 14) % 2 === 0;
    }
    if (Math.floor(s.t * 2) !== s.lastHud) { s.lastHud = Math.floor(s.t * 2); this.hud(); }
    const aliveN = s.ents.filter((e) => e.alive).length;
    if (!s.over && (aliveN === 0 || s.t >= DURATION)) {
      s.over = true;
      const won = aliveN > 0;
      const rank = [...s.ents].sort((a, b) => (b.kills - a.kills) || (b.alive - a.alive));
      ctx.finish(rank.map((e) => ({ id: e.p.id, text: `${e.kills} zombie${won ? '' : ' · cả đội gục'}` })));
    }
  },

  kill(i, owner) {
    const s = S, q = s.z[i];
    s.fx.burst(q.x, 1, q.z, '#6fbf5a', q.big ? 20 : 9, 8);
    s.ctx.sfx.hit();
    s.ctx.scene.remove(q.g); s.z.splice(i, 1);
    s.kills++;
    if (owner) { owner.kills++; if (owner.kills % 5 === 0) this.hud(); }
  },

  dispose() {
    if (S) {
      S.fx.dispose(); S.zGeo.dispose(); S.eyeGeo.dispose(); S.armGeo.dispose(); S.bulGeo.dispose(); S.bombGeo.dispose();
      S.zMats.forEach((m) => m.dispose()); S.eyeMat.dispose(); S.bulMat.dispose(); S.bombMat.dispose(); S = null;
    }
  },
};
