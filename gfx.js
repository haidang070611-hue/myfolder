// Đồ họa dùng chung: renderer PBR + tone mapping, môi trường phản chiếu, bloom, texture thủ tục, bầu trời.
import * as THREE from 'three';

export const ADDONS = {};
const state = { grade: null, renderer: null, composer: null, bloom: null, renderPass: null, env: null, level: 'high', aniso: 4, slow: 0, fast: 0, lastDrop: 0 };
export const gfx = state;

const LEVELS = {
  high: { dpr: 2, post: true },
  med: { dpr: 1.5, post: false },
  low: { dpr: 1, post: false },
};
const ORDER = ['high', 'med', 'low'];

export async function createGfx(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  state.renderer = renderer;
  state.aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  // các module bổ trợ nạp riêng: lỡ thiếu cái nào thì vẫn chạy được với đồ họa cơ bản
  const tryImport = async (path, pick) => { try { const m = await import(path); return pick(m); } catch (e) { console.warn('Không nạp được', path, e && e.message); return null; } };
  const [EffectComposer, RenderPass, UnrealBloomPass, OutputPass, RoomEnvironment, RoundedBoxGeometry, ShaderPass] = await Promise.all([
    tryImport('three/addons/postprocessing/EffectComposer.js', (m) => m.EffectComposer),
    tryImport('three/addons/postprocessing/RenderPass.js', (m) => m.RenderPass),
    tryImport('three/addons/postprocessing/UnrealBloomPass.js', (m) => m.UnrealBloomPass),
    tryImport('three/addons/postprocessing/OutputPass.js', (m) => m.OutputPass),
    tryImport('three/addons/environments/RoomEnvironment.js', (m) => m.RoomEnvironment),
    tryImport('three/addons/geometries/RoundedBoxGeometry.js', (m) => m.RoundedBoxGeometry),
    tryImport('three/addons/postprocessing/ShaderPass.js', (m) => m.ShaderPass),
  ]);
  ADDONS.RoundedBoxGeometry = RoundedBoxGeometry;

  if (RoomEnvironment) {
    try {
      const pm = new THREE.PMREMGenerator(renderer);
      state.env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      pm.dispose();
    } catch (e) { console.warn('Không tạo được môi trường phản chiếu', e); }
  }
  if (EffectComposer && RenderPass && UnrealBloomPass && OutputPass) {
    try {
      const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
      const composer = new EffectComposer(renderer, rt);
      state.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
      state.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.55, 0.92);
      composer.addPass(state.renderPass);
      composer.addPass(state.bloom);
      composer.addPass(new OutputPass());
      if (ShaderPass) {
        // chỉnh màu điện ảnh: vignette, tăng nhẹ sắc độ/tương phản, lệch màu ở mép, hạt phim
        const grade = new ShaderPass({
          uniforms: { tDiffuse: { value: null }, time: { value: 0 }, vig: { value: 0.34 }, sat: { value: 1.12 }, con: { value: 1.07 }, grain: { value: 0.022 } },
          vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
          fragmentShader: `uniform sampler2D tDiffuse; uniform float time; uniform float vig; uniform float sat; uniform float con; uniform float grain; varying vec2 vUv;
            float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
            void main(){
              vec2 d = vUv - 0.5; float ca = dot(d, d) * 0.0045;
              vec3 c = vec3(texture2D(tDiffuse, vUv + d * ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - d * ca).b);
              float l = dot(c, vec3(0.299, 0.587, 0.114));
              c = mix(vec3(l), c, sat); c = (c - 0.5) * con + 0.5;
              c *= 1.0 - vig * smoothstep(0.32, 0.95, length(d) * 1.25);
              c += (h(vUv * vec2(1920.0, 1080.0) + time) - 0.5) * grain;
              gl_FragColor = vec4(c, 1.0);
            }`,
        });
        composer.addPass(grade);
        state.grade = grade;
      }
      state.composer = composer;
    } catch (e) { console.warn('Không bật được hậu kỳ (bloom)', e); state.composer = null; }
  }
  if (!state.composer) state.level = 'med';
  try { const s = localStorage.getItem('pp_quality'); if (s && LEVELS[s] && (s !== 'high' || state.composer)) state.level = s; } catch (e) { /* ignore */ }
  window.__shadowSize = state.level === 'high' ? 2048 : 1024;
  return state;
}

export function resizeGfx(w, h) {
  const r = state.renderer;
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, LEVELS[state.level].dpr));
  r.setSize(w, h, false);
  if (state.composer) {
    state.composer.setPixelRatio(r.getPixelRatio());
    state.composer.setSize(w, h);
  }
}

