import { TEXTURE_PASS } from "../assets/generated/textures/fallback-style.js";
import { MATERIAL_RECIPES, shadeBySurface, synthesizeSurface } from "./material-textures.js";

export { TEXTURE_PASS };
export const ATLAS_COLUMNS = 8;
export const ATLAS_ROWS = 8;
// A block face is roughly 30-60 screen pixels at the distances a player actually
// stands at, so a 32-texel tile was being magnified to about 1:1: every texel of
// the material synthesis landed on about one pixel, which is why surfaces read as
// flat and noisy rather than detailed. 64 texels gives two texels per pixel of
// headroom, and the whole atlas is still only 4 MB.
export const ATLAS_TILE_SIZE = 64;
// Mip levels average 2x2 texels, so a tile with no padding blends into its
// neighbour as soon as the surface is minified. Padding has to survive the
// averaging, so a certified level needs both a non-zero padding and an interior
// of at least two texels. A 32-texel gutter with a 64-texel tile reaches that at
// level 5; level 6 would leave a single texel with no padding, which is one pixel
// of the whole cell and nothing left to keep separate.
export const ATLAS_TILE_GUTTER = 32;
export const ATLAS_TILE_STRIDE = ATLAS_TILE_SIZE + 2 * ATLAS_TILE_GUTTER;
export const ATLAS_MIPMAP_SAFE_LEVELS = Object.freeze([1, 2, 3, 4, 5]);
export const ATLAS_CAPACITY = ATLAS_COLUMNS * ATLAS_ROWS;
export const ATLAS_WIDTH = ATLAS_COLUMNS * ATLAS_TILE_STRIDE;
export const ATLAS_HEIGHT = ATLAS_ROWS * ATLAS_TILE_STRIDE;

/**
 * Geometry of a tile's padded cell at one mip level. Texels are discrete, so
 * both the interior and the gutter are floored: that keeps the reported cell
 * from claiming texels the level does not have, which is what makes a level
 * correctly report itself as unprobeable once it is too small to certify.
 */
export function atlasMipLevelGeometry(gutter, tileSize, level) {
  const factor = 2 ** level;
  const interior = Math.max(1, Math.floor(tileSize / factor));
  const padding = Math.max(0, Math.floor(gutter / factor));
  return { interior, padding, size: interior + 2 * padding, factor };
}

/**
 * Reference mip level, produced by repeated 2x2 box averaging on the CPU.
 *
 * WebGL builds its chain with the driver's `generateMipmap`. WebGPU has no
 * equivalent, so the renderer has to write each level itself, and a hand-written
 * downsample can be subtly wrong in a way that only shows up as a washed-out
 * scene. This reference is the definition of a correct chain, computed a
 * completely different way, so comparing against it can actually fail.
 */
export function atlasBoxDownsample(size, pixels, level) {
  let current = pixels;
  let currentSize = Math.max(1, Math.trunc(Number(size) || 0));
  for (let step = 0; step < Math.max(0, Math.trunc(Number(level) || 0)); step += 1) {
    const nextSize = Math.max(1, currentSize >> 1);
    const next = new Uint8Array(nextSize * nextSize * 4);
    for (let y = 0; y < nextSize; y += 1) {
      for (let x = 0; x < nextSize; x += 1) {
        for (let channel = 0; channel < 4; channel += 1) {
          let sum = 0;
          let count = 0;
          for (let dy = 0; dy < 2; dy += 1) {
            for (let dx = 0; dx < 2; dx += 1) {
              const sx = Math.min(currentSize - 1, x * 2 + dx);
              const sy = Math.min(currentSize - 1, y * 2 + dy);
              sum += current[(sy * currentSize + sx) * 4 + channel];
              count += 1;
            }
          }
          next[(y * nextSize + x) * 4 + channel] = Math.round(sum / count);
        }
      }
    }
    current = next;
    currentSize = nextSize;
  }
  return { size: currentSize, pixels: current };
}

/** Top-left pixel of a tile's padded cell inside the atlas. */
export function atlasCellOrigin(tile) {
  const id = Math.max(0, Math.min(ATLAS_CAPACITY - 1, Math.trunc(Number(tile)) || 0));
  return { x: (id % ATLAS_COLUMNS) * ATLAS_TILE_STRIDE, y: Math.floor(id / ATLAS_COLUMNS) * ATLAS_TILE_STRIDE };
}

/** Inner UV rect of a tile, inset by the gutter so filtering stays inside it. */
export function atlasTileUV(tile) {
  const { x, y } = atlasCellOrigin(tile);
  return [
    (x + ATLAS_TILE_GUTTER) / ATLAS_WIDTH,
    (y + ATLAS_TILE_GUTTER) / ATLAS_HEIGHT,
    (x + ATLAS_TILE_GUTTER + ATLAS_TILE_SIZE) / ATLAS_WIDTH,
    (y + ATLAS_TILE_GUTTER + ATLAS_TILE_SIZE) / ATLAS_HEIGHT,
  ];
}

/**
 * Default per-channel tolerance for a mip readback comparison. Mip filtering
 * and the RGBA8 round trip both round, so an exact match is not expected; two
 * levels is well below any visible material difference.
 */
export const ATLAS_MIPMAP_TOLERANCE = 2;

/**
 * Foreign Tile Contamination verdict. `observed` is a cell read back from the
 * full atlas at one mip level, and `reference` is the same cell read back from
 * an isolated copy of that tile alone. If any texel differs beyond the
 * tolerance, another tile's material reached into this one, which is exactly
 * the defect the gutter exists to prevent.
 */
