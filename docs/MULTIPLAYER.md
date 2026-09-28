# Multiplayer

How a shared Bend2Craft world works, where each rule lives, and how to extend
it. The short version for players is in the README; this is for changing the
code.

## Shape

```
browser (web/)                    server (server/, cloudflare/)
───────────────                   ─────────────────────────────
game.js ── multiplayer.js ──ws──▶ node-host.mjs / dev-server.ts / worker.js
  │          (session,               │  (transport only: frames in, frames out)
  │           requests)              ▼
  │                               multiplayer-room.js  (players, routing, fan-out)
  │                                 ├─ room/edits.js       edit batches
  │                                 ├─ room/containers.js  chests, furnaces
  │                                 ├─ room/world.js       mobs, drops, interactions
  │                                 └─ room/snapshot.js    save / restore
  │                                        │
  │                                        ▼
  │                               server-world.js  (bundled with the Bend authority)
  │                                 ├─ world-cache.js    chunks via WorldState.chunk
  │                                 ├─ mob-world.js      mobs and drops
  │                                 ├─ villager-world.js villagers and doors
  │                                 ├─ move-guard.js     movement checks
  │                                 └─ web/world-simulation.js  fluids, fire, crops
  ▼                                        │
world/*.bend  ◀────────── the same Bend contracts on both sides ──────────┘
```

The server is authoritative for everything shared. Every rule it applies is a
Bend contract; the JavaScript around it decodes messages, keeps caches and
fans results out.

| Concern | Bend contract | Server adapter |
| --- | --- | --- |
| Edit batches, sequence, log | `world/multiplayer.bend` (`submit`, `merge`, `revert`) over `world/world_state.bend` (`set_many`) | `server/room/edits.js` |
| Chests, furnaces | `Multiplayer.deposit`, `withdraw`, `furnace_op`, `tick` | `server/room/containers.js` |
| Poses | `Multiplayer.valid_pose`, `clamp_pitch` | `server/multiplayer-room.js` |
| Movement | `world/multiplayer_moves.bend` (`step`) | `server/move-guard.js` |
| Mobs, drops, hits, pickups | `world/multiplayer_mobs.bend` over `world/entities.bend` | `server/mob-world.js` |
| Villagers, doors | `world/villagers.bend` (`step_near`) | `server/villager-world.js` |
| Fluids, fire, crops, farmland | `world/fluids.bend`, `fire.bend`, `crops.bend`, `farmland.bend`, `simulation.bend` | `web/world-simulation.js` (shared with single player) |
| Interaction reach | `Multiplayer.within_reach` | `server/server-world.js` |
| Terrain | `WorldState.chunk` (bulk) | `server/world-cache.js` |

## The edit log

The world is its seed plus one ordered edit log (a Bend list with one entry per
cell). Players submit batches; `Multiplayer.submit` validates every edit (in the
world band, a known block, chests that still hold items cannot be broken),
folds the accepted ones in with one `WorldState.set_many` pass and bumps the
sequence number. The room sends the accepted batch to every player, the sender
included, and each client replays it with `Multiplayer.merge` in sequence
order, so all logs converge. Rejected edits go back to the sender as a
`revert` with the authoritative value of each cell.

The server's own changes (water flowing, fire burning out, crops growing,
villagers opening doors) are queued by `server-world.js` as wire edits and
submitted like a player batch with `from: 0`.

A client that is still streaming a chunk when a batch touches it keeps the
batch's cells and writes them over the chunk when it arrives (the reply was
generated from the older log), so a chunk next to flowing water still loads.

## Movement

Browsers run their own physics (`world/player.bend`) and relay the pose. The
server checks each pose against the last one it accepted
(`MultiplayerMoves.step`):

- horizontal distance is paid from a bucket that refills at 10 blocks/s and
  holds 12 blocks, so a lag spike that bunches poses passes while an idle
  player cannot bank a teleport;
- rising is paid from a second bucket (4 blocks/s, 3 blocks burst); falling is
  free;
- the legs and head cells of the new pose must not be solid unless the old pose
  was already inside a block (someone built over the player);
- a pose on the world spawn is a respawn and resets both buckets.

A refused pose is not relayed; the server sends `correct` with the last accepted
position and the client snaps back (`placePlayer`).

## Protocol

Messages are JSON text frames, one object each, validated on both ends by
`web/multiplayer-protocol.js` (`PROTOCOL_VERSION` 5). Coordinates of cells are
stored Bend coordinates; poses are world coordinates.

Client to server: `hello`, `pose`, `edits`, `chest`, `furnace`, `time`,
`attack`, `pickup`, `drop`, `interact` (ops `water`, `lava`, `fire`, `collect`,
`till`, `plant`, `harvest`).

Server to client: `welcome`, `joined`, `left`, `pose`, `edits`, `revert`,
`correct`, `chest`, `furnace`, `furnaces`, `entities` (mobs, drops, villagers),
`hurt`, `time`, `error`, and one `*-result` per request (`chest-result`,
`furnace-result`, `attack-result`, `pickup-result`, `interact-result`), matched
by `id`.

## Hosts and saving

- `scripts/play-server.mjs` + `server/node-host.mjs`: Node LAN server with a
  dependency-free WebSocket endpoint, saving to `worlds/multiplayer.json`
  (edit log, containers, clock and simulation state; snapshot version 3).
- `scripts/dev-server.ts`: Bun dev server with an in-memory room.
- `cloudflare/worker.js`: one Durable Object (the shared world) with SQLite
  storage.

