// Promise-based modal dialogs: respawn facing, stay-down, game over, course menu.
import { sfx } from '../audio/sfx.js';

function modal(html) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal">${html}</div>`;
  document.body.appendChild(wrap);
  // a click anywhere on a modal button gives audible feedback
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('button')) sfx.play('click');
  });
  return wrap;
}

export function respawnModal() {
  return new Promise((res) => {
    const w = modal(`
      <h2>Your robot was destroyed</h2>
      <p>Choose the direction to face when you re-enter at your archive marker
      (you re-enter with 2 damage).</p>
      <div class="dir-pad">
        <button data-dir="0">▲ North</button>
        <button data-dir="3">◀ West</button>
        <button data-dir="1">East ▶</button>
        <button data-dir="2">▼ South</button>
      </div>
      <label class="chk"><input type="checkbox" id="re-pd"> Re-enter powered down
        (repairs all damage next turn, but you skip it)</label>`);
    w.querySelectorAll('[data-dir]').forEach((b) => b.addEventListener('click', () => {
      const powerDown = w.querySelector('#re-pd').checked;
      w.remove();
      res({ dir: Number(b.dataset.dir), powerDown });
    }));
  });
}

export function stayDownModal(damage) {
  return new Promise((res) => {
    const w = modal(`
      <h2>Stay powered down?</h2>
      <p>You are powered down${damage ? ` and took ${damage} damage this turn` : ''}.
      Stay down another turn (damage repairs again) or power back up?</p>
      <div class="btn-row">
        <button id="up">Power up</button>
        <button id="stay">Stay down</button>
      </div>`);
    w.querySelector('#up').addEventListener('click', () => { w.remove(); res(false); });
    w.querySelector('#stay').addEventListener('click', () => { w.remove(); res(true); });
  });
}

export function gameOverModal({ title, lines, victory }) {
  return new Promise((res) => {
    const w = modal(`
      <h2 class="${victory ? 'win-title' : 'lose-title'}">${title}</h2>
      <div class="standings">${lines.map((l) => `<div>${l}</div>`).join('')}</div>
      <div class="btn-row">
        <button id="again">Play again</button>
        <button id="menu">Course menu</button>
      </div>`);
    w.querySelector('#again').addEventListener('click', () => { w.remove(); res('again'); });
    w.querySelector('#menu').addEventListener('click', () => { w.remove(); res('menu'); });
  });
}

// Full-screen landing screen over the splash art. Resolves 'single' or 'online'.
export function titleScreen() {
  return new Promise((res) => {
    const wrap = document.createElement('div');
    wrap.className = 'title-screen';
    wrap.innerHTML = `
      <div class="title-buttons">
        <button class="title-btn single">▶ Single Player</button>
        <button class="title-btn online">🌐 Play Online</button>
      </div>
      <div class="title-foot">A fan-made tribute to RoboRally · race the factory, touch every flag</div>`;
    document.body.appendChild(wrap);
    const pick = (v) => { wrap.remove(); res(v); };
    wrap.querySelector('.single').addEventListener('click', () => pick('single'));
    wrap.querySelector('.online').addEventListener('click', () => pick('online'));
  });
}

// Resolves with a course index, or null if the player backs out (only possible
// when `resumable` — i.e. a game is already in progress).
export function courseMenu(courses, { resumable = false } = {}) {
  return new Promise((res) => {
    const w = modal(`
      <h1 class="menu-title">⚙ ROBO RACE ⚙</h1>
      <p class="menu-sub">Program your robot. Survive the factory. Touch every flag in order.<br>
      You race against <b style="color:#ff5544">Crusher</b>,
      <b style="color:#66dd77">Prudence</b> and <b style="color:#ffcc33">Turbo</b>.</p>
      ${resumable ? '<p class="menu-warn">⚠ Picking a course abandons your current race.</p>' : ''}
      <div class="course-row">
        ${courses.map((c, i) => `
          <button class="course-card" data-i="${i}">
            <div class="course-name">${c.name}</div>
            <div class="course-diff">${'★'.repeat(c.difficulty)}${'☆'.repeat(3 - c.difficulty)}</div>
            <div class="course-blurb">${c.blurb}</div>
            <div class="course-flags">${c.flags.length} flags</div>
          </button>`).join('')}
      </div>
      <div class="btn-row">
        <button id="online" class="online-btn">🌐 Play online — race a friend</button>
        ${resumable ? '<button id="resume" class="resume">↩ Resume game</button>' : ''}
      </div>
      <p class="menu-help">Drag to pan · scroll to zoom · right-drag to tilt</p>`);
    const finish = (v) => {
      window.removeEventListener('keydown', onKey);
      w.remove();
      res(v);
    };
    const onKey = (e) => { if (e.key === 'Escape' && resumable) finish(null); };
    window.addEventListener('keydown', onKey);
    if (resumable) {
      w.querySelector('#resume').addEventListener('click', () => finish(null));
      w.addEventListener('click', (e) => { if (e.target === w) finish(null); });
    }
    w.querySelector('#online').addEventListener('click', () => finish('online'));
    w.querySelectorAll('.course-card').forEach((b) => b.addEventListener('click', () => {
      finish(Number(b.dataset.i));
    }));
  });
}

export function confirmModal(title, yesLabel = 'Yes', noLabel = 'Cancel') {
  return new Promise((res) => {
    const w = modal(`
      <h2>${title}</h2>
      <div class="btn-row">
        <button id="cm-no">${noLabel}</button>
        <button id="cm-yes" class="resume">${yesLabel}</button>
      </div>`);
    w.querySelector('#cm-yes').addEventListener('click', () => { w.remove(); res(true); });
    w.querySelector('#cm-no').addEventListener('click', () => { w.remove(); res(false); });
  });
}
