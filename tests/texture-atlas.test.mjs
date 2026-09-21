import assert from "node:assert/strict";
import {
  atlasUV,
  atlasTile,
  blockFaceTile,
  ATLAS_COLUMNS,
  ATLAS_ROWS,
  ATLAS_TILE_SIZE,
  BLOCK_TEXTURES,
  ENTITY_TEXTURES,
  VARIANT_TEXTURES,
  TEXTURE_PASS,
  blockTexture,
  blockFaceTileAt,
  createAtlasCanvas,
  createTextureAtlas,
} from "../web/texture-atlas.js";

assert.equal(ATLAS_COLUMNS, 5);
assert.equal(ATLAS_ROWS, 10);
assert.equal(ATLAS_TILE_SIZE, 16);
assert.equal(TEXTURE_PASS.id, "fallback-pixel-pass-v1");
assert.equal(TEXTURE_PASS.referenceSheet, null);
assert.equal(TEXTURE_PASS.gridSize, 8);
assert.equal(TEXTURE_PASS.blockGridSize, 16);
assert.ok(Object.isFrozen(TEXTURE_PASS));
assert.ok(TEXTURE_PASS.edgeHighlightAlpha <= 0.08, "tile highlights should not outline every block face");
assert.ok(TEXTURE_PASS.edgeShadowAlpha <= 0.1, "tile shadows should not outline every block face");
assert.ok(TEXTURE_PASS.noiseHighlightAlpha <= 0.06, "texture grain should stay subtle");
assert.ok(TEXTURE_PASS.noiseShadowAlpha <= 0.04, "texture grain should stay subtle");
assert.equal(BLOCK_TEXTURES.length, 30);
assert.equal(VARIANT_TEXTURES.length, 10);
assert.equal(ENTITY_TEXTURES.length, 10);
assert.equal(blockTexture(1), BLOCK_TEXTURES[1]);
assert.equal(blockTexture({ id: 1 }), BLOCK_TEXTURES[1]);
assert.equal(blockTexture("stone"), BLOCK_TEXTURES[1]);
assert.equal(blockTexture("unknown"), null);
assert.equal(typeof createAtlasCanvas, "function");
assert.ok(Object.isFrozen(BLOCK_TEXTURES[1]));
assert.ok(Object.isFrozen(BLOCK_TEXTURES[1].palette));
assert.ok(Object.isFrozen(BLOCK_TEXTURES[1].pattern));
assert.deepEqual(atlasTile(1), { column: 1, row: 0 });
assert.deepEqual(atlasTile(10), { column: 0, row: 2 });
assert.deepEqual(atlasTile(99), { column: 4, row: 9 });

for (const block of Array.from({ length: 26 }, (_, index) => index + 1)) {
  assert.equal(BLOCK_TEXTURES[block].pattern.length, 16, `block ${block} should use a 16px authored pattern`);
  assert.ok(BLOCK_TEXTURES[block].pattern.every((row) => row.length === 16));
}

for (const [index, texture] of ENTITY_TEXTURES.entries()) {
  assert.equal(texture.id, 40 + index);
  assert.equal(texture.pattern.length, 16);
  assert.ok(texture.pattern.every((row) => row.length === 16));
}

for (const block of [1, 5, 8, 10, 11, 16, 17, 18, 19]) {
  const uv = atlasUV(block);
  assert.equal(uv.length, 8);
  for (const value of uv) assert.ok(value >= 0 && value <= 1);
}

assert.equal(blockTexture("grass_top").id, 21);
assert.equal(blockTexture("wood_top").id, 22);
assert.equal(blockTexture("lava").id, 23);
assert.equal(blockTexture("fire").id, 24);
assert.equal(blockTexture("cobblestone").id, 25);
assert.equal(blockTexture("obsidian").id, 26);
assert.equal(blockFaceTile(3, 0), 21);
assert.equal(blockFaceTile(3, 1), 2);
assert.equal(blockFaceTile(3, 4), 3);
assert.equal(blockFaceTile(5, 0), 22);
assert.equal(blockFaceTile(5, 1), 22);
assert.equal(blockFaceTile(5, 3), 5);
assert.equal(blockFaceTile(1, 0), 1);
assert.equal(blockFaceTile(7, 0), 7);
assert.equal(blockFaceTile(21, 0), 23);
assert.equal(blockFaceTile(22, 0), 25);
assert.equal(blockFaceTile(23, 0), 26);
assert.equal(blockFaceTile(99, 0), 49);
assert.ok([1, 30].includes(blockFaceTileAt(1, 0, 4, 8)));
assert.ok([1, 30].includes(blockFaceTileAt(1, 0, 5, 8)));
assert.notEqual(blockFaceTileAt(1, 0, 4, 8), blockFaceTileAt(1, 0, 5, 8));

