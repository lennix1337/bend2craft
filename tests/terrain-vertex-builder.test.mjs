import assert from "node:assert/strict";
import { buildTerrainVertexArrays } from "../web/terrain-vertex-builder.js";

const quad = {
  faceIndex: 0,
  fixed: 1,
  u: 0,
  v: 0,
  width: 1,
  height: 1,
  block: 1,
  x: 0,
  y: 0,
  z: 0,
  light: 15,
  ao: [1, 1, 1, 1],
};
const opaque = buildTerrainVertexArrays([quad], 1).opaque;
assert.equal(opaque.positions.length, 18);
assert.equal(opaque.colors.length, 18);
assert.equal(opaque.uvs.length, 12);
assert.equal(opaque.materials.length, 6);
assert.equal(opaque.tiles.length, 24);
assert.equal(opaque.quadCount, 1);
assert.deepEqual(Array.from(opaque.positions.slice(0, 3)), [0, 1, 0]);

const grassTop = buildTerrainVertexArrays([{ ...quad, block: 3, faceIndex: 0 }], 1).opaque;
const grassSide = buildTerrainVertexArrays([{ ...quad, block: 3, faceIndex: 2 }], 1).opaque;
assert.ok(grassTop.tiles[1] < grassTop.tiles[3], "grass top keeps atlas rows top-to-bottom");
assert.ok(grassSide.tiles[1] > grassSide.tiles[3], "grass side flips atlas rows onto the vertical face");

const water = buildTerrainVertexArrays([{ ...quad, block: 7 }], 1).water;
assert.equal(water.quadCount, 1);
assert.equal(water.positions.length, 18);
assert.equal(buildTerrainVertexArrays([quad], 1).water.quadCount, 0);
console.log("terrain vertex builder ok");
