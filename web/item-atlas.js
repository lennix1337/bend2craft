import { TEXTURE_PASS } from "../assets/generated/textures/fallback-style.js";

export { TEXTURE_PASS };
export const ITEM_ATLAS_COLUMNS = 5;
export const ITEM_ATLAS_ROWS = 6;
export const ITEM_ATLAS_TILE_SIZE = 16;
export const ITEM_ATLAS_WIDTH = ITEM_ATLAS_COLUMNS * ITEM_ATLAS_TILE_SIZE;
export const ITEM_ATLAS_HEIGHT = ITEM_ATLAS_ROWS * ITEM_ATLAS_TILE_SIZE;
export const ITEM_TEXTURE_GRID_SIZE = TEXTURE_PASS.gridSize;
export const ITEM_TEXTURE_SIZE = 32;

const GLYPH_COLORS = new Set(["b", "a", "s", "h"]);

const TEXTURE_SPECS = [
  {
    name: "empty",
    label: "Empty",
    kind: "empty",
    colors: { base: "#8bbfdc", accent: "#8bbfdc", shadow: "#8bbfdc", highlight: "#8bbfdc" },
    pattern: [
      "........",
      "........",
      "........",
      "........",
      "........",
      "........",
      "........",
      "........",
    ],
  },
  {
    name: "stone",
    label: "Stone",
    kind: "block",
    colors: { base: "#7f8a91", accent: "#aeb7ba", shadow: "#4e585e", highlight: "#d1d6d6" },
    pattern: [
      "ssssssss",
      "sbbbbbbs",
      "bbhbbbbb",
      "bbbbabbs",
      "bbbbsbbb",
      "bbbbbhab",
      "sbbsbbbs",
      "ssssssss",
    ],
  },
  {
    name: "dirt",
    label: "Dirt",
    kind: "block",
    colors: { base: "#9b5c38", accent: "#c27b4c", shadow: "#613b29", highlight: "#d6965c" },
    pattern: [
      "ssssssss",
      "sbbbbbbs",
      "bbabbbbs",
      "bbsbbbbb",
      "bbbbbbab",
      "bbbsbbbb",
      "sbbbbbbs",
      "ssssssss",
    ],
  },
  {
    name: "grass",
    label: "Grass",
    kind: "block",
    colors: { base: "#58ad42", accent: "#9b5c38", shadow: "#276a35", highlight: "#8bd35d" },
    pattern: [
      "hhhhhhhh",
      "hhbhabhh",
      "aaaaaaaa",
      "aaaaaaaa",
      "aaabaaaa",
      "aaaaasaa",
      "aaaaaaaa",
      "ssssssss",
    ],
  },
  {
    name: "leaves",
    label: "Leaves",
    kind: "block",
    colors: { base: "#2e8c43", accent: "#58b95a", shadow: "#1c5b32", highlight: "#8bd35d" },
    pattern: [
      ".ssssss.",
      "sbabbbas",
      "sbbhbbbs",
      "bbabbbbs",
      "bbbbsbbb",
      "sbbababs",
      "sbbaabbs",
      ".ssssss.",
    ],
  },
  {
    name: "wood",
    label: "Wood",
    kind: "block",
    colors: { base: "#a66a3f", accent: "#c99058", shadow: "#633b29", highlight: "#e0a96f" },
    pattern: [
      "ssssssss",
      "sbbbbbbs",
      "sbbsbbbs",
      "sbbbbbbs",
      "sbbsbbbs",
      "sbbbbbbs",
      "sbbhbbbs",
      "ssssssss",
    ],
  },
  {
    name: "sand",
    label: "Sand",
    kind: "block",
    colors: { base: "#d9bd72", accent: "#f0d994", shadow: "#a4864e", highlight: "#fff0b4" },
    pattern: [
      "ssssssss",
      "sbbbbbbs",
      "bbhbbbbb",
      "bbbbabbs",
      "bbbbsbbb",
      "bbbbbhab",
      "sbbbbbbs",
      "ssssssss",
    ],
  },
  {
    name: "water",
    label: "Water",
    kind: "liquid",
    colors: { base: "#4d9bd6", accent: "#86c8f0", shadow: "#2869a5", highlight: "#c3ebff" },
    pattern: [
      "ssssssss",
      "bbbbbbbb",
      "bbahbbba",
      "bbbbbbbb",
      "bbhbbbbb",
      "babbbbab",
      "bbbbbbbb",
      "ssssssss",
    ],
  },
  {
    name: "planks",
    label: "Wood Planks",
    kind: "material",
    colors: { base: "#c28a4d", accent: "#e0b16c", shadow: "#704628", highlight: "#f2ce8d" },
    pattern: [
      "ssssssss",
      "bbbbbbbb",
      "ssssssss",
      "bbbbbbbb",
      "bbbbhbbb",
      "ssssssss",
      "bbbbbbbb",
      "ssssssss",
    ],
  },
  {
    name: "sticks",
    label: "Sticks",
    kind: "material",
    colors: { base: "#b77b48", accent: "#e1b278", shadow: "#6d452b", highlight: "#f1d09b" },
    pattern: [
      "..ab....",
      "...ab...",
      "....ab..",
      ".....ab.",
      ".ab.....",
      "..ab....",
      "...ab...",
      "........",
    ],
  },
  {
    name: "crafting_table",
    label: "Crafting Table",
    kind: "placeable",
    colors: { base: "#9d6a3e", accent: "#d09a5e", shadow: "#5b3927", highlight: "#f0c37e" },
    pattern: [
      "ssssssss",
      "saaaaaas",
      "sahhaaas",
      "saabbbas",
      "sbbbbbas",
      "sbbasbbs",
      "saaaaaas",
      "ssssssss",
    ],
  },
  {
    name: "wooden_pickaxe",
    label: "Wooden Pickaxe",
    kind: "tool",
    colors: { base: "#b77b48", accent: "#d9a369", shadow: "#63402a", highlight: "#f0c68a" },
    pattern: [
      "..ssss..",
      ".sssss..",
      "ssbbba..",
      ".sbbbb..",
      "..b.....",
      "...b....",
      "...b....",
      "...h....",
    ],
  },
  {
    name: "wool",
    label: "Wool",
    kind: "material",
    colors: { base: "#ece8d8", accent: "#fffdf2", shadow: "#aaa89e", highlight: "#ffffff" },
    pattern: [
      "..ssss..",
      ".sbbbbs.",
      "sbhbbhbs",
      "sbbbbbbs",
      "sbbaabbs",
      ".sbbbbs.",
      "..ssss..",
      "........",
    ],
  },
  {
    name: "rotten_flesh",
    label: "Rotten Flesh",
    kind: "food",
    colors: { base: "#8c4d45", accent: "#b86a56", shadow: "#4e2f35", highlight: "#d88a65" },
    pattern: [
      "........",
      "..ss....",
      ".sbbas..",
      "sbbbaabs",
      "sbbaabss",
      ".sbbbbs.",
      "..ss....",
      "........",
    ],
  },
  {
    name: "coal",
    label: "Coal",
    kind: "material",
    colors: { base: "#24262b", accent: "#454b54", shadow: "#101216", highlight: "#737b84" },
    pattern: [
      "........",
      "..ssss..",
      ".sbbbs..",
      "sbbabbs.",
      "sbbbbbs.",
      ".sbbbs..",
      "..ssss..",
      "........",
    ],
  },
  {
    name: "raw_iron",
    label: "Raw Iron",
    kind: "material",
    colors: { base: "#c28a6d", accent: "#e0ae8c", shadow: "#744f46", highlight: "#f2ceb0" },
    pattern: [
      "........",
      "...ss...",
      "..sbbss.",
      ".sbbabbs",
      "sbbbbbbs",
      ".sbbbbs.",
      "..ss....",
      "........",
    ],
  },
  {
    name: "diamond",
    label: "Diamond",
    kind: "material",
    colors: { base: "#68e4df", accent: "#b9ffff", shadow: "#249da8", highlight: "#efffff" },
    pattern: [
      "...hh...",
      "..hbbh..",
      ".hbaabh.",
      "hbbaabbh",
      "bbaaaabb",
      ".hbaabh.",
      "..hbbh..",
      "...ss...",
    ],
  },
  {
    name: "stone_pickaxe",
    label: "Stone Pickaxe",
    kind: "tool",
    colors: { base: "#92999f", accent: "#c5cbcd", shadow: "#4e585e", highlight: "#edf0ef" },
    pattern: [
      "..ssss..",
      ".sssss..",
      "ssbbba..",
      ".sbbbb..",
      "..b.....",
      "...b....",
      "...b....",
      "...h....",
    ],
  },
  {
    name: "iron_pickaxe",
    label: "Iron Pickaxe",
    kind: "tool",
    colors: { base: "#d5d9dc", accent: "#f2f4f4", shadow: "#7a838a", highlight: "#ffffff" },
    pattern: [
      "..ssss..",
      ".sssss..",
      "ssbbba..",
      ".sbbbb..",
      "..b.....",
      "...b....",
      "...b....",
      "...h....",
    ],
  },
  {
    name: "diamond_pickaxe",
    label: "Diamond Pickaxe",
    kind: "tool",
    colors: { base: "#5ee8e0", accent: "#b9ffff", shadow: "#249da8", highlight: "#efffff" },
    pattern: [
      "..ssss..",
      ".sssss..",
      "ssbbba..",
      ".sbbbb..",
      "..b.....",
      "...b....",
      "...b....",
      "...h....",
    ],
  },
  {
    name: "iron_ingot",
    label: "Iron Ingot",
    kind: "material",
    colors: { base: "#d9dde2", accent: "#f4f6f6", shadow: "#7c858d", highlight: "#ffffff" },
    pattern: [
      "........",
      "..ssss..",
      ".sbbbbs.",
      "sbhbbhbs",
      "sbbbbbbs",
      ".saaaabs",
      ".ssssss.",
      "........",
    ],
  },
  {
    name: "furnace",
    label: "Furnace",
    kind: "placeable",
    colors: { base: "#5b5f66", accent: "#858b91", shadow: "#24272c", highlight: "#b9bec0" },
    pattern: [
      "ssssssss",
      "sbbbbbbs",
      "sbssssbs",
      "sbaaaabs",
      "sbaaaabs",
      "sbbbbbbs",
      "sbbhhbbs",
      "ssssssss",
    ],
  },
  {
    name: "torch",
    label: "Torch",
    kind: "placeable",
    colors: { base: "#8c5a38", accent: "#f5b44c", shadow: "#4d3024", highlight: "#fff0a0" },
    pattern: [
      "...hh...",
      "..haah..",
      "..aaaa..",
      "...bb...",
      "...bb...",
      "...bb...",
      "..sbb...",
      "..ssss..",
    ],
  },
  {
    name: "bed",
    label: "Bed",
    kind: "placeable",
    colors: { base: "#c94f62", accent: "#f27b86", shadow: "#673844", highlight: "#ffb0a8" },
    pattern: [
      "ssssssss",
      "saaaaaas",
      "sabbbbas",
      "sabbbbas",
      "sbbaabbs",
      "bbbbbbbb",
      "ssbssbbs",
      "ssbssbbs",
    ],
  },
  {
    name: "door",
    label: "Door",
    kind: "placeable",
    colors: { base: "#8c5a38", accent: "#b47a4d", shadow: "#4d3024", highlight: "#d9a16b" },
    pattern: [
      "ssssssss",
      "sbbbbbbs",
      "sbabbbbs",
      "sbbbbhbs",
      "sbbbbbbs",
      "sbbbbbbs",
      "sbbbbbbs",
      "ssssssss",
    ],
  },
  {
    name: "wheat_seeds",
    label: "Wheat Seeds",
    kind: "food",
    colors: { base: "#b8993c", accent: "#e3c85a", shadow: "#67552a", highlight: "#fff0a0" },
    pattern: [
      "........",
      "..a.....",
      ".....a..",
      "...b....",
      "......a.",
      ".a......",
      "....b...",
      "........",
    ],
  },
  {
    name: "wheat",
    label: "Wheat",
    kind: "food",
    colors: { base: "#c79d35", accent: "#f4d45a", shadow: "#715326", highlight: "#fff09a" },
    pattern: [
      "...a....",
      "..aaa...",
      "...a....",
      "..a.....",
      "...b....",
      "...b....",
      "..bb....",
      "...b....",
    ],
  },
  {
    name: "wooden_hoe",
    label: "Wooden Hoe",
    kind: "tool",
    colors: { base: "#b77b48", accent: "#d9a16b", shadow: "#5d3927", highlight: "#f0c18b" },
    pattern: [
      "...aa...",
      "..aaaa..",
      "....b...",
      "....b...",
      "...bb...",
      "....b...",
      "....b...",
      "....b...",
    ],
  },
];

