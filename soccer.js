import * as THREE from 'three';
import { clamp, fmtTime, makeFX } from '/js/util.js';
import { std, glow, mesh, T } from '/js/gfx.js';
import { setupScene, spawnBeans, stepBean, pushApart, clampRect, showBean, ringMesh } from '/js/party.js';
import { tick, pulse, hold, stick, idle, toward, away, nearest, wobble, chance, ai, segHitsRect } from '/js/bots.js';

const HX = 18, HZ = 10, GW = 3.4, GD = 2.4, BR = 0.85, DURATION = 90;
const TEAM = [{ name: 'ĐỎ', color: '#ff5252' }, { name: 'XANH', color: '#3db2ff' }];
let S = null;

function ballTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d'); g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#16181f';
  for (const [x, y, r] of [[40, 40, 17], [128, 64, 18], [216, 40, 17], [80, 100, 15], [176, 100, 15], [10, 100, 12], [246, 100, 12], [128, 12, 12], [128, 118, 12]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.userData.own = true;
  return t;
}

export default {
  id: 'soccer',
  name: 'Bóng Đá',
  emoji: '⚽',
  cat: 'team',
  bots: 4,
  color: '#3ddc84',
  tag: '1-8 người · 2 đội · 90 giây',
  desc: 'Sân nhỏ, hai đội đỏ/xanh. Dùng cơ thể rê bóng, bấm A để sút. Đội ghi nhiều bàn hơn sau 90 giây thắng.',
  cfg: { a: 'SÚT', b: '', gyro: false, hideStick: false, hint: 'Cần gạt để chạy · chạm bóng để rê · A để sút' },

  init(ctx) {
    const scene = ctx.scene;
    setupScene(ctx, { bg: 0xbcd9f5, sky: [0x3a78d8, 0xcfe6ff, 0x5a6a58, [0.45, 0.5, 0.7]], size: 30, cam: [0, 31, 18], look: [0, 0, 1.5], fogNear: 70, fogFar: 160, light: { sun: 3.0, hemi: 0.7 } });

    const pitch = mesh(new THREE.PlaneGeometry(HX * 2 + 8, HZ * 2 + 8), std(0xffffff, { map: T.stripes([1.5, 1.2], [60, 140, 66], 8), roughness: 0.95, envMapIntensity: 0.15 }), false, true);
    pitch.rotation.x = -Math.PI / 2;
    const apron = mesh(new THREE.PlaneGeometry(300, 300), std(0x2f6f3a, { map: T.grass(60), roughness: 1, envMapIntensity: 0.1 }), false, true);
    apron.rotation.x = -Math.PI / 2; apron.position.y = -0.04;
    scene.add(apron, pitch);

    // vạch kẻ sân
    const lineM = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const line = (x, z, w, d) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), lineM); m.position.set(x, 0.02, z); scene.add(m); };
    line(0, HZ, HX * 2, 0.2); line(0, -HZ, HX * 2, 0.2); line(HX, 0, 0.2, HZ * 2); line(-HX, 0, 0.2, HZ * 2); line(0, 0, 0.2, HZ * 2);
    for (const sx of [-1, 1]) { line(sx * (HX - 3.5), 0, 0.2, GW * 3.2); line(sx * (HX - 1.75), GW * 1.6, 3.5, 0.2); line(sx * (HX - 1.75), -GW * 1.6, 3.5, 0.2); }
    const circ = new THREE.Mesh(new THREE.RingGeometry(3.9, 4.1, 64), lineM); circ.rotation.x = -Math.PI / 2; circ.position.y = 0.02; scene.add(circ);

    // khung thành + lưới
    const postM = std(0xf2f2f2, { roughness: 0.3, metalness: 0.3 });
    const netM = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.35 });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) { const p = mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.5, 12), postM); p.position.set(sx * HX, 1.25, sz * GW); scene.add(p); }
      const bar = mesh(new THREE.CylinderGeometry(0.16, 0.16, GW * 2, 12), postM); bar.rotation.x = Math.PI / 2; bar.position.set(sx * HX, 2.5, 0); scene.add(bar);
      const net = new THREE.Mesh(new THREE.BoxGeometry(GD, 2.5, GW * 2, 5, 5, 10), netM); net.position.set(sx * (HX + GD / 2), 1.25, 0); scene.add(net);
    }
    // biển quảng cáo quanh sân + cột đèn (phát sáng -> bloom)
    const boardM = std(0x1d2438, { roughness: 0.5, metalness: 0.4 });
    for (const sz of [-1, 1]) { const b = mesh(new THREE.BoxGeometry(HX * 2 + 8, 0.9, 0.4), boardM); b.position.set(0, 0.45, sz * (HZ + 2.4)); scene.add(b); const st = mesh(new THREE.BoxGeometry(HX * 2 + 7, 0.1, 0.05), glow(0x3db2ff, 2), false); st.position.set(0, 0.7, sz * (HZ + 2.18)); scene.add(st); }
    for (const [x, z] of [[-HX - 5, -HZ - 4], [HX + 5, -HZ - 4], [-HX - 5, HZ + 4], [HX + 5, HZ + 4]]) {
      const pole = mesh(new THREE.CylinderGeometry(0.2, 0.3, 12, 8), std(0x40444f)); pole.position.set(x, 6, z);
      const head = mesh(new THREE.BoxGeometry(2.4, 0.9, 0.5), glow(0xfff4d8, 4), false); head.position.set(x, 12.2, z);
      scene.add(pole, head);
    }

    const ball = mesh(new THREE.SphereGeometry(BR, 28, 20), std(0xffffff, { map: ballTexture(), roughness: 0.35, envMapIntensity: 0.8 }));
    scene.add(ball);

    S = { ctx, fx: makeFX(THREE, scene), ball, bx: 0, bz: 0, bvx: 0, bvz: 0, last: null, score: [0, 0], t: 0, phase: 'play', wait: 0, over: false, time: 0, lastHud: -1 };
    S.ents = spawnBeans(ctx, (i, n) => {
      const t = i % 2, k = i >> 1, m = Math.ceil((n - t) / 2);
      return [(t ? 1 : -1) * 7, (k - (m - 1) / 2) * 5];
    }, (p, i) => ({ team: i % 2, goals: 0, cd: 0, sx: 0, sz: 0 }));
    S.ents.forEach((e) => {
      e.sx = e.x; e.sz = e.z; e.fx = e.team ? -1 : 1; e.fz = 0; e.ang = Math.atan2(e.fx, e.fz);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.95, 32), new THREE.MeshBasicMaterial({ color: TEAM[e.team].color, side: THREE.DoubleSide, transparent: true, opacity: 0.95 }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; e.g.add(ring);
    });
    ctx.hud.title('Bóng Đá');
    ctx.hud.banner('Đỏ ←  → Xanh', 1400, true);
    this.hud();
  },

  hud() {
    const s = S;
    const rows = [0, 1].map((t) => ({ color: TEAM[t].color, name: `Đội ${TEAM[t].name}`, text: String(s.score[t]) }));
    for (const e of s.ents) rows.push({ color: e.p.color, name: e.p.name, text: e.goals ? `⚽ ${e.goals}` : '' });
    s.ctx.hud.board(rows);
  },

  resetPositions() {
    const s = S;
    s.bx = s.bz = s.bvx = s.bvz = 0; s.last = null;
    for (const e of s.ents) { e.x = e.sx; e.z = e.sz; e.vx = e.vz = 0; e.fx = e.team ? -1 : 1; e.fz = 0; }
  },


  // ---- AI bot: người gần bóng nhất đội là tiền đạo (vòng ra sau bóng rồi sút), người kia giữ khoảng giữa bóng và khung thành nhà ----
  think(dt) {
    const s = S;
    if (s.phase !== 'play') { for (const e of s.ents) if (e.p.bot) idle(e.p); return; }
    const team = [[], []];
    for (const e of s.ents) team[e.team].push(e);
    for (const e of s.ents) {
      const p = e.p;
      if (!p.bot || !tick(p, dt, 0.08)) continue;
      const mates = team[e.team];
      const dBall = Math.hypot(s.bx - e.x, s.bz - e.z);
      const lead = mates.reduce((b, m) => (Math.hypot(s.bx - m.x, s.bz - m.z) < Math.hypot(s.bx - b.x, s.bz - b.z) ? m : b), mates[0]);
      const goalX = e.team ? -HX : HX, ownX = -goalX;
      const ux0 = goalX - s.bx, uz0 = -s.bz, L = Math.hypot(ux0, uz0) || 1;
      const ux = ux0 / L, uz = uz0 / L;
      if (lead === e || mates.length === 1) {
        const bx = s.bx - ux * 1.5, bz = s.bz - uz * 1.5;
        if (Math.hypot(bx - e.x, bz - e.z) > 1.2 && dBall > 2.0) toward(p, e, bx, bz, 1, 0.2);
        else toward(p, e, s.bx + ux, s.bz + uz, 1, 0.1);
        if (dBall < 1.9 && e.cd <= 0 && e.fx * ux + e.fz * uz > 0.6 && chance(p, 0.85)) pulse(p, 'a');
      } else {
        toward(p, e, ownX + (s.bx - ownX) * 0.4, s.bz * 0.5, 0.9, 0.8);
        if (dBall < 1.9 && e.cd <= 0 && e.fx * Math.sign(goalX) > 0.3) pulse(p, 'a');
      }
    }
  },

  update(dt) {
    const s = S, ctx = s.ctx;
    s.time += dt; s.fx.update(dt);
    if (s.phase === 'play') s.t += dt;
    const left = Math.max(0, DURATION - s.t);
    ctx.hud.timer(fmtTime(left));

    for (const e of s.ents) {
      if (s.phase === 'play') {
        e.cd -= dt;
        stepBean(e, dt, { acc: 56, drag: 5.4, max: 9.2 });
      } else { e.vx *= 0.9; e.vz *= 0.9; }
    }
    pushApart(s.ents, 0.62, 0.5);
    for (const e of s.ents) clampRect(e, HX - 0.8, HZ - 0.8);

    if (s.phase === 'play') {
      // bóng
      const k = Math.exp(-0.55 * dt);
      s.bvx *= k; s.bvz *= k;
      s.bx += s.bvx * dt; s.bz += s.bvz * dt;
      if (Math.abs(s.bz) > HZ - BR) { s.bz = Math.sign(s.bz) * (HZ - BR); s.bvz *= -0.8; }
      const inMouth = Math.abs(s.bz) < GW - 0.1;
      if (Math.abs(s.bx) > HX - BR && !inMouth) { s.bx = Math.sign(s.bx) * (HX - BR); s.bvx *= -0.8; }
      if (Math.abs(s.bx) > HX + GD - BR) { s.bx = Math.sign(s.bx) * (HX + GD - BR); s.bvx *= -0.5; }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { // cột dọc
        let dx = s.bx - sx * HX, dz = s.bz - sz * GW;
        const d = Math.hypot(dx, dz);
        if (d < BR + 0.16 && d > 1e-6) {
          dx /= d; dz /= d; s.bx = sx * HX + dx * (BR + 0.16); s.bz = sz * GW + dz * (BR + 0.16);
          const vn = s.bvx * dx + s.bvz * dz;
          if (vn < 0) { s.bvx -= 1.8 * vn * dx; s.bvz -= 1.8 * vn * dz; ctx.sfx.ping(); }
        }
      }
      for (const e of s.ents) {
        let dx = s.bx - e.x, dz = s.bz - e.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.62 + BR && d > 1e-6) {
          dx /= d; dz /= d;
          s.bx = e.x + dx * (0.62 + BR); s.bz = e.z + dz * (0.62 + BR);
          const rel = (s.bvx - e.vx) * dx + (s.bvz - e.vz) * dz;
          if (rel < 0) { s.bvx -= 1.3 * rel * dx; s.bvz -= 1.3 * rel * dz; }
          s.bvx += dx * 2.2; s.bvz += dz * 2.2;
          s.last = e;
        }
        if (e.p.press.a && e.cd <= 0) {
          e.cd = 0.4;
          const bd = Math.hypot(s.bx - e.x, s.bz - e.z);
          if (bd < 2.5) {
            const nx = (s.bx - e.x) / (bd || 1), nz = (s.bz - e.z) / (bd || 1);
            let kx = e.fx * 0.55 + nx * 0.45, kz = e.fz * 0.55 + nz * 0.45;
            const kl = Math.hypot(kx, kz) || 1; kx /= kl; kz /= kl;
            s.bvx = kx * 25 + e.vx * 0.3; s.bvz = kz * 25 + e.vz * 0.3; s.last = e;
            ctx.sfx.kick(); ctx.vibrate(e.p.id, 60); s.fx.burst(s.bx, 0.5, s.bz, '#ffffff', 5, 4); s.fx.ring(s.bx, s.bz, '#ffffff', 2.4, 0.3);
          }
        }
      }
      // bàn thắng: tâm bóng vượt vạch cầu môn
      if (Math.abs(s.bx) > HX + 0.1 && Math.abs(s.bz) < GW) {
        const team = s.bx > 0 ? 0 : 1; // bóng vào lưới bên phải => đội đỏ ghi
        s.score[team]++;
        let who = '';
        if (s.last && s.last.team === team) { s.last.goals++; who = s.last.p.name; }
        ctx.sfx.goal(); ctx.shake(0.9);
        for (const e of s.ents) if (e.team === team) ctx.vibrate(e.p.id, 250);
        for (let i = 0; i < 4; i++) s.fx.burst(s.bx, 1.5, s.bz, i % 2 ? TEAM[team].color : '#ffd23f', 14, 14);
        ctx.hud.banner(`⚽ GOAL! ${who || 'Đội ' + TEAM[team].name}`, 2000, true);
        s.phase = 'goal'; s.wait = 2.2;
        this.hud();
      }
      if (!s.over && s.t >= DURATION) this.end();
    } else if (s.phase === 'goal') {
      s.wait -= dt;
      s.bvx *= 0.96; s.bvz *= 0.96; s.bx += s.bvx * dt; s.bz += s.bvz * dt;
      if (Math.abs(s.bx) > HX + GD - BR) { s.bx = Math.sign(s.bx) * (HX + GD - BR); s.bvx = 0; }
      if (s.wait <= 0) { this.resetPositions(); s.phase = 'play'; }
    }

    s.ball.position.set(s.bx, BR, s.bz);
    s.ball.rotation.x += (s.bvz * dt) / BR;
    s.ball.rotation.z -= (s.bvx * dt) / BR;
    for (const e of s.ents) showBean(e, dt, s.time);
  },

  end() {
    const s = S;
    s.over = true;
    const [r, b] = s.score;
    const winTeam = r === b ? -1 : r > b ? 0 : 1;
    const rank = [...s.ents].sort((a, c) => (c.team === winTeam) - (a.team === winTeam) || c.goals - a.goals);
    s.ctx.finish(rank.map((e) => ({ id: e.p.id, text: `${TEAM[e.team].name} · ${e.goals} bàn · tỉ số ${r}-${b}` })));
  },

  dispose() { if (S) { S.fx.dispose(); S = null; } },
};
