// Procedural sound effects — every sound is synthesized with the Web Audio API,
// no asset files. A single shared instance (`sfx`) is imported by the renderer
// (engine-event sounds) and the UI modules (clicks/confirms). Audio stays silent
// until the first user gesture unlocks the AudioContext (browser policy).
class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.5;
    this._last = new Map(); // per-key cooldown timestamps
    this._budget = []; // global voice timestamps (rate limiting)
    // browser-only: stay inert if imported in a non-DOM context (tests/SSR)
    this.available = typeof window !== 'undefined' && typeof window.AudioContext !== 'undefined';
    this.muted = this.available && localStorage.getItem('rr-muted') === '1';
    if (!this.available) return;
    // unlock on the first gesture of any kind
    const unlock = () => this.#ensure();
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
      window.addEventListener(ev, unlock, { once: false, passive: true });
    }
  }

  #ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      // reusable white-noise buffer
      const n = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setMuted(m) {
    this.muted = m;
    if (this.available) localStorage.setItem('rr-muted', m ? '1' : '0');
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
  }

  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  // ---- low-level voices ----

  #tone(freq, t0, dur, { type = 'sine', vol = 0.3, f1 = null, glide = 'exp' } = {}) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (f1 != null) {
      if (glide === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
      else o.frequency.linearRampToValueAtTime(f1, t0 + dur);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.012, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  #noise(t0, dur, { vol = 0.3, type = 'lowpass', freq = 1000, q = 1 } = {}) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  #bell(freqs, t0, dur, vol = 0.22) {
    freqs.forEach((fr, i) => this.#tone(fr, t0 + i * 0.0, dur, { type: 'sine', vol: vol / (i + 1) }));
  }

  // ---- named sounds ----

  play(key) {
    const ctx = this.#ensure();
    if (!ctx || this.muted) return;
    // per-key cooldown so machine-gun events don't pile up
    const cd = COOLDOWN[key] ?? 30;
    const now = performance.now();
    if (now - (this._last.get(key) || 0) < cd) return;
    // global voice budget: max ~7 starts per 70ms window
    this._budget = this._budget.filter((t) => now - t < 70);
    if (this._budget.length > 7) return;
    this._last.set(key, now);
    this._budget.push(now);

    const t = ctx.currentTime;
    switch (key) {
      case 'click': this.#tone(420, t, 0.05, { type: 'square', vol: 0.12 }); break;
      case 'place': this.#tone(660, t, 0.06, { type: 'square', vol: 0.14 }); break;
      case 'confirm':
        this.#tone(540, t, 0.08, { type: 'square', vol: 0.16 });
        this.#tone(810, t + 0.07, 0.1, { type: 'square', vol: 0.16 });
        break;
      case 'deploy':
        this.#tone(180, t, 0.28, { type: 'sawtooth', vol: 0.16, f1: 620 });
        this.#bell([880, 1320], t + 0.18, 0.2, 0.12);
        break;
      case 'turn': this.#tone(300, t, 0.18, { type: 'sine', vol: 0.2, f1: 360 }); break;
      case 'register': this.#tone(220, t, 0.04, { type: 'square', vol: 0.1 }); break;
      case 'reveal': this.#noise(t, 0.12, { vol: 0.12, type: 'highpass', freq: 1800 }); break;
      case 'move': this.#tone(170, t, 0.1, { type: 'square', vol: 0.07, f1: 150 }); break;
      case 'push':
        this.#tone(95, t, 0.14, { type: 'sine', vol: 0.28, f1: 60 });
        this.#noise(t, 0.1, { vol: 0.18, type: 'lowpass', freq: 500 });
        break;
      case 'rotate': this.#tone(280, t, 0.13, { type: 'triangle', vol: 0.12, f1: 360 }); break;
      case 'belts': this.#noise(t, 0.26, { vol: 0.1, type: 'lowpass', freq: 140, q: 3 }); break;
      case 'pusher':
        this.#noise(t, 0.16, { vol: 0.22, type: 'bandpass', freq: 800, q: 2 });
        this.#tone(140, t + 0.1, 0.08, { type: 'square', vol: 0.18, f1: 90 });
        break;
      case 'laserBoard': this.#tone(900, t, 0.18, { type: 'sawtooth', vol: 0.18, f1: 180 }); break;
      case 'laserRobot': this.#tone(1300, t, 0.12, { type: 'sawtooth', vol: 0.14, f1: 420 }); break;
      case 'damage':
        this.#noise(t, 0.14, { vol: 0.24, type: 'bandpass', freq: 1200, q: 1 });
        this.#tone(160, t, 0.12, { type: 'sine', vol: 0.18, f1: 80 });
        break;
      case 'shield': this.#bell([1500, 2300], t, 0.3, 0.18); break;
      case 'fall':
        this.#tone(820, t, 0.4, { type: 'sine', vol: 0.22, f1: 110 });
        this.#noise(t + 0.32, 0.18, { vol: 0.26, type: 'lowpass', freq: 400 });
        break;
      case 'explode':
        this.#noise(t, 0.4, { vol: 0.3, type: 'lowpass', freq: 700, q: 1 });
        this.#tone(120, t, 0.35, { type: 'sawtooth', vol: 0.2, f1: 40 });
        break;
      case 'eliminated': this.#tone(220, t, 0.6, { type: 'sine', vol: 0.26, f1: 60 }); break;
      case 'respawn':
        this.#tone(200, t, 0.3, { type: 'triangle', vol: 0.18, f1: 760 });
        this.#bell([1320, 1760], t + 0.2, 0.18, 0.1);
        break;
      case 'flag': this.#bell([660, 990, 1320], t, 0.5, 0.26); break;
      case 'archive': this.#tone(520, t, 0.06, { type: 'sine', vol: 0.1 }); break;
      case 'repair':
        [440, 660, 880].forEach((fr, i) =>
          this.#tone(fr, t + i * 0.06, 0.12, { type: 'triangle', vol: 0.14 }));
        break;
      case 'option':
        [880, 1320, 1760].forEach((fr, i) =>
          this.#tone(fr, t + i * 0.04, 0.1, { type: 'sine', vol: 0.12 }));
        break;
      case 'powerdown': this.#tone(600, t, 0.4, { type: 'sawtooth', vol: 0.2, f1: 80 }); break;
      case 'powerup': this.#tone(110, t, 0.32, { type: 'sawtooth', vol: 0.2, f1: 520 }); break;
      case 'win':
        [523, 659, 784, 1047].forEach((fr, i) =>
          this.#tone(fr, t + i * 0.12, 0.3, { type: 'square', vol: 0.2 }));
        this.#bell([1047, 1568], t + 0.5, 0.6, 0.18);
        break;
      default: break;
    }
  }

  // Map an engine animation event to a sound. `skip` suppresses per-step SFX when
  // the player fast-forwards the turn (only terminal events survive).
  onEvent(e, skip = false) {
    if (this.muted) return;
    if (skip) {
      if (e.type === 'win') this.play('win');
      else if (e.type === 'eliminated') this.play('eliminated');
      return;
    }
    switch (e.type) {
      case 'turn': this.play('turn'); break;
      case 'register': this.play('register'); break;
      case 'reveal': if (e.cards?.length) this.play('reveal'); break;
      case 'move': this.play(e.cause === 'push' ? 'push' : 'move'); break;
      case 'rotate': this.play('rotate'); break;
      case 'belts': if (e.moves?.length) this.play('belts'); break;
      case 'pusherFire': this.play('pusher'); break;
      case 'laser':
        if (e.kind === 'robot' && !e.targetId) break;
        this.play(e.kind === 'board' ? 'laserBoard' : 'laserRobot');
        break;
      case 'damage': this.play('damage'); break;
      case 'shield': this.play('shield'); break;
      case 'destroyed': this.play(e.cause === 'pit' || e.cause === 'edge' ? 'fall' : 'explode'); break;
      case 'eliminated': this.play('eliminated'); break;
      case 'respawn': this.play('respawn'); break;
      case 'placed': this.play('deploy'); break;
      case 'flag': this.play('flag'); break;
      case 'archive': this.play('archive'); break;
      case 'repair': this.play(e.source === 'powerdown' ? 'powerdown' : 'repair'); break;
      case 'option': this.play('option'); break;
      case 'bids': this.play('reveal'); break;
      case 'powerdown': this.play('powerdown'); break;
      case 'powerup': this.play('powerup'); break;
      case 'win': this.play('win'); break;
      default: break;
    }
  }
}

// Per-key minimum gap in ms (busy events get longer cooldowns).
const COOLDOWN = {
  move: 70, rotate: 70, belts: 120, register: 60, laserBoard: 50, laserRobot: 50,
  damage: 45, archive: 90, reveal: 80,
};

export const sfx = new Sfx();
