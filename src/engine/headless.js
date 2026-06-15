// Headless turn runner: drives every robot with the AI. Used by the AI integration
// test and by window.__game for frozen-rAF-safe verification in the browser preview.
import {
  createGame, startTurn, programRobot, announcePowerDown, executeRegisters,
  executeCleanup, needsRespawnChoice, needsStayDownChoice,
  submitBid, resolveBids, currentPicker, placeRobot,
} from './engine.js';
import { buildFlagFields } from './distance.js';
import {
  chooseProgram, decidePowerDown, respawnChoice, decideStayDown, chooseBid, chooseDock,
} from './ai.js';

// Resolve a pending start-position bid entirely with the AI (used when a game
// created with placement:'bid' is driven headlessly).
export function autoResolvePlacement(state, fields) {
  const events = [];
  if (!state.placement?.pending) return events;
  if (!state.placement.order) {
    for (const r of state.robots) {
      if (!r.dead && !state.placement.bids[r.id]) submitBid(state, r.id, chooseBid(state, r.id));
    }
    events.push(...resolveBids(state));
  }
  let picker;
  while ((picker = currentPicker(state))) {
    events.push(...placeRobot(state, picker, chooseDock(state, picker, fields)));
  }
  return events;
}

export const DEFAULT_ROSTER = [
  { id: 'you', name: 'You', color: '#4da6ff', isAI: false, personality: null },
  { id: 'crusher', name: 'Crusher', color: '#ff5544', isAI: true, personality: 'crusher' },
  { id: 'prudence', name: 'Prudence', color: '#66dd77', isAI: true, personality: 'prudence' },
  { id: 'turbo', name: 'Turbo', color: '#ffcc33', isAI: true, personality: 'turbo' },
];

// Run one full turn with every robot AI-controlled. Returns all events.
export function autoTurn(state, fields) {
  const events = [];
  events.push(...startTurn(state));
  if (state.placement?.pending) events.push(...autoResolvePlacement(state, fields));
  for (const r of state.robots) {
    if (r.dead || r.poweredDown) continue;
    const cards = chooseProgram(state, r.id, fields);
    programRobot(state, r.id, cards);
    announcePowerDown(state, r.id, decidePowerDown(state, r.id));
  }
  events.push(...executeRegisters(state));
  const choices = {};
  for (const r of needsRespawnChoice(state)) {
    choices[r.id] = respawnChoice(state, r.id, fields);
  }
  for (const r of needsStayDownChoice(state)) {
    choices[r.id] = { ...(choices[r.id] || {}), stayDown: decideStayDown(state, r.id) };
  }
  events.push(...executeCleanup(state, choices));
  return events;
}

// Play a complete AI-only game. Returns {winner, turns, state}.
export function runHeadlessGame(board, seed, maxTurns = 80) {
  const state = createGame({ board, seed, roster: DEFAULT_ROSTER });
  const fields = buildFlagFields(board);
  while (!state.winner && state.turn < maxTurns) {
    autoTurn(state, fields);
    const alive = state.robots.filter((r) => !r.dead);
    if (alive.length === 1) return { winner: alive[0].id, turns: state.turn, state, lastBot: true };
    if (alive.length === 0) return { winner: null, turns: state.turn, state, wipeout: true };
  }
  return { winner: state.winner, turns: state.turn, state };
}
