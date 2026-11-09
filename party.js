// Bộ công cụ dùng chung cho các game đi bộ nhìn từ trên xuống (hạt đậu)
import * as THREE from 'three';
import { nameSprite } from '/js/util.js';
import { makeBean } from '/js/models.js';
import { T, prepScene, skyDome } from '/js/gfx.js';

export function setupScene(ctx, o) {
  const { scene, camera } = ctx;
  prepScene(scene);
  const bg = o.bg ?? 0x101426;
  scene.background = new THREE.Color(bg);
  scene.fog = new THREE.Fog(bg, o.fogNear ?? 48, o.fogFar ?? 115);
  if (o.sky) { scene.add(skyDome(...o.sky)); scene.background = null; }
  ctx.addLights(o.size ?? 26, o.light || {});
  camera.position.set(...o.cam);
  camera.lookAt(...o.look);
}

export function lavaPlane(scene, y = -9) {
  const tex = T.lava();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshStandardMaterial({ color: 0x1a0a06, map: tex, emissive: 0xff5a1a, emissiveMap: tex, emissiveIntensity: 1.4, roughness: 0.6 }));
  m.rotation.x = -Math.PI / 2; m.position.y = y;
  scene.add(m);
  return { update(dt) { tex.offset.x += dt * 0.012; tex.offset.y += dt * 0.006; } };
}

/** Tạo hạt đậu cho mỗi người chơi. place(i, n) -> [x, z] */
export function spawnBeans(ctx, place, extra = () => ({})) {
  const n = ctx.players.length;
  return ctx.players.map((p, i) => {
    const g = makeBean(p.color, p.look);
    const label = nameSprite(THREE, p.name, p.color);
    label.position.y = 2.7; g.add(label);
    ctx.scene.add(g);
    const [x, z] = place(i, n);
    return Object.assign({ p, g, x, z, y: 0, vx: 0, vz: 0, fx: 0, fz: 1, ang: 0, alive: true, label }, extra(p, i));
  });
}

/** Input -> vận tốc (có quán tính). */
export function stepBean(e, dt, { acc = 48, drag = 5.5, max = 9, lock = false } = {}) {
  const inp = e.p.input;
  if (!lock) {
    const mag = Math.hypot(inp.x, inp.y);
    if (mag > 0.1) { e.fx = inp.x / mag; e.fz = inp.y / mag; }
    e.vx += inp.x * acc * dt; e.vz += inp.y * acc * dt;
  }
  const k = Math.exp(-drag * dt);
  e.vx *= k; e.vz *= k;
  const sp = Math.hypot(e.vx, e.vz);
  if (sp > max) { e.vx *= max / sp; e.vz *= max / sp; }
  e.x += e.vx * dt; e.z += e.vz * dt;
}

/** Đẩy các hạt đậu ra khỏi nhau (va chạm tròn). */
export function pushApart(list, r = 0.62, bounce = 0.35) {
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (!a.alive || !b.alive || a.falling || b.falling) continue;
    let dx = b.x - a.x, dz = b.z - a.z;
    const d = Math.hypot(dx, dz);
    if (d >= r * 2 || d < 1e-6) continue;
    dx /= d; dz /= d;
    const ov = (r * 2 - d) / 2;
    a.x -= dx * ov; a.z -= dz * ov; b.x += dx * ov; b.z += dz * ov;
    const rel = (a.vx - b.vx) * dx + (a.vz - b.vz) * dz;
    if (rel > 0) { const j2 = rel * (1 + bounce) / 2; a.vx -= j2 * dx; a.vz -= j2 * dz; b.vx += j2 * dx; b.vz += j2 * dz; }
  }
}

