// Avatar hạt đậu dạng SVG (xem trước trang phục trên điện thoại, bục vinh danh trên PC).
import { cleanLook } from '/js/looks.js';

function shade(hex, k) { // k<1 tối hơn, k>1 sáng hơn
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('');
}
function accentOf(hex) { // màu tương phản nhẹ để làm mũ/áo
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  [r, g, b] = [b, r, g]; // xoay kênh màu
  return shade('#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join(''), 0.95);
}

const HAT = {
  cap: (c, a) => `<path d="M52 80Q100 18 148 80Z" fill="${a}"/><rect x="96" y="70" width="72" height="11" rx="5.5" fill="${shade(a, 0.7)}"/><circle cx="100" cy="34" r="5" fill="${shade(a, 0.7)}"/>`,
  tophat: () => '<rect x="72" y="8" width="56" height="62" rx="4" fill="#1b1b24"/><rect x="72" y="50" width="56" height="10" fill="#d83a3a"/><rect x="52" y="64" width="96" height="11" rx="5.5" fill="#15151c"/>',
  wizard: () => '<polygon points="104,-14 58,74 142,74" fill="#6a3fd8"/><ellipse cx="100" cy="74" rx="62" ry="11" fill="#5230b0"/><circle cx="96" cy="40" r="6" fill="#ffd23f"/><circle cx="116" cy="58" r="4" fill="#ffd23f"/>',
  crown: () => '<polygon points="60,76 60,34 80,56 100,24 120,56 140,34 140,76" fill="#ffd23f" stroke="#b9860a" stroke-width="3"/><circle cx="100" cy="46" r="5" fill="#ff3a5a"/><circle cx="72" cy="62" r="4" fill="#38c8ff"/><circle cx="128" cy="62" r="4" fill="#4dff88"/>',
  cat: (c) => `<polygon points="50,84 54,30 90,66" fill="${c}"/><polygon points="150,84 146,30 110,66" fill="${c}"/><polygon points="60,72 60,44 78,62" fill="#ff9ab8"/><polygon points="140,72 140,44 122,62" fill="#ff9ab8"/>`,
  bunny: (c) => `<ellipse cx="74" cy="22" rx="15" ry="44" transform="rotate(-10 74 22)" fill="${c}"/><ellipse cx="126" cy="22" rx="15" ry="44" transform="rotate(10 126 22)" fill="${c}"/><ellipse cx="74" cy="24" rx="7" ry="32" transform="rotate(-10 74 24)" fill="#ff9ab8"/><ellipse cx="126" cy="24" rx="7" ry="32" transform="rotate(10 126 24)" fill="#ff9ab8"/>`,
  devil: () => '<path d="M60 76Q40 46 68 28Q64 56 82 68Z" fill="#e02a2a"/><path d="M140 76Q160 46 132 28Q136 56 118 68Z" fill="#e02a2a"/>',
  halo: () => '<ellipse cx="100" cy="40" rx="40" ry="10" fill="none" stroke="#ffd23f" stroke-width="8"/><ellipse cx="100" cy="40" rx="40" ry="10" fill="none" stroke="#fff6b0" stroke-width="2.5"/>',
  party: () => '<polygon points="100,-6 68,76 132,76" fill="#ff5fa2"/><polygon points="100,-6 90,30 112,30" fill="#ffd23f"/><polygon points="80,50 122,50 128,64 74,64" fill="#38c8ff" opacity=".9"/><circle cx="100" cy="-6" r="9" fill="#ffd23f"/>',
  chef: () => '<rect x="68" y="36" width="64" height="38" rx="8" fill="#fff"/><circle cx="76" cy="34" r="20" fill="#fff"/><circle cx="100" cy="24" r="24" fill="#fff"/><circle cx="124" cy="34" r="20" fill="#fff"/><rect x="68" y="62" width="64" height="6" fill="#dde"/>',
  cowboy: () => '<ellipse cx="100" cy="72" rx="82" ry="12" fill="#8b5a2b"/><rect x="70" y="30" width="60" height="44" rx="16" fill="#a06a34"/><rect x="70" y="58" width="60" height="9" fill="#5b3a1a"/>',
  prop: () => '<path d="M60 78Q100 28 140 78Z" fill="#38c8ff"/><path d="M100 78Q100 28 140 78Z" fill="#ff5a6e" opacity=".9"/><rect x="97" y="24" width="6" height="24" fill="#555"/><rect x="58" y="20" width="84" height="7" rx="3.5" fill="#ffd23f"/>',
  beanie: (c, a) => `<path d="M54 82Q54 24 100 24Q146 24 146 82Z" fill="${a}"/><path d="M70 82Q70 32 82 28M100 24V82M130 82Q130 32 118 28" stroke="${shade(a, 0.78)}" stroke-width="5" fill="none"/><rect x="50" y="64" width="100" height="20" rx="10" fill="${shade(a, 0.72)}"/><circle cx="100" cy="20" r="13" fill="#fff"/>`,
  pirate: () => '<path d="M36 86Q100 -2 164 86Q100 64 36 86Z" fill="#17171f"/><path d="M36 86Q100 62 164 86" fill="none" stroke="#ffd23f" stroke-width="4"/><circle cx="100" cy="46" r="10" fill="#f4f4f8"/><rect x="95" y="52" width="10" height="6" fill="#f4f4f8"/><circle cx="96" cy="45" r="2.4" fill="#17171f"/><circle cx="104" cy="45" r="2.4" fill="#17171f"/>',
  viking: () => '<path d="M60 80Q60 30 100 30Q140 30 140 80Z" fill="#9aa3b5"/><rect x="56" y="66" width="88" height="12" rx="3" fill="#6d7587"/><path d="M62 62Q30 60 30 22Q48 40 68 46Z" fill="#f3e6c4" stroke="#cdbb92" stroke-width="2"/><path d="M138 62Q170 60 170 22Q152 40 132 46Z" fill="#f3e6c4" stroke="#cdbb92" stroke-width="2"/><rect x="96" y="30" width="8" height="40" fill="#b9c1d2"/>',
  santa: () => '<path d="M56 82Q60 28 112 16Q136 12 150 38Q128 30 136 82Z" fill="#e02a3a"/><rect x="50" y="68" width="100" height="18" rx="9" fill="#fff"/><circle cx="148" cy="38" r="12" fill="#fff"/>',
  hardhat: () => '<path d="M52 82Q52 26 100 26Q148 26 148 82Z" fill="#ffc21a"/><rect x="92" y="22" width="16" height="60" fill="#e6a800"/><rect x="42" y="72" width="116" height="12" rx="6" fill="#e6a800"/><circle cx="100" cy="54" r="8" fill="#fff8d6" stroke="#b78500" stroke-width="2"/>',
  grad: () => '<rect x="68" y="56" width="64" height="26" rx="6" fill="#1d2230"/><polygon points="100,24 172,52 100,78 28,52" fill="#262c40"/><polygon points="100,24 172,52 100,78 28,52" fill="none" stroke="#3a4260" stroke-width="3"/><path d="M160 56V104" stroke="#ffd23f" stroke-width="4"/><circle cx="160" cy="108" r="7" fill="#ffd23f"/><circle cx="100" cy="52" r="5" fill="#ffd23f"/>',
  flower: () => { const cols = ['#ff7ab8', '#ffd23f', '#ffffff', '#ff9a5a', '#c77dff', '#ff7ab8', '#ffd23f']; const pts = [[54, 84], [62, 62], [80, 48], [100, 44], [120, 48], [138, 62], [146, 84]]; return '<path d="M50 88Q60 40 100 38Q140 40 150 88" fill="none" stroke="#3fae4a" stroke-width="7"/>' + pts.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="11" fill="${cols[i]}" stroke="rgba(0,0,0,.18)" stroke-width="2"/><circle cx="${x}" cy="${y}" r="4" fill="${i % 2 ? '#ff7ab8' : '#ffd23f'}"/>`).join(''); },
  unicorn: () => '<polygon points="100,-22 88,56 112,56" fill="#ffe38a" stroke="#d9a62e" stroke-width="2"/><path d="M92 36L108 28M90 20L106 12M94 4L103 0" stroke="#d9a62e" stroke-width="3"/><polygon points="60,76 56,40 84,62" fill="#fff"/><polygon points="140,76 144,40 116,62" fill="#fff"/><polygon points="64,70 62,50 78,62" fill="#ff9ab8"/><polygon points="136,70 138,50 122,62" fill="#ff9ab8"/><path d="M52 80Q74 64 100 66Q126 64 148 80" fill="none" stroke="#c77dff" stroke-width="8" stroke-linecap="round"/><path d="M58 88Q76 74 100 76Q124 74 142 88" fill="none" stroke="#38c8ff" stroke-width="6" stroke-linecap="round"/>',
  alien: () => '<path d="M84 66L68 22M116 66L132 22" stroke="#2a2d3a" stroke-width="5" stroke-linecap="round"/><circle cx="66" cy="18" r="9" fill="#5dff8a"/><circle cx="134" cy="18" r="9" fill="#5dff8a"/><circle cx="63" cy="15" r="3" fill="#fff" opacity=".7"/><circle cx="131" cy="15" r="3" fill="#fff" opacity=".7"/>',
  duck: () => '<ellipse cx="100" cy="58" rx="34" ry="19" fill="#ffd23f"/><circle cx="124" cy="34" r="16" fill="#ffd23f"/><polygon points="136,32 154,38 136,44" fill="#ff8a1c"/><circle cx="127" cy="30" r="3" fill="#17171f"/><path d="M76 56Q90 44 100 58" fill="none" stroke="#e6b400" stroke-width="3"/>',
  phones: () => '<path d="M52 100Q52 28 100 28Q148 28 148 100" fill="none" stroke="#2a2d3a" stroke-width="9" stroke-linecap="round"/><rect x="36" y="94" width="20" height="40" rx="10" fill="#e8445a"/><rect x="144" y="94" width="20" height="40" rx="10" fill="#e8445a"/>',
};
const FACE = {
  glasses: () => '<circle cx="80" cy="116" r="18" fill="rgba(255,255,255,.18)" stroke="#23242c" stroke-width="4"/><circle cx="120" cy="116" r="18" fill="rgba(255,255,255,.18)" stroke="#23242c" stroke-width="4"/><path d="M98 114h4" stroke="#23242c" stroke-width="4"/>',
  shades: () => '<rect x="58" y="102" width="40" height="26" rx="9" fill="#101116"/><rect x="102" y="102" width="40" height="26" rx="9" fill="#101116"/><rect x="96" y="108" width="8" height="4" fill="#101116"/><rect x="64" y="106" width="14" height="4" rx="2" fill="rgba(255,255,255,.35)"/>',
  stache: () => '<path d="M68 146Q84 128 100 142Q116 128 132 146Q116 156 100 149Q84 156 68 146Z" fill="#4a2c18"/>',
  blush: () => '<ellipse cx="62" cy="140" rx="13" ry="8" fill="#ff7aa5" opacity=".65"/><ellipse cx="138" cy="140" rx="13" ry="8" fill="#ff7aa5" opacity=".65"/>',
  nose: () => '<circle cx="100" cy="136" r="12" fill="#e8333f"/><circle cx="96" cy="132" r="4" fill="rgba(255,255,255,.55)"/>',
  patch: () => '<path d="M46 98L154 128" stroke="#16161c" stroke-width="5"/><circle cx="80" cy="116" r="18" fill="#16161c"/>',
  mask: () => '<path d="M60 134Q100 124 140 134V162Q100 180 60 162Z" fill="#d6ecff" stroke="#9cc4e8" stroke-width="3"/><path d="M60 142H140M60 152H140" stroke="#9cc4e8" stroke-width="2"/>',
};
const star = (cx, cy, k) => `<polygon transform="translate(${cx} ${cy}) scale(${k})" points="0,-20 5,-7 19,-6 8,3 12,17 0,9 -12,17 -8,3 -19,-6 -5,-7" fill="#ffd23f" stroke="#b9860a" stroke-width="2"/>`;
const heart = (cx, cy, k) => `<path transform="translate(${cx} ${cy}) scale(${k})" d="M0 16C-26 -2 -18 -20 -8 -18C-4 -17 0 -12 0 -8C0 -12 4 -17 8 -18C18 -20 26 -2 0 16Z" fill="#ff4d7a" stroke="#9c1f45" stroke-width="2.5"/>`;
Object.assign(FACE, {
  monocle: () => '<circle cx="120" cy="116" r="21" fill="rgba(255,255,255,.2)" stroke="#e0b030" stroke-width="4"/><path d="M139 128Q154 168 142 204" fill="none" stroke="#e0b030" stroke-width="2.5"/>',
  vr: () => '<path d="M46 118H154" stroke="#2a2f45" stroke-width="8"/><rect x="52" y="98" width="96" height="40" rx="15" fill="#2a2f45" stroke="#14172a" stroke-width="3"/><rect x="60" y="108" width="80" height="14" rx="7" fill="#38c8ff" opacity=".9"/><rect x="66" y="111" width="30" height="4" rx="2" fill="#fff" opacity=".6"/>',
  heart: () => heart(80, 114, 0.95) + heart(120, 114, 0.95) + '<path d="M98 112h4" stroke="#9c1f45" stroke-width="4"/>',
  star: () => star(80, 116, 1.05) + star(120, 116, 1.05) + '<path d="M98 114h4" stroke="#b9860a" stroke-width="4"/>',
  beard: () => '<path d="M52 128Q54 196 100 206Q146 196 148 128Q128 160 100 154Q72 160 52 128Z" fill="#5a3a22"/><path d="M80 164Q100 174 120 164" fill="none" stroke="#3b2414" stroke-width="3"/>',
  whisker: () => '<circle cx="100" cy="134" r="5" fill="#ff7aa5"/><path d="M52 136L84 140M50 148L84 146M54 160L86 152M148 136L116 140M150 148L116 146M146 160L114 152" stroke="#2c2c36" stroke-width="2.6" stroke-linecap="round"/>',
  freckle: () => '<g fill="#a8582c" opacity=".85"><circle cx="64" cy="140" r="2.6"/><circle cx="74" cy="146" r="2.6"/><circle cx="80" cy="138" r="2.6"/><circle cx="60" cy="150" r="2.4"/><circle cx="136" cy="140" r="2.6"/><circle cx="126" cy="146" r="2.6"/><circle cx="120" cy="138" r="2.6"/><circle cx="140" cy="150" r="2.4"/></g>',
  bandage: () => '<g transform="rotate(-24 128 142)"><rect x="106" y="134" width="46" height="16" rx="8" fill="#f2cfa0" stroke="#d3a773" stroke-width="2"/><circle cx="123" cy="142" r="1.8" fill="#d3a773"/><circle cx="129" cy="142" r="1.8" fill="#d3a773"/><circle cx="135" cy="142" r="1.8" fill="#d3a773"/></g>',
});
const BODY_BACK = {
  cape: (c, a) => `<path d="M44 104L16 218H184L156 104Z" fill="${a}"/><path d="M44 104L16 218H60Z" fill="${shade(a, 0.78)}"/>`,
  pack: (c, a) => `<rect x="26" y="118" width="30" height="66" rx="10" fill="${a}"/><rect x="30" y="140" width="22" height="16" rx="5" fill="${shade(a, 0.75)}"/>`,
  wings: () => '<ellipse cx="26" cy="124" rx="28" ry="50" transform="rotate(-18 26 124)" fill="#f4f7ff" stroke="#cfd8f5" stroke-width="3"/><ellipse cx="174" cy="124" rx="28" ry="50" transform="rotate(18 174 124)" fill="#f4f7ff" stroke="#cfd8f5" stroke-width="3"/>',
};
Object.assign(BODY_BACK, {
  tail: () => '<path d="M140 206Q196 214 184 150Q176 120 160 132Q176 156 160 184Z" fill="#ff8a3c"/><path d="M184 150Q176 120 160 132Q168 140 170 150Z" fill="#fff"/>',
  shell: () => '<ellipse cx="100" cy="150" rx="68" ry="72" fill="#4f8a3a" stroke="#356128" stroke-width="4"/><path d="M60 120L100 100L140 120L140 168L100 190L60 168Z" fill="none" stroke="#356128" stroke-width="3"/>',
  jetpack: () => '<rect x="22" y="112" width="26" height="76" rx="12" fill="#b9c1d2" stroke="#7d8598" stroke-width="3"/><rect x="152" y="112" width="26" height="76" rx="12" fill="#b9c1d2" stroke="#7d8598" stroke-width="3"/><rect x="22" y="126" width="26" height="9" fill="#e8333f"/><rect x="152" y="126" width="26" height="9" fill="#e8333f"/><polygon points="26,190 44,190 35,226" fill="#ff9a1c"/><polygon points="156,190 174,190 165,226" fill="#ff9a1c"/><polygon points="30,190 40,190 35,212" fill="#fff2a0"/><polygon points="160,190 170,190 165,212" fill="#fff2a0"/>',
});
const BODY_FRONT = {
  scarf: (c, a) => `<rect x="48" y="150" width="104" height="18" rx="9" fill="${a}"/><rect x="118" y="160" width="16" height="40" rx="7" fill="${shade(a, 0.85)}"/><path d="M60 156h12M84 156h12M108 156h12" stroke="rgba(255,255,255,.4)" stroke-width="3"/>`,
  bow: () => '<polygon points="100,172 70,154 70,190" fill="#e8333f"/><polygon points="100,172 130,154 130,190" fill="#e8333f"/><circle cx="100" cy="172" r="9" fill="#b3202c"/>',
  tie: () => '<polygon points="90,152 110,152 104,162 96,162" fill="#d92b3a"/><polygon points="96,162 104,162 114,196 100,212 86,196" fill="#e8333f"/><path d="M96 170L104 200" stroke="#a81f2c" stroke-width="3"/>',
  lei: (c, a) => { const cols = ['#ff7ab8', '#ffd23f', '#ff9a5a', '#c77dff', '#ff7ab8']; return '<path d="M52 150Q100 190 148 150" fill="none" stroke="#3fae4a" stroke-width="7"/>' + [[56, 154], [68, 168], [84, 176], [100, 180], [116, 176], [132, 168], [144, 154]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="9" fill="${cols[i % 5]}" stroke="rgba(0,0,0,.2)" stroke-width="2"/><circle cx="${x}" cy="${y}" r="3" fill="#fff" opacity=".8"/>`).join(''); },
  tutu: () => '<path d="M50 196Q100 172 150 196L168 226Q100 242 32 226Z" fill="#ff8fd0" stroke="#d65aa8" stroke-width="3"/><path d="M60 204Q100 188 140 204M54 214Q100 200 146 214" fill="none" stroke="#ffc4ea" stroke-width="3"/>',
  jersey: (c, a) => `<path d="M46 156H154V210Q100 226 46 210Z" fill="${a}"/><rect x="46" y="156" width="108" height="9" fill="#fff"/><path d="M46 210Q100 226 154 210" fill="none" stroke="#fff" stroke-width="5"/><text x="100" y="204" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="36" fill="#fff">1</text>`,
  float: () => '<ellipse cx="100" cy="188" rx="64" ry="20" fill="none" stroke="#ff5a6e" stroke-width="18"/><path d="M42 184Q44 176 52 172M148 172Q156 176 158 184M84 206L88 198M112 206L116 198" stroke="#fff" stroke-width="9" stroke-linecap="round" fill="none"/><ellipse cx="100" cy="188" rx="64" ry="20" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="3" transform="translate(0 -6)"/>',
  medal: () => '<path d="M84 150L100 184L116 150" fill="none" stroke="#e8333f" stroke-width="6"/><circle cx="100" cy="190" r="14" fill="#ffd23f" stroke="#b9860a" stroke-width="3"/><path d="M100 182l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" fill="#b9860a"/>',
};

