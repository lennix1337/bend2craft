import assert from "node:assert/strict";
import Player from "../world/player.bend";

const state = Player.create(2n, 2n, 1n);
assert.equal(state.$, "State");
assert.equal(Number(state.x), 2.5);
assert.ok(Math.abs(Number(state.y) - 1.05) < 0.001);
assert.equal(Number(state.health), 20);
assert.equal(Number(state.hunger), 20);
assert.equal(Player.alive(state), true);
assert.equal(Player.solid(11), true);
assert.equal(Player.solid(12), false);
assert.equal(Player.solid(21), false);
assert.equal(Player.solid(14), true);
assert.equal(Player.solid(15), false);
assert.ok(Math.abs(Number(Player.block_height(20)) - 0.9375) < 0.001);
assert.equal(Player.overlaps(state, 2n, 1n, 2n), true);
const escaped = Player.state(-4.0, 8.0, 52.0, 0.0, 0.0, 0.0, false, 20.0, 20.0);
const clamped = Player.clamp_world(escaped, 48n, 48n);
assert.equal(Number(clamped.x), -4);
assert.equal(Number(clamped.z), 52);

const direction = Player.direction(state);
assert.equal(direction.$, "Direction");
assert.ok(Number(direction.z) < 0);

let blocks = { $: "Nil" };
for (let index = 5 * 6 * 5 - 1; index >= 0; index -= 1) {
  const y = Math.floor(index / 25);
  blocks = { $: "Con", head: y === 0 ? 1 : 0, tail: blocks };
}
assert.equal(Player.collides(state, 2.5, 1.05, 2.5, blocks, 0n, 0n, 0n, 5n, 6n, 5n), false);
assert.equal(Player.collides(state, 2.5, 0.2, 2.5, blocks, 0n, 0n, 0n, 5n, 6n, 5n), true);
let farmlandBlocks = { $: "Nil" };
for (let index = 5 * 6 * 5 - 1; index >= 0; index -= 1) {
  const y = Math.floor(index / 25);
  farmlandBlocks = { $: "Con", head: y === 0 ? 20 : 0, tail: farmlandBlocks };
}
assert.equal(Player.collides(state, 2.5, 0.9375, 2.5, farmlandBlocks, 0n, 0n, 0n, 5n, 6n, 5n), false);
assert.equal(Player.collides(state, 2.5, 0.9, 2.5, farmlandBlocks, 0n, 0n, 0n, 5n, 6n, 5n), true);
let landed = state;
for (let index = 0; index < 60; index += 1) {
  landed = Player.step(landed, 0, 0.016, blocks, 0n, 0n, 0n, 5n, 6n, 5n, 2n, 2n, 1n);
}
assert.equal(landed.grounded, true);
const jumped = Player.step(landed, 16, 0.016, blocks, 0n, 0n, 0n, 5n, 6n, 5n, 2n, 2n, 1n);
assert.equal(jumped.grounded, false);
assert.ok(Number(jumped.velocity_y) > 0);
const starving = Player.tick_survival(state, 1000.0, false);
assert.ok(Number(starving.hunger) < 20);
assert.ok(Number(starving.health) < 20);
const walked = Player.tick_survival(state, 20.0, false);
const sprinted = Player.tick_survival(state, 20.0, true);
assert.ok(Number(sprinted.hunger) < Number(walked.hunger));
const damaged = Player.damage(state, 4.0);
assert.equal(Number(damaged.health), 16);
assert.equal(Number(damaged.hunger), 20);
const dead = Player.damage(damaged, 100.0);
assert.equal(Number(dead.health), 0);
assert.equal(Player.alive(dead), false);
assert.equal(Player.lava_contact({ $: "Con", head: 21, tail: { $: "Nil" } }), true);
assert.equal(Player.lava_contact({ $: "Con", head: 0, tail: { $: "Nil" } }), false);
const lavaDamaged = Player.lava_damage(state, 1.0);
assert.equal(Number(lavaDamaged.health), 16);
const fed = Player.eat(state, 4.0);
assert.equal(Number(fed.hunger), 20);
const hungry = Player.tick_survival(state, 20.0, false);
const fedHungry = Player.eat(hungry, 4.0);
assert.ok(Number(fedHungry.hunger) > Number(hungry.hunger));
let walker = state;
let runner = state;
let sneaker = state;
for (let index = 0; index < 30; index += 1) {
  walker = Player.step(walker, 1, 0.016, blocks, 0n, 0n, 0n, 5n, 6n, 5n, 2n, 2n, 1n);
  runner = Player.step(runner, 33, 0.016, blocks, 0n, 0n, 0n, 5n, 6n, 5n, 2n, 2n, 1n);
  sneaker = Player.step(sneaker, 65, 0.016, blocks, 0n, 0n, 0n, 5n, 6n, 5n, 2n, 2n, 1n);
}
assert.ok(2.5 - Number(runner.z) > (2.5 - Number(walker.z)) * 1.25);
assert.ok(2.5 - Number(sneaker.z) < (2.5 - Number(walker.z)) * 0.75, `sneak must be slower than walk, got sneak=${2.5 - Number(sneaker.z)} walk=${2.5 - Number(walker.z)}`);
let sneakOverride = state;
for (let index = 0; index < 30; index += 1) {
  sneakOverride = Player.step(sneakOverride, 97, 0.016, blocks, 0n, 0n, 0n, 5n, 6n, 5n, 2n, 2n, 1n);
}
assert.ok(2.5 - Number(sneakOverride.z) < (2.5 - Number(walker.z)) * 0.75, "sneak must override sprint");