export function foreignTileContamination(observed, reference, tolerance = ATLAS_MIPMAP_TOLERANCE) {
  if (observed === null || observed === undefined) return true;
  if (reference === null || reference === undefined) return true;
  const observedSize = Number(observed.size);
  const referenceSize = Number(reference.size);
  if (!Number.isInteger(observedSize) || observedSize < 1) return true;
  if (observedSize !== referenceSize) return true;
  const observedPixels = observed.pixels;
  const referencePixels = reference.pixels;
  const count = observedSize * observedSize * 4;
  if (!observedPixels || !referencePixels) return true;
  if (observedPixels.length < count || referencePixels.length < count) return true;
  for (let index = 0; index < count; index += 1) {
    if (Math.abs(observedPixels[index] - referencePixels[index]) > tolerance) return true;
  }
  return false;
}

/** Largest per-channel difference between two same-sized RGBA readbacks. */
export function maxChannelDelta(observed, reference) {
  const count = observed.length;
  let worst = 0;
  for (let index = 0; index < count; index += 1) {
    const delta = Math.abs(observed[index] - reference[index]);
    if (delta > worst) worst = delta;
  }
  return worst;
}

/**
 * Certify that every mip level the renderer can select matches the isolated
 * tile. An unprobed or unusable level is treated as unsafe, so adding a level
 * without measuring it can never silently enable mipmaps.
 */
export function isAtlasMipmapSafe(pairs, tolerance = ATLAS_MIPMAP_TOLERANCE) {
  if (!Array.isArray(pairs) || pairs.length === 0) return false;
  return pairs.every((pair) => foreignTileContamination(pair?.observed, pair?.reference, tolerance) === false);
}

const ATLAS_TINT_BLOCKS = Object.freeze({
  21: 3,
  22: 5,
  36: 22,
  37: 23,
});

