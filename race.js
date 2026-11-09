import { clamp, fmtTime, nameSprite, makeFX } from '/js/util.js';
import { std, glow, mesh, T, skyDome, prepScene } from '/js/gfx.js';
import { makeCar, spinWheels } from '/js/models.js';
import { tick, pulse, hold, stick, idle, toward, away, nearest, wobble, chance, ai, segHitsRect } from '/js/bots.js';
import { angleDiff } from '/js/util.js';

const A = 26, B = 17, W = 0.27; // elip đường đua, độ rộng (theo tỉ lệ)
const LAPS = 4;
const TAU = Math.PI * 2;
let S = null;

const ellipseR = (x, z) => Math.sqrt((x / A) * (x / A) + (z / B) * (z / B));

export default {
  id: 'race',
  name: 'Đua xe Gyro',
  emoji: '🏎️',
  cat: 'race',
  bots: 4,
  color: '#3db2ff',
  tag: '1-8 người · 4 vòng',
  desc: 'Nghiêng điện thoại để lái. Xe tự chạy, A là nitro, B là phanh. Về nhất sau 4 vòng, đừng lấn ra bãi cỏ!',
  cfg: { a: 'NITRO', b: 'PHANH', gyro: true, hideStick: false, hint: 'Bấm "Nghiêng" để lái bằng cách nghiêng máy, hoặc dùng cần gạt trái/phải' },

  init(ctx) {
    const { THREE, scene, camera } = ctx;
    prepScene(scene);
    scene.add(skyDome(0x3f86e8, 0xcfe6ff, 0x7a8a78, [0.45, 0.42, 0.7]));
    scene.fog = new THREE.Fog(0xbfd9f2, 110, 230);
    ctx.addLights(48, { sun: 3.2, hemi: 0.75, color: 0xfff0d8, dir: [0.45, 1.0, 0.55] });
    camera.position.set(0, 54, 21);
    camera.lookAt(0, 0, 1);

    // cỏ có hoa văn
    const grass = mesh(new THREE.PlaneGeometry(400, 400), std(0xffffff, { map: T.grass(80), roughness: 1, envMapIntensity: 0.1 }), false, true);
    grass.rotation.x = -Math.PI / 2; grass.position.y = -0.05;
    scene.add(grass);

    // mặt đường nhựa: elip ngoài - elip trong (UV theo mét, 1 ô nhựa = 8 mét)
    const rOut = 1 + W, rIn = 1 - W;
    const shape = new THREE.Shape();
    shape.absellipse(0, 0, A * rOut, B * rOut, 0, TAU, false);
    const hole = new THREE.Path();
    hole.absellipse(0, 0, A * rIn, B * rIn, 0, TAU, true);
    shape.holes.push(hole);
    const road = mesh(new THREE.ShapeGeometry(shape, 128), std(0xffffff, { map: T.asphalt(0.125), bumpMap: T.asphalt(0.125), bumpScale: 1.2, roughness: 0.82, envMapIntensity: 0.25 }), false, true);
    road.rotation.x = -Math.PI / 2;
    scene.add(road);

    // lề sơn đỏ trắng
    const kerb = (r) => {
      const pts = [];
      for (let i = 0; i <= 160; i++) { const t = (i / 160) * TAU; pts.push(new THREE.Vector3(A * r * Math.cos(t), 0.05, B * r * Math.sin(t))); }
      const m = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 240, 0.26, 8, true), std(0xffffff, { map: T.kerb(70), roughness: 0.5 }), false, true);
      m.scale.y = 0.55;
      scene.add(m);
    };
    kerb(rOut); kerb(rIn);

    // vạch giữa đường (đứt nét)
    const dashM = new THREE.MeshBasicMaterial({ color: 0xf2f2f2 });
    const dashG = new THREE.BoxGeometry(0.3, 0.02, 2.2);
    for (let i = 0; i < 90; i++) {
      const t = (i / 90) * TAU;
      const d = new THREE.Mesh(dashG, dashM);
      d.position.set(A * Math.cos(t), 0.03, B * Math.sin(t));
      d.rotation.y = Math.atan2(-A * Math.sin(t), B * Math.cos(t));
      scene.add(d);
    }

    // vạch xuất phát (θ = 0, trục +x) kẻ ô đen trắng
    const sq = (A * 2 * W) / 10;
    const lineW = new THREE.MeshBasicMaterial({ color: 0xffffff }), lineB = new THREE.MeshBasicMaterial({ color: 0x111111 });
    for (let i = 0; i < 10; i++) for (let j = 0; j < 2; j++) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(sq, 0.7), (i + j) % 2 ? lineB : lineW);
      c.rotation.x = -Math.PI / 2; c.position.set(A - A * W + sq * (i + 0.5), 0.035, (j - 0.5) * 0.7);
      scene.add(c);
    }
    // cổng xuất phát
    const gateM = std(0x2a2f40, { roughness: 0.4, metalness: 0.7 });
    for (const dx of [-1, 1]) { const p = mesh(new THREE.BoxGeometry(0.5, 7, 0.5), gateM); p.position.set(A + dx * (A * W + 1), 3.5, 0); scene.add(p); }
    const beam = mesh(new THREE.BoxGeometry(A * 2 * W + 3.2, 1.2, 0.6), gateM); beam.position.set(A, 7, 0); scene.add(beam);
    const sign = mesh(new THREE.BoxGeometry(A * 2 * W, 0.6, 0.65), glow(0xff3b3b, 2.2), false); sign.position.set(A, 7, 0); scene.add(sign);

    // cây: thân + 3 tầng lá, kích thước ngẫu nhiên
    const trunkG = new THREE.CylinderGeometry(0.3, 0.45, 1.8, 8);
    const trunkM = std(0x6b4a2b, { roughness: 1 });
    const leafMs = [std(0x1f6f3a, { roughness: 0.9 }), std(0x2a8444, { roughness: 0.9 }), std(0x1a5c30, { roughness: 0.9 })];
    const tree = (x, z, k) => {
      const sc = 0.8 + ((k * 37) % 10) / 14;
      const g = new THREE.Group();
      const t = mesh(trunkG, trunkM); t.position.y = 0.9; g.add(t);
      for (let i = 0; i < 3; i++) { const l = mesh(new THREE.ConeGeometry(1.9 - i * 0.45, 2.6, 9), leafMs[(k + i) % 3]); l.position.y = 2.6 + i * 1.35; g.add(l); }
      g.position.set(x, 0, z); g.scale.setScalar(sc); g.rotation.y = k;
      scene.add(g);
    };
    for (let i = 0; i < 34; i++) { const a = (i / 34) * TAU + 0.1; tree(Math.cos(a) * A * 1.62, Math.sin(a) * B * 1.78, i); }
    for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; tree(Math.cos(a) * A * 0.3, Math.sin(a) * B * 0.3, i + 40); }

    S = { ctx, THREE, scene, fx: makeFX(THREE, scene), t: 0, cars: [], finished: 0, firstFinishT: null, over: false, ranks: [] };

    ctx.players.forEach((p, i) => {
      const g = new THREE.Group();
      const car = makeCar(p.color);
      g.add(car);
      const label = nameSprite(THREE, p.name, p.color);
      label.position.y = 3; label.scale.set(5, 1.25, 1);
      g.add(label);
      // thanh nitro
      const bar = new THREE.Mesh(new THREE.BoxGeometry(2, 0.12, 0.25), new THREE.MeshBasicMaterial({ color: 0x45e0ff }));
      bar.position.y = 2.3; g.add(bar);
      scene.add(g);

      // lưới xuất phát: 2 làn, xếp lùi sau vạch
      const row = Math.floor(i / 2), lane = i % 2;
      const th = -(0.07 + row * 0.085);
      const rr = lane ? 0.9 : 1.1; // lệch làn
      const x = A * rr * Math.cos(th), z = B * rr * Math.sin(th);
      const tx = -A * Math.sin(th), tz = B * Math.cos(th);
      S.cars.push({
        p, g, car, bar, x, z, h: Math.atan2(tx, tz), s: 0, prog: th, th, laps: 0, nitro: 1, boosting: false,
        finish: null, off: false, lapT: 0, best: null, lean: 0,
      });
    });
    S.ctx.hud.title(`Đua xe · ${LAPS} vòng`);
    this.hud();
  },

  hud() {
    const s = S;
    const order = this.order();
    s.ctx.hud.board(order.map((c, i) => ({
      color: c.p.color, name: `${i + 1}. ${c.p.name}`,
      text: c.finish != null ? fmtTime(c.finish) : `Vòng ${Math.min(LAPS, Math.max(0, Math.floor(c.prog / TAU)) + 1)}/${LAPS}`,
    })));
  },

  order() {
    return [...S.cars].sort((a, b) => {
      if (a.finish != null && b.finish != null) return a.finish - b.finish;
      if (a.finish != null) return -1;
      if (b.finish != null) return 1;
      return b.prog - a.prog;
    });
  },


  // ---- AI bot: bám đường tâm elip, nitro khi đường thẳng, phanh khi cua gắt ----
  think(dt) {
    const s = S;
    for (const c of s.cars) {
      const p = c.p;
      if (!p.bot || !tick(p, dt, 0.04)) continue;
      const a = ai(p);
      if (a.lane === undefined) a.lane = 0.9 + Math.random() * 0.2;
      const th = Math.atan2(c.z / B, c.x / A);
      const tt = th + 0.09 + c.s * 0.004;
      const tx = A * a.lane * Math.cos(tt), tz = B * a.lane * Math.sin(tt);
      const diff = angleDiff(c.h, Math.atan2(tx - c.x, tz - c.z));
      p.input.x = clamp(-diff * 1.9 + wobble(p, 0.25), -1, 1);
      hold(p, 'a', c.finish == null && Math.abs(diff) < 0.22 && c.nitro > (p.skill > 0.8 ? 0.08 : 0.5) && chance(p, 1.1));
      hold(p, 'b', Math.abs(diff) > 0.85 && c.s > 17);
    }
  },

  update(dt) {
    const s = S, ctx = s.ctx;
    s.t += dt;
    s.fx.update(dt);
    ctx.hud.timer(fmtTime(s.t));

    for (const c of s.cars) {
      const inp = c.p.input;
      const done = c.finish != null;
      const r = ellipseR(c.x, c.z);
      c.off = Math.abs(r - 1) > W;

      // ga, nitro, phanh
      let maxS = c.off ? 11 : 25;
      let acc = 16;
      c.boosting = false;
      if (!done && inp.a && c.nitro > 0.02) {
        c.boosting = true; maxS = c.off ? 16 : 38; acc = 44;
        c.nitro = Math.max(0, c.nitro - dt * 0.42);
        if (Math.random() < dt * 4) ctx.sfx.nitro();
      } else c.nitro = Math.min(1, c.nitro + dt * 0.1);
      if (done) maxS = 8;
      if (!done && inp.b) c.s = Math.max(0, c.s - 42 * dt);
      else if (c.s < maxS) c.s = Math.min(maxS, c.s + acc * dt);
      else c.s = Math.max(maxS, c.s - 26 * dt);

      // lái (x dương = phải)
      const steer = done ? 0.3 : inp.x;
      const grip = clamp(c.s / 6, 0.35, 1);
      c.h -= steer * (2.5 - 0.9 * c.s / 38) * grip * dt;
      c.x += Math.sin(c.h) * c.s * dt;
      c.z += Math.cos(c.h) * c.s * dt;
    }

    // va chạm giữa các xe
    for (let i = 0; i < s.cars.length; i++) {
      for (let j = i + 1; j < s.cars.length; j++) {
        const a = s.cars[i], b = s.cars[j];
        let dx = b.x - a.x, dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d >= 2.4 || d === 0) continue;
        dx /= d; dz /= d;
        const ov = (2.4 - d) / 2;
        a.x -= dx * ov; a.z -= dz * ov; b.x += dx * ov; b.z += dz * ov;
        if (Math.abs(a.s - b.s) > 5 && Math.random() < 0.5) { ctx.sfx.hit(); s.fx.burst((a.x + b.x) / 2, 0.8, (a.z + b.z) / 2, '#ffd23f', 5, 5); ctx.vibrate(a.p.id, 40); ctx.vibrate(b.p.id, 40); }
        const t = (a.s + b.s) / 2; a.s = a.s * 0.7 + t * 0.3; b.s = b.s * 0.7 + t * 0.3;
      }
    }

    // tiến độ vòng đua
    for (const c of s.cars) {
      const th = Math.atan2(c.z / B, c.x / A);
      let d = th - c.th;
      if (d > Math.PI) d -= TAU;
      if (d < -Math.PI) d += TAU;
      c.th = th; c.prog += d;
      const laps = Math.floor(c.prog / TAU);
      if (laps > c.laps && c.finish == null) {
        c.laps = laps;
        if (laps >= LAPS) {
          c.finish = s.t; s.finished++;
          if (s.firstFinishT == null) { s.firstFinishT = s.t; ctx.hud.banner(`🏁 ${c.p.name} về nhất!`, 2200, true); }
          ctx.sfx.win(); ctx.vibrate(c.p.id, 300);
        } else { ctx.sfx.lap(); ctx.vibrate(c.p.id, 80); }
      } else if (laps < c.laps) c.laps = laps;
    }

    // hiển thị
    for (const c of s.cars) {
      c.g.position.set(c.x, 0, c.z);
      c.g.rotation.y = c.h;
      spinWheels(c.car, c.s, dt);
      c.lean += ((c.p.input.x * c.s / 38) * 0.09 - c.lean) * Math.min(1, dt * 8);
      c.car.rotation.z = c.lean;
      c.car.position.y = c.off && c.s > 6 ? Math.sin(s.t * 60) * 0.03 : 0; // rung khi chạy ra cỏ
      if (c.p.input.b && c.s > 1) c.car.userData.tail.emissiveIntensity = 5;
      c.bar.scale.x = Math.max(0.001, c.nitro);
      c.bar.visible = c.finish == null;
      if (c.boosting && Math.random() < 0.7) s.fx.burst(c.x - Math.sin(c.h) * 1.7, 0.6, c.z - Math.cos(c.h) * 1.7, '#45e0ff', 1, 2);
      if (c.off && c.s > 6 && Math.random() < 0.5) s.fx.burst(c.x, 0.2, c.z, '#7a5b34', 1, 3);
    }
    if (Math.floor(s.t * 4) !== s.lastHud) { s.lastHud = Math.floor(s.t * 4); this.hud(); }

    // kết thúc
    const all = s.finished >= s.cars.length;
    const timeout = s.firstFinishT != null && s.t - s.firstFinishT > 14;
    if (!s.over && (all || timeout || s.t > 150)) {
      s.over = true;
      const order = this.order();
      ctx.finish(order.map((c) => ({ id: c.p.id, text: c.finish != null ? fmtTime(c.finish) : `chưa về đích (${Math.max(0, Math.floor(c.prog / TAU))}/${LAPS})` })));
    }
  },

  dispose() { if (S) { S.fx.dispose(); S = null; } },
};
