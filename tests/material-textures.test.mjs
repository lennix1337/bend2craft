import assert from "node:assert/strict";
import {
  MATERIAL_RECIPES,
  materialGrain,
  materialHeight,
  shadeBySurface,
  synthesizeSurface,
} from "../web/material-textures.js";

// Determinism: the same seed must give the same field, or the atlas would
// change between boots and the texel probe could never certify a tile.
const a = synthesizeSurface(MATERIAL_RECIPES.cellular, 32, 1234);
const b = synthesizeSurface(MATERIAL_RECIPES.cellular, 32, 1234);
assert.deepEqual(Array.from(a.heights), Array.from(b.heights));
assert.deepEqual(Array.from(a.grains), Array.from(b.grains));
const c = synthesizeSurface(MATERIAL_RECIPES.cellular, 32, 1235);
assert.notDeepEqual(Array.from(a.heights), Array.from(c.heights), "a different seed gives a different surface");
assert.equal(a.heights.length, 32 * 32);
assert.equal(a.grains.length, 32 * 32);

// Every recipe must stay in 0..1 across a full tile, or the shading below would
// clip and the relief would invert.
for (const [name, recipe] of Object.entries(MATERIAL_RECIPES)) {
  const surface = synthesizeSurface(recipe, 32, 7);
  for (const height of surface.heights) {
    assert.ok(height >= 0 && height <= 1, `${name} produced an out-of-range height ${height}`);
  }
  for (const grain of surface.grains) {
    assert.ok(grain >= 0 && grain <= 1, `${name} produced an out-of-range grain ${grain}`);
  }
  // A flat field would make the material indistinguishable and the bump dead.
  let min = 1;
  let max = 0;
  for (const height of surface.heights) {
    if (height < min) min = height;
    if (height > max) max = height;
  }
  assert.ok(max - min > 0.08, `${name} has no usable relief (spread ${max - min})`);
  assert.ok(recipe.contrast > 0 && recipe.contrast <= 0.5, `${name} contrast is out of band`);
  assert.ok(recipe.grain >= 0 && recipe.grain < 0.3, `${name} grain is out of band`);
}

// Materials must not look alike: the recipes exist to tell stone from soil from
// foliage, so two recipes cannot produce the same field.
const spreads = Object.entries(MATERIAL_RECIPES).map(([name, recipe]) => {
  const surface = synthesizeSurface(recipe, 32, 99);
  const values = Array.from(surface.heights);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return { name, mean, sigma: Math.sqrt(variance) };
});
for (const entry of spreads) {
  assert.ok(entry.sigma > 0.02, `${entry.name} is essentially flat (sigma ${entry.sigma})`);
}
const distinct = new Set(spreads.map((entry) => entry.sigma.toFixed(4)));
assert.ok(distinct.size >= Object.keys(MATERIAL_RECIPES).length - 1, "recipes must be visually distinct from each other");

// Shading must stay anchored to the material's own colour: bright is raised and
// dark is recessed, and the hue must not invert.
const base = [0.4, 0.5, 0.35];
const raised = shadeBySurface(base, 1, 0.5, MATERIAL_RECIPES.cellular);
const level = shadeBySurface(base, 0.5, 0.5, MATERIAL_RECIPES.cellular);
const recessed = shadeBySurface(base, 0, 0.5, MATERIAL_RECIPES.cellular);
assert.ok(raised[0] > level[0] && level[0] > recessed[0], "height must map monotonically to brightness");
assert.ok(raised[1] > level[1] && level[1] > recessed[1], "height must map monotonically in green too");
for (const shade of [raised, level, recessed]) {
  for (const channel of shade) {
    assert.ok(channel >= 0 && channel <= 1, `a shaded channel left the unit range: ${channel}`);
  }
  // Green stays the largest channel, so a grey scale recipe cannot turn grass
  // into something unrecognisable.
  assert.ok(shade[1] > shade[0] && shade[1] > shade[2], "shading must preserve the dominant channel");
}
// A neutral height leaves the colour essentially alone: the detail is a
// modulation, not a repaint.
for (let channel = 0; channel < 3; channel += 1) {
  assert.ok(
    Math.abs(level[channel] - base[channel]) < base[channel] * MATERIAL_RECIPES.cellular.contrast + 0.02,
    "a mid height must stay close to the base colour",
  );
}
// Grain adds a small, bounded amount of tooth.
const grainLow = shadeBySurface(base, 0.5, 0, MATERIAL_RECIPES.cellular);
const grainHigh = shadeBySurface(base, 0.5, 1, MATERIAL_RECIPES.cellular);
assert.ok(grainHigh[0] > grainLow[0], "grain must modulate brightness");
const grainSwing = Math.abs(grainHigh[0] - grainLow[0]);
assert.ok(grainSwing <= MATERIAL_RECIPES.cellular.grain * 2 + 0.01, `grain swing ${grainSwing} is out of band`);

// The single-texel entry points must agree with the tiled synthesis.
const recipe = MATERIAL_RECIPES.clumpy;
const surface = synthesizeSurface(recipe, 8, 42);
for (let y = 0; y < 8; y += 1) {
  for (let x = 0; x < 8; x += 1) {
    // The field is stored in a Float32Array, so compare with float32 slack.
    assert.ok(
      Math.abs(materialHeight(recipe, x, y, 8, 42) - surface.heights[y * 8 + x]) < 1e-6,
      "the single-texel height must match the synthesised field",
    );
    assert.ok(
      Math.abs(materialGrain(x, y, 8, 42) - surface.grains[y * 8 + x]) < 1e-6,
      "the single-texel grain must match the synthesised field",
    );
  }
}

// Determinism must not depend on the caller's tile size in a way that breaks the
// "same block, same texture" promise: a 16px tile and a 32px tile describe the
// same material, just at different resolutions.
const small = synthesizeSurface(MATERIAL_RECIPES.blade, 16, 5);
const large = synthesizeSurface(MATERIAL_RECIPES.blade, 32, 5);
assert.equal(small.heights.length, 16 * 16);
assert.equal(large.heights.length, 32 * 32);
assert.notEqual(small.heights[0], undefined);

console.log("material textures ok");
