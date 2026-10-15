# SPACE GAME

HTML5 games for YouTube Playables (via Playgama). Fun side project, money optional.

- **orbit/** - ORBIT: one-tap orbit dodge. Tap to switch orbits, FIRE button shoots debris.
- **hopper/** - STAR HOPPER: hold-to-fly jetpack runner. Original take on the auto-runner: fuel management, gravity-flip gates, sudden drop.

Each folder is a self-contained game (index.html + game.js). The `*-playgama.zip`
inside each folder is the Playgama upload package.

Dev: `node --test test.js` and `node sim.js` inside each game folder.
