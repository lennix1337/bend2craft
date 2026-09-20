import assert from "node:assert/strict";
import { buildGreedyQuads, quadCorners } from "../web/greedy-mesh.js";

function meshFor(entries, active = () => true) {
  const blocks = new Map(entries.map(([x, y, z, block]) => [`${x},${y},${z}`, block]));
  return buildGreedyQuads({
    forEachLoadedBlock(callback) {
      for (const [key, block] of blocks) {
        const [x, y, z] = key.split(",").map(Number);
        callback(x, y, z, block);
      }
    },
    blockAt: (x, y, z) => blocks.get(`${x},${y},${z}`) ?? 0,
    isActive: active,
  });
}

const flat = meshFor([
  [0, 0, 0, 1], [1, 0, 0, 1],
  [0, 0, 1, 1], [1, 0, 1, 1],
]);
assert.equal(flat.blockCount, 4);
assert.equal(flat.quads.length, 6);
const top = flat.quads.find((quad) => quad.faceIndex === 0);
assert.deepEqual(
  { width: top.width, height: top.height, block: top.block },
  { width: 2, height: 2, block: 1 },
);

const differentBlocks = meshFor([
  [0, 0, 0, 1], [1, 0, 0, 2],
  [0, 0, 1, 1], [1, 0, 1, 2],
]);
assert.equal(differentBlocks.blockCount, 4);
assert.equal(differentBlocks.quads.filter((quad) => quad.faceIndex === 0).length, 2);

const inactiveNeighbor = meshFor([[0, 0, 0, 1]], (x, z) => x === 0 && z === 0);
assert.equal(inactiveNeighbor.quads.length, 6);
const farmlandTop = quadCorners({ faceIndex: 0, fixed: 1, u: 0, v: 0, width: 1, height: 1, block: 20 });
assert.equal(farmlandTop[0][1], 15 / 16);
console.log("greedy mesh ok");
