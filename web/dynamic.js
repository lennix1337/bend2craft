// Pure dynamic-mesh builders: mobs, particles, sun, moon and stars.
// Emits triangle soup for the WebGL adapter in main.js.
// Dependency-free and testable without a browser.

import { brightness } from "./daynight.js";
import { TILE_INDEX, uvForTile } from "./textures.js";

export const MOB_COLORS = Object.freeze({
  pig: Object.freeze({ body: [0.94, 0.63, 0.66], head: [0.96, 0.7, 0.73] }),
  zombie: Object.freeze({ body: [0.16, 0.48, 0.43], head: [0.3, 0.54, 0.25] }),
});

export function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const value = Number.parseInt(full, 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

// Pushes a yaw-rotated box (used for mobs facing their walk direction).
export function pushBox(arrays, cx, cy, cz, sx, sy, sz, yaw, color) {
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const corner = (lx, ly, lz) => [
    cx + lx * cos + lz * sin,
    cy + ly,
    cz - lx * sin + lz * cos,
  ];
  const quads = [
    [corner(-hx, hy, -hz), corner(hx, hy, -hz), corner(hx, hy, hz), corner(-hx, hy, hz)],
    [corner(-hx, -hy, hz), corner(hx, -hy, hz), corner(hx, -hy, -hz), corner(-hx, -hy, -hz)],
    [corner(hx, -hy, -hz), corner(hx, -hy, hz), corner(hx, hy, hz), corner(hx, hy, -hz)],
    [corner(-hx, -hy, hz), corner(-hx, -hy, -hz), corner(-hx, hy, -hz), corner(-hx, hy, hz)],
    [corner(-hx, -hy, hz), corner(-hx, hy, hz), corner(hx, hy, hz), corner(hx, -hy, hz)],
    [corner(hx, -hy, -hz), corner(hx, hy, -hz), corner(-hx, hy, -hz), corner(-hx, -hy, -hz)],
  ];
  for (const quad of quads) {
    for (const index of [0, 1, 2, 0, 2, 3]) {
      const point = quad[index];
      arrays.positions.push(point[0], point[1], point[2]);
      arrays.colors.push(color[0], color[1], color[2]);
    }
  }
}

export function pushCube(arrays, cx, cy, cz, size, color) {
  pushBox(arrays, cx, cy, cz, size, size, size, 0, color);
}

export function starPosition(index, radius) {
  // Deterministic pseudo-random dome so stars never flicker.
  const a = (index * 2.399963) % (Math.PI * 2);
  const b = ((index * 0.754877) % 1) * Math.PI * 0.48 + 0.03;
  return [
    Math.cos(a) * Math.cos(b) * radius,
    Math.sin(b) * radius + 2,
    Math.sin(a) * Math.cos(b) * radius,
  ];
}

export function createMeshArrays() {
  return { positions: [], colors: [] };
}

export function createTexArrays() {
  return { positions: [], uvs: [], shades: [] };
}

const FACE_SHADES = { top: 1.0, bottom: 0.55, front: 0.9, back: 0.65, right: 0.8, left: 0.7 };

// Yaw-rotated textured box. Local -Z is the mob's forward, matching
// movePlayer; tiles holds per-face atlas indices, shades light each face.
export function pushTexturedBox(arrays, cx, cy, cz, sx, sy, sz, yaw, tiles) {
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const place = (lx, ly, lz) => [
    cx + lx * cos + lz * sin,
    cy + ly,
    cz - lx * sin + lz * cos,
  ];
  const faces = [
    { tile: tiles.top, shade: FACE_SHADES.top, corners: [[-hx, hy, -hz], [hx, hy, -hz], [hx, hy, hz], [-hx, hy, hz]] },
    { tile: tiles.bottom, shade: FACE_SHADES.bottom, corners: [[-hx, -hy, hz], [hx, -hy, hz], [hx, -hy, -hz], [-hx, -hy, -hz]] },
    { tile: tiles.front, shade: FACE_SHADES.front, corners: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz]] },
    { tile: tiles.back, shade: FACE_SHADES.back, corners: [[hx, -hy, hz], [-hx, -hy, hz], [-hx, hy, hz], [hx, hy, hz]] },
    { tile: tiles.right, shade: FACE_SHADES.right, corners: [[hx, -hy, -hz], [hx, -hy, hz], [hx, hy, hz], [hx, hy, -hz]] },
    { tile: tiles.left, shade: FACE_SHADES.left, corners: [[-hx, -hy, hz], [-hx, -hy, -hz], [-hx, hy, -hz], [-hx, hy, hz]] },
  ];
  const quadUvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
  for (const face of faces) {
    const [u0, v0, u1, v1] = uvForTile(face.tile);
    const corners = face.corners.map(([lx, ly, lz]) => place(lx, ly, lz));
    for (const index of [0, 1, 2, 0, 2, 3]) {
      const point = corners[index];
      const [qu, qv] = quadUvs[index];
      arrays.positions.push(point[0], point[1], point[2]);
      arrays.uvs.push(qu === 0 ? u0 : u1, qv === 0 ? v0 : v1);
      arrays.shades.push(face.shade);
    }
  }
}

