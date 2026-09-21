import assert from "node:assert/strict";
import Player from "../world/player.bend";

const state = Player.create(2n, 2n, 1n);
assert.equal(state.$, "State");
assert.equal(Number(state.x), 2.5);
assert.ok(Math.abs(Number(state.y) - 1.05) < 0.001);
assert.equal(Number(state.health), 20);
assert.equal(Number(state.hunger), 20);
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
const starving = Player.tick_survival(state, 1000.0);
assert.ok(Number(starving.hunger) < 20);
assert.ok(Number(starving.health) < 20);
const damaged = Player.damage(state, 4.0);
assert.equal(Number(damaged.health), 16);
assert.equal(Number(damaged.hunger), 20);
assert.equal(Player.lava_contact({ $: "Con", head: 21, tail: { $: "Nil" } }), true);
assert.equal(Player.lava_contact({ $: "Con", head: 0, tail: { $: "Nil" } }), false);
const lavaDamaged = Player.lava_damage(state, 1.0);
assert.equal(Number(lavaDamaged.health), 16);
const fed = Player.eat(state, 4.0);
assert.equal(Number(fed.hunger), 20);
const hungry = Player.tick_survival(state, 20.0);
const fedHungry = Player.eat(hungry, 4.0);
assert.ok(Number(fedHungry.hunger) > Number(hungry.hunger));
console.log("bend player ok");
