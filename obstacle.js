import * as THREE from 'three';
import { clamp, fmtTime, makeFX } from '/js/util.js';
import { std, glow, mesh, T } from '/js/gfx.js';
import { setupScene, spawnBeans, stepBean, pushApart, showBean } from '/js/party.js';
import { tick, pulse, stick, wobble, chance } from '/js/bots.js';

const HZ = 7, END = 112, LIMIT = 80, START_X = -3;
let S = null;

// các chướng ngại: sweeper = thanh quay, slider = khối trượt ngang đường, pillar = cột cố định
function buildCourse() {
  const o = [];
  let x = 12;
  const kinds = ['sweeper', 'slider', 'pillars', 'sweeper', 'slider', 'sweeper2', 'pillars', 'slider2'];
  let k = 0;
  while (x < END - 10) {
    const kind = kinds[k++ % kinds.length];
    if (kind === 'sweeper') o.push({ t: 'sweeper', x, z: 0, len: 5.2, w: 0.5, sp: 1.7, ph: Math.random() * 6 });
    else if (kind === 'sweeper2') { o.push({ t: 'sweeper', x, z: -3.6, len: 3.6, w: 0.5, sp: 2.2, ph: 0 }); o.push({ t: 'sweeper', x, z: 3.6, len: 3.6, w: 0.5, sp: -2.2, ph: 1.5 }); }
    else if (kind === 'slider') o.push({ t: 'slider', x, hw: 0.8, hd: 2.3, amp: HZ - 2.4, sp: 1.5, ph: Math.random() * 6, z: 0 });
    else if (kind === 'slider2') { o.push({ t: 'slider', x, hw: 0.7, hd: 1.8, amp: HZ - 1.9, sp: 1.9, ph: 0, z: 0 }); o.push({ t: 'slider', x: x + 3.4, hw: 0.7, hd: 1.8, amp: HZ - 1.9, sp: 1.9, ph: 3.14, z: 0 }); }
    else for (let i = 0; i < 5; i++) o.push({ t: 'pillar', x: x + (i % 2) * 1.4, z: -5.4 + i * 2.7, r: 0.9 });
    x += 12;
  }
  return o;
}

