import { TEXTURE_PASS } from "../assets/generated/textures/fallback-style.js";

export { TEXTURE_PASS };
export const ATLAS_COLUMNS = 5;
export const ATLAS_ROWS = 5;
export const ATLAS_TILE_SIZE = 16;

const TEXTURE_GRID_SIZE = TEXTURE_PASS.gridSize;
const TEXTURE_PIXEL_SIZE = ATLAS_TILE_SIZE / TEXTURE_GRID_SIZE;

// Each material is an 8x8 pixel-art pattern enlarged to the 16x16 atlas tile.
// A dot leaves the material base color visible; other characters name palette colors.
const BLOCK_TEXTURE_SPECS = [
  {
    palette: {
      base: "#e5f3f8",
      c: "#ffffff",
      s: "#c6e2ec",
    },
    pattern: [
      "........",
      "..cc....",
      ".cccc...",
      "..cc....",
      "........",
      "....ss..",
      "...sss..",
      "....ss..",
    ],
  },
  {
    palette: {
      base: "#b8bdbb",
      l: "#dfe2de",
      s: "#858b89",
      d: "#696f6e",
    },
    pattern: [
      "....s...",
      "..s.....",
      ".......l",
      ".ss.....",
      ".....l..",
      "...d....",
      "......ss",
      ".l......",
    ],
  },
  {
    palette: {
      base: "#95613f",
      l: "#bd8053",
      s: "#70462f",
      r: "#7f5034",
    },
    pattern: [
      "....s...",
      "..l.....",
      "......r.",
      ".s......",
      "...ll...",
      ".......s",
      "..r.....",
      "....s...",
    ],
  },
  {
    palette: {
      base: "#986442",
      g: "#67aa43",
      l: "#8dcc5d",
      d: "#4f8135",
      r: "#7d5033",
    },
    pattern: [
      "gggggggg",
      "gglggggg",
      "ggggdggg",
      "ggdggggg",
      ".......r",
      "..r..l..",
      "....r...",
      ".r...r..",
    ],
  },
  {
    palette: {
      base: "#438f4d",
      l: "#83c75b",
      s: "#286c3b",
      h: "#b7d987",
    },
    pattern: [
      ".ll...l.",
      "l....ll.",
      "..ss....",
      ".ss..h..",
      "....ss..",
      "..h...s.",
      ".s....l.",
      "...ll...",
    ],
  },
  {
    palette: {
      base: "#a77646",
      l: "#d3a56b",
      s: "#6c4328",
      k: "#8b542f",
    },
    pattern: [
      "s...s...",
      "s...s...",
      ".l..s...",
      "s...s...",
      "s...s...",
      "s...l...",
      "ss..k...",
      "s...s...",
    ],
  },
  {
    palette: {
      base: "#d5bb72",
      l: "#f0d993",
      s: "#b09858",
      g: "#c3a661",
    },
    pattern: [
      "...s....",
      ".l......",
      "......g.",
      "..s.....",
      ".....s..",
      ".g......",
      ".......s",
      "....l...",
    ],
  },
  {
    palette: {
      base: "#5d9fc2",
      w: "#addbe1",
      s: "#347ba5",
      g: "#d8f5ef",
    },
    pattern: [
      "........",
      ".wwwwww.",
      "........",
      "..s.....",
      "...s....",
      "........",
      "..wwwww.",
      ".g......",
    ],
  },
  {
    palette: {
      base: "#adb2b0",
      s: "#d6d9d4",
      h: "#777f7d",
      c: "#303637",
      l: "#4d5553",
    },
    pattern: [
      "..cc....",
      ".cch....",
      "....sh..",
      "....ss..",
      ".......c",
      "......cc",
      ".s......",
      "........",
    ],
  },
  {
    palette: {
      base: "#b3adaa",
      s: "#ddd5ca",
      h: "#7c7773",
      o: "#c78568",
      l: "#edb898",
    },
    pattern: [
      ".....o..",
      "....oo..",
      ".h......",
      "..o.....",
      "..oo....",
      "......l.",
      "......o.",
      "........",
    ],
  },
  {
    palette: {
      base: "#8da7aa",
      s: "#c6d5d0",
      h: "#587579",
      g: "#43d2d0",
      l: "#b4ffff",
    },
    pattern: [
      ".gg.....",
      "..g.....",
      ".....l..",
      "....gg..",
      "....g...",
      ".h......",
      ".......g",
      "......gg",
    ],
  },
  {
    palette: {
      base: "#4c5153",
      l: "#787d79",
      s: "#25282a",
      o: "#d88c2e",
      g: "#ffd15a",
    },
    pattern: [
      "llllllll",
      "l......l",
      "l.ssss.l",
      "l.soogs.l",
      "l.soogs.l",
      "l.ssss.l",
      "l......l",
      "llllllll",
    ],
  },
  {
    palette: {
      base: "#d9c493",
      f: "#ffcf50",
      g: "#ffed9a",
      s: "#754b2d",
      l: "#a96b35",
    },
    pattern: [
      "...g....",
      "..gfg...",
      ".gfffg..",
      "..ffg...",
      "...s....",
      "...s....",
      "..sl....",
      "...s....",
    ],
  },
  {
    palette: {
      base: "#dfd5c2",
      q: "#bc4148",
      l: "#ec7069",
      w: "#835235",
      p: "#f6f0e4",
    },
    pattern: [
      "ppqqqqpp",
      "ppqqqqpp",
      "qqllllqq",
      "qqllllqq",
      "wwwwwwww",
      "wwwwwwww",
      "........",
      "........",
    ],
  },
  {
    palette: {
      base: "#a37343",
      l: "#d2a064",
      s: "#6a4329",
      i: "#83b5aa",
      h: "#e5c56a",
    },
    pattern: [
      "ssssssss",
      "sliiiils",
      "sliiiils",
      "sl....ls",
      "sl..h.ls",
      "sl....ls",
      "sl....ls",
      "ssssssss",
    ],
  },
  {
    palette: {
      base: "#80603f",
      d: "#b9824c",
      l: "#e0b06b",
      s: "#5b3c28",
      h: "#e5c56a",
    },
    pattern: [
      "sssss...",
      "sldds...",
      "sldds...",
      "sldds...",
      "sld.h...",
      "sldds...",
      "sldds...",
      "sssss...",
    ],
  },
  {
    palette: {
      base: "#5f9d3d",
      l: "#9acb4b",
      d: "#39702f",
      y: "#d5b63e",
    },
    pattern: [
      "....l...",
      "...ll...",
      "....d...",
      "...l....",
      "........",
      "..d.....",
      "....l...",
      "...ll...",
    ],
  },
  {
    palette: {
      base: "#78b445",
      l: "#b6d35a",
      d: "#3d7f32",
      y: "#dfc147",
    },
    pattern: [
      "...l....",
      "..lll...",
      ".....d..",
      "....l...",
      "..d.....",
      "...ll...",
      "........",
      "....y...",
    ],
  },
  {
    palette: {
      base: "#b7a83d",
      l: "#e0d15b",
      d: "#6f7d2f",
      y: "#f2d54e",
    },
    pattern: [
      "..y.....",
      ".yyy....",
      "..y..d..",
      "....l...",
      "...y....",
      "..yyy...",
      ".....d..",
      "....y...",
    ],
  },
  {
    palette: {
      base: "#c29d32",
      l: "#f4d454",
      d: "#7d6928",
      y: "#fff08a",
    },
    pattern: [
      "..yyy...",
      ".yyyyy..",
      "..y..d..",
      "....l...",
      "..yyyy..",
      ".yyyyyy.",
      "...d....",
      "....y...",
    ],
  },
  {
    palette: {
      base: "#523d29",
      d: "#382719",
      l: "#79583a",
      s: "#2a1e15",
    },
    pattern: [
      "ssssssss",
      "sdddddds",
      "sdllldds",
      "sdddddds",
      "sddlddds",
      "sdddddds",
      "sddlldds",
      "ssssssss",
    ],
  },
  {
    palette: {
      base: "#6c7375",
      d: "#3a4143",
      l: "#a2abad",
    },
    pattern: [
      "........",
      "..d.....",
      "....l...",
      "........",
      ".d......",
      ".....l..",
      "........",
      "...d....",
    ],
  },
  {
    palette: {
      base: "#704a32",
      d: "#3c251b",
      l: "#b17b52",
    },
    pattern: [
      "llllllll",
      "l......l",
      "l..d...l",
      "l......l",
      "l...d..l",
      "l......l",
      "l..d...l",
      "llllllll",
    ],
  },
  {
    palette: {
      base: "#4a6d79",
      d: "#294550",
      l: "#9ac8d1",
    },
    pattern: [
      "........",
      "...l....",
      "........",
      ".d......",
      "........",
      ".....l..",
      "........",
      "..d.....",
    ],
  },
  {
    palette: {
      base: "#77704c",
      d: "#413d29",
      l: "#b5aa72",
    },
    pattern: [
      "d......l",
      "........",
      "..d.....",
      "........",
      ".....l..",
      "........",
      "...d....",
      "........",
    ],
  },
];

