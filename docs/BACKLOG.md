# Bend2Craft backlog

This file is the canonical, reviewable backlog for the repository. GitHub Projects is the execution view: cards can be moved, assigned and filtered there, while changes to scope and acceptance criteria remain versioned here.

Status markers:

- `[x]` implemented and covered by the current verification gates
- `[~]` partially implemented; the remaining scope is stated below
- `[ ]` not implemented

## Current foundation

- [x] Bend2 owns terrain, chunk generation, edits, player physics, collision, raycast, inventory transitions, fluids, survival, entities and the current crafting/furnace/chest contracts.
- [x] `npm run verify` covers Bend checks, proofs, regression tests, static build and `git diff --check`.
- [x] Browser smoke covers chunk hydration, interaction, persistence, negative coordinates, inventory UI, shaped crafting, chest storage, equipment/offhand and item drops.

## P0 — combat, culling and material contract

- [x] Bend owns melee line-of-sight: a hostile cannot damage a player across a solid cell, and the eye ray runs at eye height so a one-block step is not mistaken for cover.
- [x] Bend owns the melee attack cone: a hostile must be facing the player, with a wider cone for the brute. A dead mob never contributes damage on a later tick.
- [x] Per-chunk frustum culling on the WebGPU terrain path, reporting visible chunks, culled chunks, draw calls and submitted vertex bytes.
- [x] A block edit re-uploads only the edited chunk instead of composing a whole-world vertex array on the per-chunk backend.
- [x] Padded atlas with a per-tile gutter, and mipmaps enabled only after a Foreign Tile Contamination probe passes against the real GPU mip chain.
- [x] Material response split into albedo, lighting and material stages with parity between the WebGL and WGSL sources, plus water depth tinting carried in the material band.
- [x] The WebGPU gate reads a real presented frame back out of the swap chain and probes the scene; an unavailable backend is marked skipped with an explicit diagnostic.

## P0 — movement and survival

- [x] Sneak with Shift and sprint with Ctrl.
- [x] Swim, float, drowning air and Bend-owned water currents.
- [x] Fall damage.
- [x] Regeneration while well-fed.
- [x] Rotten-flesh poison.
- [x] Death screen and inventory drops.
- [x] Swords, bow, arrows, shield mitigation, knockback and kill XP.
- [x] Continuous night mob respawn, distinct mob movement and distance despawn.
- [x] Furnace cooking/smelting, rotten flesh/wheat/bread/apple food loop, chest storage and placeable crafting table.
- [x] Shaped 3x3 crafting grid.
- [x] Drag-and-drop, half-stack transfer, shift-click section transfer and Q/Shift+Q drops.
- [x] Basic armor item recipes and equipment slots; offhand shield mitigation.
- [x] Control remapping for the main actions, tutorial/help copy, toast feedback, target highlight and FOV kick.
- [x] Break/place particles, procedural footsteps, ambient audio hooks and attack/game-feel feedback.

## P0 — world and performance

- [x] Chunk streaming keeps desired/active/pending state separate and supports render distances 2–6.
- [x] Edited blocks, entities and simulation state are persisted in the seed-scoped save.
- [ ] Fix the WebGPU atlas mip generator, then enable the chain. WebGPU has no `generateMipmap`, so each level is written by hand. The current implementation renders each level while sampling the same texture, which WebGPU forbids, so the levels stay zero-initialized and the chain misses the box-filter reference by a max delta of 255. The gate detects this and refuses the chain, so WebGPU currently samples the base level with linear minification. The ping-pong version through a scratch texture is in place; the remaining work is making the downsample match `atlasBoxDownsample`. Measured cost of shipping the broken chain: mean per-pixel delta against WebGL rises from 1.43 to 41.77, with 76% of pixels differing by more than 8.
- [~] Larger `max_y`: the current world remains at `20`; benchmark and decide a larger height without regressing browser frame time.
- [~] Finalize a reproducible save/load chunk benchmark and p95/p99 streaming budget on target hardware; default render distance 2 is the smooth baseline, while distance 6 remains an explicit stress setting.

## P1 — faithful world

- [ ] Increase terrain height and add a bedrock layer.
- [ ] Replace the small cave rule with 3D noise caves.
- [ ] Generate continuous oceans and rivers.
- [ ] Add temperature/humidity biome fields and biome transitions.
- [ ] Add biome-specific terrain, vegetation and resource distribution.

## P1 — structures and dimensions

- [~] Expand from the current deterministic village slice to multiple villages per world.
- [ ] Add temples.
- [ ] Add dungeons and underground structures.
- [ ] Add Nether portal validation and a Nether dimension.
- [ ] Add End portal validation and an End dimension.
- [ ] Persist dimension-scoped edits, entities and player transitions.

## P1 — blocks and tools

- [x] Glass item/block contract.
- [~] Wool item/drop contract; add a placeable wool block and wool textures.
- [ ] Add stairs, slabs and fences with correct collision and greedy-mesh geometry.
- [ ] Add shovel, axe and shears with Bend-owned mining rules and durability.
- [ ] Add gold, redstone, lapis lazuli, emerald and copper materials/ores/items.
- [ ] Add material tool progression for the new resources.
- [ ] Add Fortune and Silk Touch validation and drop behavior.

## P1 — farming, villages and fluids

- [x] Wheat, farmland, crop ticking and basic villager trade/pathing.
- [x] Water/lava flow, buckets, doors and fire primitives.
- [ ] Add carrots, potatoes and sugar cane.
- [ ] Add bonemeal and crop acceleration rules.
- [ ] Add breeding and animal population rules.
- [~] Expand villagers into profession work schedules and workstation behavior.
- [ ] Add iron golems and raids.
- [ ] Add infinite-water source rules.
- [ ] Add flint-and-steel and player-initiated fire.

## P2 — large systems

- [ ] Add redstone signals and redstone components.
- [ ] Add pistons and block movement rules.
- [ ] Add potions and brewing.
- [ ] Add enchantment selection, storage and effect rules.
- [ ] Add elytra flight.
- [ ] Add multiplayer/LAN transport and authoritative synchronization.
- [ ] Add achievements and advancement tracking.
- [ ] Add a boss encounter and boss health presentation.
- [x] Add a dedicated XP bar; current XP is tracked and shown as a level in the HUD.

## Verification and release gates

- [ ] Add focused regression tests for every new contract seam.
- [ ] Keep `npm run verify` green after each phase.
- [ ] Run browser smoke for every UI/world interaction that crosses the WebGL boundary.
- [ ] Commit each verified phase with a scoped message.
- [ ] Push only after the full phase gate passes and read back the published SHA.
