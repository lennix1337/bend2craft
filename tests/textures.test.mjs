import assert from "node:assert/strict";
import {
  ATLAS_COLS,
  ATLAS_ROWS,
  TILE,
  TILE_NAMES,
  paintModel,
  uvForTile,
} from "../web/textures.js";

assert.equal(TILE, 16);
assert.deepEqual(TILE_NAMES, [
  "pigBody", "pigFace", "pigHead", "pigSnout",
  "pigLeg", "zombieBody", "zombieFace", "zombieHead",
  "zombieLeg", "zombieArm", "white", "pigTop",
]);
assert.equal(ATLAS_COLS * ATLAS_ROWS, 12);

const model = paintModel();
assert.equal(Object.keys(model.tiles).length, 12);
for (const name of TILE_NAMES) {
  const tile = model.tiles[name];
  assert.equal(tile.length, 16, `${name} has 16 rows`);
  for (const row of tile) {
    assert.equal(row.length, 16, `${name} rows have 16 pixels`);
    for (const pixel of row) {
      assert.ok(pixel in model.palette, `${name} uses palette color ${pixel}`);
    }
  }
}

// The pig face carries dark pupils and a snout-toned muzzle band.
const face = model.tiles.pigFace;
const flat = face.flat();
assert.ok(flat.includes("pupil"), "pig face has pupils");
assert.ok(flat.includes("eyeWhite"), "pig face has eye whites");
assert.ok(flat.filter((p) => p === "snout").length >= 20, "pig face has a muzzle");

// Zombie faces read as undead: dark eyes on green skin.
const zface = model.tiles.zombieFace.flat();
assert.ok(zface.includes("pupil"));
assert.ok(zface.filter((p) => p === "zSkin").length > 150);

// The flash tile is pure white for hurt feedback.
assert.ok(model.tiles.white.flat().every((p) => p === "flash"));

// UV rects tile the atlas without overlap and with half-texel insets.
const atlasW = ATLAS_COLS * TILE;
const atlasH = ATLAS_ROWS * TILE;
const seen = new Set();
for (let i = 0; i < TILE_NAMES.length; i += 1) {
  const [u0, v0, u1, v1] = uvForTile(i);
  assert.ok(u0 < u1 && v0 < v1, `tile ${i} is well formed`);
  assert.ok(u0 >= 0 && u1 <= 1 && v0 >= 0 && v1 <= 1, `tile ${i} inside atlas`);
  // Half-texel inset keeps NEAREST sampling inside the tile.
  assert.ok(Math.abs(u0 * atlasW - (Math.floor(u0 * atlasW) + 0.5)) < 1e-9);
  const key = `${u0},${v0}`;
  assert.ok(!seen.has(key), `tile ${i} does not overlap`);
  seen.add(key);
}
// First tile starts at the top-left of the canvas.
const [u0, v0] = uvForTile(0);
assert.ok(Math.abs(u0 - 0.5 / atlasW) < 1e-9);
assert.ok(Math.abs(v0 - 0.5 / atlasH) < 1e-9);

console.log("textures ok");
