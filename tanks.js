import { clamp, angleDiff, nameSprite, makeFX, fmtTime } from '/js/util.js';
import { std, glow, mesh, T, prepScene } from '/js/gfx.js';
import { makeTank, animateTreads } from '/js/models.js';
import { tick, pulse, hold, stick, idle, toward, away, nearest, wobble, chance, ai, segHitsRect } from '/js/bots.js';

const HX = 22, HZ = 14;     // nửa kích thước đấu trường
const TR = 1.15;            // bán kính xe tăng
const DURATION = 90;
const MAX_HP = 3;
const OBST = [              // [x, z, rộng, sâu]
  [0, 0, 4, 4], [-10, -6, 2.5, 6], [10, 6, 2.5, 6], [-10, 7, 5, 2.2], [10, -7, 5, 2.2],
  [0, -10, 6, 2], [0, 10, 6, 2],
];
const SPAWNS = [[-19, -11], [19, 11], [19, -11], [-19, 11], [0, -12], [0, 12], [-19, 0], [19, 0]];
let S = null;

export default {
  id: 'tanks',
  name: 'Bắn Tăng',
  emoji: '🛡️',
  cat: 'fight',
  bots: 4,
  color: '#4dff88',
  tag: '1-8 người · 90 giây',
  desc: 'Đấu trường tăng: gạt để di chuyển, A bắn, B bật khiên chặn đạn. Hạ gục nhiều nhất sau 90 giây là thắng.',
  cfg: { a: 'BẮN', b: 'KHIÊN', gyro: false, hideStick: false, hint: 'Cần gạt để lái, giữ A để bắn, B để bật khiên' },

  init(ctx) {
    const { THREE, scene, camera } = ctx;
    prepScene(scene);
    scene.background = new THREE.Color(0x0f141e);
    scene.fog = new THREE.Fog(0x0f141e, 55, 120);
    ctx.addLights(30, { sun: 2.7, hemi: 0.5, color: 0xffe9cc });
    camera.position.set(0, 36, 20);
    camera.lookAt(0, 0, 1.5);

    const floor = mesh(new THREE.BoxGeometry(HX * 2 + 2, 1, HZ * 2 + 2), std(0xffffff, { map: T.plate([7, 4.5], [74, 80, 96]), bumpMap: T.plate([7, 4.5], [74, 80, 96]), bumpScale: 0.6, roughness: 0.62, metalness: 0.35 }), false, true);
    floor.position.y = -0.5;
    scene.add(floor);
    const grid = new THREE.GridHelper(HX * 2, 22, 0x6a7aa8, 0x46557f);
    grid.scale.z = HZ / HX; grid.position.y = 0.01;
    grid.material.transparent = true; grid.material.opacity = 0.35;
    scene.add(grid);

    // tường biên bê tông + dải đèn
    const wallM = std(0xffffff, { map: T.noise('concrete', [128, 132, 146], 36, 3), roughness: 0.85, envMapIntensity: 0.3 });
    const wall = (x, z, w, d) => {
      const m = mesh(new THREE.BoxGeometry(w, 1.8, d), wallM, true, true); m.position.set(x, 0.9, z); scene.add(m);
      const strip = mesh(new THREE.BoxGeometry(w > d ? w - 0.3 : 0.1, 0.1, w > d ? 0.1 : d - 0.3), glow(0x4dff88, 2), false);
      strip.position.set(x + (w > d ? 0 : Math.sign(x) * -0.45), 1.85, z + (w > d ? Math.sign(z) * -0.45 : 0)); scene.add(strip);
    };
    wall(0, -HZ - 0.5, HX * 2 + 2, 1); wall(0, HZ + 0.5, HX * 2 + 2, 1); wall(-HX - 0.5, 0, 1, HZ * 2); wall(HX + 0.5, 0, 1, HZ * 2);
    // vật cản: thùng container gỉ sét
    const obM = std(0xffffff, { map: T.plate([2, 2], [150, 110, 70]), roughness: 0.55, metalness: 0.55 });
    for (const [x, z, w, d] of OBST) {
      const m = mesh(new THREE.BoxGeometry(w, 2, d), obM, true, true); m.position.set(x, 1, z); scene.add(m);
      const cap = mesh(new THREE.BoxGeometry(w + 0.1, 0.12, d + 0.1), std(0x2a2d38, { metalness: 0.8, roughness: 0.4 })); cap.position.set(x, 2.02, z); scene.add(cap);
    }

    S = { ctx, THREE, scene, fx: makeFX(THREE, scene), t: 0, tanks: [], bullets: [], over: false, lastHud: -1 };
    S.bulletGeo = new THREE.SphereGeometry(0.28, 12, 10);
    S.bulletMat = glow(0xffe08a, 5);

    ctx.players.forEach((p, i) => {
      const g = new THREE.Group();
      const model = makeTank(p.color);
      g.add(model);
      const shield = new THREE.Mesh(new THREE.SphereGeometry(2.1, 24, 16), new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending }));
      shield.position.y = 0.8; shield.visible = false; g.add(shield);
      const label = nameSprite(THREE, p.name, p.color); label.position.y = 3.6; g.add(label);
      const hp = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.14, 0.3), new THREE.MeshBasicMaterial({ color: 0x4dff88 }));
      hp.position.y = 2.6; g.add(hp);
      scene.add(g);
      const sp = SPAWNS[i % SPAWNS.length];
      S.tanks.push({ p, g, model, hpBar: hp, shield, x: sp[0], z: sp[1], h: Math.atan2(-sp[0], -sp[1]), hp: MAX_HP, alive: true, respawn: 0, inv: 1.5, reload: 0, shieldT: 0, shieldCd: 0, kills: 0, deaths: 0, spd: 0 });
    });
    ctx.hud.title('Bắn Tăng');
    this.hud();
  },

  hud() {
    const s = S;
    s.ctx.hud.board([...s.tanks].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths).map((t) => ({
      color: t.p.color, name: t.p.name, text: `${t.kills} hạ · ${t.deaths} chết`, dead: !t.alive,
    })));
  },

  spawnPoint(t) {
    let best = SPAWNS[0], bd = -1;
    for (const sp of SPAWNS) {
      let md = 1e9;
      for (const o of S.tanks) if (o !== t && o.alive) md = Math.min(md, Math.hypot(o.x - sp[0], o.z - sp[1]));
      if (md > bd) { bd = md; best = sp; }
    }
    return best;
  },

  hitObstacle(x, z, r) {
    for (const [ox, oz, w, d] of OBST) {
      const cx = clamp(x, ox - w / 2, ox + w / 2), cz = clamp(z, oz - d / 2, oz + d / 2);
      if (Math.hypot(x - cx, z - cz) < r) return [ox, oz, w, d];
    }
    return null;
  },


  // ---- AI bot: tiến lại gần, đứng ngắm rồi bắn, thỉnh thoảng né ngang, bật khiên khi có đạn bay tới ----
  incoming(t) {
    for (const b of S.bullets) {
      if (b.owner === t) continue;
      const dx = t.x - b.x, dz = t.z - b.z, d = Math.hypot(dx, dz);
      if (d > 7) continue;
      const v = Math.hypot(b.vx, b.vz);
      if ((dx * b.vx + dz * b.vz) / (d * v + 1e-6) > 0.9) return true;
    }
    return false;
  },

  think(dt) {
    const s = S;
    for (const t of s.tanks) {
      const p = t.p;
      if (!p.bot || !tick(p, dt, 0.08)) continue;
      if (!t.alive) { idle(p); hold(p, 'a', 0); hold(p, 'b', 0); continue; }
      const a = ai(p);
      hold(p, 'b', this.incoming(t) && t.shieldCd <= 0 && chance(p, 0.9));
      // chống kẹt: đang cố đi mà 1.2 giây không nhích
      if (a.st === undefined) { a.st = s.t; a.sx = t.x; a.sz = t.z; }
      if (s.t - a.st > 1.2) {
        if (a.moving && Math.hypot(t.x - a.sx, t.z - a.sz) < 0.6) { a.side = -(a.side || 1); a.unstick = s.t + 0.9; }
        a.st = s.t; a.sx = t.x; a.sz = t.z;
      }
      const f = nearest(s.tanks, t.x, t.z, (o) => o !== t && o.alive);
      if (!f) { idle(p); hold(p, 'a', 0); a.moving = false; continue; }
      const o = f.o, d = f.d;
      const want = Math.atan2(o.x - t.x, o.z - t.z);
      const diff = angleDiff(t.h, want);
      const clear = !segHitsRect(t.x, t.z, o.x, o.z, OBST, 0.5);
      a.side = a.side || (Math.random() < 0.5 ? 1 : -1);
      a.moving = true;
      if (a.unstick > s.t) {
        const ang = want + a.side * 1.4; stick(p, Math.sin(ang), Math.cos(ang)); hold(p, 'a', 0);
      } else if (clear && d < 20) {
        if (d > 13) stick(p, Math.sin(want), Math.cos(want));
        else { stick(p, Math.sin(want) * 0.22, Math.cos(want) * 0.22); a.moving = false; }
        if (Math.random() < 0.03 * (0.5 + p.skill)) { a.dodge = s.t + 0.5; a.dside = Math.random() < 0.5 ? 1 : -1; }
        if (a.dodge > s.t) { const ang = want + a.dside * 1.5; stick(p, Math.sin(ang), Math.cos(ang)); a.moving = true; }
        hold(p, 'a', Math.abs(diff) < 0.13 + (1 - p.skill) * 0.1 && t.shieldT <= 0);
      } else {
        const ang = want + a.side * 0.9;
        stick(p, Math.sin(ang), Math.cos(ang));
        hold(p, 'a', 0);
      }
    }
  },

  update(dt) {
    const s = S, ctx = s.ctx;
    s.t += dt;
    s.fx.update(dt);
    const left = Math.max(0, DURATION - s.t);
    ctx.hud.timer(fmtTime(left));

    for (const t of s.tanks) {
      if (!t.alive) {
        t.respawn -= dt;
        if (t.respawn <= 0 && !s.over) {
          const sp = this.spawnPoint(t);
          t.x = sp[0]; t.z = sp[1]; t.h = Math.atan2(-sp[0], -sp[1]);
          t.hp = MAX_HP; t.alive = true; t.inv = 1.8; t.g.visible = true;
          s.fx.ring(t.x, t.z, t.p.color, 4, 0.6);
          this.hud();
        }
        continue;
      }
      const inp = t.p.input;
      t.inv -= dt; t.reload -= dt; t.shieldCd -= dt;

      // di chuyển
      const mag = Math.min(1, Math.hypot(inp.x, inp.y));
      if (mag > 0.15) {
        const want = Math.atan2(inp.x, inp.y);
        const diff = angleDiff(t.h, want);
        t.h += clamp(diff, -9 * dt, 9 * dt);
        const align = Math.max(0, 1 - Math.abs(diff) / 1.4);
        const sp = 9 * mag * (0.25 + 0.75 * align);
        t.x += Math.sin(t.h) * sp * dt;
        t.z += Math.cos(t.h) * sp * dt;
        t.spd = sp;
      } else t.spd = 0;
      // khiên
      if (t.shieldT > 0) t.shieldT -= dt;
      if (inp.b && t.shieldT <= 0 && t.shieldCd <= 0) { t.shieldT = 1.3; t.shieldCd = 5; ctx.sfx.shield(); }
      // bắn
      if (inp.a && t.reload <= 0 && t.shieldT <= 0) {
        t.reload = 0.38;
        const m = new s.THREE.Mesh(s.bulletGeo, s.bulletMat);
        const bx = t.x + Math.sin(t.h) * 2.2, bz = t.z + Math.cos(t.h) * 2.2;
        m.position.set(bx, 1.2, bz);
        s.scene.add(m);
        s.bullets.push({ m, x: bx, z: bz, vx: Math.sin(t.h) * 28, vz: Math.cos(t.h) * 28, life: 1.7, owner: t });
        ctx.sfx.shoot();
        s.fx.burst(bx, 1.2, bz, '#ffe08a', 3, 3);
      }

      // va chạm tường + vật cản
      t.x = clamp(t.x, -HX + TR, HX - TR); t.z = clamp(t.z, -HZ + TR, HZ - TR);
      for (let k = 0; k < 2; k++) {
        const o = this.hitObstacle(t.x, t.z, TR);
        if (!o) break;
        const [ox, oz, w, d] = o;
        const cx = clamp(t.x, ox - w / 2, ox + w / 2), cz = clamp(t.z, oz - d / 2, oz + d / 2);
        let dx = t.x - cx, dz = t.z - cz, dist = Math.hypot(dx, dz);
        if (dist < 1e-6) { dx = t.x - ox; dz = t.z - oz; dist = Math.hypot(dx, dz) || 1; }
        t.x = cx + (dx / dist) * TR; t.z = cz + (dz / dist) * TR;
      }
    }

    // tăng đẩy nhau
    for (let i = 0; i < s.tanks.length; i++) for (let j = i + 1; j < s.tanks.length; j++) {
      const a = s.tanks[i], b = s.tanks[j];
      if (!a.alive || !b.alive) continue;
      let dx = b.x - a.x, dz = b.z - a.z; const d = Math.hypot(dx, dz);
      if (d >= TR * 2 || d === 0) continue;
      dx /= d; dz /= d; const ov = (TR * 2 - d) / 2;
      a.x -= dx * ov; a.z -= dz * ov; b.x += dx * ov; b.z += dz * ov;
    }

    // đạn
    for (let i = s.bullets.length - 1; i >= 0; i--) {
      const b = s.bullets[i];
      b.life -= dt; b.x += b.vx * dt; b.z += b.vz * dt;
      b.m.position.x = b.x; b.m.position.z = b.z;
      let dead = b.life <= 0 || Math.abs(b.x) > HX || Math.abs(b.z) > HZ;
      if (!dead && this.hitObstacle(b.x, b.z, 0.25)) { dead = true; s.fx.burst(b.x, 1.2, b.z, '#c9a574', 6, 5); }
      if (!dead) {
        for (const t of s.tanks) {
          if (!t.alive || t === b.owner || Math.hypot(t.x - b.x, t.z - b.z) > TR + 0.2) continue;
          dead = true;
          if (t.shieldT > 0 || t.inv > 0) { ctx.sfx.ping(); s.fx.ring(t.x, t.z, '#66e0ff', 3, 0.3, 1); break; }
          t.hp--; ctx.sfx.hit(); ctx.vibrate(t.p.id, 80);
          s.fx.burst(b.x, 1.2, b.z, '#ff8a4d', 8, 6);
          if (t.hp <= 0) {
            t.alive = false; t.respawn = 3; t.deaths++; t.g.visible = false;
            if (b.owner) b.owner.kills++;
            ctx.sfx.boom(); ctx.shake(0.7); ctx.vibrate(t.p.id, 300);
            s.fx.burst(t.x, 1, t.z, t.p.color, 24, 10); s.fx.ring(t.x, t.z, '#ffb347', 6, 0.6);
          }
          this.hud();
          break;
        }
      }
      if (dead) { s.scene.remove(b.m); s.bullets.splice(i, 1); }
    }

    // hiển thị
    for (const t of s.tanks) {
      t.g.position.set(t.x, 0, t.z);
      t.g.rotation.y = t.h;
      animateTreads(t.model, t.spd || 0, dt);
      t.shield.visible = t.shieldT > 0;
      t.hpBar.scale.x = Math.max(0.001, t.hp / MAX_HP);
      t.hpBar.material.color.set(t.hp >= 3 ? 0x4dff88 : t.hp === 2 ? 0xffd23f : 0xff5a5a);
      t.hpBar.rotation.y = -t.h;
      t.g.visible = t.alive && (t.inv <= 0 || Math.floor(s.t * 14) % 2 === 0);
    }

    // kết thúc
    if (!s.over && s.t >= DURATION) {
      s.over = true;
      const ranked = [...s.tanks].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      ctx.finish(ranked.map((t) => ({ id: t.p.id, text: `${t.kills} hạ · ${t.deaths} chết` })));
    }
  },

  dispose() {
    if (S) {
      S.fx.dispose();
      S.bulletGeo.dispose(); S.bulletMat.dispose();
      S = null;
    }
  },
};