export function clampCircle(e, R) {
  const d = Math.hypot(e.x, e.z);
  if (d > R) { e.x *= R / d; e.z *= R / d; const nx = e.x / R, nz = e.z / R; const vn = e.vx * nx + e.vz * nz; if (vn > 0) { e.vx -= vn * nx * 1.2; e.vz -= vn * nz * 1.2; } }
}
export function clampRect(e, hx, hz) {
  if (e.x > hx) { e.x = hx; if (e.vx > 0) e.vx = 0; } else if (e.x < -hx) { e.x = -hx; if (e.vx < 0) e.vx = 0; }
  if (e.z > hz) { e.z = hz; if (e.vz > 0) e.vz = 0; } else if (e.z < -hz) { e.z = -hz; if (e.vz < 0) e.vz = 0; }
}

/** Cập nhật hình ảnh: quay mặt theo hướng, lắc lư khi chạy. */
export function showBean(e, dt, time) {
  const g = e.g;
  g.position.set(e.x, e.y, e.z);
  const want = Math.atan2(e.fx, e.fz);
  let d = want - e.ang;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  e.ang += d * Math.min(1, dt * 14);
  g.rotation.y = e.ang;
  const sp = Math.hypot(e.vx, e.vz);
  const u = g.userData;
  const ph = time * (7 + sp * 0.9) + e.p.id;
  const k = Math.min(1, sp / 6);
  u.feet[0].position.z = 0.05 + Math.sin(ph) * 0.28 * k;
  u.feet[1].position.z = 0.05 - Math.sin(ph) * 0.28 * k;
  u.feet[0].position.y = 0.2 + Math.max(0, Math.sin(ph)) * 0.16 * k;
  u.feet[1].position.y = 0.2 + Math.max(0, -Math.sin(ph)) * 0.16 * k;
  u.body.position.y = 0.82 + Math.abs(Math.sin(ph)) * 0.07 * k;
  u.body.rotation.x = 0.18 * k;
  if (u.prop) u.prop.rotation.y += dt * 22;
  if (u.halo) u.halo.position.y += (Math.sin(time * 3) * 0.04 - (u.halo.userData.dy || 0)), u.halo.userData.dy = Math.sin(time * 3) * 0.04;
  if (u.wings) { const f = Math.sin(time * (6 + sp)) * 0.18; u.wings[0].rotation.z = 0.5 + f; u.wings[1].rotation.z = -0.5 - f; }
  u.shadow.position.y = 0.03 - e.y;
  u.shadow.scale.setScalar(Math.max(0.4, 1 - e.y * 0.08));
}

export function hudRows(ents, textFn) {
  return ents.map((e) => ({ color: e.p.color, name: e.p.name, text: textFn(e), dead: !e.alive }));
}

/** Vòng tròn/đĩa phát sáng dưới sàn (vùng nguy hiểm, vùng điểm...) */
export function discMesh(color, r, opacity = 0.5) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.06;
  return m;
}
export function ringMesh(color, r, w = 0.25, opacity = 0.9) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r - w, r, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.07;
  return m;
}

/** Đẩy hạt đậu (hình tròn bán kính r) ra khỏi hình chữ nhật tâm (cx, cz), nửa kích thước (hw, hd). Trả về true nếu có va chạm. */
export function circleRect(e, cx, cz, hw, hd, r = 0.5) {
  const px = Math.max(cx - hw, Math.min(e.x, cx + hw)), pz = Math.max(cz - hd, Math.min(e.z, cz + hd));
  let dx = e.x - px, dz = e.z - pz;
  const d = Math.hypot(dx, dz);
  if (d >= r) return false;
  if (d < 1e-6) { // tâm nằm trong hình chữ nhật: đẩy ra theo trục gần nhất
    const ox = hw - Math.abs(e.x - cx), oz = hd - Math.abs(e.z - cz);
    if (ox < oz) e.x += (e.x >= cx ? 1 : -1) * (ox + r); else e.z += (e.z >= cz ? 1 : -1) * (oz + r);
    return true;
  }
  dx /= d; dz /= d;
  e.x = px + dx * r; e.z = pz + dz * r;
  const vn = e.vx * dx + e.vz * dz;
  if (vn < 0) { e.vx -= vn * dx; e.vz -= vn * dz; }
  return true;
}