const BLOCK_TEXTURE_NAMES = [
  "air",
  "stone",
  "dirt",
  "grass",
  "leaves",
  "wood",
  "sand",
  "water",
  "coal_ore",
  "iron_ore",
  "diamond_ore",
  "furnace",
  "torch",
  "bed",
  "closed_door",
  "open_door",
  "wheat_crop",
  "growing_wheat",
  "ripe_wheat",
  "mature_wheat",
  "farmland",
  "reserved_21",
  "reserved_22",
  "reserved_23",
  "reserved_24",
];

function freezeBlockTexture(spec, id) {
  return Object.freeze({
    id,
    name: BLOCK_TEXTURE_NAMES[id],
    palette: Object.freeze({ ...spec.palette }),
    pattern: Object.freeze([...spec.pattern]),
    pass: TEXTURE_PASS.id,
    tile: Object.freeze({
      column: id % ATLAS_COLUMNS,
      row: Math.floor(id / ATLAS_COLUMNS),
    }),
  });
}

export const BLOCK_TEXTURES = Object.freeze(BLOCK_TEXTURE_SPECS.map(freezeBlockTexture));
export const BLOCK_TEXTURES_BY_ID = Object.freeze(
  Object.fromEntries(BLOCK_TEXTURES.map((texture) => [texture.id, texture])),
);
const BLOCK_TEXTURES_BY_NAME = Object.freeze(
  Object.fromEntries(BLOCK_TEXTURES.map((texture) => [texture.name, texture])),
);

