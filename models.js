// Mô hình 3D dựng từ hình khối, vật liệu PBR (sơn bóng, kính, cao su, kim loại, đèn phát sáng)
import * as THREE from 'three';
import { std, paint, glow, rbox, mesh, T } from '/js/gfx.js';
import { cleanLook } from '/js/looks.js';

const rubber = () => std(0x15161a, { roughness: 0.9, envMapIntensity: 0.15 });
const metal = (c = 0xb8bcc8) => std(c, { roughness: 0.28, metalness: 1, envMapIntensity: 1.2 });
const glass = () => new THREE.MeshPhysicalMaterial({ color: 0x0a1424, roughness: 0.05, metalness: 0.2, clearcoat: 1, envMapIntensity: 1.6 });

/* ---------- Xe đua (hướng đầu xe = +z) ---------- */
export function makeCar(color) {
  const g = new THREE.Group();
  const pm = paint(color);
  const body = mesh(rbox(1.7, 0.5, 3.6, 0.22, 4), pm); body.position.y = 0.58;
  const nose = mesh(rbox(1.45, 0.28, 1.3, 0.12, 3), pm); nose.position.set(0, 0.46, 1.5);
  const cabin = mesh(rbox(1.22, 0.5, 1.55, 0.24, 4), glass()); cabin.position.set(0, 1.0, -0.3);
  const roof = mesh(rbox(1.1, 0.07, 1.0, 0.03, 2), pm); roof.position.set(0, 1.27, -0.32);
  const stripe = mesh(new THREE.BoxGeometry(0.28, 0.02, 3.5), std(0xf4f4f4, { roughness: 0.4 }), false); stripe.position.set(0, 0.835, 0);
  g.add(body, nose, cabin, roof, stripe);
  // cánh sau
  const wing = mesh(rbox(1.9, 0.07, 0.5, 0.03, 2), std(0x15161a, { roughness: 0.35, metalness: 0.4 })); wing.position.set(0, 1.2, -1.7);
  for (const x of [-0.55, 0.55]) { const post = mesh(new THREE.BoxGeometry(0.07, 0.4, 0.12), std(0x15161a)); post.position.set(x, 0.98, -1.65); g.add(post); }
  g.add(wing);
  // bánh xe: lốp + mâm kim loại
  const tireG = new THREE.CylinderGeometry(0.43, 0.43, 0.38, 20); tireG.rotateZ(Math.PI / 2);
  const rimG = new THREE.CylinderGeometry(0.28, 0.28, 0.4, 14); rimG.rotateZ(Math.PI / 2);
  const hubG = new THREE.BoxGeometry(0.42, 0.06, 0.06);
  const tm = rubber(), rm = metal();
  const wheels = [];
  for (const [x, z] of [[-0.9, 1.15], [0.9, 1.15], [-0.9, -1.15], [0.9, -1.15]]) {
    const w = new THREE.Group();
    w.add(mesh(tireG, tm), mesh(rimG, rm));
    for (let k = 0; k < 3; k++) { const sp = mesh(hubG, rm, false); sp.rotation.x = (k * Math.PI) / 3; sp.position.x = x > 0 ? 0.18 : -0.18; w.add(sp); }
    w.position.set(x, 0.43, z);
    g.add(w); wheels.push(w);
  }
  // đèn pha / đèn hậu (phát sáng -> bloom)
  const head = glow(0xfff1c0, 3.2), tail = glow(0xff1c1c, 1.4);
  for (const x of [-0.55, 0.55]) {
    const h = mesh(rbox(0.36, 0.14, 0.08, 0.03, 2), head, false); h.position.set(x, 0.62, 1.86);
    const t = mesh(rbox(0.4, 0.12, 0.08, 0.03, 2), tail, false); t.position.set(x, 0.72, -1.82);
    g.add(h, t);
  }
  // ánh neon dưới gầm
  const under = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 4.4), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }));
  under.rotation.x = -Math.PI / 2; under.position.y = 0.06;
  g.add(under);
  g.userData = { wheels, tail, spin: 0 };
  return g;
}
export function spinWheels(car, speed, dt) {
  car.userData.spin += speed * dt / 0.43;
  for (const w of car.userData.wheels) w.rotation.x = car.userData.spin;
  car.userData.tail.emissiveIntensity = 1.4;
}

