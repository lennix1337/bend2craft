import { TEXTURE_PASS } from "../assets/generated/textures/fallback-style.js";

export { TEXTURE_PASS };
export const ATLAS_COLUMNS = 5;
export const ATLAS_ROWS = 10;
export const ATLAS_TILE_SIZE = 16;

// Materials use authored 8x8 or 16x16 pixel-art patterns enlarged into atlas tiles.
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
      "....ss......s...",
      "...sss....ss....",
      "................",
      "..s......l......",
      ".ss.....ll......",
      "...............s",
      "......s.........",
      ".....ss.........",
      "..........l.....",
      "..s.............",
      "........s.......",
      "....l.......s...",
      ".s...........ss.",
      "...............l",
      "...ss...........",
      "......d.........",
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
      "..s.............",
      "...ss...........",
      "........r.......",
      ".............l..",
      "....r...........",
      "........s.......",
      ".l..............",
      "......s.........",
      "...........r....",
      "..ss............",
      "........l.......",
      "....s...........",
      ".............r..",
      ".r..............",
      ".......l........",
      "....s...........",
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
      "gggggggggggggggg",
      "gggglggggggggdgg",
      "ggggggggdggggggg",
      "ggdggggggggggggg",
      "gggggglggggggggg",
      "ggggggggggdggggg",
      "gglggggggggggdgg",
      "ggggdggggggggggg",
      "........r.......",
      "..r......l......",
      "......r.........",
      "....r...........",
      "...........r....",
      ".r..............",
      "......l.........",
      "....r...........",
    ],
  },
  {
    palette: {
      base: "#4b9a54",
      l: "#8fd067",
      s: "#397943",
      h: "#c0df8f",
    },
    pattern: [
      "..ll......l.....",
      ".l....ss....l...",
      "......s.........",
      "..ss....h.......",
      "...........l....",
      ".s......ss......",
      "....h.......s...",
      "........l.......",
      "..l....s........",
      ".......ss.......",
      ".s........h.....",
      "....ll..........",
      "..........s.....",
      "..h......l......",
      ".ss.........l...",
      "......l.........",
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
      "ss..ss......s...",
      "s...s.......s...",
      ".l..s....l..s...",
      "s...s.......s...",
      "s...ss......s...",
      "s...s.......s...",
      "ss..l....s..s...",
      "s...s.......s...",
      "s...s.......s...",
      ".s..s....l..s...",
      "s...s.......s...",
      "s...s.......s...",
      "s...k....s..s...",
      "s...s.......s...",
      "ss..s.......s...",
      "s...s.......s...",
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
      "......s.........",
      ".l..............",
      ".............g..",
      "....s...........",
      "..........s.....",
      ".g..............",
      "...............s",
      ".......l........",
      "..s.............",
      "........g.......",
      ".............s..",
      "....l...........",
      "........s.......",
      ".g..............",
      "..........l.....",
      "...s............",
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
      "................",
      "..wwwwwwwwwwww..",
      "................",
      "......s.........",
      ".......s........",
      "................",
      ".wwwwwwwwwww....",
      "....g...........",
      "................",
      "...........s....",
      "..wwwwwwwwww....",
      "................",
      "....s...........",
      "................",
      ".wwwwwwwwwwww...",
      "......g.........",
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
      base: "#5da24a",
      l: "#8dcc5d",
      s: "#4f8135",
      d: "#3f7a34",
    },
    pattern: [
      "lls....l........",
      "...l......s.....",
      "........l.......",
      ".s....d.........",
      "......l.........",
      "..........s.....",
      "..l.............",
      "........d.......",
      ".....s..........",
      "...........l....",
      ".d..............",
      ".......s........",
      "....l...........",
      "..............d.",
      "...s............",
      ".........l......",
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
  const id = Math.max(0, Math.min(ATLAS_COLUMNS * ATLAS_ROWS - 1, Number(block) || 0));
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
  return Math.max(0, Math.min(ATLAS_COLUMNS * ATLAS_ROWS - 1, id));
}

function variantParity(x, z) {
  return ((Math.trunc(Number(x)) * 31 + Math.trunc(Number(z)) * 17) % 2 + 2) % 2;
}

function pickVariant(base, variant, x, z) {
  return variantParity(x, z) === 0 ? base : variant;
}

export function blockFaceTileAt(block, faceIndex, x = 0, z = 0) {
  const id = Number(block) || 0;
  if (id === 1) return pickVariant(1, 30, x, z);
  if (id === 2) return pickVariant(2, 31, x, z);
  if (id === 3) {
    if (faceIndex === 0) return pickVariant(21, 38, x, z);
    if (faceIndex === 1) return 2;
    return pickVariant(3, 32, x, z);
  }
  if (id === 4) return pickVariant(4, 33, x, z);
  if (id === 5) {
    if (faceIndex === 0 || faceIndex === 1) return 22;
    return pickVariant(5, 34, x, z);
  }
  if (id === 6) return pickVariant(6, 35, x, z);
  if (id === 7) return pickVariant(7, 39, x, z);
  if (id === 22) return pickVariant(25, 36, x, z);
  if (id === 23) return pickVariant(26, 37, x, z);
  if (id === 25) return 27;
  if (id === 26) return 28;
  if (id === 27) return 29;
  return blockFaceTile(id, faceIndex);
}

export function atlasUV(block) {
  const { column, row } = atlasTile(block);
  const inset = 0.5 / ATLAS_TILE_SIZE;
  const u0 = (column + inset) / ATLAS_COLUMNS;
  const u1 = (column + 1 - inset) / ATLAS_COLUMNS;
  const v0 = (row + inset) / ATLAS_ROWS;
  const v1 = (row + 1 - inset) / ATLAS_ROWS;
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
  const pixelSize = ATLAS_TILE_SIZE / gridSize;
  context.globalAlpha = previousAlpha * opacity;
  context.fillStyle = texture.palette.base;
  context.fillRect(x, y, ATLAS_TILE_SIZE, ATLAS_TILE_SIZE);

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
        context.fillStyle = color;
        context.fillRect(
          x + start * pixelSize,
          y + row * pixelSize,
          (end - start) * pixelSize,
          pixelSize,
        );
      }
      start = end;
    }
  }
  const textureAlpha = context.globalAlpha;
  const { highlight, shadow } = paletteEdgeColors(texture.palette);
  for (let row = 0; row < gridSize; row += 1) {
    for (let column = 0; column < gridSize; column += 1) {
      const noise = (texture.id * 31 + row * 17 + column * 13) % 19;
      if (noise !== 0 && noise !== 7) continue;
      context.globalAlpha = textureAlpha * (
        noise === 0 ? TEXTURE_PASS.noiseHighlightAlpha : TEXTURE_PASS.noiseShadowAlpha
      );
      context.fillStyle = noise === 0 ? highlight : shadow;
      context.fillRect(
        x + column * pixelSize + Math.min(0.5, pixelSize * 0.25),
        y + row * pixelSize + Math.min(0.5, pixelSize * 0.25),
        Math.max(0.5, pixelSize * 0.5),
        Math.max(0.5, pixelSize * 0.5),
      );
    }
  }
  context.globalAlpha = textureAlpha;
  drawEdgeLighting(context, x, y, texture);
  context.globalAlpha = previousAlpha;
}

export function createAtlasCanvas(blockColors) {
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
    const texture = ATLAS_TEXTURES[block];
    if (texture === undefined) throw new Error(`Missing atlas texture ${block}.`);
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    drawTexture(context, x, y, texture, block === 7 || block === 24 ? 0.78 : 1);
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
  // Some Chromium canvas-to-WebGL uploads can expose the first six source
  // tiles as transparent even though the initial draw painted them. Repaint
  // those common blocks source-over immediately before upload.
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
  for (let block = 0; block < 6; block += 1) {
    const { column, row } = atlasTile(block);
    drawTexture(context, column * ATLAS_TILE_SIZE, row * ATLAS_TILE_SIZE, BLOCK_TEXTURES[block]);
  }
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";

  return canvas;
}

export function createTextureAtlas(gl, blockColors) {
  const canvas = createAtlasCanvas(blockColors);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  ATLAS_SOURCE_CANVASES.set(texture, canvas);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return texture;
}

export function atlasSourceCanvas(texture) {
  return ATLAS_SOURCE_CANVASES.get(texture) ?? null;
}