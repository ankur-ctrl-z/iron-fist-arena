'use strict';
/* ============ core utilities ============ */
const FPS = 60;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rad = d => d * Math.PI / 180;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[(Math.random() * arr.length) | 0];
const smooth = t => t * t * (3 - 2 * t);
const easeOut = t => 1 - Math.pow(1 - t, 3);
const wrapDeg = d => { d = ((d + 180) % 360 + 360) % 360 - 180; return d; };
const $ = id => document.getElementById(id);

const SETTINGS = {
  difficulty: 1,      // 0 easy, 1 medium, 2 hard
  roundsToWin: 2,
  roundTime: 60,      // 0 = infinite
  volume: 0.8,
  music: true,
  announcer: true,
  shake: true,
  quality: 2,         // 0 low, 1 med, 2 high
  special1: false,    // Special Style (simplified controls) per player
  special2: false,
  replay: true,       // K.O. replays
};
try { Object.assign(SETTINGS, JSON.parse(localStorage.getItem('ifa-settings') || '{}')); } catch (e) {}
function saveSettings() { try { localStorage.setItem('ifa-settings', JSON.stringify(SETTINGS)); } catch (e) {} }

/* ============ audio (fully synthesized) ============ */
const Audio = {
  ctx: null, master: null, musicGain: null, sfxGain: null, musicOn: false, musicTimer: null, nextBeat: 0, beat: 0,
  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = SETTINGS.volume; this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 1; this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.32; this.musicGain.connect(this.master);
      const len = this.ctx.sampleRate * 2; const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
    } catch (e) { this.ctx = null; }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  setVolume(v) { if (this.master) this.master.gain.value = v; },
  noiseSrc(t, dur, type, f0, f1, q, g, dest) {
    const c = this.ctx; const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const flt = c.createBiquadFilter(); flt.type = type; flt.frequency.setValueAtTime(f0, t); if (f1) flt.frequency.exponentialRampToValueAtTime(f1, t + dur); flt.Q.value = q || 1;
    const gn = c.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g, t + 0.006); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(flt); flt.connect(gn); gn.connect(dest || this.sfxGain); s.start(t); s.stop(t + dur + 0.05);
  },
  tone(t, dur, type, f0, f1, g, dest) {
    const c = this.ctx; const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const gn = c.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g, t + 0.005); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn); gn.connect(dest || this.sfxGain); o.start(t); o.stop(t + dur + 0.05);
  },
  whoosh(heavy) { if (!this.ctx) return; const t = this.ctx.currentTime; this.noiseSrc(t, heavy ? 0.22 : 0.14, 'bandpass', heavy ? 300 : 500, heavy ? 1800 : 2400, 1.2, heavy ? 0.35 : 0.22); },
  hit(power) { if (!this.ctx) return; const t = this.ctx.currentTime; const p = clamp(power, 0.3, 1.6);
    this.noiseSrc(t, 0.05 + 0.05 * p, 'lowpass', 2200, 300, 0.7, 0.9 * p);
    this.tone(t, 0.14 + 0.06 * p, 'sine', 160, 50, 0.9 * p);
    if (p > 0.9) this.tone(t, 0.3, 'sine', 70, 35, 0.8); },
  block() { if (!this.ctx) return; const t = this.ctx.currentTime; this.noiseSrc(t, 0.04, 'highpass', 1200, 0, 1, 0.35); this.tone(t, 0.07, 'triangle', 420, 180, 0.25); },
  thud() { if (!this.ctx) return; const t = this.ctx.currentTime; this.noiseSrc(t, 0.16, 'lowpass', 500, 120, 0.6, 0.7); this.tone(t, 0.25, 'sine', 90, 35, 0.9); },
  step() { if (!this.ctx) return; const t = this.ctx.currentTime; this.noiseSrc(t, 0.05, 'lowpass', 600, 200, 0.8, 0.12); },
  ko() { if (!this.ctx) return; const c = this.ctx, t = c.currentTime; const dl = c.createDelay(); dl.delayTime.value = 0.18; const fb = c.createGain(); fb.gain.value = 0.42; dl.connect(fb); fb.connect(dl); dl.connect(this.sfxGain);
    this.noiseSrc(t, 0.3, 'lowpass', 3000, 150, 0.7, 1.2, dl); this.tone(t, 0.6, 'sine', 120, 28, 1.3, dl); this.tone(t, 1.2, 'sine', 55, 30, 0.9); },
  throwGrab() { if (!this.ctx) return; const t = this.ctx.currentTime; this.noiseSrc(t, 0.12, 'bandpass', 900, 300, 1.5, 0.35); },
  ui(sel) { if (!this.ctx) return; const t = this.ctx.currentTime; this.tone(t, sel ? 0.18 : 0.06, 'square', sel ? 660 : 440, sel ? 990 : 440, 0.08); },
  rage() { if (!this.ctx) return; const t = this.ctx.currentTime; this.tone(t, 0.9, 'sawtooth', 60, 240, 0.35); this.noiseSrc(t, 0.8, 'bandpass', 200, 3000, 2, 0.4); },
  heat() { if (!this.ctx) return; const t = this.ctx.currentTime; this.tone(t, 0.5, 'sawtooth', 80, 640, 0.3); this.noiseSrc(t, 0.6, 'bandpass', 300, 5000, 1.5, 0.5); this.tone(t + 0.05, 0.6, 'sine', 120, 40, 0.9); },
  crash() { if (!this.ctx) return; const t = this.ctx.currentTime; for (let i = 0; i < 5; i++) { this.noiseSrc(t + i * 0.07, 0.35, 'lowpass', 2500 - i * 300, 200, 0.7, 0.9 - i * 0.12); this.tone(t + i * 0.07, 0.3, 'sine', 110 - i * 12, 35, 0.6); } this.noiseSrc(t, 1.2, 'highpass', 2500, 0, 1, 0.25); },
  parry() { if (!this.ctx) return; const t = this.ctx.currentTime; this.tone(t, 0.35, 'triangle', 1400, 900, 0.3); this.tone(t, 0.25, 'square', 2100, 1500, 0.08); this.noiseSrc(t, 0.05, 'highpass', 3000, 0, 1, 0.3); },
  say(text) {
    if (!SETTINGS.announcer) return;
    try { if (!('speechSynthesis' in window)) return; const u = new SpeechSynthesisUtterance(text); u.rate = 0.95; u.pitch = 0.7; u.volume = clamp(SETTINGS.volume, 0, 1); speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) {}
  },
  /* procedural fight music: 128 bpm, kick/snare/hat + bass riff */
  startMusic(mode) {
    if (!this.ctx || !SETTINGS.music) return; this.stopMusic(); this.musicOn = true; this.mode = mode || 'fight';
    this.nextBeat = this.ctx.currentTime + 0.1; this.beat = 0;
    const tick = () => { if (!this.musicOn) return; const c = this.ctx; const spb = 60 / 128 / 2; // eighth notes
      while (this.nextBeat < c.currentTime + 0.25) { this.scheduleBeat(this.nextBeat, this.beat); this.nextBeat += spb; this.beat++; }
      this.musicTimer = setTimeout(tick, 80); };
    tick();
  },
  scheduleBeat(t, b) {
    const g = this.musicGain; const e = b % 8; const bar = (b >> 3) % 8;
    if (this.mode === 'menu') { if (e === 0) { this.tone(t, 0.9, 'sine', 55, 55, 0.5, g); } if (e % 2 === 0) this.noiseSrc(t, 0.03, 'highpass', 6000, 0, 1, 0.06, g); return; }
    if (e === 0 || e === 4 || (bar % 2 === 1 && e === 7)) { this.tone(t, 0.28, 'sine', 150, 42, 1.1, g); }
    if (e === 2 || e === 6) { this.noiseSrc(t, 0.12, 'bandpass', 1800, 600, 0.8, 0.5, g); this.tone(t, 0.08, 'triangle', 220, 120, 0.3, g); }
    this.noiseSrc(t, e % 2 ? 0.03 : 0.05, 'highpass', 7000, 0, 1, e % 2 ? 0.08 : 0.14, g);
    const riff = [55, 55, 65.4, 55, 73.4, 55, 58.3, 65.4]; const n = riff[e] * (bar >= 4 ? 1.5 : 1);
    if (e !== 3 && e !== 5) this.tone(t, 0.18, 'sawtooth', n, n, 0.16, g);
    if (bar >= 6 && e % 4 === 0) this.tone(t, 0.4, 'square', n * 4, n * 4, 0.05, g);
  },
  stopMusic() { this.musicOn = false; if (this.musicTimer) clearTimeout(this.musicTimer); this.musicTimer = null; },
};