function numericBlockId(value) {
  if (typeof value === "bigint") {
    if (value < 0n || value >= BigInt(BLOCK_TEXTURES.length)) return null;
    return Number(value);
  }
  if (!Number.isInteger(value) || value < 0 || value >= BLOCK_TEXTURES.length) return null;
  return value;
}

/** Return the immutable descriptor for a block, or null for an unknown block. */
export function blockTexture(value) {
  const numeric = numericBlockId(value);
  if (numeric !== null) return BLOCK_TEXTURES[numeric];
  if (typeof value === "string") return BLOCK_TEXTURES_BY_NAME[value] ?? null;
  if (value === null || typeof value !== "object") return null;
  if (Object.prototype.hasOwnProperty.call(value, "name")) return blockTexture(value.name);
  if (Object.prototype.hasOwnProperty.call(value, "block")) return blockTexture(value.block);
  if (Object.prototype.hasOwnProperty.call(value, "id")) return blockTexture(value.id);
  return null;
}

export function atlasTile(block) {
  const id = Math.max(0, Math.min(ATLAS_COLUMNS * ATLAS_ROWS - 1, Number(block) || 0));
  return { column: id % ATLAS_COLUMNS, row: Math.floor(id / ATLAS_COLUMNS) };
}

export function atlasUV(block) {
  const { column, row } = atlasTile(block);
  const inset = 0.5 / ATLAS_TILE_SIZE;
  const u0 = (column + inset) / ATLAS_COLUMNS;
  const u1 = (column + 1 - inset) / ATLAS_COLUMNS;
  const v1 = 1 - (row + inset) / ATLAS_ROWS;
  const v0 = 1 - (row + 1 - inset) / ATLAS_ROWS;
  return [u0, v1, u1, v1, u1, v0, u0, v0];
}

