import assert from "node:assert/strict";
import {
  KINDS,
  MOB_CAPS,
  createMob,
  damageMob,
  mobDrops,
  rayHitMob,
  tickMob,
} from "../web/mobs.js";
import { createPlayer, createWorldState, movePlayer } from "../web/game-state.js";

function flatWorld() {
  const world = createWorldState(16, 16, 8);
  for (let z = 0; z < 16; z += 1) {
    for (let x = 0; x < 16; x += 1) world.setBlock(x, 0, z, 1);
  }
  return world;
}

const env = (overrides = {}) => ({ isDay: true, rng: () => 0.9, ...overrides });

// Pigs are weak and passive, zombies are tough and hostile.
assert.equal(KINDS.pig.health, 10);
assert.equal(KINDS.pig.damage, 0);
assert.equal(KINDS.zombie.health, 20);
assert.equal(KINDS.zombie.damage, 3);
assert.deepEqual(MOB_CAPS, { pig: 6, zombie: 5 });

const pig = createMob("pig", 8.5, 1.05, 8.5);
assert.equal(pig.health, 10);
assert.equal(pig.dead, false);

// Damage flashes the mob; lethal damage kills it and drops pork.
assert.equal(damageMob(pig, 3), false);
assert.equal(pig.health, 7);
assert.ok(pig.hurtTimer > 0);
assert.equal(damageMob(pig, 99), true);
assert.equal(pig.dead, true);
assert.deepEqual(mobDrops("pig"), [7]);
assert.deepEqual(mobDrops("zombie"), [8]);

// A dropped mob falls and lands instead of floating.
const world = flatWorld();
const falling = createMob("pig", 4.5, 6, 4.5);
for (let i = 0; i < 120; i += 1) {
  tickMob(world, falling, { x: 8.5, z: 8.5 }, 0.05, env());
}
assert.equal(falling.grounded, true);
assert.ok(falling.y < 2);

// A wandering pig roams away from its start over time.
const wanderer = createMob("pig", 8.5, 1.05, 8.5);
let sequence = [0.1, 0.2, 0.8, 0.4, 0.95, 0.3];
let step = 0;
const cycling = () => sequence[step++ % sequence.length];
for (let i = 0; i < 600; i += 1) {
  tickMob(world, wanderer, { x: 8.5, z: 8.5 }, 0.05, env({ rng: cycling }));
}
assert.ok(Math.hypot(wanderer.x - 8.5, wanderer.z - 8.5) > 1);

// A zombie chases the player at night and attacks up close.
const zombie = createMob("zombie", 2.5, 1.05, 2.5);
const before = Math.hypot(zombie.x - 8.5, zombie.z - 8.5);
for (let i = 0; i < 100; i += 1) {
  tickMob(world, zombie, { x: 8.5, z: 8.5 }, 0.05, env({ isDay: false }));
}
const after = Math.hypot(zombie.x - 8.5, zombie.z - 8.5);
assert.ok(after < before);

const brawler = createMob("zombie", 8.5, 1.05, 9.5);
let attacked = false;
for (let i = 0; i < 200 && !attacked; i += 1) {
  const events = tickMob(world, brawler, { x: 8.5, z: 8.5 }, 0.05, env({ isDay: false }));
  attacked = events.attacked > 0;
}
assert.equal(attacked, true);

// Zombies burn in daylight.
const burner = createMob("zombie", 8.5, 1.05, 8.5);
let burned = false;
for (let i = 0; i < 400 && !burned; i += 1) {
  const events = tickMob(world, burner, { x: 30, z: 30 }, 0.05, env({ isDay: true }));
  burned = events.burned > 0;
}
assert.equal(burned, true);

// Aiming down at a mob hits it; looking away misses.
const target = createMob("pig", 0, 0, -3);
assert.ok(rayHitMob([0, 1.6, 0], [0, -0.2, -1], target, 8) !== null);
assert.equal(rayHitMob([0, 1.6, 0], [0, 0, 1], target, 8), null);
assert.equal(rayHitMob([0, 1.6, 0], [0, -0.2, -1], target, 1), null);

// Mobs that fall into the void are removed instead of teleported.
const doomed = createMob("pig", 2.5, -11, 2.5);
const voidEvents = tickMob(world, doomed, { x: 8.5, z: 8.5 }, 0.05, env());
assert.equal(voidEvents.removed, true);

// The void-teleport safety net stays opt-out for the player path.
const player = createPlayer([2, 2], 1);
player.y = -11;
const kept = movePlayer(world, player, new Set(), 0.05, [2, 2], 1);
assert.equal(kept.voidFell, true);
assert.ok(player.y > -10);

console.log("mobs ok");