// Materials use authored pixel-art patterns rendered into a power-of-two atlas.
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
      base: "#7f8583",
      l: "#a6aaa5",
      s: "#626765",
      d: "#4c5251",
    },
    pattern: [
      "................",
      "....ssss........",
      "...ssssss..ll...",
      "..ssssss..lll...",
      "..ssss....lll...",
      "...........ll...",
      "....dd....s.....",
      "...dddd...ss....",
      "..ddddd..ssss...",
      "..ddddd.ssssss..",
      "...ddd...sssss..",
      "....d.....ss....",
      "........ll......",
      "......lll..ss...",
      ".....lll...ss...",
      "................",
    ],
  },
  {
    palette: {
      base: "#6d503b",
      l: "#856b50",
      s: "#594333",
      d: "#49362b",
      r: "#6b503d",
    },
    pattern: [
      "................",
      "....ss.....ll...",
      "...sss...slll...",
      "....ss..sslll...",
      ".........ssss...",
      "..rr...ss.......",
      ".rrr..ss...rr...",
      "..rr..ss...rrr..",
      "....ss..........",
      "..rr...ss..dd...",
      ".rrr..ss..ddd...",
      "..rr....s..dd...",
      ".......ss.......",
      "..ll...ss...rr..",
      "..ll...ss..rrr..",
      "................",
    ],
  },
  {
    palette: {
      base: "#4e7545",
      g: "#5c8c4b",
      l: "#6f9e57",
      d: "#416b3c",
      b: "#765a43",
      r: "#72563f",
    },
    pattern: [
      "gggggggggggggggg",
      "glggggggggggdggg",
      "gdlggggggggggdgg",
      "gglgggggggggglgg",
      "ggdgggggggggdggg",
      "gddgggggggggdggg",
      "ggdggggggggggggg",
      "gggggggggggggggg",
      "..bbbbbbbbbb....",
      ".bbbbrbbbbbbb...",
      "bbbbrbbbbbbbbb..",
      "..bbbbbrbbbbbb..",
      ".bbbbbbbbbbbr...",
      "..bbbbbbbbbbbb..",
      "....bbbbbbbb....",
      "................",
    ],
  },
  {
    palette: {
      base: "#356b3c",
      l: "#4c7d45",
      s: "#2d5b35",
      h: "#5d8f4e",
    },
    pattern: [
      "..ll....hh..ll..",
      ".lhh....ll..hh..",
      "..ss....ss..ss..",
      ".s......s.......",
      "hh..ll....ss..ll",
      "h..l.....s...h..",
      "..ss..hh....ss..",
      ".s..h...s...h...",
      "ll..hh....ss..ll",
      "l...h....s..h...",
      "..ss..hh....ss..",
      ".s..h...s...h...",
      "hh..ll....ss..ll",
      "h..l.....s..h...",
      "..ss..hh....ss..",
      "................",
    ],
  },
  {
    palette: {
      base: "#795438",
      l: "#806044",
      s: "#684631",
      d: "#805a3d",
      k: "#735039",
    },
    pattern: [
      "ssssssssssssssss",
      "slssslksslssslss",
      "slssslssslksslss",
      "slssslssslssslks",
      "slssslssllksslss",
      "slsslksslssslsss",
      "slssslksslssslss",
      "slssslssslksslss",
      "slssslssslssslks",
      "slssslksslssslss",
      "slssslssllksslss",
      "slsslksslssslsss",
      "slssslksslssslss",
      "slssslssslksslss",
      "ssssssssssssssss",
      "ssssssssssssssss",
    ],
  },
  {
    palette: {
      base: "#b99a62",
      l: "#d0b878",
      s: "#a48752",
      g: "#bda66d",
    },
    pattern: [
      "................",
      "....ll....ss....",
      "...lll...sss....",
      "....ll....ss....",
      "..........ss....",
      "....gg..........",
      "...ggg....ll....",
      "....gg.....ll...",
      "..........gg....",
      "....ss....ggg...",
      "...sss....gg....",
      "....ss.....gg...",
      "....ll..........",
      "...lll....ss....",
      "....ll....ss....",
      "................",
    ],
  },
  {
    palette: {
      base: "#397f9b",
      w: "#4f9bad",
      s: "#2e6b88",
      g: "#68b1b4",
    },
    pattern: [
      "................",
      "......w.........",
      "..w.......s.....",
      "..........w.....",
      ".....s..........",
      "................",
      "..........s.....",
      "....w...........",
      "......w.........",
      "................",
      "..s.......w.....",
      "..............s.",
      "................",
      ".....w..........",
      "..........s.....",
      "................",
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
      "....cc..........",
      "...ccc..........",
      "..ccccc.........",
      "...ccc....h.....",
      "....c...........",
      "...........c....",
      "..........cc....",
      ".........ccc....",
      "...........c....",
      "..h.............",
      "................",
      ".....cc.........",
      "....ccc.........",
      ".....c..........",
      "..............h.",
      "................",
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
      "...oo...........",
      "..ooo...........",
      "...o....l.......",
      "........o.......",
      "........oo......",
      "................",
      ".....o..........",
      "....oo..........",
      ".....o..........",
      "............l...",
      "...........o....",
      "..........oo....",
      "...........o....",
      ".h..............",
      "................",
      "......l.........",
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
      ".gg.............",
      "..g.............",
      ".....l..........",
      "....gg..........",
      "....g...........",
      ".h..............",
      ".......g........",
      "......gg........",
      "..............l.",
      ".............gg.",
      "............g...",
      "..l.............",
      "...gg...........",
      "....g...........",
      "........h.......",
      "...........l....",
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
      "llllllllllllllll",
      "l..............l",
      "l..ssssssssss..l",
      "l..s........s..l",
      "l..s..oogg..s..l",
      "l..s..oogg..s..l",
      "l..s........s..l",
      "l..ssssssssss..l",
      "l..............l",
      "l....ssssss....l",
      "l....s....s....l",
      "l....s....s....l",
      "l....s....s....l",
      "l....ssssss....l",
      "l..............l",
      "llllllllllllllll",
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
      ".......g........",
      "......fg........",
      ".....fffg.......",
      "......fff.......",
      ".......f........",
      ".......s........",
      ".......s........",
      "......sl........",
      ".......s........",
      ".......s........",
      ".......s........",
      "......ss........",
      ".......s........",
      "................",
      "................",
      "................",
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
      "ppqqqqqqqqqqqqpp",
      "ppqqqqqqqqqqqqpp",
      "qqqllllllqqqqqqq",
      "qqqllllllqqqqqqq",
      "qqqqqqqqqqqqqqqq",
      "wwwwwwwwwwwwwwww",
      "wwwwwwwwwwwwwwww",
      "wwwwwwwwwwwwwwww",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
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
      "ssssssssssssssss",
      "slllllllllllllls",
      "sl...........ils",
      "sl...........ils",
      "sl....iiii....ls",
      "sl....iiii....ls",
      "sl....iiii....ls",
      "sl............ls",
      "sl............ls",
      "sl............ls",
      "sl............ls",
      "sl............ls",
      "sl............ls",
      "sl............ls",
      "slllllllllllllls",
      "ssssssssssssssss",
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
      "ssssssss........",
      "slllllls........",
      "slddddls........",
      "slddddls........",
      "slddhdls........",
      "slddddls........",
      "slddddls........",
      "slddddls........",
      "slddddls........",
      "slddddls........",
      "slddddls........",
      "slddddls........",
      "slddddls........",
      "slddddls........",
      "slllllls........",
      "ssssssss........",
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
      "................",
      ".......l........",
      "......ll........",
      ".......d........",
      "......l.........",
      ".......l........",
      "........d.......",
      "......ll........",
      "................",
      "....l...........",
      ".....l..........",
      "....d...........",
      ".....l..........",
      "................",
      ".......y........",
      "................",
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
      "................",
      ".......l........",
      "......lll.......",
      ".......d........",
      "......l.........",
      ".....ll.........",
      ".......l........",
      "........d.......",
      "....l...........",
      "...lll..........",
      "....d...........",
      ".....l..........",
      "................",
      ".......y........",
      "................",
      "................",
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
      "................",
      ".......y........",
      "......yyy.......",
      ".......y..d.....",
      ".....l.y........",
      "......y.........",
      ".....yyy........",
      ".......d........",
      "....y...........",
      "...yyy..........",
      "....y...........",
      "........l.......",
      "......d.........",
      ".......y........",
      "................",
      "................",
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
      "................",
      ".....yyy........",
      "....yyyyy.......",
      ".....y..d.......",
      ".......l........",
      "...yyyy.........",
      "..yyyyyy........",
      ".....d..........",
      "........y.......",
      ".......yyy......",
      "........y.......",
      ".....l..........",
      "....d...........",
      ".....y..........",
      "................",
      "................",
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
      "ssssssssssssssss",
      "sdddddddddddddds",
      "sddlllldddddddds",
      "sdddddddddddddds",
      "sddddddlllldddds",
      "sdddddddddddddds",
      "sddlllldddddddds",
      "sdddddddddddddds",
      "sdddddddddddddds",
      "sddlllldddddddds",
      "sdddddddddddddds",
      "sddddddlllldddds",
      "sdddddddddddddds",
      "sddlllldddddddds",
      "sdddddddddddddds",
      "ssssssssssssssss",
    ],
  },
  {
    palette: {
      base: "#4e7545",
      g: "#4e7545",
      l: "#6f9e57",
      h: "#7cab63",
      s: "#5b864b",
      d: "#416b3c",
    },
    pattern: [
      "gggggggggggggggg",
      "gglgggggggggglgg",
      "gglggggggggggdgg",
      "ggdggggggggggdgg",
      "ggdggggllllggdgg",
      "ggdgglhhgglhhdgg",
      "ggdggggllllggdgg",
      "ggdgggggggggdggg",
      "gggggggggggggggg",
      "gggglllggggggdgg",
      "ggghhllggggggdgg",
      "gggglllgggggdggg",
      "gggggggggggdddgg",
      "gggggggggggggggg",
      "gggggggggggggggg",
      "gggggggggggggggg",
    ],
  },
  {
    palette: {
      base: "#795438",
      l: "#806044",
      s: "#684631",
      d: "#805a3d",
      k: "#735039",
    },
    pattern: [
      "....ssssssss....",
      "...slllllllls...",
      "..sllkkkklls....",
      ".sllkkkkkklls...",
      "sllkkllllkklls..",
      "sllkllllllklls..",
      "sllkkllllkklls..",
      ".sllkkkkkklls...",
      "..sllkkkklls....",
      "...slllllllls...",
      "....sskkkkss....",
      ".....slllls.....",
      "................",
      "................",
      "................",
      "................",
    ],
  },
  {
    palette: {
      base: "#c94a1f",
      d: "#7c2418",
      l: "#ffbf3f",
      y: "#f47721",
    },
    pattern: [
      "..yy....yy......",
      ".lyyl...yy......",
      "yy..yy....d.....",
      "..y...d.........",
      "...l......yy....",
      ".d...yy.........",
      "..yy......l.....",
      "....l...........",
      "......yy........",
      ".....d..........",
      "..y.......yy....",
      "...l........d...",
      "........yy......",
      ".......l........",
      "................",
      "................",
    ],
  },
  {
    palette: {
      base: "#f06a24",
      y: "#ffd34e",
      r: "#b42c1c",
      w: "#fff3a1",
    },
    pattern: [
      ".......y........",
      "......yyy.......",
      ".....ywwy.......",
      "......y.........",
      ".......r........",
      "......rr........",
      ".....r..........",
      "....r...........",
      "........y.......",
      ".......yyy......",
      "......ywwy......",
      ".......r........",
      "......rr........",
      ".....r..........",
      "................",
      "................",
    ],
  },
  {
    palette: {
      base: "#777b7d",
      l: "#9ca1a2",
      d: "#4c5052",
      s: "#626667",
    },
    pattern: [
      "sss.....dddd....",
      "sll....d...s....",
      "....d....lll....",
      "...s.....d......",
      "dd....sss....l..",
      "....l....d..s...",
      "....s.....d.....",
      "l...d.....s.....",
      ".....sss....d...",
      "...l...d....s...",
      "....d....lll....",
      "s....s....d.....",
      "..d.....s....l..",
      "....l...d.......",
      "ss....d.....s...",
      "....d.....l.....",
    ],
  },
  {
    palette: {
      base: "#29233f",
      l: "#4d4371",
      d: "#171326",
      p: "#6d4f8f",
    },
    pattern: [
      "d......d........",
      ".p....p.........",
      "..l..l..........",
      "...p............",
      "....d...........",
      "..l.....p.......",
      ".p..............",
      "d.............d.",
      "........d.......",
      "...l.....p......",
      "..p.............",
      ".....d..........",
      "...........l....",
      ".p..............",
      "d......d........",
      "...........p....",
    ],
  },
  {
    palette: { base: "#b5d9e8", l: "#e8f6fc", d: "#6fa3bd", w: "#ffffff" },
    pattern: [
      "llllllllllllllll",
      "llllllllllllllll",
      "llwwwwwwww....ll",
      "llwwwwwwww....ll",
      "llww........ddll",
      "llww........ddll",
      "ll..........ddll",
      "ll..........ddll",
      "ll..........ddll",
      "ll..........ddll",
      "ll....dd......ll",
      "ll....dd......ll",
      "ll..........ddll",
      "ll..........ddll",
      "ll..........wwll",
      "llllllllllllllll",
    ],
  },
  {
    palette: { base: "#9d6a3e", b: "#a77646", l: "#cf9560", d: "#5c3a22", h: "#e8b878", s: "#6f4528" },
    pattern: [
      "ssssssssssssssss",
      "ssssssssssssssss",
      "ssllllllllllllss",
      "ssllllllllllllss",
      "ssllddddddddllss",
      "ssllddddddddllss",
      "ssllddhhhhddllss",
      "ssllddhhhhddllss",
      "ssllddddddddllss",
      "ssllddddddddllss",
      "ssllllllllllllss",
      "ssllllllllllllss",
      "ssbbbbbbbbbbbbss",
      "ssbbbbbbbbbbbbss",
      "ssssssssssssssss",
      "ssssssssssssssss",
    ],
  },
  {
    palette: { base: "#9d6a3e", b: "#a77646", l: "#cf9560", d: "#5c3a22", s: "#7a5230" },
    pattern: [
      "bbbbbbbbbbbbbbbb",
      "bbbbbbbbbbbbbbbb",
      "bbllllbbbbllddbb",
      "bbllllbbbbllddbb",
      "bbbbbbbbbbbbbbbb",
      "bbbbbbbbbbbbbbbb",
      "ssssssddddssssss",
      "ssssssddddssssss",
      "ssbbbbssddbbbbss",
      "ssbbbbssddbbbbss",
      "ssssssddddssssss",
      "ssssssddddssssss",
      "bbbbbbbbbbbbbbbb",
      "bbbbbbbbbbbbbbbb",
      "bbbbbbbbbbbbbbbb",
      "bbbbbbbbbbbbbbbb",
    ],
  },
];

