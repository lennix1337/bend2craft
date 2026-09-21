import assert from "node:assert/strict";
import Fire from "../world/fire.bend";

function listValues(list) {
  const values = [];
  for (let node = list; node?.$ === "Con"; node = node.tail) values.push(node.head);
  return values;
}

function samples(values) {
  let list = { $: "Nil" };
  for (let index = values.length - 1; index >= 0; index -= 1) {
    list = { $: "Con", head: values[index], tail: list };
  }
  return list;
}

const openFire = samples([
  Fire.sample(3n, 3n, 2n, 0),
  Fire.sample(4n, 3n, 2n, 5),
]);
const state = Fire.ignite(Fire.empty(), 2n, 3n, 2n);
const next = Fire.tick(state, openFire);
const cells = listValues(Fire.state_cells(next));
assert.equal(cells.length, 2);
assert.ok(cells.some((cell) => cell.x === 2n && Number(cell.age) === 1));
assert.ok(cells.some((cell) => cell.x === 3n && Number(cell.age) === 0));
const added = listValues(Fire.changes(Fire.empty(), state));
assert.deepEqual(added, [{ $: "Edit", x: 2n, y: 3n, z: 2n, block: 24 }]);
const lavaSamples = samples([
  Fire.sample(2n, 3n, 2n, 21),
  Fire.sample(3n, 3n, 2n, 5),
  Fire.sample(3n, 4n, 2n, 0),
]);
const lavaIgnited = Fire.ignite_lava(Fire.empty(), lavaSamples);
assert.ok(listValues(Fire.state_cells(lavaIgnited)).some((cell) => (
  cell.x === 3n && cell.y === 4n && cell.z === 2n
)));

let dying = state;
const blocked = samples([Fire.sample(2n, 3n, 2n, 1)]);
for (let index = 0; index < 8; index += 1) dying = Fire.tick(dying, blocked);
assert.equal(listValues(Fire.state_cells(dying)).length, 0);
const removed = listValues(Fire.changes(state, dying));
assert.deepEqual(removed, [{ $: "Edit", x: 2n, y: 3n, z: 2n, block: 0 }]);
console.log("bend fire ok");
