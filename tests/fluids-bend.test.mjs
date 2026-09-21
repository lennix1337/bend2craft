import assert from "node:assert/strict";
import Fluids from "../world/fluids.bend";

function listValues(list) {
  const values = [];
  for (let node = list; node?.$ === "Con"; node = node.tail) values.push(node.head);
  return values;
}

function sampleList(values) {
  let list = { $: "Nil" };
  for (let index = values.length - 1; index >= 0; index -= 1) {
    list = { $: "Con", head: values[index], tail: list };
  }
  return list;
}

const openBelow = sampleList([
  Fluids.sample(2n, 2n, 2n, 0),
]);
const falling = listValues(Fluids.spread(Fluids.flow(2n, 3n, 2n, 8), openBelow));
assert.deepEqual(falling, [{ $: "Flow", x: 2n, y: 2n, z: 2n, level: 8, source: false, block: 7 }]);
const lavaFalling = listValues(Fluids.spread(Fluids.lava_flow(2n, 3n, 2n, 8), openBelow));
assert.deepEqual(lavaFalling, [{ $: "Flow", x: 2n, y: 2n, z: 2n, level: 8, source: false, block: 21 }]);

const blockedBelow = sampleList([
  Fluids.sample(2n, 2n, 2n, 1),
  Fluids.sample(1n, 3n, 2n, 0),
  Fluids.sample(3n, 3n, 2n, 0),
  Fluids.sample(2n, 3n, 1n, 0),
  Fluids.sample(2n, 3n, 3n, 0),
]);
const spread = listValues(Fluids.spread(Fluids.flow(2n, 3n, 2n, 3), blockedBelow));
assert.deepEqual(spread, [
  { $: "Flow", x: 1n, y: 3n, z: 2n, level: 2, source: false, block: 7 },
  { $: "Flow", x: 3n, y: 3n, z: 2n, level: 2, source: false, block: 7 },
  { $: "Flow", x: 2n, y: 3n, z: 1n, level: 2, source: false, block: 7 },
  { $: "Flow", x: 2n, y: 3n, z: 3n, level: 2, source: false, block: 7 },
]);

const dry = listValues(Fluids.spread(Fluids.flow(2n, 3n, 2n, 1), blockedBelow));
assert.deepEqual(dry, []);

let state = Fluids.seed(Fluids.empty(), 2n, 3n, 2n, 3);
const seeded = state;
state = Fluids.tick(state, blockedBelow);
const stateFlows = listValues(Fluids.state_flows(state));
assert.equal(stateFlows.length, 5);
assert.ok(stateFlows.some((value) => value.$ === "Flow"
  && value.x === 2n && value.y === 3n && value.z === 2n
  && Number(value.level) === 3));
const filled = listValues(Fluids.changes(seeded, state));
assert.equal(filled.length, 4);
assert.ok(filled.every((value) => value.block === 7));
state = Fluids.remove(state, 2n, 3n, 2n);
assert.ok(!listValues(Fluids.state_flows(state)).some((value) => (
  value.x === 2n && value.y === 3n && value.z === 2n
)));
const flowing = state;
state = Fluids.tick(state, blockedBelow);
assert.equal(listValues(Fluids.state_flows(state)).length, 0);
const drained = listValues(Fluids.changes(flowing, state));
assert.equal(drained.length, 4);
assert.ok(drained.every((value) => value.block === 0));

const lavaState = Fluids.seed_lava(Fluids.empty(), 2n, 3n, 2n, 8);
const lavaChanges = listValues(Fluids.changes(Fluids.empty(), lavaState));
assert.deepEqual(lavaChanges, [{ $: "Edit", x: 2n, y: 3n, z: 2n, block: 21 }]);
const lavaContactSamples = sampleList([
  Fluids.sample(1n, 3n, 2n, 7),
]);
const lavaReactions = listValues(Fluids.reactions(lavaState, lavaContactSamples));
assert.deepEqual(lavaReactions, [{ $: "Edit", x: 2n, y: 3n, z: 2n, block: 23 }]);
assert.equal(listValues(Fluids.state_flows(Fluids.react(lavaState, lavaContactSamples))).length, 0);
const flowingLavaState = {
  $: "State",
  flows: { $: "Con", head: Fluids.lava_flow(2n, 3n, 2n, 2), tail: { $: "Nil" } },
};
assert.deepEqual(listValues(Fluids.reactions(flowingLavaState, lavaContactSamples)), [
  { $: "Edit", x: 2n, y: 3n, z: 2n, block: 22 },
]);

let manyFlows = Fluids.empty();
for (let index = 0; index < 40; index += 1) {
  manyFlows = Fluids.seed(manyFlows, BigInt(index), 1n, 1n, 8);
}
manyFlows = Fluids.remove(manyFlows, 39n, 1n, 1n);
assert.equal(listValues(Fluids.state_flows(manyFlows)).length, 39);
const currentFlows = { $: "Con", head: Fluids.flow(2n, 1n, 3n, 8), tail: { $: "Nil" } };
const current = Fluids.current(currentFlows, 3.5, 1.1, 3.0);
assert.ok(Number(Fluids.current_x(current)) > 0);
assert.ok(Math.abs(Number(Fluids.current_z(current))) < 0.01);
console.log("bend fluids ok");
