import * as THREE from 'three';
import { clamp, rand, makeFX } from '/js/util.js';
import { std, glow, mesh, T } from '/js/gfx.js';
import { setupScene, spawnBeans, stepBean, pushApart, clampCircle, showBean, hudRows, discMesh } from '/js/party.js';
import { tick, pulse, stick, idle, nearest, wobble, chance } from '/js/bots.js';

const R = 14;          // bán kính sàn
const RING = 6.2;      // bán kính vòng ghế
const SEAT_R = 1.25;   // lại gần ghế trong bán kính này là ngồi được
const NOTES = [523, 659, 784, 659, 587, 740, 880, 740];
let S = null;

export default {
  id: 'chairs',
  name: 'Ghế Âm Nhạc',
  emoji: '💺',
  cat: 'party',
  bots: 5,
  color: '#ff6fb5',
  tag: '2-8 người · loại dần',
  desc: 'Nhạc chạy thì đi vòng quanh, nhạc DỪNG thì lao vào ghế! Luôn thiếu một ghế, ai không có chỗ ngồi sẽ bị loại. Bấm A để lao húc người khác ra khỏi ghế.',
  cfg: { a: 'LAO', b: '', gyro: false, hideStick: false, hint: 'Nhạc dừng → chạy tới ghế sáng! · A để lao' },

  init(ctx) {
    const scene = ctx.scene;
    setupScene(ctx, { bg: 0x160a1e, size: 24, cam: [0, 27, 15], look: [0, 0, 0.8], light: { sun: 2.1, hemi: 0.55, color: 0xffd6f0 } });
    const top = mesh(new THREE.CylinderGeometry(R, R, 1, 72), std(0xffffff, { map: T.plate(14, [86, 62, 100]), roughness: 0.5, metalness: 0.4 }), false, true);
    top.position.y = -0.5;
    const rim = mesh(new THREE.TorusGeometry(R, 0.22, 12, 96), glow(0xff6fb5, 2.2), false); rim.rotation.x = Math.PI / 2;
    scene.add(top, rim);
    // sàn nhảy disco: các vòng đổi màu theo nhạc
    const rings = [4.2, 8.2, 11.4].map((r, i) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(r - 0.12, r, 64), new THREE.MeshBasicMaterial({ color: 0xff6fb5, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      m.rotation.x = -Math.PI / 2; m.position.y = 0.04; scene.add(m); return m;
    });

    S = { ctx, fx: makeFX(THREE, scene), rings, chairs: [], t: 0, time: 0, round: 0, phase: 'music', pt: 0, noteT: 0, note: 0, order: [], over: false, scene, banner: 0 };
    // 7 ghế dự phòng (ẩn bớt theo số người còn lại)
    const n = ctx.players.length;
    const seatGeo = new THREE.CylinderGeometry(SEAT_R * 0.8, SEAT_R * 0.9, 0.28, 28);
    for (let i = 0; i < Math.max(1, n); i++) {
      const g = new THREE.Group();
      const base = mesh(seatGeo, std(0xffffff, { map: T.plate(1, [120, 120, 150]), roughness: 0.4, metalness: 0.6 }), false, true);
      base.position.y = 0.14;
      const glowRing = new THREE.Mesh(new THREE.RingGeometry(SEAT_R * 0.92, SEAT_R * 1.08, 40), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      glowRing.rotation.x = -Math.PI / 2; glowRing.position.y = 0.3;
      const disc = discMesh(0xffd23f, SEAT_R * 0.9, 0.25); disc.position.y = 0.3;
      g.add(base, glowRing, disc);
      scene.add(g);
      S.chairs.push({ g, ring: glowRing, disc, x: 0, z: 0, owner: null, on: false });
    }
    S.ents = spawnBeans(ctx, (i, m) => { const a = (i / m) * Math.PI * 2; return [Math.cos(a) * 9.5, Math.sin(a) * 9.5]; }, () => ({ seat: null, cd: 0, out: false }));
    S.ents.forEach((e) => { e.fx = -e.z / 9.5; e.fz = e.x / 9.5; e.ang = Math.atan2(e.fx, e.fz); });
    ctx.hud.title('Ghế Âm Nhạc');
    this.newRound();
  },

  newRound() {
    const s = S, alive = s.ents.filter((e) => !e.out);
    s.round++;
    s.phase = 'music'; s.pt = rand(3.6, 6.8) - Math.min(1.6, s.round * 0.25);
    s.noteT = 0; s.scram = 0;
    const solo = s.ents.length === 1;
    const count = solo ? 1 : Math.max(1, alive.length - 1);
    s.chairs.forEach((c, i) => {
      c.on = i < count; c.owner = null;
      c.g.visible = c.on;
      const a = (i / count) * Math.PI * 2 + s.round * 0.7;
      c.x = Math.cos(a) * RING; c.z = Math.sin(a) * RING;
      c.g.position.set(c.x, 0, c.z);
    });
    for (const e of alive) { e.seat = null; }
    s.ctx.hud.banner(`Vòng ${s.round} · ${alive.length} người, ${count} ghế`, 1500, true, '#ff9ad0');
    this.hud();
  },

  hud() {
    const s = S;
    s.ctx.hud.board(hudRows(s.ents, (e) => (e.out ? '💀' : e.seat ? '💺' : '')));
  },

  freeChairs() { return S.chairs.filter((c) => c.on && !c.owner); },

  sit(e, c) {
    const s = S;
    e.seat = c; c.owner = e; e.vx = e.vz = 0;
    e.x = c.x; e.z = c.z;
    s.ctx.sfx.pass(); s.ctx.vibrate(e.p.id, 90);
    s.fx.ring(c.x, c.z, e.p.color, 3, 0.4, 0.3);
    s.fx.burst(c.x, 0.8, c.z, e.p.color, 8, 5);
    c.ring.material.color.set(e.p.color); c.disc.material.color.set(e.p.color);
    this.hud();
  },

  think(dt) {
    const s = S;
    for (const e of s.ents) {
      const p = e.p;
      if (!p.bot) continue;
      if (!tick(p, dt, 0.08)) continue;
      if (e.out || e.seat) { idle(p); continue; }
      const a = p.ai;
      if (s.phase === 'music') {
        a.react = 0.12 + (1 - p.skill) * 0.55 + Math.random() * 0.2;   // phản xạ khi nhạc dừng
        a.wait = 0;
        // đi vòng quanh sát vòng ghế, bám theo chiều kim đồng hồ
        const ang = Math.atan2(e.z, e.x) + 0.55;
        const rr = RING + 2.4 + Math.sin(s.time * 0.7 + p.id) * 1.2;
        const tx = Math.cos(ang) * rr, tz = Math.sin(ang) * rr;
        stick(p, (tx - e.x) * 0.5 + wobble(p, 0.3), (tz - e.z) * 0.5 + wobble(p, 0.3));
      } else if (s.phase === 'scramble') {
        a.wait = (a.wait || 0) + 0.08 * (1.75 - p.skill);
        if (a.wait < a.react) { continue; }
        const f = nearest(this.freeChairs(), e.x, e.z);
        if (!f) { idle(p); continue; }
        stick(p, f.o.x - e.x, f.o.z - e.z);
        if (e.cd <= 0 && f.d < 4 && chance(p, 0.25)) {
          // húc người đang tranh ghế
          const rival = nearest(s.ents, e.x, e.z, (o) => o !== e && !o.out && !o.seat);
          if (rival && rival.d < 2.6) pulse(p, 'a');
        }
      } else idle(p);
    }
  },

  update(dt) {
    const s = S, ctx = s.ctx;
    s.time += dt; s.fx.update(dt);
    const alive = s.ents.filter((e) => !e.out);

    // vòng sáng nhấp nháy theo nhịp
    const beat = (Math.sin(s.time * 8) * 0.5 + 0.5);
    s.rings.forEach((r, i) => {
      r.material.color.setHSL(((s.time * 0.25 + i * 0.18) % 1), 0.85, 0.6);
      r.material.opacity = s.phase === 'music' ? 0.35 + beat * 0.4 : 0.18;
    });

    if (s.phase === 'music') {
      s.pt -= dt; s.noteT -= dt;
      if (s.noteT <= 0) { s.noteT = 0.22; ctx.sfx.note(NOTES[s.note++ % NOTES.length]); }
      for (const c of s.chairs) if (c.on) { c.ring.material.opacity = 0.35 + beat * 0.25; }
      if (s.pt <= 0) {
        s.phase = 'scramble'; s.scram = 0;
        ctx.sfx.warn(); ctx.shake(0.4);
        ctx.hud.banner('DỪNG! TÌM GHẾ!', 1400, true, '#ffd23f');
        for (const c of s.chairs) if (c.on) c.ring.material.opacity = 1;
      }
    } else if (s.phase === 'scramble') {
      s.scram += dt;
      for (const e of alive) {
        if (e.seat) continue;
        for (const c of s.chairs) {
          if (!c.on || c.owner) continue;
          if (Math.hypot(e.x - c.x, e.z - c.z) < SEAT_R) { this.sit(e, c); break; }
        }
      }
      const free = this.freeChairs().length;
      const standing = alive.filter((e) => !e.seat);
      const solo = s.ents.length === 1;
      if (free === 0 || standing.length === 0 || s.scram > 6.5) {
        // hết giờ mà vẫn còn ghế trống: xếp ghế cho người gần nhất để chắc chắn chỉ loại một người
        let guard = 12;
        while (this.freeChairs().length && standing.filter((e) => !e.seat).length > (solo ? 0 : 1) && guard--) {
          let best = null, bd = 1e9;
          for (const e of standing) {
            if (e.seat) continue;
            for (const c of this.freeChairs()) { const d = Math.hypot(e.x - c.x, e.z - c.z); if (d < bd) { bd = d; best = [e, c]; } }
          }
          if (best) this.sit(best[0], best[1]); else break;
        }
        s.phase = 'result'; s.pt = 1.6;
        const loser = alive.find((e) => !e.seat);
        if (loser) {
          loser.out = true; loser.alive = false; loser.g.visible = false; s.order.push(loser);
          ctx.sfx.boom(); ctx.shake(0.5); ctx.vibrate(loser.p.id, 350);
          s.fx.burst(loser.x, 1, loser.z, loser.p.color, 22, 9); s.fx.ring(loser.x, loser.z, '#ff4d6d', 5, 0.6);
          ctx.hud.banner(`💥 ${loser.p.name} hết chỗ ngồi!`, 1500, true, '#ff7a8a');
        } else ctx.hud.banner('Ai cũng có ghế! 🎉', 1400, true, '#4dff88');
        this.hud();
      }
    } else if (s.phase === 'result') {
      s.pt -= dt;
      if (s.pt <= 0 && !s.over) {
        const left = s.ents.filter((e) => !e.out);
        if (left.length <= 1) this.end();
        else this.newRound();
      }
    }

    // di chuyển
    for (const e of alive) {
      if (e.seat) { e.x = e.seat.x; e.z = e.seat.z; e.vx = e.vz = 0; continue; }
      e.cd -= dt;
      stepBean(e, dt, { acc: 50, drag: 5.2, max: s.phase === 'scramble' ? 10.5 : 7.4 });
      if (s.phase !== 'result' && e.p.press.a && e.cd <= 0) {
        e.vx += e.fx * 14; e.vz += e.fz * 14; e.cd = 1.2;
        ctx.sfx.dash(); s.fx.ring(e.x, e.z, '#ffffff', 2.2, 0.3);
      }
    }
    // người đang chạy đẩy được người đã ngồi? Không: ngồi là bất động, chỉ đẩy nhau khi chưa ngồi
    pushApart(alive.filter((e) => !e.seat), 0.62, 0.9);
    for (const e of alive) {
      clampCircle(e, R - 0.7);
      if (!e.seat) {
        // không cho đứng đè lên người đã ngồi
        for (const o of alive) {
          if (!o.seat) continue;
          const dx = e.x - o.x, dz = e.z - o.z, d = Math.hypot(dx, dz);
          if (d < 1.1 && d > 1e-4) { e.x = o.x + (dx / d) * 1.1; e.z = o.z + (dz / d) * 1.1; }
        }
      }
    }
    ctx.hud.timer(s.phase === 'music' ? '🎵' : s.phase === 'scramble' ? '⚡' : '');
    for (const e of alive) {
      showBean(e, dt, s.time);
      if (e.seat) e.g.position.y = 0.3 + Math.abs(Math.sin(s.time * 6 + e.p.id)) * 0.12;
    }
  },

  end() {
    const s = S;
    if (s.over) return;
    s.over = true;
    const alive = s.ents.filter((e) => !e.out);
    const rank = [...alive, ...[...s.order].reverse()];
    s.ctx.finish(rank.map((e, i) => ({ id: e.p.id, text: e.out ? 'hết chỗ ngồi' : s.ents.length > 1 ? 'ghế cuối cùng 🏆' : 'đã ngồi được' })));
  },

  dispose() { if (S) { S.fx.dispose(); S = null; } },
};
