import assert from "node:assert/strict";
import World from "../world/world.bend";

const width = Number(World.width());
const depth = Number(World.depth());
const maxY = Number(World.max_y());
const chunkSize = Number(World.chunk_size());
const seaLevel = Number(World.sea_level());
assert.equal(width, 48);
assert.equal(depth, 48);
assert.equal(maxY, 20);
assert.equal(chunkSize, 16);
assert.equal(seaLevel, 7);
assert.equal(Number(World.biome_at(1337n, 40n, 40n)), 0);
const generatedChunk = World.chunk(1337n, 2n, 2n);
assert.equal(Array.isArray(generatedChunk), true);
assert.equal(generatedChunk.length, 8192);
const chunkIndex = (x, y, z) => x + chunkSize * (z + chunkSize * y);
assert.equal(Number(generatedChunk[chunkIndex(3, 7, 3)]), Number(World.block(1337n, 35n, 7n, 35n)));
assert.equal(Number(generatedChunk[chunkIndex(0, 0, 0)]), Number(World.block(1337n, 32n, 0n, 32n)));

let grass = 0;
let leaves = 0;
let wood = 0;
let sand = 0;
let water = 0;
let coalOre = 0;
let ironOre = 0;
let diamondOre = 0;
const heights = new Set();
for (let y = 0; y < maxY; y += 1) {
  for (let z = 0; z < depth; z += 1) {
    for (let x = 0; x < width; x += 1) {
      const block = Number(World.block(1337n, BigInt(x), BigInt(y), BigInt(z)));
      if (block === 3) grass += 1;
      if (block === 4) leaves += 1;
      if (block === 5) wood += 1;
      if (block === 6) sand += 1;
      if (block === 7) water += 1;
      if (block === 8) coalOre += 1;
      if (block === 9) ironOre += 1;
      if (block === 10) diamondOre += 1;
    }
  }
}
for (let z = 0; z < depth; z += 1) {
  for (let x = 0; x < width; x += 1) {
    heights.add(Number(World.column_height(1337n, BigInt(x), BigInt(z))));
  }
}
assert.ok(grass > 0);
assert.ok(wood > 0);
assert.ok(leaves > 0);
assert.ok(sand > 0);
assert.ok(water > 0);
assert.ok(coalOre > 0);
assert.ok(ironOre > 0);
assert.ok(diamondOre > 0);
assert.ok(heights.size >= 3);
const heightList = [...heights];
assert.ok(Math.max(...heightList) - Math.min(...heightList) <= 4);

let farTree = false;
for (let z = 48; z < 80 && !farTree; z += 1) {
  for (let x = 48; x < 80; x += 1) {
    if (World.tree_at(1337n, BigInt(x), BigInt(z))) {
      farTree = true;
      break;
    }
  }
}
assert.equal(farTree, true);
const biomes = new Set();
for (let z = 96; z < 256; z += 16) {
  for (let x = 96; x < 256; x += 16) biomes.add(Number(World.biome_at(1337n, BigInt(x), BigInt(z))));
}
assert.ok(biomes.size >= 3);
console.log(JSON.stringify({ width, depth, maxY, chunkSize, seaLevel, grass, wood, leaves, sand, water, coalOre, ironOre, diamondOre, heights: heights.size }));
