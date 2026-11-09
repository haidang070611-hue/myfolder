import * as THREE from 'three';
import { rand, clamp, fmtTime, makeFX } from '/js/util.js';
import { std, glow, mesh, T } from '/js/gfx.js';
import { setupScene, spawnBeans, stepBean, pushApart, showBean } from '/js/party.js';
import { tick, pulse, stick, idle, wobble, chance } from '/js/bots.js';

const HZ = 9, START = -26, END = 26, LIMIT = 70, GRACE = 0.55;
let S = null;

export default {
  id: 'redlight',
  name: 'Đèn Xanh Đèn Đỏ',
  emoji: '🚦',
  color: '#ff4d5e',
  cat: 'race',
  bots: 5,
  tag: '1-8 người · đua tới đích',
  desc: 'Chạy tới đích khi đèn XANH, nhưng phải đứng im khi đèn ĐỎ! Bị phát hiện cử động sẽ bị đẩy về vạch xuất phát. Bấm A để chạy nước rút (khó dừng lại hơn!).',
  cfg: { a: 'NƯỚC RÚT', b: '', gyro: false, hideStick: false, hint: 'Đèn xanh: chạy · Đèn đỏ: BUÔNG cần gạt!' },

  init(ctx) {
    const scene = ctx.scene;
    setupScene(ctx, { bg: 0x1a0f1a, size: 44, cam: [0, 40, 29], look: [0, 0, 0], fogNear: 90, fogFar: 220, light: { sun: 2.3, hemi: 0.65 } });
    S = { ctx, fx: makeFX(THREE, scene), t: 0, time: 0, over: false, lastHud: -1, light: 'green', lt: rand(2.2, 4), turn: 0, firstT: -1, tickT: 0, rank: [] };
    const L = END - START + 10;
    const track = mesh(new THREE.BoxGeometry(L, 1, HZ * 2 + 2), std(0xffffff, { map: T.plate([L / 5, 4], [96, 74, 62]), roughness: 0.6, metalness: 0.2 }), false, true);
    track.position.set((START + END) / 2, -0.5, 0); scene.add(track);
    const line = (x, c) => { const m = mesh(new THREE.BoxGeometry(0.5, 0.06, HZ * 2 + 1), glow(c, 2.2), false); m.position.set(x, 0.05, 0); scene.add(m); };
    line(START - 1.5, 0x4dff88); line(END, 0xffffff);
    // búp bê canh gác
    const doll = new THREE.Group();
    const dm = std(0xffa24a, { roughness: 0.5 });
    const body = mesh(new THREE.CylinderGeometry(0.9, 1.4, 2.6, 18), dm); body.position.y = 1.3;
    const head = new THREE.Group(); head.position.y = 3.3;
    const skull = mesh(new THREE.SphereGeometry(0.95, 20, 14), std(0xffe0c0, { roughness: 0.6 }));
    const hair = mesh(new THREE.SphereGeometry(1.0, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), std(0x2a1a10, { roughness: 0.8 })); hair.position.y = 0.1;
    S.eyeMat = glow(0x2a2a2a, 0.2);
    const eyeG = new THREE.SphereGeometry(0.16, 10, 8);
    const e1 = mesh(eyeG, S.eyeMat, false), e2 = mesh(eyeG, S.eyeMat, false);
    e1.position.set(-0.35, 0.1, 0.85); e2.position.set(0.35, 0.1, 0.85);
    head.add(skull, hair, e1, e2);
    doll.add(body, head);
    doll.position.set(END + 3.5, 0, 0);
    scene.add(doll);
    S.doll = doll; S.head = head; S.eyeGeo = eyeG;
    S.lamp = mesh(new THREE.SphereGeometry(0.7, 16, 12), glow(0x22ee66, 3), false); S.lamp.position.set(END + 3.5, 6.0, 0); scene.add(S.lamp);
    S.ents = spawnBeans(ctx, (i, n) => [START - Math.floor(i / 4) * 1.5, ((i % 4) - (Math.min(n, 4) - 1) / 2) * 3.4],
      () => ({ cd: 0, dash: 0, stun: 0, fin: -1, caught: 0 }));
    head.rotation.y = Math.PI; // đưa lưng về phía người chơi khi xanh
    S.headAng = Math.PI;
    ctx.hud.title('Đèn Xanh Đèn Đỏ');
    this.hud();
  },

  rankKey(e) { return e.fin >= 0 ? 1e4 - e.fin : e.x; },
  hud() {
    S.ctx.hud.board([...S.ents].sort((a, b) => this.rankKey(b) - this.rankKey(a)).map((e) => ({ color: e.p.color, name: e.p.name, text: e.fin >= 0 ? `🏁 ${e.fin.toFixed(1)}s` : `${Math.max(0, Math.round(((e.x - START) / (END - START)) * 100))}%${e.caught ? ' ✋' + e.caught : ''}` })));
  },

  think(dt) {
    const s = S;
    for (const e of s.ents) {
      const p = e.p;
      tick(p, dt, 0.1);
      if (!p.bot) continue;
      const a = p.ai;
      if (e.fin >= 0 || e.stun > 0) { idle(p); continue; }
      if (s.light === 'red') {
        a.seen = (a.seen || 0) + dt;
        const reaction = 0.1 + (1 - p.skill) * 0.55 + (a.jit || 0);   // bot dở phản ứng chậm → hay bị bắt
        if (a.seen >= reaction) { idle(p); continue; }
      } else { a.seen = 0; a.jit = Math.random() * 0.1; }
      const tz = clamp(e.z * 0.9 + wobble(p, 0.2), -HZ + 1, HZ - 1);
      stick(p, 1, (tz - e.z) * -0.0 + wobble(p, 0.15));
      if (s.light === 'green' && s.lt > 1.6 && e.cd <= 0 && p.skill > 0.6 && chance(p, 0.12)) pulse(p, 'a');
    }
  },

  update(dt) {
    const s = S, ctx = s.ctx;
    s.time += dt; s.t += dt; s.fx.update(dt);
    ctx.hud.timer(fmtTime(Math.max(0, LIMIT - s.t)));

    // đổi đèn
    s.lt -= dt;
    if (s.light === 'green') {
      s.tickT -= dt;
      if (s.tickT <= 0) { s.tickT = Math.max(0.12, 0.35 * (s.lt / 3)); ctx.sfx.ping(); }
      if (s.lt <= 0) { s.light = 'red'; s.lt = rand(1.6, 3.0); s.redT = 0; ctx.sfx.warn(); ctx.shake(0.2); }
    } else if (s.lt <= 0) { s.light = 'green'; s.lt = rand(2.2, 4.2); ctx.sfx.pass(); }
    const wantAng = s.light === 'red' ? 0 : Math.PI;
    s.headAng += (wantAng - s.headAng) * Math.min(1, dt * (s.light === 'red' ? 18 : 6));
    s.head.rotation.y = s.headAng;
    const red = s.light === 'red';
    s.lamp.material.emissive.set(red ? 0xff2020 : 0x22ee66);
    s.eyeMat.emissive.set(red ? 0xff2020 : 0x222222); s.eyeMat.emissiveIntensity = red ? 3.5 : 0.2;
    if (red) s.redT += dt;

    for (const e of s.ents) {
      e.cd -= dt; e.dash -= dt; e.stun -= dt;
      if (e.fin >= 0) { e.vx *= 0.9; e.vz *= 0.9; e.x += e.vx * dt; e.z += e.vz * dt; continue; }
      const stunned = e.stun > 0;
      stepBean(e, dt, { acc: stunned ? 0 : 50, drag: e.dash > 0 ? 3.2 : 8.5, max: e.dash > 0 ? 11 : 5.9, lock: stunned });
      if (!stunned && e.p.press.a && e.cd <= 0) { e.vx += 9; e.dash = 0.9; e.cd = 3; ctx.sfx.dash(); s.fx.ring(e.x, e.z, '#ffffff', 2, 0.3); }
      e.z = clamp(e.z, -HZ + 0.5, HZ - 0.5); if (e.x < START - 3) { e.x = START - 3; if (e.vx < 0) e.vx = 0; }
      // bị phát hiện cử động khi đèn đỏ
      if (red && s.redT > GRACE && !stunned && Math.hypot(e.vx, e.vz) > 1.1) {
        e.caught++; e.stun = 1.2; e.x = START - rand(0, 1.5); e.vx = e.vz = 0;
        ctx.sfx.boom(); ctx.shake(0.35); ctx.vibrate(e.p.id, 300);
        s.fx.burst(e.x, 1, e.z, '#ff4d4d', 14, 9); s.fx.ring(e.x, e.z, '#ff4d4d', 4, 0.5);
        this.hud();
      }
      if (e.x >= END) {
        e.fin = s.t; ctx.sfx.lap(); s.fx.burst(e.x, 1.5, e.z, e.p.color, 22, 10); ctx.vibrate(e.p.id, 200);
        if (s.firstT < 0) { s.firstT = s.t; ctx.hud.banner(`${e.p.name} về nhất!`, 1800, true); }
        this.hud();
      }
    }
    pushApart(s.ents.filter((e) => e.fin < 0), 0.62, 0.4);
    for (const e of s.ents) {
      showBean(e, dt, s.time);
      e.g.rotation.z = e.stun > 0 ? Math.sin(s.time * 30) * 0.3 : 0;
    }
    if (Math.floor(s.t * 3) !== s.lastHud) { s.lastHud = Math.floor(s.t * 3); this.hud(); }
    const done = s.ents.every((e) => e.fin >= 0);
    if (!s.over && (done || s.t >= LIMIT || (s.firstT >= 0 && s.t - s.firstT > 14 && s.ents.length > 1))) {
      s.over = true;
      const rank = [...s.ents].sort((a, b) => this.rankKey(b) - this.rankKey(a));
      ctx.finish(rank.map((e) => ({ id: e.p.id, text: e.fin >= 0 ? `${e.fin.toFixed(1)} giây${e.caught ? ` · bị bắt ${e.caught}` : ''}` : `chưa tới đích (${Math.max(0, Math.round(((e.x - START) / (END - START)) * 100))}%)` })));
    }
  },

  dispose() { if (S) { S.fx.dispose(); S = null; } },
};
