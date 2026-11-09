import * as THREE from 'three';
import { clamp, rand, makeFX } from '/js/util.js';
import { std, glow, mesh, T } from '/js/gfx.js';
import { setupScene, lavaPlane, spawnBeans, hudRows } from '/js/party.js';
import { ai } from '/js/bots.js';

const WIN_X = 8;           // kéo cờ tới vạch này là thắng
const ROUND_T = 22;
const NEED = 2;            // thắng 2 hiệp là chung cuộc
const TEAM = [
  { name: 'Đội Xanh', icon: '🔵', color: '#3db2ff', hex: 0x3db2ff },
  { name: 'Đội Đỏ', icon: '🔴', color: '#ff5a6e', hex: 0xff5a6e },
];
let S = null;

export default {
  id: 'tugwar',
  name: 'Kéo Co',
  emoji: '🤼',
  cat: 'team',
  bots: 4,
  color: '#ffb13a',
  tag: '2-8 người · 2 đội · 3 hiệp',
  desc: 'Chia hai đội kéo co. Bấm A và B thật nhanh (luân phiên hai nút còn mạnh hơn!) để kéo cờ về vạch của mình. Đội nào thắng 2 hiệp là vô địch.',
  cfg: { a: 'KÉO', b: 'KÉO', gyro: false, hideStick: true, hint: 'Bấm A và B luân phiên thật nhanh!' },

  init(ctx) {
    const scene = ctx.scene;
    setupScene(ctx, { bg: 0x1a1226, size: 26, cam: [0, 19, 15], look: [0, 0, 0], light: { sun: 2.2, hemi: 0.55, color: 0xffe6c8 } });
    const lava = lavaPlane(scene, -3);
    const floor = mesh(new THREE.BoxGeometry(34, 1, 11), std(0xffffff, { map: T.plate([7, 2], [96, 80, 70]), roughness: 0.6, metalness: 0.25 }), false, true);
    floor.position.y = -0.5; scene.add(floor);
    // vạch thắng hai bên + vạch giữa
    for (const sx of [-1, 1]) {
      const m = mesh(new THREE.BoxGeometry(0.35, 0.06, 10.4), glow(TEAM[sx < 0 ? 0 : 1].hex, 2.4), false);
      m.position.set(sx * WIN_X, 0.04, 0); scene.add(m);
    }
    const mid = mesh(new THREE.BoxGeometry(0.2, 0.05, 10.4), glow(0xffffff, 1.4), false); mid.position.set(0, 0.04, 0); scene.add(mid);

    // sợi dây + cờ
    const rope = new THREE.Group();
    const rm = std(0xd9b27a, { roughness: 0.9 });
    const cable = mesh(new THREE.CylinderGeometry(0.14, 0.14, 30, 10), rm, true); cable.rotation.z = Math.PI / 2; cable.position.y = 1.05;
    const flag = mesh(new THREE.ConeGeometry(0.42, 1.1, 4), glow(0xffd23f, 2.2), false); flag.position.y = 1.9; flag.rotation.y = Math.PI / 4;
    const knot = mesh(new THREE.SphereGeometry(0.3, 12, 10), std(0xffd23f, { roughness: 0.4 }), true); knot.position.y = 1.05;
    rope.add(cable, flag, knot);
    scene.add(rope);

    S = { ctx, fx: makeFX(THREE, scene), lava, rope, flag, t: 0, time: 0, rt: 0, pos: 0, vel: 0, wins: [0, 0], round: 0, phase: 'play', wait: 0, over: false, scene, lastHud: -1 };
    S.ents = spawnBeans(ctx, () => [0, 0], (p, i) => ({ team: i % 2, pow: 0, last: '', pulls: 0, slot: 0 }));
    const idx = [0, 0];
    S.ents.forEach((e) => { e.slot = idx[e.team]++; e.fx = e.team ? -1 : 1; e.fz = 0; e.ang = Math.atan2(e.fx, 0); });
    S.size = idx;
    ctx.hud.title('Kéo Co');
    this.newRound();
  },

  newRound() {
    const s = S;
    s.round++; s.pos = 0; s.vel = 0; s.rt = 0; s.phase = 'play';
    for (const e of s.ents) { e.pow = 0; e.last = ''; }
    s.ctx.hud.banner(`Hiệp ${s.round}!`, 1000, true, '#ffd23f');
    this.hud();
  },

  hud() {
    const s = S;
    s.ctx.hud.title(`Kéo Co · ${TEAM[0].icon} ${s.wins[0]} - ${s.wins[1]} ${TEAM[1].icon}`);
    s.ctx.hud.board(hudRows(s.ents, (e) => `${TEAM[e.team].icon} ${e.pulls}`));
  },

  // bot: bấm đều tay theo kỹ năng (luân phiên A/B)
  think(dt) {
    const s = S;
    for (const e of s.ents) {
      const p = e.p;
      if (!p.bot) continue;
      const a = ai(p);
      if (a.rel.a > 0 && (a.rel.a -= dt) <= 0) p.input.a = 0;
      if (a.rel.b > 0 && (a.rel.b -= dt) <= 0) p.input.b = 0;
      a.t -= dt;
      if (a.t > 0 || s.phase !== 'play') continue;
      a.t = (0.3 - 0.17 * p.skill) * (0.8 + Math.random() * 0.4);
      a.k = a.k ? 0 : 1;
      p.input[a.k ? 'a' : 'b'] = 1; a.rel[a.k ? 'a' : 'b'] = 0.05;
    }
  },

  update(dt) {
    const s = S, ctx = s.ctx;
    s.time += dt; s.fx.update(dt); s.lava.update(dt);

    if (s.phase === 'play' && dt > 0) {
      s.rt += dt;
      // mỗi lần bấm cộng một xung lực; bấm luân phiên A/B mạnh hơn bấm một nút
      for (const e of s.ents) {
        let hit = '';
        if (e.p.press.a) hit = 'a'; else if (e.p.press.b) hit = 'b';
        if (e.p.press.a && e.p.press.b) hit = e.last === 'a' ? 'b' : 'a';
        if (hit) {
          e.pow += hit !== e.last ? 1.15 : 0.7;
          e.last = hit; e.pulls++;
          if (e.pulls % 6 === 0) ctx.vibrate(e.p.id, 15);
        }
        e.pow = Math.max(0, e.pow - dt * 6);
      }
      const force = [0, 0];
      for (let t = 0; t < 2; t++) {
        const members = s.ents.filter((e) => e.team === t);
        force[t] = members.length ? members.reduce((a, e) => a + e.pow, 0) / Math.sqrt(members.length) : 0.7;   // đội trống: máy kéo hộ
      }
      // lực chênh lệch kéo dây về phía đội mạnh hơn (đội 0 kéo sang trái = âm)
      const diff = force[1] - force[0];
      s.vel += (diff * 2.1 - s.vel) * Math.min(1, dt * 3.5);
      s.pos = clamp(s.pos + s.vel * dt, -WIN_X - 1, WIN_X + 1);

      const winner = s.pos <= -WIN_X ? 0 : s.pos >= WIN_X ? 1 : s.rt >= ROUND_T ? (s.pos === 0 ? (Math.random() < 0.5 ? 0 : 1) : s.pos < 0 ? 0 : 1) : -1;
      if (winner >= 0) this.roundEnd(winner);
      ctx.hud.timer(Math.max(0, Math.ceil(ROUND_T - s.rt)) + 's');
    } else if (s.phase === 'wait') {
      s.wait -= dt;
      if (s.wait <= 0 && !s.over) {
        if (s.wins[0] >= NEED || s.wins[1] >= NEED) this.end();
        else this.newRound();
      }
    }

    // hình ảnh: cả hai đội trượt theo dây
    const rx = s.pos;
    s.rope.position.x = rx;
    s.flag.rotation.y += dt * 3;
    for (const e of s.ents) {
      const sign = e.team ? 1 : -1;
      const x = rx + sign * (3.2 + e.slot * 1.7);
      const side = (s.size[e.team] > 5 ? ((e.slot % 2) ? 0.75 : -0.75) : 0);
      e.x = x; e.z = side;
      const g = e.g, u = g.userData;
      const lean = 0.25 + clamp(e.pow, 0, 1.6) * 0.35;
      g.position.set(x, 0, side);
      g.rotation.y = e.team ? -Math.PI / 2 : Math.PI / 2;     // quay mặt về phía dây
      u.body.rotation.x = -lean;
      u.body.position.y = 0.82 + Math.sin(s.time * 20 + e.slot) * 0.04 * Math.min(1, e.pow);
      u.feet[0].position.z = u.feet[1].position.z = 0.05 - lean * 0.6;
      u.feet[0].position.y = u.feet[1].position.y = 0.2;
    }
    if (s.phase === 'play' && Math.abs(s.pos) > 3 && Math.random() < dt * 8) {
      s.fx.burst(rx + (s.pos > 0 ? 1 : -1) * -3, 0.2, 0, '#d9c9a0', 1, 2);
    }
  },

  roundEnd(w) {
    const s = S, ctx = s.ctx;
    s.wins[w]++; s.phase = 'wait'; s.wait = 2.6;
    ctx.sfx.goal(); ctx.shake(0.6);
    for (const e of s.ents) if (e.team === w) { ctx.vibrate(e.p.id, 200); s.fx.burst(e.x, 1.5, e.g.position.z, TEAM[w].color, 14, 8); }
    ctx.hud.banner(`${TEAM[w].icon} ${TEAM[w].name} thắng hiệp!`, 2300, true, TEAM[w].color);
    this.hud();
  },

  end() {
    const s = S;
    if (s.over) return;
    s.over = true;
    const win = s.wins[0] > s.wins[1] ? 0 : s.wins[1] > s.wins[0] ? 1 : 0;
    const rank = [...s.ents].sort((a, b) => (b.team === win) - (a.team === win) || b.pulls - a.pulls);
    s.ctx.finish(rank.map((e) => ({ id: e.p.id, text: `${e.team === win ? 'đội thắng ' : ''}${e.pulls} lần kéo` })));
  },

  dispose() { if (S) { S.fx.dispose(); S = null; } },
};
