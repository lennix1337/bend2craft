// Procedural 16x16 pixel-art texture pack. paintModel is pure data (palette
// keys per pixel) so tests can inspect it; the browser turns it into a canvas
// atlas with NEAREST filtering for crisp Minecraft-style pixels.

export const TILE = 16;
export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 3;

export const TILE_NAMES = Object.freeze([
  "pigBody", "pigFace", "pigHead", "pigSnout",
  "pigLeg", "zombieBody", "zombieFace", "zombieHead",
  "zombieLeg", "zombieArm", "white", "pigTop",
]);

export const TILE_INDEX = Object.freeze(
  Object.fromEntries(TILE_NAMES.map((name, index) => [name, index])),
);

export const PALETTE = Object.freeze({
  pSkin: "#f2a3ac",
  pDark: "#d67f8a",
  pDeep: "#b45f6b",
  eyeWhite: "#ffffff",
  pupil: "#191919",
  snout: "#e58a94",
  nostril: "#6e3238",
  zSkin: "#55a03c",
  zDark: "#3e7a2c",
  shirt: "#2a8a7a",
  shirtDark: "#1f6b5f",
  pants: "#3b3bbf",
  flash: "#ffffff",
});

function blank(base) {
  return Array.from({ length: TILE }, () => Array(TILE).fill(base));
}

function rect(grid, x0, y0, w, h, color) {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      if (x >= 0 && x < TILE && y >= 0 && y < TILE) grid[y][x] = color;
    }
  }
}

function speckle(grid, color) {
  for (let y = 0; y < TILE; y += 1) {
    for (let x = 0; x < TILE; x += 1) {
      if ((x * 7 + y * 13) % 29 === 0) grid[y][x] = color;
    }
  }
}

function paintPigBody() {
  const grid = blank("pSkin");
  rect(grid, 0, 13, 16, 3, "pDark");
  speckle(grid, "pDark");
  return grid;
}

function paintPigFace() {
  const grid = blank("pSkin");
  rect(grid, 2, 5, 3, 4, "eyeWhite");
  rect(grid, 11, 5, 3, 4, "eyeWhite");
  rect(grid, 3, 6, 2, 2, "pupil");
  rect(grid, 11, 6, 2, 2, "pupil");
  rect(grid, 4, 9, 8, 4, "snout");
  rect(grid, 6, 10, 1, 2, "nostril");
  rect(grid, 9, 10, 1, 2, "nostril");
  return grid;
}

function paintPigHead() {
  const grid = blank("pSkin");
  speckle(grid, "pDark");
  return grid;
}

function paintPigTop() {
  const grid = blank("pDark");
  rect(grid, 2, 2, 4, 3, "pDeep");
  rect(grid, 10, 2, 4, 3, "pDeep");
  return grid;
}

function paintPigSnout() {
  const grid = blank("snout");
  rect(grid, 4, 6, 2, 4, "nostril");
  rect(grid, 10, 6, 2, 4, "nostril");
  return grid;
}

function paintPigLeg() {
  const grid = blank("pDark");
  rect(grid, 0, 12, 16, 4, "pDeep");
  return grid;
}

function paintZombieBody() {
  const grid = blank("shirt");
  rect(grid, 0, 0, 16, 2, "shirtDark");
  rect(grid, 0, 13, 16, 3, "shirtDark");
  speckle(grid, "shirtDark");
  return grid;
}

function paintZombieFace() {
  const grid = blank("zSkin");
  rect(grid, 3, 6, 2, 2, "pupil");
  rect(grid, 11, 6, 2, 2, "pupil");
  rect(grid, 6, 11, 4, 1, "zDark");
  rect(grid, 7, 12, 2, 1, "zDark");
  return grid;
}

function paintZombieHead() {
  const grid = blank("zSkin");
  speckle(grid, "zDark");
  return grid;
}

function paintZombieLeg() {
  const grid = blank("pants");
  rect(grid, 0, 12, 16, 4, "shirtDark");
  return grid;
}

function paintZombieArm() {
  const grid = blank("zSkin");
  rect(grid, 0, 11, 16, 5, "zDark");
  return grid;
}

const PAINTERS = {
  pigBody: paintPigBody,
  pigFace: paintPigFace,
  pigHead: paintPigHead,
  pigSnout: paintPigSnout,
  pigLeg: paintPigLeg,
  pigTop: paintPigTop,
  zombieBody: paintZombieBody,
  zombieFace: paintZombieFace,
  zombieHead: paintZombieHead,
  zombieLeg: paintZombieLeg,
  zombieArm: paintZombieArm,
  white: () => blank("flash"),
};

export function paintModel() {
  const tiles = {};
  for (const name of TILE_NAMES) {
    tiles[name] = PAINTERS[name]();
  }
  return { tiles, palette: { ...PALETTE } };
}

// UV rect with half-texel insets; v0 is the top of the canvas tile
// (matches UNPACK_FLIP_Y_WEBGL = false).
export function uvForTile(index) {
  const col = index % ATLAS_COLS;
  const row = Math.floor(index / ATLAS_COLS);
  const w = ATLAS_COLS * TILE;
  const h = ATLAS_ROWS * TILE;
  return [
    (col * TILE + 0.5) / w,
    (row * TILE + 0.5) / h,
    ((col + 1) * TILE - 0.5) / w,
    ((row + 1) * TILE - 0.5) / h,
  ];
}

// Browser only: turns the pure model into a canvas for texImage2D.
export function paintAtlasCanvas(model) {
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_COLS * TILE;
  canvas.height = ATLAS_ROWS * TILE;
  const ctx = canvas.getContext("2d");
  TILE_NAMES.forEach((name, index) => {
    const col = index % ATLAS_COLS;
    const row = Math.floor(index / ATLAS_COLS);
    const tile = model.tiles[name];
    for (let y = 0; y < TILE; y += 1) {
      for (let x = 0; x < TILE; x += 1) {
        ctx.fillStyle = model.palette[tile[y][x]];
        ctx.fillRect(col * TILE + x, row * TILE + y, 1, 1);
      }
    }
  });
  return canvas;
}
