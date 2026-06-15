// Background music: streams the looping track via an <audio> element. Browsers
// block playback until a user gesture, so we arm playback and start on the first
// pointer/key/touch. Volume and on/off persist in localStorage.
const TRACK = 'audio/turbo-circuit.mp3';

class Music {
  constructor() {
    this.available = typeof window !== 'undefined' && typeof Audio !== 'undefined';
    this.volume = this.available ? clamp(parseFloat(localStorage.getItem('rr-music-vol')) , 0.4) : 0.4;
    this.enabled = this.available ? localStorage.getItem('rr-music-off') !== '1' : false;
    this.el = null;
    this.started = false;
    if (!this.available) return;

    this.el = new Audio(TRACK);
    this.el.loop = true;
    this.el.preload = 'auto';
    this.el.volume = this.volume;

    // start (or resume) on the first user gesture of any kind
    const kick = () => this.#tryStart();
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
      window.addEventListener(ev, kick, { passive: true });
    }
  }

  #tryStart() {
    if (!this.available || !this.enabled || this.started) return;
    const p = this.el.play();
    if (p && p.then) p.then(() => { this.started = true; }).catch(() => { /* retry on next gesture */ });
    else this.started = true;
  }

  setVolume(v) {
    this.volume = clamp(v, 0.4);
    if (this.el) this.el.volume = this.volume;
    if (this.available) localStorage.setItem('rr-music-vol', String(this.volume));
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.available) localStorage.setItem('rr-music-off', on ? '0' : '1');
    if (!this.el) return;
    if (on) this.#tryStart();
    else { this.el.pause(); this.started = false; }
  }

  toggle() { this.setEnabled(!this.enabled); return this.enabled; }
}

function clamp(v, fallback) {
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(1, v));
}

export const music = new Music();
