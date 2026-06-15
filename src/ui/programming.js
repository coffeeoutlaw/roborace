// Bottom programming panel: dealt hand + 5 register slots, click to place/remove.
import { CARD_LABELS } from '../engine/cards.js';
import { isLocked, lockedCount, NUM_REGISTERS } from '../engine/engine.js';
import { sfx } from '../audio/sfx.js';

const GLYPHS = {
  uturn: 'U', left: '↺', right: '↻', backup: '⬇', move1: '⬆', move2: '⬆⬆', move3: '⬆⬆⬆',
};

function cardEl(card, cls = '') {
  const el = document.createElement('div');
  el.className = `pcard ${cls}`;
  el.innerHTML = `<div class="pcard-pri">${card.priority}</div>
    <div class="pcard-glyph">${GLYPHS[card.type]}</div>
    <div class="pcard-name">${CARD_LABELS[card.type]}</div>`;
  return el;
}

export class ProgrammingPanel {
  constructor(root) {
    this.root = root;
    root.innerHTML = '<div class="prog-handle"></div><div class="prog-body"></div>';
    this.handle = root.querySelector('.prog-handle');
    this.body = root.querySelector('.prog-body');
    this.onLockIn = null;
    this.onPowerDown = null;
    // Auto-hide: slide down to a strip when the mouse is up on the board, slide back
    // when the mouse returns to the bottom of the screen (or the strip itself).
    document.addEventListener('mousemove', (e) => {
      if (this.root.classList.contains('hidden')) return;
      const inPanel = this.root.contains(e.target);
      const nearBottom = e.clientY > window.innerHeight - 90;
      this.#setPeek(!(inPanel || nearBottom));
    });
    this.#setPeek(false);
  }

  #setPeek(on) {
    this.root.classList.toggle('peek', on);
    this.handle.textContent = on
      ? '▲ your cards — move mouse here'
      : '▼ move mouse up to view the board';
  }

  hide() { this.root.classList.add('hidden'); }

  // Start-position auction: show the hand, player clicks one card and confirms.
  // Resolves with the chosen card's priority.
  showBid(hand) {
    this.root.classList.remove('hidden');
    this.#setPeek(false);
    return new Promise((res) => {
      const root = this.body;
      root.innerHTML = '';
      let picked = null;

      const title = document.createElement('div');
      title.className = 'bid-title';
      title.textContent = '🏁 Bid for starting position — the card is discarded; '
        + 'highest priority picks a dock first';
      root.appendChild(title);

      const handRow = document.createElement('div');
      handRow.className = 'hand-row';
      const btn = document.createElement('button');
      hand.forEach((c) => {
        const el = cardEl(c);
        el.addEventListener('click', () => {
          picked = c;
          sfx.play('place');
          handRow.querySelectorAll('.pcard').forEach((p) => p.classList.remove('bid-picked'));
          el.classList.add('bid-picked');
          btn.disabled = false;
          btn.textContent = `Bid ${c.priority} ▶`;
        });
        handRow.appendChild(el);
      });
      root.appendChild(handRow);

      const btnRow = document.createElement('div');
      btnRow.className = 'btn-row';
      btn.className = 'lockin';
      btn.textContent = 'Pick a card to bid';
      btn.disabled = true;
      btn.addEventListener('click', () => {
        sfx.play('confirm');
        this.hide();
        res(picked.priority);
      });
      btnRow.appendChild(btn);
      root.appendChild(btnRow);
    });
  }

  // robot: the player robot (already dealt). Returns nothing; fires onLockIn(cards).
  show(robot) {
    this.root.classList.remove('hidden');
    this.#setPeek(false);
    this.robot = robot;
    this.hand = [...robot.hand];
    this.slots = new Array(NUM_REGISTERS).fill(null);
    this.placed = new Set(); // indices into this.hand
    this.powerDown = false;
    this.#render();
  }

  #render() {
    const r = this.robot;
    const root = this.body;
    root.innerHTML = '';

    const slotRow = document.createElement('div');
    slotRow.className = 'slot-row';
    for (let i = 0; i < NUM_REGISTERS; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.dataset.reg = String(i + 1);
      if (isLocked(r, i)) {
        slot.classList.add('locked');
        if (r.registers[i]) slot.appendChild(cardEl(r.registers[i], 'small'));
        const lock = document.createElement('div');
        lock.className = 'slot-lock';
        lock.textContent = '🔒';
        slot.appendChild(lock);
      } else if (this.slots[i]) {
        const el = cardEl(this.hand[this.slots[i].idx], 'small');
        el.addEventListener('click', () => {
          sfx.play('click');
          this.placed.delete(this.slots[i].idx);
          this.slots[i] = null;
          this.#render();
        });
        slot.appendChild(el);
      }
      slotRow.appendChild(slot);
    }
    root.appendChild(slotRow);

    const handRow = document.createElement('div');
    handRow.className = 'hand-row';
    this.hand.forEach((c, idx) => {
      if (this.placed.has(idx)) return;
      const el = cardEl(c);
      el.addEventListener('click', () => {
        let placedOne = false;
        for (let i = 0; i < NUM_REGISTERS; i++) {
          if (!isLocked(r, i) && !this.slots[i]) {
            this.slots[i] = { idx };
            this.placed.add(idx);
            placedOne = true;
            break;
          }
        }
        if (placedOne) sfx.play('place');
        this.#render();
      });
      handRow.appendChild(el);
    });
    root.appendChild(handRow);

    const btnRow = document.createElement('div');
    btnRow.className = 'btn-row';

    const reset = document.createElement('button');
    reset.textContent = 'Reset';
    reset.addEventListener('click', () => {
      sfx.play('click');
      this.slots.fill(null);
      this.placed.clear();
      this.#render();
    });
    btnRow.appendChild(reset);

    if (r.damage > 0) {
      const pd = document.createElement('button');
      pd.className = this.powerDown ? 'pd active' : 'pd';
      pd.textContent = this.powerDown ? '⚡ Powering down next turn' : '⚡ Announce power down';
      pd.addEventListener('click', () => {
        this.powerDown = !this.powerDown;
        sfx.play(this.powerDown ? 'powerdown' : 'click');
        if (this.onPowerDown) this.onPowerDown(this.powerDown);
        this.#render();
      });
      btnRow.appendChild(pd);
    }

    const free = [];
    for (let i = 0; i < NUM_REGISTERS; i++) if (!isLocked(r, i)) free.push(i);
    const full = free.every((i) => this.slots[i]);
    const lock = document.createElement('button');
    lock.className = 'lockin';
    lock.textContent = 'Lock In ▶';
    lock.disabled = !full;
    lock.addEventListener('click', () => {
      sfx.play('confirm');
      const cards = free.map((i) => this.hand[this.slots[i].idx]);
      this.hide();
      if (this.onLockIn) this.onLockIn(cards, this.powerDown);
    });
    btnRow.appendChild(lock);

    const info = document.createElement('div');
    info.className = 'prog-info';
    const locks = lockedCount(r.damage);
    info.textContent = `Damage ${r.damage} — hand of ${this.hand.length}` +
      (locks ? `, ${locks} register${locks > 1 ? 's' : ''} locked` : '');
    btnRow.appendChild(info);

    root.appendChild(btnRow);
  }
}
