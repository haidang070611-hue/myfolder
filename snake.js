import * as THREE from 'three';
import { rand, clamp, fmtTime, makeFX, angleDiff } from '/js/util.js';
import { std, glow, mesh, T } from '/js/gfx.js';
import { setupScene, spawnBeans, showBean } from '/js/party.js';
import { tick, hold, stick, wobble, chance } from '/js/bots.js';

const HX = 16, HZ = 10, DURATION = 60, STEP = 0.5;
let S = null;
const COLORS = [0xff5a6e, 0xffd23f, 0x4dff88, 0x38c8ff, 0xb36cff, 0xff9a3d];

export default {
  id: 'snake',
  name: 'Rắn Săn Mồi',
  emoji: '🐍',
  color: '#4dff88',
  cat: 'fight',
  bots: 4,
  tag: '1-8 người · 60 giây',
  desc: 'Điều khiển rắn ăn các viên sáng để dài ra. Đụng thân rắn khác hoặc tường là chết và rơi hết ngọc. Giữ A để tăng tốc (tốn năng lượng).',
  cfg: { a: 'TĂNG TỐC', b: '', gyro: false, hideStick: false, hint: 'Ăn ngọc · tránh thân rắn khác · giữ A tăng tốc' },

  init(ctx) {
    const scene = ctx.scene;
    setupScene(ctx, { bg: 0x08140f, size: 26, cam: [0, 27, 15], look: [0, 0, 1], light: { sun: 2.2, hemi: 0.6 } });
    const floor = mesh(new THREE.BoxGeometry(HX * 2 + 2, 1, HZ * 2 + 2), std(0xffffff, { map: T.grid(18, 'rgba(77,255,136,.5)'), roughness: 0.4, metalness: 0.5 }), false, true);
    floor.position.y = -0.5; scene.add(floor);
    const rail = glow(0x4dff88, 2.2);
    for (const [x, z, w, d] of [[0, -HZ - 0.6, HX * 2 + 2, 0.25], [0, HZ + 0.6, HX * 2 + 2, 0.25], [-HX - 0.6, 0, 0.25, HZ * 2 + 1.5], [HX + 0.6, 0, 0.25, HZ * 2 + 1.5]]) {
      const m = mesh(new THREE.BoxGeometry(w, 0.5, d), rail, false); m.position.set(x, 0.25, z); scene.add(m);
    }
    S = { ctx, fx: makeFX(THREE, scene), orbs: [], t: 0, time: 0, over: false, lastHud: -1, orbT: 0 };
    S.segGeo = new THREE.SphereGeometry(0.46, 12, 8);
    S.orbGeo = new THREE.OctahedronGeometry(0.34, 0);
    S.orbMats = COLORS.map((c) => glow(c, 2.4));
    S.ents = spawnBeans(ctx, (i, n) => {
      const a = (i / n) * Math.PI * 2; return [Math.cos(a) * 9, Math.sin(a) * 5.5];
    }, (p, i) => ({ pts: [], segs: [], len: 5, hd: 0, boost: 1, score: 0, deaths: 0, respawn: 0, segMat: std(p.color, { roughness: 0.35, metalness: 0.2, emissive: p.color, emissiveIntensity: 0.25 }), trail: 0 }));
    for (const e of S.ents) { this.spawnSnake(e, true); }
    for (let i = 0; i < 12; i++) this.spawnOrb();
    ctx.hud.title('Rắn Săn Mồi');
    this.hud();
  },

  hud() { S.ctx.hud.board([...S.ents].sort((a, b) => b.score - a.score).map((e) => ({ color: e.p.color, name: e.p.name, text: `${e.score} 💎${e.alive ? '' : ' 💀'}`, dead: !e.alive }))); },

  spawnSnake(e, first) {
    const a = Math.atan2(-e.z, -e.x) + (first ? 0 : rand(-0.5, 0.5));
    if (!first) { e.x = rand(-HX + 5, HX - 5); e.z = rand(-HZ + 3, HZ - 3); }
    e.hd = first ? a : rand(0, 6.28); e.len = 5; e.alive = true; e.boost = 1; e.pts = []; e.trail = 0;
    for (let i = 0; i < 40; i++) e.pts.push([e.x - Math.cos(e.hd) * i * STEP, e.z - Math.sin(e.hd) * i * STEP]);
    e.g.visible = true; e.vx = e.vz = 0;
  },

  spawnOrb(x, z, ci) {
    const s = S;
    if (x === undefined) { x = rand(-HX + 1.5, HX - 1.5); z = rand(-HZ + 1.5, HZ - 1.5); }
    const c = ci ?? Math.floor(Math.random() * COLORS.length);
    const m = mesh(s.orbGeo, s.orbMats[c], false); m.position.set(x, 0.6, z);
    s.ctx.scene.add(m);
    s.orbs.push({ m, x, z, ph: Math.random() * 6 });
  },

  hitBody(x, z, self) {
    for (const o of S.ents) {
      if (!o.alive) continue;
      const lim = Math.min(o.len, o.pts.length);
      const from = o === self ? 8 : 0;
      for (let i = from; i < lim; i++) {
        const q = o.pts[i];
        if (Math.abs(q[0] - x) < 0.8 && Math.abs(q[1] - z) < 0.8 && Math.hypot(q[0] - x, q[1] - z) < 0.8) return true;
      }
    }
    return false;
  },

  think(dt) {
    const s = S;
    for (const e of s.ents) {
      const p = e.p;
      if (!p.bot || !tick(p, dt, 0.08)) continue;
      if (!e.alive) continue;
      // mục tiêu: viên ngọc đáng nhất
      let best = null, bs = -1e9;
      for (const o of s.orbs) {
        const d = Math.hypot(o.x - e.x, o.z - e.z);
        const sc = -d + (Math.abs(angleDiff(e.hd, Math.atan2(o.z - e.z, o.x - e.x))) < 1.2 ? 3 : 0);
        if (sc > bs) { bs = sc; best = o; }
      }
      const want = best ? Math.atan2(best.z - e.z, best.x - e.x) : Math.atan2(-e.z, -e.x);
      let pick = e.hd, pc = 1e9;
      for (const off of [-1.1, -0.7, -0.35, 0, 0.35, 0.7, 1.1]) {
        const a = e.hd + off;
        let danger = 0;
        for (const dist of [1.8, 3.6, 5.6]) {
          const px = e.x + Math.cos(a) * dist, pz = e.z + Math.sin(a) * dist;
          if (Math.abs(px) > HX - 1.0 || Math.abs(pz) > HZ - 1.0) danger += 14 / dist;
          else if (this.hitBody(px, pz, e)) danger += 14 / dist;
        }
        const cost = danger * 3 + Math.abs(angleDiff(a, want)) * (1.2 + wobble(p, 1)) + Math.abs(off) * 0.15;
        if (cost < pc) { pc = cost; pick = a; }
      }
      stick(p, Math.cos(pick), Math.sin(pick));
      const wallD = Math.min(HX - Math.abs(e.x), HZ - Math.abs(e.z));
      hold(p, 'a', wallD > 4 && e.boost > 0.5 && pc < 1.2 && chance(p, 0.5) && best && Math.hypot(best.x - e.x, best.z - e.z) > 5);
    }
  },

  kill(e) {
    const s = S, ctx = s.ctx;
    e.alive = false; e.respawn = 2.2; e.deaths++; e.g.visible = false;
    for (let i = 2; i < Math.min(e.len, e.pts.length); i += 2) this.spawnOrb(e.pts[i][0], e.pts[i][1], COLORS.findIndex((c) => c === 0xffd23f));
    s.fx.burst(e.x, 1, e.z, e.p.color, 26, 11); s.fx.ring(e.x, e.z, '#ffffff', 5, 0.5);
    ctx.sfx.boom(); ctx.shake(0.35); ctx.vibrate(e.p.id, 250);
    e.score = Math.max(0, e.score - 2);
    this.hud();
  },

  update(dt) {
    const s = S, ctx = s.ctx;
    s.time += dt; s.t += dt; s.fx.update(dt);
    ctx.hud.timer(fmtTime(Math.max(0, DURATION - s.t)));
    s.orbT -= dt;
    if (s.orbT <= 0 && s.orbs.length < 14 + s.ents.length * 3) { s.orbT = 0.5; this.spawnOrb(); }

    for (const e of s.ents) {
      if (!e.alive) {
        e.respawn -= dt;
        if (e.respawn <= 0 && s.t < DURATION - 2) { this.spawnSnake(e, false); s.fx.ring(e.x, e.z, e.p.color, 4, 0.5); }
        continue;
      }
      const inp = e.p.input, mag = Math.hypot(inp.x, inp.y);
      if (mag > 0.25) { const want = Math.atan2(inp.y, inp.x); e.hd += clamp(angleDiff(e.hd, want), -5.2 * dt, 5.2 * dt); }
      const boosting = inp.a && e.boost > 0.02;
      e.boost = clamp(e.boost + (boosting ? -0.45 : 0.18) * dt, 0, 1);
      const sp = boosting ? 10.5 : 6.4;
      const dx = Math.cos(e.hd) * sp * dt, dz = Math.sin(e.hd) * sp * dt;
      e.x += dx; e.z += dz; e.vx = Math.cos(e.hd) * sp; e.vz = Math.sin(e.hd) * sp; e.fx = Math.cos(e.hd); e.fz = Math.sin(e.hd);
      e.trail += Math.hypot(dx, dz);
      e.pts[0][0] = e.x; e.pts[0][1] = e.z;
      while (e.trail >= STEP) {
        e.trail -= STEP;
        e.pts.unshift([e.x, e.z]);
        if (e.pts.length > e.len + 6) e.pts.pop();
      }
      if (boosting && Math.random() < 0.4) s.fx.burst(e.x, 0.5, e.z, '#ffffff', 1, 2);
    }
    // va chạm
    for (const e of s.ents) {
      if (!e.alive) continue;
      const wall = Math.abs(e.x) > HX || Math.abs(e.z) > HZ;
      if (wall || this.hitBody(e.x + Math.cos(e.hd) * 0.4, e.z + Math.sin(e.hd) * 0.4, e)) { e.cause = wall ? 'wall' : 'body'; this.kill(e); }
    }
    // ăn ngọc
    for (let i = s.orbs.length - 1; i >= 0; i--) {
      const o = s.orbs[i];
      o.m.rotation.y += dt * 3; o.m.position.y = 0.6 + Math.sin(s.time * 4 + o.ph) * 0.12;
      for (const e of s.ents) {
        if (!e.alive || Math.hypot(e.x - o.x, e.z - o.z) > 1.15) continue;
        e.score++; e.len += 1; ctx.sfx.coin(); ctx.vibrate(e.p.id, 15);
        s.fx.burst(o.x, 0.8, o.z, '#ffffff', 5, 5);
        ctx.scene.remove(o.m); s.orbs.splice(i, 1);
        this.hud();
        break;
      }
    }
    // hình ảnh: thân rắn
    for (const e of s.ents) {
      const n = e.alive ? Math.min(e.len, e.pts.length) - 1 : 0;
      while (e.segs.length < n) { const m = mesh(s.segGeo, e.segMat); ctx.scene.add(m); e.segs.push(m); }
      while (e.segs.length > n) ctx.scene.remove(e.segs.pop());
      for (let i = 0; i < e.segs.length; i++) {
        const q = e.pts[i + 1], k = 1 - (i / Math.max(8, e.segs.length)) * 0.45;
        e.segs[i].position.set(q[0], 0.5 * k, q[1]); e.segs[i].scale.setScalar(k);
      }
      if (e.alive) showBean(e, dt, s.time);
    }
    if (Math.floor(s.t * 2) !== s.lastHud) { s.lastHud = Math.floor(s.t * 2); this.hud(); }
    if (!s.over && s.t >= DURATION) {
      s.over = true;
      const rank = [...s.ents].sort((a, b) => b.score - a.score || a.deaths - b.deaths);
      ctx.finish(rank.map((e) => ({ id: e.p.id, text: `${e.score} ngọc${e.deaths ? ` · chết ${e.deaths}` : ''}` })));
    }
  },

  dispose() {
    if (S) {
      for (const e of S.ents) e.segMat.dispose();
      S.fx.dispose(); S.segGeo.dispose(); S.orbGeo.dispose(); S.orbMats.forEach((m) => m.dispose()); S = null;
    }
  },
};
