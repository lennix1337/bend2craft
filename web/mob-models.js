// Articulated entity models expressed as textured boxes.
// Pure presentation data: same input always yields the same boxes.
// A box is { c: [x, y, z] center, s: [w, h, d] size, yaw, pitch,
// pivot: [x, y, z] | null, tile: block id, tint: [r, g, b] }.
// Models face -Z at yaw 0, with their origin at the feet center.
import { ENTITY_TEXTURE_TILES } from "./texture-atlas.js";

export const TILE_ZOMBIE_SKIN = ENTITY_TEXTURE_TILES.zombieSkin;
export const TILE_ZOMBIE_SHIRT = ENTITY_TEXTURE_TILES.zombieShirt;
export const TILE_ZOMBIE_PANTS = ENTITY_TEXTURE_TILES.zombiePants;
export const TILE_PIG_SKIN = ENTITY_TEXTURE_TILES.pigSkin;
export const TILE_PIG_SNOUT = ENTITY_TEXTURE_TILES.pigSnout;
export const TILE_VILLAGER_SKIN = ENTITY_TEXTURE_TILES.villagerSkin;
export const TILE_VILLAGER_ROBE_GREEN = ENTITY_TEXTURE_TILES.villagerRobeGreen;
export const TILE_VILLAGER_ROBE_BROWN = ENTITY_TEXTURE_TILES.villagerRobeBrown;
export const TILE_ENTITY_EYE = ENTITY_TEXTURE_TILES.eye;
export const TILE_WOOD = 5;

const EYE_TINT = [0.06, 0.06, 0.07];
const FLASH_TINT = [1.0, 0.3, 0.25];
const ZOMBIE_SKIN = [0.45, 0.75, 0.42];
const ZOMBIE_SHIRT = [0.3, 0.62, 0.62];
const ZOMBIE_PANTS = [0.35, 0.42, 0.62];
const PIG_SKIN = [1.0, 0.72, 0.72];
const PIG_SNOUT = [0.95, 0.55, 0.55];
const VILLAGER_SKIN = [0.89, 0.67, 0.52];
const VILLAGER_GREEN_ROBE = [0.35, 0.62, 0.35];
const VILLAGER_BROWN_ROBE = [0.72, 0.56, 0.36];

/**
 * The envelope every articulated model in this module fits inside, measured from
 * the feet origin and taken as the worst case across all of them - so a pig is
 * not measured by a zombie's arms. The fire plume is emitted in a ring at this
 * radius for a reason: a particle spawned inside the body is behind the body's
 * own front faces, and the depth test throws it away against the very thing it
 * is meant to be licking. Anything that needs to know how big a mob is - the
 * plume, a highlight, a sound origin - should read it from here rather than
 * hardcode a number that silently drifts when a model changes.
 * `tests/mob-models.test.mjs` measures every box against it.
 */
export const MOB_BODY = Object.freeze({ radius: 0.82, height: 1.93 });

/** Yaw (radians) that faces a model at (fromX, fromZ) toward (toX, toZ). */
export function faceYaw(fromX, fromZ, toX, toZ) {
  return Math.atan2(toX - fromX, -(toZ - fromZ));
}

function box(center, size, tile, tint, extra = {}) {
  return {
    c: [...center],
    s: [...size],
    yaw: 0,
    pitch: 0,
    pivot: null,
    tile,
    tint: [...tint],
    ...extra,
  };
}

function orbit(parts, cx, cz, yaw) {
  if (yaw === 0) return parts;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  // Matches faceYaw: a part authored at -Z ends up along (sin yaw, -cos yaw).
  const turn = ([x, y, z]) => {
    const ox = x - cx;
    const oz = z - cz;
    return [cx + ox * cos - oz * sin, y, cz + ox * sin + oz * cos];
  };
  return parts.map((part) => ({
    ...part,
    c: turn(part.c),
    pivot: part.pivot === null ? null : turn(part.pivot),
    yaw: part.yaw + yaw,
  }));
}

function swingPhase(id) {
  return (Number(id) % 8) * (Math.PI / 4);
}

export function blinkFactor(id, time) {
  const phase = (Number(id) % 5) * 0.63;
  const cycle = (Number(time) + phase) % 5.2;
  return cycle > 4.82 ? 0.12 : 1;
}

