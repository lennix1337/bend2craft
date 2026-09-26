import assert from "node:assert/strict";
import {
  atlasMipLevelGeometry,
  atlasUV,
  atlasCellOrigin,
  atlasTile,
  blockFaceTile,
  ATLAS_COLUMNS,
  ATLAS_ROWS,
  ATLAS_CAPACITY,
  ATLAS_MIPMAP_SAFE_LEVELS,
  ATLAS_TILE_GUTTER,
  ATLAS_TILE_SIZE,
  ATLAS_TILE_STRIDE,
  ATLAS_WIDTH,
  ATLAS_HEIGHT,
  BLOCK_TEXTURES,
  ATLAS_TEXTURES,
  ENTITY_TEXTURES,
  VARIANT_TEXTURES,
  TEXTURE_PASS,
  blockTexture,
  blockFaceTileAt,
  createAtlasCanvas,
  createTextureAtlas,
} from "../web/texture-atlas.js";

assert.equal(ATLAS_COLUMNS, 8);
assert.equal(ATLAS_ROWS, 8);
assert.equal(ATLAS_CAPACITY, 64);
assert.equal(ATLAS_TILE_SIZE, 64, "a face is ~30-60 screen pixels, so a 32-texel tile was magnified 1:1");
assert.ok(ATLAS_TILE_GUTTER > 0, "each tile must own padding so the mip chain cannot blend materials");
assert.equal(ATLAS_TILE_STRIDE, ATLAS_TILE_SIZE + 2 * ATLAS_TILE_GUTTER);
assert.equal(ATLAS_WIDTH, 1024, "the padded terrain atlas must remain power-of-two for mipmaps");
assert.equal(ATLAS_HEIGHT, 1024, "the padded terrain atlas must remain power-of-two for mipmaps");
// Every certified mip level has to be backed by its own padding, or the chain
// blends a tile into its neighbour at a level the shader is allowed to sample.
for (const level of ATLAS_MIPMAP_SAFE_LEVELS) {
  const geometry = atlasMipLevelGeometry(ATLAS_TILE_GUTTER, ATLAS_TILE_SIZE, level);
  assert.ok(
    geometry.padding >= 1,
    `mip level ${level} leaves no padding, so a tile would blend into its neighbour`,
  );
  assert.ok(
    geometry.interior >= 1,
    `mip level ${level} shrinks the tile below a pixel`,
  );
}
// The chain must stop at the last level that still has both padding and more
// than one interior texel, and must not certify a level past it.
const lastCertified = atlasMipLevelGeometry(ATLAS_TILE_GUTTER, ATLAS_TILE_SIZE, ATLAS_MIPMAP_SAFE_LEVELS.at(-1));
assert.ok(lastCertified.interior >= 2 && lastCertified.padding >= 1,
  "the last certified level must still keep a tile and its padding apart");
const nextLevel = atlasMipLevelGeometry(ATLAS_TILE_GUTTER, ATLAS_TILE_SIZE, ATLAS_MIPMAP_SAFE_LEVELS.at(-1) + 1);
assert.ok(nextLevel.interior < 2 || nextLevel.padding < 1,
  "the level past the certified range must genuinely be unusable");
assert.equal(TEXTURE_PASS.id, "fallback-pixel-pass-v1");
assert.equal(TEXTURE_PASS.referenceSheet, null);
assert.equal(TEXTURE_PASS.gridSize, 8);
assert.equal(TEXTURE_PASS.blockGridSize, 16);
assert.ok(Object.isFrozen(TEXTURE_PASS));
assert.equal(TEXTURE_PASS.edgeHighlightAlpha, 0.05, "tile highlights should remain material detail, not a wireframe");
assert.equal(TEXTURE_PASS.edgeShadowAlpha, 0.06, "tile shadows should remain material detail, not a wireframe");
assert.equal(TEXTURE_PASS.outline, "rgba(19, 27, 28, 0.05)");
assert.ok(TEXTURE_PASS.noiseHighlightAlpha <= 0.06, "texture grain should stay subtle");
assert.ok(TEXTURE_PASS.noiseShadowAlpha <= 0.04, "texture grain should stay subtle");
assert.equal(BLOCK_TEXTURES.length, 30);
assert.ok(
  BLOCK_TEXTURES[7].pattern.every((row) => !row.includes("wwwwww")),
  "water texture should not bake bright horizontal scanlines into the surface",
);
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
assert.deepEqual(atlasTile(10), { column: 2, row: 1 });
assert.deepEqual(atlasTile(99), { column: 1, row: 6 });