/* ---------- Xe tăng (nòng súng hướng +z) ---------- */
export function makeTank(color) {
  const g = new THREE.Group();
  const c = new THREE.Color(color).lerp(new THREE.Color(0x55603f), 0.35); // ngả màu quân sự nhưng vẫn nhận ra màu người chơi
  const pm = std(c, { roughness: 0.5, metalness: 0.45, envMapIntensity: 0.9 });
  const dark = std(0x23262f, { roughness: 0.6, metalness: 0.6 });
  const hull = mesh(rbox(2.0, 0.72, 3.0, 0.12, 3), pm); hull.position.y = 0.72;
  const glacis = mesh(rbox(1.9, 0.42, 1.0, 0.1, 2), pm); glacis.position.set(0, 0.86, 1.3); glacis.rotation.x = -0.4;
  g.add(hull, glacis);
  // xích
  const treads = [];
  for (const sx of [-1.18, 1.18]) {
    const tex = T.treads();
    const tr = mesh(new THREE.BoxGeometry(0.58, 0.8, 3.5), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.3, envMapIntensity: 0.3 }));
    tr.position.set(sx, 0.5, 0);
    const guard = mesh(rbox(0.7, 0.1, 3.4, 0.04, 2), pm); guard.position.set(sx, 0.98, 0);
    g.add(tr, guard); treads.push(tex);
    const wg = new THREE.CylinderGeometry(0.34, 0.34, 0.62, 12); wg.rotateZ(Math.PI / 2);
    for (let i = -2; i <= 2; i++) { const w = mesh(wg, dark, false); w.position.set(sx, 0.48, i * 0.62); g.add(w); }
  }
  // tháp pháo
  const turret = new THREE.Group(); turret.position.y = 1.2;
  const tb = mesh(rbox(1.5, 0.55, 1.7, 0.22, 3), pm); tb.position.y = 0.3;
  const dome = mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.18, 16), dark); dome.position.set(-0.25, 0.68, -0.2);
  const barrel = mesh(new THREE.CylinderGeometry(0.13, 0.15, 2.2, 14), metal(0x4a4f5e)); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.35, 1.55);
  const brake = mesh(rbox(0.32, 0.3, 0.4, 0.06, 2), dark); brake.position.set(0, 0.35, 2.6);
  const mantlet = mesh(rbox(0.8, 0.5, 0.35, 0.1, 2), pm); mantlet.position.set(0, 0.35, 0.9);
  const ant = mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 5), dark, false); ant.position.set(0.55, 1.0, -0.6); ant.rotation.z = -0.08;
  turret.add(tb, dome, barrel, brake, mantlet, ant);
  g.add(turret);
  g.userData = { treads, turret };
  return g;
}
export function animateTreads(tank, speed, dt) {
  for (const t of tank.userData.treads) t.offset.y -= speed * dt * 0.28;
}