const ENTITY_TEXTURE_NAMES = [
  "zombie_skin", "zombie_shirt", "zombie_pants", "pig_skin", "pig_snout",
  "villager_skin", "villager_robe_green", "villager_robe_brown", "entity_eye", "player_sleeve",
];

const ENTITY_SURFACE_PATTERN = [
  "................",
  "..l.......d.....",
  "................",
  "......d.........",
  "...h............",
  "........l.......",
  ".d..............",
  "......h.........",
  "..............d.",
  "...l............",
  "........d.......",
  "..h.............",
  ".....d..........",
  "...........l....",
  ".d..............",
  "................",
];

const ENTITY_STRIPE_PATTERN = [
  "llllllllllllllll",
  "l..............l",
  "l....d.........l",
  "l..............l",
  "l.......h......l",
  "l..............l",
  "l....d.........l",
  "l..............l",
  "l..............l",
  "l......h.......l",
  "l..............l",
  "l....d.........l",
  "l..............l",
  "l..............l",
  "l..............l",
  "llllllllllllllll",
];

const ENTITY_EYE_PATTERN = [
  "dddddddddddddddd",
  "d..............d",
  "d..h.......h...d",
  "d..............d",
  "d..............d",
  "d...l......l...d",
  "d..............d",
  "d..............d",
  "d..............d",
  "d..............d",
  "d..............d",
  "d..............d",
  "d..............d",
  "d..............d",
  "d..............d",
  "dddddddddddddddd",
];

