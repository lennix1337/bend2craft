import assert from "node:assert/strict";
import World from "../world/world.bend";

assert.equal(World.default_seed(), 1337n);

const cells = [
  [4n, 7n],
  [19n, 23n],
  [31n, 11n],
  [42n, 37n],
];
const first = cells.map(([x, z]) => Number(World.column_height(1337n, x, z)));
const repeat = cells.map(([x, z]) => Number(World.column_height(1337n, x, z)));
const other = cells.map(([x, z]) => Number(World.column_height(1338n, x, z)));

assert.deepEqual(first, repeat);
assert.notDeepEqual(first, other);
console.log(JSON.stringify({ seed: 1337, first, other }));
