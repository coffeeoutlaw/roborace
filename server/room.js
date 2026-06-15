// One online match: lobby -> turns -> game over. Server-authoritative — the room owns
// the engine state; clients only ever see public snapshots, their own hand, and the
// event stream. Sockets are anything with send(string)/readyState, so tests can drive
// rooms with fakes. All timers are injectable for the same reason.
import {
  createGame, startTurn, programRobot, announcePowerDown, executeRegisters,
  executeCleanup, needsRespawnChoice, needsStayDownChoice, robotById, isLocked,
  NUM_REGISTERS, submitBid, allBidsIn, resolveBids, currentPicker, freeDocks, placeRobot,
} from '../src/engine/engine.js';
import { buildFlagFields } from '../src/engine/distance.js';
import {
  chooseProgram, decidePowerDown, respawnChoice, decideStayDown, chooseBid, chooseDock,
} from '../src/engine/ai.js';
import { COURSES } from '../src/boards/index.js';

const COLORS = ['#4da6ff', '#ff5544', '#66dd77', '#ffcc33'];
const AI_POOL = [
  { name: 'Crusher', personality: 'crusher' },
  { name: 'Prudence', personality: 'prudence' },
  { name: 'Turbo', personality: 'turbo' },
];
export const MAX_PLAYERS = 4;