const ENTITY_TEXTURE_SPECS = [
  { palette: { base: "#6fa45b", l: "#9dca76", d: "#3f6f4a", h: "#d3e2a5" }, pattern: ENTITY_SURFACE_PATTERN },
  { palette: { base: "#2d777c", l: "#55a6a3", d: "#1f4c5a", h: "#82d0c3" }, pattern: ENTITY_STRIPE_PATTERN },
  { palette: { base: "#3f4f83", l: "#6377ad", d: "#27345d", h: "#8ba1cf" }, pattern: ENTITY_SURFACE_PATTERN },
  { palette: { base: "#dda18f", l: "#f2c5ae", d: "#a96867", h: "#ffe1c7" }, pattern: ENTITY_SURFACE_PATTERN },
  { palette: { base: "#c57473", l: "#e7a0a0", d: "#8c4c56", h: "#f5c5b4" }, pattern: ENTITY_STRIPE_PATTERN },
  { palette: { base: "#bf865e", l: "#dda27a", d: "#8d5748", h: "#f2c49a" }, pattern: ENTITY_SURFACE_PATTERN },
  { palette: { base: "#477a4b", l: "#6fa45d", d: "#2d5039", h: "#a0c97e" }, pattern: ENTITY_STRIPE_PATTERN },
  { palette: { base: "#8b623d", l: "#b27d4e", d: "#5c3e2c", h: "#d19a5f" }, pattern: ENTITY_STRIPE_PATTERN },
  { palette: { base: "#1e2324", l: "#59615f", d: "#080b0c", h: "#dcefe2" }, pattern: ENTITY_EYE_PATTERN },
  { palette: { base: "#3a6a9f", l: "#5e91c4", d: "#25476e", h: "#9ac7e8" }, pattern: ENTITY_STRIPE_PATTERN },
];

const VARIANT_TEXTURE_SPECS = [
  { palette: { base: "#a6acae", l: "#d1d5d5", d: "#70777b" }, pattern: ["....l...........", "...d......l.....", "........d.......", "......l.........", ".d..............", "..........d.....", "l...............", "....d.......l...", "...........d....", "..l.............", "........d.......", ".....d..........", "..............l.", ".d..............", "......l.........", "........d......."] },
  { palette: { base: "#875034", l: "#b8774e", d: "#603522" }, pattern: ["d...l...........", "..d.......l.....", "....d...........", "l.........d.....", "...d............", "......l.........", ".d..............", ".....d..........", "........l.......", "..d.............", "...........d....", "l...............", "....d.......l...", ".d..............", "......d.........", "...........l...."] },
  { palette: { base: "#5a9e48", g: "#5a9e48", l: "#a1d264", d: "#347337" }, pattern: ["gglggggggggggggg", "gddggggggggggggg", "gggglggggggggggg", "ggggggdggggggggg", "g...g...g...g...", "..l..d..g.......", "g...g...g...l...", ".d...l...d......", "gggggggggggggggg", "g...d...g...g...", "..l......d......", "gggggggggggggggg", "g.....l...d.....", "...d....g.......", "gggggggggggggggg", "g...l.......d..."] },
  { palette: { base: "#397b3f", l: "#6dae54", d: "#23572f" }, pattern: [".ll..d..", "l..l....", "..d...l.", "....ll..", "d..l....", ".l....d.", "...d....", "l...l..."] },
  { palette: { base: "#9d693e", l: "#cf9560", d: "#684126", s: "#9d693e", k: "#7f4f2e" }, pattern: ["s...s.......s...", "s..l....s.......", "..s...s.....k...", "s...k.......s...", "...s....l.......", "s...s.......s...", "..s.....s.......", "s...s...k.......", "....s.......l...", "s...s.......s...", "..k.....s.......", "s...s...l.......", "...s.......s....", "s...s.....k.....", "..s.......s.....", "s...l.......s..."] },
  { palette: { base: "#d1b56d", l: "#f0d78f", d: "#a3874d" }, pattern: ["..d.....", "l.......", "....d...", "......l.", ".d......", ".....d..", "l.......", "...d...."] },
  { palette: { base: "#6f7476", l: "#aab0af", d: "#4c5254" }, pattern: ["d..l....", "...d....", ".l...d..", "....d...", "d.....l.", "..d.....", "....l...", ".d......"] },
  { palette: { base: "#332851", l: "#5c4b80", d: "#171126" }, pattern: ["d....l..", "...d....", ".l....d.", "......l.", "d.......", "..l.....", "....d...", ".d....l."] },
  { palette: { base: "#4f9b4b", g: "#4f9b4b", l: "#91cb62", d: "#2c6e36" }, pattern: ["gglggggg", "ggggdggg", "gdlggggg", "gggggglg", "ggggdggg", "glgggggg", "ggggggdg", "gglggggg"] },
  { palette: { base: "#4b93bc", w: "#b5e4e7", d: "#2e6f9a" }, pattern: ["........", "..wwww..", "........", ".d......", "....d...", "........", "...ww...", "........"] },
];

