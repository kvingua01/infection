# Infection — Block & Seek

A browser-based 3D multiplayer infection hide-and-seek game. Node.js 22+, Express, Socket.IO and Three.js; no downloaded artwork, accounts, database, Redis, or API keys. All visual assets are generated in the browser.

## Run

```sh
npm ci
npm start
```

The server binds `0.0.0.0` and uses `PORT`, defaulting to 3000. Open the service in a desktop browser with WebGL enabled. Have friends open the same service URL. Enter a nickname and choose Create Public Lobby, Create Private Lobby, Join Public Lobby, or Join Private Lobby. Each lobby supports up to 12 players. The host starts the first round once at least two players have joined. This is a keyboard-and-mouse game; touch controls are not implemented.

## Lobbies

Public lobbies appear in a live directory with name, host, player count and waiting/playing/full status. Full lobbies cannot be joined. Private lobbies are absent from this directory and require a random six-character uppercase letter/number code. Members can copy the code from the waiting room. Codes are case-insensitive when joining and expire when their room becomes empty.

Every lobby owns a separate authoritative game: maps, clocks, roles, players, scores, inventories, projectiles and effects never cross rooms. Only the current host may start the first round. The host transfers to the oldest remaining member on departure; empty lobbies are deleted immediately. After the initial host start, rounds repeat automatically. Joining during a round, including refreshing, places the player in waiting status until the next round. One tab/session can belong to only one room; reconnecting the same tab replaces its stale connection. Accounts and passwords are not required.

Lobby actions are limited to 8 per connection per 10 seconds, with at most 60 join/create attempts and 10 creations per network address per minute. Gameplay retains its per-connection event budget. Storage is in memory, with a maximum of 100 simultaneous lobbies. Restarting the service removes rooms, codes and scores. One Railway replica continues to serve all lobbies at the existing origin; no new service, domain, database or Redis is needed.

## Play

After joining a lobby, wait for the host to start, then click the world to capture the mouse. Escape releases it. The Lobby button opens the roster during play; Leave Lobby returns to the main menu.

| Control           | Action                                  |
| ----------------- | --------------------------------------- |
| WASD              | Move relative to camera                 |
| Mouse             | Rotate camera / aim                     |
| Space             | Jump                                    |
| V / camera button | Switch first-person / third-person view |
| Left click        | Throw as seeker                         |
| 1 / 2             | Select inventory slot                   |
| F                 | Use selected power-up                   |
| Hold Tab          | Scoreboard                              |

Each round chooses one of six block-built maps and one original seeker. Hiders get 30 seconds to hide while the seeker is confined in an enclosed isolation room. The server omits other player positions from the isolated seeker's updates. The hunt lasts five minutes. A projectile hit converts a hider into a seeker; shields absorb one hit. Throws have a three-second cooldown. Converted seekers can throw immediately. Catch every hider to win as seekers; survive the timer to win as hiders. A ten-second intermission resets the map, roles, inventory and effects. Late arrivals and refreshed/reconnected browsers wait for the next round.

Hiders move at 3 blocks per second, half the seekers’ 6 blocks per second. A speed boost temporarily raises a hider to 6 blocks per second. Each map includes eight additional sheltered hiding spots with front and side escape routes.

Hiders automatically collect nearby floating cubes, up to two. Eight powers: invisibility (30s), double speed (15s), safe teleport, moving decoy (15s), nearby seeker freeze (5s, 12-block radius), one-hit shield, super jump (20s), and smoke (10s). Powers spawn every four seconds with a 24-cube limit. Seekers do not receive invisible hiders' transforms or world nicknames. Invisibility does not protect against a projectile that happens to hit.

## Deploy to Railway

