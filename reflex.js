import * as THREE from 'three';
import { clamp, rand, makeFX } from '/js/util.js';
import { std, glow, mesh, T } from '/js/gfx.js';
import { setupScene, spawnBeans, hudRows } from '/js/party.js';
import { ai } from '/js/bots.js';

const ROUNDS = 7;
const LOCK = 1.1;          // bấm sớm bị khóa nút trong ngần này giây
const GIVEUP = 3;          // quá lâu không ai bấm thì bỏ qua lượt
let S = null;

export default {
  id: 'reflex',
  name: 'Nhanh Như Chớp',
  emoji: '⚡',
  cat: 'party',
  bots: 4,
  idleOk: true,          // bot chỉ bấm 1 lần mỗi lượt nên hầu như đứng yên
  color: '#ffe14a',
  tag: '1-8 người · 7 lượt',
  desc: 'Đèn ĐỎ thì chờ, đèn chuyển XANH thì bấm A nhanh nhất có thể! Ai bấm đầu tiên được 1 điểm. Bấm sớm khi còn đèn đỏ sẽ bị khóa nút. 7 lượt.',
  cfg: { a: 'BẤM!', b: '', gyro: false, hideStick: true, hint: 'Chờ đèn XANH rồi bấm A thật nhanh. Đừng bấm sớm!' },

  init(ctx) {
    const scene = ctx.scene;
    setupScene(ctx, { bg: 0x0c1020, size: 20, cam: [0, 9.5, 17], look: [0, 2.6, 0], light: { sun: 2.0, hemi: 0.5, color: 0xdfe8ff } });
    const floor = mesh(new THREE.CylinderGeometry(15, 15, 1, 64), std(0xffffff, { map: T.plate(12, [70, 78, 110]), roughness: 0.5, metalness: 0.45 }), false, true);
    floor.position.y = -0.5; scene.add(floor);
    const rim = mesh(new THREE.TorusGeometry(15, 0.2, 10, 96), glow(0xffe14a, 2), false); rim.rotation.x = Math.PI / 2; scene.add(rim);

    // cột đèn tín hiệu lớn
    const pole = mesh(new THREE.CylinderGeometry(0.3, 0.45, 5.2, 14), std(0x3a3f50, { roughness: 0.3, metalness: 0.8 })); pole.position.set(0, 2.6, -4.5);
    const box = mesh(new THREE.BoxGeometry(3.2, 3.2, 1.2), std(0x151824, { roughness: 0.35, metalness: 0.6 })); box.position.set(0, 6.2, -4.5);
    const lampMat = glow(0xff2a2a, 3);
    const lamp = mesh(new THREE.SphereGeometry(1.2, 28, 20), lampMat, false); lamp.position.set(0, 6.2, -3.8);
    const halo = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.8, 40), new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    halo.position.set(0, 6.2, -3.78);
    scene.add(pole, box, lamp, halo);

    S = { ctx, fx: makeFX(THREE, scene), lampMat, lamp, halo, t: 0, time: 0, round: 0, phase: 'intro', pt: 1.2, goAt: 0, goT: 0, over: false, scene, winner: null, msgT: 0 };
    S.ents = spawnBeans(ctx, (i, n) => [(i - (n - 1) / 2) * 2.6, 3.4], () => ({ score: 0, lock: 0, rt: -1, total: 0, best: 9, rounds: 0, fouls: 0 }));
    S.ents.forEach((e) => { e.fx = 0; e.fz = -1; e.ang = Math.PI; });
    ctx.hud.title('Nhanh Như Chớp');
    this.hud();
  },

  hud() {
    const s = S;
    s.ctx.hud.board(hudRows(s.ents, (e) => `${e.score} điểm${e.lock > 0 ? ' 🚫' : ''}`));
  },

  setLamp(color, intensity = 3) {
    const s = S;
    s.lampMat.color.set(color); s.lampMat.emissive.set(color); s.lampMat.emissiveIntensity = intensity;
    s.halo.material.color.set(color);
  },

  startRound() {
    const s = S;
    s.round++; s.phase = 'wait'; s.pt = rand(1.6, 5.2); s.winner = null;
    for (const e of s.ents) { e.lock = 0; e.rt = -1; }
    for (const e of s.ents) { const a = ai(e.p); a.react = null; a.early = null; }
    this.setLamp('#ff2a2a', 2.6);
    s.ctx.hud.banner(`Lượt ${s.round}/${ROUNDS} · chờ đèn xanh…`, 1100, true, '#ff7a8a');
    this.hud();
  },

  // bot: chọn trước thời gian phản xạ (người giỏi nhanh hơn), thỉnh thoảng bấm sớm
  think(dt) {
    const s = S;
    for (const e of s.ents) {
      const p = e.p;
      if (!p.bot) continue;
      const a = ai(p);
      if (a.rel.a > 0 && (a.rel.a -= dt) <= 0) p.input.a = 0;
      if (s.phase === 'wait') {
        if (a.early == null) a.early = Math.random() < (1 - p.skill) * 0.16 ? rand(0.3, Math.max(0.4, s.pt - 0.2)) : -1;
        if (a.early >= 0) { a.early -= dt; if (a.early <= 0 && e.lock <= 0) { p.input.a = 1; a.rel.a = 0.06; a.early = -1; } }
      } else if (s.phase === 'go') {
        if (a.react == null) a.react = 0.2 + (1 - p.skill) * 0.42 + Math.random() * 0.12;
        if (a.react > 0) { a.react -= dt; if (a.react <= 0 && !s.winner && e.lock <= 0) { p.input.a = 1; a.rel.a = 0.06; } }
      }
    }
  },

  update(dt) {
    const s = S, ctx = s.ctx;
    s.time += dt; s.fx.update(dt);
    const pulse = 0.5 + 0.5 * Math.sin(s.time * (s.phase === 'go' ? 22 : 5));
    s.halo.scale.setScalar(1 + pulse * (s.phase === 'go' ? 0.35 : 0.08));

    if (dt > 0) {
      if (s.phase === 'intro') {
        s.pt -= dt;
        if (s.pt <= 0) this.startRound();
      } else if (s.phase === 'wait') {
        s.pt -= dt;
        for (const e of s.ents) {
          e.lock = Math.max(0, e.lock - dt);
          if (e.p.press.a && e.lock <= 0) {            // bấm sớm
            e.lock = LOCK; e.fouls++;
            ctx.sfx.hit(); ctx.vibrate(e.p.id, 200);
            s.fx.burst(e.x, 1.5, e.z, '#ff4d4d', 8, 5);
            this.hud();
          }
        }
        if (s.pt <= 0) {
          s.phase = 'go'; s.goT = 0;
          this.setLamp('#33ff77', 4);
          ctx.sfx.go();
          ctx.hud.banner('BẤM A!!!', 0, false, '#4dff88');
          for (const e of s.ents) ctx.vibrate(e.p.id, 40);
        }
      } else if (s.phase === 'go') {
        s.goT += dt;
        for (const e of s.ents) {
          e.lock = Math.max(0, e.lock - dt);
          if (!s.winner && e.p.press.a && e.lock <= 0) {
            s.winner = e; e.rt = s.goT; e.score++; e.total += s.goT; e.rounds++; e.best = Math.min(e.best, s.goT);
          }
        }
        if (s.winner) {
          const w = s.winner;
          s.phase = 'show'; s.pt = 2.2;
          ctx.sfx.goal(); ctx.shake(0.4); ctx.vibrate(w.p.id, 250);
          s.fx.burst(w.x, 1.5, w.z, w.p.color, 22, 10); s.fx.ring(w.x, w.z, w.p.color, 4, 0.6);
          ctx.hud.banner(`${w.p.name}: ${(w.rt * 1000).toFixed(0)} ms`, 2100, true, w.p.color);
          this.hud();
        } else if (s.goT > GIVEUP) {
          s.phase = 'show'; s.pt = 1.4;
          ctx.hud.banner('Không ai bấm… 😴', 1200, true, '#9aa3d6');
        }
      } else if (s.phase === 'show') {
        s.pt -= dt;
        if (s.pt <= 0 && !s.over) {
          if (s.round >= ROUNDS) this.end(); else this.startRound();
        }
      }
    }
    ctx.hud.timer(`${Math.min(s.round, ROUNDS)}/${ROUNDS}`);

    // hoạt cảnh: người thắng nhảy lên, người bị khóa lắc đầu
    for (const e of s.ents) {
      const u = e.g.userData;
      const win = s.winner === e && s.phase === 'show';
      const hop = win ? Math.abs(Math.sin(s.time * 9)) * 1.1 : 0;
      e.g.position.set(e.x, hop, e.z);
      e.g.rotation.y = Math.PI + (e.lock > 0 ? Math.sin(s.time * 30) * 0.25 : 0);
      u.body.rotation.x = s.phase === 'go' && !s.winner ? 0.22 : 0;      // chồm người chờ bấm
      u.body.position.y = 0.82;
      u.shadow.scale.setScalar(Math.max(0.4, 1 - hop * 0.2));
    }
  },

  end() {
    const s = S;
    if (s.over) return;
    s.over = true;
    s.ctx.hud.hideBanner && s.ctx.hud.hideBanner();
    const avg = (e) => (e.rounds ? e.total / e.rounds : 9);
    const rank = [...s.ents].sort((a, b) => b.score - a.score || avg(a) - avg(b));
    s.ctx.finish(rank.map((e) => ({ id: e.p.id, text: `${e.score} điểm${e.rounds ? ' · nhanh nhất ' + Math.round(e.best * 1000) + ' ms' : ''}` })));
  },

  dispose() { if (S) { S.fx.dispose(); S = null; } },
};