const VARIANT_TEXTURE_NAMES = [
  "stone_variant", "dirt_variant", "grass_variant", "leaves_variant", "wood_variant",
  "sand_variant", "cobblestone_variant", "obsidian_variant", "grass_top_variant", "water_variant",
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
  "grass_top",
  "wood_top",
  "lava",
  "fire",
  "cobblestone",
  "obsidian",
  "glass",
  "chest",
  "crafting_table",
];

function freezeBlockTexture(spec, id, name = BLOCK_TEXTURE_NAMES[id]) {
  return Object.freeze({
    id,
    name,
    palette: Object.freeze({ ...spec.palette }),
    pattern: Object.freeze([...spec.pattern]),
    pass: TEXTURE_PASS.id,
    tile: Object.freeze({
      column: id % ATLAS_COLUMNS,
      row: Math.floor(id / ATLAS_COLUMNS),
    }),
  });
}

export const BLOCK_TEXTURES = Object.freeze(BLOCK_TEXTURE_SPECS.map((spec, id) => freezeBlockTexture(spec, id)));
export const VARIANT_TEXTURES = Object.freeze(
  VARIANT_TEXTURE_SPECS.map((spec, index) => freezeBlockTexture(spec, 30 + index, VARIANT_TEXTURE_NAMES[index])),
);
export const ENTITY_TEXTURES = Object.freeze(
  ENTITY_TEXTURE_SPECS.map((spec, index) => freezeBlockTexture(spec, 40 + index, ENTITY_TEXTURE_NAMES[index])),
);
export const ENTITY_TEXTURE_TILES = Object.freeze({
  zombieSkin: 40,
  zombieShirt: 41,
  zombiePants: 42,
  pigSkin: 43,
  pigSnout: 44,
  villagerSkin: 45,
  villagerRobeGreen: 46,
  villagerRobeBrown: 47,
  eye: 48,
  playerSleeve: 49,
});
export const ATLAS_TEXTURES = Object.freeze([...BLOCK_TEXTURES, ...VARIANT_TEXTURES, ...ENTITY_TEXTURES]);
const ATLAS_SOURCE_CANVASES = new WeakMap();
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
  const id = Math.max(0, Math.min(ATLAS_TEXTURES.length - 1, Number(block) || 0));
  return { column: id % ATLAS_COLUMNS, row: Math.floor(id / ATLAS_COLUMNS) };
}

// Face-aware tile: 0 is +Y (top), 1 is -Y (bottom), 2..5 are the sides.
export function blockFaceTile(block, faceIndex) {
  const id = Number(block) || 0;
  if (id === 3) {
    if (faceIndex === 0) return 21;
    if (faceIndex === 1) return 2;
    return 3;
  }
  if (id === 5 && (faceIndex === 0 || faceIndex === 1)) return 22;
  if (id === 21) return 23;
  if (id === 22) return 25;
  if (id === 23) return 26;
  if (id === 25) return 27;
  if (id === 26) return 28;
  if (id === 27) return 29;
  return Math.max(0, Math.min(ATLAS_TEXTURES.length - 1, id));
}

function variantParity(x, z) {
  return ((Math.trunc(Number(x)) * 31 + Math.trunc(Number(z)) * 17) % 2 + 2) % 2;
}

function pickVariant(base, variant, x, z) {
  return variantParity(x, z) === 0 ? base : variant;
}

export function blockFaceTileAt(block, faceIndex, x = 0, z = 0) {
  const id = Number(block) || 0;
  if (id === 1) return 1;
  if (id === 2) return 2;
  if (id === 3) {
    if (faceIndex === 0) return 21;
    if (faceIndex === 1) return 2;
    return 3;
  }
  if (id === 4) return 4;
  if (id === 5) return faceIndex === 0 || faceIndex === 1 ? 22 : 5;
  if (id === 6) return 6;
  if (id === 7) return 7;
  if (id === 22) return pickVariant(25, 36, x, z);
  if (id === 23) return pickVariant(26, 37, x, z);
  if (id === 25) return 27;
  if (id === 26) return 28;
  if (id === 27) return 29;
  return blockFaceTile(id, faceIndex);
}