/* ---------- Xe húc kiểu đĩa bay (bán kính ~0.95) ---------- */
export function makeBumper(color) {
  const g = new THREE.Group();
  const pts = [[0.01, -0.5], [0.55, -0.5], [0.8, -0.38], [0.92, -0.18], [0.88, 0.05], [0.62, 0.22], [0.3, 0.3], [0.01, 0.32]].map(([x, y]) => new THREE.Vector2(x, y));
  const hull = mesh(new THREE.LatheGeometry(pts, 40), paint(color)); hull.material.side = THREE.DoubleSide;
  const bumper = mesh(new THREE.TorusGeometry(0.9, 0.17, 14, 48), rubber()); bumper.rotation.x = Math.PI / 2; bumper.position.y = -0.18;
  const band = mesh(new THREE.TorusGeometry(0.9, 0.05, 8, 48), glow(color, 2.2)); band.rotation.x = Math.PI / 2; band.position.y = -0.18; band.scale.set(1.0, 1.0, 1.9);
  const dome = mesh(new THREE.SphereGeometry(0.42, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass()); dome.position.y = 0.3;
  const eye = mesh(new THREE.SphereGeometry(0.1, 12, 8), glow(0xffffff, 1.5), false); eye.position.set(0, 0.45, 0.28);
  const under = new THREE.Mesh(new THREE.CircleGeometry(1.35, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
  under.rotation.x = -Math.PI / 2; under.position.y = -0.5;
  g.add(hull, bumper, band, dome, eye, under);
  return g;
}

/* ---------- Nhân vật hạt đậu (dùng cho các game đi bộ), hướng mặt = +z ---------- */
function beanMaterial(color, finish) {
  const P = (o) => new THREE.MeshPhysicalMaterial(Object.assign({ color }, o));
  if (finish === 'matte') return P({ roughness: 0.88, envMapIntensity: 0.3 });
  if (finish === 'metal') return P({ metalness: 0.9, roughness: 0.26, clearcoat: 0.5, envMapIntensity: 1.6 });
  if (finish === 'neon') return P({ roughness: 0.3, clearcoat: 1, emissive: color, emissiveIntensity: 0.6, envMapIntensity: 0.9 });
  return P({ roughness: 0.38, clearcoat: 0.9, clearcoatRoughness: 0.18, envMapIntensity: 0.9 });
}

/** Phụ kiện (mũ / mặt / thân) gắn vào `rig` (gốc ở tâm thân, thân cao từ y=-0.775 đến +0.775). */
function addLook(rig, L, color) {
  const out = {};
  const c = new THREE.Color(color);
  const hsl = { h: 0, s: 0, l: 0 }; c.getHSL(hsl);
  const accent = new THREE.Color().setHSL((hsl.h + 0.5) % 1, Math.max(0.55, hsl.s), 0.5);
  const S = (col, o = {}) => std(col, Object.assign({ roughness: 0.55, envMapIntensity: 0.6 }, o));
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, cast = true) => {
    const m = mesh(geo, mat, cast); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); rig.add(m); return m;
  };
  const gold = () => std(0xffd23f, { metalness: 1, roughness: 0.22, envMapIntensity: 1.5 });
  const blk = () => std(0x14151b, { roughness: 0.35, metalness: 0.2 });
  const white = () => S(0xf6f6fa);
  const pink = () => S(0xff8fb2, { roughness: 0.6 });
  const TOP = 0.74;

  switch (L.hat) {
    case 'cap': {
      const m = S(accent, { roughness: 0.5 });
      add(new THREE.SphereGeometry(0.52, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, TOP - 0.05, 0).scale.set(1, 0.85, 1);
      add(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 20, 1, false, -1.1, 2.2), m, 0, TOP - 0.02, 0.38, 0, 0, 0);
      add(new THREE.SphereGeometry(0.06, 8, 6), S(0xffffff), 0, TOP + 0.38, 0); break;
    }
    case 'tophat':
      add(new THREE.CylinderGeometry(0.3, 0.32, 0.55, 20), blk(), 0, TOP + 0.3, 0);
      add(new THREE.CylinderGeometry(0.56, 0.56, 0.05, 24), blk(), 0, TOP + 0.02, 0);
      add(new THREE.CylinderGeometry(0.325, 0.325, 0.1, 20), S(0xd83a3a), 0, TOP + 0.12, 0); break;
    case 'wizard': {
      const m = S(0x6a3fd8, { roughness: 0.6 });
      add(new THREE.ConeGeometry(0.42, 1.0, 20), m, 0, TOP + 0.5, 0, 0.12, 0, 0.06);
      add(new THREE.CylinderGeometry(0.62, 0.62, 0.04, 28), S(0x5230b0), 0, TOP + 0.03, 0);
      add(new THREE.SphereGeometry(0.06, 8, 6), glow(0xffd23f, 2), 0.12, TOP + 0.34, 0.36, 0, 0, 0, false); break;
    }
    case 'crown': { const cr = makeCrown(); cr.scale.setScalar(0.95); cr.position.y = TOP + 0.08; rig.add(cr); break; }
    case 'cat': {
      const m = S(c, { roughness: 0.6 });
      for (const sx of [-1, 1]) {
        add(new THREE.ConeGeometry(0.19, 0.42, 4), m, sx * 0.3, TOP + 0.12, 0, 0, Math.PI / 4, -sx * 0.32);
        add(new THREE.ConeGeometry(0.1, 0.28, 4), pink(), sx * 0.3, TOP + 0.1, 0.07, 0, Math.PI / 4, -sx * 0.32, false);
      } break;
    }
    case 'bunny': {
      const m = S(c, { roughness: 0.6 });
      for (const sx of [-1, 1]) {
        add(new THREE.CapsuleGeometry(0.1, 0.55, 4, 10), m, sx * 0.2, TOP + 0.5, 0, 0, 0, -sx * 0.18);
        add(new THREE.CapsuleGeometry(0.05, 0.4, 4, 8), pink(), sx * 0.2, TOP + 0.5, 0.07, 0, 0, -sx * 0.18, false);
      } break;
    }
    case 'devil': {
      const m = S(0xe02a2a, { roughness: 0.4 });
      for (const sx of [-1, 1]) add(new THREE.ConeGeometry(0.1, 0.38, 10), m, sx * 0.28, TOP + 0.06, 0.02, 0.1, 0, -sx * 0.45);
      break;
    }
    case 'halo': {
      const h = add(new THREE.TorusGeometry(0.36, 0.05, 10, 32), glow(0xffd23f, 2.6), 0, TOP + 0.55, 0, Math.PI / 2, 0, 0, false);
      out.halo = h; break;
    }
    case 'party': {
      add(new THREE.ConeGeometry(0.32, 0.8, 18), S(0xff5fa2), 0, TOP + 0.4, 0);
      add(new THREE.TorusGeometry(0.2, 0.03, 6, 18), S(0x38c8ff), 0, TOP + 0.35, 0, Math.PI / 2, 0, 0);
      add(new THREE.SphereGeometry(0.1, 10, 8), gold(), 0, TOP + 0.82, 0); break;
    }
    case 'chef':
      add(new THREE.CylinderGeometry(0.34, 0.31, 0.3, 18), white(), 0, TOP + 0.15, 0);
      for (const [x, z] of [[-0.2, 0.05], [0.2, 0.05], [0, -0.15], [0, 0.2]]) add(new THREE.SphereGeometry(0.22, 12, 10), white(), x, TOP + 0.42, z);
      break;
    case 'cowboy': {
      const m = S(0x9a6430, { roughness: 0.8 });
      add(new THREE.CylinderGeometry(0.74, 0.74, 0.04, 28), m, 0, TOP + 0.02, 0).scale.set(1, 1, 0.9);
      add(new THREE.CylinderGeometry(0.3, 0.36, 0.34, 18), m, 0, TOP + 0.2, 0);
      add(new THREE.CylinderGeometry(0.365, 0.365, 0.07, 18), S(0x4a2c12), 0, TOP + 0.12, 0); break;
    }
    case 'prop': {
      add(new THREE.SphereGeometry(0.4, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), S(0x38c8ff), 0, TOP - 0.02, 0);
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6), blk(), 0, TOP + 0.46, 0);
      const bl = new THREE.Group(); bl.position.y = TOP + 0.56; rig.add(bl);
      for (const r of [0, Math.PI / 2]) { const b = mesh(new THREE.BoxGeometry(0.8, 0.03, 0.12), S(r ? 0xffd23f : 0xff5a6e), false); b.rotation.y = r; bl.add(b); }
      out.prop = bl; break;
    }
    case 'phones': {
      add(new THREE.TorusGeometry(0.52, 0.05, 8, 24, Math.PI), blk(), 0, TOP - 0.2, 0, 0, 0, 0);
      for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.17, 0.17, 0.14, 16), S(0xe8445a, { roughness: 0.4 }), sx * 0.54, TOP - 0.18, 0, 0, 0, Math.PI / 2);
      break;
    }
    case 'beanie': {
      const m = S(accent, { roughness: 0.85 });
      add(new THREE.SphereGeometry(0.535, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, TOP - 0.12, 0).scale.set(1, 0.95, 1);
      add(new THREE.TorusGeometry(0.5, 0.085, 10, 28), S(shadeCol(accent, 0.75), { roughness: 0.9 }), 0, TOP - 0.1, 0, Math.PI / 2, 0, 0);
      add(new THREE.SphereGeometry(0.15, 12, 10), S(0xffffff, { roughness: 0.95 }), 0, TOP + 0.42, 0); break;
    }
    case 'pirate': {
      const m = std(0x17171f, { roughness: 0.6 });
      add(new THREE.SphereGeometry(0.46, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, TOP - 0.06, 0).scale.set(1, 0.7, 1);
      add(new THREE.CylinderGeometry(0.66, 0.66, 0.07, 3), m, 0, TOP - 0.02, 0, 0, Math.PI, 0);
      add(new THREE.TorusGeometry(0.49, 0.025, 6, 24), std(0xffd23f, { metalness: 0.8, roughness: 0.3 }), 0, TOP - 0.03, 0, Math.PI / 2, 0, 0, false);
      add(new THREE.SphereGeometry(0.085, 10, 8), white(), 0, TOP + 0.08, 0.4, 0, 0, 0, false).scale.z = 0.45; break;
    }
    case 'viking': {
      const m = std(0x9aa3b5, { metalness: 0.85, roughness: 0.35, envMapIntensity: 1.4 }), horn = std(0xf3e6c4, { roughness: 0.5 });
      add(new THREE.SphereGeometry(0.52, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, TOP - 0.08, 0).scale.set(1, 0.8, 1);
      add(new THREE.TorusGeometry(0.505, 0.04, 8, 28), std(0x6d7587, { metalness: 0.7, roughness: 0.4 }), 0, TOP - 0.1, 0, Math.PI / 2, 0, 0);
      for (const sx of [-1, 1]) add(new THREE.ConeGeometry(0.11, 0.5, 10), horn, sx * 0.55, TOP + 0.14, 0, 0, 0, -sx * 0.95);
      break;
    }
    case 'santa': {
      const red = S(0xe02a3a, { roughness: 0.8 });
      add(new THREE.ConeGeometry(0.44, 0.9, 20), red, 0.04, TOP + 0.36, 0, 0, 0, -0.38);
      add(new THREE.TorusGeometry(0.46, 0.1, 10, 28), S(0xffffff, { roughness: 0.95 }), 0, TOP - 0.02, 0, Math.PI / 2, 0, 0);
      add(new THREE.SphereGeometry(0.13, 12, 10), S(0xffffff, { roughness: 0.95 }), 0.2, TOP + 0.78, 0); break;
    }
    case 'hardhat': {
      const m = S(0xffc21a, { roughness: 0.4 });
      add(new THREE.SphereGeometry(0.53, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, TOP - 0.06, 0).scale.set(1, 0.85, 1);
      add(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 28), m, 0, TOP - 0.04, 0.04).scale.set(1, 1, 1.12);
      add(new THREE.BoxGeometry(0.13, 0.08, 0.86), S(0xe6a800), 0, TOP + 0.37, 0);
      add(new THREE.SphereGeometry(0.075, 10, 8), glow(0xfff2b0, 2.5), 0, TOP + 0.2, 0.5, 0, 0, 0, false); break;
    }
    case 'grad': {
      const m = std(0x1d2230, { roughness: 0.6 });
      add(new THREE.CylinderGeometry(0.37, 0.4, 0.22, 18), m, 0, TOP + 0.04, 0);
      add(new THREE.BoxGeometry(0.98, 0.05, 0.98), std(0x262c40, { roughness: 0.55 }), 0, TOP + 0.2, 0, 0, Math.PI / 4, 0);
      add(new THREE.SphereGeometry(0.05, 8, 6), gold(), 0, TOP + 0.24, 0, 0, 0, 0, false);
      add(new THREE.CylinderGeometry(0.015, 0.015, 0.34, 6), gold(), 0.5, TOP + 0.03, 0.2, 0, 0, 0, false);
      add(new THREE.SphereGeometry(0.06, 8, 6), gold(), 0.5, TOP - 0.16, 0.2, 0, 0, 0, false); break;
    }
    case 'flower': {
      const cols = [0xff7ab8, 0xffd23f, 0xffffff, 0xff9a5a, 0xc77dff, 0xff7ab8, 0xffd23f, 0xffffff];
      add(new THREE.TorusGeometry(0.36, 0.03, 6, 28), S(0x3fae4a), 0, TOP - 0.1, 0, Math.PI / 2, 0, 0);
      cols.forEach((col, i) => {
        const a = (i / cols.length) * Math.PI * 2;
        add(new THREE.SphereGeometry(0.1, 10, 8), S(col, { roughness: 0.7 }), Math.cos(a) * 0.38, TOP - 0.09, Math.sin(a) * 0.38);
        add(new THREE.SphereGeometry(0.04, 8, 6), S(i % 2 ? 0xff7ab8 : 0xffd23f), Math.cos(a) * 0.43, TOP - 0.09, Math.sin(a) * 0.43, 0, 0, 0, false);
      }); break;
    }
    case 'unicorn': {
      add(new THREE.ConeGeometry(0.1, 0.55, 12), std(0xffe38a, { metalness: 0.8, roughness: 0.25, emissive: 0x6a4a00, emissiveIntensity: 0.5 }), 0, TOP + 0.32, 0.06, 0.12, 0, 0);
      for (const sx of [-1, 1]) {
        add(new THREE.ConeGeometry(0.11, 0.3, 4), S(0xffffff), sx * 0.3, TOP + 0.06, -0.02, 0, Math.PI / 4, -sx * 0.3);
        add(new THREE.ConeGeometry(0.06, 0.2, 4), pink(), sx * 0.3, TOP + 0.04, 0.03, 0, Math.PI / 4, -sx * 0.3, false);
      }
      add(new THREE.TorusGeometry(0.4, 0.05, 6, 24, Math.PI), S(0xc77dff), 0, TOP - 0.1, 0.0, Math.PI / 2, 0, 0, false); break;
    }
    case 'alien': {
      for (const sx of [-1, 1]) {
        add(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), blk(), sx * 0.27, TOP + 0.22, 0, 0, 0, -sx * 0.45);
        out['ant' + (sx > 0 ? 'R' : 'L')] = add(new THREE.SphereGeometry(0.09, 12, 10), glow(0x5dff8a, 2.6), sx * 0.38, TOP + 0.46, 0, 0, 0, 0, false);
      } break;
    }
    case 'duck': {
      const y = std(0xffd23f, { roughness: 0.45 });
      add(new THREE.SphereGeometry(0.28, 14, 10), y, 0, TOP + 0.1, -0.02).scale.set(1.1, 0.75, 1.3);
      add(new THREE.SphereGeometry(0.17, 12, 10), y, 0, TOP + 0.36, 0.14);
      add(new THREE.BoxGeometry(0.14, 0.05, 0.13), std(0xff8a1c, { roughness: 0.5 }), 0, TOP + 0.33, 0.31, 0, 0, 0, false);
      for (const sx of [-1, 1]) add(new THREE.SphereGeometry(0.025, 6, 6), blk(), sx * 0.075, TOP + 0.41, 0.28, 0, 0, 0, false); break;
    }
    default: break;
  }

  const EY = 0.23;
  const sz = (x) => Math.sqrt(Math.max(0.02, 0.25 - x * x)) + 0.012;   // z trên mặt thân tại x (phần trụ)
  const flat = (shape, col, x, y, z, k, em = 0) => {
    const m = mesh(new THREE.ShapeGeometry(shape), std(col, { side: THREE.DoubleSide, emissive: col, emissiveIntensity: em, roughness: 0.4 }), false);
    m.position.set(x, y, z); m.scale.setScalar(k); rig.add(m); return m;
  };
  const heartShape = () => { const h = new THREE.Shape(); h.moveTo(0, -0.25); h.bezierCurveTo(-0.08, -0.15, -0.28, -0.02, -0.28, 0.1); h.bezierCurveTo(-0.28, 0.24, -0.12, 0.3, 0, 0.18); h.bezierCurveTo(0.12, 0.3, 0.28, 0.24, 0.28, 0.1); h.bezierCurveTo(0.28, -0.02, 0.08, -0.15, 0, -0.25); return h; };
  const starShape = () => { const h = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 0.12 : 0.3; if (i) h.lineTo(Math.cos(a) * r, Math.sin(a) * r); else h.moveTo(Math.cos(a) * r, Math.sin(a) * r); } return h; };
  switch (L.face) {
    case 'glasses':
      for (const sx of [-1, 1]) add(new THREE.TorusGeometry(0.17, 0.025, 8, 20), blk(), sx * 0.19, EY, 0.5, 0, 0, 0, false);
      add(new THREE.BoxGeometry(0.1, 0.025, 0.025), blk(), 0, EY, 0.5, 0, 0, 0, false); break;
    case 'shades':
      for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.3, 0.2, 0.05), std(0x08090d, { roughness: 0.1, metalness: 0.6, envMapIntensity: 1.6 }), sx * 0.19, EY, 0.52, 0, 0, 0, false);
      add(new THREE.BoxGeometry(0.1, 0.04, 0.04), blk(), 0, EY + 0.03, 0.52, 0, 0, 0, false); break;
    case 'stache':
      for (const sx of [-1, 1]) add(new THREE.CapsuleGeometry(0.05, 0.2, 4, 8), S(0x4a2c18, { roughness: 0.9 }), sx * 0.11, -0.02, 0.5, 0, 0, Math.PI / 2 + sx * 0.35, false);
      break;
    case 'blush':
      for (const sx of [-1, 1]) { const m = add(new THREE.CircleGeometry(0.1, 14), new THREE.MeshBasicMaterial({ color: 0xff6f9b, transparent: true, opacity: 0.6 }), sx * 0.3, 0.02, 0.42, 0, sx * 0.55, 0, false); m.scale.y = 0.7; }
      break;
    case 'nose': add(new THREE.SphereGeometry(0.1, 14, 10), S(0xe8333f, { roughness: 0.25 }), 0, 0.08, 0.52); break;
    case 'patch':
      add(new THREE.CircleGeometry(0.17, 16), new THREE.MeshBasicMaterial({ color: 0x14151b }), -0.19, EY, 0.51, 0, 0, 0, false);
      add(new THREE.TorusGeometry(0.5, 0.012, 4, 24, 1.3), new THREE.MeshBasicMaterial({ color: 0x14151b }), 0, EY, 0, Math.PI / 2, 0, 0.4, false); break;
    case 'mask':
      add(new THREE.BoxGeometry(0.62, 0.3, 0.14), S(0xd6ecff, { roughness: 0.6 }), 0, -0.08, 0.42, 0, 0, 0, false); break;
    case 'monocle':
      add(new THREE.TorusGeometry(0.17, 0.025, 8, 22), gold(), 0.19, EY, 0.5, 0, 0, 0, false);
      add(new THREE.CircleGeometry(0.15, 18), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15 }), 0.19, EY, 0.5, 0, 0, 0, false);
      add(new THREE.BoxGeometry(0.012, 0.5, 0.012), gold(), 0.36, EY - 0.3, 0.46, 0, 0, -0.1, false); break;
    case 'vr':
      add(new THREE.BoxGeometry(0.84, 0.32, 0.22), std(0x2a2f45, { roughness: 0.35, metalness: 0.3 }), 0, EY, 0.46, 0, 0, 0, false);
      add(new THREE.BoxGeometry(0.68, 0.1, 0.02), glow(0x38c8ff, 2.2), 0, EY, 0.575, 0, 0, 0, false);
      add(new THREE.TorusGeometry(0.52, 0.04, 6, 28), std(0x2a2f45), 0, EY, 0, Math.PI / 2, 0, 0, false); break;
    case 'heart':
      for (const sx of [-1, 1]) flat(heartShape(), 0xff4d7a, sx * 0.19, EY - 0.01, sz(0.19) + 0.05, 0.62, 0.6);
      add(new THREE.BoxGeometry(0.08, 0.025, 0.025), blk(), 0, EY, 0.51, 0, 0, 0, false); break;
    case 'star':
      for (const sx of [-1, 1]) flat(starShape(), 0xffd23f, sx * 0.19, EY, sz(0.19) + 0.05, 0.62, 0.9);
      add(new THREE.BoxGeometry(0.08, 0.025, 0.025), blk(), 0, EY, 0.51, 0, 0, 0, false); break;
    case 'beard':
      add(new THREE.SphereGeometry(0.34, 16, 12), S(0x5a3a22, { roughness: 0.95 }), 0, -0.33, 0.3, 0, 0, 0, false).scale.set(1.3, 1.15, 0.65); break;
    case 'whisker':
      add(new THREE.SphereGeometry(0.05, 10, 8), S(0xff7aa5, { roughness: 0.3 }), 0, 0.1, 0.51, 0, 0, 0, false);
      for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) add(new THREE.BoxGeometry(0.3, 0.014, 0.014), blk(), sx * 0.33, 0.06 + (1 - k) * 0.07, 0.44, 0, -sx * 0.7, sx * (k - 1) * 0.2, false);
      break;
    case 'freckle':
      for (const [x, y] of [[0.22, 0.04], [0.3, 0.09], [0.36, 0.03], [0.27, -0.01], [-0.22, 0.04], [-0.3, 0.09], [-0.36, 0.03], [-0.27, -0.01]]) add(new THREE.SphereGeometry(0.018, 6, 6), S(0xa8582c), x, y, sz(x), 0, 0, 0, false);
      break;
    case 'bandage': {
      const bm = S(0xf2cfa0, { roughness: 0.8 });
      const b = add(new THREE.BoxGeometry(0.3, 0.09, 0.03), bm, 0.3, 0.05, sz(0.3) + 0.01, 0, 0.6, 0.5, false);
      add(new THREE.BoxGeometry(0.3, 0.09, 0.03), bm, 0.3, 0.05, sz(0.3) + 0.012, 0, 0.6, -0.5, false); break;
    }
    default: break;
  }

  switch (L.body) {
    case 'cape': {
      const m = S(accent, { roughness: 0.55, side: THREE.DoubleSide });
      add(new THREE.BoxGeometry(0.95, 1.05, 0.05), m, 0, -0.2, -0.52, 0.16, 0, 0);
      add(new THREE.TorusGeometry(0.5, 0.075, 8, 22), S(shadeCol(accent, 0.8)), 0, -0.12, 0, Math.PI / 2, 0, 0); break;
    }
    case 'scarf': {
      const m = S(accent, { roughness: 0.9 });
      add(new THREE.TorusGeometry(0.5, 0.1, 10, 26), m, 0, -0.2, 0, Math.PI / 2, 0, 0);
      add(new THREE.BoxGeometry(0.2, 0.55, 0.08), m, 0.2, -0.5, 0.49, 0.05, 0, 0.06); break;
    }
    case 'bow':
      for (const sx of [-1, 1]) add(new THREE.ConeGeometry(0.14, 0.22, 3), S(0xe8333f), sx * 0.14, -0.42, 0.49, 0, 0, -sx * Math.PI / 2, false);
      add(new THREE.SphereGeometry(0.07, 10, 8), S(0xb3202c), 0, -0.42, 0.51, 0, 0, 0, false); break;
    case 'pack':
      add(new THREE.BoxGeometry(0.6, 0.72, 0.3), S(accent, { roughness: 0.7 }), 0, -0.05, -0.55);
      add(new THREE.BoxGeometry(0.4, 0.2, 0.08), S(shadeCol(accent, 0.75)), 0, -0.2, -0.72, 0, 0, 0, false); break;
    case 'wings': {
      const m = S(0xf4f7ff, { roughness: 0.5 });
      const l = add(new THREE.SphereGeometry(0.5, 14, 10), m, -0.62, 0.15, -0.3, 0, 0.4, 0.5); l.scale.set(0.12, 1, 0.55);
      const r = add(new THREE.SphereGeometry(0.5, 14, 10), m, 0.62, 0.15, -0.3, 0, -0.4, -0.5); r.scale.set(0.12, 1, 0.55);
      out.wings = [l, r]; break;
    }
    case 'medal': {
      add(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 20), gold(), 0, -0.47, 0.47, Math.PI / 2, 0, 0, false);
      add(new THREE.BoxGeometry(0.06, 0.4, 0.02), S(0xe8333f), 0, -0.25, 0.5, -0.05, 0, 0, false); break;
    }
    case 'tie':
      add(new THREE.BoxGeometry(0.15, 0.1, 0.07), S(0xd92b3a), 0, -0.2, 0.505, 0, 0, 0, false);
      add(new THREE.CylinderGeometry(0.075, 0.12, 0.5, 4), S(0xe8333f), 0, -0.5, 0.485, 0, Math.PI / 4, 0, false).scale.z = 0.35; break;
    case 'lei': {
      const cols = [0xff7ab8, 0xffd23f, 0xff9a5a, 0xc77dff, 0xff7ab8, 0xffd23f];
      add(new THREE.TorusGeometry(0.5, 0.045, 6, 28), S(0x3fae4a), 0, -0.2, 0, Math.PI / 2, 0, 0);
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; add(new THREE.SphereGeometry(0.075, 8, 6), S(cols[i % cols.length], { roughness: 0.7 }), Math.cos(a) * 0.52, -0.2, Math.sin(a) * 0.52, 0, 0, 0, false); }
      break;
    }
    case 'tutu': {
      const m = S(0xff8fd0, { roughness: 0.75, side: THREE.DoubleSide });
      add(new THREE.CylinderGeometry(0.46, 0.86, 0.22, 30, 1, true), m, 0, -0.56, 0);
      add(new THREE.CylinderGeometry(0.42, 0.74, 0.18, 30, 1, true), S(0xffc4ea, { roughness: 0.75, side: THREE.DoubleSide }), 0, -0.52, 0);
      add(new THREE.TorusGeometry(0.46, 0.04, 6, 26), S(0xd65aa8), 0, -0.45, 0, Math.PI / 2, 0, 0, false); break;
    }
    case 'jersey': {
      const m = S(accent, { roughness: 0.7, side: THREE.DoubleSide });
      add(new THREE.CylinderGeometry(0.515, 0.505, 0.44, 28, 1, true), m, 0, -0.14, 0);
      add(new THREE.TorusGeometry(0.515, 0.03, 6, 28), white(), 0, 0.08, 0, Math.PI / 2, 0, 0, false);
      add(new THREE.TorusGeometry(0.505, 0.03, 6, 28), white(), 0, -0.36, 0, Math.PI / 2, 0, 0, false);
      add(new THREE.BoxGeometry(0.12, 0.26, 0.02), white(), 0, -0.14, 0.52, 0, 0, 0, false); break;
    }
    case 'tail': {
      add(new THREE.CapsuleGeometry(0.14, 0.5, 4, 10), S(0xff8a3c, { roughness: 0.9 }), 0, -0.45, -0.62, -1.0, 0, 0);
      add(new THREE.SphereGeometry(0.14, 10, 8), S(0xffffff, { roughness: 0.95 }), 0, -0.24, -0.95); break;
    }
    case 'shell': {
      const sh = add(new THREE.SphereGeometry(0.6, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), S(0x4f8a3a, { roughness: 0.6 }), 0, -0.02, -0.32, -Math.PI / 2, 0, 0);
      sh.scale.set(1, 1, 0.8);
      add(new THREE.TorusGeometry(0.3, 0.03, 6, 6), S(0x356128), 0, -0.02, -0.78, 0, 0, 0, false);
      add(new THREE.TorusGeometry(0.5, 0.03, 6, 24), S(0x356128), 0, -0.02, -0.5, 0, 0, 0, false); break;
    }
    case 'jetpack': {
      const m = std(0xb9c4d6, { metalness: 0.8, roughness: 0.3, envMapIntensity: 1.3 });
      for (const sx of [-1, 1]) {
        add(new THREE.CylinderGeometry(0.14, 0.14, 0.62, 14), m, sx * 0.22, -0.02, -0.6);
        add(new THREE.CylinderGeometry(0.145, 0.145, 0.07, 14), S(0xe8333f), sx * 0.22, 0.1, -0.6, 0, 0, 0, false);
        add(new THREE.ConeGeometry(0.1, 0.26, 10), glow(0xff9a1c, 2.4), sx * 0.22, -0.45, -0.6, Math.PI, 0, 0, false);
        add(new THREE.ConeGeometry(0.05, 0.16, 8), glow(0xfff2a0, 3), sx * 0.22, -0.42, -0.6, Math.PI, 0, 0, false);
      } break;
    }
    case 'float': {
      add(new THREE.TorusGeometry(0.62, 0.15, 12, 30), S(0xff5a6e, { roughness: 0.35 }), 0, -0.42, 0, Math.PI / 2, 0, 0);
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; const m = add(new THREE.BoxGeometry(0.24, 0.12, 0.2), S(0xffffff, { roughness: 0.35 }), Math.cos(a) * 0.62, -0.42, Math.sin(a) * 0.62, 0, -a + Math.PI / 2, 0, false); m.scale.y = 1.1; }
      break;
    }
    default: break;
  }
  return out;
}
function shadeCol(col, k) { return new THREE.Color(col).multiplyScalar(k); }

