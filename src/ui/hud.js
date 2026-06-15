// Right-side HUD: one status card per robot, updated from animation events so the
// display tracks what's on screen (not the engine's already-final state).
import { lockedCount } from '../engine/engine.js';

export class Hud {
  constructor(root, robots, flagCount) {
    this.root = root;
    this.flagCount = flagCount;
    this.view = new Map();
    root.innerHTML = '';
    for (const r of robots) {
      const v = {
        damage: r.damage, lives: r.lives, flags: r.nextFlag, powered: r.poweredDown,
        destroyed: false, options: r.options.length, el: document.createElement('div'),
      };
      v.el.className = 'hud-card';
      v.el.innerHTML = `
        <div class="hud-head"><span class="dot" style="background:${r.color}"></span>
          <span class="hud-name">${r.name}</span><span class="hud-status"></span></div>
        <div class="hud-pips"></div>
        <div class="hud-row"><span class="hud-lives"></span><span class="hud-flag"></span>
          <span class="hud-opts"></span></div>`;
      root.appendChild(v.el);
      this.view.set(r.id, v);
      this.#render(r.id);
    }
  }

  #render(id) {
    const v = this.view.get(id);
    const pips = [];
    for (let i = 0; i < 10; i++) {
      // pips 5..9 are the register-lock thresholds, pip 10 is destruction
      const cls = ['pip'];
      if (i < v.damage) cls.push('on');
      if (i >= 4 && i < 9) cls.push('lockmark');
      if (i === 9) cls.push('deathmark');
      pips.push(`<span class="${cls.join(' ')}"></span>`);
    }
    v.el.querySelector('.hud-pips').innerHTML = pips.join('');
    v.el.querySelector('.hud-lives').textContent = '♥'.repeat(Math.max(0, v.lives));
    v.el.querySelector('.hud-flag').textContent = `⚑ ${v.flags}/${this.flagCount}`;
    v.el.querySelector('.hud-opts').textContent = v.options > 0 ? `⚙×${v.options}` : '';
    const st = v.el.querySelector('.hud-status');
    if (v.lives <= 0) { st.textContent = 'DEAD'; st.className = 'hud-status dead'; }
    else if (v.destroyed) { st.textContent = 'WRECKED'; st.className = 'hud-status wrecked'; }
    else if (v.powered) { st.textContent = 'PWR DOWN'; st.className = 'hud-status powered'; }
    else { st.textContent = ''; st.className = 'hud-status'; }
    v.el.classList.toggle('hud-dead', v.lives <= 0);
  }

  onEvent(e) {
    const v = this.view.get(e.id);
    switch (e.type) {
      case 'damage': v.damage = e.total; break;
      case 'repair': v.damage = e.total === 0 ? 0 : e.total; break;
      case 'destroyed': v.destroyed = true; v.lives = e.lives; break;
      case 'respawn': v.destroyed = false; v.damage = e.damage; v.powered = e.poweredDown; break;
      case 'flag': v.flags = e.flag; break;
      case 'powerdown': v.powered = true; break;
      case 'powerup': v.powered = false; break;
      case 'option': v.options += 1; break;
      case 'shield': v.options = Math.max(0, v.options - (e.option === 'ablative-coat' ? 0 : 1)); break;
      default: return;
    }
    this.#render(e.id);
    if (e.type === 'damage') {
      v.el.classList.remove('flash');
      void v.el.offsetWidth;
      v.el.classList.add('flash');
    }
  }
}