// Hanging limb pivoted at (px, py, pz): swings around X, then yaws with the mob.
export function pushLimb(arrays, px, py, pz, w, len, d, swing, restPitch, yaw, tile) {
  const total = swing + restPitch;
  const sinP = Math.sin(total);
  const cosP = Math.cos(total);
  const sinY = Math.sin(yaw);
  const cosY = Math.cos(yaw);
  const tiles = { top: tile, bottom: tile, front: tile, back: tile, left: tile, right: tile };
  const local = [];
  for (const lx of [-w / 2, w / 2]) {
    for (const lz of [-d / 2, d / 2]) {
      local.push([lx, 0, lz], [lx, -len, lz]);
    }
  }
  // Order the 8 corners into 6 faces after pitch + yaw transforms.
  const transform = ([lx, ly, lz]) => {
    const ry = ly * cosP - lz * sinP;
    const rz = ly * sinP + lz * cosP;
    return [
      px + lx * cosY + rz * sinY,
      py + ry,
      pz - lx * sinY + rz * cosY,
    ];
  };
  const c = local.map(transform);
  // local order: [x0z0top, x0z0bot, x0z1top, x0z1bot, x1z0top, x1z0bot, x1z1top, x1z1bot]
  const faces = [
    { tile: tiles.top, shade: 0.9, corners: [c[0], c[4], c[6], c[2]] },
    { tile: tiles.bottom, shade: 0.6, corners: [c[3], c[7], c[5], c[1]] },
    { tile: tiles.front, shade: 0.85, corners: [c[1], c[5], c[4], c[0]] },
    { tile: tiles.back, shade: 0.7, corners: [c[7], c[3], c[2], c[6]] },
    { tile: tiles.right, shade: 0.8, corners: [c[5], c[7], c[6], c[4]] },
    { tile: tiles.left, shade: 0.75, corners: [c[3], c[1], c[0], c[2]] },
  ];
  const quadUvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
  for (const face of faces) {
    const [u0, v0, u1, v1] = uvForTile(face.tile);
    for (const index of [0, 1, 2, 0, 2, 3]) {
      const point = face.corners[index];
      const [qu, qv] = quadUvs[index];
      arrays.positions.push(point[0], point[1], point[2]);
      arrays.uvs.push(qu === 0 ? u0 : u1, qv === 0 ? v0 : v1);
      arrays.shades.push(face.shade);
    }
  }
}

function headTiles(face, side, top) {
  return { top, bottom: side, front: face, back: side, left: side, right: side };
}

function flatTiles(tile) {
  return { top: tile, bottom: tile, front: tile, back: tile, left: tile, right: tile };
}

