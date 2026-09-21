import assert from "node:assert/strict";
import {
  ITEM_ATLAS_COLUMNS,
  ITEM_ATLAS_ROWS,
  ITEM_ATLAS_HEIGHT,
  ITEM_ATLAS_TILE_SIZE,
  ITEM_ATLAS_WIDTH,
  ITEM_TEXTURE_GRID_SIZE,
  ITEM_TEXTURES,
  TEXTURE_PASS,
  createItemTextureAtlasCanvas,
  createItemTextureCanvas,
  drawItemTexture,
  drawItemTextureAtlas,
  itemTexture,
  itemTextureId,
  itemTextureTile,
  itemTextureUV,
} from "../web/item-atlas.js";

const itemNames = [
  "empty",
  "stone",
  "dirt",
  "grass",
  "leaves",
  "wood",
  "sand",
  "water",
  "planks",
  "sticks",
  "crafting_table",
  "wooden_pickaxe",
  "wool",
  "rotten_flesh",
  "coal",
  "raw_iron",
  "diamond",
  "stone_pickaxe",
  "iron_pickaxe",
  "diamond_pickaxe",
  "iron_ingot",
  "furnace",
  "torch",
  "bed",
  "door",
  "wheat_seeds",
  "wheat",
  "wooden_hoe",
  "wooden_sword",
  "stone_sword",
  "iron_sword",
  "diamond_sword",
  "bow",
  "arrow",
  "shield",
  "glass",
  "bread",
  "apple",
  "chest",
];

assert.equal(ITEM_ATLAS_COLUMNS, 5);
assert.equal(ITEM_ATLAS_ROWS, 8);
assert.equal(ITEM_TEXTURES.length, itemNames.length);
assert.equal(TEXTURE_PASS.id, "fallback-pixel-pass-v1");
assert.equal(TEXTURE_PASS.referenceSheet, null);
assert.equal(TEXTURE_PASS.itemGridSize, 16);
assert.equal(ITEM_TEXTURE_GRID_SIZE, 16);
assert.deepEqual(ITEM_TEXTURES.map((texture) => texture.name), itemNames);

const authoredItemTopRows = {
  wooden_pickaxe: "..ssssss........",
  stone_pickaxe: "..ssssss........",
  iron_pickaxe: "..ssssss........",
  diamond_pickaxe: "..ssssss........",
  torch: ".......h........",
  bed: "ssaaaaaaaaaaaass",
  door: "ssssssssssssssss",
  wooden_hoe: "...aa...........",
  wooden_sword: "............aaaa",
  stone_sword: "............aaaa",
  iron_sword: "............aaaa",
  diamond_sword: "............aaaa",
  bow: "..aaaa..........",
  arrow: "............aaaa",
  shield: "..ssssssssssss..",
};
for (const [name, row] of Object.entries(authoredItemTopRows)) {
  assert.equal(itemTexture(name).pattern[0], row, `${name} should use an authored 16px silhouette`);
}

for (const [id, name] of itemNames.entries()) {
  const texture = itemTexture(id);
  assert.equal(texture.id, id);
  assert.equal(texture.name, name);
  assert.equal(itemTexture(name), texture);
  assert.equal(itemTextureId(name), id);
  assert.equal(itemTextureId(texture), id);
  assert.deepEqual(itemTextureTile(id), {
    column: id % ITEM_ATLAS_COLUMNS,
    row: Math.floor(id / ITEM_ATLAS_COLUMNS),
  });

  const uv = itemTextureUV(id);
  assert.equal(uv.length, 8);
  assert.ok(Object.isFrozen(uv));
  for (const value of uv) assert.ok(value >= 0 && value <= 1);
  assert.ok(Object.isFrozen(texture));
  assert.ok(Object.isFrozen(texture.colors));
  assert.ok(Object.isFrozen(texture.pattern));
  assert.ok(Object.isFrozen(texture.tile));
  assert.equal(texture.pattern.length, 16);
  for (const row of texture.pattern) assert.equal(row.length, 16);
}