function freezePattern(pattern) {
  if (!Array.isArray(pattern) || pattern.length !== ITEM_TEXTURE_GRID_SIZE) {
    throw new TypeError("Item texture patterns must have eight rows.");
  }
  for (const row of pattern) {
    if (typeof row !== "string" || row.length !== ITEM_TEXTURE_GRID_SIZE) {
      throw new TypeError("Item texture pattern rows must have eight cells.");
    }
    for (const glyph of row) {
      if (glyph !== "." && !GLYPH_COLORS.has(glyph)) {
        throw new TypeError(`Unknown item texture glyph: ${glyph}`);
      }
    }
  }
  return Object.freeze([...pattern]);
}

function freezeTexture(spec, id) {
  const colors = Object.freeze({ ...spec.colors });
  const pattern = freezePattern(spec.pattern);
  const tile = Object.freeze({
    column: id % ITEM_ATLAS_COLUMNS,
    row: Math.floor(id / ITEM_ATLAS_COLUMNS),
  });
  return Object.freeze({
    id,
    name: spec.name,
    label: spec.label,
    kind: spec.kind,
    color: colors.base,
    baseColor: colors.base,
    accentColor: colors.accent,
    shadowColor: colors.shadow,
    highlightColor: colors.highlight,
    colors,
    pattern,
    pass: TEXTURE_PASS.id,
    tile,
  });
}