export default {
  id: 'obstacle',
  name: 'Vượt Chướng Ngại',
  emoji: '🚧',
  color: '#ff5a8a',
  cat: 'race',
  bots: 4,
  tag: '1-8 người · đua tới đích',
  desc: 'Chạy tới vạch đích qua thanh quay, khối trượt và cột chắn. Bị đập sẽ văng ngược và choáng. Bấm A để lao nhanh nhưng đừng lao đúng vào bẫy!',
  cfg: { a: 'LAO', b: '', gyro: false, hideStick: false, hint: 'Chạy sang phải tới đích · A để lao' },

  init(ctx) {
    const scene = ctx.scene;
    setupScene(ctx, { bg: 0x120a18, size: 40, cam: [0, 26, 14], look: [0, 0, 0], fogNear: 80, fogFar: 200, light: { sun: 2.4, hemi: 0.6 } });
    S = { ctx, fx: makeFX(THREE, scene), t: 0, time: 0, over: false, lastHud: -1, firstT: -1, finished: [], cx: 0, obs: buildCourse() };
    const L = END + 30;
    const track = mesh(new THREE.BoxGeometry(L, 1, HZ * 2 + 1), std(0xffffff, { map: T.plate([L / 5, 3], [78, 62, 92]), roughness: 0.55, metalness: 0.35 }), false, true);
    track.position.set(L / 2 - 20, -0.5, 0); scene.add(track);
    const rail = glow(0xff5a8a, 2.2);
    for (const z of [-HZ - 0.4, HZ + 0.4]) { const m = mesh(new THREE.BoxGeometry(L, 0.5, 0.3), rail, false); m.position.set(L / 2 - 20, 0.25, z); scene.add(m); }
    // vạch xuất phát/đích
    const line = (x, c) => { const m = mesh(new THREE.BoxGeometry(0.6, 0.06, HZ * 2), glow(c, 2), false); m.position.set(x, 0.05, 0); scene.add(m); };
    line(START_X - 1.5, 0x4dff88); line(END, 0xffffff);
    const arch = mesh(new THREE.BoxGeometry(0.5, 4.5, 0.5), std(0xffffff), true); arch.position.set(END, 2.2, HZ + 0.6);
    const arch2 = arch.clone(); arch2.position.z = -HZ - 0.6;
    const top = mesh(new THREE.BoxGeometry(0.6, 0.7, HZ * 2 + 1.7), glow(0xffd23f, 2), false); top.position.set(END, 4.6, 0);
    scene.add(arch, arch2, top);
    // dựng chướng ngại
    S.barGeo = new THREE.BoxGeometry(1, 0.7, 1);
    S.hubGeo = new THREE.CylinderGeometry(0.7, 0.8, 1.2, 14);
    S.pilGeo = new THREE.CylinderGeometry(0.9, 0.9, 2.2, 16);
    S.matBar = glow(0xff4d5e, 1.6); S.matHub = std(0x2a2f48, { metalness: 0.7, roughness: 0.3 });
    S.matSl = std(0xffb13a, { roughness: 0.35, metalness: 0.4, emissive: 0x663300, emissiveIntensity: 0.7 }); S.matPil = std(0x55608a, { roughness: 0.4, metalness: 0.5 });
    for (const o of S.obs) {
      if (o.t === 'sweeper') {
        const g = new THREE.Group();
        const bar = mesh(S.barGeo, S.matBar); bar.scale.set(o.len * 2, 1, o.w * 2); bar.position.y = 0.4;
        const hub = mesh(S.hubGeo, S.matHub); hub.position.y = 0.6;
        g.add(bar, hub); g.position.set(o.x, 0, o.z); scene.add(g); o.g = g; o.ang = o.ph;
      } else if (o.t === 'slider') {
        const m = mesh(S.barGeo, S.matSl); m.scale.set(o.hw * 2, 1.4, o.hd * 2); m.position.set(o.x, 0.7, 0); scene.add(m); o.g = m;
      } else { const m = mesh(S.pilGeo, S.matPil); m.position.set(o.x, 1.1, o.z); scene.add(m); o.g = m; }
    }
    S.ents = spawnBeans(ctx, (i, n) => [START_X - Math.floor(i / 4) * 1.6, ((i % 4) - (Math.min(n, 4) - 1) / 2) * 2.4], () => ({ cd: 0, dash: 0, stun: 0, fin: -1, hits: 0 }));
    ctx.hud.title('Vượt Chướng Ngại');
    this.hud();
  },

  hud() {
    S.ctx.hud.board([...S.ents].sort((a, b) => this.rankKey(b) - this.rankKey(a)).map((e) => ({ color: e.p.color, name: e.p.name, text: e.fin >= 0 ? `🏁 ${e.fin.toFixed(1)}s` : `${Math.max(0, Math.round(((e.x - START_X) / (END - START_X)) * 100))}%` })));
  },
  rankKey(e) { return e.fin >= 0 ? 1e4 - e.fin : e.x; },

  sliderZ(o, t) { return Math.sin(t * o.sp + o.ph) * o.amp; },

  /** độ xâm phạm tại (x, z) vào chướng ngại ở thời điểm S.time + dt (dùng chung cho va chạm và bot) */
  pen(x, z, dt = 0, r = 0.55) {
    const t = S.time + dt;
    let best = 0, info = null;
    for (const o of S.obs) {
      if (Math.abs(o.x - x) > 6.5) continue;
      if (o.t === 'sweeper') {
        const a = o.ph + t * o.sp, ca = Math.cos(a), sa = Math.sin(a);
        const dx = x - o.x, dz = z - o.z;
        const along = clamp(dx * ca + dz * sa, -o.len, o.len);
        const px = o.x + ca * along, pz = o.z + sa * along;
        const d = Math.hypot(x - px, z - pz), lim = o.w + r;
        if (d < lim && lim - d > best) { best = lim - d; info = { o, nx: (x - px) / (d || 1), nz: (z - pz) / (d || 1), k: 'bar' }; }
        if (Math.hypot(dx, dz) < 0.9 + r && 0.9 + r - Math.hypot(dx, dz) > best) { const dd = Math.hypot(dx, dz) || 1; best = 0.9 + r - dd; info = { o, nx: dx / dd, nz: dz / dd, k: 'hub' }; }
      } else if (o.t === 'slider') {
        const cz = this.sliderZ(o, t);
        const ox = Math.abs(x - o.x) - (o.hw + r), oz = Math.abs(z - cz) - (o.hd + r);
        if (ox < 0 && oz < 0) {
          const pen = Math.min(-ox, -oz);
          if (pen > best) { best = pen; info = -ox < -oz ? { o, nx: Math.sign(x - o.x) || 1, nz: 0, k: 'slider' } : { o, nx: 0, nz: Math.sign(z - cz) || 1, k: 'slider' }; }
        }
      } else {
        const d = Math.hypot(x - o.x, z - o.z), lim = o.r + r;
        if (d < lim && lim - d > best) { best = lim - d; info = { o, nx: (x - o.x) / (d || 1), nz: (z - o.z) / (d || 1), k: 'pillar' }; }
      }
    }
    return { pen: best, info };
  },

  think(dt) {
    const s = S;
    for (const e of s.ents) {
      const p = e.p;
      if (!p.bot || !tick(p, dt, 0.06)) continue;
      if (e.fin >= 0) { stick(p, 0, 0); continue; }
      let pick = 0, pc = 1e9;
      for (const off of [-1.1, -0.75, -0.4, -0.15, 0, 0.15, 0.4, 0.75, 1.1]) {
        let cost = Math.abs(off) * 0.9 + wobble(p, 0.6);
        for (const [dist, tt] of [[1.5, 0.2], [3.0, 0.45], [4.6, 0.7]]) {
          const px = e.x + Math.cos(off) * dist, pz = e.z + Math.sin(off) * dist;
          if (Math.abs(pz) > HZ - 0.4) cost += 6;
          const r = this.pen(px, pz, tt * (0.6 + p.skill * 0.4), 0.7).pen;
          cost += r * 14 / (dist * 0.5);
        }
        cost -= Math.cos(off) * 2; // thích đi thẳng
        if (cost < pc) { pc = cost; pick = off; }
      }
      stick(p, Math.cos(pick), Math.sin(pick));
      if (e.cd <= 0 && pc < -1.2 && Math.abs(pick) < 0.2 && chance(p, 0.5) && this.pen(e.x + 5, e.z, 0.5, 0.7).pen === 0) pulse(p, 'a');
    }
  },

  update(dt) {
    const s = S, ctx = s.ctx;
    s.time += dt; s.t += dt; s.fx.update(dt);
    ctx.hud.timer(fmtTime(Math.max(0, LIMIT - s.t)));
    for (const o of s.obs) {
      if (o.t === 'sweeper') { o.g.rotation.y = -(o.ph + s.time * o.sp); }
      else if (o.t === 'slider') o.g.position.z = this.sliderZ(o, s.time);
    }
    const xs = s.ents.map((e) => e.x), lead = Math.max(...xs), tail = Math.min(...xs);
    for (const e of s.ents) {
      e.cd -= dt; e.dash -= dt; e.stun -= dt;
      if (e.fin >= 0) { e.vx *= 0.9; e.vz *= 0.9; e.x += e.vx * dt; continue; }
      const stunned = e.stun > 0;
      const catchup = lead - e.x > 24 ? 1.15 : 1;
      stepBean(e, dt, { acc: stunned ? 0 : 54, drag: 5.0, max: (e.dash > 0 ? 14 : 8.6) * catchup, lock: stunned });
      if (!stunned && e.p.press.a && e.cd <= 0) { e.vx += e.fx * 12; e.vz += e.fz * 12; e.dash = 0.25; e.cd = 1.5; ctx.sfx.dash(); s.fx.ring(e.x, e.z, '#ffffff', 2, 0.3); }
      e.z = clamp(e.z, -HZ + 0.4, HZ - 0.4); if (e.x < START_X - 3) { e.x = START_X - 3; if (e.vx < 0) e.vx = 0; }
      // va chạm chướng ngại
      const { pen, info } = this.pen(e.x, e.z);
      if (pen > 0 && info) {
        e.x += info.nx * pen; e.z += info.nz * pen;
        const hurt = info.k === 'bar' || info.k === 'hub' || info.k === 'slider';
        if (hurt && e.stun <= -0.3) {
          e.stun = 0.55; e.hits++;
          const kick = info.k === 'bar' ? 13 : 10;
          e.vx = info.nx * kick - (info.k === 'slider' ? 2 : 0); e.vz = info.nz * kick;
          ctx.sfx.hit(); ctx.shake(0.3); ctx.vibrate(e.p.id, 150);
          s.fx.burst(e.x, 1, e.z, '#ff6a6a', 8, 7);
        } else { const vn = e.vx * info.nx + e.vz * info.nz; if (vn < 0) { e.vx -= vn * info.nx; e.vz -= vn * info.nz; } }
      }
      if (e.x >= END) {
        e.fin = s.t; s.finished.push(e); ctx.sfx.lap(); s.fx.burst(e.x, 1.5, e.z, e.p.color, 20, 10); ctx.vibrate(e.p.id, 200);
        if (s.firstT < 0) { s.firstT = s.t; ctx.hud.banner(`${e.p.name} về nhất!`, 1800, true); }
        this.hud();
      }
    }
    pushApart(s.ents.filter((e) => e.fin < 0), 0.62, 0.4);

    // camera theo cả nhóm
    const pack = s.ents.filter((e) => e.fin < 0);
    const lo = pack.length ? Math.min(...pack.map((e) => e.x)) : lead, hi = pack.length ? Math.max(...pack.map((e) => e.x)) : lead;
    const tx = (lo + hi) / 2 + 3, spread = clamp(hi - lo, 0, 40);
    s.cx += (tx - s.cx) * Math.min(1, dt * 3);
    const h = 21 + spread * 0.55;
    ctx.camera.position.set(s.cx, h, h * 0.52);
    ctx.camera.lookAt(s.cx, 0, 0);

    for (const e of s.ents) {
      showBean(e, dt, s.time);
      e.g.rotation.z = e.stun > 0 ? Math.sin(s.time * 30) * 0.25 : 0;
    }
    if (Math.floor(s.t * 3) !== s.lastHud) { s.lastHud = Math.floor(s.t * 3); this.hud(); }
    const done = s.ents.every((e) => e.fin >= 0);
    if (!s.over && (done || s.t >= LIMIT || (s.firstT >= 0 && s.t - s.firstT > 14 && s.ents.length > 1))) {
      s.over = true;
      const rank = [...s.ents].sort((a, b) => this.rankKey(b) - this.rankKey(a));
      ctx.finish(rank.map((e) => ({ id: e.p.id, text: e.fin >= 0 ? `${e.fin.toFixed(1)} giây` : `chưa tới đích (${Math.max(0, Math.round(((e.x - START_X) / (END - START_X)) * 100))}%)` })));
    }
  },

  dispose() {
    if (S) {
      S.fx.dispose(); S.barGeo.dispose(); S.hubGeo.dispose(); S.pilGeo.dispose();
      [S.matBar, S.matHub, S.matSl, S.matPil].forEach((m) => m.dispose()); S = null;
    }
  },
};
