# Robo Race

A 3D top-down fan implementation of the classic Robo Rally board game
(1994 Wizards / 2005 Avalon Hill rules): you against three AI robots —
Crusher (aggressive), Prudence (cautious), and Turbo (reckless racer).

## Run

```
npm install
npm run dev        # http://localhost:5201
npm test           # vitest: engine rules, boards, AI integration
```

## Play

Each turn you're dealt program cards (9 minus your damage). Drag five into your
registers, lock in, and watch all four robots execute simultaneously by card
priority. Conveyors, gears, pushers and lasers fire between moves. Touch every
flag **in order** to win. Don't fall in a pit.

- Click a hand card to place it; click a placed card to take it back.
- `1× / 2× / skip` controls animation speed.
- Power down (when damaged) to repair everything at the cost of a turn.
- Left-drag pans, scroll zooms, right-drag tilts.

## Debug / test flags

- `?course=N` — skip the menu, start course N (1–3)
- `?test=SEED` — deterministic RNG
- `?fast` — skip all animations
- `window.__game` — state, engine functions, `autoTurn()`, `tick(ms)` (manual frame
  pump for hidden tabs where rAF is frozen)

Rules interpretation notes: see [RULINGS.md](RULINGS.md).