export const ITEM_TEXTURES = Object.freeze(TEXTURE_SPECS.map(freezeTexture));
export const ITEM_TEXTURES_BY_ID = Object.freeze(
  Object.fromEntries(ITEM_TEXTURES.map((texture) => [texture.id, texture])),
);
export const ITEM_TEXTURES_BY_NAME = Object.freeze(
  Object.fromEntries(ITEM_TEXTURES.map((texture) => [texture.name, texture])),
);

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function numericId(value) {
  if (typeof value === "bigint") {
    if (value < 0n || value >= BigInt(ITEM_TEXTURES.length)) return null;
    return Number(value);
  }
  if (!Number.isInteger(value) || value < 0 || value >= ITEM_TEXTURES.length) return null;
  return value;
}

/** Resolve an item ID from a canonical name, numeric ID, or item-like object. */
export function itemTextureId(value) {
  const numeric = numericId(value);
  if (numeric !== null) return numeric;
  if (typeof value === "string") return hasOwn(ITEM_TEXTURES_BY_NAME, value) ? ITEM_TEXTURES_BY_NAME[value].id : null;
  if (value === null || typeof value !== "object") return null;
  if (hasOwn(value, "name")) return itemTextureId(value.name);
  if (hasOwn(value, "item")) return itemTextureId(value.item);
  if (hasOwn(value, "id")) return itemTextureId(value.id);
  return null;
}

