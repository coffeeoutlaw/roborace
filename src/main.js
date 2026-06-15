// Game controller: menu -> turns (deal -> program -> execute -> cleanup) -> game over.
import {
  createGame, startTurn, programRobot, announcePowerDown, executeRegisters,
  executeCleanup, needsRespawnChoice, needsStayDownChoice, robotById,
  submitBid, resolveBids, currentPicker, freeDocks, placeRobot,
} from './engine/engine.js';
import { buildFlagFields } from './engine/distance.js';
import {
  chooseProgram, decidePowerDown, respawnChoice, decideStayDown, chooseBid, chooseDock,
} from './engine/ai.js';
import { autoTurn, runHeadlessGame, DEFAULT_ROSTER } from './engine/headless.js';
import { COURSES } from './boards/index.js';
import { createScene } from './render/scene.js';
import { BoardView } from './render/boardView.js';
import { RobotView } from './render/robotView.js';
import { Animator } from './render/animator.js';
import { Hud } from './ui/hud.js';
import { Log } from './ui/log.js';
import { ProgrammingPanel } from './ui/programming.js';
import {
  respawnModal, stayDownModal, gameOverModal, courseMenu, titleScreen,
} from './ui/modals.js';
import { BoardTooltip } from './ui/tooltip.js';
import { OnlineGame } from './net/online.js';
import { sfx } from './audio/sfx.js';
import { music } from './audio/music.js';

const params = new URLSearchParams(location.search);
const SEED = params.has('test') ? (Number(params.get('test')) || 1) : ((Date.now() % 0xfffffff) | 1);
const FAST = params.has('fast');

const sceneCtl = createScene(document.getElementById('scene'));
const progPanel = new ProgrammingPanel(document.getElementById('programming'));
const topBanner = document.getElementById('banner');
const speedBtns = document.getElementById('speed');

const app = {
  state: null, fields: null, courseIndex: 0,
  boardView: null, robotViews: new Map(), animator: null, hud: null, log: null,
  view: null, // {board, robots: Map} — what's on screen (works in online mode too)
  viewTurn: 0,
  phase: 'menu',
  mode: 'local', // 'local' | 'online'
  gen: 0, // bumped per game setup; lets in-flight async turns detect they're stale
};

const tooltip = new BoardTooltip(sceneCtl, app);

function setBanner(text) { topBanner.textContent = text; }

speedBtns.addEventListener('click', (e) => {
  const s = e.target.dataset.speed;
  if (!s || !app.animator) return;
  app.animator.speed = s === 'skip' ? Infinity : Number(s);
  speedBtns.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === e.target));
});

function teardown() {
  if (app.boardView) sceneCtl.scene.remove(app.boardView.group);
  for (const v of app.robotViews.values()) sceneCtl.scene.remove(v.group);
  app.robotViews.clear();
}

// Shared by local and online games: rebuilds the 3D view, HUD, log, and animator
// for a board + roster. `robots` are plain robot-shaped objects (engine robots
// locally; server snapshots online).
function setupGameView(board, robots, flagCount) {
  app.gen += 1;
  tooltip.hide();
  teardown();
  app.boardView = new BoardView(sceneCtl.scene, board);
  for (const r of robots) {
    const v = new RobotView(sceneCtl.scene, app.boardView, r);
    if (r.placed === false) v.setVisible(false); // appears when its dock is picked
    app.robotViews.set(r.id, v);
  }
  app.view = { board, robots: new Map(robots.map((r) => [r.id, r])) };
  const names = new Map(robots.map((r) => [r.id, r.name]));
  app.log = new Log(document.getElementById('log'), names);
  app.hud = new Hud(document.getElementById('hud'), robots, flagCount);
  app.viewTurn = 0;
  app.animator = new Animator({
    scene: sceneCtl.scene,
    boardView: app.boardView,
    robotViews: app.robotViews,
    onEvent: (e) => {
      app.hud.onEvent(e);
      app.log.onEvent(e);
      sfx.onEvent(e, app.animator?.speed === Infinity);
      if (e.type === 'turn') app.viewTurn = e.n;
      if (e.type === 'register') setBanner(`Turn ${app.viewTurn} — Register ${e.n}/5`);
    },
  });
  if (FAST) app.animator.speed = Infinity;
  app.phase = 'playing';
  document.getElementById('game-ui').classList.remove('hidden');
}

function startCourse(ci, seed = SEED) {
  app.mode = 'local';
  app.courseIndex = ci;
  const board = COURSES[ci]();
  app.state = createGame({ board, seed, roster: DEFAULT_ROSTER, placement: 'bid' });
  app.fields = buildFlagFields(board);
  setupGameView(board, app.state.robots, board.flags.length);
  beginTurn();
}

