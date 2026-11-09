import * as THREE from 'three';
import { clamp, fmtTime, makeFX } from '/js/util.js';
import { std, mesh } from '/js/gfx.js';
import { setupScene, spawnBeans, stepBean, pushApart, clampRect, showBean } from '/js/party.js';
import { tick, pulse, hold, stick, idle, toward, away, nearest, wobble, chance, ai, segHitsRect } from '/js/bots.js';

const COLS = 24, ROWS = 14, CS = 1.5, DURATION = 60;
const W = COLS * CS, H = ROWS * CS;
let S = null;

export default {
  id: 'paint',
  name: 'Tô Màu',
  emoji: '🎨',
  cat: 'party',
  bots: 4,
  color: '#c77dff',
  tag: '1-8 người · 60 giây',
  desc: 'Chạy đến đâu tô màu của mình đến đó, đè lên màu đối thủ. A để nổ bom sơn tô cả một vùng lớn. Phủ nhiều ô nhất sau 60 giây là thắng.',
  cfg: { a: 'BOM SƠN', b: '', gyro: false, hideStick: false, hint: 'Chạy để tô màu · A: bom sơn vùng lớn' },

  init(ctx) {
    const scene = ctx.scene;
    setupScene(ctx, { bg: 0x10162a, size: 26, cam: [0, 33, 19], look: [0, 0, 1], light: { sun: 2.8, hemi: 0.65 } });
    const base = mesh(new THREE.BoxGeometry(W + 3, 1, H + 3), std(0x151a30, { roughness: 0.7, metalness: 0.3 }), false, true);
    base.position.y = -0.7; scene.add(base);
    const geo = new THREE.BoxGeometry(CS * 0.93, 0.34, CS * 0.93); geo.translate(0, -0.17, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0.15, envMapIntensity: 0.6 });
    const cells = new THREE.InstancedMesh(geo, mat, COLS * ROWS);
    cells.receiveShadow = true;
    const dummy = new THREE.Object3D(), neutral = new THREE.Color(0x252b4a);
    for (let i = 0; i < COLS; i++) for (let j = 0; j < ROWS; j++) {
      dummy.position.set((i - (COLS - 1) / 2) * CS, 0, (j - (ROWS - 1) / 2) * CS); dummy.updateMatrix();
      cells.setMatrixAt(i * ROWS + j, dummy.matrix); cells.setColorAt(i * ROWS + j, neutral);
    }
    scene.add(cells);

    S = { ctx, fx: makeFX(THREE, scene), cells, geo, mat, owner: new Int16Array(COLS * ROWS).fill(-1), count: new Map(), dirty: false, t: 0, time: 0, over: false, lastHud: -1, col: new THREE.Color() };
    S.ents = spawnBeans(ctx, (i, n) => [(i - (n - 1) / 2) * 3.4, (i % 2 ? 1 : -1) * 3], () => ({ cd: 0 }));
    S.ents.forEach((e) => S.count.set(e.p.id, 0));
    ctx.hud.title('Tô Màu');
    this.hud();
  },

  cellPos(i, j) { return [(i - (COLS - 1) / 2) * CS, (j - (ROWS - 1) / 2) * CS]; },

  paintCell(i, j, e) {
    if (i < 0 || j < 0 || i >= COLS || j >= ROWS) return;
    const idx = i * ROWS + j, s = S;
    if (s.owner[idx] === e.p.id) return;
    if (s.owner[idx] >= 0) s.count.set(s.owner[idx], s.count.get(s.owner[idx]) - 1);
    s.owner[idx] = e.p.id; s.count.set(e.p.id, s.count.get(e.p.id) + 1);
    s.cells.setColorAt(idx, s.col.set(e.p.color)); s.dirty = true;
  },

  hud() {
    const s = S, total = COLS * ROWS;
    s.ctx.hud.board([...s.ents].sort((a, b) => s.count.get(b.p.id) - s.count.get(a.p.id)).map((e) => ({ color: e.p.color, name: e.p.name, text: `${Math.round((s.count.get(e.p.id) / total) * 100)}%` })));
  },


  // ---- AI bot: lấy mẫu vài ô, chạy tới ô "chưa phải của mình" gần nhất; ném bom sơn khi quanh mình còn nhiều ô chưa tô ----
  think(dt) {
    const s = S;
    for (const e of s.ents) {
      const p = e.p;
      if (!p.bot || !tick(p, dt, 0.12)) continue;
      const a = ai(p);
      if (a.tx === undefined || Math.hypot(a.tx - e.x, a.tz - e.z) < 1.2 || s.t > a.until) {
        let best = null, bd = 1e9;
        const tries = 8 + Math.floor(p.skill * 10);
        for (let k = 0; k < tries; k++) {
          const i = Math.floor(Math.random() * COLS), j = Math.floor(Math.random() * ROWS);
          if (s.owner[i * ROWS + j] === p.id) continue;
          const [x, z] = this.cellPos(i, j);
          const d = Math.hypot(x - e.x, z - e.z) + Math.random() * 4;
          if (d < bd) { bd = d; best = [x, z]; }
        }
        if (best) { a.tx = best[0]; a.tz = best[1]; }
        else { a.tx = (Math.random() - 0.5) * W * 0.8; a.tz = (Math.random() - 0.5) * H * 0.8; }
        a.until = s.t + 3;
      }
      toward(p, e, a.tx, a.tz, 1, 0.2);
      if (e.cd <= 0) {
        const ci = Math.round(e.x / CS + (COLS - 1) / 2), cj = Math.round(e.z / CS + (ROWS - 1) / 2);
        let n = 0;
        for (let i = ci - 3; i <= ci + 3; i++) for (let j = cj - 3; j <= cj + 3; j++) {
          if (i < 0 || j < 0 || i >= COLS || j >= ROWS) continue;
          if (s.owner[i * ROWS + j] !== p.id) n++;
        }
        if (n > 28 && chance(p, 0.9)) pulse(p, 'a');
      }
    }
  },

  update(dt) {
    const s = S, ctx = s.ctx;
    s.time += dt; s.t += dt; s.fx.update(dt);
    ctx.hud.timer(fmtTime(Math.max(0, DURATION - s.t)));

    for (const e of s.ents) {
      e.cd -= dt;
      stepBean(e, dt, { acc: 56, drag: 5, max: 10 });
      if (e.p.press.a && e.cd <= 0) {
        e.cd = 5;
        const ci = Math.round(e.x / CS + (COLS - 1) / 2), cj = Math.round(e.z / CS + (ROWS - 1) / 2), R = 3;
        for (let i = ci - R; i <= ci + R; i++) for (let j = cj - R; j <= cj + R; j++) {
          const [px, pz] = this.cellPos(i, j);
          if (Math.hypot(px - e.x, pz - e.z) <= 4.6) this.paintCell(i, j, e);
        }
        ctx.sfx.paint(); ctx.shake(0.3); ctx.vibrate(e.p.id, 90);
        s.fx.ring(e.x, e.z, e.p.color, 10, 0.5, 0.4); s.fx.burst(e.x, 0.8, e.z, e.p.color, 22, 12);
      }
    }
    pushApart(s.ents, 0.62, 0.5);
    for (const e of s.ents) {
      clampRect(e, W / 2 - 0.7, H / 2 - 0.7);
      const ci = Math.round(e.x / CS + (COLS - 1) / 2), cj = Math.round(e.z / CS + (ROWS - 1) / 2);
      for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
        const [px, pz] = this.cellPos(i, j);
        if (Math.hypot(px - e.x, pz - e.z) < 1.0) this.paintCell(i, j, e);
      }
      showBean(e, dt, s.time);
    }
    if (s.dirty) { s.cells.instanceColor.needsUpdate = true; s.dirty = false; }
    if (Math.floor(s.t * 3) !== s.lastHud) { s.lastHud = Math.floor(s.t * 3); this.hud(); }

    if (!s.over && s.t >= DURATION) {
      s.over = true;
      const total = COLS * ROWS;
      const rank = [...s.ents].sort((a, b) => s.count.get(b.p.id) - s.count.get(a.p.id));
      ctx.finish(rank.map((e) => ({ id: e.p.id, text: `${s.count.get(e.p.id)} ô (${Math.round((s.count.get(e.p.id) / total) * 100)}%)` })));
    }
  },

  dispose() { if (S) { S.fx.dispose(); S.geo.dispose(); S.mat.dispose(); S.cells.dispose(); S = null; } },
};