function zombieBoxes(mob, time) {
  const phase = swingPhase(mob.id);
  const legSwing = Math.sin(time * 9 + phase) * 0.55;
  const armSwing = Math.sin(time * 9 + phase + Math.PI) * 0.3;
  const bob = Math.sin(time * 2.4 + phase) * 0.018;
  const eyeOpen = blinkFactor(mob.id, time);
  const boxes = [];
  for (const side of [-1, 1]) {
    boxes.push(box(
      [mob.x + side * 0.12, mob.y + 0.375 + bob, mob.z],
      [0.2, 0.75, 0.2],
      TILE_ZOMBIE_PANTS,
      ZOMBIE_PANTS,
      { pitch: side < 0 ? legSwing : -legSwing, pivot: [mob.x + side * 0.12, mob.y + 0.75, mob.z] },
    ));
  }
  boxes.push(box([mob.x, mob.y + 1.1 + bob, mob.z], [0.52, 0.72, 0.34], TILE_ZOMBIE_SHIRT, ZOMBIE_SHIRT));
  for (const side of [-1, 1]) {
    const armPitch = -1.15 + (side < 0 ? armSwing : -armSwing);
    const armPivot = [mob.x + side * 0.35, mob.y + 1.4 + bob, mob.z];
    boxes.push(box(
      [mob.x + side * 0.35, mob.y + 1.15 + bob, mob.z - 0.28],
      [0.18, 0.62, 0.18],
      TILE_ZOMBIE_SKIN,
      ZOMBIE_SKIN,
      { pitch: armPitch, pivot: armPivot },
    ));
    boxes.push(box(
      [mob.x + side * 0.39, mob.y + 0.84 + bob, mob.z - 0.58],
      [0.18, 0.18, 0.18],
      TILE_ZOMBIE_SKIN,
      ZOMBIE_SKIN,
      { pitch: armPitch, pivot: armPivot },
    ));
  }
  boxes.push(box([mob.x, mob.y + 1.68 + bob, mob.z], [0.46, 0.46, 0.44], TILE_ZOMBIE_SKIN, ZOMBIE_SKIN));
  boxes.push(box(
    [mob.x, mob.y + 1.59 + bob, mob.z - 0.215],
    [0.2, 0.055, 0.02],
    TILE_ENTITY_EYE,
    EYE_TINT,
  ));
  for (const side of [-1, 1]) {
    boxes.push(box(
      [mob.x + side * 0.1, mob.y + 1.72 + bob, mob.z - 0.215],
      [0.07, 0.08 * eyeOpen, 0.02],
      TILE_ENTITY_EYE,
      EYE_TINT,
    ));
  }
  return boxes;
}

function pigBoxes(mob, time) {
  const phase = swingPhase(mob.id);
  const bob = Math.sin(time * 2.8 + phase) * 0.025;
  const eyeOpen = blinkFactor(mob.id, time);
  const boxes = [];
  boxes.push(box([mob.x, mob.y + 0.62 + bob, mob.z + 0.08], [0.64, 0.58, 1.02], TILE_PIG_SKIN, PIG_SKIN));
  boxes.push(box([mob.x, mob.y + 0.85 + bob, mob.z - 0.55], [0.52, 0.46, 0.44], TILE_PIG_SKIN, PIG_SKIN));
  boxes.push(box([mob.x, mob.y + 0.76 + bob, mob.z - 0.78], [0.2, 0.15, 0.06], TILE_PIG_SNOUT, PIG_SNOUT));
  for (const side of [-1, 1]) {
    boxes.push(box(
      [mob.x + side * 0.045, mob.y + 0.76 + bob, mob.z - 0.812],
      [0.035, 0.04, 0.012],
      TILE_ENTITY_EYE,
      EYE_TINT,
    ));
  }
  for (const side of [-1, 1]) {
    boxes.push(box(
      [mob.x + side * 0.1, mob.y + 0.9 + bob, mob.z - 0.62],
      [0.07, 0.08 * eyeOpen, 0.02],
      TILE_ENTITY_EYE,
      EYE_TINT,
    ));
    boxes.push(box(
      [mob.x + side * 0.18, mob.y + 1.08 + bob, mob.z - 0.56],
      [0.13, 0.16, 0.1],
      TILE_PIG_SKIN,
      PIG_SKIN,
      { yaw: side * 0.18 + Math.sin(time * 2 + phase) * 0.04 },
    ));
  }
  const corners = [[-0.2, -0.3], [0.2, -0.3], [-0.2, 0.38], [0.2, 0.38]];
  corners.forEach(([ox, oz], index) => {
    const lift = Math.sin(time * 9 + phase + (index % 2) * Math.PI) * 0.4;
    boxes.push(box(
      [mob.x + ox, mob.y + 0.2 + bob, mob.z + oz],
      [0.16, 0.4, 0.16],
      TILE_PIG_SNOUT,
      PIG_SNOUT,
      { pitch: lift, pivot: [mob.x + ox, mob.y + 0.4 + bob, mob.z + oz] },
    ));
  });
  boxes.push(box(
    [mob.x, mob.y + 0.68 + bob, mob.z + 0.58],
    [0.1, 0.1, 0.26],
    TILE_PIG_SNOUT,
    PIG_SNOUT,
    { yaw: Math.sin(time * 4 + phase) * 0.35 },
  ));
  return boxes;
}

