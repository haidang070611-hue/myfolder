import * as THREE from 'three';
import { clamp, rand, makeFX, fmtTime } from '/js/util.js';
import { std, glow, mesh, T, skyDome } from '/js/gfx.js';
import { setupScene, spawnBeans, showBean, hudRows } from '/js/party.js';
import { ai } from '/js/bots.js';

const LEN = 100;         // chiều dài đường chạy
const LANE = 2.3;
const VMAX = 12.5;
let S = null;

export default {
  id: 'sprint',
  name: 'Chạy Nước Rút',
  emoji: '🏃',
  cat: 'race',
  bots: 5,
  color: '#ff8a3d',
  tag: '1-8 người · 100 mét',
  desc: 'Cuộc thi chạy 100 mét! Bấm A và B thật nhanh để chạy, bấm luân phiên hai nút sẽ nhanh hơn bấm một nút. Ai về đích đầu tiên là vô địch.',
  cfg: { a: 'A', b: 'B', gyro: false, hideStick: true, hint: 'Bấm A rồi B luân phiên thật nhanh để chạy!' },

  init(ctx) {
    const scene = ctx.scene;
    setupScene(ctx, { bg: 0x9fd4ff, size: 40, cam: [0, 11, 17], look: [0, 0, 0], fogNear: 70, fogFar: 170, light: { sun: 2.6, hemi: 0.8 } });
    scene.add(skyDome(0x4a8ff0, 0xcfe6ff, 0x6a8a60, [0.5, 0.45, 0.6], 0xfff0cc));
    scene.background = null;
    const n = ctx.players.length;
    const W = n * LANE + 4;
    // đường chạy + bãi cỏ
    const track = mesh(new THREE.BoxGeometry(LEN + 40, 0.6, W), std(0xffffff, { map: T.plate([(LEN + 40) / 8, Math.max(1, n / 2)], [170, 84, 62]), roughness: 0.85 }), false, true);
    track.position.set(LEN / 2, -0.3, 0); scene.add(track);
    const grass = mesh(new THREE.BoxGeometry(LEN + 200, 0.5, 90), std(0xffffff, { map: T.grass(50), roughness: 1 }), false, true);
    grass.position.set(LEN / 2, -0.6, 0); scene.add(grass);
    const x0 = -3, x1 = LEN;
    // vạch kẻ làn
    for (let i = 0; i <= n; i++) {
      const z = (i - n / 2) * LANE;
      const l = mesh(new THREE.BoxGeometry(LEN + 6, 0.04, 0.09), std(0xffffff, { roughness: 0.6 }), false);
      l.position.set(LEN / 2 - 1.5, 0.02, z); scene.add(l);
    }
    // mốc mỗi 10m
    for (let m = 0; m <= LEN; m += 10) {
      const mk = mesh(new THREE.BoxGeometry(0.18, 0.05, W - 2), std(0xffffff, { roughness: 0.6 }), false);
      mk.position.set(m, 0.025, 0); mk.material = mk.material.clone(); mk.material.opacity = m === 0 ? 1 : 0.4; mk.material.transparent = true;
      scene.add(mk);
    }
    // cổng về đích
    const gate = new THREE.Group();
    const gm = glow(0xffd23f, 2.2);
    for (const z of [-W / 2 + 0.3, W / 2 - 0.3]) { const p = mesh(new THREE.CylinderGeometry(0.22, 0.22, 5, 10), std(0xdddddd, { metalness: 0.6, roughness: 0.35 })); p.position.set(0, 2.5, z); gate.add(p); }
    const beam = mesh(new THREE.BoxGeometry(0.6, 1.1, W), std(0xffffff, { map: T.stripes ? T.stripes([6, 1]) : null, roughness: 0.5 }));
    beam.position.set(0, 5, 0); gate.add(beam);
    const strip = mesh(new THREE.BoxGeometry(0.5, 0.05, W - 1), gm, false); strip.position.set(0, 0.04, 0); gate.add(strip);
    gate.position.x = LEN; scene.add(gate);
    // khán đài giả: các cột đèn
    for (let m = 0; m <= LEN + 20; m += 20) for (const sz of [-1, 1]) {
      const pole = mesh(new THREE.CylinderGeometry(0.12, 0.16, 4.5, 8), std(0x40464f, { roughness: 0.5, metalness: 0.6 })); pole.position.set(m, 2.25, sz * (W / 2 + 2.2));
      const lamp = mesh(new THREE.SphereGeometry(0.4, 10, 8), glow(0xfff2c4, 1.6), false); lamp.position.set(m, 4.6, sz * (W / 2 + 2.2));
      scene.add(pole, lamp);
    }

    S = { ctx, fx: makeFX(THREE, scene), t: 0, time: 0, over: false, firstT: -1, fin: 0, scene, camX: 6, lastHud: -1, W };
    S.ents = spawnBeans(ctx, (i, m) => [x0 + 0.5, (i - (m - 1) / 2) * LANE], () => ({ v: 0, pow: 0, last: '', taps: 0, finT: -1 }));
    S.ents.forEach((e) => { e.fx = 1; e.fz = 0; e.ang = Math.PI / 2; });
    ctx.hud.title('Chạy Nước Rút');
    this.hud();
  },

  hud() {
    const s = S;
    const arr = [...s.ents].sort((a, b) => (b.finT >= 0 ? 1e4 - b.finT : b.x) - (a.finT >= 0 ? 1e4 - a.finT : a.x));
    s.ctx.hud.board(arr.map((e) => ({ color: e.p.color, name: e.p.name, text: e.finT >= 0 ? `🏁 ${e.finT.toFixed(2)}s` : `${Math.max(0, Math.min(99, Math.round(e.x)))}m` })));
  },

  // bot: bấm luân phiên A/B, nhịp độ phụ thuộc kỹ năng, thỉnh thoảng hụt nhịp
  think(dt) {
    const s = S;
    for (const e of s.ents) {
      const p = e.p;
      if (!p.bot) continue;
      const a = ai(p);
      for (const k of ['a', 'b']) if (a.rel[k] > 0 && (a.rel[k] -= dt) <= 0) p.input[k] = 0;
      a.t -= dt;
      if (a.t > 0 || e.finT >= 0) continue;
      const rate = 5.2 + 4.6 * p.skill;                    // lần bấm / giây
      a.t = (1 / rate) * (0.85 + Math.random() * 0.3);
      if (Math.random() < (1 - p.skill) * 0.12) continue;   // hụt nhịp
      a.k = a.k ? 0 : 1;
      const key = a.k ? 'a' : 'b';
      p.input[key] = 1; a.rel[key] = 0.045;
    }
  },

  update(dt) {
    const s = S, ctx = s.ctx;
    s.time += dt; s.fx.update(dt);
    if (dt > 0) s.t += dt;
    ctx.hud.timer(fmtTime(s.t));

    for (const e of s.ents) {
      if (e.finT < 0 && dt > 0) {
        let hit = '';
        if (e.p.press.a) hit = 'a'; else if (e.p.press.b) hit = 'b';
        if (e.p.press.a && e.p.press.b) hit = e.last === 'a' ? 'b' : 'a';
        if (hit) {
          e.pow += hit !== e.last ? 1.0 : 0.45;
          e.last = hit; e.taps++;
          if (e.taps % 8 === 0) ctx.vibrate(e.p.id, 12);
        }
      }
      e.pow = Math.max(0, e.pow - dt * 5);
      let vt = clamp(e.pow / 1.55, 0, 1.15) * VMAX;
      if (e.finT >= 0) vt = Math.max(0, e.v - 14 * dt);        // về đích rồi thì chậm dần
      e.v += (vt - e.v) * Math.min(1, dt * 4.2);
      e.vx = e.v; e.vz = 0;
      e.x += e.v * dt;
      if (e.finT < 0 && e.x >= LEN) {
        e.finT = s.t; s.fin++;
        ctx.sfx.lap(); ctx.vibrate(e.p.id, 250);
        s.fx.burst(LEN, 1.5, e.z, e.p.color, 16, 9);
        if (s.firstT < 0) { s.firstT = s.t; ctx.hud.banner(`🏁 ${e.p.name} về nhất!`, 1800, true, e.p.color); ctx.shake(0.4); }
      }
      if (e.v > 8 && Math.random() < dt * 6) s.fx.burst(e.x - 0.4, 0.2, e.z, '#e8caa0', 1, 2);
    }

    // camera bám đoàn chạy
    let lead = 0, last = 1e9;
    for (const e of s.ents) { lead = Math.max(lead, e.x); last = Math.min(last, e.x); }
    const target = clamp((lead * 0.7 + last * 0.3) + 4, 4, LEN - 8);
    s.camX += (target - s.camX) * Math.min(1, dt * 3);
    ctx.camera.position.set(s.camX - 1, 11, 17.5);
    ctx.camera.lookAt(s.camX + 1.5, 0.4, 0);

    for (const e of s.ents) showBean(e, dt, s.time);
    if (Math.floor(s.t * 4) !== s.lastHud) { s.lastHud = Math.floor(s.t * 4); this.hud(); }

    if (!s.over && dt > 0 && (s.fin >= s.ents.length || (s.firstT >= 0 && s.t - s.firstT > 9) || s.t > 45)) this.end();
  },

  end() {
    const s = S;
    if (s.over) return;
    s.over = true;
    const rank = [...s.ents].sort((a, b) => (b.finT >= 0 ? 1e4 - b.finT : b.x) - (a.finT >= 0 ? 1e4 - a.finT : a.x));
    s.ctx.finish(rank.map((e) => ({ id: e.p.id, text: e.finT >= 0 ? `${e.finT.toFixed(2)} giây` : `chạy được ${Math.round(e.x)}m` })));
  },

  dispose() { if (S) { S.fx.dispose(); S = null; } },
};
