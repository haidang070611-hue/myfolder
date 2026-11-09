export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);

export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function fmtTime(sec) {
  sec = Math.max(0, sec);
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
}

/** Ánh sáng chuẩn cho mọi game (PBR): mặt trời có bóng mềm + ánh sáng bầu trời */
export function addLights(THREE, scene, size = 30, o = {}) {
  const { sun: si = 2.6, hemi = 0.55, color = 0xfff1dc, sky = 0xbcd2ff, ground = 0x2a2e48, dir = [0.5, 1.2, 0.6] } = o;
  scene.add(new THREE.HemisphereLight(sky, ground, hemi));
  const sunL = new THREE.DirectionalLight(color, si);
  sunL.position.set(size * dir[0], size * dir[1], size * dir[2]);
  sunL.castShadow = true;
  const ms = window.__shadowSize || 2048;
  sunL.shadow.mapSize.set(ms, ms);
  const c = sunL.shadow.camera;
  c.left = -size; c.right = size; c.top = size; c.bottom = -size; c.near = 1; c.far = size * 4;
  sunL.shadow.bias = -0.0003; sunL.shadow.normalBias = 0.05; sunL.shadow.radius = 3;
  scene.add(sunL);
  return sunL;
}

/** Bảng tên nổi trên đầu nhân vật */
export function nameSprite(THREE, text, color = '#fff') {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d');
  g.font = '700 34px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,.75)';
  g.strokeText(text, 128, 34);
  g.fillStyle = color;
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(4, 1, 1);
  sp.renderOrder = 10;
  return sp;
}

export function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) { if (m.map && m.map.userData && m.map.userData.own) m.map.dispose(); m.dispose(); } // texture dùng chung được cache nên không dispose ở đây
    }
  });
}

/** Hiệu ứng nhẹ: vòng xung kích + hạt */
export function makeFX(THREE, scene) {
  const items = [];
  const ringGeo = new THREE.RingGeometry(0.7, 1, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const boxGeo = new THREE.BoxGeometry(0.28, 0.28, 0.28);
  const mats = new Map();
  const partMat = (c) => {
    if (!mats.has(c)) mats.set(c, new THREE.MeshBasicMaterial({ color: c }));
    return mats.get(c);
  };
  return {
    ring(x, z, color = '#ffffff', size = 3, life = 0.45, y = 0.08) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
      m.position.set(x, y, z);
      scene.add(m);
      items.push({ k: 'r', m, life, max: life, size });
    },
    burst(x, y, z, color = '#ffffff', n = 10, speed = 7) {
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(boxGeo, partMat(color));
        m.position.set(x, y, z);
        const a = Math.random() * Math.PI * 2;
        const up = Math.random() * speed * 0.8 + 2;
        const sp = Math.random() * speed;
        items.push({ k: 'p', m, life: 0.5 + Math.random() * 0.4, max: 0.9, vx: Math.cos(a) * sp, vy: up, vz: Math.sin(a) * sp });
        scene.add(m);
      }
    },
    update(dt) {
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        it.life -= dt;
        if (it.life <= 0) {
          scene.remove(it.m);
          if (it.k === 'r') it.m.material.dispose();
          items.splice(i, 1);
          continue;
        }
        if (it.k === 'r') {
          const t = 1 - it.life / it.max;
          const s = 0.4 + t * it.size;
          it.m.scale.set(s, 1, s);
          it.m.material.opacity = 0.9 * (1 - t);
        } else {
          it.vy -= 22 * dt;
          it.m.position.x += it.vx * dt;
          it.m.position.y += it.vy * dt;
          it.m.position.z += it.vz * dt;
          const s = Math.max(0.05, it.life / it.max);
          it.m.scale.setScalar(s);
        }
      }
    },
    dispose() {
      for (const it of items) { scene.remove(it.m); if (it.k === 'r') it.m.material.dispose(); }
      items.length = 0;
      ringGeo.dispose(); boxGeo.dispose();
      for (const m of mats.values()) m.dispose();
    },
  };
}
