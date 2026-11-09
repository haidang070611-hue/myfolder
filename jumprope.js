import * as THREE from 'three';
import { clamp, rand, angleDiff, makeFX, fmtTime } from '/js/util.js';
import { std, glow, mesh, T } from '/js/gfx.js';
import { setupScene, lavaPlane, spawnBeans, stepBean, pushApart, clampCircle, showBean, hudRows } from '/js/party.js';
import { tick, pulse, stick, idle, wobble, chance } from '/js/bots.js';

const R = 13;            // bán kính sàn
const HUB = 1.7;         // trụ giữa (không đứng được)
const BAR_H = 0.95;      // thanh quét thấp hơn độ cao này thì trúng
const LIMIT = 150;
const TAU = Math.PI * 2;
let S = null;

export default {
  id: 'jumprope',
  name: 'Nhảy Dây',
  emoji: '🤸',
  cat: 'party',
  bots: 5,
  color: '#2ee6d6',
  tag: '1-8 người · sống sót',
  desc: 'Thanh laser quét quanh sàn ngày càng nhanh, thỉnh thoảng đổi chiều. Bấm A để NHẢY qua thanh. Trúng thanh là bị loại, người trụ lại cuối cùng thắng!',
  cfg: { a: 'NHẢY', b: '', gyro: false, hideStick: false, hint: 'Cần gạt để chạy · A để nhảy qua thanh laser' },

  init(ctx) {
    const scene = ctx.scene;
    setupScene(ctx, { bg: 0x08141c, size: 24, cam: [0, 28, 15], look: [0, 0, 1], light: { sun: 2.0, hemi: 0.5, color: 0xcdfff8 } });
    const lava = lavaPlane(scene, -8);
    const top = mesh(new THREE.CylinderGeometry(R, R, 1, 72), std(0xffffff, { map: T.plate(14, [64, 92, 100]), roughness: 0.5, metalness: 0.45 }), false, true);
    top.position.y = -0.5;
    const rim = mesh(new THREE.TorusGeometry(R, 0.24, 12, 96), glow(0x2ee6d6, 2.4), false); rim.rotation.x = Math.PI / 2;
    scene.add(top, rim);

    // trụ giữa + cánh tay quét
    const pole = mesh(new THREE.CylinderGeometry(HUB * 0.55, HUB * 0.75, 3.2, 20), std(0x30343f, { roughness: 0.35, metalness: 0.8 }));
    pole.position.y = 1.6;
    const cap = mesh(new THREE.SphereGeometry(HUB * 0.55, 20, 14), glow(0x2ee6d6, 2.8), false); cap.position.y = 3.3;
    scene.add(pole, cap);
    const arms = [];
    for (let k = 0; k < 2; k++) {
      const arm = new THREE.Group();
      const bar = mesh(new THREE.BoxGeometry(R - HUB + 0.2, 0.22, 0.34), glow(k ? 0xff5a8a : 0x2ee6d6, 2.6), false);
      bar.position.set((R + HUB) / 2, 0.45, 0);
      const post = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8), std(0x222833), false); post.position.set(R - 0.1, 0.25, 0);
      arm.add(bar, post);
      arm.position.y = 0.0;
      scene.add(arm);
      arms.push(arm);
    }
    S = { ctx, fx: makeFX(THREE, scene), lava, arms, cap, t: 0, time: 0, ang: -Math.PI / Math.max(2, ctx.players.length), w: 0, wt: 1.5, dir: 1, flipT: rand(8, 12), arm2: false, order: [], over: false, scene, lastHud: -1 };
    S.ents = spawnBeans(ctx, (i, n) => { const a = (i / n) * TAU; return [Math.cos(a) * 8.5, Math.sin(a) * 8.5]; }, () => ({ vy: 0, cd: 0, out: false, jumps: 0 }));
    S.ents.forEach((e) => { e.fx = -e.x / 8.5; e.fz = -e.z / 8.5; e.ang = Math.atan2(e.fx, e.fz); });
    ctx.hud.title('Nhảy Dây');
    arms[1].visible = false;
    this.hud();
  },

  hud() {
    const s = S;
    s.ctx.hud.board(hudRows(s.ents, (e) => (e.out ? '💀' : e.jumps ? e.jumps + ' lần nhảy' : '')));
  },

  // bot: tính thời gian thanh quét tới chỗ mình rồi nhảy đúng lúc
  think(dt) {
    const s = S;
    for (const e of s.ents) {
      const p = e.p;
      if (!p.bot) continue;
      const a = p.ai || (p.ai = { t: 0, rel: { a: 0, b: 0 } });
      if (a.rel.a > 0 && (a.rel.a -= dt) <= 0) p.input.a = 0;
      if (e.out) { idle(p); continue; }

      // di chuyển nhẹ nhàng quanh vành giữa, đổi điểm đến mỗi ~1.5s
      a.mt = (a.mt || 0) - dt;
      if (a.mt <= 0) {
        a.mt = rand(1.0, 2.2);
        const ang = rand(0, TAU), rr = rand(4.2, 10);
        a.tx = Math.cos(ang) * rr; a.tz = Math.sin(ang) * rr;
      }
      const dx = a.tx - e.x, dz = a.tz - e.z, d = Math.hypot(dx, dz);
      if (d > 0.8) stick(p, (dx / d) * 0.55, (dz / d) * 0.55); else idle(p);

      // canh nhảy
      if (e.vy !== 0 || e.y > 0.05 || e.cd > 0) continue;
      const nArms = s.arm2 ? 2 : 1;
      const w = Math.abs(s.w) || 0.01;
      const tb = Math.atan2(e.z, e.x);
      let best = 9;
      for (let k = 0; k < nArms; k++) {
        const armAng = s.ang + k * Math.PI;
        let dAng = angleDiff(armAng, tb) * s.dir;       // >0: thanh đang tiến tới mình
        if (dAng < 0) dAng += TAU;
        best = Math.min(best, dAng / w);
      }
      const want = 0.34 + wobble(p, 0.22);
      if (best < want && best > want - 0.14 && chance(p, 0.97)) pulse(p, 'a', 0.08);
    }
  },

  update(dt) {
    const s = S, ctx = s.ctx;
    s.time += dt; s.t += dt; s.fx.update(dt); s.lava.update(dt);
    const alive = s.ents.filter((e) => !e.out);

    // tốc độ quét tăng dần, thỉnh thoảng đổi chiều
    const base = s.t < 1.5 ? 0 : clamp(1.25 + (s.t - 1.5) * 0.032, 1.25, 3.4);   // 1.5s đầu đứng yên cho mọi người định vị
    s.flipT -= dt;
    if (s.flipT <= 0) {
      s.dir = -s.dir; s.flipT = rand(9, 14);
      ctx.sfx.warn(); ctx.hud.banner('ĐỔI CHIỀU!', 900, true, '#ff9ad0');
    }
    if (!s.arm2 && s.t > 28) {
      s.arm2 = true; s.arms[1].visible = true;
      ctx.sfx.warn(); ctx.hud.banner('THÊM MỘT THANH!', 1200, true, '#ff5a8a');
    }
    s.w += (base * s.dir - s.w) * Math.min(1, dt * 2.2);
    const prev = s.ang;
    s.ang += s.w * dt;
    s.arms[0].rotation.y = -s.ang;     // góc quanh trục Y; atan2(z,x) = -rotation.y
    s.arms[1].rotation.y = -(s.ang + Math.PI);
    s.cap.material.emissiveIntensity = 2.2 + Math.sin(s.time * 9) * 0.8;
    ctx.hud.timer(fmtTime(Math.max(0, LIMIT - s.t)));

    for (const e of alive) {
      e.cd -= dt;
      stepBean(e, dt, { acc: 50, drag: 5.4, max: 8.6 });
      // nhảy
      if (e.y <= 0.001 && e.vy === 0 && e.p.press.a && e.cd <= 0) {
        e.vy = 9.2; e.cd = 0.25; e.jumps++;
        ctx.sfx.jump();
      }
      if (e.y > 0 || e.vy > 0) {
        e.vy -= 27 * dt;
        e.y += e.vy * dt;
        if (e.y <= 0) { e.y = 0; if (e.vy < -4) s.fx.ring(e.x, e.z, '#9ffcf0', 1.6, 0.25); e.vy = 0; }
      }
    }
    pushApart(alive, 0.62, 0.6);
    for (const e of alive) {
      clampCircle(e, R - 0.7);
      const d = Math.hypot(e.x, e.z);
      if (d < HUB + 0.55) { const k = (HUB + 0.55) / (d || 1); e.x = d ? e.x * k : HUB + 0.55; e.z = d ? e.z * k : 0; }
    }

    // va chạm thanh quét (kiểm tra cả đoạn thanh vừa quét qua trong frame này)
    const sweep = Math.abs(s.ang - prev);
    const nArms = s.arm2 ? 2 : 1;
    for (const e of alive) {
      if (e.y >= BAR_H || s.t < 1.5) continue;
      const r = Math.hypot(e.x, e.z);
      if (r < HUB) continue;
      const tb = Math.atan2(e.z, e.x);
      const margin = 0.62 / r;
      for (let k = 0; k < nArms; k++) {
        const a0 = prev + k * Math.PI;
        // vị trí tương đối của người so với thanh theo chiều quét
        let rel = angleDiff(a0, tb) * Math.sign(s.ang - prev || 1);
        if (rel < -TAU / 2) rel += TAU;
        if (rel >= -margin && rel <= sweep + margin) { this.knock(e, k); break; }
      }
    }

    if (!s.over) {
      const left = s.ents.filter((e) => !e.out);
      if (left.length <= (s.ents.length > 1 ? 1 : 0) || s.t > LIMIT) this.end();
    }
    for (const e of s.ents) if (!e.out) showBean(e, dt, s.time);
    if (Math.floor(s.t * 2) !== s.lastHud) { s.lastHud = Math.floor(s.t * 2); this.hud(); }
  },

  knock(e, k) {
    const s = S, ctx = s.ctx;
    e.out = true; e.alive = false; e.g.visible = false; e.outT = s.t;
    s.order.push(e);
    ctx.sfx.boom(); ctx.shake(0.55); ctx.vibrate(e.p.id, 300);
    s.fx.burst(e.x, 1, e.z, e.p.color, 22, 10); s.fx.ring(e.x, e.z, k ? '#ff5a8a' : '#2ee6d6', 5, 0.5);
    ctx.hud.banner(`💥 ${e.p.name} vấp dây!`, 1100, true, '#ff7a8a');
    this.hud();
  },

  end() {
    const s = S;
    if (s.over) return;
    s.over = true;
    const alive = s.ents.filter((e) => !e.out);
    const rank = [...alive, ...[...s.order].reverse()];
    s.ctx.finish(rank.map((e) => ({ id: e.p.id, text: e.out ? `trụ được ${fmtTime(e.outT)}` : `sống sót ${fmtTime(s.t)}${s.ents.length > 1 ? ' 🏆' : ''}` })));
  },

  dispose() { if (S) { S.fx.dispose(); S = null; } },
};