/** Return the immutable descriptor for an item, or null for an unknown item. */
export function itemTexture(value) {
  const id = itemTextureId(value);
  return id === null ? null : ITEM_TEXTURES[id];
}

/** Return the atlas tile for an item, or null for an unknown item. */
export function itemTextureTile(value) {
  return itemTexture(value)?.tile ?? null;
}

/**
 * Return WebGL-ready UVs in bottom-left quad order:
 * [u0, vTop, u1, vTop, u1, vBottom, u0, vBottom].
 * The optional inset is measured in source-tile pixels.
 */
export function itemTextureUV(value, options = {}) {
  const tile = itemTextureTile(value);
  if (tile === null) return null;
  const tileSize = Number(options.tileSize ?? ITEM_ATLAS_TILE_SIZE);
  const insetPixels = Number(options.inset ?? 0.5);
  if (!Number.isFinite(tileSize) || tileSize <= 0) throw new RangeError("tileSize must be positive.");
  if (!Number.isFinite(insetPixels) || insetPixels < 0 || insetPixels * 2 >= tileSize) {
    throw new RangeError("inset must be non-negative and smaller than half the tile size.");
  }
  const inset = insetPixels / tileSize;
  const u0 = (tile.column + inset) / ITEM_ATLAS_COLUMNS;
  const u1 = (tile.column + 1 - inset) / ITEM_ATLAS_COLUMNS;
  const vTop = 1 - (tile.row + inset) / ITEM_ATLAS_ROWS;
  const vBottom = 1 - (tile.row + 1 - inset) / ITEM_ATLAS_ROWS;
  return Object.freeze([u0, vTop, u1, vTop, u1, vBottom, u0, vBottom]);
}