export function setQuality(level, w, h) {
  state.level = level;
  window.__shadowSize = level === 'high' ? 2048 : 1024;
  try { localStorage.setItem('pp_quality', level); } catch (e) { /* ignore */ }
  resizeGfx(w, h);
}
export function cycleQuality(w, h) {
  const list = state.composer ? ORDER : ORDER.slice(1);
  setQuality(list[(list.indexOf(state.level) + 1) % list.length], w, h);
  return state.level;
}

export function prepScene(scene, envIntensity = 1) {
  if (state.env) scene.environment = state.env;
  scene.userData.envI = envIntensity;
}

export function render(scene, camera, dt) {
  if (state.composer && LEVELS[state.level].post) {
    state.renderPass.scene = scene;
    state.renderPass.camera = camera;
    if (state.grade) state.grade.uniforms.time.value = (performance.now() * 0.001) % 100;
    state.composer.render(dt);
  } else {
    state.renderer.setRenderTarget(null);
    state.renderer.render(scene, camera);
  }
  // đo tốc độ: nếu máy yếu thì tự hạ chất lượng
  if (dt > 0) {
    if (dt > 1 / 28) state.slow += dt; else state.fast += dt;
    if (state.slow + state.fast > 4) {
      const bad = state.slow > state.fast * 1.4;
      state.slow = state.fast = 0;
      if (bad && state.level !== 'low') return 'down';
    }
  }
  return null;
}

/* ---------- vật liệu ---------- */
export function std(color, opt = {}) {
  return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.6, metalness: 0.0, envMapIntensity: 0.5 }, opt));
}
export function paint(color, opt = {}) {
  return new THREE.MeshPhysicalMaterial(Object.assign({ color, roughness: 0.28, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.2 }, opt));
}
export function glow(color, intensity = 2.5, opt = {}) {
  return new THREE.MeshStandardMaterial(Object.assign({ color: 0x111111, emissive: color, emissiveIntensity: intensity, roughness: 0.4 }, opt));
}
export function rbox(w, h, d, r = 0.1, seg = 3) {
  const RB = ADDONS.RoundedBoxGeometry;
  return RB ? new RB(w, h, d, seg, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)) : new THREE.BoxGeometry(w, h, d);
}
export function mesh(geo, mat, cast = true, receive = false) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast; m.receiveShadow = receive;
  return m;
}

/* ---------- texture thủ tục (vẽ bằng canvas, không cần file ảnh) ---------- */
const cache = new Map();
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const c8 = (v) => Math.max(0, Math.min(255, v));

