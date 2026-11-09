import * as THREE from 'three';
import { clamp, rand, fmtTime, makeFX, nameSprite } from '/js/util.js';
import { std, glow, mesh, T } from '/js/gfx.js';
import { setupScene } from '/js/party.js';
import { tick, stick, hold, idle, chance } from '/js/bots.js';

const HX = 14, SHIP_Z = 11.5, COLS = 9, ROWS = 4, SP = 2.4, DURATION = 110;
let S = null;

export default {
  id: 'invaders',
  name: 'Phi Thuyền Đồng Đội',
  emoji: '👾',
  cat: 'team',
  bots: 4,
  color: '#7c5cff',
  tag: '1-8 người · hợp sức',
  desc: 'Cả đội cùng bảo vệ căn cứ! Gạt trái/phải để lái phi thuyền, giữ A để bắn đàn người ngoài hành tinh. Chung 5 mạng, ai hạ nhiều nhất sẽ đứng đầu.',
  cfg: { a: 'BẮN', b: '', gyro: false, hideStick: false, hint: 'Gạt trái/phải để lái · giữ A để bắn · cả đội chung 5 mạng' },

  init(ctx) {
    const scene = ctx.scene;
    setupScene(ctx, { bg: 0x070a18, sky: [0x03040c, 0x1a1650, 0x03040c, [0.2, 0.5, -0.8], 0x8aa0ff], size: 26, cam: [0, 34, 17], look: [0, 0, 0.5], fogNear: 80, fogFar: 180, light: { sun: 1.8, hemi: 0.55, color: 0xcdd8ff, sky: 0x7c8cff } });
    const floor = mesh(new THREE.BoxGeometry(HX * 2 + 6, 1, 32), std(0xffffff, { map: T.grid(14, 'rgba(124,92,255,.6)'), roughness: 0.3, metalness: 0.8, envMapIntensity: 1 }), false, true);
    floor.position.set(0, -0.5, 0); scene.add(floor);
    for (const sx of [-1, 1]) { const w = mesh(new THREE.BoxGeometry(0.4, 0.5, 30), glow(0x7c5cff, 2.4), false); w.position.set(sx * (HX + 1.6), 0.25, 0); scene.add(w); }
    // vài ngôi sao rơi trang trí
    const n = 90, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 60; pos[i * 3 + 1] = Math.random() * 14 + 1; pos[i * 3 + 2] = (Math.random() - 0.5) * 40; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbcc8ff, size: 0.18, transparent: true, opacity: 0.7, depthWrite: false })));

    S = { ctx, fx: makeFX(THREE, scene), t: 0, time: 0, over: false, lastHud: -1, aliens: [], shots: [], bombs: [], lives: 5, wave: 0, dirX: 1, speed: 1.6, bombT: 1.5, waveWait: 0.5, hp: 0 };
    S.alienGeos = [new THREE.OctahedronGeometry(0.8), new THREE.IcosahedronGeometry(0.75, 0), new THREE.DodecahedronGeometry(0.75)];
    S.alienMats = [0xff5a6e, 0xffb02e, 0x4dff88, 0x38c8ff].map((c) => std(c, { roughness: 0.3, metalness: 0.5, emissive: c, emissiveIntensity: 0.55 }));
    S.shotGeo = new THREE.CapsuleGeometry(0.12, 0.7, 4, 8); S.shotGeo.rotateX(Math.PI / 2);
    S.bombGeo = new THREE.SphereGeometry(0.28, 10, 8); S.bombMat = glow(0xff3a3a, 4);
    const nP = ctx.players.length;
    S.ents = ctx.players.map((p, i) => {
      const g2 = new THREE.Group();
      const hull = mesh(new THREE.ConeGeometry(0.8, 2.2, 6), std(p.color, { roughness: 0.25, metalness: 0.7, envMapIntensity: 1.3 })); hull.rotation.x = -Math.PI / 2; hull.position.z = -0.2;
      const wing = mesh(new THREE.BoxGeometry(2.2, 0.15, 0.9), std(p.color, { roughness: 0.3, metalness: 0.6 })); wing.position.set(0, 0, 0.5);
      const cock = mesh(new THREE.SphereGeometry(0.34, 12, 8), std(0x0a1424, { roughness: 0.05, metalness: 0.4 }), false); cock.position.set(0, 0.3, 0.1);
      const fire = mesh(new THREE.ConeGeometry(0.28, 0.9, 8), glow(0x7cd8ff, 3.5), false); fire.rotation.x = Math.PI / 2; fire.position.z = 1.4;
      const label = nameSprite(THREE, p.name, p.color); label.position.set(0, 1.8, 1); label.scale.set(3.4, 0.85, 1);
      g2.add(hull, wing, cock, fire, label);
      const x = (i - (nP - 1) / 2) * Math.min(3.4, 24 / Math.max(1, nP));
      g2.position.set(x, 0.9, SHIP_Z); scene.add(g2);
      return { p, g: g2, fire, x, vx: 0, cd: 0, inv: 0, score: 0, kills: 0, hits: 0 };
    });
    ctx.hud.title('Phi Thuyền · Đợt 1');
    this.hud();
  },

  hud() {
    const s = S;
    s.ctx.hud.title(`Đợt ${s.wave} · ❤️ ${s.lives}`);
    s.ctx.hud.board([...s.ents].sort((a, b) => b.score - a.score).map((e) => ({ color: e.p.color, name: e.p.name, text: `${e.score}` })));
  },

  spawnWave() {
    const s = S; s.wave++;
    const rows = Math.min(ROWS + Math.floor(s.wave / 3), 5);
    for (let r = 0; r < rows; r++) for (let c = 0; c < COLS; c++) {
      const m = new THREE.Mesh(s.alienGeos[r % 3], s.alienMats[r % 4]); m.castShadow = true;
      m.position.set((c - (COLS - 1) / 2) * SP, 0.9, -13 + r * 2.1);
      s.ctx.scene.add(m);
      s.aliens.push({ m, x: m.position.x, z: m.position.z, r, ph: Math.random() * 6 });
    }
    s.dirX = 1; s.speed = 1.6 + s.wave * 0.5;
    s.ctx.hud.banner(`ĐỢT ${s.wave}`, 1000, true); s.ctx.sfx.warn(); this.hud();
  },

  update(dt) {
    const s = S, ctx = s.ctx;
    s.time += dt; s.t += dt; s.fx.update(dt);
    ctx.hud.timer(fmtTime(Math.max(0, DURATION - s.t)));
    if (!s.over && !s.aliens.length) { s.waveWait -= dt; if (s.waveWait <= 0) { this.spawnWave(); s.waveWait = 1.2; } }

    // phi thuyền
    for (const e of s.ents) {
      e.cd -= dt; e.inv -= dt;
      e.vx += e.p.input.x * 70 * dt; e.vx *= Math.exp(-7 * dt); e.vx = clamp(e.vx, -13, 13);
      e.x = clamp(e.x + e.vx * dt, -HX, HX);
      e.g.position.x = e.x; e.g.rotation.z = -e.vx * 0.03;
      e.g.visible = e.inv <= 0 || Math.floor(s.time * 16) % 2 === 0;
      e.fire.scale.y = 0.8 + Math.sin(s.time * 40) * 0.25;
      if (e.p.input.a && e.cd <= 0 && s.lives > 0) {
        e.cd = 0.26;
        if (!e.shotMat) e.shotMat = glow(new THREE.Color(e.p.color), 3.5);
        const m = new THREE.Mesh(s.shotGeo, e.shotMat); m.position.set(e.x, 0.9, SHIP_Z - 1.6); ctx.scene.add(m);
        s.shots.push({ m, x: e.x, z: SHIP_Z - 1.6, e }); ctx.sfx.kick();
      }
    }
    // đàn alien đi ngang, chạm mép thì hạ xuống
    let edge = false;
    for (const a of s.aliens) { a.x += s.dirX * s.speed * dt; if (Math.abs(a.x) > HX - 0.3) edge = true; }
    if (edge) { s.dirX *= -1; for (const a of s.aliens) { a.z += 1.1; a.x = clamp(a.x, -HX + 0.3, HX - 0.3); } }
    for (const a of s.aliens) { a.m.position.set(a.x, 0.9 + Math.sin(s.time * 4 + a.ph) * 0.12, a.z); a.m.rotation.y += dt * 1.5; if (a.z > SHIP_Z - 1.5 && !s.over) { s.lives = 0; } }

    // đạn của đội
    for (let i = s.shots.length - 1; i >= 0; i--) {
      const b = s.shots[i]; b.z -= 24 * dt; b.m.position.z = b.z;
      let dead = b.z < -16;
      if (!dead) for (let j = s.aliens.length - 1; j >= 0; j--) {
        const a = s.aliens[j];
        if (Math.abs(a.x - b.x) < 1.0 && Math.abs(a.z - b.z) < 1.0) {
          b.e.score += 10; b.e.kills++;
          ctx.sfx.coin(); s.fx.burst(a.x, 1, a.z, '#' + s.alienMats[a.r % 4].color.getHexString(), 10, 8);
          ctx.scene.remove(a.m); s.aliens.splice(j, 1); dead = true;
          if (!(s.aliens.length % 3)) this.hud();
          break;
        }
      }
      if (dead) { ctx.scene.remove(b.m); s.shots.splice(i, 1); }
    }
    // alien thả bom
    s.bombT -= dt;
    if (s.bombT <= 0 && s.aliens.length) {
      s.bombT = clamp(1.1 - s.wave * 0.08, 0.35, 1.1) / Math.max(1, s.ents.length * 0.35);
      const cols = new Map(); for (const a of s.aliens) { const k = Math.round(a.x / SP); if (!cols.has(k) || cols.get(k).z < a.z) cols.set(k, a); }
      const arr = [...cols.values()]; const a = arr[Math.floor(Math.random() * arr.length)];
      const m = new THREE.Mesh(s.bombGeo, s.bombMat); m.position.set(a.x, 0.9, a.z + 1); ctx.scene.add(m);
      s.bombs.push({ m, x: a.x, z: a.z + 1 });
    }
    for (let i = s.bombs.length - 1; i >= 0; i--) {
      const b = s.bombs[i]; b.z += (8 + s.wave) * dt; b.m.position.z = b.z;
      let dead = b.z > SHIP_Z + 3;
      for (const e of s.ents) {
        if (e.inv > 0 || s.lives <= 0) continue;
        if (Math.abs(e.x - b.x) < 1.2 && Math.abs(SHIP_Z - b.z) < 1.2) {
          e.inv = 1.8; e.hits++; s.lives--; dead = true;
          ctx.sfx.boom(); ctx.shake(0.7); ctx.vibrate(e.p.id, 300); s.fx.burst(e.x, 1, SHIP_Z, '#ff7a2a', 22, 11); this.hud();
          break;
        }
      }
      if (dead) { ctx.scene.remove(b.m); s.bombs.splice(i, 1); }
    }
    if (Math.floor(s.t * 2) !== s.lastHud) { s.lastHud = Math.floor(s.t * 2); this.hud(); }
    if (!s.over && (s.lives <= 0 || s.t >= DURATION)) {
      s.over = true;
      const won = s.lives > 0;
      ctx.hud.banner(won ? `Giữ vững căn cứ! Tới đợt ${s.wave}` : `Căn cứ thất thủ ở đợt ${s.wave}`, 1500, true);
      ctx.finish([...s.ents].sort((a, b) => b.score - a.score).map((e) => ({ id: e.p.id, text: `${e.score} điểm · hạ ${e.kills} · đợt ${s.wave}` })));
    }
  },

  think(dt) {
    const s = S;
    for (const e of s.ents) {
      const p = e.p;
      if (!p.bot || !tick(p, dt, 0.06)) continue;
      // tránh bom gần nhất rồi mới nhắm alien
      let danger = null;
      for (const b of s.bombs) if (b.z > SHIP_Z - 6 && Math.abs(b.x - e.x) < 1.8 && (!danger || b.z > danger.z)) danger = b;
      let tx = e.x;
      if (danger && chance(p, 0.9)) tx = e.x + (e.x >= danger.x ? 3 : -3);
      else {
        let best = null, bd = 1e9;
        for (const a of s.aliens) { const d = Math.abs(a.x - e.x) - a.z * 0.2; if (d < bd) { bd = d; best = a; } }
        if (best) tx = best.x;
      }
      const dx = clamp((tx - e.x) / 3, -1, 1);
      stick(p, Math.abs(dx) < 0.1 ? 0 : dx, 0);
      hold(p, 'a', s.aliens.length ? 1 : 0);
    }
  },

  dispose() { if (S) { S.fx.dispose(); for (const g of S.alienGeos) g.dispose(); S.shotGeo.dispose(); S.bombGeo.dispose(); S = null; } },
};
