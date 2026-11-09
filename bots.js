// Tiện ích cho BOT (người chơi máy). Bot cũng là một "player" như điện thoại thật:
// game đọc p.input = {x, y, a, b}. Mỗi game có hàm think(dt) gọi các tiện ích ở đây để điền p.input.
//   p.bot = true, p.skill = 0.3..1 (độ khó), p.ai = bộ nhớ riêng của bot.
import { clamp } from '/js/util.js';

export const LEVELS = { easy: 0.45, mid: 0.72, hard: 0.95 };
export const LEVEL_NAMES = { easy: 'Dễ', mid: 'Vừa', hard: 'Khó' };
export const BOT_NAMES = ['Mia', 'Bông', 'Tí', 'Kiki', 'Gấu', 'Nấm', 'Sóc', 'Bin'];

export const ai = (p) => p.ai || (p.ai = { t: Math.random() * 0.2, rel: { a: 0, b: 0 } });

/**
 * Gọi mỗi frame. Trả về true khi tới lúc bot "suy nghĩ lại".
 * Bot dở phản ứng chậm hơn (khoảng cách giữa các lần quyết định dài hơn).
 */
export function tick(p, dt, base = 0.14) {
  const a = ai(p);
  for (const k of ['a', 'b']) {
    if (a.rel[k] > 0 && (a.rel[k] -= dt) <= 0) p.input[k] = 0;   // nhả nút bấm xung
  }
  a.t -= dt;
  if (a.t > 0) return false;
  a.t = base * (1.75 - p.skill) * (0.75 + Math.random() * 0.5);
  return true;
}

/** Bấm nhanh một nút (tạo cạnh "vừa bấm" cho game). */
export function pulse(p, k = 'a', sec = 0.09) { p.input[k] = 1; ai(p).rel[k] = sec; }
/** Giữ/nhả nút. */
export function hold(p, k, on) { p.input[k] = on ? 1 : 0; ai(p).rel[k] = 0; }

export function stick(p, x, y) {
  const m = Math.hypot(x, y);
  if (m > 1) { x /= m; y /= m; }
  p.input.x = x; p.input.y = y;
}
export function idle(p) { p.input.x = p.input.y = 0; }

/** Đi tới (tx, tz). Trả về khoảng cách còn lại. */
export function toward(p, e, tx, tz, gain = 1, arrive = 0.3) {
  const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz);
  if (d < arrive) stick(p, 0, 0); else stick(p, (dx / d) * gain, (dz / d) * gain);
  return d;
}
/** Chạy ra xa (tx, tz). */
export function away(p, e, tx, tz, gain = 1) {
  const dx = e.x - tx, dz = e.z - tz, d = Math.hypot(dx, dz) || 1;
  stick(p, (dx / d) * gain, (dz / d) * gain);
  return d;
}

/** Phần tử gần nhất trong list (có x, z). Trả về {o, d} hoặc null. */
export function nearest(list, x, z, filter) {
  let best = null, bd = 1e9;
  for (const o of list) {
    if (filter && !filter(o)) continue;
    const d = Math.hypot(o.x - x, o.z - z);
    if (d < bd) { bd = d; best = o; }
  }
  return best ? { o: best, d: bd } : null;
}

/** Sai số ngẫu nhiên: bot dở sai nhiều. */
export const wobble = (p, amt) => (Math.random() - 0.5) * 2 * amt * (1 - p.skill);
/** Xác suất làm đúng: bot giỏi gần như luôn đúng. */
export const chance = (p, base = 1) => Math.random() < clamp(base * (0.35 + p.skill * 0.65), 0, 1);

/** Đoạn thẳng (x1,z1)-(x2,z2) có bị hình chữ nhật [cx, cz, w, d] chắn không (lấy mẫu). */
export function segHitsRect(x1, z1, x2, z2, rects, pad = 0.4) {
  const n = Math.max(2, Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 0.8));
  for (let i = 1; i < n; i++) {
    const x = x1 + ((x2 - x1) * i) / n, z = z1 + ((z2 - z1) * i) / n;
    for (const [cx, cz, w, d] of rects) {
      if (Math.abs(x - cx) < w / 2 + pad && Math.abs(z - cz) < d / 2 + pad) return true;
    }
  }
  return false;
}

/**
 * Tìm đường BFS trên lưới W×H (bốn hướng). Trả về bước đầu tiên [c, r, dist] để đi từ (c0,r0)
 * tới ô gần nhất thỏa goal(c, r), tránh ô blocked(c, r). Trả về null nếu không có đường.
 */
export function bfsStep(W, H, c0, r0, goal, blocked, maxDist = 999) {
  const s = c0 + r0 * W;
  const prev = new Int32Array(W * H).fill(-2), dist = new Int16Array(W * H);
  prev[s] = -1;
  const q = [s];
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi], c = i % W, r = (i / W) | 0;
    if (i !== s && goal(c, r)) {
      let j = i;
      while (prev[j] !== s) j = prev[j];
      return [j % W, (j / W) | 0, dist[i]];
    }
    if (dist[i] >= maxDist) continue;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= W || nr >= H) continue;
      const ni = nc + nr * W;
      if (prev[ni] !== -2 || blocked(nc, nr)) continue;
      prev[ni] = i; dist[ni] = dist[i] + 1; q.push(ni);
    }
  }
  return null;
}
