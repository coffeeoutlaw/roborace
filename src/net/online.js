// Online match client: owns the WebSocket, the lobby flow, and replays the server's
// event stream through the same animator/HUD/log the local game uses. The server is
// authoritative — this file never touches the rules engine.
import { COURSES } from '../boards/index.js';
import { Lobby } from '../ui/lobby.js';
import { respawnModal, stayDownModal, gameOverModal, confirmModal } from '../ui/modals.js';

const TOKEN_KEY = 'rr-online-token';

function wsUrl() {
  const override = new URLSearchParams(location.search).get('server');
  if (override) return override;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

export class OnlineGame {
  // ctx: { app, progPanel, setBanner, setupGameView(board, robots, flagCount), onExit() }
  constructor(ctx) {
    this.ctx = ctx;
    this.ws = null;
    this.me = null; // {code, playerId, key}
    this.isHost = false;
    this.q = Promise.resolve(); // animation/UI sequence queue
    this.lobby = new Lobby({
      onCreate: (name) => this.#send({ t: 'create', name }),
      onJoin: (name, code) => this.#send({ t: 'join', name, code }),
      onConfig: (cfg) => this.#send({ t: 'config', ...cfg }),
      onStart: () => this.#send({ t: 'start' }),
      onLeave: () => this.leave(),
    });
    this.lobby.courses = COURSES.map((m) => m());
  }

  get active() { return !!this.ws && this.ws.readyState <= 1; }

  // Entry point from the main menu (optionally with a ?room=CODE prefill).
  async open(prefillCode = '') {
    this.ctx.app.mode = 'online';
    await this.#connect();
    this.lobby.showConnect(prefillCode);
  }

  // Try to silently resume a match after a reload. Resolves true if resumed.
  async tryResume() {
    const tok = this.#token();
    if (!tok) return false;
    try {
      await this.#connect();
    } catch {
      return false;
    }
    this.ctx.app.mode = 'online';
    this.#send({ t: 'rejoin', ...tok });
    // welcome/snapshot (or error) decides what happens next
    return true;
  }

  async confirmLeave() {
    if (await confirmModal('Leave the online match?', 'Leave', 'Stay')) this.leave();
  }

  leave() {
    sessionStorage.removeItem(TOKEN_KEY);
    this.me = null;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.lobby.hide();
    this.ctx.app.mode = 'local';
    this.ctx.onExit();
  }

  // ---------- socket ----------

  #connect() {
    if (this.active) return Promise.resolve();
    return new Promise((res, rej) => {
      const ws = new WebSocket(wsUrl());
      ws.onopen = () => { this.ws = ws; res(); };
      ws.onerror = () => rej(new Error('Cannot reach the game server'));
      ws.onmessage = (m) => this.#onMessage(JSON.parse(m.data));
      ws.onclose = () => this.#onDrop();
    });
  }

  #send(msg) {
    if (this.active) this.ws.send(JSON.stringify(msg));
  }

  async #onDrop() {
    this.ws = null;
    if (!this.me) return; // left on purpose / never joined
    this.ctx.setBanner('⚠ Connection lost — reconnecting…');
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 1500 + i * 500));
      if (!this.me) return;
      try {
        await this.#connect();
        this.#send({ t: 'rejoin', ...this.me });
        return;
      } catch { /* retry */ }
    }
    this.ctx.setBanner('✖ Could not reconnect.');
    this.lobby.showConnect('', 'Connection lost — the room may still be alive: rejoin with the same code.');
  }

  #token() {
    try { return JSON.parse(sessionStorage.getItem(TOKEN_KEY)); } catch { return null; }
  }

  // ---------- message handling ----------

  #onMessage(msg) {
    const { app, setBanner, progPanel } = this.ctx;
    switch (msg.t) {
      case 'welcome':
        this.me = { code: msg.code, playerId: msg.playerId, key: msg.key };
        sessionStorage.setItem(TOKEN_KEY, JSON.stringify(this.me));
        break;

      case 'lobby':
        this.isHost = msg.players.find((p) => p.id === this.me?.playerId)?.isHost ?? false;
        this.lobby.showRoom(msg, this.me?.playerId);
        break;

      case 'error':
        this.lobby.visible ? this.lobby.setStatus(msg.msg) : setBanner(`⚠ ${msg.msg}`);
        if (/gone|Bad rejoin/.test(msg.msg)) {
          sessionStorage.removeItem(TOKEN_KEY);
          this.me = null;
        }
        break;

      case 'started':
        this.lobby.hide();
        this.#buildView(msg.courseIndex, msg.robots, msg.flagCount);
        setBanner('Race started!');
        break;

      case 'bidStart':
        this.#enqueue(() => app.animator.play(msg.events));
        this.#enqueue(() => {
          this.#syncView(msg.robots);
          setBanner('🏁 Bid for starting position');
          if (msg.you?.hand?.length) {
            progPanel.showBid(msg.you.hand).then((priority) => {
              this.#send({ t: 'bid', priority });
              setBanner('Bid placed — waiting for the reveal…');
            });
          }
        });
        break;

      case 'placing': // bid reveal + dock placements, animated as they happen
        this.#enqueue(() => app.animator.play(msg.events));
        this.#enqueue(() => this.#syncView(msg.robots));
        break;

      case 'pickDock':
        this.#enqueue(async () => {
          const dock = await this.ctx.pickDock(msg.free);
          this.#send({ t: 'pick', dock });
        });
        break;

      case 'turnStart':
        this.#enqueue(() => app.animator.play(msg.events));
        this.#enqueue(() => { this.#syncView(msg.robots); this.#programPhase(msg); });
        break;

      case 'progress': {
        const text = msg.waitingOn.length
          ? `Waiting on: ${msg.waitingOn.join(', ')}${msg.timer ? ` — ${msg.timer}s timer!` : ''}`
          : 'All programs locked in!';
        if (!this.awaitingMyProgram) setBanner(text);
        break;
      }

      case 'note':
        app.log?.line(msg.text, 'log-pd');
        break;

      case 'playerConn':
        app.log?.line(msg.connected ? 'A player reconnected.' : 'A player lost connection…', 'log-pd');
        break;

      case 'execute':
        progPanel.hide();
        this.awaitingMyProgram = false;
        this.#enqueue(() => app.animator.play(msg.events));
        this.#enqueue(() => this.#syncView(msg.robots));
        break;

      case 'needChoice':
        this.#enqueue(async () => {
          const choice = {};
          if (msg.kind === 'respawn' || msg.kind === 'both') {
            Object.assign(choice, await respawnModal());
          }
          if (msg.kind === 'stayDown' || msg.kind === 'both') {
            choice.stayDown = await stayDownModal(msg.damage);
          }
          this.#send({ t: 'choice', choice });
        });
        break;

      case 'cleanup':
        this.#enqueue(() => app.animator.play(msg.events));
        this.#enqueue(() => this.#syncView(msg.robots));
        break;

      case 'gameOver':
        this.#enqueue(async () => {
          const lines = msg.standings.map((s, i) =>
            `${i + 1}. ${s.name} — ${s.dead ? '☠ destroyed'
              : `⚑ ${s.nextFlag} · ${'♥'.repeat(Math.max(0, s.lives))}`}${s.winner ? ' 🏁 WINNER' : ''}`);
          const mine = msg.standings.find((s) => s.winner);
          const victory = !!msg.winner && msg.winner === this.me?.playerId;
          setBanner(victory ? '🏁 You win!' : 'Race over');
          const pick = await gameOverModal({
            victory,
            title: victory ? '🏁 Victory!' : mine ? `${mine.name} wins the race` : 'Race over',
            lines,
          });
          if (pick === 'again') {
            if (this.isHost) this.#send({ t: 'backToLobby' });
            this.lobby.showWaiting(this.isHost ? 'Returning to lobby…' : 'Waiting for the host to restart…');
          } else {
            this.leave();
          }
        });
        break;

      case 'backToLobby':
        this.lobby.showWaiting('Back in the lobby…');
        break;

      case 'snapshot':
        this.#resync(msg);
        break;

      default: break;
    }
  }

  #programPhase(msg) {
    const { setBanner, progPanel } = this.ctx;
    this.awaitingMyProgram = false;
    const you = msg.you;
    if (!you || you.dead) { setBanner(`Turn ${msg.turn} — spectating`); return; }
    if (you.poweredDown) { setBanner(`Turn ${msg.turn} — you are powered down, repairing…`); return; }
    if (!you.mustProgram) { setBanner(`Turn ${msg.turn} — waiting…`); return; }
    this.awaitingMyProgram = true;
    setBanner(`Turn ${msg.turn} — program your registers`);
    progPanel.show({ hand: you.hand, damage: you.damage, registers: you.lockedCards });
    progPanel.onLockIn = (cards, powerDown) => {
      this.awaitingMyProgram = false;
      this.#send({ t: 'program', priorities: cards.map((c) => c.priority), powerDown });
      progPanel.hide();
      setBanner('Program locked in — waiting for the others…');
    };
  }

  // Keep app.view robots (used by hover tooltips) in step with the server snapshots.
  #syncView(robots) {
    const view = this.ctx.app.view;
    if (!view || !robots) return;
    for (const r of robots) {
      const v = view.robots.get(r.id);
      if (v) Object.assign(v, r, { options: new Array(r.options || 0) });
    }
  }

  #buildView(courseIndex, robots, flagCount) {
    const board = COURSES[courseIndex]();
    // robots arrive with options as a count — HUD expects something with .length
    const viewRobots = robots.map((r) => ({ ...r, options: new Array(r.options || 0) }));
    this.ctx.setupGameView(board, viewRobots, flagCount);
  }

  #resync(msg) {
    const { app, setBanner, progPanel } = this.ctx;
    this.q = Promise.resolve(); // drop any stale queued animations
    if (msg.phase === 'lobby') { this.lobby.showWaiting('Back in the lobby…'); return; }
    this.lobby.hide();
    this.#buildView(msg.courseIndex, msg.robots, msg.flagCount);
    setBanner(`Turn ${msg.turn} — rejoined`);
    if (msg.needBid) {
      this.#onMessage({ t: 'bidStart', turn: msg.turn, events: [], robots: msg.robots, you: msg.you });
    } else if (msg.needPick) {
      this.#onMessage({ t: 'pickDock', free: msg.needPick });
    } else if (msg.phase === 'programming' && msg.you?.mustProgram) {
      this.#programPhase({ turn: msg.turn, you: msg.you });
    } else if (msg.needChoice) {
      this.#onMessage({ t: 'needChoice', kind: msg.needChoice, damage: msg.you?.damage ?? 0 });
    } else if (msg.phase === 'over') {
      setBanner('Race over');
    } else {
      setBanner(`Turn ${msg.turn} — waiting…`);
    }
  }

  #enqueue(fn) {
    this.q = this.q.then(fn).catch((e) => console.error('online queue:', e));
    return this.q;
  }
}
