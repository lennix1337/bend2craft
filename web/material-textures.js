// Procedural material synthesis for the block atlas.
//
// The atlas used to paint each tile as an 8x8 pattern of flat colour cells
// scaled up 4x, which is why every surface in the world read as a flat colour
// block. This module generates a real per-pixel surface instead: a height field
// whose character depends on the material, and an albedo derived from it.
//
// The height field is what makes the terrain shader's derivative bump mean
// something, because the shader derives relief from the texture's own
// luminance. Bright is therefore raised and dark is recessed for every
// material, so the bump and the albedo agree instead of fighting each other.
//
// Everything is a pure function of the tile id, so the same block always gets
// the same texture and the atlas texel probe stays deterministic.

const VALUE_NOISE_PERM_SIZE = 256;

function hash2(x, y, seed) {
  // Integer hash with a large odd multiplier; stable across platforms because it
  // stays in 32-bit space via Math.imul.
  let value = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  value = Math.imul(value ^ (value >>> 15), 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

/** Bilinear value noise on the integer lattice. */
function valueNoise(x, y, seed) {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  const localX = smooth(x - cellX);
  const localY = smooth(y - cellY);
  const a = hash2(cellX, cellY, seed);
  const b = hash2(cellX + 1, cellY, seed);
  const c = hash2(cellX, cellY + 1, seed);
  const d = hash2(cellX + 1, cellY + 1, seed);
  return (a + (b - a) * localX) + ((c + (d - c) * localX) - (a + (b - a) * localX)) * localY;
}

/** Tileable value noise: the lattice wraps at `period` so the tile has no seam. */
function tileableNoise(x, y, period, seed) {
  const wrappedX = ((Math.floor(x) % period) + period) % period;
  const wrappedY = ((Math.floor(y) % period) + period) % period;
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  const localX = smooth(x - cellX);
  const localY = smooth(y - cellY);
  const a = hash2(wrappedX, wrappedY, seed);
  const b = hash2(wrappedX + 1, wrappedY, seed);
  const c = hash2(wrappedX, wrappedY + 1, seed);
  const d = hash2(wrappedX + 1, wrappedY + 1, seed);
  const top = a + (b - a) * localX;
  const bottom = c + (d - c) * localX;
  return top + (bottom - top) * localY;
}

function fbm(x, y, period, seed, octaves) {
  let total = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let norm = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += tileableNoise(x * frequency, y * frequency, period * frequency, seed + octave * 101) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return total / norm;
}

/**
 * Tileable Worley (cellular) noise, returned as the distance to the nearest
 * feature point. Stone facets and ore pockets both come from this.
 */
function worley(x, y, period, seed) {
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  let best = 8;
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const sampleX = cellX + offsetX;
      const sampleY = cellY + offsetY;
      const wrappedX = ((sampleX % period) + period) % period;
      const wrappedY = ((sampleY % period) + period) % period;
      const pointX = sampleX + hash2(wrappedX, wrappedY, seed);
      const pointY = sampleY + hash2(wrappedX, wrappedY, seed + 7717);
      const distanceX = pointX - x;
      const distanceY = pointY - y;
      const distance = distanceX * distanceX + distanceY * distanceY;
      if (distance < best) best = distance;
    }
  }
  return Math.min(1, Math.sqrt(best));
}

/**
 * Material recipes. Each returns a height in 0..1 for one texel; the albedo is
 * derived from it by the caller.
 *
 *  cellular  chunky facets with sharp edges (stone, obsidian)
 *  clumpy    soft organic lumps (soil, dirt, farmland)
 *  blade     vertical streaks (grass, foliage)
 *  grain     long directional fibres (wood, planks)
 *  banded    horizontal layering (sandstone, ore)
 *  speckle   dense fine grain (sand, gravel)
 */
export const MATERIAL_RECIPES = Object.freeze({
  cellular: Object.freeze({
    kind: "cellular", scale: 4, octaves: 3, contrast: 0.2, grain: 0.04, edge: 0.34,
  }),
  clumpy: Object.freeze({
    kind: "clumpy", scale: 3, octaves: 4, contrast: 0.17, grain: 0.045, edge: 0,
  }),
  blade: Object.freeze({
    kind: "blade", scale: 4, octaves: 3, contrast: 0.13, grain: 0.03, edge: 0,
  }),
  grain: Object.freeze({
    kind: "grain", scale: 3, octaves: 3, contrast: 0.19, grain: 0.05, edge: 0.16,
  }),
  banded: Object.freeze({
    kind: "banded", scale: 4, octaves: 3, contrast: 0.17, grain: 0.06, edge: 0,
  }),
  speckle: Object.freeze({
    kind: "speckle", scale: 12, octaves: 2, contrast: 0.1, grain: 0.08, edge: 0,
  }),
  metal: Object.freeze({
    kind: "grain", scale: 6, octaves: 2, contrast: 0.12, grain: 0.03, edge: 0.2,
  }),
});

