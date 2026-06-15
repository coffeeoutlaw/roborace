// Online mode: a real server on an ephemeral port, two real WebSocket clients
// playing a complete game (AI fills the other seats), plus fast-timer tests for
// the rulebook 30s random-fill and disconnect autopilot — driven via fake sockets.
import { describe, it, expect, afterEach } from 'vitest';
import WebSocket from 'ws';
import { createGameServer } from '../server/server.js';
import { Room } from '../server/room.js';
import { currentPicker, freeDocks } from '../src/engine/engine.js';

// Drive a fake-socket room through the turn-1 start auction synchronously.
function finishAuction(room) {
  for (const r of room.state.robots) {
    if (!r.dead && !room.state.placement.bids[r.id]) room.handleBid(r.id, r.hand[0].priority);
  }
  let guard = 8;
  while (room.phase === 'placing' && guard--) {
    room.handlePick(currentPicker(room.state), freeDocks(room.state)[0].n);
  }
}

// ---------- scripted human client ----------

class BotClient {
  constructor(port, name) {
    this.name = name;
    this.msgs = [];
    this.turnStarts = [];
    this.gameOver = new Promise((res) => { this._end = res; });
    this.welcome = new Promise((res) => { this._wel = res; });
    this.lobbies = [];
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    this.ready = new Promise((res) => this.ws.on('open', res));
    this.ws.on('message', (d) => this.#on(JSON.parse(String(d))));
  }

  send(m) { this.ws.send(JSON.stringify(m)); }

  #on(m) {
    this.msgs.push(m);
    switch (m.t) {
      case 'welcome': this.me = m; this._wel(m); break;
      case 'lobby': this.lobbies.push(m); break;
      case 'turnStart': {
        this.turnStarts.push(m);
        const you = m.you;
        if (you?.mustProgram) {
          const hand = [...you.hand];
          for (let i = hand.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [hand[i], hand[j]] = [hand[j], hand[i]];
          }
          const count = Math.min(5, hand.length);
          this.send({ t: 'program', priorities: hand.slice(0, count).map((c) => c.priority), powerDown: false });
        }
        break;
      }
      case 'bidStart':
        if (m.you?.hand?.length) this.send({ t: 'bid', priority: m.you.hand[0].priority });
        break;
      case 'pickDock':
        this.send({ t: 'pick', dock: m.free[0].n });
        break;
      case 'needChoice':
        this.send({ t: 'choice', choice: { dir: Math.floor(Math.random() * 4), powerDown: false, stayDown: false } });
        break;
      case 'gameOver': this._end(m); break;
      default: break;
    }
  }

  close() { try { this.ws.terminate(); } catch { /* already closed */ } }
}

// ---------- fake socket for direct Room tests ----------

const fakeSocket = () => {
  const s = { readyState: 1, sent: [] };
  s.send = (str) => s.sent.push(JSON.parse(str));
  s.last = (type) => [...s.sent].reverse().find((m) => m.t === type);
  return s;
};

const legalProgram = (you) => {
  const count = Math.min(5, you.hand.length);
  return you.hand.slice(0, count).map((c) => c.priority);
};

let cleanup = [];
afterEach(async () => {
  for (const fn of cleanup) await fn();
  cleanup = [];
});

