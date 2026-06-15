// Execution log feed. Turns engine events into readable lines.
import { CARD_LABELS } from '../engine/cards.js';

export class Log {
  constructor(root, names) {
    this.root = root;
    this.names = names; // Map id -> display name
  }

  line(text, cls = '') {
    const el = document.createElement('div');
    el.className = `log-line ${cls}`;
    el.textContent = text;
    this.root.appendChild(el);
    while (this.root.children.length > 80) this.root.removeChild(this.root.firstChild);
    this.root.scrollTop = this.root.scrollHeight;
  }

  #n(id) { return this.names.get(id) || id; }

  onEvent(e) {
    switch (e.type) {
      case 'turn': this.line(`— Turn ${e.n} —`, 'log-turn'); break;
      case 'register': this.line(`Register ${e.n}`, 'log-reg'); break;
      case 'reveal':
        if (e.cards.length) {
          this.line(e.cards.map((c) =>
            `${this.#n(c.id)}: ${CARD_LABELS[c.card.type]} (${c.card.priority})`).join('  ·  '));
        }
        break;
      case 'move':
        if (e.cause === 'push') this.line(`${this.#n(e.id)} is shoved!`, 'log-push');
        break;
      case 'damage': this.line(`${this.#n(e.id)} takes damage (${e.total}/10)`, 'log-dmg'); break;
      case 'shield': this.line(`${this.#n(e.id)} burns an option to block damage`, 'log-shield'); break;
      case 'destroyed': {
        const why = e.cause === 'pit' ? 'falls into a pit' :
          e.cause === 'edge' ? 'drives off the board' : 'is blown apart';
        this.line(`💥 ${this.#n(e.id)} ${why}!`, 'log-death');
        break;
      }
      case 'eliminated': this.line(`☠ ${this.#n(e.id)} is permanently out!`, 'log-death'); break;
      case 'respawn': this.line(`${this.#n(e.id)} re-enters at its archive (2 damage)`); break;
      case 'flag': this.line(`⚑ ${this.#n(e.id)} touches flag ${e.flag}/${e.of}!`, 'log-flag'); break;
      case 'archive': this.line(`${this.#n(e.id)} updates its archive marker`); break;
      case 'repair':
        if (e.source !== 'powerdown') this.line(`${this.#n(e.id)} repairs 1 damage`, 'log-heal');
        else this.line(`${this.#n(e.id)} powers down and repairs fully`, 'log-heal');
        break;
      case 'option': this.line(`${this.#n(e.id)} draws option: ${e.name}`, 'log-opt'); break;
      case 'bids':
        this.line(`Start bids: ${e.entries.map((b) =>
          `${this.#n(b.id)} ${b.card.priority}`).join(' · ')}`, 'log-reg');
        break;
      case 'placed': this.line(`${this.#n(e.id)} deploys at dock ${e.dock}`, 'log-flag'); break;
      case 'powerdown': this.line(`${this.#n(e.id)} is powered down`, 'log-pd'); break;
      case 'powerup': this.line(`${this.#n(e.id)} powers back up`, 'log-pd'); break;
      case 'win': this.line(`🏁 ${this.#n(e.id)} wins the race!`, 'log-flag'); break;
      default: break;
    }
  }
}