export function makeBean(color, look) {
  const L = cleanLook(look);
  const g = new THREE.Group();
  // rig = thân + mắt + phụ kiện (cùng nghiêng/nhún khi chạy)
  const rig = new THREE.Group(); rig.position.y = 0.82; g.add(rig);
  const bodyMesh = mesh(new THREE.CapsuleGeometry(0.5, 0.55, 6, 18), beanMaterial(color, L.finish));
  rig.add(bodyMesh);
  const eyeM = std(0xffffff, { roughness: 0.2 }), pupM = std(0x0a0a12, { roughness: 0.1 });
  for (const x of [-0.19, 0.19]) {
    const e = mesh(new THREE.SphereGeometry(0.15, 14, 10), eyeM, false); e.position.set(x, 0.23, 0.4); e.scale.z = 0.6;
    const p = mesh(new THREE.SphereGeometry(0.07, 10, 8), pupM, false); p.position.set(x, 0.23, 0.48);
    rig.add(e, p);
  }
  const footM = std(new THREE.Color(color).multiplyScalar(0.55), { roughness: 0.5 });
  const feet = [-0.26, 0.26].map((x) => { const f = mesh(new THREE.SphereGeometry(0.2, 12, 8), footM); f.position.set(x, 0.2, 0.05); f.scale.set(1, 0.8, 1.3); g.add(f); return f; });
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.65, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.03;
  g.add(shadow);
  const extra = addLook(rig, L, color);
  g.userData = Object.assign({ body: rig, bodyMesh, feet, shadow }, extra);
  return g;
}