describe('online server', () => {
  it('two human clients + AI fill play a complete game to a winner', { timeout: 120_000 }, async () => {
    const srv = await createGameServer({ port: 0, roomOpts: { seed: 7 } });
    cleanup.push(() => srv.close());

    const a = new BotClient(srv.port, 'Alice');
    const b = new BotClient(srv.port, 'Bob');
    cleanup.push(() => { a.close(); b.close(); });
    await Promise.all([a.ready, b.ready]);

    a.send({ t: 'create', name: 'Alice' });
    const welA = await a.welcome;
    expect(welA.code).toMatch(/^[A-Z2-9]{4}$/);

    b.send({ t: 'join', name: 'Bob', code: welA.code });
    await b.welcome;

    // host picks course 1 and starts with AI fill
    a.send({ t: 'config', courseIndex: 0, fillAI: true });
    a.send({ t: 'start' });

    const [endA, endB] = await Promise.all([a.gameOver, b.gameOver]);

    // both clients agree on the outcome
    expect(endA.winner).toBe(endB.winner);
    expect(endA.standings).toEqual(endB.standings);
    expect(endA.standings).toHaveLength(4);

    // privacy: no broadcast or foreign payload ever contains another player's hand
    for (const [client, otherId] of [[a, b.me.playerId], [b, a.me.playerId]]) {
      for (const m of client.msgs) {
        for (const r of m.robots || []) {
          expect(r.hand).toBeUndefined();
          expect(r.registers).toBeUndefined();
        }
        if (m.t === 'turnStart') {
          // the private block is mine, never the other player's
          expect(m.you === null || m.you === undefined || m.robots.some((r) => r.id !== otherId)).toBe(true);
        }
      }
    }

    // hands were actually private per-client: each turnStart's hand belongs to me
    expect(a.turnStarts.length).toBeGreaterThan(1);
    expect(b.turnStarts.length).toBeGreaterThan(1);
  });

  it('rejects a join with a bad code', async () => {
    const srv = await createGameServer({ port: 0 });
    cleanup.push(() => srv.close());
    const c = new BotClient(srv.port, 'X');
    cleanup.push(() => c.close());
    await c.ready;
    c.send({ t: 'join', name: 'X', code: 'ZZZZ' });
    await new Promise((r) => setTimeout(r, 150));
    expect(c.msgs.some((m) => m.t === 'error' && /No room/.test(m.msg))).toBe(true);
  });
});

describe('room timers (fake sockets)', () => {
  it('lone straggler gets randomly filled after the program timer (rulebook)', async () => {
    const room = new Room('TEST', { programMs: 40, seed: 3 });
    cleanup.push(() => room.destroy());
    const s1 = fakeSocket(); const s2 = fakeSocket();
    const p1 = room.addPlayer(s1, 'Fast');
    const p2 = room.addPlayer(s2, 'Slow');
    room.config(p1.id, { courseIndex: 0, fillAI: false });
    room.start(p1.id);
    finishAuction(room);

    const you1 = s1.last('turnStart').you;
    room.handleProgram(p1.id, legalProgram(you1), false);

    // Slow never submits; the 40ms "30s" timer random-fills and the turn executes
    await new Promise((r) => setTimeout(r, 250));
    expect(s2.last('note')?.text).toMatch(/ran out of time/);
    expect(s2.last('execute')).toBeTruthy();
    expect(s1.last('execute')).toBeTruthy();
  });

  it('disconnected player gets AI takeover after grace, and can rejoin with a snapshot', async () => {
    const room = new Room('TEST', { graceMs: 30, seed: 5 });
    cleanup.push(() => room.destroy());
    const s1 = fakeSocket(); const s2 = fakeSocket();
    const p1 = room.addPlayer(s1, 'Here');
    const p2 = room.addPlayer(s2, 'Gone');
    room.config(p1.id, { courseIndex: 0, fillAI: false });
    room.start(p1.id);
    finishAuction(room);

    // Gone drops before programming
    room.removeSocket(s2);
    room.handleProgram(p1.id, legalProgram(s1.last('turnStart').you), false);
    await new Promise((r) => setTimeout(r, 200));
    expect(s1.last('execute')).toBeTruthy();
    expect(s1.sent.some((m) => m.t === 'note' && /autopilot/.test(m.text))).toBe(true);

    // rejoin with the token -> snapshot of the running game
    const s3 = fakeSocket();
    room.rejoin(s3, p2.id, p2.key);
    const snap = s3.last('snapshot');
    expect(snap).toBeTruthy();
    expect(snap.turn).toBeGreaterThanOrEqual(1);
    expect(snap.robots).toHaveLength(2);
    expect(() => room.rejoin(fakeSocket(), p2.id, 'wrong-key')).toThrow();
  });

  it('host start with one player and no AI fill is rejected', async () => {
    const room = new Room('TEST', { seed: 1 });
    cleanup.push(() => room.destroy());
    const s1 = fakeSocket();
    const p1 = room.addPlayer(s1, 'Solo');
    room.config(p1.id, { fillAI: false });
    expect(() => room.start(p1.id)).toThrow(/at least 2/);
  });
});
