# Rulings

Judgment calls made where the embedded spec / classic rulebooks were silent or
ambiguous. Sources consulted: the official Avalon Hill 2005 rulebook text
(`../.claude/roborally-rules-ah2005.txt`) and the Ultimate RoboRally Collection
compilation (`../.claude/roborally-ultimate.txt`).

1. **Powered-down robots still fire their main lasers.** The rulebook says every
   robot's main laser fires "automatically" and lists only "doesn't receive or execute
   Program cards and doesn't move" as power-down restrictions. RAW wins.

2. **Powered-down robots' registers are not wiped until they power up** (Ultimate
   collection explicit ruling). Cards held there are excluded from each turn's
   reshuffle so no duplicate cards can be in play.

3. **Occupied archive on respawn:** the destroyed robot re-enters on the first free
   non-pit adjacent space (orthogonals first, then diagonals, deterministic order).
   Simplification of the rulebook's "choose an adjacent space" multi-robot rule; the
   line-of-sight restriction on facing is not enforced.

4. **Registers that are locked but empty** (damage jumped several points in one turn,
   e.g. while powered down) are filled with random cards from the deck at deal time —
   generalizes the rulebook's explicit power-down case.

5. **Robot lasers resolve simultaneously** among robots alive after board lasers:
   board lasers fire (all damage applied), then all robot lasers fire at once. A robot
   destroyed by board lasers does not fire; robots destroyed by robot lasers still
   fired that volley.

6. **Belt conflicts:** following "if it's not clear, don't move either robot" — two
   robots converging on one space both stall, a swap (two robots through each other)
   stalls both, and a belt-carried robot stalls behind any stationary robot. Walls
   block belt movement (robot stays).

7. **Option cards (simplified per the build spec):** six passive options exist, two
   copies each. The generic discard-to-prevent-damage rule is automated by policy:
   an option is burned automatically when damage would destroy the robot, or (if
   auto-shield is on, the default) when damage would cross the register-lock
   threshold. Ablative Coat absorbs before any discard. A destroyed robot loses one
   option.

8. **No 30-second programming timer in solo play** — pointless against AIs that
   program instantly. Online play uses the rulebook timer: once a single human is
   still programming, 30 seconds, then their registers are filled at random (the
   printed rule).

9. **Game end:** the game ends as soon as a winner is decided (the register in
   progress completes; no runner-up play-out). If the player's robot is permanently
   destroyed, the race ends immediately in defeat.

10. **The race continues if a player is merely destroyed** (has lives left) — they
    re-enter at cleanup like the tabletop game. Only permanent death ends it.

11. **HOUSE VARIANT — start-position auction** (not in any official rulebook; added
    by request). After the turn-1 deal, every robot secretly bids one card from its
    hand. Bids are revealed; in descending priority order each robot picks any free
    dock, and every bid card is discarded (turn 1 is programmed from the remaining
    8 cards). Replaces the official "dock = setup order" rule. Archive markers start
    on the chosen dock. AI bids are personality-flavored: Crusher burns its best
    card, Turbo keeps its movement cards, Prudence bids low and picks last.
