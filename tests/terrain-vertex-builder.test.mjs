import assert from "node:assert/strict";
import { buildTerrainVertexArrays } from "../web/terrain-vertex-builder.js";
import { TERRAIN_FACE_SHADES, litFaceColor } from "../web/material-lighting.js";
import {
  isFireMaterial,
  isLavaMaterial,
  isOpaqueMaterial,
  isWaterMaterial,
  waterDepth,
} from "../web/surface-materials.js";

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
const sharedSide = buildTerrainVertexArrays([{ ...quad, faceIndex: 2 }], 1).opaque;
const expectedSide = litFaceColor(2, 1, 15, TERRAIN_FACE_SHADES[2]);
assert.ok(
  Array.from(sharedSide.colors.slice(0, 3)).every((value, index) => Math.abs(value - expectedSide[index]) < 1e-6),
  "chunk terrain must use the shared face-shade contract",
);

const grassTop = buildTerrainVertexArrays([{ ...quad, block: 3, faceIndex: 0 }], 1).opaque;
const grassSide = buildTerrainVertexArrays([{ ...quad, block: 3, faceIndex: 2 }], 1).opaque;
assert.ok(grassTop.tiles[1] < grassTop.tiles[3], "grass top keeps atlas rows top-to-bottom");
assert.ok(grassSide.tiles[1] > grassSide.tiles[3], "grass side flips atlas rows onto the vertical face");

const water = buildTerrainVertexArrays([{ ...quad, block: 7 }], 1).water;
assert.equal(water.quadCount, 1);
assert.equal(water.positions.length, 18);
assert.equal(buildTerrainVertexArrays([quad], 1).water.quadCount, 0);

// Water carries its sampled column depth inside the material band, so a deeper
// ocean can be tinted without a second vertex attribute.
const shallowWater = buildTerrainVertexArrays([{ ...quad, block: 7, waterDepthCells: 0 }], 1).water;
const deepWater = buildTerrainVertexArrays([{ ...quad, block: 7, waterDepthCells: 5 }], 1).water;
assert.equal(shallowWater.materials.length, 6);
assert.ok(isWaterMaterial(shallowWater.materials[0]), "shallow water must stay in the water band");
assert.ok(isWaterMaterial(deepWater.materials[0]), "deep water must stay in the water band");
assert.ok(waterDepth(deepWater.materials[0]) >= 0.99, "a full column must decode to near-full depth");
// The encoding must clamp below 1 so a full-depth quad can never encode 2.0,
// which is the lava band.
assert.ok(waterDepth(deepWater.materials[0]) < 1, "full depth must stay inside the water band");
assert.equal(waterDepth(shallowWater.materials[0]), 0, "a zero depth cell must decode to no depth");
assert.ok(waterDepth(deepWater.materials[0]) > waterDepth(shallowWater.materials[0]));
assert.ok(
  isWaterMaterial(deepWater.materials[0]) && !isLavaMaterial(deepWater.materials[0]) && !isFireMaterial(deepWater.materials[0]),
  "a deep water quad must not spill into the lava or fire band",
);

// Opaque terrain encodes `10 + block` and must never be routed to the fluid
// layer, whatever the fire band looks like.
const stone = buildTerrainVertexArrays([{ ...quad, block: 1 }], 1);
assert.equal(stone.opaque.quadCount, 1);
assert.equal(stone.water.quadCount, 0);
assert.equal(isOpaqueMaterial(stone.opaque.materials[0]), true);
assert.equal(isFireMaterial(stone.opaque.materials[0]), false, "stone must not match the fire band");

console.log("terrain vertex builder ok");
