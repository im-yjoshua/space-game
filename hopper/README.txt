STAR HOPPER v4 - submission package for Playgama / YouTube Playables
=================================================================

WHAT THIS IS
A complete HTML5 dino-style runner. You are a rookie astronaut kid
auto-running through a lunar tunnel.
Tap / click, Space, or Up to JUMP. Hold Down or the DUCK button to
BOW DOWN (duck under rock bars and low mines). Press Down in mid-air
to slam down fast, dino-style. The game keeps getting faster.
Dodge spikes and drifting mines, grab shards, chain near-misses for
combo. 4 suit colors to unlock with shards in the Hangar.

V4 DINO MODE (controls rebuilt Oct 17)
- Jump + duck only, jetpack logic fully removed
- New obstacle: floating rock bars you must bow under (or jump over)
- Speed ramps up gradually, endless

PREMIUM FEATURES (kept from v3)
- AI-generated parallax backgrounds (nebula + ringed planet vista)
- Synthesized sound: jump whoosh, 8+ SFX, procedural music (zero audio files)
- Juice: screen shake, hit-stop, landing dust + squash, takeoff dust
- Power-ups: SHIELD, MAGNET, DOUBLE SCORE orbs
- 3 missions with shard rewards, shown on the menu
- Animated menus: living world drifts behind the title, score count-up

FILES
index.html  - game page (loads the Playgama Bridge SDK, then game.js)
game.js     - the whole game: logic, rendering, skins, audio, ads, saving
assets/     - background art (bg-far.webp, bg-mid.webp)

TECH CHECKLIST (YouTube Playables rules)
- Total size: ~40 KB (limit is 30 MB)
- No external network calls except the Playgama Bridge SDK itself (required)
- No external links, no exit button, no third-party ad SDKs
- Responsive portrait + landscape, touch + mouse + keyboard
- Pauses when the tab hides or the host says so; Esc closes menus
- Saves best score / shards / unlocks (tiny, via Bridge storage)

YOUR STEPS
1. Sign up at https://developer.playgama.com and create a new game.
2. BEFORE uploading: ask Playgama (support email or their Discord) to
   confirm the 75% YouTube Playables revenue split IN WRITING, and whether
   the 75% is of gross ad revenue or net of YouTube's cut. Do not skip this.
3. Upload hopper-playgama.zip. Playgama runs QA against YouTube's test
   suite and will tell you if anything needs fixing.
4. Never sign a Poki web-exclusive deal for this game (it conflicts with
   YouTube Playables distribution).

QUICK TEST ON YOUR OWN MACHINE
Just open index.html in Chrome on your laptop or phone. Everything runs
offline. If anything looks wrong, tell Jarvis.
