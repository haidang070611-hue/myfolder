import * as THREE from 'three';
import { clamp, rand, fmtTime, makeFX } from '/js/util.js';
import { std, glow, mesh, T } from '/js/gfx.js';
import { setupScene, spawnBeans, showBean } from '/js/party.js';
import { tick, pulse, ai, chance } from '/js/bots.js';

const DURATION = 60, GAP = 4.2;
const value = (n) => Math.round(Math.pow(n, 1.5));
let S = null;

export default {
  id: 'balloon',
  name: 'Bơm Bóng Bay',
  emoji: '🎈',
  cat: 'party',
  bots: 4,
  color: '#ff6fb5',
  tag: '1-8 người · 60 giây',
  desc: 'Bấm A để bơm bóng càng lúc càng to, bóng to điểm càng cao. Bấm B để chốt điểm. Tham lam quá thì bóng nổ và mất sạch!',
  cfg: { a: 'BƠM', b: 'CHỐT', gyro: false, hideStick: true, hint: 'A: bơm · B: chốt điểm trước khi bóng nổ' },

  init(ctx) {
    const scene = ctx.scene;
    setupScene(ctx, { bg: 0x1a1030, sky: [0x2a1f6a, 0xff9ac8, 0x3a2a5a, [0.2, 0.3, 0.9]], size: 26, cam: [0, 11, 20], look: [0, 3.2, -1], fogNear: 60, fogFar: 140, light: { sun: 2.6, hemi: 0.7, color: 0xffe3f0 } });
    const n = ctx.players.length;
    const W = Math.max(14, n * GAP + 4);
    const floor = mesh(new THREE.BoxGeometry(W + 8, 1, 16), std(0xffffff, { map: T.plate([Math.ceil(W / 4), 4], [96, 70, 120]), roughness: 0.4, metalness: 0.5 }), false, true);
    floor.position.set(0, -0.5, -1); scene.add(floor);
    S = { ctx, fx: makeFX(THREE, scene), t: 0, time: 0, over: false, lastHud: -1 };
    S.ents = spawnBeans(ctx, (i, m) => [(i - (m - 1) / 2) * GAP, 2.2], () => ({ pumps: 0, limit: 0, banked: 0, stun: 0, pops: 0, squash: 0 }));
    for (const e of S.ents) {
      e.limit = this.newLimit();
      e.fx = 0; e.fz = -1; e.ang = Math.PI;
      const mat = new THREE.MeshPhysicalMaterial({ color: e.p.color, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.4, transmission: 0, transparent: false });
      const b = mesh(new THREE.SphereGeometry(1, 28, 22), mat); b.scale.setScalar(0.6); b.position.set(e.x, 2.2, -1.4);
      const knot = mesh(new THREE.ConeGeometry(0.16, 0.25, 8), mat, false); knot.rotation.x = Math.PI; b.add(knot); knot.position.y = -1.05;
      const str = mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 4), std(0xf0f0f0), false);
      scene.add(b, str);
      e.bal = b; e.str = str; e.mat = mat;
      e.badge = null;
    }
    ctx.hud.title('Bơm Bóng Bay');
    this.hud();
  },

  newLimit() { return 3 + Math.floor(Math.random() * 11); },   // 3..13 lần bơm là nổ

  hud() { S.ctx.hud.board([...S.ents].sort((a, b) => b.banked - a.banked).map((e) => ({ color: e.p.color, name: e.p.name, text: `${e.banked}${e.pumps ? ` (+${value(e.pumps)})` : ''}${e.stun > 0 ? ' 💥' : ''}` }))); },

  update(dt) {
    const s = S, ctx = s.ctx;
    s.time += dt; s.t += dt; s.fx.update(dt);
    ctx.hud.timer(fmtTime(Math.max(0, DURATION - s.t)));
    for (const e of s.ents) {
      e.stun -= dt; e.squash = Math.max(0, e.squash - dt * 5);
      if (e.stun <= 0) {
        if (e.p.press.a) {
          e.pumps++; e.squash = 1; ctx.sfx.jump(); ctx.vibrate(e.p.id, 15);
          if (e.pumps > e.limit) {
            const lost = value(e.pumps - 1);
            ctx.sfx.boom(); ctx.shake(0.5); ctx.vibrate(e.p.id, 300);
            s.fx.burst(e.bal.position.x, e.bal.position.y, e.bal.position.z, e.p.color, 30, 11); s.fx.ring(e.x, -1.4, e.p.color, 6, 0.5);
            ctx.hud.banner(`💥 ${e.p.name} làm nổ bóng (-${lost})`, 1000, true);
            e.pumps = 0; e.pops++; e.stun = 1.5; e.limit = this.newLimit(); this.hud();
          } else this.hud();
        } else if (e.p.press.b && e.pumps > 0) {
          const v = value(e.pumps);
          e.banked += v; ctx.sfx.coin(); ctx.vibrate(e.p.id, 40);
          s.fx.burst(e.bal.position.x, e.bal.position.y, e.bal.position.z, '#ffd23f', 14, 8);
          e.pumps = 0; e.limit = this.newLimit(); e.stun = 0.45; this.hud();
        }
      }
      // hình ảnh: bóng phồng dần, rung khi sắp nổ
      const near = e.stun <= 0 && e.pumps >= e.limit - 1 && e.pumps > 2;
      const sc = (e.stun > 0 && e.pumps === 0 ? 0.0 : 0.6 + e.pumps * 0.2) * (1 + Math.sin(e.squash * Math.PI) * 0.12);
      e.bal.visible = sc > 0.01;
      e.bal.scale.setScalar(Math.max(0.01, sc));
      const shake = near ? Math.sin(s.time * 60) * 0.04 : 0;
      e.bal.position.set(e.x + shake, 2.0 + sc * 1.0 + Math.sin(s.time * 2 + e.x) * 0.1, -1.4);
      e.str.position.set(e.x, (e.bal.position.y - sc) / 2 + 0.5, -1.4); e.str.scale.y = Math.max(0.1, e.bal.position.y - sc - 0.6);
      showBean(e, dt, s.time);
      e.g.rotation.z = e.stun > 0 && e.pumps === 0 ? Math.sin(s.time * 30) * 0.2 : 0;
    }
    if (Math.floor(s.t * 3) !== s.lastHud) { s.lastHud = Math.floor(s.t * 3); this.hud(); }
    if (!s.over && s.t >= DURATION) {
      s.over = true;
      ctx.finish([...s.ents].sort((a, b) => b.banked - a.banked).map((e) => ({ id: e.p.id, text: `${e.banked} điểm · nổ ${e.pops} lần` })));
    }
  },

  think(dt) {
    const s = S;
    for (const e of s.ents) {
      const p = e.p;
      if (!p.bot || !tick(p, dt, 0.16)) continue;
      const a = ai(p);
      if (a.goal === undefined || e.pumps === 0) a.goal = Math.round(4 + p.skill * 3 + Math.random() * 3);   // bot giỏi liều hơn nhưng vẫn có đích
      if (e.stun > 0) continue;
      if (e.pumps >= a.goal) pulse(p, 'b'); else if (chance(p, 0.95)) pulse(p, 'a');
    }
  },

  dispose() { if (S) { S.fx.dispose(); S = null; } },
};