// Click-to-pick a starting dock: highlights the free docks, resolves with the dock
// number the player clicks. Shared by local and online play.
function pickDockUI(free) {
  return new Promise((res) => {
    app.boardView.highlightDocks(free);
    setBanner('🏁 Your pick — click a glowing dock to deploy');
    const canvas = sceneCtl.renderer.domElement;
    const onClick = (e) => {
      const cell = tooltip.cellAt(e);
      const dock = cell && free.find((d) => d.x === cell.x && d.y === cell.y);
      if (!dock) return;
      sfx.play('confirm');
      canvas.removeEventListener('click', onClick);
      app.boardView.clearDockHighlights();
      res(dock.n);
    };
    canvas.addEventListener('click', onClick);
  });
}

// Turn-1 start-position auction (local game): AIs bid in character, you pick a card,
// then docks are chosen in bid-priority order.
async function runPlacementLocal(gen) {
  const st = app.state;
  for (const r of st.robots) {
    if (r.isAI) submitBid(st, r.id, chooseBid(st, r.id));
  }
  setBanner('🏁 Bid for starting position');
  const me = robotById(st, 'you');
  const priority = await progPanel.showBid(me.hand);
  if (gen !== app.gen) return;
  submitBid(st, 'you', priority);
  await app.animator.play(resolveBids(st));

  let picker;
  while ((picker = currentPicker(st))) {
    if (gen !== app.gen) return;
    if (picker === 'you') {
      const dock = await pickDockUI(freeDocks(st));
      if (gen !== app.gen) return;
      await app.animator.play(placeRobot(st, 'you', dock));
    } else {
      setBanner(`${robotById(st, picker).name} picks a dock…`);
      await app.animator.play(placeRobot(st, picker, chooseDock(st, picker, app.fields)));
    }
  }
}

async function beginTurn() {
  const gen = app.gen;
  const st = app.state;
  const events = startTurn(st);
  setBanner(`Turn ${st.turn} — program your registers`);
  await app.animator.play(events);
  if (gen !== app.gen) return; // a new course was started mid-animation

  if (st.placement?.pending) {
    await runPlacementLocal(gen);
    if (gen !== app.gen) return;
    setBanner(`Turn ${st.turn} — program your registers`);
  }

  const me = robotById(st, 'you');

  // AIs program now (their choices don't depend on the player's secret program)
  for (const r of st.robots) {
    if (!r.isAI || r.dead || r.poweredDown) continue;
    const cards = chooseProgram(st, r.id, app.fields);
    programRobot(st, r.id, cards);
    announcePowerDown(st, r.id, decidePowerDown(st, r.id));
  }

  if (me.dead) return; // defeat screen already queued by execute()

  if (me.poweredDown) {
    setBanner(`Turn ${st.turn} — you are powered down`);
    progPanel.root.classList.remove('hidden', 'peek');
    progPanel.body.innerHTML =
      '<div class="btn-row"><div class="prog-info">You are powered down — systems repairing.</div>' +
      '<button class="lockin" id="run-pd">Run turn ▶</button></div>';
    document.getElementById('run-pd').addEventListener('click', () => {
      progPanel.hide();
      execute();
    });
    return;
  }

  progPanel.show(me);
  progPanel.onLockIn = (cards, powerDown) => {
    programRobot(st, 'you', cards);
    announcePowerDown(st, 'you', powerDown);
    execute();
  };
}

async function execute() {
  const gen = app.gen;
  const st = app.state;
  const events = executeRegisters(st);
  await app.animator.play(events);
  if (gen !== app.gen) return;

  // cleanup decisions
  const choices = {};
  for (const r of needsRespawnChoice(st)) {
    if (r.isAI) choices[r.id] = respawnChoice(st, r.id, app.fields);
  }
  for (const r of needsStayDownChoice(st)) {
    if (r.isAI) choices[r.id] = { stayDown: decideStayDown(st, r.id) };
  }
  const me = robotById(st, 'you');
  if (me.destroyed && !me.dead) choices.you = await respawnModal();
  else if (me.poweredDown && !me.destroyed && !me.dead && !st.winner) {
    choices.you = { stayDown: await stayDownModal(me.damage) };
  }
  if (gen !== app.gen) return;

  const cleanupEvents = executeCleanup(st, choices);
  await app.animator.play(cleanupEvents);
  if (gen !== app.gen) return;

  if (st.winner || me.dead) return gameOver();
  beginTurn();
}