/** Trả về chuỗi SVG. opts.crop: chỉ lấy phần đầu (dùng cho ảnh đại diện nhỏ). */
export function avatarSVG(look, color, opts = {}) {
  const L = cleanLook(look);
  const c = /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#7c8cff';
  const a = accentOf(c);
  const id = 'g' + Math.random().toString(36).slice(2, 7);
  const finish = L.finish;
  const fill = finish === 'metal' ? `url(#${id}m)` : `url(#${id})`;
  const glow = finish === 'neon' ? `filter="url(#${id}n)"` : '';
  const view = opts.crop ? '34 8 132 150' : '0 -20 200 262';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}" class="avsvg" aria-hidden="true">
  <defs>
    <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(c, 1.25)}"/><stop offset="0.55" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, 0.66)}"/></linearGradient>
    <linearGradient id="${id}m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f4f8"/><stop offset="0.3" stop-color="${shade(c, 1.1)}"/><stop offset="0.6" stop-color="${shade(c, 0.55)}"/><stop offset="1" stop-color="${shade(c, 1.2)}"/></linearGradient>
    <filter id="${id}n" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  ${BODY_BACK[L.body] ? BODY_BACK[L.body](c, a) : ''}
  <ellipse cx="100" cy="232" rx="52" ry="8" fill="rgba(0,0,0,.28)"/>
  <ellipse cx="76" cy="220" rx="22" ry="13" fill="${shade(c, 0.55)}"/><ellipse cx="124" cy="220" rx="22" ry="13" fill="${shade(c, 0.55)}"/>
  <rect x="46" y="64" width="108" height="156" rx="54" fill="${fill}" ${glow}/>
  ${finish === 'matte' ? '' : `<ellipse cx="74" cy="92" rx="15" ry="26" transform="rotate(18 74 92)" fill="rgba(255,255,255,${finish === 'metal' ? 0.5 : 0.34})"/>`}
  <ellipse cx="80" cy="116" rx="15" ry="17" fill="#fff"/><ellipse cx="120" cy="116" rx="15" ry="17" fill="#fff"/>
  <circle cx="83" cy="119" r="8" fill="#12131c"/><circle cx="123" cy="119" r="8" fill="#12131c"/>
  <circle cx="86" cy="115" r="2.6" fill="#fff"/><circle cx="126" cy="115" r="2.6" fill="#fff"/>
  ${FACE[L.face] ? FACE[L.face]() : ''}
  ${BODY_FRONT[L.body] ? BODY_FRONT[L.body](c, a) : ''}
  ${HAT[L.hat] ? HAT[L.hat](c, a) : ''}
</svg>`;
}