1. Commit and push these files, including `package-lock.json`, to `kvingua01/infection` on GitHub. For the existing deployment, keep the same Railway service, domain and branch; a normal redeploy applies lobby changes. The remaining steps describe a fresh deployment only.
2. In Railway, choose **New Project → Deploy from GitHub repo**, then select that repository and the branch containing this code.
3. Keep the service root at the repository root. Railway reads `railway.toml`, installs Node dependencies and starts `npm start`. Do not override `PORT`; Railway supplies it.
4. Under the service's networking settings, generate a public domain. Open its HTTPS URL and share that exact URL with friends. Socket.IO automatically uses the page's origin and secure transport on HTTPS.
5. Keep **one replica**. All game state is in memory. Deployments, restarts and crashes reset rounds and scores. No persistent volume is required. Railway hosting may have usage costs; the game uses no paid external services.

Health check: `GET /health` returns JSON with `ok`, total `players`, and `lobbies`. `/socket.io/` is served by the same service; any custom reverse proxy must forward WebSocket upgrades. No CORS or hardcoded production hostname is needed.

## Validate

```sh
npm test
npm run test:service
npm run test:lobbies
# In another terminal, with npm start already running and no existing round:
node scripts/network-smoke.js
# Optional: a different service origin
node scripts/network-smoke.js https://your-service-domain
```

For the browser regression test, start an otherwise empty service with `npm start`, then run:

```sh
npx playwright install chromium
npm run test:browser
npm run test:lobby-browser
# Or use an installed Chromium:
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:lobby-browser
```

This test joins two browser sessions, waits through hiding, checks the camera button and V shortcut, fires in both camera modes and verifies the server cooldown. It takes about 40 seconds.

The lobby network test starts its own temporary server and tests public/private creation and joins, privacy, host permissions, independent games, transfer and cleanup. The lobby browser test checks these menus using four isolated Chromium sessions.

The Node suite exercises server physics, map spawn collision, input clamping, isolation privacy, late arrivals, infection, projectile wall collision, cooldowns, shields, all power activation paths, inventory capacity, effect expiry, speed/freeze/jump behavior, twelve participants, disconnect replacement, wins, and automatic resets. The service test checks the PORT override, HTTP health check, and assets using a temporary server. The live smoke test uses twelve independent Socket.IO clients and waits through the real 30-second hiding period. Run it against an otherwise empty service.

Development verification performed: Node suite; local HTTP health/static endpoints; two independent Chromium browser contexts joining a shared round without JavaScript errors; and the live Socket.IO smoke test. Railway deployment itself and connections from separate physical computers have not been performed.

## Structure

- `server.js`: same-origin HTTP service, connection limits and per-connection event budget.
- `shared/lobbies.js`: room membership, private codes, host permissions, directory metadata and room lifecycle.
- `shared/game.js`: authoritative 30 Hz simulation; 20 Hz snapshots filtered per recipient. Clients send movement intent, never accepted coordinates, inventories, roles or hit claims.
- `shared/maps.js`: six deterministic map layouts, reusable voxel geometry, spawn selection and collision functions shared with the camera.
- `public/client.js`: rendering, input, interpolation, camera collision and HUD.
- `test/`: deterministic game-logic tests.

Add maps in `createMap`; add power names in `TYPES`, server activation behavior in `Game.use`, and presentation colors in the client. Durations can be injected when creating `Game` for tests; production uses the requested 30/300/10-second timing.

## Current scope and limitations

The six maps are compact, playable block-built interpretations, with themed rooms, furniture, obstacles, stairs, platforms and below-ground rooms on the house/forest maps. They are not elaborate recreations of full buildings. House and forest include below-ground branching passages; school and warehouse include elevated enclosed vent routes. The amusement park has static attractions; no moving ride simulation is implemented. Map coverage tests verify spawn and boundary collision, not every possible human route or hiding spot. Full twelve-browser load testing and long-session performance profiling remain unperformed.

No persistence, accounts or automatic matchmaking are included. Private codes act as invitations; anyone with a valid code may join. Scores last until the room empties or the server process ends. Rate limits deter event floods; this is not a comprehensive anti-abuse service. Desktop browsers and a stable connection are required. Smoke is a visual obstruction, not a privacy boundary: unlike invisible players and isolation, the server still sends transforms inside smoke.