const bedUV = itemTextureUV("bed", { tileSize: ITEM_ATLAS_TILE_SIZE, inset: 0 });
assert.equal(bedUV[0], 0.6);
assert.ok(Math.abs(bedUV[1] - (1 / 2)) < Number.EPSILON);
assert.equal(bedUV[2], 0.8);
assert.ok(Math.abs(bedUV[3] - (1 / 2)) < Number.EPSILON);
assert.equal(bedUV[4], 0.8);
assert.ok(Math.abs(bedUV[5] - (3 / 8)) < Number.EPSILON);
assert.equal(bedUV[6], 0.6);
assert.ok(Math.abs(bedUV[7] - (3 / 8)) < Number.EPSILON);
assert.throws(() => itemTextureUV("bed", { inset: ITEM_ATLAS_TILE_SIZE / 2 }), RangeError);

function createContext() {
  const calls = [];
  return {
    calls,
    fillStyle: "initial",
    strokeStyle: "initial",
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    clearRect(...args) {
      calls.push(["clearRect", ...args]);
    },
    fillRect(...args) {
      calls.push(["fillRect", this.fillStyle, this.globalAlpha, ...args]);
    },
    strokeRect(...args) {
      calls.push(["strokeRect", this.strokeStyle, ...args]);
    },
  };
}

function createDocument(context) {
  return {
    createElement(tagName) {
      assert.equal(tagName, "canvas");
      return {
        width: 0,
        height: 0,
        getContext(contextType) {
          assert.equal(contextType, "2d");
          return context;
        },
      };
    },
  };
}

const firstContext = createContext();
const secondContext = createContext();
drawItemTexture(firstContext, "bed", { size: 16, outline: "#000000" });
drawItemTexture(secondContext, "bed", { size: 16, outline: "#000000" });
assert.deepEqual(firstContext.calls, secondContext.calls);
assert.equal(firstContext.imageSmoothingEnabled, true);
assert.equal(firstContext.fillStyle, "initial");
assert.ok(firstContext.calls.some(([kind]) => kind === "fillRect"));
assert.ok(firstContext.calls.some(([kind]) => kind === "strokeRect"));
assert.ok(firstContext.calls.some(([kind, fillStyle, globalAlpha, x, y, width, height]) => (
  kind === "fillRect"
    && fillStyle === itemTexture("bed").highlightColor
    && globalAlpha === TEXTURE_PASS.edgeHighlightAlpha
    && x === 0 && y === 0 && width === 16 && height === 1
)));
const backgroundContext = createContext();
drawItemTexture(backgroundContext, "stone", { size: 8, background: "#ffffff", outline: "#000000" });
assert.equal(backgroundContext.fillStyle, "initial");
assert.equal(backgroundContext.strokeStyle, "initial");

for (const id of itemNames.keys()) {
  const context = createContext();
  drawItemTexture(context, id, { size: 8 });
  assert.equal(context.calls[0][0], "clearRect");
  if (id === 0) assert.equal(context.calls.length, 1);
  else assert.ok(context.calls.length > 1);
}

const itemCanvasContext = createContext();
const itemCanvas = createItemTextureCanvas("door", {
  document: createDocument(itemCanvasContext),
  size: 24,
});
assert.equal(itemCanvas.width, 24);
assert.equal(itemCanvas.height, 24);
assert.ok(itemCanvasContext.calls.length > 1);

const atlasContext = createContext();
drawItemTextureAtlas(atlasContext, { tileSize: 8 });
assert.deepEqual(atlasContext.calls[0], ["clearRect", 0, 0, 40, 64]);
assert.ok(atlasContext.calls.length > ITEM_TEXTURES.length);

const atlasCanvasContext = createContext();
const atlasCanvas = createItemTextureAtlasCanvas({
  document: createDocument(atlasCanvasContext),
  tileSize: ITEM_ATLAS_TILE_SIZE,
});
assert.equal(atlasCanvas.width, ITEM_ATLAS_WIDTH);
assert.equal(atlasCanvas.height, ITEM_ATLAS_HEIGHT);
assert.deepEqual(atlasCanvasContext.calls[0], ["clearRect", 0, 0, ITEM_ATLAS_WIDTH, ITEM_ATLAS_HEIGHT]);
assert.throws(() => createItemTextureCanvas("stone", { document: {}, size: 16 }), /document/);
assert.throws(() => drawItemTexture({}, "stone"), /context/);

assert.equal(itemTexture("unknown"), null);
assert.equal(itemTextureId("unknown"), null);
assert.equal(itemTextureTile("unknown"), null);
assert.equal(itemTextureUV("unknown"), null);
console.log("item atlas registry ok");
