import * as THREE from 'three';
import { clamp, fmtTime, makeFX } from '/js/util.js';
import { std, glow, mesh, T } from '/js/gfx.js';
import { setupScene, spawnBeans, stepBean, pushApart, clampRect, showBean, discMesh, ringMesh } from '/js/party.js';
import { tick, pulse, stick, idle, nearest, wobble, chance } from '/js/bots.js';

const HX = 19, HZ = 10, DURATION = 100, BASE_X = 16, WIN = 5;
const TEAM = [{ n: 'ĐỎ', c: 0xff4d5e, s: '#ff4d5e' }, { n: 'XANH', c: 0x3aa8ff, s: '#3aa8ff' }];
let S = null;

export default {
  id: 'flag',
  name: 'Cướp Cờ',
  emoji: '🚩',
  color: '#ff7a3d',
  cat: 'team',
  bots: 4,
  tag: '2-8 người · 2 đội · 100 giây',
  desc: 'Hai đội ĐỎ và XANH. Chạy sang căn cứ địch, chạm cờ rồi mang về căn cứ nhà để ghi điểm. Bấm A để lao húc: người địch bị húc sẽ choáng và đánh rơi cờ!',
  cfg: { a: 'LAO HÚC', b: '', gyro: false, hideStick: false, hint: 'Cướp cờ địch mang về nhà · A lao húc để chặn' },

  init(ctx) {
    const scene = ctx.scene;
    setupScene(ctx, { bg: 0x0d1020, size: 30, cam: [0, 32, 17], look: [0, 0, 0.5], light: { sun: 2.5, hemi: 0.65 } });
    const floor = mesh(new THREE.BoxGeometry(HX * 2 + 2, 1, HZ * 2 + 2), std(0xffffff, { map: T.grass(12), roughness: 1, envMapIntensity: 0.15 }), false, true);
    floor.position.y = -0.5; scene.add(floor);
    for (const t of [0, 1]) {
      const sx = t ? 1 : -1;
      const half = mesh(new THREE.BoxGeometry(HX, 0.04, HZ * 2), new THREE.MeshBasicMaterial({ color: TEAM[t].c, transparent: true, opacity: 0.1 }), false); half.position.set(sx * HX / 2, 0.03, 0); scene.add(half);
      const base = discMesh(TEAM[t].c, 3.2, 0.35); base.position.set(sx * BASE_X, 0.06, 0); scene.add(base);
      const rg = ringMesh(TEAM[t].c, 3.2, 0.2, 0.9); rg.position.set(sx * BASE_X, 0.07, 0); scene.add(rg);
    }
    const mid = mesh(new THREE.BoxGeometry(0.3, 0.2, HZ * 2), glow(0xffffff, 1.2), false); mid.position.set(0, 0.1, 0); scene.add(mid);
    S = { ctx, fx: makeFX(THREE, scene), t: 0, time: 0, over: false, lastHud: -1, score: [0, 0], flags: [] };
    // cờ: flag[t] là cờ CỦA đội t, nằm ở căn cứ đội t, bị đội kia cướp
    S.poleGeo = new THREE.CylinderGeometry(0.07, 0.07, 3.2, 8); S.clothGeo = new THREE.BoxGeometry(1.5, 0.9, 0.06);
    S.poleMat = std(0xdddddd, { metalness: 0.6, roughness: 0.3 });
    for (const t of [0, 1]) {
      const g = new THREE.Group();
      const pole = mesh(S.poleGeo, S.poleMat); pole.position.y = 1.6;
      const cloth = mesh(S.clothGeo, glow(TEAM[t].c, 1.1), false); cloth.position.set(0.75, 2.8, 0);
      g.add(pole, cloth);
      const home = [(t ? 1 : -1) * BASE_X, 0];
      g.position.set(home[0], 0, home[1]); scene.add(g);
      S.flags.push({ g, cloth, team: t, home, x: home[0], z: home[1], carrier: null });
    }
    S.ents = spawnBeans(ctx, (i, n) => { const t = i % 2; const k = (i / 2) | 0; return [(t ? 1 : -1) * (BASE_X - 3 - (k % 2) * 1.5), ((k + 1) >> 1) * (k % 2 ? -3 : 3) - 0]; },
      (p, i) => ({ team: i % 2, cd: 0, dash: 0, stun: 0, tags: 0, caps: 0, carry: null, role: ((i / 2) | 0) % 3 === 2 ? 1 : 0 }));
    for (const e of S.ents) { const tr = mesh(new THREE.TorusGeometry(0.75, 0.07, 6, 20), glow(TEAM[e.team].c, 2.2), false); tr.rotation.x = Math.PI / 2; tr.position.y = 0.1; e.g.add(tr); }
    ctx.hud.title('Cướp Cờ');
    this.hud();
  },

  hud() {
    const s = S;
    s.ctx.hud.board([
      { color: TEAM[0].s, name: 'ĐỘI ĐỎ', text: String(s.score[0]) }, { color: TEAM[1].s, name: 'ĐỘI XANH', text: String(s.score[1]) },
      ...s.ents.map((e) => ({ color: e.p.color, name: e.p.name, text: `${e.carry ? '🚩 ' : ''}${e.caps}★ ${e.tags}💥` })),
    ]);
  },

  dropFlag(e) {
    const f = e.carry; if (!f) return;
    f.carrier = null; e.carry = null;
    f.x = f.home[0]; f.z = f.home[1];   // cờ về nhà ngay khi bị chặn
    S.ctx.sfx.warn(); S.fx.ring(e.x, e.z, '#ffffff', 4, 0.5);
  },

  think(dt) {
    const s = S;
    for (const e of s.ents) {
      const p = e.p;
      if (!p.bot || !tick(p, dt, 0.09)) continue;
      if (e.stun > 0) { idle(p); continue; }
      const my = e.team, foe = 1 - my;
      const ownFlag = s.flags[my], enemyFlag = s.flags[foe];
      const myDir = my ? 1 : -1;
      const homeX = myDir * BASE_X;
      const enemies = s.ents.filter((o) => o.team === foe && o.stun <= 0);
      // 1) đang mang cờ: chạy về nhà, né người
      if (e.carry) {
        let tx = homeX, tz = 0, mx = tx - e.x, mz = tz - e.z; const L = Math.hypot(mx, mz) || 1; mx /= L; mz /= L;
        for (const o of enemies) { const dx = e.x - o.x, dz = e.z - o.z, d = Math.hypot(dx, dz) || 1; if (d < 5) { mx += dx / d * (5 - d) * 0.35; mz += dz / d * (5 - d) * 0.35; } }
        stick(p, mx, mz);
        const nr = nearest(enemies, e.x, e.z);
        if (e.cd <= 0 && (!nr || nr.d > 6) && Math.abs(e.x - homeX) > 6 && chance(p, 0.25)) pulse(p, 'a');
        continue;
      }
      // 2) cờ nhà đang bị cướp: truy đuổi người mang cờ
      if (ownFlag.carrier) {
        const c = ownFlag.carrier;
        const dx = c.x + c.vx * 0.2 - e.x, dz = c.z + c.vz * 0.2 - e.z, L = Math.hypot(dx, dz) || 1;
        stick(p, dx / L, dz / L);
        if (L < 3.6 && e.cd <= 0 && chance(p, 0.9)) pulse(p, 'a');
        continue;
      }
      // 3) vai trò: tấn công hoặc phòng thủ
      const attacker = e.role === 0 || s.ents.filter((o) => o.team === my).length <= 2;
      if (attacker) {
        const nr = nearest(enemies, e.x, e.z);
        e.lane = e.lane || (Math.random() < 0.5 ? -1 : 1);
        const far = Math.abs(enemyFlag.x - e.x) > 7;
        let mx = enemyFlag.x - e.x, mz = (far ? e.lane * 7 : enemyFlag.z) - e.z; const L = Math.hypot(mx, mz) || 1; mx /= L; mz /= L;   // đi vòng theo rìa rồi mới cắt vào cờ
        if (nr && nr.d < 3.2) { const dx = e.x - nr.o.x, dz = e.z - nr.o.z, d = nr.d || 1; mx += (dx / d) * 0.35; mz += (dz / d) * 0.35 + (dz >= 0 ? 0.5 : -0.5); }
        if (e.cd <= 0 && Math.hypot(enemyFlag.x - e.x, enemyFlag.z - e.z) > 7 && (!nr || nr.d > 4) && chance(p, 0.2)) pulse(p, 'a');   // lao nhanh về phía cờ
        mz += wobble(p, 0.2);
        stick(p, mx, mz);
      } else {
        // phòng thủ: đứng giữa căn cứ nhà và địch gần nhất
        const nr = nearest(enemies, homeX, 0);
        if (nr && Math.abs(nr.o.x - homeX) < 5.5 && Math.abs(nr.o.z) < 7) {
          const dx = nr.o.x - e.x, dz = nr.o.z - e.z, L = Math.hypot(dx, dz) || 1;
          stick(p, dx / L, dz / L);
          if (L < 3.0 && e.cd <= 0 && chance(p, 0.45 + 0.3 * p.skill)) pulse(p, 'a');
        } else {
          const tx = homeX - myDir * 2.2, tz = nr ? clamp(nr.o.z, -5, 5) : 0, dx = tx - e.x, dz = tz - e.z, L = Math.hypot(dx, dz);
          if (L < 1) idle(p); else stick(p, dx / L, dz / L);
        }
      }
    }
  },

  update(dt) {
    const s = S, ctx = s.ctx;
    s.time += dt; s.t += dt; s.fx.update(dt);
    ctx.hud.timer(fmtTime(Math.max(0, DURATION - s.t)));
    for (const e of s.ents) {
      e.cd -= dt; e.dash -= dt; e.stun -= dt;
      const stunned = e.stun > 0;
      stepBean(e, dt, { acc: stunned ? 0 : 54, drag: stunned ? 3 : 5.2, max: (e.dash > 0 ? 15 : 8.4) * (e.carry ? 0.93 : 1), lock: stunned });
      if (!stunned && e.p.press.a && e.cd <= 0) { e.vx += e.fx * 13; e.vz += e.fz * 13; e.dash = 0.3; e.cd = 1.7; ctx.sfx.dash(); s.fx.ring(e.x, e.z, '#ffffff', 2.2, 0.3); }
    }
    pushApart(s.ents, 0.62, 0.5);
    for (const e of s.ents) clampRect(e, HX - 0.7, HZ - 0.7);

    // húc người địch
    for (const a of s.ents) {
      if (a.dash <= 0 || a.stun > 0) continue;
      for (const b of s.ents) {
        if (b.team === a.team || b.stun > 0 || Math.hypot(a.x - b.x, a.z - b.z) > 1.35) continue;
        b.stun = 1.3; a.tags++;
        const d = Math.hypot(b.x - a.x, b.z - a.z) || 1; b.vx = ((b.x - a.x) / d) * 12; b.vz = ((b.z - a.z) / d) * 12;
        if (b.carry) this.dropFlag(b);
        ctx.sfx.hit(); ctx.shake(0.3); ctx.vibrate(b.p.id, 200);
        s.fx.burst(b.x, 1, b.z, '#ffd23f', 12, 8); this.hud();
      }
    }
    // cờ: nhặt / ghi điểm
    for (const f of s.flags) {
      if (f.carrier) { f.x = f.carrier.x; f.z = f.carrier.z - 0.2; }
      else for (const e of s.ents) {
        if (e.team === f.team || e.stun > 0 || e.carry || Math.hypot(e.x - f.x, e.z - f.z) > 1.5) continue;
        f.carrier = e; e.carry = f; ctx.sfx.gem(); ctx.vibrate(e.p.id, 80); this.hud(); break;
      }
      f.g.position.set(f.x, 0, f.z);
      f.cloth.position.y = 2.8 + Math.sin(s.time * 6 + f.team) * 0.05; f.cloth.rotation.y = Math.sin(s.time * 5) * 0.2;
    }
    for (const e of s.ents) {
      if (!e.carry) continue;
      const hx = (e.team ? 1 : -1) * BASE_X;
      if (Math.hypot(e.x - hx, e.z) < 3.2) {
        const f = e.carry; this.dropFlag(e); e.caps++; s.score[e.team]++;
        ctx.sfx.goal(); ctx.shake(0.5); s.fx.burst(hx, 1.5, 0, TEAM[e.team].s, 30, 12); s.fx.ring(hx, 0, TEAM[e.team].s, 8, 0.6);
        ctx.hud.banner(`${TEAM[e.team].n} +1!`, 1200, true, TEAM[e.team].s);
        this.hud();
      }
    }
    for (const e of s.ents) {
      showBean(e, dt, s.time);
      e.g.rotation.z = e.stun > 0 ? Math.sin(s.time * 30) * 0.25 : 0;
    }
    if (Math.floor(s.t * 3) !== s.lastHud) { s.lastHud = Math.floor(s.t * 3); this.hud(); }
    if (!s.over && (s.t >= DURATION || s.score[0] >= WIN || s.score[1] >= WIN)) {
      s.over = true;
      const win = s.score[0] === s.score[1] ? -1 : s.score[0] > s.score[1] ? 0 : 1;
      const rank = [...s.ents].sort((a, b) => ((b.team === win) - (a.team === win)) || (b.caps * 3 + b.tags) - (a.caps * 3 + a.tags));
      ctx.finish(rank.map((e) => ({ id: e.p.id, text: `${TEAM[e.team].n} ${s.score[0]}-${s.score[1]}${win === e.team ? ' 🏆' : win === -1 ? ' hòa' : ''} · ${e.caps} cờ ${e.tags} húc` })));
    }
  },

  dispose() { if (S) { S.fx.dispose(); S.poleGeo.dispose(); S.clothGeo.dispose(); S.poleMat.dispose(); S = null; } },
};
