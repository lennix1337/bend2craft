import assert from "node:assert/strict";
import {
  DEFAULT_CHUNK_SIZE,
  createChunkedWorld,
} from "../web/chunk-world.js";

assert.equal(DEFAULT_CHUNK_SIZE, 16);

let bulkCalls = 0;
const bulkWorld = createChunkedWorld({
  chunkSize: 4,
  maxY: 3,
  renderRadius: 1,
  generateChunk: () => {
    bulkCalls += 1;
    const chunk = new Array(4 * 4 * 3).fill(0);
    chunk[0] = 1;
    return chunk;
  },
});
bulkWorld.loadAround(6, 6);
assert.equal(bulkCalls, 9);
assert.equal(bulkWorld.blockAt(0, 0, 0), 1);
assert.equal(bulkWorld.blockAt(0, 1, 0), 0);

let budgetCalls = 0;
const budgetWorld = createChunkedWorld({
  chunkSize: 4,
  maxY: 3,
  renderRadius: 1,
  loadBudget: 1,
  generateChunk: () => {
    budgetCalls += 1;
    return new Array(4 * 4 * 3).fill(0);
  },
});
const budgetFirst = budgetWorld.loadAround(6, 6);
assert.equal(budgetFirst.activeChunks, 1);
assert.equal(budgetFirst.pendingChunks, 8);
assert.equal(budgetWorld.blockAt(9, 0, 9), 0);
assert.equal(budgetCalls, 1);
for (let index = 0; index < 8; index += 1) budgetWorld.loadAround(6, 6);
assert.equal(budgetWorld.activeChunkCount(), 9);
assert.equal(budgetCalls, 9);

let pinnedCalls = 0;
const pinnedWorld = createChunkedWorld({
  chunkSize: 4,
  maxY: 3,
  renderRadius: 0,
  generateChunk: () => {
    pinnedCalls += 1;
    return new Array(4 * 4 * 3).fill(0);
  },
});
pinnedWorld.pinChunk(5, 5);
pinnedWorld.loadAround(6, 6);
assert.equal(pinnedWorld.pinnedChunkCount(), 1);
pinnedWorld.loadAround(30, 30);
assert.equal(pinnedWorld.activeChunkCount(), 1);
let pinnedSeen = [];
pinnedWorld.forEachPinnedChunk((x, z) => pinnedSeen.push(`${x},${z}`));
assert.deepEqual(pinnedSeen, ["5,5"]);
assert.ok(pinnedCalls >= 2);
pinnedWorld.unpinChunk(5, 5);
assert.equal(pinnedWorld.pinnedChunkCount(), 0);

let list = { $: "Nil" };
for (let index = 4 * 4 * 3 - 1; index >= 0; index -= 1) {
  list = { $: "Con", head: index === 0 ? 7 : 0, tail: list };
}
const listWorld = createChunkedWorld({
  chunkSize: 4,
  maxY: 3,
  generateChunk: () => list,
});
listWorld.loadAround(6, 6);
assert.equal(listWorld.blockAt(0, 0, 0), 7);
assert.equal(listWorld.blockAt(1, 0, 0), 0);

const generated = [];
const world = createChunkedWorld({
  chunkSize: 4,
  maxY: 3,
  renderRadius: 1,
  generateBlock: (x, y, z) => {
    generated.push(`${x},${y},${z}`);
    return y === 0 ? 1 : 0;
  },
});

assert.deepEqual(world.chunkCoordinates(0, 0), [0, 0]);
assert.deepEqual(world.chunkCoordinates(7, 8), [1, 2]);
assert.equal(world.inside(0, 0, 0), true);
assert.equal(world.inside(-1, 0, 0), true);
assert.equal(world.inside(0, 3, 0), false);

const firstLoad = world.loadAround(6, 6);
assert.equal(firstLoad.activeChunks, 9);
assert.equal(world.activeChunkCount(), 9);
assert.equal(world.blockAt(0, 0, 0), 1);
assert.equal(world.blockAt(4, 0, 0), 1);
assert.equal(world.isActive(0, 0), true);
assert.equal(world.isActive(12, 0), false);
assert.equal(generated.length, 9 * 4 * 4 * 3);
assert.equal(world.loadAround(6, 6).changed, false);

assert.equal(world.setBlock(5, 1, 2, 9), true);
assert.equal(world.blockAt(5, 1, 2), 9);
world.loadAround(30, 30);
assert.equal(world.activeChunkCount(), 9);
world.loadAround(6, 6);
assert.equal(world.blockAt(5, 1, 2), 9);
assert.equal(world.setBlock(-1, 1, 2, 9), true);
assert.equal(world.blockAt(-1, 1, 2), 9);

let lightCalls = 0;
let dirtyCalls = 0;
let lightPatchCalls = 0;
const lightInvalidations = [];
const lightWorld = createChunkedWorld({
  chunkSize: 4,
  maxY: 3,
  renderRadius: 1,
  generateChunk: () => new Array(4 * 4 * 3).fill(0),
  generateLightChunk: () => {
    lightCalls += 1;
    return new Array(4 * 4 * 3).fill(lightCalls);
  },
  affectedLightCells: () => {
    dirtyCalls += 1;
    return { $: "Con", head: { $: "Cell", x: 5n, y: 1n, z: 2n }, tail: { $: "Nil" } };
  },
  generateLightCells: () => {
    lightPatchCalls += 1;
    return { $: "Con", head: { $: "LightCell", x: 5n, y: 1n, z: 2n, light: 18 }, tail: { $: "Nil" } };
  },
  invalidateLightFields: (...values) => lightInvalidations.push(values),
});
lightWorld.loadAround(6, 6);
assert.equal(lightCalls, 9);
const beforeLight = lightWorld.lightAt(5, 1, 2);
assert.ok(beforeLight > 0 && beforeLight < 18);
assert.equal(lightWorld.setBlock(5, 1, 2, 12), true);
assert.equal(lightCalls, 9);
assert.equal(dirtyCalls, 1);
assert.equal(lightPatchCalls, 1);
assert.deepEqual(lightInvalidations[0], [5, 1, 2, 0, 12]);
assert.equal(lightWorld.getLightDirtyCells().$, "Con");
assert.ok(lightWorld.lightAt(5, 1, 2) > beforeLight);
assert.equal(lightWorld.setBlock(5, 1, 3, 2), true);
assert.equal(lightCalls, 9);
assert.equal(dirtyCalls, 1);
assert.equal(lightInvalidations.length, 2);
assert.equal(lightWorld.setBlock(5, 1, 2, 0), true);
assert.equal(lightCalls, 9);
assert.equal(dirtyCalls, 2);
assert.equal(lightPatchCalls, 2);
assert.deepEqual(lightInvalidations[2], [5, 1, 2, 12, 0]);

let loadedBlocks = 0;
world.forEachLoadedBlock((x, y, z, block) => {
  assert.ok(x >= 0 && y >= 0 && z >= 0);
  if (block !== 0) loadedBlocks += 1;
});
assert.equal(loadedBlocks, 9 * 4 * 4 + 1);
console.log(JSON.stringify({ activeChunks: world.activeChunkCount(), loadedBlocks }));