/* ---------- Vài đồ vật dùng chung ---------- */
export function makeCoin(gold = true) {
  const m = new THREE.MeshStandardMaterial({ color: gold ? 0xffc83a : 0xb9c4d8, metalness: 1, roughness: 0.22, emissive: gold ? 0x6a4300 : 0x1a2030, emissiveIntensity: 0.9, envMapIntensity: 1.5 });
  const g = new THREE.CylinderGeometry(0.5, 0.5, 0.12, 24); g.rotateX(Math.PI / 2);
  const c = mesh(g, m);
  const ring = mesh(new THREE.TorusGeometry(0.4, 0.04, 6, 24), m, false); c.add(ring);
  return c;
}
export function makeCrown() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 1, roughness: 0.2, emissive: 0x8a5a00, emissiveIntensity: 1.2, envMapIntensity: 1.5 });
  const base = mesh(new THREE.CylinderGeometry(0.4, 0.36, 0.22, 16, 1, true), m); base.material.side = THREE.DoubleSide;
  g.add(base);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const t = mesh(new THREE.ConeGeometry(0.1, 0.3, 6), m); t.position.set(Math.cos(a) * 0.36, 0.24, Math.sin(a) * 0.36);
    const j = mesh(new THREE.SphereGeometry(0.06, 8, 6), glow(0xff3a5a, 1.6), false); j.position.set(Math.cos(a) * 0.36, 0.43, Math.sin(a) * 0.36);
    g.add(t, j);
  }
  return g;
}