/** Boxes for a mob view { id, kind, x, y, z } at a time in seconds. Yaw faces -Z. */
export function mobBoxes(mob, time, yaw = 0, flash = false) {
  const raw = Number(mob.kind) === 2 ? zombieBoxes(mob, time) : pigBoxes(mob, time);
  const tinted = flash
    ? raw.map((part) => ({ ...part, tint: [...FLASH_TINT] }))
    : raw;
  return orbit(tinted, mob.x, mob.z, yaw);
}

export function villagerRobeTint(profession) {
  return Number(profession) === 2 ? [...VILLAGER_GREEN_ROBE] : [...VILLAGER_BROWN_ROBE];
}

/** Boxes for a villager view { id, profession, x, y, z } at a time in seconds. */
export function villagerBoxes(villager, time, yaw = 0) {
  const robe = villagerRobeTint(villager.profession);
  const robeTile = Number(villager.profession) === 2 ? TILE_VILLAGER_ROBE_GREEN : TILE_VILLAGER_ROBE_BROWN;
  const bob = Math.sin(time * 2 + swingPhase(villager.id)) * 0.03;
  const armSwing = Math.sin(time * 4.5 + swingPhase(villager.id)) * 0.28;
  const eyeOpen = blinkFactor(villager.id, time);
  const parts = [
    box([villager.x, villager.y + 0.58 + bob, villager.z], [0.66, 1.12, 0.52], robeTile, robe),
    box([villager.x, villager.y + 1.5 + bob, villager.z], [0.42, 0.42, 0.42], TILE_VILLAGER_SKIN, VILLAGER_SKIN),
    box([villager.x, villager.y + 1.46 + bob, villager.z - 0.24], [0.12, 0.2, 0.1], TILE_VILLAGER_SKIN, VILLAGER_SKIN),
  ];
  for (const side of [-1, 1]) {
    parts.push(box(
      [villager.x + side * 0.36, villager.y + 1.12 + bob, villager.z],
      [0.19, 0.62, 0.19],
      robeTile,
      robe,
      { pitch: side < 0 ? armSwing : -armSwing, pivot: [villager.x + side * 0.36, villager.y + 1.37 + bob, villager.z] },
    ));
  }
  for (const side of [-1, 1]) {
    parts.push(box(
      [villager.x + side * 0.09, villager.y + 1.54 + bob, villager.z - 0.205],
      [0.06, 0.07 * eyeOpen, 0.02],
      TILE_ENTITY_EYE,
      EYE_TINT,
    ));
  }
  return orbit(parts, villager.x, villager.z, yaw);
}

const DROP_TILE_BY_ITEM = Object.freeze({ 12: 4, 13: 9 });

/** Boxes for a drop view { id, item, x, y, z }. Spins slowly around Y. */
export function dropBoxes(drop, time) {
  const tile = DROP_TILE_BY_ITEM[drop.item] ?? 1;
  const tint = drop.item === 12 ? [0.95, 0.93, 0.85] : [0.6, 0.3, 0.28];
  return [box(
    [drop.x, drop.y + 0.14, drop.z],
    [0.28, 0.28, 0.28],
    tile,
    tint,
    { yaw: time * 2 + swingPhase(drop.id) },
  )];
}
