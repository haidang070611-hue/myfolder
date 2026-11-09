import * as THREE from 'three';
import { clamp, rand, makeFX } from '/js/util.js';
import { std, glow, mesh, T } from '/js/gfx.js';
import { setupScene, lavaPlane, spawnBeans, stepBean, pushApart, clampCircle, showBean, hudRows } from '/js/party.js';
import { tick, pulse, hold, stick, idle, toward, away, nearest, wobble, chance, ai, segHitsRect } from '/js/bots.js';

const R = 15;
let S = null;

export default {
  id: 'hotbomb',
  name: 'Bom Nóng',
  emoji: '💣',
  cat: 'fight',
  bots: 4,
  color: '#ff4d6d',
  tag: '2-8 người · loại trực tiếp',
  desc: 'Quả bom chuyền tay! Ai đang cầm khi bom nổ là bay màu. Chạm vào người khác để chuyền bom, bấm A để lao.',
  cfg: { a: 'LAO', b: '', gyro: false, hideStick: false, hint: 'Cần gạt để chạy · chạm người khác để chuyền bom · A để lao' },

  init(ctx) {
    const scene = ctx.scene;
    setupScene(ctx, { bg: 0x1a0c14, size: 24, cam: [0, 27, 17], look: [0, 0, 1], light: { sun: 2.2, hemi: 0.45, color: 0xffd9c4 } });
    const lava = lavaPlane(scene, -8);
    const top = mesh(new THREE.CylinderGeometry(R, R, 1, 72), std(0xffffff, { map: T.plate(16, [92, 74, 88]), roughness: 0.55, metalness: 0.45 }), false, true);
    top.position.y = -0.5;
    const rim = mesh(new THREE.TorusGeometry(R, 0.25, 12, 96), glow(0xff5a2a, 2.4), false); rim.rotation.x = Math.PI / 2;
    scene.add(top, rim);

    // quả bom
    const bomb = new THREE.Group();
    const ball = mesh(new THREE.SphereGeometry(0.42, 24, 18), std(0x15151a, { roughness: 0.28, metalness: 0.9, envMapIntensity: 1.3 }));
    const band = mesh(new THREE.TorusGeometry(0.43, 0.05, 8, 24), glow(0xff2a2a, 2.5), false); band.rotation.x = Math.PI / 2;
    const fuse = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6), std(0x5a4632), false); fuse.position.y = 0.52;
    const spark = mesh(new THREE.SphereGeometry(0.1, 10, 8), glow(0xffb020, 4), false); spark.position.y = 0.72;
    bomb.add(ball, band, fuse, spark);
    scene.add(bomb);

    S = { ctx, fx: makeFX(THREE, scene), lava, bomb, ball, band, spark, t: 0, order: [], holder: null, timer: 0, total: 1, tickT: 0, passCd: 0, phase: 'wait', wait: 1.4, over: false, time: 0 };
    S.ents = spawnBeans(ctx, (i, n) => { const a = (i / n) * Math.PI * 2 + 0.3; return [Math.cos(a) * 8, Math.sin(a) * 8]; }, () => ({ cd: 0 }));
    S.ents.forEach((e) => { e.fx = -e.x / 8; e.fz = -e.z / 8; e.ang = Math.atan2(e.fx, e.fz); });
    this.nextHolder();
    ctx.hud.title('Bom Nóng');
    ctx.hud.banner(S.ents.length > 1 ? 'Ai sẽ cầm bom?' : 'Chơi thử một mình', 1200, true);
    this.hud();
  },

  nextHolder() {
    const s = S, alive = s.ents.filter((e) => e.alive);
    s.holder = alive[Math.floor(Math.random() * alive.length)];
    const gone = s.ents.length - alive.length;
    s.total = s.timer = clamp(10.5 - gone * 0.9, 5, 10.5) + rand(0, 2.5);
    s.passCd = 1.0;
    s.ctx.sfx.pass();
  },

  hud() {
    const s = S;
    s.ctx.hud.board(hudRows(s.ents, (e) => (!e.alive ? '💀' : e === s.holder ? '💣' : '')));
  },


  // ---- AI bot: cầm bom thì đuổi người gần nhất; không cầm thì chạy xa người cầm, tránh mép ----
  think(dt) {
    const s = S;
    for (const e of s.ents) {
      const p = e.p;
      if (!p.bot || !tick(p, dt, 0.09)) continue;
      if (!e.alive) { idle(p); continue; }
      const f = nearest(s.ents, e.x, e.z, (o) => o !== e && o.alive);
      if (!f) { idle(p); continue; }
      const edge = Math.hypot(e.x, e.z);
      if (e === s.holder) {
        toward(p, e, f.o.x + f.o.vx * 0.25, f.o.z + f.o.vz * 0.25, 1, 0.1);
        if (f.d < 5 && e.cd <= 0 && chance(p, 0.8)) pulse(p, 'a');
      } else if (s.holder) {
        const h = s.holder;
        let dx = e.x - h.x, dz = e.z - h.z;
        const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
        const wEdge = clamp((edge - 9) / 5, 0, 1.2);
        stick(p, dx - (e.x / (edge || 1)) * wEdge * 1.6 + wobble(p, 0.4), dz - (e.z / (edge || 1)) * wEdge * 1.6 + wobble(p, 0.4));
        if (d < 3.2 && e.cd <= 0 && chance(p, 0.7)) pulse(p, 'a');
      } else idle(p);
    }
  },

  update(dt) {
    const s = S, ctx = s.ctx;
    s.time += dt; s.fx.update(dt); s.lava.update(dt);
    const alive = s.ents.filter((e) => e.alive);

    if (s.phase === 'wait') {
      s.wait -= dt;
      if (s.wait <= 0) {
        if (s.over) return;
        if (alive.length <= (s.ents.length > 1 ? 1 : 0)) { this.end(); return; }
        if (!s.holder || !s.holder.alive) this.nextHolder();
        s.phase = 'play';
      }
    }

    if (s.phase === 'play' || s.phase === 'wait') {
      for (const e of alive) {
        e.cd -= dt;
        stepBean(e, dt, { acc: 52, drag: 5.2, max: e === s.holder ? 10.4 : 9 });
        if (e.p.press.a && e.cd <= 0) {
          e.vx += e.fx * 15; e.vz += e.fz * 15; e.cd = 1.3;
          ctx.sfx.dash(); s.fx.ring(e.x, e.z, '#ffffff', 2.2, 0.3);
        }
      }
      pushApart(alive, 0.62, 0.9);
      for (const e of alive) clampCircle(e, R - 0.7);
    }

    if (s.phase === 'play') {
      s.timer -= dt; s.passCd -= dt;
      s.tickT -= dt;
      if (s.tickT <= 0) { ctx.sfx.tick(); s.tickT = 0.1 + 0.55 * clamp(s.timer / s.total, 0, 1); }
      const h = s.holder;
      if (h && s.passCd <= 0) {
        for (const o of alive) {
          if (o === h || Math.hypot(o.x - h.x, o.z - h.z) > 1.7) continue;
          s.holder = o; s.passCd = 0.9; s.tickT = 0;
          o.vx += (o.x - h.x) * 4; o.vz += (o.z - h.z) * 4;
          ctx.sfx.pass(); ctx.vibrate(o.p.id, 90);
          s.fx.ring(o.x, o.z, '#ff4d4d', 3, 0.4);
          this.hud();
          break;
        }
      }
      if (s.timer <= 0 && s.holder) {
        const h2 = s.holder;
        h2.alive = false; h2.g.visible = false; s.order.push(h2);
        ctx.sfx.boom(); ctx.shake(1.1); ctx.vibrate(h2.p.id, 400);
        s.fx.burst(h2.x, 1, h2.z, '#ff7a2a', 36, 13); s.fx.burst(h2.x, 1, h2.z, '#ffd23f', 18, 9);
        s.fx.ring(h2.x, h2.z, '#ffb347', 9, 0.7);
        ctx.hud.banner(`💥 ${h2.p.name} nổ tung!`, 1500, true);
        s.holder = null; s.phase = 'wait'; s.wait = 1.8;
        this.hud();
      }
    }

    // quả bom bám theo người cầm, càng gần nổ càng rung và đỏ
    const h = s.holder;
    s.bomb.visible = !!h;
    if (h) {
      const danger = 1 - clamp(s.timer / s.total, 0, 1);
      const pulse = Math.sin(s.time * (8 + danger * 22)) * 0.5 + 0.5;
      s.bomb.position.set(h.x, 2.05 + Math.sin(s.time * 5) * 0.06, h.z);
      s.bomb.scale.setScalar(1 + pulse * 0.12 * (0.4 + danger));
      s.band.material.emissiveIntensity = 1.5 + pulse * (2 + danger * 6);
      s.spark.material.emissiveIntensity = 3 + pulse * 3;
      s.bomb.rotation.y += dt * 2;
    }
    for (const e of alive) showBean(e, dt, s.time);
  },

  end() {
    const s = S;
    if (s.over) return;
    s.over = true;
    const alive = s.ents.filter((e) => e.alive);
    const rank = [...alive, ...[...s.order].reverse()];
    s.ctx.finish(rank.map((e, i) => ({ id: e.p.id, text: i === 0 && s.ents.length > 1 ? 'sống sót 🏆' : e.alive ? 'sống sót' : 'bị nổ' })));
  },

  dispose() { if (S) { S.fx.dispose(); S = null; } },
};
