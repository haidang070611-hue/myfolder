import * as THREE from 'three';
import { clamp, rand, fmtTime, makeFX } from '/js/util.js';
import { std, glow, mesh, T } from '/js/gfx.js';
import { setupScene, spawnBeans, stepBean, pushApart, clampRect, showBean, hudRows, ringMesh } from '/js/party.js';
import { makeCoin } from '/js/models.js';
import { tick, pulse, hold, stick, idle, toward, away, nearest, wobble, chance, ai, segHitsRect } from '/js/bots.js';

const HX = 15, HZ = 9, DURATION = 45;
let S = null;

export default {
  id: 'coins',
  name: 'Thu Xu',
  emoji: '💰',
  cat: 'party',
  bots: 4,
  color: '#ffc83a',
  tag: '1-8 người · 45 giây',
  desc: 'Nhặt thật nhiều xu vàng, ngọc xanh đáng 3 xu. Cẩn thận bom đen: chạm vào sẽ mất xu và bị choáng. Bấm A để lao nhanh.',
  cfg: { a: 'LAO', b: '', gyro: false, hideStick: false, hint: 'Nhặt xu · tránh bom đen · A để lao' },

  init(ctx) {
    const scene = ctx.scene;
    setupScene(ctx, { bg: 0x10162a, size: 24, cam: [0, 25, 15], look: [0, 0, 1], light: { sun: 2.6, hemi: 0.55 } });
    const floor = mesh(new THREE.BoxGeometry(HX * 2 + 2, 1, HZ * 2 + 2), std(0xffffff, { map: T.plate([8, 5], [62, 74, 104]), roughness: 0.5, metalness: 0.45 }), false, true);
    floor.position.y = -0.5; scene.add(floor);
    const wallM = std(0x2a3354, { roughness: 0.4, metalness: 0.6 });
    const wall = (x, z, w, d) => { const m = mesh(new THREE.BoxGeometry(w, 1.1, d), wallM, true, true); m.position.set(x, 0.55, z); scene.add(m); const g = mesh(new THREE.BoxGeometry(w > d ? w : 0.08, 0.08, w > d ? 0.08 : d), glow(0xffc83a, 2), false); g.position.set(x, 1.12, z); scene.add(g); };
    wall(0, -HZ - 0.5, HX * 2 + 2, 1); wall(0, HZ + 0.5, HX * 2 + 2, 1); wall(-HX - 0.5, 0, 1, HZ * 2); wall(HX + 0.5, 0, 1, HZ * 2);

    S = { ctx, fx: makeFX(THREE, scene), items: [], t: 0, time: 0, spawnT: 0, bombT: 3, over: false, lastHud: -1 };
    S.bombGeo = new THREE.IcosahedronGeometry(0.55, 1);
    S.bombMat = std(0x16161c, { roughness: 0.35, metalness: 0.8 });
    S.ents = spawnBeans(ctx, (i, n) => [(i - (n - 1) / 2) * 3.2, 0], () => ({ coins: 0, cd: 0, dash: 0, stun: 0, inv: 0 }));
    ctx.hud.title('Thu Xu');
    this.hud();
  },

  hud() { S.ctx.hud.board([...S.ents].sort((a, b) => b.coins - a.coins).map((e) => ({ color: e.p.color, name: e.p.name, text: `${e.coins} 💰${e.stun > 0 ? ' 😵' : ''}` }))); },

  freeSpot() {
    for (let k = 0; k < 20; k++) {
      const x = rand(-HX + 1.5, HX - 1.5), z = rand(-HZ + 1.5, HZ - 1.5);
      if (S.items.every((it) => Math.hypot(it.x - x, it.z - z) > 2.2)) return [x, z];
    }
    return [rand(-HX + 2, HX - 2), rand(-HZ + 2, HZ - 2)];
  },

  spawn(kind) {
    const s = S, [x, z] = this.freeSpot();
    let m, life;
    if (kind === 'bomb') {
      m = new THREE.Group();
      const b = mesh(s.bombGeo, s.bombMat); b.position.y = 0.7;
      const core = mesh(new THREE.SphereGeometry(0.28, 10, 8), glow(0xff2a2a, 3), false); core.position.y = 0.7;
      m.add(b, core);
      const warn = ringMesh(0xff3030, 1.5, 0.15, 0.9); m.add(warn); m.userData.warn = warn;
      life = 9;
    } else {
      m = makeCoin(kind === 'coin');
      if (kind === 'gem') { m.scale.setScalar(1.35); m.material = std(0x38c8ff, { metalness: 0.5, roughness: 0.1, emissive: 0x0a5a88, emissiveIntensity: 1.3 }); m.children[0].material = m.material; }
      life = kind === 'gem' ? 6 : 10;
    }
    m.position.set(x, kind === 'bomb' ? 0 : 1.0, z);
    s.ctx.scene.add(m);
    s.items.push({ m, x, z, kind, life, age: 0 });
    return m;
  },


  // ---- AI bot: chọn xu/ngọc có lợi nhất (gần, tránh bom, tránh tranh với người khác), né bom ----
  think(dt) {
    const s = S;
    for (const e of s.ents) {
      const p = e.p;
      if (!p.bot || !tick(p, dt, 0.1)) continue;
      if (e.stun > 0) { idle(p); continue; }
      let best = null, bs = -1e9;
      for (const it of s.items) {
        if (it.kind === 'bomb') continue;
        const d = Math.hypot(it.x - e.x, it.z - e.z);
        let sc = (it.kind === 'gem' ? 18 : 6) - d;
        for (const b of s.items) if (b.kind === 'bomb' && Math.hypot(b.x - it.x, b.z - it.z) < 2.4) sc -= 20;
        for (const o of s.ents) if (o !== e && Math.hypot(o.x - it.x, o.z - it.z) < d - 2) sc -= 3;
        if (sc > bs) { bs = sc; best = it; }
      }
      let mx = 0, mz = 0;
      if (best) { const dx = best.x - e.x, dz = best.z - e.z, L = Math.hypot(dx, dz) || 1; mx = dx / L; mz = dz / L; }
      for (const b of s.items) {
        if (b.kind !== 'bomb') continue;
        const dx = e.x - b.x, dz = e.z - b.z, L = Math.hypot(dx, dz) || 1;
        if (L < 3.2) { const w = ((3.2 - L) / 3.2) * 2.4; mx += (dx / L) * w; mz += (dz / L) * w; }
      }
      stick(p, mx, mz);
      if (best && e.cd <= 0 && Math.hypot(best.x - e.x, best.z - e.z) > 7 && chance(p, 0.4)) pulse(p, 'a');
    }
  },

  update(dt) {
    const s = S, ctx = s.ctx;
    s.time += dt; s.t += dt; s.fx.update(dt);
    ctx.hud.timer(fmtTime(Math.max(0, DURATION - s.t)));

    // sinh xu / bom (càng về cuối càng nhiều bom)
    s.spawnT -= dt; s.bombT -= dt;
    const coinsNow = s.items.filter((i) => i.kind !== 'bomb').length;
    if (s.spawnT <= 0 && coinsNow < 8 + s.ents.length * 3) { s.spawnT = 0.35; this.spawn(Math.random() < 0.12 ? 'gem' : 'coin'); }
    const maxBombs = Math.min(6, 2 + Math.floor(s.t / 10));
    if (s.bombT <= 0 && s.items.filter((i) => i.kind === 'bomb').length < maxBombs) { s.bombT = 3.2; this.spawn('bomb'); }

    for (const e of s.ents) {
      e.cd -= dt; e.dash -= dt; e.stun -= dt; e.inv -= dt;
      const stunned = e.stun > 0;
      stepBean(e, dt, { acc: stunned ? 0 : 56, drag: stunned ? 3 : 5.2, max: e.dash > 0 ? 15 : 9.4, lock: stunned });
      if (!stunned && e.p.press.a && e.cd <= 0) { e.vx += e.fx * 13; e.vz += e.fz * 13; e.dash = 0.28; e.cd = 1.5; ctx.sfx.dash(); s.fx.ring(e.x, e.z, '#ffffff', 2.2, 0.3); }
    }
    pushApart(s.ents, 0.62, 0.5);
    for (const e of s.ents) clampRect(e, HX - 0.7, HZ - 0.7);

    for (let i = s.items.length - 1; i >= 0; i--) {
      const it = s.items[i];
      it.age += dt; it.life -= dt;
      let remove = it.life <= 0;
      if (it.kind === 'bomb') {
        const armed = it.age > 1.0;
        it.m.userData.warn.visible = !armed;
        it.m.children[1].material.emissiveIntensity = armed ? 2 + Math.sin(s.time * 12) * 1.5 : 0.3;
        it.m.children[0].rotation.y += dt;
        if (armed) for (const e of s.ents) {
          if (e.inv > 0 || Math.hypot(e.x - it.x, e.z - it.z) > 1.35) continue;
          const lost = Math.min(2, e.coins); e.coins -= lost; e.stun = 1.1; e.inv = 2;
          let dx = e.x - it.x, dz = e.z - it.z; const d = Math.hypot(dx, dz) || 1;
          e.vx = (dx / d) * 14; e.vz = (dz / d) * 14;
          ctx.sfx.boom(); ctx.shake(0.5); ctx.vibrate(e.p.id, 300);
          s.fx.burst(it.x, 1, it.z, '#ff7a2a', 24, 11); s.fx.ring(it.x, it.z, '#ffb347', 6, 0.5);
          remove = true; this.hud(); break;
        }
      } else {
        it.m.rotation.y += dt * 3.2;
        it.m.position.y = 1.0 + Math.sin(s.time * 3 + it.x) * 0.15;
        it.m.visible = it.life > 2 || Math.floor(s.time * 8) % 2 === 0;
        for (const e of s.ents) {
          if (e.stun > 0 || Math.hypot(e.x - it.x, e.z - it.z) > 1.15) continue;
          const v = it.kind === 'gem' ? 3 : 1;
          e.coins += v;
          if (v === 3) ctx.sfx.gem(); else ctx.sfx.coin();
          ctx.vibrate(e.p.id, 20);
          s.fx.burst(it.x, 1, it.z, it.kind === 'gem' ? '#38c8ff' : '#ffd23f', 7, 6);
          remove = true; this.hud(); break;
        }
      }
      if (remove) { ctx.scene.remove(it.m); s.items.splice(i, 1); }
    }

    for (const e of s.ents) {
      showBean(e, dt, s.time);
      e.g.rotation.z = e.stun > 0 ? Math.sin(s.time * 30) * 0.25 : 0;
      e.g.visible = e.inv <= 0 || e.stun > 0 || Math.floor(s.time * 14) % 2 === 0;
    }
    if (Math.floor(s.t * 4) !== s.lastHud) { s.lastHud = Math.floor(s.t * 4); this.hud(); }
    if (!s.over && s.t >= DURATION) {
      s.over = true;
      const rank = [...s.ents].sort((a, b) => b.coins - a.coins);
      ctx.finish(rank.map((e) => ({ id: e.p.id, text: `${e.coins} xu` })));
    }
  },

  dispose() { if (S) { S.fx.dispose(); S.bombGeo.dispose(); S.bombMat.dispose(); S = null; } },
};
