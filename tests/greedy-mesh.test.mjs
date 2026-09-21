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
assert.equal(top.ao.length, 4);
assert.ok(top.ao.every((value) => value >= 0 && value <= 1));
const occludedTop = meshFor([
  [-1, 0, 0, 2], [0, 0, -1, 2], [-1, 0, -1, 2], [0, 0, 0, 1],
]).quads.find((quad) => quad.faceIndex === 0 && quad.block === 1);
assert.ok(occludedTop.ao.some((value) => value < 1));

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
const waterTop = quadCorners({ faceIndex: 0, fixed: 1, u: 0, v: 0, width: 1, height: 1, block: 7 });
assert.equal(waterTop[0][1], 14 / 16);
const lavaTop = quadCorners({ faceIndex: 0, fixed: 1, u: 0, v: 0, width: 1, height: 1, block: 21 });
assert.equal(lavaTop[0][1], 14 / 16);

// Terrain under water keeps its top face; the water bottom stays culled.
const lakebed = meshFor([[0, 0, 0, 1], [0, 1, 0, 7]]);
const lakebedTop = lakebed.quads.filter((quad) => quad.faceIndex === 0 && quad.block === 1);
assert.equal(lakebedTop.length, 1);
assert.equal(lakebed.quads.filter((quad) => quad.faceIndex === 1 && quad.block === 7).length, 0);

// Water against water stays culled; only the upper surface renders.
const stackedWater = meshFor([[0, 1, 0, 7], [0, 2, 0, 7]]);
assert.equal(stackedWater.quads.filter((quad) => quad.faceIndex === 0 && quad.block === 7 && quad.fixed === 2).length, 0);
assert.equal(stackedWater.quads.filter((quad) => quad.faceIndex === 0 && quad.block === 7 && quad.fixed === 3).length, 1);
const stackedLava = meshFor([[0, 1, 0, 21], [0, 2, 0, 21]]);
assert.equal(stackedLava.quads.filter((quad) => quad.faceIndex === 0 && quad.block === 21 && quad.fixed === 2).length, 0);

// Opaque faces against water render instead of being culled.
const shoreline = meshFor([[0, 0, 0, 1], [1, 0, 0, 7]]);
assert.equal(shoreline.quads.filter((quad) => quad.faceIndex === 2 && quad.block === 1).length, 1);
console.log("greedy mesh ok");
