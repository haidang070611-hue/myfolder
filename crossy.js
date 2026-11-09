import * as THREE from 'three';
import { clamp, rand, fmtTime, makeFX } from '/js/util.js';
import { std, glow, mesh, T } from '/js/gfx.js';
import { setupScene, spawnBeans, stepBean, pushApart, clampRect, showBean } from '/js/party.js';
import { tick, stick, idle } from '/js/bots.js';

const HX = 15, START = 12.5, GOAL = -12.5, DURATION = 60;
const LANES = [8.6, 6.2, 3.8, 1.4, -1.0, -3.4, -5.8, -8.2];
let S = null;

export default {
  id: 'crossy',
  name: 'Băng Qua Đường',
  emoji: '🚗',
  cat: 'race',
  bots: 4,
  color: '#ffb02e',
  tag: '1-8 người · 60 giây',
  desc: 'Băng qua 8 làn đường đông xe để chạm vạch đích phía trên. Bị xe tông thì quay lại vạch xuất phát. Qua đường nhiều lần nhất sẽ thắng!',
  cfg: { a: 'LAO', b: '', gyro: false, hideStick: false, hint: 'Chạy lên phía trên · canh khoảng trống giữa các xe · A để lao' },

  init(ctx) {
    const scene = ctx.scene;
    setupScene(ctx, { bg: 0x9cc7ee, sky: [0x3f86e8, 0xcfe6ff, 0x6a7a58, [0.4, 0.5, 0.6]], size: 30, cam: [0, 32, 15], look: [0, 0, 0.5], fogNear: 80, fogFar: 170, light: { sun: 3, hemi: 0.7 } });
    const grass = std(0xffffff, { map: T.grass(18), roughness: 1, envMapIntensity: 0.1 });
    const asphalt = std(0xffffff, { map: T.asphalt(0.2), roughness: 0.85, envMapIntensity: 0.25 });
    const strip = (z, d, m) => { const g = mesh(new THREE.BoxGeometry(HX * 2 + 8, 0.5, d), m, false, true); g.position.set(0, -0.25, z); scene.add(g); };
    strip(START + 1.4, 5.4, grass); strip(GOAL - 1.4, 5.4, grass);
    strip((LANES[0] + LANES[LANES.length - 1]) / 2, LANES[0] - LANES[LANES.length - 1] + 3.6, asphalt);
    const dashM = new THREE.MeshBasicMaterial({ color: 0xf0f0f0 });
    for (let i = 0; i < LANES.length - 1; i++) for (let x = -HX - 3; x < HX + 3; x += 3) { const d = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.02, 0.14), dashM); d.position.set(x, 0.03, (LANES[i] + LANES[i + 1]) / 2); scene.add(d); }
    const goal = mesh(new THREE.BoxGeometry(HX * 2 + 4, 0.06, 0.6), glow(0x4dff88, 2), false); goal.position.set(0, 0.05, GOAL + 0.6); scene.add(goal);
    const flagM = std(0xffffff, { roughness: 0.5 });
    for (const sx of [-1, 1]) { const pole = mesh(new THREE.CylinderGeometry(0.1, 0.1, 5, 8), flagM); pole.position.set(sx * (HX + 1), 2.5, GOAL); scene.add(pole); }
    const banner = mesh(new THREE.BoxGeometry(HX * 2 + 2, 0.9, 0.15), glow(0x4dff88, 1.6), false); banner.position.set(0, 5, GOAL); scene.add(banner);

    S = { ctx, fx: makeFX(THREE, scene), cars: [], t: 0, time: 0, over: false, lastHud: -1 };
    const palette = [0xe8333f, 0x3db2ff, 0xffd23f, 0x4dff88, 0xc77dff, 0xff9f1c, 0xf4f4f8, 0x2ee6d6];
    const bodyGeo = new THREE.BoxGeometry(1, 0.9, 1), cabGeo = new THREE.BoxGeometry(1, 0.7, 1), wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12); wheelGeo.rotateX(Math.PI / 2);
    const glass = std(0x0a1424, { roughness: 0.1, metalness: 0.5 }), tire = std(0x15161a, { roughness: 0.9 });
    S.geos = [bodyGeo, cabGeo, wheelGeo];
    LANES.forEach((z, li) => {
      const dir = li % 2 ? 1 : -1, speed = rand(4.5, 8.5) + li * 0.15, count = 3 + (li % 3 === 0 ? 1 : 0);
      for (let k = 0; k < count; k++) {
        const truck = Math.random() < 0.28, len = truck ? 5.6 : rand(2.8, 3.6);
        const g = new THREE.Group();
        const col = palette[(li * 3 + k) % palette.length];
        const body = mesh(bodyGeo, std(col, { roughness: 0.3, metalness: 0.55, envMapIntensity: 1 })); body.scale.set(len, 1, 1.9); body.position.y = 0.75;
        const cab = mesh(cabGeo, glass); cab.scale.set(truck ? 1.5 : len * 0.5, 1, 1.7); cab.position.set(truck ? len * 0.33 : -len * 0.05, 1.55, 0);
        g.add(body, cab);
        for (const wx of [-len * 0.32, len * 0.32]) for (const wz of [-0.95, 0.95]) { const w = mesh(wheelGeo, tire, false); w.position.set(wx, 0.42, wz); g.add(w); }
        const hl = mesh(new THREE.BoxGeometry(0.12, 0.25, 0.4), glow(0xfff1c0, 3), false); hl.position.set(len / 2, 0.85, 0.55); const hl2 = hl.clone(); hl2.position.z = -0.55; g.add(hl, hl2);
        g.rotation.y = dir > 0 ? 0 : Math.PI;
        const span = HX * 2 + 14, x = -HX - 7 + (span / count) * k + rand(-2, 2);
        g.position.set(x, 0, z); scene.add(g);
        S.cars.push({ g, x, z, v: dir * speed, len, span });
      }
    });
    S.ents = spawnBeans(ctx, (i, n) => [(i - (n - 1) / 2) * Math.min(3.4, 26 / Math.max(1, n)), START], () => ({ crossings: 0, stun: 0, hits: 0, dash: 0, cd: 0, sx: 0 }));
    S.ents.forEach((e) => { e.sx = e.x; e.fx = 0; e.fz = -1; e.ang = Math.PI; });
    ctx.hud.title('Băng Qua Đường');
    this.hud();
  },

  hud() { S.ctx.hud.board([...S.ents].sort((a, b) => b.crossings - a.crossings).map((e) => ({ color: e.p.color, name: e.p.name, text: `${e.crossings} 🏁${e.stun > 0 ? ' 💫' : ''}` }))); },

  update(dt) {
    const s = S, ctx = s.ctx;
    s.time += dt; s.t += dt; s.fx.update(dt);
    ctx.hud.timer(fmtTime(Math.max(0, DURATION - s.t)));
    for (const c of s.cars) {
      c.x += c.v * dt;
      const half = HX + 7;
      if (c.x > half) c.x -= c.span; else if (c.x < -half) c.x += c.span;
      c.g.position.x = c.x;
    }
    for (const e of s.ents) {
      e.cd -= dt; e.dash -= dt; e.stun -= dt;
      const lock = e.stun > 0;
      stepBean(e, dt, { acc: lock ? 0 : 58, drag: 5.4, max: e.dash > 0 ? 13 : 7.6, lock });
      if (!lock && e.p.press.a && e.cd <= 0) { e.vx += e.fx * 11; e.vz += e.fz * 11; e.dash = 0.22; e.cd = 1.3; ctx.sfx.dash(); }
    }
    pushApart(s.ents, 0.6, 0.3);
    for (const e of s.ents) {
      clampRect(e, HX, START + 2);
      if (e.stun <= 0) for (const c of s.cars) {
        if (Math.abs(e.z - c.z) < 1.35 && Math.abs(e.x - c.x) < c.len / 2 + 0.55) {
          e.stun = 1.0; e.rs = true; e.hits++; e.vx = Math.sign(c.v) * 14; e.vz = 3;
          ctx.sfx.boom(); ctx.shake(0.45); ctx.vibrate(e.p.id, 250);
          s.fx.burst(e.x, 1, e.z, e.p.color, 16, 10); this.hud(); break;
        }
      }
      if (e.rs && e.stun <= 0) { e.rs = false; e.x = e.sx; e.z = START; e.vx = e.vz = 0; s.fx.ring(e.x, e.z, e.p.color, 3, 0.4); this.hud(); }
      if (e.z < GOAL + 0.8 && e.stun <= 0) {
        e.crossings++; ctx.sfx.gem(); ctx.vibrate(e.p.id, 80);
        s.fx.burst(e.x, 1.5, e.z, '#4dff88', 18, 10); s.fx.ring(e.x, e.z, '#ffffff', 4, 0.5);
        e.x = e.sx; e.z = START; e.vx = e.vz = 0; this.hud();
      }
      showBean(e, dt, s.time);
      e.g.rotation.z = e.stun > 0 ? Math.sin(s.time * 28) * 0.3 : 0;
      e.g.scale.y = e.stun > 0 ? 0.5 : 1;
    }
    if (Math.floor(s.t * 3) !== s.lastHud) { s.lastHud = Math.floor(s.t * 3); this.hud(); }
    if (!s.over && s.t >= DURATION) {
      s.over = true;
      ctx.finish([...s.ents].sort((a, b) => b.crossings - a.crossings || a.hits - b.hits).map((e) => ({ id: e.p.id, text: `${e.crossings} lần qua · bị tông ${e.hits}` })));
    }
  },

  think(dt) {
    const s = S;
    for (const e of s.ents) {
      const p = e.p;
      if (!p.bot || !tick(p, dt, 0.07)) continue;
      if (e.stun > 0) { idle(p); continue; }
      // làn kế tiếp phía trước: có xe nào sắp lao tới vị trí mình không?
      let danger = false;
      for (const c of s.cars) {
        const dz = e.z - c.z;
        if (dz < 0.2 || dz > 3.3) continue;
        const pad = c.len / 2 + 1.3 + (1 - p.skill) * 0.6;
        for (const t of [0, 0.35, 0.7]) if (Math.abs(c.x + c.v * t - e.x) < pad) danger = true;
      }
      let inLane = false;
      for (const c of s.cars) if (Math.abs(e.z - c.z) < 1.2) { inLane = true; break; }
      if (danger && !inLane) stick(p, 0, 0.1);
      else stick(p, 0, -1);
    }
  },

  dispose() { if (S) { S.fx.dispose(); for (const g of S.geos) g.dispose(); S = null; } },
};