All three load the same room and the same bundled authority
(`dist/multiplayer-authority.js`, built from `server/authority-entry.js`).
Run the Node host with Node: Bun 1.3.x drops the `101 Switching Protocols`
reply written on a `node:http` upgrade socket (Bun 1.4 is fine; the dev server
uses `Bun.serve` and is unaffected).

## Adding a shared feature

1. Write the rule as a Bend contract in `world/` with a focused test in
   `tests/` (see `tests/multiplayer-moves.test.mjs`).
2. Give the server an adapter: a handler in `server/room/` for a request, or a
   system in `server/server-world.js` for something that ticks.
3. Add the message to `web/multiplayer-protocol.js` on both decode sides and
   bump `PROTOCOL_VERSION` if old clients would misread it.
4. Mirror the result in `web/game.js` behind `multiplayer !== null`, and stop
   the local simulation of that feature while connected.
5. Cover it in `scripts/multiplayer-smoke.mjs` when it crosses into WebGL or
   input.

## Checks and benchmarks

```bash
npm run test                        # includes the multiplayer suites
npm run browser:multiplayer-smoke   # two browsers against the dev server (peaceful)
npm run bench:multiplayer           # room submit/merge/welcome, movement check
npm run bench:edit-log              # set, set_many, block, door pass, light chunk
npm run bench:fire                  # fire step and lava sampling in a pool
npm run bench:light                 # dirty-cell light patches
```

Measured on the JavaScript target (Bun 1.4.2, 2 vCPU cloud container):

| Operation | Before | After |
| --- | --- | --- |
| `submit` of a 64-edit batch, 1k / 5k / 20k-edit log | 18.3 / 22.9 / 42.4 ms | 3.8 / 6.4 / 21.7 ms |
| 64 edits: 64 × `set` vs one `set_many`, 12k-edit log | 191 ms | 9.3 ms |
| `Fire.ignite_lava` over a 433-sample pool | 419 ms | 6.7 ms |
| Edit-aware light patch of 421 cells | 32–39 ms | 7.6–12 ms |
| Movement check per pose | — | 2.3 µs |

The first two come from `WorldState.set_many`'s bounding box, which used Base's
`Nat.min`/`Nat.max` (they count both arguments down one step at a time, and
stored coordinates sit near 2^15); the fire one from a strict `Bool.pick` that
ran the lava neighbourhood check for every sample; the light one from an early
exit in `edit_override` and `sky_visible`. Air-to-water changes now relight only
their own cell (`LightDirty.light_neutral`).

## Roadmap

What is done and what is left, in the order it is worth doing. Keep this list
current: tick an item in the commit that finishes it.

### Done

- [x] Shared block edits and player presence through a Bend-owned room;
  Node LAN host, Bun dev room and Cloudflare Durable Object (phase 1).
- [x] Chests, furnaces and one day clock for everyone (phase 2).
- [x] Server-owned mobs and drops; hits and pickups are server requests
  (phase 3).
- [x] Server-simulated villagers, fluids, fire, crops and farmland; world
  interactions checked against the player's pose (phase 4).
- [x] Movement checks in Bend (`world/multiplayer_moves.bend`) with `correct`
  back to the last accepted pose (phase 4).
- [x] Hot paths: `set_many`, tail-recursive log walks, fire lava sampling,
  light early exits, one-cell relight for air/water swaps (phase 4).
- [x] Committed two-browser smoke (`npm run browser:multiplayer-smoke`) and
  this document (phase 4).

### Next

Authority gaps (a modified client can still cheat here):

- [ ] Check player block edits for reach in Bend, as interactions already are:
  today any in-world cell with a known block is accepted from anywhere.
- [ ] Server-owned inventories and equipment: move inventory and crafting
  transitions to Bend (`web/inventory.js` still owns them), then keep each
  player's inventory in the room so a placed block must be owned and a mined
  block is credited by the server.
- [ ] Server-owned health, hunger and death (the client applies `hurt` and fall
  damage itself today).
- [ ] Check the whole player box, not only its centre column, when a pose
  enters a solid cell.

Scale:

- [ ] Index the edit log per chunk. It is one Bend list, so every edit, block
  read and chunk request walks it (about 6 ms per edit at 20k edits), and each
  chunk request posts the whole log to a worker.
- [ ] Cache terrain per column in the light patch: `sky_visible` still
  generates terrain for every cell it climbs.
- [ ] Remove the remaining strict `Bool.pick` scans in `world/fluids.bend`
  (`append_source`, `contains`) and measure a large pool.

Connection and hosting:

- [ ] Reconnect automatically after a dropped connection (today the client
  shows a toast and plays on alone).
- [ ] Rate-limit messages per connection on every host.
- [ ] Validate phase 4 on `wrangler dev` and a real deployment (the Durable
  Object was last run under `wrangler dev` before phase 4).
- [ ] More than one world per Cloudflare deployment (today one named object).
- [ ] Optional server password.

Code and checks:

- [ ] Move the multiplayer wiring out of `web/game.js` into its own module.
- [ ] Run `npm run browser:smoke` on a real machine: in the 2-vCPU cloud
  container it times out at the same step on this branch and on its base.
- [ ] Watch `browser:multiplayer-smoke` for flakes (one timeout at the bucket
  step in four runs before its waits were raised to 30 s).
- [ ] Bump `.tools/bun` to 1.4: Bun 1.3.x never sends the `101` reply on a
  `node:http` upgrade, so the Node-host tests fail under it.
- [ ] Continuous integration running `npm run verify` and the multiplayer
  smoke.

Features:

- [ ] Chat, and a player list panel (today: an online count and nametags).

## Known limits

- Inventories, equipment and positions are saved per profile and per server in
  each browser.
- On Cloudflare, furnace progress and simulation state are written at most every
  30 seconds.