function colorCss(color) {
  return `rgb(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)})`;
}

function colorLuminance(color) {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (match === null) return 0;
  const value = Number.parseInt(match[1], 16);
  const red = (value >> 16) & 0xff;
  const green = (value >> 8) & 0xff;
  const blue = value & 0xff;
  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
}

function paletteEdgeColors(palette) {
  const colors = Object.values(palette).filter((color) => typeof color === "string");
  if (colors.length === 0) return { highlight: "#ffffff", shadow: "#000000" };
  return {
    highlight: colors.reduce((best, color) => colorLuminance(color) > colorLuminance(best) ? color : best),
    shadow: colors.reduce((best, color) => colorLuminance(color) < colorLuminance(best) ? color : best),
  };
}

function drawEdgeLighting(context, x, y, texture) {
  const previousAlpha = context.globalAlpha;
  const { highlight, shadow } = paletteEdgeColors(texture.palette);
  context.globalAlpha = TEXTURE_PASS.edgeHighlightAlpha;
  context.fillStyle = highlight;
  context.fillRect(x, y, ATLAS_TILE_SIZE, 1);
  context.fillRect(x, y + 1, 1, ATLAS_TILE_SIZE - 2);
  context.globalAlpha = TEXTURE_PASS.edgeShadowAlpha;
  context.fillStyle = shadow;
  context.fillRect(x, y + ATLAS_TILE_SIZE - 1, ATLAS_TILE_SIZE, 1);
  context.fillRect(x + ATLAS_TILE_SIZE - 1, y + 1, 1, ATLAS_TILE_SIZE - 2);
  context.globalAlpha = previousAlpha;
}

function drawTexture(context, x, y, texture) {
  context.fillStyle = texture.palette.base;
  context.fillRect(x, y, ATLAS_TILE_SIZE, ATLAS_TILE_SIZE);

  for (let row = 0; row < TEXTURE_GRID_SIZE; row += 1) {
    const pattern = texture.pattern[row];
    let start = 0;
    while (start < TEXTURE_GRID_SIZE) {
      const key = pattern[start];
      let end = start + 1;
      while (end < TEXTURE_GRID_SIZE && pattern[end] === key) end += 1;
      if (key !== ".") {
        const color = texture.palette[key];
        if (color === undefined) throw new Error(`Unknown texture color ${key}.`);
        context.fillStyle = color;
        context.fillRect(
          x + start * TEXTURE_PIXEL_SIZE,
          y + row * TEXTURE_PIXEL_SIZE,
          (end - start) * TEXTURE_PIXEL_SIZE,
          TEXTURE_PIXEL_SIZE,
        );
      }
      start = end;
    }
  }
  drawEdgeLighting(context, x, y, texture);
}

export function createTextureAtlas(gl, blockColors) {
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_COLUMNS * ATLAS_TILE_SIZE;
  canvas.height = ATLAS_ROWS * ATLAS_TILE_SIZE;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("2D canvas is required to create the texture atlas.");

  context.imageSmoothingEnabled = false;
  for (let block = 0; block < ATLAS_COLUMNS * ATLAS_ROWS; block += 1) {
    const { column, row } = atlasTile(block);
    const x = column * ATLAS_TILE_SIZE;
    const y = row * ATLAS_TILE_SIZE;
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    drawTexture(context, x, y, BLOCK_TEXTURES[block]);
    context.strokeStyle = TEXTURE_PASS.outline;
    context.strokeRect(x + 0.5, y + 0.5, ATLAS_TILE_SIZE - 1, ATLAS_TILE_SIZE - 1);

    if (blockColors?.[block] !== undefined) {
      context.globalCompositeOperation = "multiply";
      context.fillStyle = colorCss(blockColors[block]);
      context.globalAlpha = 0.08;
      context.fillRect(x, y, ATLAS_TILE_SIZE, ATLAS_TILE_SIZE);
      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
    }
  }
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}