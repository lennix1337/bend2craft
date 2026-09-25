export const TERRAIN_FOG_START = 24;
export const TERRAIN_MATERIAL_VARIATION_MIN = 0.985;
export const TERRAIN_MATERIAL_VARIATION_MAX = 1.015;
export const TERRAIN_VARIATION_X = 12.9898;
export const TERRAIN_VARIATION_Z = 78.233;
export const TERRAIN_VARIATION_SEED = 43758.5453;
export const MINING_FRACTURE_PROGRESS = 0.02;
export const MOON_FILL_STRENGTH = 0.72;
export const NIGHT_AMBIENT_R = 0.035;
export const NIGHT_AMBIENT_G = 0.055;
export const NIGHT_AMBIENT_STRENGTH = 0.7;
export const LAVA_PULSE_AMPLITUDE = 0.16;
export const LAVA_PULSE_SPEED = 2.4;
export const LAVA_PULSE_SPATIAL_FREQUENCY = 0.5;
export const LAVA_ALPHA = 0.86;
export const FIRE_PULSE_AMPLITUDE = 0.25;
export const FIRE_PULSE_SPEED = 8;
export const FIRE_PULSE_SPATIAL_FREQUENCY = 4;
export const FIRE_ALPHA = 0.9;
export const WATER_DARK_R = 0.025;
export const WATER_DARK_G = 0.22;
export const WATER_DARK_B = 0.34;
export const WATER_LIGHT_R = 0.12;
export const WATER_LIGHT_G = 0.62;
export const WATER_LIGHT_B = 0.72;
export const WATER_FRESNEL_POWER = 3;
export const WATER_SPECULAR_POWER = 48;
export const WATER_FOAM_THRESHOLD = 0.94;
export const WATER_NORMAL_STRENGTH = 6;
export const WATER_FOAM_STRENGTH = 0.035;
export const WATER_CAUSTIC_STRENGTH = 0.18;
export const WATER_CAUSTIC_THRESHOLD_START = 0.54;
export const WATER_CAUSTIC_THRESHOLD_END = 0.72;
export const AERIAL_FOG_MIN_DENSITY = 0.42;
export const AERIAL_FOG_HEIGHT_FALLOFF = 0.028;

// Material response is split into three ordered stages so both backends grade a
// pixel the same way: albedo from the material sample, then lighting from the
// day/ambient model, then the material lobe (detail, roughness, specular).
export const MATERIAL_ALBEDO_STAGE = 1;
export const MATERIAL_LIGHTING_STAGE = 2;
export const MATERIAL_DETAIL_STAGE = 3;
export const MATERIAL_STAGE_ORDER = Object.freeze([
  MATERIAL_ALBEDO_STAGE,
  MATERIAL_LIGHTING_STAGE,
  MATERIAL_DETAIL_STAGE,
]);
// Detail is a bounded multiplier on the albedo, never a replacement for it.
export const MATERIAL_DETAIL_NEUTRAL = 1;
export const MATERIAL_DETAIL_STRENGTH = 0.09;
export const MATERIAL_ROUGHNESS_MIN = 0.55;
export const MATERIAL_ROUGHNESS_MAX = 0.95;
export const MATERIAL_SPECULAR_POWER = 24;
export const MATERIAL_SPECULAR_STRENGTH = 0.18;
// Water reads its depth from the surface height difference and tints toward a
// cool floor, saturating at the documented maximum so a deep ocean cannot go
// black and lose its silhouette.
export const WATER_DEPTH_MAX = 5;
export const WATER_DEPTH_TINT_STRENGTH = 0.34;
export const WATER_DEPTH_FLOOR_R = 0.04;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function fract(value) {
  return value - Math.floor(value);
}

function smoothstep(edgeStart, edgeEnd, value) {
  const amount = clamp01((Number(value) - edgeStart) / (edgeEnd - edgeStart));
  return amount * amount * (3 - 2 * amount);
}

export function materialVariationMultiplier(x, z) {
  const cell = Math.sin(
    Math.floor(Number(x)) * TERRAIN_VARIATION_X
      + Math.floor(Number(z)) * TERRAIN_VARIATION_Z,
  ) * TERRAIN_VARIATION_SEED;
  return TERRAIN_MATERIAL_VARIATION_MIN
    + (TERRAIN_MATERIAL_VARIATION_MAX - TERRAIN_MATERIAL_VARIATION_MIN) * fract(cell);
}