function canvasTex(key, w, h, repeat, draw, srgb = true) {
  const k = key + '|' + repeat;
  if (cache.has(k)) return cache.get(k);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h, rng(key.length * 977 + w));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const rp = Array.isArray(repeat) ? repeat : [repeat, repeat];
  t.repeat.set(rp[0], rp[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = state.aniso;
  cache.set(k, t);
  return t;
}

function noiseFill(g, w, h, [r, gg, b], amp, rnd) {
  const id = g.createImageData(w, h), d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amp;
    d[i] = c8(r + n); d[i + 1] = c8(gg + n); d[i + 2] = c8(b + n); d[i + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  for (let k = 0; k < 46; k++) { // mảng sáng/tối lớn cho đỡ lặp
    const x = rnd() * w, y = rnd() * h, rad = 24 + rnd() * 90, a = (rnd() - 0.5) * 0.16;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const col = a > 0 ? '255,255,255' : '0,0,0';
    gr.addColorStop(0, `rgba(${col},${Math.abs(a)})`); gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}

export const T = {
  asphalt: (rep = 8) => canvasTex('asphalt', 512, 512, rep, (g, w, h, rnd) => {
    noiseFill(g, w, h, [52, 54, 62], 46, rnd);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '0,0,0'},${0.1 + rnd() * 0.22})`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2); }
  }),
  grass: (rep = 30) => canvasTex('grass', 512, 512, rep, (g, w, h, rnd) => {
    noiseFill(g, w, h, [52, 120, 58], 40, rnd);
    for (let i = 0; i < 5000; i++) {
      g.strokeStyle = `rgba(${rnd() > 0.5 ? '120,200,90' : '20,70,30'},${0.25 + rnd() * 0.3})`;
      g.lineWidth = 1; g.beginPath(); const x = rnd() * w, y = rnd() * h; g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 4, y - 3 - rnd() * 6); g.stroke();
    }
  }),
  plate: (rep = 10, base = [66, 72, 100]) => canvasTex('plate' + base, 512, 512, rep, (g, w, h, rnd) => {
    noiseFill(g, w, h, base, 22, rnd);
    g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, w - 3, h - 3); g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 2; g.strokeRect(5, 5, w - 10, h - 10);
    for (const [x, y] of [[18, 18], [w - 18, 18], [18, h - 18], [w - 18, h - 18], [w / 2 + 16, h / 2 + 16], [w / 2 - 16, h / 2 - 16]]) {
      g.fillStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.arc(x + 1, y + 1.5, 5, 0, 7); g.fill();
      g.fillStyle = 'rgba(210,220,255,.55)'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
    }
    for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(255,255,255,${0.04 + rnd() * 0.08})`; g.beginPath(); const x = rnd() * w, y = rnd() * h; g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 120, y + (rnd() - 0.5) * 8); g.stroke(); }
  }),
  noise: (key, base, amp = 30, rep = 4) => canvasTex('n' + key + base, 256, 256, rep, (g, w, h, rnd) => noiseFill(g, w, h, base, amp, rnd)),
  stripes: (rep = [1, 1], c1 = [64, 150, 70], n = 8) => canvasTex('stripes' + c1 + n, 512, 512, rep, (g, w, h, rnd) => {
    noiseFill(g, w, h, c1, 30, rnd);
    for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${rnd() > 0.5 ? '170,235,140' : '10,60,20'},.25)`; g.fillRect(rnd() * w, rnd() * h, 1, 3 + rnd() * 3); }
    g.fillStyle = 'rgba(0,30,0,.16)'; // sọc cỏ cắt xen kẽ
    for (let i = 0; i < n; i += 2) g.fillRect(i * (w / n), 0, w / n, h);
  }),
  kerb: (rep = 40) => canvasTex('kerb', 128, 32, [rep, 1], (g, w, h) => {
    for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#f4f4f4' : '#d8232a'; g.fillRect(i * w / 4, 0, w / 4, h); }
  }),
  treads: () => { // mỗi xe tăng dùng bản riêng vì offset được animate
    const c = document.createElement('canvas'); c.width = 64; c.height = 128;
    const g = c.getContext('2d'); g.fillStyle = '#22252e'; g.fillRect(0, 0, 64, 128);
    for (let i = 0; i < 8; i++) { g.fillStyle = '#3a3f4d'; g.fillRect(4, i * 16 + 2, 56, 10); g.fillStyle = '#11131a'; g.fillRect(4, i * 16 + 12, 56, 3); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(1, 3); t.anisotropy = state.aniso; t.userData.own = true;
    return t;
  },
  lava: () => canvasTex('lava', 512, 512, [24, 24], (g, w, h, rnd) => {
    g.fillStyle = '#3a0c04'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const x = rnd() * w, y = rnd() * h, r = 20 + rnd() * 70;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,200,60,.95)'); gr.addColorStop(0.5, 'rgba(255,90,20,.6)'); gr.addColorStop(1, 'rgba(120,20,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }),
  grid: (rep = 40, line = 'rgba(110,130,255,.55)') => canvasTex('grid' + line, 256, 256, rep, (g, w, h) => {
    g.fillStyle = '#0d1022'; g.fillRect(0, 0, w, h);
    g.strokeStyle = line; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
    g.strokeStyle = 'rgba(110,130,255,.12)'; g.lineWidth = 1;
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(i * w / 4, 0); g.lineTo(i * w / 4, h); g.moveTo(0, i * h / 4); g.lineTo(w, i * h / 4); g.stroke(); }
  }),
};

/* ---------- bầu trời ---------- */
export function skyDome(top = 0x4a8ff0, horizon = 0xcfe6ff, ground = 0x889099, sun = [0.5, 0.45, 0.6], sunColor = 0xfff0cc) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(top) }, horizon: { value: new THREE.Color(horizon) }, ground: { value: new THREE.Color(ground) },
      sunDir: { value: new THREE.Vector3(...sun).normalize() }, sunCol: { value: new THREE.Color(sunColor) },
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vDir; uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; uniform vec3 sunDir; uniform vec3 sunCol;
      void main(){
        float h = vDir.y;
        vec3 c = mix(horizon, top, smoothstep(0.0, 0.75, h));
        c = mix(c, ground, smoothstep(0.0, -0.35, h));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        c += sunCol * (pow(s, 900.0) * 6.0 + pow(s, 24.0) * 0.35);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), mat);
  m.renderOrder = -10; m.frustumCulled = false;
  return m;
}