function validContext(context) {
  if (context === null || typeof context !== "object" || typeof context.fillRect !== "function") {
    throw new TypeError("A 2D canvas context with fillRect is required.");
  }
  return context;
}

function textureSize(value, label = "size") {
  const size = Number(value);
  if (!Number.isInteger(size) || size <= 0) throw new RangeError(`${label} must be a positive integer.`);
  return size;
}

function drawPattern(context, texture, size, offsetX, offsetY, options) {
  const pixelSize = size / ITEM_TEXTURE_GRID_SIZE;
  const palette = {
    b: texture.baseColor,
    a: texture.accentColor,
    s: texture.shadowColor,
    h: texture.highlightColor,
  };
  for (let row = 0; row < ITEM_TEXTURE_GRID_SIZE; row += 1) {
    for (let column = 0; column < ITEM_TEXTURE_GRID_SIZE; column += 1) {
      const glyph = texture.pattern[row][column];
      if (glyph === ".") continue;
      context.fillStyle = palette[glyph];
      context.fillRect(
        offsetX + column * pixelSize,
        offsetY + row * pixelSize,
        pixelSize,
        pixelSize,
      );
    }
  }
  if (options.outline !== undefined) {
    if (typeof context.strokeRect !== "function") throw new TypeError("The context must support strokeRect for outlines.");
    context.strokeStyle = String(options.outline);
    context.strokeRect(offsetX, offsetY, size, size);
  }
}

function drawItemEdge(context, texture, size, offsetX, offsetY) {
  if (texture.kind === "empty") return;
  const previousAlpha = context.globalAlpha;
  context.globalAlpha = TEXTURE_PASS.edgeHighlightAlpha;
  context.fillStyle = texture.highlightColor;
  context.fillRect(offsetX, offsetY, size, 1);
  context.fillRect(offsetX, offsetY + 1, 1, Math.max(0, size - 2));
  context.globalAlpha = TEXTURE_PASS.edgeShadowAlpha;
  context.fillStyle = texture.shadowColor;
  context.fillRect(offsetX, offsetY + size - 1, size, 1);
  context.fillRect(offsetX + size - 1, offsetY + 1, 1, Math.max(0, size - 2));
  context.globalAlpha = previousAlpha;
}