// `atlasUV` takes an atlas tile slot, which is what `blockFaceTileAt` returns
// and what `atlasTile` already resolves.
export function atlasUV(tile) {
  const [u0, v0, u1, v1] = atlasTileUV(tile);
  return [u0, v0, u1, v0, u1, v1, u0, v1];
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

function drawTexture(context, x, y, texture, opacity = 1) {
  const previousAlpha = context.globalAlpha;
  const gridSize = texture.pattern[0]?.length ?? TEXTURE_PASS.blockGridSize;
  const size = ATLAS_TILE_SIZE;
  const recipe = recipeForTexture(texture);
  const surface = synthesizeSurface(recipe, size, texture.id * 2654435761 + 17);
  const baseColor = parseHexColor(texture.palette.base);

  // The authored macro pattern is painted into an ImageData first so the material
  // surface can be applied per texel afterwards. Going through ImageData is the
  // whole point: the old path filled 4x4 pattern cells with one flat colour,
  // which is why every surface in the world read as a solid block of paint.
  const image = context.createImageData(size, size);
  const data = image.data;
  const cellPixels = size / gridSize;
  for (let row = 0; row < gridSize; row += 1) {
    const pattern = texture.pattern[row];
    let start = 0;
    while (start < gridSize) {
      const key = pattern[start];
      let end = start + 1;
      while (end < gridSize && pattern[end] === key) end += 1;
      if (key !== ".") {
        const color = texture.palette[key];
        if (color === undefined) throw new Error(`Unknown texture color ${key}.`);
        fillMacroCell(data, size, gridSize, row, start, end, parseHexColor(color), cellPixels);
      }
      start = end;
    }
  }
  // A "." cell is a hole in the pattern; the base colour is what shows through.
  for (let index = 0; index < size * size; index += 1) {
    if (data[index * 4 + 3] === 0) {
      data[index * 4] = Math.round(baseColor[0] * 255);
      data[index * 4 + 1] = Math.round(baseColor[1] * 255);
      data[index * 4 + 2] = Math.round(baseColor[2] * 255);
      data[index * 4 + 3] = 255;
    }
  }

  const { highlight, shadow } = paletteEdgeColors(texture.palette);
  // putImageData ignores globalAlpha by specification, so a tile that has to be
  // translucent carries its opacity in the alpha channel instead. Water and
  // fire are drawn at 0.78, and losing that would make them fully opaque.
  const alpha = Math.max(0, Math.min(1, previousAlpha * opacity)) * 255;
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const index = py * size + px;
      const offset = index * 4;
      const height = surface.heights[index];
      const grain = surface.grains[index];
      const current = [data[offset] / 255, data[offset + 1] / 255, data[offset + 2] / 255];
      let rgb = shadeBySurface(current, height, grain, recipe);
      // Mineral flecks, kept deliberately faint on both ends. The grain field is
      // smooth, so a threshold on it selects thin connected filaments, but a tile
      // is displayed at roughly one texel per pixel, so a strong blend of a palette
      // extreme lands as isolated hard dots. That is the single clearest "cheap
      // texture" signal there is, and it costs more than the sparkle it buys: at
      // half strength a light fleck already reads as mineral grain, and a dark one
      // only ever reads as dirt.
      const fleck = grain;
      if (fleck > 0.994) rgb = blendRgb(rgb, parseHexColor(highlight), 0.22);
      else if (fleck < 0.002) rgb = blendRgb(rgb, parseHexColor(shadow), 0.1);
      data[offset] = Math.round(rgb[0] * 255);
      data[offset + 1] = Math.round(rgb[1] * 255);
      data[offset + 2] = Math.round(rgb[2] * 255);
      data[offset + 3] = Math.round(alpha);
    }
  }

  context.putImageData(image, x, y);
  context.globalAlpha = previousAlpha;
  drawEdgeLighting(context, x, y, texture);
  context.globalAlpha = previousAlpha;
}

function fillMacroCell(data, size, gridSize, row, start, end, rgb, cellPixels) {
  const red = Math.round(rgb[0] * 255);
  const green = Math.round(rgb[1] * 255);
  const blue = Math.round(rgb[2] * 255);
  const originY = Math.round(row * cellPixels);
  const endY = Math.min(size, Math.round((row + 1) * cellPixels));
  for (let py = originY; py < endY; py += 1) {
    const originX = Math.round(start * cellPixels);
    const endX = Math.min(size, Math.round(end * cellPixels));
    for (let px = originX; px < endX; px += 1) {
      const offset = (py * size + px) * 4;
      data[offset] = red;
      data[offset + 1] = green;
      data[offset + 2] = blue;
      data[offset + 3] = 255;
    }
  }
  void gridSize;
}

function blendRgb(a, b, amount) {
  return [
    a[0] + (b[0] - a[0]) * amount,
    a[1] + (b[1] - a[1]) * amount,
    a[2] + (b[2] - a[2]) * amount,
  ];
}

const HEX_COLOR_CACHE = new Map();

function parseHexColor(hex) {
  const cached = HEX_COLOR_CACHE.get(hex);
  if (cached !== undefined) return cached;
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  const value = match === null ? 0 : Number.parseInt(match[1], 16);
  const rgb = [
    ((value >> 16) & 0xff) / 255,
    ((value >> 8) & 0xff) / 255,
    (value & 0xff) / 255,
  ];
  HEX_COLOR_CACHE.set(hex, rgb);
  return rgb;
}

/**
 * Which material recipe paints each tile. Keyed by texture name so a new block
 * is an explicit choice rather than silently inheriting stone's facets.
 */
const TEXTURE_RECIPES = Object.freeze({
  stone: "cellular",
  cobblestone: "cellular",
  obsidian: "cellular",
  bedrock: "cellular",
  bricks: "banded",
  dirt: "clumpy",
  grass: "blade",
  grass_side: "blade",
  farmland: "clumpy",
  leaves: "clumpy",
  wood: "grain",
  wood_side: "grain",
  planks: "grain",
  sand: "speckle",
  sandstone: "banded",
  // Water deliberately does not use the speckle recipe. A water surface reads as
  // water through its shading, not its albedo, so a high-frequency albedo only
  // shows up as stipple: the tile is displayed roughly one texel per pixel on a
  // near quad, and the bed tint then multiplies that contrast straight into the
  // colour. A low-frequency grain keeps the tile from reading as a flat plate
  // without competing with the waves.
  water: "grain",
  lava: "speckle",
  glass: "speckle",
  ice: "cellular",
  snow: "speckle",
  coal_ore: "cellular",
  iron_ore: "cellular",
  gold_ore: "cellular",
  diamond_ore: "cellular",
  emerald_ore: "cellular",
  chest: "grain",
  crafting_table: "grain",
  furnace: "cellular",
  torch: "speckle",
  crops: "blade",
  flower: "blade",
  tall_grass: "blade",
  zombie_skin: "clumpy",
  villager_skin: "clumpy",
  pig_skin: "clumpy",
});

function recipeForTexture(texture) {
  const key = TEXTURE_RECIPES[texture.name] ?? "clumpy";
  return MATERIAL_RECIPES[key] ?? MATERIAL_RECIPES.clumpy;
}

