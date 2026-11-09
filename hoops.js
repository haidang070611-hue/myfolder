import * as THREE from 'three';
import { clamp, rand, fmtTime, makeFX } from '/js/util.js';
import { std, glow, mesh, T } from '/js/gfx.js';
import { setupScene, spawnBeans, showBean } from '/js/party.js';
import { tick, hold, ai } from '/js/bots.js';

const DURATION = 45, GAP = 4.6, RIM_Y = 5.2, RIM_Z = -4;
let S = null;

export default {
  id: 'hoops',
  name: 'Ném Rổ',
  emoji: '🏀',
  cat: 'party',
  bots: 4,
  color: '#ff8a2a',
  tag: '1-8 người · 45 giây',
  desc: 'Giữ nút A để nạp lực, thả ra khi vạch chạy đúng vùng xanh trên thanh lực! Vùng xanh thay đổi sau mỗi cú ném. Vào rổ chuẩn +3, sát rổ +2.',
  cfg: { a: 'GIỮ & THẢ', b: '', gyro: false, hideStick: true, hint: 'Giữ A nạp lực · thả khi vạch chạm vùng xanh' },

  init(ctx) {
    const scene = ctx.scene;
    const n = ctx.players.length;
    setupScene(ctx, { bg: 0x2a1c14, size: 26, cam: [0, 9, 22 + n * 0.8], look: [0, 3.2, -1], fogNear: 70, fogFar: 150, light: { sun: 2.6, hemi: 0.55, color: 0xffe2c0, dir: [0.3, 1, 0.9] } });
    const W = n * GAP + 6;
    const court = mesh(new THREE.BoxGeometry(W + 6, 1, 20), std(0xffffff, { map: T.noise('court', [176, 122, 66], 34, 6), roughness: 0.35, metalness: 0.1, envMapIntensity: 0.6 }), false, true);
    court.position.set(0, -0.5, 0); scene.add(court);
    const wall = mesh(new THREE.BoxGeometry(W + 6, 14, 0.6), std(0xffffff, { map: T.plate([W / 5, 3], [52, 58, 88]), roughness: 0.7 }), false, true);
    wall.position.set(0, 7, RIM_Z - 3); scene.add(wall);
    S = { ctx, fx: makeFX(THREE, scene), t: 0, time: 0, over: false, lastHud: -1, balls: [] };
    const orange = std(0xf0701a, { roughness: 0.75, envMapIntensity: 0.4 });
    S.ballGeo = new THREE.SphereGeometry(0.5, 20, 16); S.ballMat = orange;
    const metal = std(0xff4a1a, { metalness: 0.8, roughness: 0.3, emissive: 0x501000, emissiveIntensity: 0.6 });
    S.ents = spawnBeans(ctx, (i, m) => [(i - (m - 1) / 2) * GAP, 3.5], () => ({ score: 0, makes: 0, shots: 0, charge: 0, dir: 1, charging: false, ideal: 0.6, cd: 0, flight: null }));
    for (const e of S.ents) {
      e.fx = 0; e.fz = -1; e.ang = Math.PI;
      // bảng rổ + vành
      const board = mesh(new THREE.BoxGeometry(2.8, 1.9, 0.12), std(0xf4f6ff, { roughness: 0.2, metalness: 0.1 }), true); board.position.set(e.x, RIM_Y + 0.5, RIM_Z - 0.55); scene.add(board);
      const sq = mesh(new THREE.BoxGeometry(1.1, 0.8, 0.14), std(0xd8283a), false); sq.position.set(e.x, RIM_Y + 0.2, RIM_Z - 0.5); scene.add(sq);
      const rim = mesh(new THREE.TorusGeometry(0.62, 0.06, 8, 24), metal, false); rim.rotation.x = Math.PI / 2; rim.position.set(e.x, RIM_Y, RIM_Z); scene.add(rim);
      const net = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.35, 0.7, 10, 3, true), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.5 })); net.position.set(e.x, RIM_Y - 0.38, RIM_Z); scene.add(net);
      // thanh lực
      const frame = mesh(new THREE.BoxGeometry(0.5, 3.4, 0.15), std(0x15171f, { roughness: 0.4 }), false); frame.position.set(e.x + 1.7, 2.2, 3.5); scene.add(frame);
      const zone = mesh(new THREE.BoxGeometry(0.56, 0.5, 0.2), glow(0x4dff88, 2), false); zone.position.set(e.x + 1.7, 2.2, 3.5); scene.add(zone);
      const ptr = mesh(new THREE.BoxGeometry(0.9, 0.1, 0.25), glow(0xffffff, 3), false); ptr.position.set(e.x + 1.7, 0.6, 3.5); scene.add(ptr);
      Object.assign(e, { zone, ptr });
      e.ideal = rand(0.45, 0.8);
      const ball = new THREE.Mesh(S.ballGeo, S.ballMat); ball.castShadow = true; ball.visible = false; scene.add(ball); e.ball = ball;
    }
    ctx.hud.title('Ném Rổ');
    this.hud();
  },

  hud() { S.ctx.hud.board([...S.ents].sort((a, b) => b.score - a.score).map((e) => ({ color: e.p.color, name: e.p.name, text: `${e.score} · ${e.makes}/${e.shots}` }))); },
  meterY(v) { return 0.6 + v * 3.2 * 0.9 - 0.0; },

  update(dt) {
    const s = S, ctx = s.ctx;
    s.time += dt; s.t += dt; s.fx.update(dt);
    ctx.hud.timer(fmtTime(Math.max(0, DURATION - s.t)));
    for (const e of s.ents) {
      e.cd -= dt;
      const a = e.p.input.a;
      if (!e.flight && e.cd <= 0) {
        if (a && !e.charging) { e.charging = true; e.charge = 0; e.dir = 1; }
        if (e.charging) {
          e.charge += e.dir * dt * 1.15;
          if (e.charge >= 1) { e.charge = 1; e.dir = -1; } else if (e.charge <= 0) { e.charge = 0; e.dir = 1; }
          if (!a) this.shoot(e);
        }
      }
      // thanh lực
      e.zone.position.y = 0.6 + e.ideal * 2.9; e.ptr.position.y = 0.6 + (e.charging ? e.charge : 0) * 2.9;
      e.ptr.visible = true;
      // bóng đang bay
      if (e.flight) {
        const f = e.flight; f.t += dt; const u = Math.min(1, f.t / f.dur);
        const x = f.x0 + (f.x1 - f.x0) * u, z = f.z0 + (f.z1 - f.z0) * u;
        const y = f.y0 + (f.y1 - f.y0) * u + Math.sin(u * Math.PI) * f.arc;
        e.ball.position.set(x, y, z); e.ball.rotation.x += dt * 8;
        if (u >= 1) {
          if (f.res.pts > 0) {
            e.score += f.res.pts; e.makes++; ctx.sfx.coin(); if (f.res.pts === 3) { ctx.sfx.gem(); ctx.hud.banner(`🏀 ${e.p.name} +3!`, 700, true); }
            s.fx.burst(e.x, RIM_Y - 0.3, RIM_Z, '#ffd23f', 12, 8); ctx.vibrate(e.p.id, 60); this.hud();
            f.drop = 0.35; f.res.pts = 0; f.fall = true; f.t = 0; f.dur = 0.35; f.x0 = f.x1; f.z0 = f.z1; f.y0 = f.y1; f.y1 = 0.5; f.arc = 0; f.res.done = true;
          } else if (!f.res.done) {
            f.res.done = true; ctx.sfx.ping(); s.fx.burst(e.x, RIM_Y, RIM_Z, '#ffffff', 5, 6);
            f.t = 0; f.dur = 0.5; f.x0 = f.x1; f.z0 = f.z1; f.y0 = f.y1; f.x1 += f.res.side * 1.4; f.z1 += 1.6; f.y1 = 0.5; f.arc = 1.6;
          } else { e.flight = null; e.ball.visible = false; e.cd = 0.25; }
        }
      }
      showBean(e, dt, s.time);
      e.g.rotation.y = Math.PI; e.ang = Math.PI;
    }
    if (Math.floor(s.t * 3) !== s.lastHud) { s.lastHud = Math.floor(s.t * 3); this.hud(); }
    if (!s.over && s.t >= DURATION) {
      s.over = true;
      ctx.finish([...s.ents].sort((a, b) => b.score - a.score).map((e) => ({ id: e.p.id, text: `${e.score} điểm · ${e.makes}/${e.shots} quả vào` })));
    }
  },

  shoot(e) {
    const s = S, ctx = s.ctx;
    e.charging = false; e.shots++;
    const err = Math.abs(e.charge - e.ideal), side = e.charge > e.ideal ? 1 : -1;
    let pts = 0;
    if (err < 0.05) pts = 3; else if (err < 0.1) pts = 2; else if (err < 0.15 && Math.random() < 0.5) pts = 1;
    const x1 = e.x + (pts ? 0 : side * 0.5 * Math.min(1, err * 3)), z1 = RIM_Z + (pts ? 0 : -side * 0.6 * Math.min(1, err * 3));
    e.flight = { t: 0, dur: 0.95, x0: e.x, z0: e.z - 0.3, y0: 2.4, x1, z1, y1: RIM_Y + (pts ? 0 : 0.3), arc: 3.2 + e.charge, res: { pts, side, done: false } };
    e.ball.visible = true; e.ball.position.set(e.x, 2.4, e.z - 0.3);
    ctx.sfx.kick(); ctx.vibrate(e.p.id, 30);
    e.ideal = rand(0.4, 0.85);
    this.hud();
  },

  think(dt) {
    const s = S;
    for (const e of s.ents) {
      const p = e.p;
      if (!p.bot || !tick(p, dt, 0.02)) continue;
      if (e.flight || e.cd > 0) { hold(p, 'a', 0); continue; }
      if (!e.charging) { hold(p, 'a', 1); continue; }
      const tol = 0.035 + (1 - p.skill) * 0.12;
      if (Math.abs(e.charge - e.ideal) < tol) hold(p, 'a', 0);
    }
  },

  dispose() { if (S) { S.fx.dispose(); S.ballGeo.dispose(); S.ballMat.dispose(); S = null; } },
};
