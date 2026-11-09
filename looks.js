// Danh sách trang phục dùng chung cho điện thoại (xem trước), PC (3D) và bot.
// Mỗi mục: [id, emoji, nhãn]
export const HATS = [
  ['none', '🚫', 'Không'], ['cap', '🧢', 'Lưỡi trai'], ['tophat', '🎩', 'Mũ chóp'], ['wizard', '🧙', 'Phù thủy'],
  ['crown', '👑', 'Vương miện'], ['cat', '🐱', 'Tai mèo'], ['bunny', '🐰', 'Tai thỏ'], ['devil', '😈', 'Sừng quỷ'],
  ['halo', '😇', 'Vòng sáng'], ['party', '🎉', 'Mũ tiệc'], ['chef', '👨‍🍳', 'Đầu bếp'], ['cowboy', '🤠', 'Cao bồi'],
  ['prop', '🚁', 'Chong chóng'], ['phones', '🎧', 'Tai nghe'],
  ['beanie', '🧶', 'Mũ len'], ['pirate', '☠️', 'Hải tặc'], ['viking', '⚔️', 'Viking'], ['santa', '🎅', 'Ông già Noel'],
  ['hardhat', '👷', 'Mũ công trường'], ['grad', '🎓', 'Cử nhân'], ['flower', '🌸', 'Vòng hoa'], ['unicorn', '🦄', 'Kỳ lân'],
  ['alien', '👽', 'Ăng-ten'], ['duck', '🦆', 'Vịt con'],
];
export const FACES = [
  ['none', '🚫', 'Không'], ['glasses', '👓', 'Kính tròn'], ['shades', '🕶️', 'Kính râm'], ['stache', '👨', 'Ria mép'],
  ['blush', '😊', 'Má hồng'], ['nose', '🤡', 'Mũi hề'], ['patch', '🏴‍☠️', 'Bịt mắt'], ['mask', '😷', 'Khẩu trang'],
  ['monocle', '🧐', 'Kính một mắt'], ['vr', '🥽', 'Kính VR'], ['heart', '😍', 'Kính tim'], ['star', '🤩', 'Kính sao'],
  ['beard', '🧔', 'Râu dài'], ['whisker', '😺', 'Râu mèo'], ['freckle', '🙂', 'Tàn nhang'], ['bandage', '🤕', 'Băng dán'],
];
export const BODIES = [
  ['none', '🚫', 'Không'], ['cape', '🦸', 'Áo choàng'], ['scarf', '🧣', 'Khăn len'], ['bow', '🎀', 'Nơ'],
  ['pack', '🎒', 'Ba lô'], ['wings', '🕊️', 'Cánh'], ['medal', '🏅', 'Huy chương'],
  ['tie', '👔', 'Cà vạt'], ['lei', '🌺', 'Vòng hoa cổ'], ['tutu', '👗', 'Váy xòe'], ['jersey', '🎽', 'Áo đấu'],
  ['tail', '🦊', 'Đuôi cáo'], ['shell', '🐢', 'Mai rùa'], ['jetpack', '🚀', 'Jetpack'], ['float', '🏊', 'Phao bơi'],
];
export const FINISHES = [['gloss', '✨', 'Bóng'], ['matte', '🧸', 'Mờ'], ['metal', '⚙️', 'Kim loại'], ['neon', '💡', 'Neon']];
export const COLORS = ['#ff4d4d', '#3db2ff', '#ffd23f', '#4dff88', '#c77dff', '#ff9f1c', '#2ee6d6', '#ff6fb5', '#8a6cff', '#a0e32f', '#ff7a59', '#e8e8ff'];

const ids = (list) => list.map((x) => x[0]);
const pick = (list, v, d) => (ids(list).includes(v) ? v : d);

/** Chuẩn hóa một look bất kỳ (từ mạng/localStorage) thành look hợp lệ. */
export function cleanLook(l) {
  l = l && typeof l === 'object' ? l : {};
  return {
    hat: pick(HATS, l.hat, 'none'),
    face: pick(FACES, l.face, 'none'),
    body: pick(BODIES, l.body, 'none'),
    finish: pick(FINISHES, l.finish, 'gloss'),
    color: /^#[0-9a-f]{6}$/i.test(l.color || '') ? l.color.toLowerCase() : '',
  };
}
export const sameLook = (a, b) => JSON.stringify(cleanLook(a)) === JSON.stringify(cleanLook(b));

/** Look ngẫu nhiên cho bot. */
export function randomLook(color = '', r = Math.random) {
  const one = (list, none = 0.3) => (r() < none ? 'none' : list[1 + Math.floor(r() * (list.length - 1))][0]);
  return { hat: one(HATS, 0.15), face: one(FACES, 0.4), body: one(BODIES, 0.5), finish: ['gloss', 'gloss', 'matte', 'metal', 'neon'][Math.floor(r() * 5)], color };
}
