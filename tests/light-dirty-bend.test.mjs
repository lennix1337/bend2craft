import assert from "node:assert/strict";
import Dirty from "../world/light-dirty.bend";

function chunksFromList(list) {
  const result = [];
  for (let node = list; node?.$ === "Con"; node = node.tail) {
    result.push([Number(node.head.x), Number(node.head.z)]);
  }
  return result;
}

assert.deepEqual(chunksFromList(Dirty.chunks(32n, 32n, 16n)).sort(), [
  [1, 1], [1, 2], [1, 3],
  [2, 1], [2, 2], [2, 3],
  [3, 1], [3, 2], [3, 3],
].sort());
assert.deepEqual(chunksFromList(Dirty.chunks(0n, 0n, 16n)).sort(), [
  [0, 0], [0, 1], [1, 0], [1, 1],
].sort());
const cells = [];
for (let node = Dirty.cells_radius(8n, 8n, 8n, 1n); node?.$ === "Con"; node = node.tail) {
  cells.push([Number(node.head.x), Number(node.head.y), Number(node.head.z)]);
}
assert.equal(cells.length, 7);
assert.ok(cells.some(([x, y, z]) => x === 8 && y === 8 && z === 8));
const columnCells = [];
for (let node = Dirty.cells_column(8n, 8n, 8n); node?.$ === "Con"; node = node.tail) {
  columnCells.push([Number(node.head.x), Number(node.head.y), Number(node.head.z)]);
}
assert.equal(columnCells.length, 20);
assert.deepEqual(columnCells[0], [8, 19, 8]);
assert.deepEqual(columnCells.at(-1), [8, 0, 8]);
console.log("bend light dirty chunks ok");