/**
 * Height for one texel of a tile.
 *
 * `x`/`y` are texel coordinates and `size` the tile edge, so every frequency is
 * expressed in tiles and the result wraps cleanly.
 */
export function materialHeight(recipe, x, y, size, seed) {
  const frequency = recipe.scale;
  const u = (x / size) * frequency;
  const v = (y / size) * frequency;
  switch (recipe.kind) {
    case "cellular": {
      // Worley ridges give the hard facets; a low-frequency break-up stops the
      // facets from tiling visibly.
      const cells = worley(u, v, frequency, seed);
      const facets = 1 - Math.min(1, cells * 1.9);
      const breakup = fbm(u * 0.6, v * 0.6, Math.max(1, Math.round(frequency * 0.6)), seed + 31, 2);
      return facets * 0.68 + breakup * 0.32;
    }
    case "blade": {
      // Stretched vertically so the noise reads as blades rather than blobs.
      const stretched = fbm(u * 2.6, v * 0.55, frequency * 2, seed, recipe.octaves);
      const clumps = fbm(u * 0.7, v * 0.7, Math.max(1, Math.round(frequency * 0.7)), seed + 57, 2);
      return stretched * 0.62 + clumps * 0.38;
    }
    case "grain": {
      // Long fibres along x, with a slow ring-like wander so it is not a barcode.
      const fibres = fbm(u * 0.5, v * 5.5, frequency * 4, seed, recipe.octaves);
      const rings = Math.abs(Math.sin((v * 1.6 + fbm(u * 0.4, v * 0.4, frequency, seed + 11, 2) * 3.2) * Math.PI));
      return fibres * 0.58 + rings * 0.42;
    }
    case "banded": {
      const bands = 0.5 + 0.5 * Math.sin((v * 2.1 + fbm(u * 0.5, v * 0.5, frequency, seed + 23, 2) * 2.4) * Math.PI);
      return bands * 0.6 + fbm(u, v, frequency, seed, recipe.octaves) * 0.4;
    }
    case "speckle": {
      return fbm(u, v, frequency, seed, recipe.octaves);
    }
    case "clumpy":
    default: {
      return fbm(u, v, frequency, seed, recipe.octaves);
    }
  }
}

/** Fine per-texel grain, independent of the macro height, for surface tooth. */
/**
 * Texel-space period of the fine tooth. Four texels keeps the feature small
 * enough to read as surface grain and large enough that it is not per-pixel.
 */
const GRAIN_PERIOD = 4;

export function materialGrain(x, y, size, seed) {
  // Band-limited, not white noise. A per-texel hash has energy at the Nyquist
  // frequency, so once a tile is displayed at roughly one texel per pixel the
  // grain becomes per-pixel noise: it reads as stipple over the whole surface,
  // and because it is baked into mip 0 no amount of mip filtering removes it.
  // Real material tooth - pores, fibres, scratches - lives at a few texels, and
  // a tiling value noise over a four-texel lattice is what that looks like.
  const cells = Math.max(1, Math.round(size / GRAIN_PERIOD));
  return tileableNoise((x / size) * cells, (y / size) * cells, cells, seed + 9137);
}

/**
 * Build one tile's worth of surface detail.
 *
 * Returns a height field plus the fine grain so the atlas painter can shade the
 * macro pattern with it. `contrast` maps the height onto a multiplier around 1,
 * so a height of 0.5 leaves the base colour untouched.
 */
export function synthesizeSurface(recipe, size, seed) {
  const heights = new Float32Array(size * size);
  const grains = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      heights[index] = materialHeight(recipe, x, y, size, seed);
      grains[index] = materialGrain(x, y, size, seed);
    }
  }
  return { heights, grains, recipe };
}

/**
 * Shade one macro colour with the surface field.
 *
 * Hue is preserved: the multiplier is applied per channel plus a small warm/cool
 * shift driven by the height, which is what stops a stone tile from turning
 * into a monochrome grey card. The result is clamped to the palette's own
 * neighbourhood so a block never drifts away from the colour the game reports.
 */
export function shadeBySurface(color, height, grain, recipe, tintStrength = 1) {
  const relief = (height - 0.5) * recipe.contrast * 2 * tintStrength;
  const tooth = (grain - 0.5) * recipe.grain * 2 * tintStrength;
  // Raised areas catch a touch more warmth, recesses a touch more sky, which is
  // the cheap half of what a real light does and reads as surface relief.
  const warm = 1 + relief * 0.16;
  const cool = 1 - relief * 0.1;
  return [
    Math.max(0, Math.min(1, color[0] * (1 + relief + tooth) * warm)),
    Math.max(0, Math.min(1, color[1] * (1 + relief + tooth))),
    Math.max(0, Math.min(1, color[2] * (1 + relief + tooth) * cool)),
  ];
}

export { VALUE_NOISE_PERM_SIZE };