for (const block of Array.from({ length: 26 }, (_, index) => index + 1)) {
  assert.equal(BLOCK_TEXTURES[block].pattern.length, 16, `block ${block} should use a 16px authored pattern`);
  BLOCK_TEXTURES[block].pattern.forEach((row, rowIndex) => {
    assert.equal(row.length, 16, `block ${block} row ${rowIndex} should be 16px: ${row}`);
  });
}

for (const [index, texture] of ENTITY_TEXTURES.entries()) {
  assert.equal(texture.id, 40 + index);
  assert.equal(texture.pattern.length, 16);
  assert.ok(texture.pattern.every((row) => row.length === 16));
}

for (const texture of [...BLOCK_TEXTURES, ...VARIANT_TEXTURES, ...ENTITY_TEXTURES]) {
  for (const glyph of new Set(texture.pattern.join("").replaceAll(".", "").split(""))) {
    assert.notEqual(texture.palette[glyph], undefined, `${texture.name} should define glyph ${glyph}`);
  }
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
assert.equal(blockFaceTileAt(1, 0, 4, 8), 1);
assert.equal(blockFaceTileAt(1, 0, 5, 8), 1);
assert.equal(blockFaceTileAt(2, 0, 4, 8), 2);
assert.equal(blockFaceTileAt(3, 0, 4, 8), 21);
assert.equal(blockFaceTileAt(3, 2, 4, 8), 3);
assert.equal(blockFaceTileAt(4, 2, 4, 8), 4);
assert.equal(blockFaceTileAt(5, 2, 4, 8), 5);
assert.equal(blockFaceTileAt(6, 0, 4, 8), 6);

const fills = [];
const strokes = [];
const draws = [];
const imagePlacements = [];
const context = {
  imageSmoothingEnabled: true,
  fillStyle: "",
  strokeStyle: "",
  globalAlpha: 1,
  globalCompositeOperation: "source-over",
  clearRect(x, y, width, height) {
    fills.push({ x, y, width, height, fillStyle: "", globalAlpha: this.globalAlpha, globalCompositeOperation: this.globalCompositeOperation, cleared: true });
  },
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
  drawImage(...args) {
    draws.push(args);
  },
  // The atlas painter writes each tile through ImageData so the material
  // surface can be applied per texel, so the stub has to model a real pixel
  // buffer rather than pretend the call did nothing.
  createImageData(width, height) {
    const size = width * height * 4;
    return { width, height, data: new Uint8ClampedArray(size) };
  },
  putImageData(image, x, y) {
    imagePlacements.push({ x, y, width: image.width, height: image.height, image });
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
context.canvas = canvas;
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
  LINEAR: "LINEAR",
  LINEAR_MIPMAP_LINEAR: "LINEAR_MIPMAP_LINEAR",
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
  generateMipmap(...args) {
    glCalls.push(["generateMipmap", ...args]);
  },
  getExtension() {
    return null;
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

assert.equal(canvas.width, ATLAS_WIDTH);
assert.equal(canvas.height, ATLAS_HEIGHT);
// Every tile must bleed its own material into its gutter, otherwise the mip
// chain averages the gap with the neighbouring material.
const stoneCell = atlasCellOrigin(1);
const stoneBleed = draws.filter((args) => {
  const [, , , , , destX, destY] = args;
  return destX >= stoneCell.x && destX < stoneCell.x + ATLAS_TILE_STRIDE
    && destY >= stoneCell.y && destY < stoneCell.y + ATLAS_TILE_STRIDE;
});
assert.ok(
  stoneBleed.length >= 8,
  `tile 1 must bleed its four edges and four corners, saw ${stoneBleed.length} gutter draws`,
);
assert.equal(strokes.length, ATLAS_TEXTURES.length);
assert.equal(glCalls.filter(([name]) => name === "texImage2D").length, 1);
assert.equal(glCalls.filter(([name]) => name === "pixelStorei").length, 0);
assert.equal(glCalls.filter(([name]) => name === "generateMipmap").length, 0, "packed atlas must not mix neighboring mip levels");
assert.ok(glCalls.some(([name, target, parameter, value]) => (
  name === "texParameteri" && target === "TEXTURE_2D" && parameter === "TEXTURE_MIN_FILTER" && value === "LINEAR"
)));
assert.ok(glCalls.some(([name, target, parameter, value]) => (
  name === "texParameteri" && target === "TEXTURE_2D" && parameter === "TEXTURE_MAG_FILTER" && value === "LINEAR"
)));

// Mipmaps are gated on a proven-clean padded atlas. An uncertified atlas must
// keep the deterministic LINEAR path, and a certified one must build the chain.
function uploadWith(options) {
  glCalls.length = 0;
  return createTextureAtlas(gl, { 1: [0.34, 0.38, 0.42] }, options);
}
function minFilterValue() {
  const call = glCalls.find(([name, , parameter]) => (
    name === "texParameteri" && parameter === "TEXTURE_MIN_FILTER"
  ));
  return call?.[3] ?? null;
}
function mipmapCalls() {
  return glCalls.filter(([name]) => name === "generateMipmap").length;
}

try {
  globalThis.document = {
    createElement(kind) {
      assert.equal(kind, "canvas");
      return canvas;
    },
  };
  uploadWith({ mipmaps: true, mipmapSafe: false });
  assert.equal(mipmapCalls(), 0, "an uncertified atlas must not build a mip chain");
  assert.equal(minFilterValue(), "LINEAR", "an uncertified atlas must stay on the LINEAR fallback");

  uploadWith({ mipmaps: false, mipmapSafe: true });
  assert.equal(mipmapCalls(), 0, "mipmaps stay off when they are not requested");
  assert.equal(minFilterValue(), "LINEAR");

  uploadWith({ mipmaps: true, mipmapSafe: true });
  assert.equal(mipmapCalls(), 1, "a certified atlas must build exactly one mip chain");
  assert.equal(minFilterValue(), "LINEAR_MIPMAP_LINEAR", "a certified atlas must use mip filtering");
  assert.ok(glCalls.some(([name, target, parameter, value]) => (
    name === "texParameteri" && target === "TEXTURE_2D" && parameter === "TEXTURE_WRAP_S" && value === "CLAMP_TO_EDGE"
  )), "the atlas must stay clamped so filtering cannot wrap into another tile");
} finally {
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
}

const stoneOperations = tileOperations(1);
assert.ok(stoneOperations.some(({ x, y, width, height, globalAlpha }) => (
  x === 0 && y === 0 && width === ATLAS_TILE_SIZE && height === 1
    && globalAlpha === TEXTURE_PASS.edgeHighlightAlpha
)));
assert.ok(stoneOperations.some(({ x, y, width, height, globalAlpha }) => (
  x === 0 && y === ATLAS_TILE_SIZE - 1 && width === ATLAS_TILE_SIZE && height === 1
    && globalAlpha === TEXTURE_PASS.edgeShadowAlpha
)));
// Tiles are painted through ImageData now, so the base colour lands per texel
// rather than as a fillRect. That is the whole point of the change: the old
// path filled one flat rect and the surface had nothing to shade.
function tilePixels(block) {
  const { x: cellX, y: cellY } = atlasCellOrigin(block);
  const x0 = cellX + ATLAS_TILE_GUTTER;
  const y0 = cellY + ATLAS_TILE_GUTTER;
  const placement = imagePlacements.find((entry) => entry.x === x0 && entry.y === y0);
  return placement?.image?.data ?? null;
}
function parseHex(value) {
  const parsed = Number.parseInt(value.replace("#", ""), 16);
  return [(parsed >> 16) & 0xff, (parsed >> 8) & 0xff, parsed & 0xff];
}
for (const block of [3, 5, 1]) {
  const pixels = tilePixels(block);
  assert.ok(pixels instanceof Uint8ClampedArray, `block ${block} must paint through ImageData`);
  assert.equal(pixels.length, ATLAS_TILE_SIZE * ATLAS_TILE_SIZE * 4);
  // Opaque blocks paint every texel opaque: a hole in the alpha channel would
  // let the gutter bleed into the tile. Water and fire are deliberately
  // translucent, so they are checked separately below.
  if (block !== 7 && block !== 24) {
    for (let index = 3; index < pixels.length; index += 4) {
      assert.equal(pixels[index], 255, `block ${block} must paint every texel opaque`);
    }
  }
}
// The material surface must actually vary the texels, or the tiles are flat.
const stonePixels = tilePixels(1);
const stoneLuma = [];
for (let index = 0; index < stonePixels.length; index += 4) {
  stoneLuma.push(0.2126 * stonePixels[index] + 0.7152 * stonePixels[index + 1] + 0.0722 * stonePixels[index + 2]);
}
const stoneMin = Math.min(...stoneLuma);
const stoneMax = Math.max(...stoneLuma);
assert.ok(stoneMax - stoneMin > 4, `a stone tile must carry surface variation, got ${stoneMax - stoneMin}`);
// The variation stays in the material's own neighbourhood, so a tile never
// drifts to a colour the block does not own.
const stonePalette = Object.values(BLOCK_TEXTURES[1].palette).map(parseHex);
for (let index = 0; index < stonePixels.length; index += 4) {
  const channels = [stonePixels[index], stonePixels[index + 1], stonePixels[index + 2]];
  const nearest = Math.min(...stonePalette.map(([r, g, b]) => (
    Math.abs(channels[0] - r) + Math.abs(channels[1] - g) + Math.abs(channels[2] - b)
  )));
  assert.ok(nearest < 150, `a stone texel ${channels} drifted far from the palette`);
}
assert.equal(fills.some(({ globalCompositeOperation }) => globalCompositeOperation === "destination-in"), false);
// A translucent tile has to keep its translucency. putImageData ignores
// globalAlpha, so the painter bakes the opacity into the alpha channel and this
// is the assertion that stops water silently turning opaque.
const waterPixels = tilePixels(7);
for (let index = 3; index < waterPixels.length; index += 4) {
  assert.ok(
    waterPixels[index] > 150 && waterPixels[index] < 210,
    `a water texel must stay translucent, got alpha ${waterPixels[index]}`,
  );
}
// The old painter scattered 1x1 noise rects; the new one bakes the grain into
// the tile, so the equivalent guarantee is that adjacent texels differ. Without
// it a surface is perfectly smooth and the derivative bump has nothing to read.
for (const block of [3, 7]) {
  const pixels = tilePixels(block);
  let differing = 0;
  for (let y = 0; y < ATLAS_TILE_SIZE; y += 1) {
    for (let x = 1; x < ATLAS_TILE_SIZE; x += 1) {
      const left = (y * ATLAS_TILE_SIZE + x - 1) * 4;
      const right = (y * ATLAS_TILE_SIZE + x) * 4;
      if (pixels[left] !== pixels[right] || pixels[left + 1] !== pixels[right + 1]) differing += 1;
    }
  }
  assert.ok(
    differing > ATLAS_TILE_SIZE * 2,
    `block ${block} must carry per-texel grain, only ${differing} adjacent texel pairs differ`,
  );
}

function tileOperations(block) {
  const { x: cellX, y: cellY } = atlasCellOrigin(block);
  const x0 = cellX + ATLAS_TILE_GUTTER;
  const y0 = cellY + ATLAS_TILE_GUTTER;
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
for (let block = 0; block < ATLAS_TEXTURES.length; block += 1) {
  const operations = tileOperations(block);
  assert.ok(operations.length >= 3, `block ${block} should contain pixel details`);
  signatures.add(JSON.stringify(operations));
}
assert.equal(signatures.size, ATLAS_TEXTURES.length, "every atlas tile should contain a distinct texture pattern");

console.log("texture atlas ok");