// Bleed a tile's own material into its padding. Without this, the mip chain
// averages the transparent gap with the neighbouring material, which is the
// foreign tile contamination the gutter exists to prevent.
function bleedTileGutter(context, x, y, texture) {
  const centerX = x + ATLAS_TILE_SIZE / 2;
  const centerY = y + ATLAS_TILE_SIZE / 2;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const edgeX = dx < 0 ? x : dx > 0 ? x + ATLAS_TILE_SIZE - 1 : centerX - 0.5;
    const edgeY = dy < 0 ? y : dy > 0 ? y + ATLAS_TILE_SIZE - 1 : centerY - 0.5;
    const stripX = dx < 0 ? x - ATLAS_TILE_GUTTER : dx > 0 ? x + ATLAS_TILE_SIZE : x;
    const stripY = dy < 0 ? y - ATLAS_TILE_GUTTER : dy > 0 ? y + ATLAS_TILE_SIZE : y;
    context.drawImage(context.canvas ?? context, edgeX, edgeY, 1, 1,
      stripX, stripY,
      dx < 0 ? ATLAS_TILE_GUTTER : dx > 0 ? ATLAS_TILE_GUTTER : ATLAS_TILE_SIZE,
      dy < 0 ? ATLAS_TILE_GUTTER : dy > 0 ? ATLAS_TILE_GUTTER : ATLAS_TILE_SIZE);
  }
  // The corners are filled from the nearest edge so no transparent pixel is
  // left inside the padded cell.
  for (const [cornerX, cornerY, sourceX, sourceY] of [
    [x - ATLAS_TILE_GUTTER, y - ATLAS_TILE_GUTTER, x, y],
    [x + ATLAS_TILE_SIZE, y - ATLAS_TILE_GUTTER, x + ATLAS_TILE_SIZE - 1, y],
    [x - ATLAS_TILE_GUTTER, y + ATLAS_TILE_SIZE, x, y + ATLAS_TILE_SIZE - 1],
    [x + ATLAS_TILE_SIZE, y + ATLAS_TILE_SIZE, x + ATLAS_TILE_SIZE - 1, y + ATLAS_TILE_SIZE - 1],
  ]) {
    context.drawImage(context.canvas ?? context, sourceX, sourceY, 1, 1,
      cornerX, cornerY, ATLAS_TILE_GUTTER, ATLAS_TILE_GUTTER);
  }
}

export function createAtlasCanvas(blockColors) {
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_WIDTH;
  canvas.height = ATLAS_HEIGHT;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("2D canvas is required to create the texture atlas.");

  context.imageSmoothingEnabled = false;
  for (let block = 0; block < ATLAS_CAPACITY; block += 1) {
    const { x: cellX, y: cellY } = atlasCellOrigin(block);
    const x = cellX + ATLAS_TILE_GUTTER;
    const y = cellY + ATLAS_TILE_GUTTER;
    const texture = ATLAS_TEXTURES[block];
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    if (texture === undefined) {
      context.clearRect(x, y, ATLAS_TILE_SIZE, ATLAS_TILE_SIZE);
      continue;
    }
    drawTexture(context, x, y, texture, block === 7 || block === 24 ? 0.78 : 1);
    context.strokeStyle = TEXTURE_PASS.outline;
    context.strokeRect(x + 0.5, y + 0.5, ATLAS_TILE_SIZE - 1, ATLAS_TILE_SIZE - 1);

    const tintBlock = ATLAS_TINT_BLOCKS[block] ?? block;
    if (blockColors?.[tintBlock] !== undefined) {
      context.globalCompositeOperation = "multiply";
      context.fillStyle = colorCss(blockColors[tintBlock]);
      context.globalAlpha = 0.08;
      context.fillRect(x, y, ATLAS_TILE_SIZE, ATLAS_TILE_SIZE);
      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
    }
    // Bleed after the tint so the padding carries the final material color.
    bleedTileGutter(context, x, y, texture);
  }
  // Some Chromium canvas-to-WebGL uploads can expose the first six source
  // tiles as transparent even though the initial draw painted them. Repaint
  // those common blocks source-over immediately before upload.
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
  for (let block = 0; block < 6; block += 1) {
    const { x: cellX, y: cellY } = atlasCellOrigin(block);
    drawTexture(
      context,
      cellX + ATLAS_TILE_GUTTER,
      cellY + ATLAS_TILE_GUTTER,
      BLOCK_TEXTURES[block],
    );
    bleedTileGutter(context, cellX + ATLAS_TILE_GUTTER, cellY + ATLAS_TILE_GUTTER, BLOCK_TEXTURES[block]);
  }
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";

  return canvas;
}

export function createTextureAtlas(gl, blockColors, { mipmaps = false, mipmapSafe = false } = {}) {
  const canvas = createAtlasCanvas(blockColors);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  // Mipmaps only run once the padded atlas has been certified free of foreign
  // tile contamination; an unproven atlas keeps the deterministic LINEAR path.
  const hasMipmaps = mipmaps && mipmapSafe && typeof gl.generateMipmap === "function";
  const minFilter = hasMipmaps && gl.LINEAR_MIPMAP_LINEAR !== undefined
    ? gl.LINEAR_MIPMAP_LINEAR
    : gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (hasMipmaps) gl.generateMipmap(gl.TEXTURE_2D);
  const anisotropy = typeof gl.getExtension === "function"
    ? gl.getExtension("EXT_texture_filter_anisotropic")
    : null;
  if (anisotropy && typeof gl.texParameterf === "function") {
    const maximum = typeof gl.getParameter === "function"
      ? Number(gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT))
      : 1;
    gl.texParameterf(gl.TEXTURE_2D, anisotropy.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(4, maximum));
  }
  ATLAS_SOURCE_CANVASES.set(texture, canvas);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

export function atlasSourceCanvas(texture) {
  return ATLAS_SOURCE_CANVASES.get(texture) ?? null;
}