// --- survival: fall damage, water, drowning, regen, poison (Bend-owned) ---
function flatBlocks(width, height, depth, fill) {
  let list = { $: "Nil" };
  for (let index = width * height * depth - 1; index >= 0; index -= 1) {
    const y = Math.floor(index / (width * depth));
    list = { $: "Con", head: y === 0 ? fill : 0, tail: list };
  }
  return list;
}
const airBlocks = flatBlocks(5, 6, 5, 1);
// Fall 6 blocks onto stone must hurt; water landing must not.
const faller = Player.state_full(2.5, 8.0, 2.5, 0.0, 0.0, -8.0, false, 20.0, 20.0, 10.0, 6.0, 0.0);
const landedHard = Player.step(faller, 0, 0.2, airBlocks, 0n, 0n, 0n, 5n, 6n, 5n, 2n, 2n, 1n);
assert.ok(Number(landedHard.health) < 20, `fall damage expected, got ${Number(landedHard.health)}`);
assert.equal(Player.water_contact(airBlocks), false);
let waterList = { $: "Nil" };
for (let i = 0; i < 5 * 6 * 5; i += 1) waterList = { $: "Con", head: 7, tail: waterList };
assert.equal(Player.water_contact(waterList), true);
assert.equal(Player.is_water(7), true);
assert.equal(Player.is_water(1), false);
// Head under water drains air and then health.
const diver = Player.state_full(2.5, 2.0, 2.5, 0.0, 0.0, 0.0, false, 20.0, 20.0, 1.0, 0.0, 0.0);
const drowned = Player.drown_tick(diver, 2.0, true);
assert.equal(Number(drowned.air), 0);
assert.ok(Number(drowned.health) < 20, "drowning must damage at zero air");
const surfaced = Player.drown_tick(drowned, 1.0, false);
assert.ok(Number(surfaced.air) > 0, "air must refill out of water");
// Full hunger regenerates health.
const wounded = Player.state_full(2.5, 1.05, 2.5, 0.0, 0.0, 0.0, true, 10.0, 20.0, 10.0, 0.0, 0.0);
const healed = Player.tick_survival(wounded, 4.0, false);
assert.ok(Number(healed.health) > 10, `regen expected, got ${Number(healed.health)}`);
const deadForStep = Player.state_full(2.5, 1.05, 2.5, 0.0, 0.0, 0.0, true, 0.0, 20.0, 10.0, 0.0, 0.0);
const deadAfterStep = Player.step(deadForStep, 0, 0.2, airBlocks, 0n, 0n, 0n, 5n, 6n, 5n, 2n, 2n, 1n);
assert.equal(Number(deadAfterStep.health), 0, "a dead player must not regenerate through step");
// Poison drains health and ticks down.
const sick = Player.state_full(2.5, 1.05, 2.5, 0.0, 0.0, 0.0, true, 20.0, 20.0, 10.0, 0.0, 10.0);
const poisoned = Player.tick_survival(sick, 2.0, false);
assert.ok(Number(poisoned.health) < 20, "poison must damage");
assert.ok(Number(poisoned.poison) < 10, "poison timer must tick down");
const dosed = Player.poison_tick(sick, 5.0);
assert.equal(Number(dosed.poison), 15);
// Swimming must remain active until the feet clear the water cell, otherwise a
// one-block shore blocks horizontal movement while gravity cancels the jump.
const shoreValues = [];
for (let y = 0; y < 12; y += 1) {
  for (let z = 0; z < 6; z += 1) {
    for (let x = 0; x < 6; x += 1) {
      shoreValues.push(y === 0 || (x >= 3 && y === 8) ? 1 : (x < 3 && y <= 7 ? 7 : 0));
    }
  }
}
let shoreBlocks = { $: "Nil" };
for (let index = shoreValues.length - 1; index >= 0; index -= 1) {
  shoreBlocks = { $: "Con", head: shoreValues[index], tail: shoreBlocks };
}
let shoreSwimmer = Player.state_full(2.5, 7.5, 2.5, 0.0, 0.0, 0.0, false, 20.0, 20.0, 10.0, 0.0, 0.0);
let exitedShore = false;
for (let index = 0; index < 240; index += 1) {
  shoreSwimmer = Player.step(shoreSwimmer, 24, 1 / 60, shoreBlocks, 0n, 0n, 0n, 6n, 12n, 6n, 2n, 2n, 7n);
  if (Number(shoreSwimmer.x) > 3.3 && Number(shoreSwimmer.y) >= 9) {
    exitedShore = true;
    break;
  }
}
assert.ok(
  exitedShore,
  `swimmer must climb onto the shore, x=${Number(shoreSwimmer.x)} y=${Number(shoreSwimmer.y)}`,
);

console.log("bend player ok");
