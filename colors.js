import * as THREE from 'three';
import { rand, fmtTime, makeFX } from '/js/util.js';
import { std, glow, mesh } from '/js/gfx.js';
import { setupScene, spawnBeans, stepBean, pushApart, showBean, hudRows } from '/js/party.js';
import { tick, pulse, stick, idle, nearest, chance } from '/js/bots.js';

const COLS = 6, ROWS = 4, TS = 4.2, MAXR = 14;
const HX = (COLS * TS) / 2, HZ = (ROWS * TS) / 2;
const PAL = [
  { n: 'ĐỎ', c: 0xff4d5e }, { n: 'VÀNG', c: 0xffd23f }, { n: 'XANH LÁ', c: 0x45e07a },
  { n: 'XANH DƯƠNG', c: 0x3aa8ff }, { n: 'TÍM', c: 0xb36cff }, { n: 'CAM', c: 0xff8a3d },
];
let S = null;

export default {
  id: 'colors',
  name: 'Chạy Màu',
  emoji: '🌈',
  color: '#b36cff',
  cat: 'party',
  bots: 5,
  tag: '1-8 người · loại dần',
  desc: 'Màn hình báo một màu: nhanh chân chạy sang ô đúng màu trước khi các ô còn lại biến mất! Mỗi vòng càng ít thời gian. Người cuối cùng còn trụ lại thắng.',
  cfg: { a: 'LAO', b: '', gyro: false, hideStick: false, hint: 'Chạy tới ô đúng màu được báo · A để lao' },

  init(ctx) {
    const scene = ctx.scene;
    setupScene(ctx, { bg: 0x120c22, size: 26, cam: [0, 26, 15], look: [0, 0, 0.5], light: { sun: 2.4, hemi: 0.7 } });
    S = { ctx, fx: makeFX(THREE, scene), t: 0, time: 0, over: false, round: 0, phase: 'show', pt: 0, target: 0, grid: [], tiles: [], deaths: 0, lastHud: -1 };
    S.geo = new THREE.BoxGeometry(TS - 0.25, 0.7, TS - 0.25);
    S.mats = PAL.map((p) => std(p.c, { roughness: 0.4, metalness: 0.1, emissive: p.c, emissiveIntensity: 0.12 }));
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const m = mesh(S.geo, S.mats[0], false, true);
      m.position.set(-HX + TS * (c + 0.5), -0.35, -HZ + TS * (r + 0.5));
      scene.add(m);
      S.tiles.push({ m, c, r, ci: 0, y: 0, vy: 0, gone: false });
    }
    S.ents = spawnBeans(ctx, (i, n) => [(i - (n - 1) / 2) * 2.2, 0], () => ({ cd: 0, dash: 0, out: -1, outRound: 0 }));
    this.newRound();
    ctx.hud.title('Chạy Màu');
  },

  hud() {
    const s = S;
    s.ctx.hud.board(hudRows([...s.ents].sort((a, b) => (b.alive - a.alive) || (b.out - a.out)), (e) => (e.alive ? '😀' : `❌ v${e.outRound}`)));
  },

  newRound() {
    const s = S;
    s.round++;
    s.target = Math.floor(Math.random() * PAL.length);
    for (const t of s.tiles) {
      t.ci = Math.random() < 0.34 ? s.target : (s.target + 1 + Math.floor(Math.random() * (PAL.length - 1))) % PAL.length;
      t.m.material = s.mats[t.ci]; t.y = 0; t.vy = 0; t.gone = false; t.m.visible = true;
      t.m.position.y = -0.35;
    }
    s.phase = 'show';
    s.showT = Math.max(1.2, 3.4 - s.round * 0.2);
    s.pt = 0;
    const nm = PAL[s.target];
    s.shown = false;
    s.ctx.sfx.pass();
    this.hud();
  },

  tileAt(x, z) {
    const c = Math.floor((x + HX) / TS), r = Math.floor((z + HZ) / TS);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
    return S.tiles[r * COLS + c];
  },

  think(dt) {
    const s = S;
    for (const e of s.ents) {
      const p = e.p;
      if (!p.bot || !tick(p, dt, 0.1)) continue;
      if (!e.alive || e.falling) { idle(p); continue; }
      const here = this.tileAt(e.x, e.z);
      const good = here && here.ci === s.target && !here.gone;
      if (s.phase === 'show' && s.pt < s.showT * (0.15 + (1 - p.skill) * 0.6)) { // bot dở phản ứng chậm hơn
        if (!good) idle(p); else stick(p, 0, 0);
        continue;
      }
      if (good && s.phase !== 'show') { idle(p); continue; }
      // ô đúng màu gần nhất, ưu tiên ô ít người
      let best = null, bs = 1e9;
      for (const t of s.tiles) {
        if (t.ci !== s.target || t.gone) continue;
        const cx = -HX + TS * (t.c + 0.5), cz = -HZ + TS * (t.r + 0.5);
        let d = Math.hypot(cx - e.x, cz - e.z);
        for (const o of s.ents) if (o !== e && o.alive && Math.hypot(o.x - cx, o.z - cz) < 2) d += 1.2;
        if (t === here) d -= 2;
        if (d < bs) { bs = d; best = [cx, cz, d]; }
      }
      if (!best) { idle(p); continue; }
      const dx = best[0] - e.x, dz = best[1] - e.z, L = Math.hypot(dx, dz);
      if (L < 0.6) idle(p); else stick(p, dx / L, dz / L);
      if (s.phase === 'show' && s.pt > s.showT - 1.0 && L > 5 && e.cd <= 0 && chance(p, 0.7)) pulse(p, 'a');
    }
  },

  update(dt) {
    const s = S, ctx = s.ctx;
    s.time += dt; s.t += dt; s.pt += dt; s.fx.update(dt);
    ctx.hud.timer(`Vòng ${s.round}`);

    if (s.phase === 'show') {
      if (!s.shown && s.t > 0.8) { s.shown = true; const nm = PAL[s.target]; ctx.hud.banner(nm.n, 0, true, '#' + nm.c.toString(16).padStart(6, '0')); }
      const left = s.showT - s.pt;
      // ô sai nhấp nháy khi sắp rơi
      for (const t of s.tiles) {
        if (t.ci !== s.target) t.m.position.y = -0.35 + (left < 0.7 ? Math.sin(s.time * 40) * 0.05 : 0);
      }
      if (left <= 0) { s.phase = 'drop'; s.pt = 0; ctx.sfx.crack(); ctx.shake(0.3); ctx.hud.banner('', 0, true); }
    } else if (s.phase === 'drop') {
      for (const t of s.tiles) {
        if (t.ci === s.target) continue;
        t.gone = true; t.vy -= 30 * dt; t.y += t.vy * dt; t.m.position.y = -0.35 + t.y;
        if (t.y < -12) t.m.visible = false;
      }
      if (s.pt > 1.9) { s.phase = 'rest'; s.pt = 0; }
    } else if (s.phase === 'rest') {
      if (s.pt > 0.7) {
        const alive = s.ents.filter((e) => e.alive);
        if (s.ents.length > 1 ? alive.length <= 1 : alive.length === 0) { /* kết thúc ở bên dưới */ }
        else if (s.round >= MAXR) { /* hết vòng */ }
        else this.newRound();
      }
    }

    for (const e of s.ents) {
      if (!e.alive) continue;
      if (e.falling) {
        e.vy = (e.vy || 0) - 32 * dt; e.y += e.vy * dt;
        if (e.y < -9) { e.alive = false; e.g.visible = false; this.hud(); }
        continue;
      }
      e.cd -= dt; e.dash -= dt;
      stepBean(e, dt, { acc: 52, drag: 5.2, max: e.dash > 0 ? 14 : 8.6 });
      if (e.p.press.a && e.cd <= 0) { e.vx += e.fx * 11; e.vz += e.fz * 11; e.dash = 0.25; e.cd = 1.4; ctx.sfx.dash(); s.fx.ring(e.x, e.z, '#ffffff', 2, 0.3); }
      e.x = Math.max(-HX - 1.5, Math.min(HX + 1.5, e.x)); e.z = Math.max(-HZ - 1.5, Math.min(HZ + 1.5, e.z));
    }
    pushApart(s.ents.filter((e) => e.alive && !e.falling), 0.62, 0.5);
    // rơi nếu đứng trên ô đã biến mất (sau 0.35s kể từ lúc ô rơi) hoặc ngoài sân
    for (const e of s.ents) {
      if (!e.alive || e.falling) continue;
      const t = this.tileAt(e.x, e.z);
      if ((!t || (t.gone && s.pt > 0.35 && s.phase !== 'show')) && (s.phase !== 'show')) {
        e.falling = true; e.vy = 0; e.out = s.t; e.outRound = s.round; ctx.sfx.fall(); ctx.vibrate(e.p.id, 200);
      }
    }
    for (const e of s.ents) if (e.alive) showBean(e, dt, s.time);

    if (Math.floor(s.t * 2) !== s.lastHud) { s.lastHud = Math.floor(s.t * 2); this.hud(); }
    const aliveN = s.ents.filter((e) => e.alive && !e.falling).length;
    if (!s.over && s.phase === 'rest' && s.pt > 0.7 && ((s.ents.length > 1 && aliveN <= 1) || aliveN === 0 || s.round >= MAXR)) {
      s.over = true;
      const rank = [...s.ents].sort((a, b) => ((b.alive && !b.falling) - (a.alive && !a.falling)) || (b.out - a.out));
      ctx.finish(rank.map((e) => ({ id: e.p.id, text: e.alive && !e.falling ? `thắng sau ${s.round} vòng 🏆` : `bị loại vòng ${e.outRound || s.round}` })));
    }
  },

  dispose() {
    if (S) { S.fx.dispose(); S.geo.dispose(); S.mats.forEach((m) => m.dispose()); S = null; }
  },
};