async function gameOver() {
  const st = app.state;
  const me = robotById(st, 'you');
  const standings = [...st.robots]
    .sort((a, b) => (b.nextFlag - a.nextFlag) || (b.lives - a.lives))
    .map((r, i) => {
      const status = r.dead ? '☠ destroyed' : `⚑ ${r.nextFlag}/${st.board.flags.length} · ${'♥'.repeat(r.lives)}`;
      return `${i + 1}. ${r.name} — ${status}${st.winner === r.id ? ' 🏁 WINNER' : ''}`;
    });
  const victory = st.winner === 'you';
  setBanner(victory ? '🏁 You win!' : 'Race over');
  const choice = await gameOverModal({
    victory,
    title: victory ? '🏁 Victory!' :
      me.dead ? '☠ Your robot is scrap' : `${robotById(st, st.winner)?.name} wins the race`,
    lines: standings,
  });
  if (choice === 'again') startCourse(app.courseIndex, SEED + st.turn);
  else showTitle();
}

// Home/landing screen over the splash art. Single Player -> course select,
// Play Online -> lobby.
async function showTitle() {
  app.phase = 'menu';
  app.mode = 'local';
  document.getElementById('game-ui').classList.add('hidden');
  progPanel.hide();
  const pick = await titleScreen();
  if (pick === 'online') { onlineGame.open((params.get('room') || '').toUpperCase()); return; }
  showMenu();
}

async function showMenu({ resumable = false } = {}) {
  const prevPhase = app.phase;
  app.phase = 'menu';
  if (!resumable) {
    // fresh menu (boot / after game over) — nothing behind it to come back to
    document.getElementById('game-ui').classList.add('hidden');
    progPanel.hide();
  }
  const courses = COURSES.map((m) => m());
  const ci = await courseMenu(courses, { resumable });
  if (ci === null) { app.phase = prevPhase; return; } // resumed — game untouched
  if (ci === 'online') { onlineGame.open((params.get('room') || '').toUpperCase()); return; }
  startCourse(ci);
}

const onlineGame = new OnlineGame({
  app,
  progPanel,
  setBanner,
  setupGameView,
  pickDock: pickDockUI,
  onExit: () => showTitle(),
});

const muteBtn = document.getElementById('btn-mute');
const renderMute = () => { muteBtn.textContent = sfx.muted ? '🔇' : '🔊'; };
renderMute();
muteBtn.addEventListener('click', () => { sfx.toggleMute(); renderMute(); if (!sfx.muted) sfx.play('click'); });

// music: on/off button + volume slider (both persisted by the music module)
const musicBtn = document.getElementById('btn-music');
const volSlider = document.getElementById('vol-music');
const renderMusic = () => {
  musicBtn.textContent = music.enabled ? '🎵' : '🚫';
  musicBtn.classList.toggle('off', !music.enabled);
  volSlider.value = String(Math.round(music.volume * 100));
};
renderMusic();
musicBtn.addEventListener('click', () => { music.toggle(); renderMusic(); sfx.play('click'); });
volSlider.addEventListener('input', () => {
  music.setVolume(Number(volSlider.value) / 100);
  if (!music.enabled) { music.setEnabled(true); renderMusic(); }
});

document.getElementById('btn-menu').addEventListener('click', () => {
  if (app.phase !== 'playing') return;
  if (app.mode === 'online') { onlineGame.confirmLeave(); return; }
  showMenu({ resumable: true });
});

// scene ambient animations + animator pump
sceneCtl.addTickable((dt) => {
  if (app.boardView) app.boardView.pulseGearsAndBelts(dt);
  if (app.animator) app.animator.update(dt);
  for (const v of app.robotViews.values()) v.tick(dt); // model idle animations
});

// ---- debug handle (frozen-rAF-safe verification; see RULINGS.md) ----
window.__game = {
  app,
  sceneCtl,
  tooltip,
  state: () => app.state,
  startCourse,
  tick: (ms = 16) => sceneCtl.tick(ms),
  skip: () => { if (app.animator) app.animator.speed = Infinity; },
  // engine + AI escape hatches for tests
  engine: { startTurn, programRobot, announcePowerDown, executeRegisters, executeCleanup },
  ai: { chooseProgram, respawnChoice, decideStayDown, decidePowerDown },
  fields: () => app.fields,
  online: () => onlineGame,
  // run one full AI-driven turn (including the player) instantly — for verification
  autoTurn: () => {
    if (!app.state || app.mode !== 'local') return null;
    app.animator.speed = Infinity;
    progPanel.hide();
    const ev = autoTurn(app.state, app.fields);
    app.animator.play(ev);
    sceneCtl.tick(16);
    return { turn: app.state.turn, winner: app.state.winner, events: ev.length };
  },
  runHeadlessGame,
};

// boot: ?room=CODE jumps straight into the online join flow; a live session token
// (same tab, after a reload) silently rejoins the match; otherwise the usual menu.
(async () => {
  if (params.has('room')) {
    onlineGame.open(params.get('room').toUpperCase());
    return;
  }
  if (await onlineGame.tryResume()) return;
  if (params.has('course')) {
    startCourse(Math.min(COURSES.length - 1, Math.max(0, Number(params.get('course')) - 1)));
  } else {
    showTitle();
  }
})();
