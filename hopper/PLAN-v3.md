# STAR HOPPER v3 — "Make it the best" plan

Goal: take STAR HOPPER from solid-but-plain to genuinely premium, using up to
~25 MB (YouTube Playables hard limit is 30 MB initial bundle). No external
network calls except the Playgama Bridge SDK. All Playables rules still apply.

## Phase A — Parallax background art (AI-generated)
- Generate 2 wide background layers with the media tool:
  - `assets/bg-far.png`: deep-space nebula, dark indigo/violet, scattered stars.
  - `assets/bg-mid.png`: distant ringed planet + jagged dark mountain silhouette.
- Near-layer dust stays procedural (canvas particles, already have stars).
- Review each image by eye (read back), regenerate if seams/focal points are bad.
- Scroll layers at different parallax rates, wrap seamlessly.
- Budget: < 5 MB for both after compression.

## Phase B — Sound engine (WebAudio, synthesized, 0 bytes of assets)
- `Sfx` engine in game.js: lazy AudioContext init on first user gesture.
- SFX: thrust loop (filtered noise), pickup chime, explosion, near-miss ding,
  gate warp, UI click, sudden-drop whoosh, game-over sting, revive shimmer.
- Music: tiny procedural loop (sub bass pulse + sparse minor arpeggio), low volume.
- Honor host mute via Bridge AUDIO_STATE_CHANGED + in-game mute button (M key).
- Autoplay-safe: init on first pointer/key input.

## Phase C — Player art redraw + juice
- Redraw astronaut: better proportions, visor reflection, suit details, animated
  run cycle (2-frame legs already there, make it 4-frame), tucked flight pose,
  scarf flutter, landing squash, takeoff stretch.
- Juice: screen shake (death big, near-miss tiny), hit-stop 70 ms on death,
  landing dust burst, gate warp flash + ring shockwave, shard trails,
  speed lines already exist, keep.
- Keep all art vector (crisp at any DPI, ~0 bytes).

## Phase D — Gameplay variety
- Power-ups (glowing orbs, timed): SHIELD (survive 1 hit), MAGNET (pull shards),
  2X SCORE (12 s).
- Missions (3 rotating, shown on menu, shard rewards, persisted):
  e.g. "score 2500 in one run", "collect 40 shards (total)", "pass 4 gravity gates".
- New obstacle: drifting mines (sine vertical movement). Keep patterns fair.

## Phase E — Animated menus
- Menu: title bob/float, buttons scale on press, animated starfield behind
  (run the world in demo drift mode behind the menu).
- Screen transitions: quick fade.
- Game over: score count-up animation, NEW BEST badge pop.

## Phase F — Verify + ship
- Extend test.js (power-up timers, mission progress pure fns) and sim.js
  (power-up pickup, mission complete, gate, audio engine no-throw).
- Full sim soak, node tests green.
- Code review pass for issues; fix everything found.
- Rebuild hopper-playgama.zip, assert < 25 MB.
- Commit + push to space-game repo (hopper/).

## Acceptance
- Plays identically to v2 at its core (same controls/physics feel).
- Looks and sounds premium on a phone held in portrait.
- ZIP < 25 MB, zero console errors, all tests green.
