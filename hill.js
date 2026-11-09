import * as THREE from 'three';
import { clamp, rand, fmtTime, makeFX } from '/js/util.js';
import { std, glow, mesh, T } from '/js/gfx.js';
import { setupScene, lavaPlane, spawnBeans, stepBean, pushApart, clampCircle, showBean, hudRows, discMesh, ringMesh } from '/js/party.js';
import { makeCrown } from '/js/models.js';
import { tick, pulse, hold, stick, idle, toward, away, nearest, wobble, chance, ai, segHitsRect } from '/js/bots.js';

const R = 15, ZR = 3.4, DURATION = 60, STAY = 9;
const SPOTS = [[0, 0], [-8, -4], [8, -4], [-8, 5], [8, 5], [0, -8.5], [0, 8.5]];
let S = null;

export default {
  id: 'hill',
  name: 'Vua Đồi',
  emoji: '👑',
  cat: 'fight',
  bots: 4,
  color: '#ffd23f',
  tag: '2-8 người · 60 giây',
  desc: 'Đứng một mình trong vòng sáng để ghi điểm, vòng sáng sẽ dịch chuyển. Bấm A để tạo sóng xung kích hất mọi người ra khỏi sàn!',
  cfg: { a: 'XUNG KÍCH', b: '', gyro: false, hideStick: false, hint: 'Đứng trong vòng sáng để ghi điểm · A để hất người khác văng đi' },

  init(ctx) {
    const scene = ctx.scene;
    setupScene(ctx, { bg: 0x0e1424, size: 24, cam: [0, 27, 17], look: [0, 0, 1], light: { sun: 2.4, hemi: 0.5 } });
    const lava = lavaPlane(scene, -9);
    const top = mesh(new THREE.CylinderGeometry(R, R, 1, 72), std(0xffffff, { map: T.plate(16, [70, 76, 108]), roughness: 0.5, metalness: 0.5 }), false, true);
    top.position.y = -0.5;
    const rim = mesh(new THREE.TorusGeometry(R, 0.25, 12, 96), glow(0xffd23f, 2.2), false); rim.rotation.x = Math.PI / 2;
    scene.add(top, rim);

    const zone = new THREE.Group();
    const disc = discMesh(0xffd23f, ZR, 0.32), ring = ringMesh(0xffe27a, ZR, 0.22, 1), ring2 = ringMesh(0xffffff, ZR * 0.55, 0.08, 0.5);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(ZR, ZR, 12, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    beam.position.y = 6;
    zone.add(disc, ring, ring2, beam);
    const next = ringMesh(0xffffff, ZR, 0.12, 0.8); next.visible = false;
    scene.add(zone, next);
    const crown = makeCrown(); crown.visible = false; scene.add(crown);

    S = { ctx, fx: makeFX(THREE, scene), lava, zone, ring, ring2, next, crown, zx: 0, zz: 0, tx: 0, tz: 0, cur: 0, nextIdx: 0, zt: STAY, t: 0, time: 0, over: false, lastHud: -1, hold: null };
    S.ents = spawnBeans(ctx, (i, n) => { const a = (i / n) * Math.PI * 2 + 0.3; return [Math.cos(a) * 10, Math.sin(a) * 10]; }, () => ({ cd: 0, score: 0, falling: false, respawn: 0 }));
    S.ents.forEach((e) => { e.fx = -e.x / 10; e.fz = -e.z / 10; e.ang = Math.atan2(e.fx, e.fz); });
    ctx.hud.title('Vua Đồi');
    this.hud();
  },

  hud() {
    const s = S;
    s.ctx.hud.board([...s.ents].sort((a, b) => b.score - a.score).map((e) => ({ color: e.p.color, name: e.p.name, text: `${Math.floor(e.score)} đ`, dead: e.falling })));
  },


  // ---- AI bot: đứng trong vòng sáng; nếu có người chiếm thì chờ sát mép vòng và dùng xung kích để dọn vòng rồi bước vào ----
  think(dt) {
    const s = S;
    for (const e of s.ents) {
      const p = e.p;
      if (!p.bot || !tick(p, dt, 0.1)) continue;
      if (e.falling) { idle(p); continue; }
      const moving = s.next.visible;
      const zx = moving ? s.next.position.x : s.zx, zz = moving ? s.next.position.z : s.zz;
      const inZone = Math.hypot(e.x - s.zx, e.z - s.zz) < ZR - 0.6;
      const rivalsIn = s.ents.filter((o) => o !== e && !o.falling && Math.hypot(o.x - zx, o.z - zz) < ZR + 0.3);
      if (moving) {
        toward(p, e, zx, zz, 1, 0.6);                      // vòng sắp dời: ra chỗ mới trước
      } else if (inZone) {
        toward(p, e, zx, zz, 0.5, 0.8);
        const r = nearest(rivalsIn, e.x, e.z);
        if (r && r.d < 4.2 && e.cd <= 0 && chance(p, 0.9)) pulse(p, 'a');
      } else if (rivalsIn.length) {
        const ang = Math.atan2(e.z - zz, e.x - zx);        // đứng ở mép vòng, phía mình, chờ xung kích
        toward(p, e, zx + Math.cos(ang) * (ZR + 0.7), zz + Math.sin(ang) * (ZR + 0.7), 1, 0.4);
        const r = nearest(rivalsIn, e.x, e.z);
        if (r && r.d < 4.3 && e.cd <= 0 && chance(p, 0.9)) pulse(p, 'a');
      } else toward(p, e, zx, zz, 1, 0.5);
      if (Math.hypot(e.x, e.z) > R - 2.4) toward(p, e, 0, 0, 1, 0.5);
    }
  },

  update(dt) {
    const s = S, ctx = s.ctx;
    s.time += dt; s.t += dt; s.fx.update(dt); s.lava.update(dt);
    ctx.hud.timer(fmtTime(Math.max(0, DURATION - s.t)));

    // vòng sáng đổi chỗ
    s.zt -= dt;
    if (s.zt <= 1.8 && !s.next.visible) {
      let n; do { n = Math.floor(Math.random() * SPOTS.length); } while (n === s.cur);
      s.nextIdx = n; s.next.visible = true; s.next.position.set(SPOTS[n][0], 0.08, SPOTS[n][1]); ctx.sfx.warn();
    }
    if (s.next.visible) s.next.material.opacity = 0.4 + 0.5 * Math.abs(Math.sin(s.time * 9));
    if (s.zt <= 0) { s.cur = s.nextIdx; s.tx = SPOTS[s.cur][0]; s.tz = SPOTS[s.cur][1]; s.next.visible = false; s.zt = STAY; ctx.sfx.pass(); s.fx.ring(s.tx, s.tz, '#ffd23f', 6, 0.6); }
    s.zx += (s.tx - s.zx) * Math.min(1, dt * 5); s.zz += (s.tz - s.zz) * Math.min(1, dt * 5);
    s.zone.position.set(s.zx, 0, s.zz);
    s.ring2.rotation.z += dt;

    const onboard = s.ents.filter((e) => !e.falling);
    for (const e of s.ents) {
      if (e.falling) {
        e.vy = (e.vy || 0) - 32 * dt; e.y += e.vy * dt; e.x += e.vx * dt; e.z += e.vz * dt;
        e.respawn -= dt;
        if (e.respawn <= 0) { const a = Math.random() * 6.28, r = rand(2, 8); e.x = Math.cos(a) * r; e.z = Math.sin(a) * r; e.y = 0; e.vx = e.vz = 0; e.falling = false; s.fx.ring(e.x, e.z, e.p.color, 4, 0.5); }
        continue;
      }
      e.cd -= dt;
      stepBean(e, dt, { acc: 54, drag: 4.6, max: 9.2 });
      if (e.p.press.a && e.cd <= 0) {
        e.cd = 2.2;
        ctx.sfx.boom(); ctx.shake(0.45); ctx.vibrate(e.p.id, 90);
        s.fx.ring(e.x, e.z, '#ffffff', 8, 0.5, 0.1); s.fx.ring(e.x, e.z, e.p.color, 5, 0.4, 0.12);
        for (const o of onboard) {
          if (o === e) continue;
          let dx = o.x - e.x, dz = o.z - e.z; const d = Math.hypot(dx, dz);
          if (d > 4.6 || d < 1e-6) continue;
          const f = 24 * (1 - d / 6);
          o.vx += (dx / d) * f; o.vz += (dz / d) * f; ctx.vibrate(o.p.id, 70);
        }
      }
    }
    pushApart(onboard, 0.62, 0.6);

    // rơi khỏi sàn
    for (const e of onboard) {
      if (Math.hypot(e.x, e.z) > R + 0.2) { e.falling = true; e.vy = 0; e.respawn = 2.6; ctx.sfx.fall(); ctx.vibrate(e.p.id, 200); this.hud(); }
    }

    // tính điểm: chỉ người đứng một mình trong vòng
    const inside = onboard.filter((e) => Math.hypot(e.x - s.zx, e.z - s.zz) < ZR - 0.2 && !e.falling);
    s.hold = inside.length === 1 ? inside[0] : null;
    const col = inside.length === 0 ? 0xffd23f : inside.length === 1 ? s.hold.p.color : 0xff4d4d;
    s.ring.material.color.set(col); s.zone.children[0].material.color.set(col);
    if (s.hold) { s.hold.score += dt; }
    if (Math.floor(s.t * 4) !== s.lastHud) { s.lastHud = Math.floor(s.t * 4); this.hud(); }

    // vương miện cho người dẫn đầu
    const lead = [...s.ents].sort((a, b) => b.score - a.score)[0];
    s.crown.visible = !!lead && lead.score > 1 && !lead.falling;
    if (s.crown.visible) { s.crown.position.set(lead.x, lead.y + 2.0 + Math.sin(s.time * 3) * 0.08, lead.z); s.crown.rotation.y += dt * 2; }

    for (const e of s.ents) showBean(e, dt, s.time);
    if (!s.over && s.t >= DURATION) {
      s.over = true;
      const rank = [...s.ents].sort((a, b) => b.score - a.score);
      ctx.finish(rank.map((e) => ({ id: e.p.id, text: `${Math.floor(e.score)} giây làm vua` })));
    }
  },

  dispose() { if (S) { S.fx.dispose(); S = null; } },
};