const fills = [];
const strokes = [];
const context = {
  imageSmoothingEnabled: true,
  fillStyle: "",
  strokeStyle: "",
  globalAlpha: 1,
  globalCompositeOperation: "source-over",
  fillRect(x, y, width, height) {
    fills.push({
      x,
      y,
      width,
      height,
      fillStyle: this.fillStyle,
      globalAlpha: this.globalAlpha,
      globalCompositeOperation: this.globalCompositeOperation,
    });
  },
  strokeRect(x, y, width, height) {
    strokes.push({ x, y, width, height, strokeStyle: this.strokeStyle });
  },
};
const canvas = {
  width: 0,
  height: 0,
  getContext(kind) {
    assert.equal(kind, "2d");
    return context;
  },
};
const previousDocument = globalThis.document;
const glCalls = [];
const gl = {
  TEXTURE_2D: "TEXTURE_2D",
  RGBA: "RGBA",
  UNSIGNED_BYTE: "UNSIGNED_BYTE",
  UNPACK_FLIP_Y_WEBGL: "UNPACK_FLIP_Y_WEBGL",
  TEXTURE_MIN_FILTER: "TEXTURE_MIN_FILTER",
  TEXTURE_MAG_FILTER: "TEXTURE_MAG_FILTER",
  TEXTURE_WRAP_S: "TEXTURE_WRAP_S",
  TEXTURE_WRAP_T: "TEXTURE_WRAP_T",
  NEAREST: "NEAREST",
  CLAMP_TO_EDGE: "CLAMP_TO_EDGE",
  createTexture() {
    return { kind: "texture" };
  },
  bindTexture(...args) {
    glCalls.push(["bindTexture", ...args]);
  },
  pixelStorei(...args) {
    glCalls.push(["pixelStorei", ...args]);
  },
  texImage2D(...args) {
    glCalls.push(["texImage2D", ...args]);
  },
  texParameteri(...args) {
    glCalls.push(["texParameteri", ...args]);
  },
};

try {
  globalThis.document = {
    createElement(kind) {
      assert.equal(kind, "canvas");
      return canvas;
    },
  };
  assert.deepEqual(createTextureAtlas(gl, {
    1: [0.34, 0.38, 0.42],
    7: [0.16, 0.5, 0.82],
  }), { kind: "texture" });
} finally {
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
}

assert.equal(canvas.width, ATLAS_COLUMNS * ATLAS_TILE_SIZE);
assert.equal(canvas.height, ATLAS_ROWS * ATLAS_TILE_SIZE);
assert.equal(strokes.length, ATLAS_COLUMNS * ATLAS_ROWS);
assert.equal(glCalls.filter(([name]) => name === "texImage2D").length, 1);
assert.equal(glCalls.filter(([name]) => name === "pixelStorei").length, 0);

const stoneOperations = tileOperations(1);
assert.ok(stoneOperations.some(({ x, y, width, height, globalAlpha }) => (
  x === 0 && y === 0 && width === ATLAS_TILE_SIZE && height === 1
    && globalAlpha === TEXTURE_PASS.edgeHighlightAlpha
)));
assert.ok(stoneOperations.some(({ x, y, width, height, globalAlpha }) => (
  x === 0 && y === ATLAS_TILE_SIZE - 1 && width === ATLAS_TILE_SIZE && height === 1
    && globalAlpha === TEXTURE_PASS.edgeShadowAlpha
)));
assert.ok(tileOperations(3).filter(({ fillStyle }) => fillStyle === BLOCK_TEXTURES[3].palette.base).length >= 2);
assert.ok(tileOperations(5).filter(({ fillStyle }) => fillStyle === BLOCK_TEXTURES[5].palette.base).length >= 2);
assert.equal(fills.some(({ globalCompositeOperation }) => globalCompositeOperation === "destination-in"), false);
assert.ok(tileOperations(7).some(({ globalAlpha, globalCompositeOperation }) => (
  globalAlpha === 0.78 && globalCompositeOperation === "source-over"
)));
assert.ok(tileOperations(3).some(({ width, height }) => width === 1 && height === 1));
assert.ok(tileOperations(7).some(({ width, height }) => width === 1 && height === 1));

function tileOperations(block) {
  const { column, row } = atlasTile(block);
  const x0 = column * ATLAS_TILE_SIZE;
  const y0 = row * ATLAS_TILE_SIZE;
  return fills
    .filter(({ x, y }) => x >= x0 && x < x0 + ATLAS_TILE_SIZE && y >= y0 && y < y0 + ATLAS_TILE_SIZE)
    .map(({ x, y, width, height, fillStyle, globalAlpha, globalCompositeOperation }) => ({
      x: x - x0,
      y: y - y0,
      width,
      height,
      fillStyle,
      globalAlpha,
      globalCompositeOperation,
    }));
}

const signatures = new Set();
for (let block = 0; block < ATLAS_COLUMNS * ATLAS_ROWS; block += 1) {
  const operations = tileOperations(block);
  assert.ok(operations.length >= 3, `block ${block} should contain pixel details`);
  signatures.add(JSON.stringify(operations));
}
assert.equal(signatures.size, ATLAS_COLUMNS * ATLAS_ROWS, "every atlas tile should contain a distinct texture pattern");

console.log("texture atlas ok");