export function pushTexturedMob(arrays, mob, now = 0) {
  const T = TILE_INDEX;
  const flash = mob.hurtTimer > 0;
  const pick = (tile) => (flash ? T.white : tile);
  const stepping = mob.moving && mob.grounded;
  const phase = stepping ? now / 160 : 0;
  const swingOf = (offset) => (stepping ? Math.sin(phase + offset) * 0.55 : 0);
  const bob = stepping ? Math.abs(Math.sin(phase)) * 0.04 : 0;
  // Builders rotate by +yaw, while movement faces mirrored yaw, so render
  // with the negated angle: local -Z then matches the walk direction.
  const ry = -mob.yaw;
  const cos = Math.cos(mob.yaw);
  const sin = Math.sin(mob.yaw);
  const at = (lx, ly, lz) => [
    mob.x + lx * cos - lz * sin,
    mob.y + ly + bob,
    mob.z + lx * sin + lz * cos,
  ];
  if (mob.kind === "pig") {
    const body = flatTiles(pick(T.pigBody));
    const head = headTiles(pick(T.pigFace), pick(T.pigHead), pick(T.pigTop));
    const leg = pick(T.pigLeg);
    const [bx, by, bz] = at(0, 0.62, 0);
    pushTexturedBox(arrays, bx, by, bz, 0.7, 0.55, 0.95, ry, body);
    const [hx, hy, hz] = at(0, 1.0, -0.55);
    pushTexturedBox(arrays, hx, hy, hz, 0.5, 0.5, 0.5, ry, head);
    const [sx, sy, sz] = at(0, 0.93, -0.83);
    pushTexturedBox(arrays, sx, sy, sz, 0.3, 0.22, 0.14, ry, flatTiles(pick(T.pigSnout)));
    for (const ex of [-0.16, 0.16]) {
      const [px, py, pz] = at(ex, 1.32, -0.5);
      pushTexturedBox(arrays, px, py, pz, 0.14, 0.2, 0.08, ry, flatTiles(pick(T.pigHead)));
    }
    const legs = [[-0.22, -0.3, 0], [0.22, -0.3, Math.PI], [-0.22, 0.3, Math.PI], [0.22, 0.3, 0]];
    for (const [lx, lz, offset] of legs) {
      const [px, py, pz] = at(lx, 0.38, lz);
      pushLimb(arrays, px, py, pz, 0.22, 0.38, 0.22, swingOf(offset), 0, ry, leg);
    }
  } else {
    const body = flatTiles(pick(T.zombieBody));
    const head = headTiles(pick(T.zombieFace), pick(T.zombieHead), pick(T.zombieHead));
    const legT = pick(T.zombieLeg);
    const armT = pick(T.zombieArm);
    for (const [lx, offset] of [[-0.16, 0], [0.16, Math.PI]]) {
      const [px, py, pz] = at(lx, 0.85, 0);
      pushLimb(arrays, px, py, pz, 0.28, 0.85, 0.28, swingOf(offset), 0, ry, legT);
    }
    const [bx, by, bz] = at(0, 1.2, 0);
    pushTexturedBox(arrays, bx, by, bz, 0.62, 0.72, 0.36, ry, body);
    for (const [lx, offset] of [[-0.4, Math.PI], [0.4, 0]]) {
      const [px, py, pz] = at(lx, 1.48, -0.05);
      pushLimb(arrays, px, py, pz, 0.22, 0.72, 0.22, swingOf(offset) * 0.3, 1.25, ry, armT);
    }
    const [hx, hy, hz] = at(0, 1.78, -0.02);
    pushTexturedBox(arrays, hx, hy, hz, 0.5, 0.5, 0.5, ry, head);
  }
}

export function buildTexturedMesh(arrays, mobs, now = 0) {
  for (const mob of mobs) {
    if (!mob.dead) pushTexturedMob(arrays, mob, now);
  }
}

export function buildDynamicMesh(arrays, eye, time, particles) {
  for (const particle of particles) {
    const fade = Math.max(0, particle.life / particle.maxLife);
    const size = particle.size * (0.4 + 0.6 * fade);
    pushCube(arrays, particle.x, particle.y, particle.z, size, particle.color);
  }
  const night = 1 - (brightness(time) - 0.32) / 0.68;
  if (night > 0.45) {
    const dim = Math.min(1, (night - 0.45) * 2.5);
    for (let i = 0; i < 130; i += 1) {
      const [sx, sy, sz] = starPosition(i, 85);
      pushCube(arrays, eye[0] + sx, eye[1] + sy, eye[2] + sz, 0.45, [0.9 * dim, 0.93 * dim, dim]);
    }
  }
  // Square sun and moon, very Minecraft.
  const angle = time * Math.PI * 2 - Math.PI / 2;
  const sunHeight = Math.sin(angle);
  const sunDir = [Math.cos(angle), sunHeight, 0.25];
  if (sunHeight > -0.08) {
    pushCube(arrays, eye[0] + sunDir[0] * 90, eye[1] + sunDir[1] * 90, eye[2] + sunDir[2] * 90,
      6, [1, 0.85, 0.4]);
  } else {
    pushCube(arrays, eye[0] - sunDir[0] * 90, eye[1] - sunDir[1] * 90, eye[2] - sunDir[2] * 90,
      4, [0.85, 0.9, 1]);
  }
}
