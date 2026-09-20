import assert from "node:assert/strict";
import {
  atlasUV,
  atlasTile,
  ATLAS_COLUMNS,
  ATLAS_ROWS,
  ATLAS_TILE_SIZE,
  BLOCK_TEXTURES,
  TEXTURE_PASS,
  blockTexture,
  createTextureAtlas,
} from "../web/texture-atlas.js";

assert.equal(ATLAS_COLUMNS, 5);
assert.equal(ATLAS_ROWS, 5);
assert.equal(ATLAS_TILE_SIZE, 16);
assert.equal(TEXTURE_PASS.id, "fallback-pixel-pass-v1");
assert.equal(TEXTURE_PASS.referenceSheet, null);
assert.ok(Object.isFrozen(TEXTURE_PASS));
assert.equal(BLOCK_TEXTURES.length, ATLAS_COLUMNS * ATLAS_ROWS);
assert.equal(blockTexture(1), BLOCK_TEXTURES[1]);
assert.equal(blockTexture({ id: 1 }), BLOCK_TEXTURES[1]);
assert.equal(blockTexture("stone"), BLOCK_TEXTURES[1]);
assert.equal(blockTexture("unknown"), null);
assert.ok(Object.isFrozen(BLOCK_TEXTURES[1]));
assert.ok(Object.isFrozen(BLOCK_TEXTURES[1].palette));
assert.ok(Object.isFrozen(BLOCK_TEXTURES[1].pattern));
assert.deepEqual(atlasTile(1), { column: 1, row: 0 });
assert.deepEqual(atlasTile(10), { column: 0, row: 2 });
assert.deepEqual(atlasTile(99), { column: 4, row: 4 });

for (const block of [1, 5, 8, 10, 11, 16, 17, 18, 19]) {
  const uv = atlasUV(block);
  assert.equal(uv.length, 8);
  for (const value of uv) assert.ok(value >= 0 && value <= 1);
}

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

const stoneOperations = tileOperations(1);
assert.ok(stoneOperations.some(({ x, y, width, height, globalAlpha }) => (
  x === 0 && y === 0 && width === ATLAS_TILE_SIZE && height === 1
    && globalAlpha === TEXTURE_PASS.edgeHighlightAlpha
)));
assert.ok(stoneOperations.some(({ x, y, width, height, globalAlpha }) => (
  x === 0 && y === ATLAS_TILE_SIZE - 1 && width === ATLAS_TILE_SIZE && height === 1
    && globalAlpha === TEXTURE_PASS.edgeShadowAlpha
)));

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
assert.equal(signatures.size, 25, "every block atlas tile should have a distinct texture pattern");

console.log("texture atlas ok");