export function terrainFog(distance, fogDistance) {
  return clamp01((Number(distance) - TERRAIN_FOG_START) / Number(fogDistance));
}

export function aerialPerspective(distance, fogDistance, cameraY, worldY) {
  const baseFog = terrainFog(distance, fogDistance);
  const relativeHeight = Math.max(0, Number(worldY) - Number(cameraY));
  const heightAttenuation = Math.exp(-relativeHeight * AERIAL_FOG_HEIGHT_FALLOFF);
  return clamp01(baseFog * (
    AERIAL_FOG_MIN_DENSITY
    + (1 - AERIAL_FOG_MIN_DENSITY) * heightAttenuation
  ));
}

export function waterCaustic(pattern, facing = 1) {
  const crest = smoothstep(
    WATER_CAUSTIC_THRESHOLD_START,
    WATER_CAUSTIC_THRESHOLD_END,
    pattern,
  );
  return crest * WATER_CAUSTIC_STRENGTH * (0.35 + clamp01(facing) * 0.65);
}

export function lavaPulse(time, x) {
  return 1 + LAVA_PULSE_AMPLITUDE * Math.sin(
    Number(time) * LAVA_PULSE_SPEED + Number(x) * LAVA_PULSE_SPATIAL_FREQUENCY,
  );
}

export function lavaAlpha(alpha) {
  return Math.max(Number(alpha), LAVA_ALPHA);
}

export function firePulse(time, y) {
  return 1 + FIRE_PULSE_AMPLITUDE * Math.sin(
    Number(time) * FIRE_PULSE_SPEED + Number(y) * FIRE_PULSE_SPATIAL_FREQUENCY,
  );
}

export function fireAlpha(alpha) {
  return Math.max(Number(alpha), FIRE_ALPHA);
}

export function fractureVisibility(progress, fracture) {
  return Number(progress) >= MINING_FRACTURE_PROGRESS ? Number(fracture) : 0;
}

/**
 * Detail shading: low-amplitude surface relief derived from the material sample
 * and the surface's roughness. A rougher surface carries more micro-relief, so
 * its sample gets more contrast, while a polished surface stays flat.
 */
export function detailShade(sample, roughness, bias = 0) {
  const relief = (Number(sample) - 0.5) * 2;
  const amplitude = MATERIAL_DETAIL_STRENGTH * (0.5 + 0.5 * clamp01(roughness));
  return MATERIAL_DETAIL_NEUTRAL + amplitude * (relief + clamp01(bias));
}

/** Roughness response: 0 is the smoothest authored material, 1 the coarsest. */
export function materialRoughness(coarseness) {
  return MATERIAL_ROUGHNESS_MIN
    + (MATERIAL_ROUGHNESS_MAX - MATERIAL_ROUGHNESS_MIN) * clamp01(coarseness);
}

/** Specular lobe response, falling off as the surface gets rougher. */
export function materialSpecular(facing, roughness) {
  const clamped = clamp01(facing);
  const lobe = Math.pow(clamped, MATERIAL_SPECULAR_POWER);
  return MATERIAL_SPECULAR_STRENGTH * lobe * (1 - clamp01(roughness));
}

/** Normalized water depth in 0..1, saturating at the documented maximum. */
export function waterDepthTint(depth) {
  return clamp01(Number(depth) / WATER_DEPTH_MAX);
}

/**
 * Water color at a given depth. Shallow water keeps its albedo, and deeper
 * water darkens toward a cool floor so a deep ocean still reads as water.
 */
export function waterDepthColor(depth) {
  const amount = waterDepthTint(depth) * WATER_DEPTH_TINT_STRENGTH;
  const albedo = [WATER_LIGHT_R, WATER_LIGHT_G, WATER_LIGHT_B];
  const floor = [WATER_DEPTH_FLOOR_R, WATER_DARK_G * 0.5, WATER_DARK_B * 0.6];
  return albedo.map((channel, index) => channel + (floor[index] - channel) * amount);
}
