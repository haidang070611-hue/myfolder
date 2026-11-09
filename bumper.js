import { clamp, rand, nameSprite, makeFX } from '/js/util.js';
import { std, glow, mesh, T } from '/js/gfx.js';
import { setupScene, lavaPlane } from '/js/party.js';
import { makeBumper } from '/js/models.js';
import { tick, pulse, hold, stick, idle, toward, away, nearest, wobble, chance, ai, segHitsRect } from '/js/bots.js';

const R0 = 15;          // bán kính sàn ban đầu
const RMIN = 6.5;
const BR = 0.95;        // bán kính xe húc
const ROUNDS = 5;

let S = null;

export default {
  id: 'bumper',
  name: 'Bumper Arena',
  emoji: '💥',
  cat: 'fight',
  bots: 4,
  color: '#ff7a3d',
  tag: '1-8 người · 5 round',
  desc: 'Húc đối thủ văng khỏi đấu trường. Sàn càng lúc càng thu hẹp. Thắng round được 3 điểm, mỗi cú húc rơi được 1 điểm.',
  cfg: { a: 'LAO', b: '', gyro: false, hideStick: false, hint: 'Cần gạt để di chuyển, A để lao tới húc' },

  init(ctx) {
    const { THREE, scene } = ctx;
    setupScene(ctx, { bg: 0x1a0c14, size: 26, cam: [0, 25, 17], look: [0, 0, 1.5], light: { sun: 2.4, hemi: 0.45, color: 0xffd9c4 } });
    const lava = lavaPlane(scene, -9);

    // sàn: thép tấm có bu-lông, viền phát sáng
    const plat = new THREE.Group();
    const top = mesh(new THREE.CylinderGeometry(R0, R0, 1, 72), std(0xffffff, { map: T.plate(16, [78, 84, 118]), roughness: 0.42, metalness: 0.6, envMapIntensity: 0.9 }), false, true);
    top.position.y = -0.5;
    const side = mesh(new THREE.CylinderGeometry(R0 * 0.985, R0 * 0.8, 3, 72, 1, true), std(0x23283f, { roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide }), false);
    side.position.y = -2.4;
    const rim = mesh(new THREE.TorusGeometry(R0, 0.24, 14, 96), glow(0xff7a2a, 2.6), false);
    rim.rotation.x = Math.PI / 2;
    const rings = new THREE.Mesh(new THREE.RingGeometry(R0 * 0.3, R0 * 0.32, 96), new THREE.MeshBasicMaterial({ color: 0x6f7bff, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    rings.rotation.x = -Math.PI / 2; rings.position.y = 0.02;
    plat.add(top, side, rim, rings);
    scene.add(plat);

    S = {
      ctx, THREE, scene, plat, lava, R: R0, fx: makeFX(THREE, scene),
      round: 0, t: 0, phase: 'play', wait: 0, ents: [], lastBanner: 0, time: 0,
    };

    // xe húc dạng đĩa
    ctx.players.forEach((p) => {
      const g = new THREE.Group();
      const body = makeBumper(p.color);
      const label = nameSprite(THREE, p.name, p.color);
      label.position.y = 2.2;
      g.add(body, label);
      scene.add(g);
      S.ents.push({ p, g, body, x: 0, z: 0, y: 0, vx: 0, vz: 0, fx: 0, fz: 1, ang: 0, alive: true, falling: false, dash: 0, cd: 0, last: -1, lastT: -9, pts: 0, kos: 0 });
    });
    this.newRound();
    this.hud();
  },

  newRound() {
    const s = S;
    s.round++;
    s.t = 0; s.R = R0; s.phase = 'play';
    const n = s.ents.length;
    s.ents.forEach((e, i) => {
      const a = (i / n) * Math.PI * 2 + 0.4;
      e.x = Math.cos(a) * 8; e.z = Math.sin(a) * 8; e.y = 0;
      e.vx = e.vz = 0; e.fx = -Math.cos(a); e.fz = -Math.sin(a);
      e.alive = true; e.falling = false; e.dash = 0; e.cd = 0; e.last = -1;
      e.g.visible = true;
    });
    s.ctx.hud.banner(`Round ${s.round}/${ROUNDS}`, 1200, true);
    this.hud();
  },

  hud() {
    const s = S;
    s.ctx.hud.title(`Bumper Arena · Round ${Math.min(s.round, ROUNDS)}/${ROUNDS}`);
    s.ctx.hud.board([...s.ents].sort((a, b) => b.pts - a.pts).map((e) => ({
      color: e.p.color, name: e.p.name, text: `${e.pts} đ · ${e.kos} KO`, dead: !e.alive,
    })));
  },


  // ---- AI bot: tránh mép sàn, vòng ra phía trong đối thủ rồi lao húc ----
  think(dt) {
    const s = S;
    for (const e of s.ents) {
      const p = e.p;
      if (!p.bot || !tick(p, dt, 0.1)) continue;
      if (!e.alive || e.falling) { idle(p); continue; }
      const edge = Math.hypot(e.x, e.z);
      const margin = 2.0 + p.skill * 2.2;
      if (edge > s.R - margin) { toward(p, e, 0, 0, 1, 0.5); continue; }
      const f = nearest(s.ents, e.x, e.z, (o) => o !== e && o.alive && !o.falling);
      if (!f) { toward(p, e, 0, 0, 0.8, 1); continue; }
      const o = f.o, oe = Math.hypot(o.x, o.z) || 1;
      if (f.d > 4.5) toward(p, e, o.x - (o.x / oe) * 1.6, o.z - (o.z / oe) * 1.6, 1, 0.3);
      else {
        toward(p, e, o.x, o.z, 1, 0.1);
        if (e.cd <= 0 && f.d < 3.4 && chance(p, 0.7)) pulse(p, 'a');
      }
    }
  },

  update(dt) {
    const s = S, ctx = s.ctx;
    s.fx.update(dt);
    s.plat.scale.set(s.R / R0, 1, s.R / R0);

    if (s.phase === 'play') {
      s.t += dt;
      if (s.t > 7) s.R = Math.max(RMIN, s.R - 0.45 * dt);
      const alive = s.ents.filter((e) => e.alive);
      ctx.hud.timer(s.t > 7 && s.R > RMIN ? 'Sàn thu hẹp!' : '');

      for (const e of s.ents) {
        if (!e.alive) continue;
        const inp = e.p.input;
        if (!e.falling) {
          const mag = Math.hypot(inp.x, inp.y);
          if (mag > 0.1) { e.fx = inp.x / mag; e.fz = inp.y / mag; }
          e.vx += inp.x * 34 * dt;
          e.vz += inp.y * 34 * dt;
          e.cd -= dt; e.dash -= dt;
          if (e.p.press.a && e.cd <= 0) {
            e.vx += e.fx * 17; e.vz += e.fz * 17;
            e.dash = 0.3; e.cd = 1.3;
            ctx.sfx.dash();
            s.fx.ring(e.x, e.z, '#ffffff', 2.5, 0.3);
          }
          const drag = Math.exp(-1.7 * dt);
          e.vx *= drag; e.vz *= drag;
        } else {
          e.vy = (e.vy || 0) - 30 * dt;
          e.y += e.vy * dt;
        }
        e.x += e.vx * dt; e.z += e.vz * dt;
      }

      // va chạm giữa các xe
      for (let i = 0; i < s.ents.length; i++) {
        for (let j = i + 1; j < s.ents.length; j++) {
          const a = s.ents[i], b = s.ents[j];
          if (!a.alive || !b.alive || a.falling || b.falling) continue;
          let dx = b.x - a.x, dz = b.z - a.z;
          const d = Math.hypot(dx, dz);
          if (d >= BR * 2 || d === 0) continue;
          dx /= d; dz /= d;
          const ov = BR * 2 - d;
          a.x -= dx * ov / 2; a.z -= dz * ov / 2;
          b.x += dx * ov / 2; b.z += dz * ov / 2;
          const ma = a.dash > 0 ? 2.4 : 1, mb = b.dash > 0 ? 2.4 : 1;
          const rel = (a.vx - b.vx) * dx + (a.vz - b.vz) * dz;
          if (rel > 0) {
            const j2 = (1 + 1.25) * rel / (1 / ma + 1 / mb);
            a.vx -= j2 / ma * dx; a.vz -= j2 / ma * dz;
            b.vx += j2 / mb * dx; b.vz += j2 / mb * dz;
            if (rel > 4) {
              ctx.sfx.hit(); ctx.shake(Math.min(0.6, rel * 0.04));
              s.fx.ring((a.x + b.x) / 2, (a.z + b.z) / 2, '#ffd23f', 3, 0.4);
              s.fx.burst((a.x + b.x) / 2, 0.8, (a.z + b.z) / 2, '#ffd23f', 8, 6);
              ctx.vibrate(a.p.id, 50); ctx.vibrate(b.p.id, 50);
            }
            a.last = b.p.id; a.lastT = s.t; b.last = a.p.id; b.lastT = s.t;
          }
        }
      }

      // rơi khỏi sàn
      for (const e of s.ents) {
        if (!e.alive) continue;
        if (!e.falling && Math.hypot(e.x, e.z) > s.R + 0.35) {
          e.falling = true; e.vy = 0;
          ctx.sfx.fall(); ctx.vibrate(e.p.id, 200);
          const killer = e.last >= 0 && s.t - e.lastT < 3.5 ? s.ents.find((k) => k.p.id === e.last) : null;
          if (killer && killer !== e && killer.alive) {
            killer.kos++; killer.pts++;
            ctx.vibrate(killer.p.id, 120);
          }
          this.hud();
        }
        if (e.falling && e.y < -14) { e.alive = false; e.g.visible = false; this.hud(); }
      }

      // kết thúc round
      const left = s.ents.filter((e) => e.alive && !e.falling);
      const solo = s.ents.length === 1;
      if ((!solo && left.length <= 1) || (solo && left.length === 0)) {
        s.phase = 'wait'; s.wait = 2.6;
        const w = left[0];
        if (w) { w.pts += 3; ctx.hud.banner(`🏆 ${w.p.name} thắng round!`, 2400, true); ctx.sfx.lap(); }
        else ctx.hud.banner('Hòa!', 2000, true);
        this.hud();
      }
    } else if (s.phase === 'wait') {
      s.wait -= dt;
      for (const e of s.ents) if (e.falling) { e.vy -= 30 * dt; e.y += e.vy * dt; }
      if (s.wait <= 0) {
        if (s.round >= ROUNDS) {
          const ranked = [...s.ents].sort((a, b) => b.pts - a.pts || b.kos - a.kos);
          s.phase = 'over';
          ctx.finish(ranked.map((e) => ({ id: e.p.id, text: `${e.pts} đ · ${e.kos} KO` })));
        } else this.newRound();
      }
    }

    // cập nhật hình ảnh: đĩa quay mặt theo hướng, nghiêng theo vận tốc
    s.time += dt; s.lava.update(dt);
    for (const e of s.ents) {
      e.g.position.set(e.x, e.y + 0.6, e.z);
      let d = Math.atan2(e.fx, e.fz) - e.ang;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      e.ang += d * Math.min(1, dt * 10);
      e.body.rotation.y = e.ang;
      e.body.rotation.x += (e.vz * 0.035 - e.body.rotation.x) * Math.min(1, dt * 10);
      e.body.rotation.z += (-e.vx * 0.035 - e.body.rotation.z) * Math.min(1, dt * 10);
      e.body.scale.setScalar(e.dash > 0 ? 1.12 : 1 + (e.cd > 0 ? 0 : Math.sin(s.time * 6) * 0.025));
    }
  },

  dispose() { if (S) { S.fx.dispose(); S = null; } },
};