const sanitizeName = (n) => (String(n ?? '').replace(/[^\w .'-]/g, '').trim().slice(0, 14)) || 'Player';
const randKey = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);

export class Room {
  constructor(code, opts = {}) {
    this.code = code;
    this.onEmpty = opts.onEmpty || (() => {});
    // rulebook: 30s once a single player is still programming; 25s for cleanup choices
    this.programMs = opts.programMs ?? 30_000;
    this.choiceMs = opts.choiceMs ?? 25_000;
    this.graceMs = opts.graceMs ?? 15_000; // disconnected player's slack before AI takeover
    this.players = new Map(); // playerId -> {id, name, color, key, socket, connected, isHost}
    this.phase = 'lobby'; // lobby | programming | choices | over
    this.courseIndex = 0;
    this.fillAI = true;
    this.state = null;
    this.fields = null;
    this.submitted = new Set();
    this.required = new Set();
    this.pendingChoices = null; // {need: Map robotId->kind, got: {robotId: choice}}
    this.timers = new Map(); // label -> timeout handle
    this.seed = opts.seed ?? ((Date.now() % 0xfffffff) | 1);
  }

  // ---------- membership ----------

  addPlayer(socket, rawName) {
    if (this.phase !== 'lobby') throw new RoomError('Game already started');
    if (this.players.size >= MAX_PLAYERS) throw new RoomError('Room is full');
    const id = `p${this.players.size + 1}_${Math.random().toString(36).slice(2, 6)}`;
    const p = {
      id,
      name: this.#uniqueName(sanitizeName(rawName)),
      color: COLORS[this.players.size],
      key: randKey(),
      socket,
      connected: true,
      isHost: this.players.size === 0,
    };
    this.players.set(id, p);
    this.#broadcastLobby();
    return p;
  }

  rejoin(socket, playerId, key) {
    const p = this.players.get(playerId);
    if (!p || p.key !== key) throw new RoomError('Bad rejoin token');
    p.socket = socket;
    p.connected = true;
    this.#clearTimer(`grace:${playerId}`);
    if (this.phase === 'lobby') this.#broadcastLobby();
    else this.#sendSnapshot(p);
    return p;
  }

  removeSocket(socket) {
    for (const p of this.players.values()) {
      if (p.socket !== socket) continue;
      p.socket = null;
      p.connected = false;
      if (this.phase === 'lobby') {
        this.players.delete(p.id);
        if (p.isHost && this.players.size) {
          this.players.values().next().value.isHost = true;
        }
        this.#broadcastLobby();
      } else {
        // mid-game: give them a grace window to reconnect, then the AI takes over
        this.#broadcast({ t: 'playerConn', id: p.id, connected: false });
        if (this.phase === 'programming' && this.required.has(p.id) && !this.submitted.has(p.id)) {
          this.#setTimer(`grace:${p.id}`, this.graceMs, () => this.#aiProgram(p.id, 'disconnected'));
        }
        if (this.phase === 'choices' && this.pendingChoices?.need.has(p.id)) {
          this.#setTimer(`grace:${p.id}`, Math.min(this.graceMs, 5000),
            () => this.#aiChoice(p.id, 'disconnected'));
        }
        if (this.phase === 'bidding') {
          this.#setTimer(`grace:${p.id}`, Math.min(this.graceMs, 5000), () => this.#autoBid(p.id));
        }
        if (this.phase === 'placing' && currentPicker(this.state) === p.id) {
          this.#setTimer(`grace:${p.id}`, Math.min(this.graceMs, 5000),
            () => this.#applyPick(p.id, chooseDock(this.state, p.id, this.fields)));
        }
      }
      break;
    }
    if (![...this.players.values()].some((p) => p.connected)) this.onEmpty(this);
  }

  // ---------- lobby ----------

  config(playerId, { courseIndex, fillAI }) {
    const p = this.players.get(playerId);
    if (!p?.isHost || this.phase !== 'lobby') return;
    if (Number.isInteger(courseIndex) && COURSES[courseIndex]) this.courseIndex = courseIndex;
    if (typeof fillAI === 'boolean') this.fillAI = fillAI;
    this.#broadcastLobby();
  }

  start(playerId) {
    const p = this.players.get(playerId);
    if (!p?.isHost || this.phase !== 'lobby') return;
    const roster = [...this.players.values()].map((h) => ({
      id: h.id, name: h.name, color: h.color, isAI: false, personality: null,
    }));
    if (this.fillAI) {
      let ai = 0;
      while (roster.length < MAX_PLAYERS) {
        const a = AI_POOL[ai++];
        roster.push({
          id: `ai_${a.personality}`, name: a.name,
          color: COLORS[roster.length], isAI: true, personality: a.personality,
        });
      }
    }
    if (roster.length < 2) throw new RoomError('Need at least 2 robots — enable AI fill or invite a friend');
    const board = COURSES[this.courseIndex]();
    this.state = createGame({ board, seed: this.seed, roster, placement: 'bid' });
    this.fields = buildFlagFields(board);
    this.#broadcast({
      t: 'started',
      courseIndex: this.courseIndex,
      robots: this.#publicRobots(),
      flagCount: board.flags.length,
    });
    this.#turn();
  }

  // ---------- turn flow ----------

  #turn() {
    const st = this.state;
    const events = startTurn(st);
    if (st.placement?.pending) {
      this.#bidPhase(events);
      return;
    }
    this.#programPhase(events);
  }

  // ----- start-position auction (turn 1) -----

  #bidPhase(startEvents) {
    const st = this.state;
    this.phase = 'bidding';
    for (const r of st.robots) {
      if (r.dead || this.players.has(r.id)) continue;
      submitBid(st, r.id, chooseBid(st, r.id)); // AI seats bid immediately
    }
    for (const p of this.players.values()) {
      this.#send(p, {
        t: 'bidStart',
        turn: st.turn,
        events: startEvents,
        robots: this.#publicRobots(),
        you: { hand: robotById(st, p.id)?.hand ?? [] },
      });
      if (!p.connected) this.#autoBid(p.id);
    }
    // whole-table bid timer — nobody can stall the auction
    this.#setTimer('bidAll', this.programMs + 5000, () => {
      for (const p of this.players.values()) this.#autoBid(p.id);
    });
    this.#maybeReveal();
  }

  handleBid(playerId, priority) {
    if (this.phase !== 'bidding') return;
    try {
      submitBid(this.state, playerId, priority);
    } catch (e) {
      this.#error(playerId, e.message);
      return;
    }
    this.#maybeReveal();
  }

  #autoBid(playerId) {
    if (this.phase !== 'bidding') return;
    const st = this.state;
    if (!robotById(st, playerId) || st.placement.bids[playerId]) return;
    submitBid(st, playerId, chooseBid(st, playerId));
    this.#maybeReveal();
  }

  #maybeReveal() {
    if (this.phase !== 'bidding' || !allBidsIn(this.state)) return;
    this.#clearTimer('bidAll');
    this.phase = 'placing';
    this.#broadcast({ t: 'placing', events: resolveBids(this.state), robots: this.#publicRobots() });
    this.#nextPick();
  }

  #nextPick() {
    if (this.phase !== 'placing') return;
    const st = this.state;
    const picker = currentPicker(st);
    if (!picker) {
      this.#programPhase([]); // placement done; startTurn events were already sent
      return;
    }
    const human = this.players.get(picker);
    if (!human) {
      this.#applyPick(picker, chooseDock(st, picker, this.fields));
    } else if (!human.connected) {
      this.#setTimer(`grace:${picker}`, Math.min(3000, this.graceMs),
        () => this.#applyPick(picker, chooseDock(st, picker, this.fields)));
    } else {
      this.#send(human, { t: 'pickDock', free: freeDocks(st), timer: this.choiceMs / 1000 });
      this.#setTimer(`pick:${picker}`, this.choiceMs, () => {
        this.#applyPick(picker, chooseDock(st, picker, this.fields));
        this.#broadcast({ t: 'note', text: `${human.name} took too long — autopilot picked a dock.` });
      });
    }
  }

  handlePick(playerId, dock) {
    if (this.phase !== 'placing' || currentPicker(this.state) !== playerId) return;
    try {
      this.#applyPick(playerId, dock);
    } catch (e) {
      this.#error(playerId, e.message);
      this.#nextPick(); // re-prompt: still their pick
    }
  }

  #applyPick(playerId, dock) {
    const events = placeRobot(this.state, playerId, dock);
    this.#clearTimer(`pick:${playerId}`);
    this.#clearTimer(`grace:${playerId}`);
    this.#broadcast({ t: 'placing', events, robots: this.#publicRobots() });
    this.#nextPick();
  }

  // ----- programming -----

  #programPhase(events) {
    const st = this.state;
    this.phase = 'programming';
    this.submitted = new Set();
    this.required = new Set();

    for (const r of st.robots) {
      if (r.dead || r.poweredDown) continue;
      const human = this.players.get(r.id);
      if (!human) {
        const cards = chooseProgram(st, r.id, this.fields);
        programRobot(st, r.id, cards);
        announcePowerDown(st, r.id, decidePowerDown(st, r.id));
      } else if (!human.connected) {
        this.#setTimer(`grace:${r.id}`, this.graceMs, () => this.#aiProgram(r.id, 'disconnected'));
        this.required.add(r.id);
      } else {
        this.required.add(r.id);
      }
    }

    for (const p of this.players.values()) {
      this.#send(p, {
        t: 'turnStart',
        turn: st.turn,
        events,
        robots: this.#publicRobots(),
        you: this.#privateFor(p.id),
      });
    }
    this.#progress();
    this.#maybeExecute();
  }

  handleProgram(playerId, priorities, powerDown) {
    if (this.phase !== 'programming' || !this.required.has(playerId) || this.submitted.has(playerId)) return;
    const r = robotById(this.state, playerId);
    const cards = (Array.isArray(priorities) ? priorities : []).map(
      (pr) => r.hand.find((c) => c.priority === pr),
    );
    if (cards.some((c) => !c)) { this.#error(playerId, 'Card not in your hand'); return; }
    try {
      programRobot(this.state, playerId, cards);
    } catch (e) {
      this.#error(playerId, e.message);
      return;
    }
    announcePowerDown(this.state, playerId, !!powerDown);
    this.submitted.add(playerId);
    this.#clearTimer(`grace:${playerId}`);
    this.#progress();
    this.#maybeExecute();
  }

  // Rulebook: once one straggler remains, flip the 30s timer; on expiry their
  // registers are filled randomly (not by the AI — that's the printed rule).
  #progress() {
    const waiting = [...this.required].filter((id) => !this.submitted.has(id));
    if (this.phase !== 'programming') return;
    let timer = null;
    if (waiting.length === 1 && this.required.size > 1) {
      const lone = waiting[0];
      if (!this.timers.has(`lone:${lone}`)) {
        this.#setTimer(`lone:${lone}`, this.programMs, () => this.#randomFill(lone));
      }
      timer = this.programMs / 1000;
    }
    this.#broadcast({
      t: 'progress',
      waitingOn: waiting.map((id) => this.players.get(id)?.name || id),
      timer,
    });
  }

  #randomFill(playerId) {
    if (this.phase !== 'programming' || this.submitted.has(playerId)) return;
    const r = robotById(this.state, playerId);
    const hand = [...r.hand];
    for (let i = hand.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [hand[i], hand[j]] = [hand[j], hand[i]];
    }
    const slots = [];
    for (let i = 0; i < NUM_REGISTERS; i++) if (!isLocked(r, i)) slots.push(i);
    programRobot(this.state, playerId, hand.slice(0, slots.length));
    this.submitted.add(playerId);
    this.#broadcast({ t: 'note', text: `${this.players.get(playerId)?.name} ran out of time — registers filled at random!` });
    this.#progress();
    this.#maybeExecute();
  }

  #aiProgram(playerId, why) {
    if (this.phase !== 'programming' || this.submitted.has(playerId)) return;
    const cards = chooseProgram(this.state, playerId, this.fields);
    programRobot(this.state, playerId, cards);
    announcePowerDown(this.state, playerId, decidePowerDown(this.state, playerId));
    this.submitted.add(playerId);
    if (why === 'disconnected') {
      this.#broadcast({ t: 'note', text: `${this.players.get(playerId)?.name} disconnected — autopilot engaged.` });
    }
    this.#progress();
    this.#maybeExecute();
  }

  #maybeExecute() {
    if (this.phase !== 'programming') return;
    if ([...this.required].some((id) => !this.submitted.has(id))) return;
    for (const label of [...this.timers.keys()]) {
      if (label.startsWith('lone:')) this.#clearTimer(label);
    }
    const st = this.state;
    const events = executeRegisters(st);
    this.#broadcast({ t: 'execute', events, robots: this.#publicRobots() });
    this.#collectChoices();
  }

  #collectChoices() {
    this.phase = 'choices';
    const st = this.state;
    const need = new Map();
    for (const r of needsRespawnChoice(st)) need.set(r.id, 'respawn');
    for (const r of needsStayDownChoice(st)) {
      need.set(r.id, need.has(r.id) ? 'both' : 'stayDown');
    }
    this.pendingChoices = { need, got: {} };

    for (const [id, kind] of need) {
      const human = this.players.get(id);
      if (!human) {
        this.#aiChoice(id);
      } else if (!human.connected) {
        this.#setTimer(`grace:${id}`, 5000, () => this.#aiChoice(id, 'disconnected'));
      } else {
        const r = robotById(st, id);
        this.#send(human, { t: 'needChoice', kind, damage: r.damage, timer: this.choiceMs / 1000 });
        this.#setTimer(`choice:${id}`, this.choiceMs, () => this.#aiChoice(id, 'timeout'));
      }
    }
    this.#maybeCleanup();
  }

  handleChoice(playerId, choice) {
    if (this.phase !== 'choices' || !this.pendingChoices?.need.has(playerId)) return;
    if (this.pendingChoices.got[playerId]) return;
    const kind = this.pendingChoices.need.get(playerId);
    const clean = {};
    if (kind === 'respawn' || kind === 'both') {
      clean.dir = [0, 1, 2, 3].includes(choice?.dir) ? choice.dir : 0;
      clean.powerDown = !!choice?.powerDown;
    }
    if (kind === 'stayDown' || kind === 'both') clean.stayDown = !!choice?.stayDown;
    this.pendingChoices.got[playerId] = clean;
    this.#clearTimer(`choice:${playerId}`);
    this.#clearTimer(`grace:${playerId}`);
    this.#maybeCleanup();
  }

  #aiChoice(playerId, why) {
    if (this.phase !== 'choices' || !this.pendingChoices?.need.has(playerId)) return;
    if (this.pendingChoices.got[playerId]) return;
    const kind = this.pendingChoices.need.get(playerId);
    const c = {};
    if (kind === 'respawn' || kind === 'both') {
      Object.assign(c, respawnChoice(this.state, playerId, this.fields));
    }
    if (kind === 'stayDown' || kind === 'both') c.stayDown = decideStayDown(this.state, playerId);
    this.pendingChoices.got[playerId] = c;
    if (why === 'timeout') {
      this.#broadcast({ t: 'note', text: `${this.players.get(playerId)?.name} took too long — autopilot chose.` });
    }
    this.#maybeCleanup();
  }

  #maybeCleanup() {
    const pc = this.pendingChoices;
    if (this.phase !== 'choices' || !pc) return;
    if ([...pc.need.keys()].some((id) => !pc.got[id])) return;
    const st = this.state;
    const events = executeCleanup(st, pc.got);
    this.pendingChoices = null;
    this.#broadcast({ t: 'cleanup', events, robots: this.#publicRobots() });

    const alive = st.robots.filter((r) => !r.dead);
    const humansAlive = alive.some((r) => this.players.has(r.id));
    let winner = st.winner;
    if (!winner && alive.length === 1) winner = alive[0].id;
    if (winner || alive.length === 0 || !humansAlive) {
      this.phase = 'over';
      this.#broadcast({ t: 'gameOver', winner: winner || null, standings: this.#standings(winner) });
      return;
    }
    this.#turn();
  }

  // After game over the room returns to the lobby for a rematch (host action).
  backToLobby(playerId) {
    if (this.phase !== 'over') return;
    if (!this.players.get(playerId)?.isHost) return;
    this.phase = 'lobby';
    this.state = null;
    this.seed = (this.seed * 31 + 17) % 0xfffffff | 1;
    this.#clearAllTimers();
    this.#broadcast({ t: 'backToLobby' });
    this.#broadcastLobby();
  }

  // ---------- payload builders ----------

  #publicRobots() {
    return this.state.robots.map((r) => ({
      id: r.id, name: r.name, color: r.color, isAI: r.isAI, personality: r.personality,
      x: r.x, y: r.y, dir: r.dir, damage: r.damage, lives: r.lives, nextFlag: r.nextFlag,
      poweredDown: r.poweredDown, destroyed: r.destroyed, dead: r.dead,
      options: r.options.length,
      archiveX: r.archiveX, archiveY: r.archiveY,
    }));
  }

  #privateFor(playerId) {
    const r = robotById(this.state, playerId);
    if (!r) return null;
    const lockedCards = r.registers.map((c, i) => (isLocked(r, i) ? c : null));
    return {
      hand: r.hand,
      damage: r.damage,
      lockedCards,
      poweredDown: r.poweredDown,
      dead: r.dead,
      destroyed: r.destroyed,
      mustProgram: this.required.has(playerId) && !this.submitted.has(playerId),
      options: r.options.length,
    };
  }

  #standings(winner) {
    return [...this.state.robots]
      .sort((a, b) => (b.nextFlag - a.nextFlag) || (b.lives - a.lives))
      .map((r) => ({
        name: r.name, color: r.color, nextFlag: r.nextFlag, lives: r.lives,
        dead: r.dead, winner: r.id === winner,
      }));
  }

  #sendSnapshot(p) {
    const st = this.state;
    this.#send(p, {
      t: 'snapshot',
      phase: this.phase,
      courseIndex: this.courseIndex,
      turn: st?.turn ?? 0,
      robots: st ? this.#publicRobots() : [],
      flagCount: st?.board.flags.length ?? 0,
      you: st ? this.#privateFor(p.id) : null,
      needChoice: this.pendingChoices?.need.has(p.id) && !this.pendingChoices.got[p.id]
        ? this.pendingChoices.need.get(p.id) : null,
      needBid: this.phase === 'bidding' && st && !st.placement.bids[p.id]
        && !robotById(st, p.id)?.dead,
      needPick: this.phase === 'placing' && st && currentPicker(st) === p.id
        ? freeDocks(st) : null,
    });
    this.#broadcast({ t: 'playerConn', id: p.id, connected: true });
  }

  // ---------- plumbing ----------

  #uniqueName(name) {
    let n = name, i = 2;
    const taken = () => [...this.players.values()].some((p) => p.name === n);
    while (taken()) n = `${name} ${i++}`;
    return n;
  }

  #lobbyPayload() {
    return {
      t: 'lobby',
      code: this.code,
      courseIndex: this.courseIndex,
      fillAI: this.fillAI,
      players: [...this.players.values()].map((p) => ({
        id: p.id, name: p.name, color: p.color, isHost: p.isHost, connected: p.connected,
      })),
    };
  }

  #broadcastLobby() { this.#broadcast(this.#lobbyPayload()); }

  #send(p, msg) {
    if (p.socket && p.socket.readyState === 1) p.socket.send(JSON.stringify(msg));
  }

  #broadcast(msg) {
    const s = JSON.stringify(msg);
    for (const p of this.players.values()) {
      if (p.socket && p.socket.readyState === 1) p.socket.send(s);
    }
  }

  #error(playerId, msg) {
    const p = this.players.get(playerId);
    if (p) this.#send(p, { t: 'error', msg });
  }

  #setTimer(label, ms, fn) {
    this.#clearTimer(label);
    this.timers.set(label, setTimeout(() => { this.timers.delete(label); fn(); }, ms));
  }

  #clearTimer(label) {
    const h = this.timers.get(label);
    if (h) { clearTimeout(h); this.timers.delete(label); }
  }

  #clearAllTimers() {
    for (const h of this.timers.values()) clearTimeout(h);
    this.timers.clear();
  }

  destroy() { this.#clearAllTimers(); }
}

export class RoomError extends Error {}
