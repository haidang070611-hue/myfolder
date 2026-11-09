// Âm thanh tổng hợp bằng WebAudio, không cần file âm thanh nào
let ac = null, master = null, musicOn = false, musicTimer = null, step = 0, noiseBuf = null;

export function unlockAudio() {
  if (!ac) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return false;
    ac = new C();
    master = ac.createGain();
    master.gain.value = 0.55;
    master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === 'suspended') ac.resume();
  return true;
}
export const audioReady = () => !!ac && ac.state === 'running';

function tone(freq, dur = 0.12, type = 'sine', vol = 0.2, slide = 0, delay = 0, dest) {
  if (!ac) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest || master);
  o.start(t); o.stop(t + dur + 0.03);
}

function noise(dur = 0.2, vol = 0.3, freq = 1000, delay = 0) {
  if (!ac) return;
  const t = ac.currentTime + delay;
  const s = ac.createBufferSource();
  s.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(freq * 4, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(40, freq), t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t); s.stop(t + dur + 0.03);
}

export const sfx = {
  tick() { tone(660, 0.1, 'square', 0.1); },
  go() { tone(990, 0.4, 'square', 0.14); },
  join() { tone(660, 0.1, 'triangle', 0.2); tone(880, 0.16, 'triangle', 0.2, 0, 0.1); },
  leave() { tone(500, 0.12, 'triangle', 0.18, -150); },
  select() { tone(520, 0.06, 'square', 0.08); },
  hit() { noise(0.14, 0.35, 300); tone(130, 0.16, 'sine', 0.3, -70); },
  dash() { tone(260, 0.22, 'sawtooth', 0.1, 700); },
  fall() { tone(520, 0.8, 'sine', 0.18, -450); },
  shoot() { tone(560, 0.12, 'square', 0.08, -400); },
  boom() { noise(0.55, 0.5, 180); tone(90, 0.45, 'sawtooth', 0.22, -60); },
  shield() { tone(700, 0.3, 'sine', 0.14, 500); },
  ping() { tone(1000, 0.05, 'square', 0.06); },
  nitro() { noise(0.25, 0.14, 700); },
  lap() { tone(880, 0.14, 'triangle', 0.2); tone(1320, 0.22, 'triangle', 0.2, 0, 0.1); },
  coin() { tone(1320, 0.07, 'square', 0.08); tone(1760, 0.14, 'square', 0.08, 0, 0.06); },
  gem() { [1047, 1319, 1568].forEach((f, i) => tone(f, 0.12, 'triangle', 0.14, 0, i * 0.06)); },
  kick() { noise(0.1, 0.25, 500); tone(180, 0.1, 'sine', 0.3, -90); },
  goal() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, 'square', 0.1, 0, i * 0.08)); noise(0.8, 0.18, 1500); },
  jump() { tone(300, 0.16, 'sine', 0.14, 380); },
  warn() { tone(440, 0.09, 'sawtooth', 0.07); tone(330, 0.09, 'sawtooth', 0.07, 0, 0.1); },
  crack() { noise(0.18, 0.3, 900); tone(90, 0.2, 'square', 0.1, -40); },
  paint() { noise(0.3, 0.2, 2200); tone(500, 0.25, 'triangle', 0.12, 400); },
  note(f = 523) { tone(f, 0.2, 'triangle', 0.09); tone(f / 2, 0.2, 'sine', 0.05); },
  thud() { noise(0.16, 0.3, 260); tone(110, 0.14, 'sine', 0.25, -50); },
  pass() { tone(880, 0.07, 'square', 0.1); tone(1175, 0.1, 'square', 0.1, 0, 0.06); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, 'triangle', 0.2, 0, i * 0.12)); },
};

// Nhạc nền nhẹ, bật/tắt bằng phím M
const BASS = [110, 110, 165, 110, 131, 131, 196, 131, 98, 98, 147, 98, 123, 123, 185, 123];
const ARP = [440, 554, 659, 554, 523, 659, 784, 659, 392, 494, 587, 494, 494, 622, 740, 622];
function musicStep() {
  if (!ac || !musicOn) return;
  const i = step++ % 16;
  tone(BASS[i], 0.2, 'triangle', 0.07);
  if (i % 2 === 0) tone(ARP[i], 0.16, 'square', 0.025);
}
export function toggleMusic() {
  if (!unlockAudio()) return false;
  musicOn = !musicOn;
  clearInterval(musicTimer);
  if (musicOn) musicTimer = setInterval(musicStep, 160);
  return musicOn;
}
