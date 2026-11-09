import * as THREE from 'three';
import { clamp, rand, fmtTime, makeFX, nameSprite } from '/js/util.js';
import { std, glow, mesh, T } from '/js/gfx.js';
import { setupScene } from '/js/party.js';
import { tick, pulse, ai } from '/js/bots.js';

const BASE_W = 3.2, BH = 0.8, DURATION = 45, GAP = 5;
let S = null;

export default {
  id: 'stack',
  name: 'Xếp Tháp',
  emoji: '🏗️',
  cat: 'party',
  bots: 4,
  color: '#38c8ff',
  tag: '1-8 người · 45 giây',
  desc: 'Khối gạch trượt qua lại, bấm A đúng lúc để thả xuống. Phần chồng lệch sẽ bị cắt mất. Thả thật chuẩn thì giữ nguyên khối. Tháp cao nhất thắng!',
  cfg: { a: 'THẢ', b: '', gyro: false, hideStick: true, hint: 'Bấm A khi khối gạch thẳng hàng với tháp' },

  init(ctx) {
    const { scene, camera } = ctx;
    const n = ctx.players.length;
    setupScene(ctx, { bg: 0x101830, sky: [0x14204a, 0x4a6fc0, 0x1a2038, [0.3, 0.4, 0.9]], size: 30, cam: [0, 8, 40], look: [0, 7, 0], fogNear: 90, fogFar: 200, light: { sun: 2.8, hemi: 0.6, color: 0xfff0dc, dir: [0.4, 1.2, 1] } });
    const W = n * GAP + 10;
    const floor = mesh(new THREE.BoxGeometry(W, 1, 12), std(0xffffff, { map: T.plate([Math.ceil(W / 4), 3], [60, 70, 100]), roughness: 0.5, metalness: 0.4 }), false, true);
    floor.position.set(0, -0.5, 0); scene.add(floor);
    S = { ctx, fx: makeFX(THREE, scene), t: 0, time: 0, over: false, lastHud: -1, camY: 7, camZ: 28 + n * 1.6, falling: [], boxGeo: new THREE.BoxGeometry(1, 1, 1) };
    S.ents = ctx.players.map((p, i) => {
      const x0 = (i - (n - 1) / 2) * GAP;
      const base = mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.5, 24), std(0x2a3150, { roughness: 0.4, metalness: 0.6 }), false, true); base.position.set(x0, 0.25, 0); scene.add(base);
      const label = nameSprite(THREE, p.name, p.color); label.position.set(x0, 0.2, 3.2); label.scale.set(4, 1, 1); scene.add(label);
      const e = { p, x0, layers: [{ x: x0, w: BASE_W }], floors: 0, perfect: 0, combo: 0, ph: Math.random() * 6, done: false, meshes: [], cd: 0, hue: 0 };
      this.addBlock(e, x0, BASE_W, 0);
      this.spawnMover(e);
      return e;
    });
    ctx.hud.title('Xếp Tháp');
    this.hud();
  },

  blockMat(e, level) {
    const c = new THREE.Color(e.p.color); const hsl = { h: 0, s: 0, l: 0 }; c.getHSL(hsl);
    return std(new THREE.Color().setHSL((hsl.h + level * 0.018) % 1, 0.75, 0.52), { roughness: 0.32, metalness: 0.35, envMapIntensity: 1.1 });
  },
  addBlock(e, x, w, level) {
    const m = new THREE.Mesh(S.boxGeo, this.blockMat(e, level)); m.castShadow = m.receiveShadow = true;
    m.scale.set(w, BH, 2.6); m.position.set(x, 0.5 + BH / 2 + level * BH, 0); S.ctx.scene.add(m); e.meshes.push(m); return m;
  },
  spawnMover(e) {
    const top = e.layers[e.layers.length - 1];
    e.mw = top.w; e.mover = this.addBlock(e, e.x0, top.w, e.layers.length);
  },
  hud() { S.ctx.hud.board([...S.ents].sort((a, b) => b.floors - a.floors).map((e) => ({ color: e.p.color, name: e.p.name, text: `${e.floors} tầng${e.perfect ? ' ✨' + e.perfect : ''}${e.done ? ' ⛔' : ''}` }))); },
  moverX(e) { const sp = 1.7 + e.floors * 0.1; return e.x0 + Math.sin(S.time * sp + e.ph) * (GAP / 2 - 0.4); },

  update(dt) {
    const s = S, ctx = s.ctx;
    s.time += dt; s.t += dt; s.fx.update(dt);
    ctx.hud.timer(fmtTime(Math.max(0, DURATION - s.t)));
    let high = 0;
    for (const e of s.ents) {
      e.cd -= dt;
      high = Math.max(high, e.floors);
      if (e.done) continue;
      const mx = this.moverX(e);
      e.mover.position.x = mx;
      e.mover.position.y = 0.5 + BH / 2 + e.layers.length * BH + 0.02;
      if (e.p.press.a && e.cd <= 0) {
        e.cd = 0.18;
        const top = e.layers[e.layers.length - 1];
        const l = Math.max(top.x - top.w / 2, mx - e.mw / 2), r = Math.min(top.x + top.w / 2, mx + e.mw / 2), w = r - l;
        const lvl = e.layers.length;
        if (w <= 0.1) {   // trượt hoàn toàn: khối rơi, tháp dừng lại
          e.done = true; ctx.sfx.crack(); ctx.vibrate(e.p.id, 200);
          s.falling.push({ m: e.mover, vy: 0, vx: mx > top.x ? 2 : -2 });
          ctx.hud.banner(`${e.p.name} sập tháp! (${e.floors} tầng)`, 1100, true);
        } else {
          const perfect = Math.abs(mx - top.x) < 0.14;
          let nx = (l + r) / 2, nw = w;
          if (perfect) { nx = top.x; nw = top.w; e.perfect++; e.combo++; ctx.sfx.gem(); s.fx.ring(nx, 0.5 + lvl * BH, '#ffffff', 4, 0.4); s.fx.burst(nx, 0.5 + lvl * BH, 1.3, '#ffd23f', 10, 7); if (e.combo >= 3) nw = Math.min(BASE_W, nw + 0.25); }
          else {
            e.combo = 0; ctx.sfx.kick();
            const cutW = e.mw - w;
            if (cutW > 0.02) {   // phần thừa rơi xuống
              const cut = new THREE.Mesh(s.boxGeo, e.mover.material); cut.scale.set(cutW, BH, 2.6);
              const cx = mx < top.x ? l - cutW / 2 : r + cutW / 2;
              cut.position.set(cx, e.mover.position.y, 0); ctx.scene.add(cut); s.falling.push({ m: cut, vy: 0, vx: mx < top.x ? -1.5 : 1.5 });
            }
          }
          e.mover.scale.x = nw; e.mover.position.x = nx;
          e.layers.push({ x: nx, w: nw }); e.floors++;
          ctx.vibrate(e.p.id, 25);
          this.spawnMover(e); this.hud();
        }
      }
    }
    for (let i = s.falling.length - 1; i >= 0; i--) {
      const f = s.falling[i]; f.vy -= 30 * dt; f.m.position.y += f.vy * dt; f.m.position.x += f.vx * dt; f.m.rotation.z += f.vx * dt * 0.6;
      if (f.m.position.y < -12) { ctx.scene.remove(f.m); s.falling.splice(i, 1); }
    }
    // camera bám theo tháp cao nhất
    const ty = 6 + high * BH * 0.85, tz = 28 + s.ents.length * 1.6 + Math.max(0, high - 8) * 0.5;
    s.camY += (ty - s.camY) * Math.min(1, dt * 2); s.camZ += (tz - s.camZ) * Math.min(1, dt * 1.5);
    ctx.camera.position.set(0, s.camY + 2, s.camZ); ctx.camera.lookAt(0, s.camY, 0);
    if (Math.floor(s.t * 3) !== s.lastHud) { s.lastHud = Math.floor(s.t * 3); this.hud(); }
    if (!s.over && (s.t >= DURATION || s.ents.every((e) => e.done))) {
      s.over = true;
      ctx.finish([...s.ents].sort((a, b) => b.floors - a.floors || b.perfect - a.perfect).map((e) => ({ id: e.p.id, text: `${e.floors} tầng · ${e.perfect} lần chuẩn` })));
    }
  },

  think(dt) {
    const s = S;
    for (const e of s.ents) {
      const p = e.p;
      if (!p.bot || e.done || !tick(p, dt, 0.03)) continue;
      const top = e.layers[e.layers.length - 1];
      const tol = 0.1 + (1 - p.skill) * 0.55;
      if (Math.abs(this.moverX(e) - top.x) < tol && e.cd <= 0) pulse(p, 'a');
    }
  },

  dispose() { if (S) { S.fx.dispose(); S.boxGeo.dispose(); S = null; } },
};
