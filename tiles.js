import * as THREE from 'three';
import { clamp, rand, makeFX } from '/js/util.js';
import { std, glow, mesh, T } from '/js/gfx.js';
import { setupScene, lavaPlane, spawnBeans, stepBean, pushApart, showBean } from '/js/party.js';
import { tick, pulse, hold, stick, idle, toward, away, nearest, wobble, chance, ai, segHitsRect } from '/js/bots.js';

const N = 9, TS = 3;
let S = null;

export default {
  id: 'tiles',
  name: 'Sàn Sụp',
  emoji: '❄️',
  cat: 'party',
  bots: 5,
  color: '#ff9f43',
  tag: '2-8 người · sống sót',
  desc: 'Đứng lên ô nào là ô đó rung rồi sụp xuống dung nham. Chạy liên tục, bấm A để nhảy qua khe trống. Người đứng cuối cùng thắng!',
  cfg: { a: 'NHẢY', b: '', gyro: false, hideStick: false, hint: 'Đừng đứng yên! Ô sàn sẽ sụp · A để nhảy' },

  init(ctx) {
    const scene = ctx.scene;
    setupScene(ctx, { bg: 0x1a0c10, size: 26, cam: [0, 31, 17], look: [0, 0, 0.5], light: { sun: 2.4, hemi: 0.5, color: 0xffd8c0 } });
    const lava = lavaPlane(scene, -7);
    const geo = new THREE.BoxGeometry(TS - 0.16, 0.7, TS - 0.16); geo.translate(0, -0.35, 0);
    const plate = T.plate(1, [88, 96, 130]);
    const mats = {
      ok: std(0xffffff, { map: plate, roughness: 0.5, metalness: 0.5 }),
      warn: std(0xffb080, { map: plate, roughness: 0.5, metalness: 0.3, emissive: 0xff5a1a, emissiveIntensity: 1.4 }),
    };
    S = { ctx, fx: makeFX(THREE, scene), lava, geo, mats, tiles: [], t: 0, time: 0, rt: 2.2, over: false, lastHud: -1, scene };
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const m = mesh(geo, mats.ok, false, true);
      const x = (i - (N - 1) / 2) * TS, z = (j - (N - 1) / 2) * TS;
      m.position.set(x, 0, z); scene.add(m);
      S.tiles.push({ m, x, z, state: 0, t: 0, vy: 0, y: 0 });
    }
    S.ents = spawnBeans(ctx, (i, n) => { const a = (i / n) * Math.PI * 2; return [Math.cos(a) * 7, Math.sin(a) * 7]; }, () => ({ vy: 0, cd: 0, out: -1, falling: false, ground: true }));
    S.ents.forEach((e) => { e.fx = -e.x / 7; e.fz = -e.z / 7; e.ang = Math.atan2(e.fx, e.fz); });
    ctx.hud.title('Sàn Sụp');
    this.hud();
  },

  tileAt(x, z) {
    const i = Math.round(x / TS + (N - 1) / 2), j = Math.round(z / TS + (N - 1) / 2);
    if (i < 0 || j < 0 || i >= N || j >= N) return null;
    return S.tiles[i * N + j];
  },

  trigger(t, delay) {
    if (t.state !== 0) return;
    t.state = 1; t.t = delay; t.m.material = S.mats.warn; S.ctx.sfx.crack();
  },

  hud() {
    const s = S;
    s.ctx.hud.board(s.ents.map((e) => ({ color: e.p.color, name: e.p.name, text: e.alive ? '✔' : `${e.out.toFixed(1)}s`, dead: !e.alive })));
  },


  // ---- AI bot: liên tục chạy sang ô còn lành (ưu tiên vùng nhiều ô lành, ít người), nhảy qua khe ----
  think(dt) {
    const s = S;
    for (const e of s.ents) {
      const p = e.p;
      if (!p.bot || !tick(p, dt, 0.09)) continue;
      if (!e.alive || e.falling) { idle(p); continue; }
      const a = ai(p);
      const bad = (t) => !t || t.state !== 0;
      if (!a.tile || bad(a.tile) || Math.hypot(a.tile.x - e.x, a.tile.z - e.z) < 0.9 || s.t > (a.until || 0)) {
        let best = null, bsc = -1e9;
        for (const t of s.tiles) {
          if (t.state !== 0) continue;
          const d = Math.hypot(t.x - e.x, t.z - e.z);
          if (d < 2.5 || d > 11) continue;
          let sc = -d * 0.3 + Math.random() * 3;
          for (const o of s.ents) if (o !== e && o.alive && Math.hypot(o.x - t.x, o.z - t.z) < 3) sc -= 2;
          let nb = 0;
          for (const u of s.tiles) if (u.state === 0 && Math.hypot(u.x - t.x, u.z - t.z) < 4.6) nb++;
          sc += nb * 0.5;
          if (sc > bsc) { bsc = sc; best = t; }
        }
        a.tile = best; a.until = s.t + 0.8 + Math.random() * 0.8;
      }
      if (!a.tile) { idle(p); continue; }
      toward(p, e, a.tile.x, a.tile.z, 1, 0.2);
      const sp = Math.hypot(e.vx, e.vz) || 1;
      const ahead = this.tileAt(e.x + (e.vx / sp) * 1.9, e.z + (e.vz / sp) * 1.9);
      if (e.ground && e.cd <= 0 && sp > 3 && (!ahead || ahead.state >= 2) && chance(p, 0.9)) pulse(p, 'a');
    }
  },

  update(dt) {
    const s = S, ctx = s.ctx;
    s.time += dt; s.t += dt; s.fx.update(dt); s.lava.update(dt);
    const alive = s.ents.filter((e) => e.alive);
    ctx.hud.timer(alive.length > 1 ? `${alive.length} còn lại` : '');

    // sụp ngẫu nhiên, càng lúc càng nhanh
    s.rt -= dt;
    if (s.rt <= 0) {
      s.rt = clamp(1.5 - s.t * 0.018, 0.28, 1.5);
      const ok = s.tiles.filter((t) => t.state === 0);
      if (ok.length) this.trigger(ok[Math.floor(Math.random() * ok.length)], 1.4);
    }
    for (const t of s.tiles) {
      if (t.state === 1) {
        t.t -= dt;
        t.m.position.x = t.x + (Math.random() - 0.5) * 0.09; t.m.position.z = t.z + (Math.random() - 0.5) * 0.09;
        if (t.t <= 0) { t.state = 2; t.vy = 0; s.fx.burst(t.x, 0, t.z, '#ff8a4d', 6, 5); }
      } else if (t.state === 2) {
        t.vy -= 28 * dt; t.y += t.vy * dt;
        t.m.position.set(t.x, t.y, t.z); t.m.rotation.x += dt * 1.2; t.m.rotation.z += dt * 0.8;
        if (t.y < -14) { t.state = 3; t.m.visible = false; }
      }
    }

    for (const e of alive) {
      if (!e.falling) {
        e.cd -= dt;
        stepBean(e, dt, { acc: 52, drag: 4.8, max: e.ground ? 8.4 : 8.8 });
        if (e.p.press.a && e.ground && e.cd <= 0) { e.vy = 10.5; e.ground = false; e.cd = 0.45; ctx.sfx.jump(); }
      } else { e.x += e.vx * dt; e.z += e.vz * dt; }
    }
    pushApart(alive.filter((e) => !e.falling), 0.62, 0.85);

    for (const e of alive) {
      e.vy -= 30 * dt; e.y += e.vy * dt;
      const tile = this.tileAt(e.x, e.z);
      const sup = tile && tile.state < 2;
      if (!e.falling && e.vy <= 0 && e.y <= 0 && e.y > -0.5 && sup) {
        e.y = 0; e.vy = 0;
        if (!e.ground) { e.ground = true; s.fx.ring(e.x, e.z, '#ffffff', 1.6, 0.25); }
        if (tile.state === 0) this.trigger(tile, 0.9);
      } else if (e.y < -0.45 && !e.falling) {
        e.falling = true; e.out = s.t; ctx.sfx.fall(); ctx.vibrate(e.p.id, 250);
        ctx.hud.banner(`${e.p.name} rơi xuống!`, 900, true);
      }
      if (e.falling && e.y < -11) { e.alive = false; e.g.visible = false; this.hud(); }
    }

    for (const e of s.ents) if (e.alive) showBean(e, dt, s.time);
    if (Math.floor(s.t * 4) !== s.lastHud) { s.lastHud = Math.floor(s.t * 4); this.hud(); }

    const left = s.ents.filter((e) => e.alive && !e.falling);
    const solo = s.ents.length === 1;
    if (!s.over && ((!solo && left.length <= 1) || (solo && left.length === 0))) {
      s.over = true;
      const rank = [...s.ents].sort((a, b) => (b.out < 0 ? 1e9 : b.out) - (a.out < 0 ? 1e9 : a.out));
      ctx.finish(rank.map((e) => ({ id: e.p.id, text: e.out < 0 ? 'sống sót đến cuối 🏆' : `trụ được ${e.out.toFixed(1)} giây` })));
    }
  },

  dispose() { if (S) { S.fx.dispose(); S.geo.dispose(); S.mats.ok.dispose(); S.mats.warn.dispose(); S = null; } },
};