function drawWithState(context, texture, size, offsetX, offsetY, options) {
  const previousSmoothing = context.imageSmoothingEnabled;
  const previousFillStyle = context.fillStyle;
  const previousStrokeStyle = context.strokeStyle;
  const previousGlobalAlpha = context.globalAlpha;
  const clear = options.clear ?? true;
  try {
    context.imageSmoothingEnabled = false;
    if (clear) {
      if (typeof context.clearRect !== "function") throw new TypeError("The context must support clearRect when clear is enabled.");
      context.clearRect(offsetX, offsetY, size, size);
    }
    if (options.background !== undefined) {
      context.fillStyle = String(options.background);
      context.fillRect(offsetX, offsetY, size, size);
    }
    drawPattern(context, texture, size, offsetX, offsetY, options);
    drawItemEdge(context, texture, size, offsetX, offsetY);
  } finally {
    context.imageSmoothingEnabled = previousSmoothing;
    context.fillStyle = previousFillStyle;
    context.strokeStyle = previousStrokeStyle;
    context.globalAlpha = previousGlobalAlpha;
  }
}

/** Draw one deterministic pixel-art item into an existing 2D context. */
export function drawItemTexture(context, value, options = {}) {
  const texture = itemTexture(value);
  if (texture === null) throw new RangeError("Unknown item texture.");
  validContext(context);
  const size = textureSize(options.size ?? ITEM_TEXTURE_SIZE);
  const offsetX = Number(options.x ?? 0);
  const offsetY = Number(options.y ?? 0);
  if (!Number.isFinite(offsetX) || !Number.isFinite(offsetY)) throw new RangeError("x and y must be finite.");
  drawWithState(context, texture, size, offsetX, offsetY, options);
  return context;
}

/** Create a canvas containing one deterministic item texture. */
export function createItemTextureCanvas(value, options = {}) {
  const texture = itemTexture(value);
  if (texture === null) throw new RangeError("Unknown item texture.");
  const size = textureSize(options.size ?? ITEM_TEXTURE_SIZE);
  const documentRef = options.document ?? globalThis.document;
  if (documentRef === null || typeof documentRef?.createElement !== "function") {
    throw new Error("A document with canvas support is required to create an item texture canvas.");
  }
  const canvas = documentRef.createElement("canvas");
  if (canvas === null || typeof canvas.getContext !== "function") {
    throw new Error("The document did not create a canvas element.");
  }
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("2D canvas is required to create an item texture.");
  drawItemTexture(context, texture, { ...options, size, x: 0, y: 0, clear: true });
  return canvas;
}

/** Draw the complete item atlas into an existing 2D context. */
export function drawItemTextureAtlas(context, options = {}) {
  validContext(context);
  const tileSize = textureSize(options.tileSize ?? ITEM_ATLAS_TILE_SIZE, "tileSize");
  const width = ITEM_ATLAS_COLUMNS * tileSize;
  const height = ITEM_ATLAS_ROWS * tileSize;
  if (options.clear ?? true) {
    if (typeof context.clearRect !== "function") throw new TypeError("The context must support clearRect when clear is enabled.");
    context.clearRect(0, 0, width, height);
  }
  if (options.background !== undefined) {
    context.fillStyle = String(options.background);
    context.fillRect(0, 0, width, height);
  }
  for (const texture of ITEM_TEXTURES) {
    drawWithState(
      context,
      texture,
      tileSize,
      texture.tile.column * tileSize,
      texture.tile.row * tileSize,
      { ...options, clear: false, background: undefined },
    );
  }
  return context;
}

/** Create a canvas containing all 25 item textures in a 5 by 5 atlas. */
export function createItemTextureAtlasCanvas(options = {}) {
  const tileSize = textureSize(options.tileSize ?? ITEM_ATLAS_TILE_SIZE, "tileSize");
  const documentRef = options.document ?? globalThis.document;
  if (documentRef === null || typeof documentRef?.createElement !== "function") {
    throw new Error("A document with canvas support is required to create an item atlas canvas.");
  }
  const canvas = documentRef.createElement("canvas");
  if (canvas === null || typeof canvas.getContext !== "function") {
    throw new Error("The document did not create a canvas element.");
  }
  canvas.width = ITEM_ATLAS_COLUMNS * tileSize;
  canvas.height = ITEM_ATLAS_ROWS * tileSize;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("2D canvas is required to create an item atlas.");
  drawItemTextureAtlas(context, { ...options, tileSize, clear: true });
  return canvas;
}
