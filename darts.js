import * as THREE from 'three';
import { clamp, rand, fmtTime, nameSprite, makeFX } from '/js/util.js';
import { std, glow, mesh, T, prepScene } from '/js/gfx.js';
import { tick, pulse, stick, idle, chance, ai } from '/js/bots.js';

const R = 9, DARTS = 4, LIMIT = 40;
const RINGS = [[0.7, 50], [1.8, 25], [3.2, 15], [4.8, 10], [6.4, 5], [8.0, 2]];
const scoreAt = (r) => { for (const [rr, v] of RINGS) if (r <= rr) return v; return 0; };
let S = null;

export default {
  id: 'darts',
  name: 'Phi Tiêu',
  emoji: '🎯',
  cat: 'party',
  bots: 4,
  color: '#e8445a',
  tag: '1-8 người · 4 phi tiêu',
  desc: 'Mọi người cùng ngắm một tấm bia! Gạt cần để di chuyển tâm ngắm (tay run nhẹ), bấm A để phóng. Mỗi người 4 phi tiêu, trúng hồng tâm 50 điểm.',
  cfg: { a: 'PHÓNG', b: '', gyro: false, hideStick: false, hint: 'Gạt cần để ngắm · A để phóng · còn 4 phi tiêu' },

  init(ctx) {
    const { scene, camera } = ctx;
    prepScene(scene);
    scene.background = new THREE.Color(0x1d1612);
    scene.fog = new THREE.Fog(0x1d1612, 40, 90);
    ctx.addLights(20, { sun: 2.2, hemi: 0.6, color: 0xfff0d8, dir: [0.2, 0.6, 1.4] });
    camera.position.set(0, 0, 25); camera.lookAt(0, 0, 0);

    // tường gỗ + bia
    const wall = mesh(new THREE.PlaneGeometry(60, 34), std(0xffffff, { map: T.noise('wood', [96, 62, 36], 50, 6), roughness: 0.85, envMapIntensity: 0.2 }), false, true);
    wall.position.z = -1; scene.add(wall);
    const frame = mesh(new THREE.CylinderGeometry(R + 1.1, R + 1.1, 0.8, 64), std(0x15110e, { roughness: 0.6 }), true, true); frame.rotation.x = Math.PI / 2; frame.position.z = -0.4; scene.add(frame);
    const cols = [0x14151b, 0xf2ead2, 0x14151b, 0xf2ead2, 0x14151b, 0xf2ead2];
    const reds = [0xd8283a, 0x1f9a58];
    for (let i = 0; i < RINGS.length; i++) {
      const rr = RINGS[RINGS.length - 1 - i][0];
      const m = mesh(new THREE.CylinderGeometry(rr, rr, 0.2, 64), std(i % 2 ? reds[1] : reds[0], { roughness: 0.7, envMapIntensity: 0.3 }), false, true);
      m.material.color.set(i % 2 ? (i === 5 ? 0xd8283a : 0x14151b) : 0xf2ead2);
      if (i === 1 || i === 3) m.material.color.set(i === 1 ? 0x1f9a58 : 0x1f9a58);
      if (i === 0) m.material.color.set(0x1f9a58);
      if (i === 2) m.material.color.set(0xd8283a);
      m.rotation.x = Math.PI / 2; m.position.z = 0.0 + i * 0.01; scene.add(m);
    }
    const bull = mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.3, 32), glow(0xff2a3a, 1.4), false); bull.rotation.x = Math.PI / 2; bull.position.z = 0.1; scene.add(bull);

    S = { ctx, fx: makeFX(THREE, scene), t: 0, time: 0, over: false, endT: 0, darts: [], lastHud: -1 };
    S.dartGeo = new THREE.ConeGeometry(0.16, 1.1, 8); S.dartGeo.rotateX(-Math.PI / 2);
    S.ents = ctx.players.map((p, i) => {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 32), new THREE.MeshBasicMaterial({ color: p.color, transparent: true, depthTest: false, depthWrite: false }));
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), new THREE.MeshBasicMaterial({ color: p.color, depthTest: false }));
      const cross = new THREE.Group(); cross.add(ring, dot);
      for (const [w, h] of [[1.5, 0.06], [0.06, 1.5]]) { const l = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: p.color, depthTest: false })); cross.add(l); }
      const label = nameSprite(THREE, p.name, p.color); label.position.set(0, 1.35, 0); label.scale.set(3.2, 0.8, 1);
      cross.add(label); cross.renderOrder = 10; cross.traverse((o) => { o.renderOrder = 10; });
      scene.add(cross);
      const a = (i / ctx.players.length) * 6.28;
      return { p, cross, cx: Math.cos(a) * 5, cy: Math.sin(a) * 5, left: DARTS, score: 0, cd: 0, ph: Math.random() * 9, hits: [] };
    });
    ctx.hud.title('Phi Tiêu');
    this.hud();
  },

  hud() { S.ctx.hud.board([...S.ents].sort((a, b) => b.score - a.score).map((e) => ({ color: e.p.color, name: e.p.name, text: `${e.score} · 🎯×${e.left}` }))); },

  wob(e) { const t = S.time; return [Math.sin(t * 2.3 + e.ph) * 0.55 + Math.sin(t * 5.1 + e.ph * 2) * 0.25, Math.cos(t * 1.9 + e.ph) * 0.55 + Math.sin(t * 4.3 + e.ph) * 0.25]; },

  update(dt) {
    const s = S, ctx = s.ctx;
    s.time += dt; s.t += dt; s.fx.update(dt);
    ctx.hud.timer(s.over ? '' : fmtTime(Math.max(0, LIMIT - s.t)));
    for (const e of s.ents) {
      e.cd -= dt;
      if (e.left > 0) {
        e.cx = clamp(e.cx + e.p.input.x * 9 * dt, -R - 1, R + 1);
        e.cy = clamp(e.cy - e.p.input.y * 9 * dt, -R - 1, R + 1);
      }
      const [wx, wy] = this.wob(e);
      e.cross.position.set(e.cx + wx, e.cy + wy, 1.5);
      e.cross.visible = e.left > 0;
      if (e.left > 0 && e.p.press.a && e.cd <= 0) {
        e.cd = 0.8; e.left--;
        const x = e.cx + wx + rand(-0.2, 0.2), y = e.cy + wy + rand(-0.2, 0.2);
        const r = Math.hypot(x, y), v = scoreAt(r);
        e.score += v;
        const d = new THREE.Mesh(s.dartGeo, std(e.p.color, { metalness: 0.6, roughness: 0.3 }));
        d.position.set(x, y, 12); d.userData = { x, y, z: 0.3, e };
        const tip = mesh(new THREE.ConeGeometry(0.2, 0.5, 4), std(0xffffff), false); tip.position.z = -0.55; tip.rotation.x = -Math.PI / 2; d.add(tip);
        d.rotation.set(rand(-0.12, 0.12), rand(-0.12, 0.12), 0);
        ctx.scene.add(d); s.darts.push(d);
        ctx.sfx.kick(); ctx.vibrate(e.p.id, 40);
        if (v >= 25) { ctx.sfx.gem(); s.fx.burst(x, y, 1, '#ffd23f', 14, 8); }
        if (v === 50) ctx.hud.banner(`🎯 HỒNG TÂM! ${e.p.name}`, 1200, true);
        else if (v === 0) ctx.hud.banner(`${e.p.name} trượt bia 😅`, 800, true);
        this.hud();
        if (e.left === 0) e.cross.visible = false;
      }
    }
    for (const d of s.darts) { const u = d.userData; if (d.position.z > u.z) { d.position.z = Math.max(u.z, d.position.z - 60 * dt); } }
    if (!s.over && (s.ents.every((e) => e.left === 0) || s.t >= LIMIT)) { s.endT += dt; if (s.endT > 1.2 || s.t >= LIMIT) this.end(); }
  },

  end() {
    const s = S; s.over = true;
    s.ctx.finish([...s.ents].sort((a, b) => b.score - a.score).map((e) => ({ id: e.p.id, text: `${e.score} điểm` })));
  },

  think(dt) {
    const s = S;
    for (const e of s.ents) {
      const p = e.p;
      if (!p.bot || e.left <= 0 || !tick(p, dt, 0.06)) continue;
      const [wx, wy] = this.wob(e);
      const gx = -wx + (Math.random() - 0.5) * 2 * (1.2 - p.skill), gy = -wy + (Math.random() - 0.5) * 2 * (1.2 - p.skill);
      const dx = gx - e.cx, dy = gy - e.cy, d = Math.hypot(dx, dy);
      stick(p, clamp(dx / 3, -1, 1), clamp(-dy / 3, -1, 1));
      const tol = 0.35 + (1 - p.skill) * 1.3;
      if (e.cd <= 0 && Math.hypot(e.cx + wx, e.cy + wy) < tol && chance(p, 0.5)) pulse(p, 'a');
    }
  },

  dispose() { if (S) { S.fx.dispose(); S.dartGeo.dispose(); S = null; } },
};
