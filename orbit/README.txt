ORBIT v1 - submission package for Playgama / YouTube Playables
============================================================

WHAT THIS IS
A complete HTML5 game. One tap switches your rocket between two orbits
around a planet, and the FIRE button (or F key) shoots debris ahead of you.
Dodge debris, blast it, grab shards, chain near-misses for combo.
4 rockets + 4 planets to unlock with shards in the Hangar (customize screen).

FILES
index.html  - game page (loads the Playgama Bridge SDK, then game.js)
game.js     - the whole game: logic, rendering, skins, ads, saving

TECH CHECKLIST (YouTube Playables rules)
- Total size: ~32 KB (limit is 30 MB)
- No external network calls except the Playgama Bridge SDK itself (required)
- No external links, no exit button, no third-party ad SDKs
- Responsive portrait + landscape, touch + mouse + spacebar
- Pauses when the tab hides or the host says so; Esc closes menus
- Saves best score / shards / unlocks (tiny, via Bridge storage)

YOUR STEPS
1. Sign up at https://developer.playgama.com and create a new game.
2. BEFORE uploading: ask Playgama (support email or their Discord) to
   confirm the 75% YouTube Playables revenue split IN WRITING, and whether
   the 75% is of gross ad revenue or net of YouTube's cut. Do not skip this.
3. Upload orbit-playgama.zip. Playgama runs QA against YouTube's test
   suite and will tell you if anything needs fixing.
4. Never sign a Poki web-exclusive deal for this game (it conflicts with
   YouTube Playables distribution).

QUICK TEST ON YOUR OWN MACHINE
Just open index.html in Chrome on your laptop or phone. Everything runs
offline. Tap to switch orbits. If anything looks wrong, tell Jarvis.
