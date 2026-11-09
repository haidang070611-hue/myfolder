import * as THREE from 'three';
import { rand, clamp, fmtTime, makeFX } from '/js/util.js';
import { std, glow, mesh } from '/js/gfx.js';
import { setupScene, spawnBeans, stepBean, pushApart, clampRect, showBean } from '/js/party.js';
import { tick, pulse, stick, idle, nearest, wobble, chance } from '/js/bots.js';

const HX = 16, HZ = 9.5, DURATION = 55;
let S = null;

export default {
  id: 'icerink',
  name: 'Trượt Băng Thu Sao',
  emoji: '⛸️',
  color: '#7fdcff',
  cat: 'party',
  bots: 4,
  tag: '1-8 người · 55 giây',
  desc: 'Sàn băng trơn trượt! Thu thật nhiều sao: sao vàng đáng 3. Lao vào người khác với tốc độ cao (A để lao) sẽ cướp sao của họ rơi ra. Phanh sớm kẻo trượt qua đầu!',
  cfg: { a: 'LAO', b: '', gyro: false, hideStick: false, hint: 'Trượt tới sao · húc người khác để làm rơi sao' },

  init(ctx) {
    const scene = ctx.scene;
    setupScene(ctx, { bg: 0x0c1a2e, size: 26, cam: [0, 27, 15], look: [0, 0, 0.5], light: { sun: 2.3, hemi: 0.8, color: 0xe8f6ff } });
    const ice = mesh(new THREE.BoxGeometry(HX * 2 + 2, 1, HZ * 2 + 2), std(0xcfefff, { roughness: 0.08, metalness: 0.25, envMapIntensity: 1.4, clearcoat: 1 }), false, true);
    ice.position.y = -0.5; scene.add(ice);
    const wallM = std(0xeaf6ff, { roughness: 0.4 });
    for (const [x, z, w, d] of [[0, -HZ - 0.6, HX * 2 + 2, 1], [0, HZ + 0.6, HX * 2 + 2, 1], [-HX - 0.6, 0, 1, HZ * 2 + 1], [HX + 0.6, 0, 1, HZ * 2 + 1]]) {
      const m = mesh(new THREE.BoxGeometry(w, 0.9, d), wallM); m.position.set(x, 0.45, z); scene.add(m);
    }
    for (let i = 0; i < 5; i++) { const m = mesh(new THREE.TorusGeometry(2.2 + i * 2.6, 0.04, 6, 64), glow(0x7fdcff, 0.9), false); m.rotation.x = Math.PI / 2; m.position.y = 0.02; scene.add(m); }
    S = { ctx, fx: makeFX(THREE, scene), stars: [], t: 0, time: 0, over: false, lastHud: -1, starT: 0 };
    S.starGeo = new THREE.OctahedronGeometry(0.5, 0);
    S.starMats = [glow(0xffe36a, 2.6), glow(0xff9ad8, 3)];
    S.ents = spawnBeans(ctx, (i, n) => { const a = (i / n) * Math.PI * 2; return [Math.cos(a) * 8, Math.sin(a) * 5]; }, () => ({ score: 0, cd: 0, dash: 0, stun: 0, inv: 0 }));
    for (let i = 0; i < 7; i++) this.spawnStar();
    ctx.hud.title('Trượt Băng Thu Sao');
    this.hud();
  },

  hud() { S.ctx.hud.board([...S.ents].sort((a, b) => b.score - a.score).map((e) => ({ color: e.p.color, name: e.p.name, text: `${e.score} ⭐${e.stun > 0 ? ' 😵' : ''}` }))); },

  spawnStar(x, z, big = Math.random() < 0.14) {
    const s = S;
    if (x === undefined) { x = rand(-HX + 2, HX - 2); z = rand(-HZ + 2, HZ - 2); }
    const m = mesh(s.starGeo, s.starMats[big ? 1 : 0], false); m.position.set(x, 0.8, z); m.scale.setScalar(big ? 1.5 : 1);
    s.ctx.scene.add(m);
    s.stars.push({ m, x, z, v: big ? 3 : 1, ph: Math.random() * 6, age: 0 });
  },

  think(dt) {
    const s = S;
    for (const e of s.ents) {
      const p = e.p;
      if (!p.bot || !tick(p, dt, 0.07)) continue;
      if (e.stun > 0) { idle(p); continue; }
      // chọn sao tốt nhất (gần, đáng điểm), trừ khi người khác gần hơn nhiều
      let best = null, bs = -1e9;
      for (const q of s.stars) {
        const d = Math.hypot(q.x - e.x, q.z - e.z);
        let sc = q.v * 4 - d;
        for (const o of s.ents) if (o !== e && Math.hypot(o.x - q.x, o.z - q.z) < d - 3) sc -= 4;
        if (sc > bs) { bs = sc; best = q; }
      }
      // mục tiêu thay thế: người đang giữ nhiều sao và ở gần
      const rich = nearest(s.ents.filter((o) => o !== e && o.score >= 4 && o.inv <= 0), e.x, e.z);
      let tx = best ? best.x : 0, tz = best ? best.z : 0, ram = false;
      if (rich && rich.d < 7 && (!best || bs < 0) && chance(p, 0.6)) { tx = rich.o.x + rich.o.vx * 0.2; tz = rich.o.z + rich.o.vz * 0.2; ram = true; }
      // điều khiển trên băng: nhắm vận tốc mong muốn, trừ đi vận tốc hiện tại để phanh
      const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz) || 1;
      const want = Math.min(11, d * 1.7), sk = 0.7 + 0.3 * p.skill;
      let ax = (dx / d) * want * sk - e.vx, az = (dz / d) * want * sk - e.vz;
      ax += wobble(p, 2.5); az += wobble(p, 2.5);
      if (Math.abs(e.x) > HX - 1.5) ax -= Math.sign(e.x) * 4;
      if (Math.abs(e.z) > HZ - 1.5) az -= Math.sign(e.z) * 4;
      stick(p, ax * 0.35, az * 0.35);
      if (ram && d < 4 && e.cd <= 0) pulse(p, 'a');
    }
  },

  update(dt) {
    const s = S, ctx = s.ctx;
    s.time += dt; s.t += dt; s.fx.update(dt);
    ctx.hud.timer(fmtTime(Math.max(0, DURATION - s.t)));
    s.starT -= dt;
    if (s.starT <= 0 && s.stars.length < 6 + s.ents.length * 2) { s.starT = 0.8; this.spawnStar(); }

    for (const e of s.ents) {
      e.cd -= dt; e.dash -= dt; e.stun -= dt; e.inv -= dt;
      const stunned = e.stun > 0;
      stepBean(e, dt, { acc: stunned ? 0 : 34, drag: 0.55, max: e.dash > 0 ? 17 : 11.5, lock: stunned });
      if (!stunned && e.p.press.a && e.cd <= 0) { e.vx += e.fx * 11; e.vz += e.fz * 11; e.dash = 0.4; e.cd = 1.6; ctx.sfx.dash(); s.fx.ring(e.x, e.z, '#ffffff', 2.4, 0.3); }
      // nảy tường
      if (Math.abs(e.x) > HX - 0.7) { e.x = Math.sign(e.x) * (HX - 0.7); e.vx *= -0.75; }
      if (Math.abs(e.z) > HZ - 0.7) { e.z = Math.sign(e.z) * (HZ - 0.7); e.vz *= -0.75; }
    }
    // va chạm nảy mạnh, có cướp sao
    for (let i = 0; i < s.ents.length; i++) for (let j = i + 1; j < s.ents.length; j++) {
      const a = s.ents[i], b = s.ents[j];
      let dx = b.x - a.x, dz = b.z - a.z; const d = Math.hypot(dx, dz);
      if (d >= 1.25 || d < 1e-6) continue;
      dx /= d; dz /= d;
      const o = (1.25 - d) / 2; a.x -= dx * o; a.z -= dz * o; b.x += dx * o; b.z += dz * o;
      const rel = (a.vx - b.vx) * dx + (a.vz - b.vz) * dz;
      if (rel > 0) { const j2 = rel * 1.7 / 2 + 1.5; a.vx -= j2 * dx; a.vz -= j2 * dz; b.vx += j2 * dx; b.vz += j2 * dz; }
      const hit = (atk, def) => {
        const sp = Math.hypot(atk.vx, atk.vz), toward = atk.vx * (def.x - atk.x) + atk.vz * (def.z - atk.z);
        if (def.inv > 0 || def.score < 1 || toward < 0 || sp < 8.5) return;
        const lose = Math.min(def.score, 1 + (sp > 13 ? 1 : 0));
        def.score -= lose; atk.score += Math.ceil(lose / 2); def.inv = 1.2; def.stun = 0.5;
        for (let k = 0; k < lose; k++) this.spawnStar(def.x + rand(-1.5, 1.5), def.z + rand(-1.5, 1.5), false);
        ctx.sfx.hit(); ctx.shake(0.4); ctx.vibrate(def.p.id, 200);
        s.fx.burst(def.x, 1, def.z, '#ffe36a', 12, 9); this.hud();
      };
      hit(a, b); hit(b, a);
    }
    for (let i = s.stars.length - 1; i >= 0; i--) {
      const q = s.stars[i];
      q.age += dt; q.m.rotation.y += dt * 3; q.m.position.y = 0.8 + Math.sin(s.time * 4 + q.ph) * 0.15;
      for (const e of s.ents) {
        if (e.stun > 0 || Math.hypot(e.x - q.x, e.z - q.z) > 1.1) continue;
        e.score += q.v; if (q.v > 1) ctx.sfx.gem(); else ctx.sfx.coin();
        ctx.vibrate(e.p.id, 20); s.fx.burst(q.x, 1, q.z, '#ffe36a', 6, 6);
        ctx.scene.remove(q.m); s.stars.splice(i, 1); this.hud(); break;
      }
    }
    for (const e of s.ents) {
      showBean(e, dt, s.time);
      e.g.visible = e.inv <= 0 || Math.floor(s.time * 14) % 2 === 0;
      e.g.rotation.z = e.stun > 0 ? Math.sin(s.time * 30) * 0.3 : 0;
    }
    if (Math.floor(s.t * 3) !== s.lastHud) { s.lastHud = Math.floor(s.t * 3); this.hud(); }
    if (!s.over && s.t >= DURATION) {
      s.over = true;
      const rank = [...s.ents].sort((a, b) => b.score - a.score);
      ctx.finish(rank.map((e) => ({ id: e.p.id, text: `${e.score} sao` })));
    }
  },

  dispose() { if (S) { S.fx.dispose(); S.starGeo.dispose(); S.starMats.forEach((m) => m.dispose()); S = null; } },
};
