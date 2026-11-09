import * as THREE from 'three';
import { rand, clamp, fmtTime, makeFX } from '/js/util.js';
import { std, glow, mesh, T } from '/js/gfx.js';
import { setupScene, spawnBeans, stepBean, pushApart, showBean, circleRect } from '/js/party.js';
import { tick, pulse, stick, idle, toward, wobble, chance, bfsStep } from '/js/bots.js';

const W = 15, H = 11, CS = 1.9, LIMIT = 120, FUSE = 2.3;
const SPAWN = [[1, 1], [13, 9], [13, 1], [1, 9], [7, 1], [7, 9], [1, 5], [13, 5]];
let S = null;
const wx = (c) => (c - (W - 1) / 2) * CS, wz = (r) => (r - (H - 1) / 2) * CS;
const cellOf = (x, z) => [clamp(Math.round(x / CS + (W - 1) / 2), 0, W - 1), clamp(Math.round(z / CS + (H - 1) / 2), 0, H - 1)];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export default {
  id: 'bomber',
  name: 'Đặt Bom',
  emoji: '💣',
  color: '#ff5a3d',
  cat: 'fight',
  bots: 4,
  tag: '1-8 người · người cuối cùng thắng',
  desc: 'Bấm A đặt bom: nổ theo hình chữ thập sau 2 giây, phá thùng gỗ và hạ gục người trong tầm. Nhặt vật phẩm để nổ xa hơn, đặt nhiều bom hơn, chạy nhanh hơn. Đừng tự nổ mình!',
  cfg: { a: 'ĐẶT BOM', b: '', gyro: false, hideStick: false, hint: 'A đặt bom · chạy ra khỏi vùng nổ · phá thùng nhặt vật phẩm' },

  init(ctx) {
    const scene = ctx.scene;
    setupScene(ctx, { bg: 0x120d18, size: 28, cam: [0, 31, 15], look: [0, 0, 0.8], light: { sun: 2.4, hemi: 0.7 } });
    const floor = mesh(new THREE.BoxGeometry(W * CS + 2, 1, H * CS + 2), std(0xffffff, { map: T.plate([9, 6], [92, 78, 70]), roughness: 0.6, metalness: 0.2 }), false, true);
    floor.position.y = -0.5; scene.add(floor);
    S = { ctx, fx: makeFX(THREE, scene), t: 0, time: 0, over: false, lastHud: -1, grid: new Array(W * H).fill(0), crates: new Map(), bombs: [], flames: [], items: [], order: [] };
    // grid: 0 trống, 1 cột cứng, 2 thùng
    S.pilGeo = new THREE.BoxGeometry(CS, 1.7, CS); S.pilMat = std(0x4a4f78, { roughness: 0.4, metalness: 0.5 });
    S.crateGeo = new THREE.BoxGeometry(CS * 0.9, 1.5, CS * 0.9); S.crateMat = std(0xb8793a, { roughness: 0.7 });
    S.bombGeo = new THREE.SphereGeometry(0.6, 14, 10); S.bombMat = std(0x16161c, { roughness: 0.3, metalness: 0.8 });
    S.fuseMat = glow(0xff3a2a, 3); S.fuseGeo = new THREE.SphereGeometry(0.17, 8, 6);
    S.flameGeo = new THREE.BoxGeometry(CS * 0.85, 0.9, CS * 0.85); S.flameMat = glow(0xff8a1c, 3.2);
    S.itemGeo = new THREE.OctahedronGeometry(0.45, 0);
    S.itemMats = { range: glow(0xff5a5a, 2.4), bomb: glow(0x5ad0ff, 2.4), speed: glow(0xffe36a, 2.4) };
    const safe = (c, r) => SPAWN.slice(0, 8).some(([a, b]) => Math.abs(a - c) + Math.abs(b - r) <= 2);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const border = c === 0 || r === 0 || c === W - 1 || r === H - 1;
      if (border || (c % 2 === 0 && r % 2 === 0)) {
        S.grid[c + r * W] = 1;
        const m = mesh(S.pilGeo, S.pilMat, true, true); m.position.set(wx(c), 0.85, wz(r)); scene.add(m);
      } else if (!safe(c, r) && Math.random() < 0.58) {
        S.grid[c + r * W] = 2;
        const m = mesh(S.crateGeo, S.crateMat, true, true); m.position.set(wx(c), 0.75, wz(r)); scene.add(m); S.crates.set(c + r * W, m);
      }
    }
    S.ents = spawnBeans(ctx, (i) => { const [c, r] = SPAWN[i % SPAWN.length]; return [wx(c), wz(r)]; }, () => ({ range: 2, maxBombs: 1, speed: 6.2, cd: 0, out: -1, kills: 0 }));
    ctx.hud.title('Đặt Bom');
    this.hud();
  },

  hud() { S.ctx.hud.board([...S.ents].sort((a, b) => (b.alive - a.alive) || (b.out - a.out)).map((e) => ({ color: e.p.color, name: e.p.name, text: e.alive ? `💣${e.maxBombs} 🔥${e.range}` : '💀', dead: !e.alive }))); },

  /** các ô bị nổ nếu bom ở (c,r) tầm range nổ */
  blast(c, r, range) {
    const cells = [[c, r]];
    for (const [dc, dr] of DIRS) for (let k = 1; k <= range; k++) {
      const cc = c + dc * k, rr = r + dr * k, g = S.grid[cc + rr * W];
      if (g === 1) break;
      cells.push([cc, rr]);
      if (g === 2) break;
    }
    return cells;
  },
  bombAt(c, r) { return S.bombs.find((b) => b.c === c && b.r === r); },

  placeBomb(e) {
    const s = S;
    const [c, r] = cellOf(e.x, e.z);
    if (s.bombs.filter((b) => b.owner === e).length >= e.maxBombs || this.bombAt(c, r)) return false;
    const g = new THREE.Group();
    const m = mesh(s.bombGeo, s.bombMat); m.position.y = 0.6;
    const f = mesh(s.fuseGeo, s.fuseMat, false); f.position.y = 1.25;
    g.add(m, f); g.position.set(wx(c), 0, wz(r)); s.ctx.scene.add(g);
    s.bombs.push({ g, f, c, r, t: FUSE, owner: e, range: e.range, pass: new Set(s.ents.filter((o) => { const [oc, orr] = cellOf(o.x, o.z); return oc === c && orr === r; })) });
    s.ctx.sfx.tick();
    return true;
  },

  explode(b) {
    const s = S, ctx = s.ctx;
    const i = s.bombs.indexOf(b); if (i < 0) return;
    s.bombs.splice(i, 1); ctx.scene.remove(b.g);
    ctx.sfx.boom(); ctx.shake(0.4);
    for (const [c, r] of this.blast(b.c, b.r, b.range)) {
      const fl = mesh(s.flameGeo, s.flameMat, false); fl.position.set(wx(c), 0.45, wz(r)); ctx.scene.add(fl);
      s.flames.push({ m: fl, c, r, life: 0.55, owner: b.owner });
      const k = c + r * W;
      if (s.grid[k] === 2) {
        s.grid[k] = 0; ctx.scene.remove(s.crates.get(k)); s.crates.delete(k);
        s.fx.burst(wx(c), 1, wz(r), '#b8793a', 8, 7);
        if (Math.random() < 0.34) {
          const kind = ['range', 'bomb', 'speed'][Math.floor(Math.random() * 3)];
          const m = mesh(s.itemGeo, s.itemMats[kind], false); m.position.set(wx(c), 0.8, wz(r)); ctx.scene.add(m);
          s.items.push({ m, c, r, kind, ph: Math.random() * 6 });
        }
      }
      const ob = this.bombAt(c, r); if (ob && ob !== b) ob.t = Math.min(ob.t, 0.06);   // nổ dây chuyền
      s.items = s.items.filter((it) => { if (it.c === c && it.r === r && it.age > 0) { ctx.scene.remove(it.m); return false; } return true; });
    }
  },

  think(dt) {
    const s = S;
    // bản đồ nguy hiểm: ô nằm trong tầm nổ của bom nào đó
    const danger = new Set();
    for (const b of s.bombs) for (const [c, r] of this.blast(b.c, b.r, b.range)) danger.add(c + r * W);
    for (const f of s.flames) danger.add(f.c + f.r * W);
    for (const e of s.ents) {
      const p = e.p;
      if (!p.bot || !tick(p, dt, 0.07)) continue;
      if (!e.alive) { idle(p); continue; }
      const [c, r] = cellOf(e.x, e.z);
      const solid = (cc, rr) => s.grid[cc + rr * W] !== 0 || !!this.bombAt(cc, rr);
      if (danger.has(c + r * W)) {
        const st = bfsStep(W, H, c, r, (cc, rr) => !danger.has(cc + rr * W), (cc, rr) => (s.grid[cc + rr * W] !== 0) || (!!this.bombAt(cc, rr) && !(cc === c && rr === r)));
        if (st) toward(p, e, wx(st[0]), wz(st[1]), 1, 0.08); else idle(p);
        continue;
      }
      // đặt bom được không (có đường thoát)?
      const canEscape = (bc, br) => {
        const bl = new Set(this.blast(bc, br, e.range).map(([a, b]) => a + b * W));
        return bfsStep(W, H, bc, br, (cc, rr) => !bl.has(cc + rr * W) && !danger.has(cc + rr * W), (cc, rr) => s.grid[cc + rr * W] !== 0 || (cc === bc && rr === br) || !!this.bombAt(cc, rr), 6);
      };
      const free = s.bombs.filter((b) => b.owner === e).length < e.maxBombs && !this.bombAt(c, r);
      if (free && chance(p, 0.9)) {
        const bl = this.blast(c, r, e.range);
        const hitsCrate = bl.some(([cc, rr]) => s.grid[cc + rr * W] === 2);
        const hitsFoe = s.ents.some((o) => o !== e && o.alive && bl.some(([cc, rr]) => { const [oc, orr] = cellOf(o.x, o.z); return oc === cc && orr === rr; }));
        if ((hitsCrate || hitsFoe) && canEscape(c, r)) { pulse(p, 'a'); continue; }
      }
      // đi tới: vật phẩm → ô cạnh thùng → đối thủ
      let st = bfsStep(W, H, c, r, (cc, rr) => s.items.some((it) => it.c === cc && it.r === rr), (cc, rr) => solid(cc, rr) || danger.has(cc + rr * W), 9);
      if (!st) st = bfsStep(W, H, c, r, (cc, rr) => DIRS.some(([a, b]) => s.grid[(cc + a) + (rr + b) * W] === 2) && !danger.has(cc + rr * W), (cc, rr) => solid(cc, rr) || danger.has(cc + rr * W));
      if (!st) {
        const foe = s.ents.filter((o) => o !== e && o.alive).sort((a, b) => Math.hypot(a.x - e.x, a.z - e.z) - Math.hypot(b.x - e.x, b.z - e.z))[0];
        if (foe) { const [fc, fr] = cellOf(foe.x, foe.z); st = bfsStep(W, H, c, r, (cc, rr) => cc === fc && rr === fr, (cc, rr) => solid(cc, rr) || danger.has(cc + rr * W)); }
      }
      if (st) toward(p, e, wx(st[0]), wz(st[1]), 1, 0.08); else idle(p);
    }
  },

  update(dt) {
    const s = S, ctx = s.ctx;
    s.time += dt; s.t += dt; s.fx.update(dt);
    ctx.hud.timer(fmtTime(Math.max(0, LIMIT - s.t)));
    for (const e of s.ents) {
      if (!e.alive) continue;
      e.cd -= dt;
      stepBean(e, dt, { acc: 60, drag: 6.4, max: e.speed });
      if (e.p.press.a && e.cd <= 0 && this.placeBomb(e)) e.cd = 0.15;
      const [c, r] = cellOf(e.x, e.z);
      for (let rr = r - 1; rr <= r + 1; rr++) for (let cc = c - 1; cc <= c + 1; cc++) {
        if (cc < 0 || rr < 0 || cc >= W || rr >= H) continue;
        if (s.grid[cc + rr * W] !== 0) circleRect(e, wx(cc), wz(rr), CS / 2, CS / 2, 0.5);
        const b = this.bombAt(cc, rr);
        if (b && !b.pass.has(e)) circleRect(e, wx(cc), wz(rr), CS / 2 - 0.05, CS / 2 - 0.05, 0.5);
      }
    }
    for (const b of s.bombs) { for (const o of [...b.pass]) { if (Math.hypot(o.x - wx(b.c), o.z - wz(b.r)) > CS * 0.95) b.pass.delete(o); } }
    pushApart(s.ents.filter((e) => e.alive), 0.5, 0.3);

    for (const b of [...s.bombs]) {
      b.t -= dt;
      const k = 1 + Math.sin(s.time * (14 + (FUSE - b.t) * 6)) * 0.08;
      b.g.scale.set(k, k, k); b.f.visible = Math.floor(s.time * 12) % 2 === 0;
      if (b.t <= 0) this.explode(b);
    }
    for (let i = s.flames.length - 1; i >= 0; i--) {
      const f = s.flames[i]; f.life -= dt; f.m.scale.y = 0.4 + f.life * 1.5;
      if (f.life <= 0) { ctx.scene.remove(f.m); s.flames.splice(i, 1); }
    }
    // vật phẩm
    for (let i = s.items.length - 1; i >= 0; i--) {
      const it = s.items[i]; it.age = (it.age || 0) + dt; it.m.rotation.y += dt * 3; it.m.position.y = 0.8 + Math.sin(s.time * 4 + it.ph) * 0.12;
      for (const e of s.ents) {
        if (!e.alive || Math.hypot(e.x - wx(it.c), e.z - wz(it.r)) > 0.95) continue;
        if (it.kind === 'range') e.range = Math.min(7, e.range + 1); else if (it.kind === 'bomb') e.maxBombs = Math.min(5, e.maxBombs + 1); else e.speed = Math.min(8.6, e.speed + 0.7);
        ctx.sfx.gem(); ctx.vibrate(e.p.id, 30); s.fx.burst(wx(it.c), 1, wz(it.r), '#ffffff', 8, 6);
        ctx.scene.remove(it.m); s.items.splice(i, 1); this.hud(); break;
      }
    }
    // trúng lửa
    for (const e of s.ents) {
      if (!e.alive) continue;
      const [c, r] = cellOf(e.x, e.z);
      const f = s.flames.find((q) => q.c === c && q.r === r && Math.hypot(e.x - wx(c), e.z - wz(r)) < CS * 0.62);
      if (!f) continue;
      e.alive = false; e.out = s.t; e.g.visible = false; if (f.owner && f.owner !== e) f.owner.kills++;
      ctx.sfx.fall(); ctx.shake(0.5); ctx.vibrate(e.p.id, 400);
      s.fx.burst(e.x, 1, e.z, e.p.color, 26, 11); s.fx.ring(e.x, e.z, '#ff8a1c', 5, 0.5);
      this.hud();
    }
    for (const e of s.ents) if (e.alive) showBean(e, dt, s.time);
    if (Math.floor(s.t * 2) !== s.lastHud) { s.lastHud = Math.floor(s.t * 2); this.hud(); }
    const alive = s.ents.filter((e) => e.alive).length;
    if (!s.over && ((s.ents.length > 1 && alive <= 1) || alive === 0 || s.t >= LIMIT)) {
      s.over = true;
      const rank = [...s.ents].sort((a, b) => (b.alive - a.alive) || (b.out - a.out) || (b.kills - a.kills));
      ctx.finish(rank.map((e) => ({ id: e.p.id, text: e.alive ? `sống sót 🏆${e.kills ? ` · hạ ${e.kills}` : ''}` : `trụ ${e.out.toFixed(0)}s${e.kills ? ` · hạ ${e.kills}` : ''}` })));
    }
  },

  dispose() {
    if (S) {
      S.fx.dispose();
      [S.pilGeo, S.crateGeo, S.bombGeo, S.fuseGeo, S.flameGeo, S.itemGeo].forEach((g) => g.dispose());
      [S.pilMat, S.crateMat, S.bombMat, S.fuseMat, S.flameMat, ...Object.values(S.itemMats)].forEach((m) => m.dispose());
      S = null;
    }
  },
};
