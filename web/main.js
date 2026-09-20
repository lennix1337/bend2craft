import World from "../world/world.bend";
import {
  BLOCK_INFO,
  FOOD_VALUES,
  collect,
  consume,
  createInventory,
  isPlaceable,
  selectedItem,
} from "./inventory.js";
import {
  EYE_HEIGHT,
  JUMP_SPEED,
  cameraDirection,
  createPlayer,
  createWorldState,
  isSprinting,
  movePlayer,
  overlapsPlayer,
  raycast,
} from "./game-state.js";
import {
  VOID_DAMAGE,
  addExhaustion,
  applyDamage,
  createSurvivalState,
  eatFood,
  fallDamage,
  isDead,
  isHardcore,
  survivalTick,
  takesDamage,
} from "./survival.js";
import {
  DEFAULT_WORLD_NAME,
  DIFFICULTIES,
  DIFFICULTY_NAMES,
  GAME_MODES,
  MODE_DESCRIPTIONS,
  MODE_NAMES,
  createDefaultOptions,
  createWorldConfig,
  cycleDifficulty,
  cycleMode,
  loadJson,
  randomSeedText,
  sanitizeOptions,
  saveJson,
  validateWorldConfig,
} from "./settings.js";
import { seedFromSearch, seedLabel } from "./seed.js";
import { createPointerLockController } from "./pointer-lock.js";
import {
  DAY_LENGTH,
  advanceTime,
  brightness,
  dayCount,
  isDay,
  skyColor,
} from "./daynight.js";
import {
  MOB_CAPS,
  createMob,
  damageMob,
  mobDrops,
  rayHitMob,
  tickMob,
} from "./mobs.js";
import {
  MOB_COLORS,
  buildDynamicMesh,
  buildTexturedMesh,
  createMeshArrays,
  createTexArrays,
  hexToRgb,
} from "./dynamic.js";
import { paintAtlasCanvas, paintModel } from "./textures.js";

const canvas = document.getElementById("game");
const coordsEl = document.getElementById("coords");
const seedEl = document.getElementById("seed");
const selectedEl = document.getElementById("selected");
const statsEl = document.getElementById("stats");
const modeBadgeEl = document.getElementById("mode-badge");
const hudEl = document.getElementById("hud");
const vitalsEl = document.getElementById("vitals");
const heartsEl = document.getElementById("hearts");
const hungerEl = document.getElementById("hunger");
const hotbarEl = document.getElementById("hotbar-slots");
const hotbarSectionEl = document.getElementById("hotbar");
const helpEl = document.getElementById("help");
const lockHintEl = document.getElementById("lock-hint");
const errorEl = document.getElementById("error");
const toastEl = document.getElementById("toast");
const vignetteEl = document.getElementById("vignette");
const flashEl = document.getElementById("damage-flash");

const screens = {
  title: document.getElementById("screen-title"),
  worlds: document.getElementById("screen-worlds"),
  create: document.getElementById("screen-create"),
  options: document.getElementById("screen-options"),
  help: document.getElementById("screen-help"),
  loading: document.getElementById("screen-loading"),
  pause: document.getElementById("screen-pause"),
  death: document.getElementById("screen-death"),
};

const worldListEl = document.getElementById("world-list");
const worldNameInput = document.getElementById("input-world-name");
const seedInput = document.getElementById("input-seed");
const modeDescriptionEl = document.getElementById("mode-description");
const createErrorEl = document.getElementById("create-error");
const fovInput = document.getElementById("input-fov");
const fovValue = document.getElementById("fov-value");
const sensitivityInput = document.getElementById("input-sensitivity");
const sensitivityValue = document.getElementById("sensitivity-value");
const pauseInfoEl = document.getElementById("pause-info");
const deathTitleEl = document.getElementById("death-title");
const deathDetailEl = document.getElementById("death-detail");
const deathStatsEl = document.getElementById("death-stats");
const loadingDetailEl = document.getElementById("loading-detail");

const OPTIONS_KEY = "bend2craft.options.v1";
const WORLDS_KEY = "bend2craft.worlds.v1";
const BLOCK_NAMES = Object.fromEntries(
  Object.entries(BLOCK_INFO).map(([id, info]) => [id, info.name]),
);
const BLOCK_COLORS = {
  1: [0.34, 0.38, 0.42],
  2: [0.53, 0.34, 0.2],
  3: [0.35, 0.72, 0.28],
  4: [0.18, 0.55, 0.26],
  5: [0.55, 0.34, 0.18],
  6: [0.84, 0.23, 0.18],
  7: [0.94, 0.63, 0.66],
  8: [0.42, 0.36, 0.24],
};
const FACE_SHADES = [1.0, 0.52, 0.82, 0.7, 0.92, 0.62];
const FACES = [
  { dir: [0, 1, 0], corners: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]] },
  { dir: [0, -1, 0], corners: [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]] },
  { dir: [1, 0, 0], corners: [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]] },
  { dir: [-1, 0, 0], corners: [[0, 0, 1], [0, 0, 0], [0, 1, 0], [0, 1, 1]] },
  { dir: [0, 0, 1], corners: [[1, 0, 1], [0, 0, 1], [0, 1, 1], [1, 1, 1]] },
  { dir: [0, 0, -1], corners: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]] },
];
// 12 edges of a unit cube for the block highlight.
const OUTLINE_EDGES = [
  [0, 0, 0, 1, 0, 0], [0, 1, 0, 1, 1, 0], [0, 0, 1, 1, 0, 1], [0, 1, 1, 1, 1, 1],
  [0, 0, 0, 0, 1, 0], [1, 0, 0, 1, 1, 0], [0, 0, 1, 0, 1, 1], [1, 0, 1, 1, 1, 1],
  [0, 0, 0, 0, 0, 1], [1, 0, 0, 1, 0, 1], [0, 1, 0, 0, 1, 1], [1, 1, 0, 1, 1, 1],
];

function asNumber(value) {
  return Number(value);
}

function showError(error) {
  const message = error instanceof Error ? error.message : String(error);
  errorEl.textContent = `Could not start the world.\n${message}`;
  errorEl.hidden = false;
}

let options = sanitizeOptions(loadJson(localStorage, OPTIONS_KEY, createDefaultOptions()));
let draftConfig = createWorldConfig({ mode: GAME_MODES.SURVIVAL, difficulty: DIFFICULTIES.NORMAL });
let optionsReturn = "title";
let session = null;
let screen = "title";
let selectedWorldId = null;
let currentFov = options.fov;
let toastTimer = 0;
let audioContext = null;

function toast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastEl.hidden = true;
  }, 2600);
}

function playTone(kind) {
  if (!options.sound) return;
  try {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended") void audioContext.resume();
    const now = audioContext.currentTime;
    const presets = {
      click: [[660, 0.05, "square", 0.05]],
      break: [[170, 0.09, "sawtooth", 0.08]],
      place: [[240, 0.07, "square", 0.07]],
      hurt: [[110, 0.18, "sawtooth", 0.1]],
      eat: [[520, 0.07, "sine", 0.09], [680, 0.09, "sine", 0.09]],
      death: [[220, 0.5, "sawtooth", 0.1]],
      splash: [[392, 0.12, "triangle", 0.08], [523, 0.16, "triangle", 0.08]],
      step: [[140, 0.05, "triangle", 0.035]],
      land: [[90, 0.1, "triangle", 0.07]],
      oink: [[320, 0.08, "square", 0.06], [260, 0.1, "square", 0.06]],
      groan: [[85, 0.28, "sawtooth", 0.08]],
      pop: [[500, 0.06, "sine", 0.07]],
      burn: [[200, 0.12, "sawtooth", 0.05]],
    };
    const notes = presets[kind] ?? presets.click;
    notes.forEach(([frequency, duration, type, gain], index) => {
      const oscillator = audioContext.createOscillator();
      const amplifier = audioContext.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      amplifier.gain.setValueAtTime(gain, now + index * 0.09);
      amplifier.gain.exponentialRampToValueAtTime(0.001, now + index * 0.09 + duration);
      oscillator.connect(amplifier);
      amplifier.connect(audioContext.destination);
      oscillator.start(now + index * 0.09);
      oscillator.stop(now + index * 0.09 + duration);
    });
  } catch {
    // Audio is decorative; never break the game loop.
  }
}

function flashDamage() {
  flashEl.style.transition = "none";
  flashEl.style.opacity = "1";
  requestAnimationFrame(() => {
    flashEl.style.transition = "opacity 0.4s ease";
    flashEl.style.opacity = "0";
  });
}

function showScreen(name) {
  screen = name;
  for (const [key, element] of Object.entries(screens)) {
    element.hidden = key !== name;
  }
  const inGame = name === "playing" || name === "pause" || name === "death";
  hudEl.hidden = !inGame;
  hotbarSectionEl.hidden = !inGame;
  vitalsEl.hidden = !inGame;
  helpEl.hidden = name !== "playing";
  if (name !== "playing" && document.pointerLockElement === canvas) {
    document.exitPointerLock();
  }
}

function loadWorlds() {
  const data = loadJson(localStorage, WORLDS_KEY, { version: 1, worlds: [] });
  if (!data || !Array.isArray(data.worlds)) return [];
  return data.worlds;
}

function persistWorlds(worlds) {
  saveJson(localStorage, WORLDS_KEY, { version: 1, worlds });
}

function findWorld(id) {
  return loadWorlds().find((world) => world.id === id) ?? null;
}

function describeWorld(world) {
  const mode = MODE_NAMES[world.mode] ?? "Survival";
  const difficulty = DIFFICULTY_NAMES[world.difficulty] ?? "";
  const played = world.lastPlayed ? new Date(world.lastPlayed).toLocaleString() : "never";
  return `${mode}${difficulty ? ` · ${difficulty}` : ""} · seed ${world.seed} · played ${played}`;
}

function renderWorldList() {
  const worlds = loadWorlds();
  if (!worlds.some((world) => world.id === selectedWorldId)) {
    selectedWorldId = worlds[0]?.id ?? null;
  }
  worldListEl.innerHTML = worlds.length === 0
    ? `<p class="world-empty">No worlds yet. Create one to start surviving.</p>`
    : worlds.map((world) => `
      <div class="world-item${world.id === selectedWorldId ? " selected" : ""}" data-world="${world.id}" role="button" tabindex="0">
        <strong>${escapeHtml(world.name)}</strong>
        <small>${escapeHtml(describeWorld(world))}</small>
      </div>`).join("");
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function renderCreateMenu() {
  createErrorEl.hidden = true;
  const modeButton = screens.create.querySelector('[data-action="cycle-mode"]');
  const difficultyButton = screens.create.querySelector('[data-action="cycle-difficulty"]');
  modeButton.textContent = `Game Mode: ${MODE_NAMES[draftConfig.mode]}`;
  modeDescriptionEl.textContent = MODE_DESCRIPTIONS[draftConfig.mode];
  difficultyButton.textContent = `Difficulty: ${DIFFICULTY_NAMES[draftConfig.difficulty]}`;
  difficultyButton.disabled = draftConfig.mode === GAME_MODES.HARDCORE;
}

function renderOptionsMenu() {
  fovInput.value = String(options.fov);
  fovValue.textContent = String(options.fov);
  sensitivityInput.value = String(options.sensitivity);
  sensitivityValue.textContent = Number(options.sensitivity).toFixed(1);
  screens.options.querySelector('[data-action="toggle-coords"]').textContent =
    `Coordinates: ${options.showCoords ? "ON" : "OFF"}`;
  screens.options.querySelector('[data-action="toggle-sound"]').textContent =
    `Sound: ${options.sound ? "ON" : "OFF"}`;
  screens.options.querySelector('[data-action="toggle-fovkick"]').textContent =
    `Sprint FOV: ${options.fovKick ? "ON" : "OFF"}`;
}

function saveOptions() {
  options = sanitizeOptions(options);
  saveJson(localStorage, OPTIONS_KEY, options);
  renderOptionsMenu();
}

// --- WebGL setup (runs once at boot) ---

let gl = null;
let program = null;
let positionBuffer = null;
let colorBuffer = null;
let outlinePositionBuffer = null;
let outlineColorBuffer = null;
let positionLocation = 0;
let colorLocation = 0;
let viewProjectionLocation = null;
let brightnessLocation = null;
let meshVertexCount = 0;
let visibleFaceCount = 0;
let dynamicPositionBuffer = null;
let dynamicColorBuffer = null;
let texProgram = null;
let texPositionBuffer = null;
let texUvBuffer = null;
let texShadeBuffer = null;
let texPositionLocation = 0;
let texUvLocation = 0;
let texShadeLocation = 0;
let texViewProjectionLocation = null;
let texBrightnessLocation = null;
let texAtlasLocation = null;
let mobTexture = null;

function setupGL() {
  gl = canvas.getContext("webgl", { antialias: false, alpha: false });
  if (!gl) throw new Error("WebGL is not available in this browser.");

  const vertexSource = `
    attribute vec3 aPosition;
    attribute vec3 aColor;
    uniform mat4 uViewProjection;
    uniform float uBrightness;
    varying vec3 vColor;
    void main() {
      vColor = aColor * uBrightness;
      gl_Position = uViewProjection * vec4(aPosition, 1.0);
    }
  `;
  const fragmentSource = `
    precision mediump float;
    varying vec3 vColor;
    void main() {
      gl_FragColor = vec4(vColor, 1.0);
    }
  `;

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`WebGL shader compilation failed: ${info}`);
    }
    return shader;
  }

  const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
  program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Failed to link the WebGL program: ${gl.getProgramInfoLog(program)}`);
  }
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  positionBuffer = gl.createBuffer();
  colorBuffer = gl.createBuffer();
  outlinePositionBuffer = gl.createBuffer();
  outlineColorBuffer = gl.createBuffer();
  dynamicPositionBuffer = gl.createBuffer();
  dynamicColorBuffer = gl.createBuffer();
  positionLocation = gl.getAttribLocation(program, "aPosition");
  colorLocation = gl.getAttribLocation(program, "aColor");
  viewProjectionLocation = gl.getUniformLocation(program, "uViewProjection");
  brightnessLocation = gl.getUniformLocation(program, "uBrightness");

  const texVertexSource = `
    attribute vec3 aPosition;
    attribute vec2 aTexCoord;
    attribute float aShade;
    uniform mat4 uViewProjection;
    uniform float uBrightness;
    varying vec2 vTexCoord;
    varying float vShade;
    void main() {
      vTexCoord = aTexCoord;
      vShade = aShade * uBrightness;
      gl_Position = uViewProjection * vec4(aPosition, 1.0);
    }
  `;
  const texFragmentSource = `
    precision mediump float;
    uniform sampler2D uAtlas;
    varying vec2 vTexCoord;
    varying float vShade;
    void main() {
      vec4 texel = texture2D(uAtlas, vTexCoord);
      gl_FragColor = vec4(texel.rgb * vShade, 1.0);
    }
  `;
  const texVertexShader = compileShader(gl.VERTEX_SHADER, texVertexSource);
  const texFragmentShader = compileShader(gl.FRAGMENT_SHADER, texFragmentSource);
  texProgram = gl.createProgram();
  gl.attachShader(texProgram, texVertexShader);
  gl.attachShader(texProgram, texFragmentShader);
  gl.linkProgram(texProgram);
  if (!gl.getProgramParameter(texProgram, gl.LINK_STATUS)) {
    throw new Error(`Failed to link the mob shader: ${gl.getProgramInfoLog(texProgram)}`);
  }
  gl.deleteShader(texVertexShader);
  gl.deleteShader(texFragmentShader);
  texPositionLocation = gl.getAttribLocation(texProgram, "aPosition");
  texUvLocation = gl.getAttribLocation(texProgram, "aTexCoord");
  texShadeLocation = gl.getAttribLocation(texProgram, "aShade");
  texViewProjectionLocation = gl.getUniformLocation(texProgram, "uViewProjection");
  texBrightnessLocation = gl.getUniformLocation(texProgram, "uBrightness");
  texAtlasLocation = gl.getUniformLocation(texProgram, "uAtlas");

  texPositionBuffer = gl.createBuffer();
  texUvBuffer = gl.createBuffer();
  texShadeBuffer = gl.createBuffer();
  mobTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, mobTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, paintAtlasCanvas(paintModel()));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

function blockColor(block, faceIndex, x, z) {
  const base = BLOCK_COLORS[block] ?? [1, 0, 1];
  const variation = ((x * 17 + z * 31) % 5) * 0.012;
  const top = block === 3 && faceIndex === 0;
  const shade = FACE_SHADES[faceIndex] + (top ? variation : variation * 0.5);
  return base.map((channel) => Math.min(1, channel * shade));
}

// Builds the visible-face mesh for any voxel store. Shared by the live
// session and the slow-orbiting panorama behind the menus.
function buildVoxelMesh(store, width, depth, maxY) {
  const positions = [];
  const colors = [];
  let faces = 0;

  for (let y = 0; y < maxY; y += 1) {
    for (let z = 0; z < depth; z += 1) {
      for (let x = 0; x < width; x += 1) {
        const block = store.blockAt(x, y, z);
        if (block === 0) continue;
        for (let faceIndex = 0; faceIndex < FACES.length; faceIndex += 1) {
          const face = FACES[faceIndex];
          const [dx, dy, dz] = face.dir;
          if (store.blockAt(x + dx, y + dy, z + dz) !== 0) continue;
          faces += 1;
          const color = blockColor(block, faceIndex, x, z);
          const corners = face.corners;
          const triangles = [0, 1, 2, 0, 2, 3];
          for (const cornerIndex of triangles) {
            const corner = corners[cornerIndex];
            positions.push(x + corner[0], y + corner[1], z + corner[2]);
            colors.push(color[0], color[1], color[2]);
          }
        }
      }
    }
  }
  return { positions, colors, faces };
}

function uploadStaticMesh(mesh) {
  meshVertexCount = mesh.positions.length / 3;
  visibleFaceCount = mesh.faces;
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.positions), gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.colors), gl.DYNAMIC_DRAW);
}

function rebuildMesh() {
  const { world, width, depth, maxY } = session;
  uploadStaticMesh(buildVoxelMesh(world, width, depth, maxY));
}

function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
function normalize(v) {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}
function multiply4(a, b) {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] =
        a[row] * b[column * 4] +
        a[4 + row] * b[column * 4 + 1] +
        a[8 + row] * b[column * 4 + 2] +
        a[12 + row] * b[column * 4 + 3];
    }
  }
  return out;
}
function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  const range = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * range, -1,
    0, 0, 2 * far * near * range, 0,
  ]);
}
function lookAt(eye, center, up) {
  const z = normalize([eye[0] - center[0], eye[1] - center[1], eye[2] - center[2]]);
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ]);
}
function resizeCanvas() {
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.floor(canvas.clientWidth * scale);
  const height = Math.floor(canvas.clientHeight * scale);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  gl.viewport(0, 0, canvas.width, canvas.height);
}

// --- Dynamic mesh upload (builders live in web/dynamic.js) ---

function drawDynamic(arrays) {
  if (arrays.positions.length === 0) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, dynamicPositionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arrays.positions), gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, dynamicColorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arrays.colors), gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, dynamicPositionBuffer);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, dynamicColorBuffer);
  gl.enableVertexAttribArray(colorLocation);
  gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, arrays.positions.length / 3);
}

// --- Session lifecycle ---

function resolveSeed(seedText) {
  const text = String(seedText ?? "").trim() || randomSeedText();
  return seedFromSearch(`?seed=${encodeURIComponent(text)}`, World.default_seed());
}

async function startSession(config, saved = null) {
  showScreen("loading");
  loadingDetailEl.textContent = `Shaping terrain for seed ${seedLabel(config.seed)}.`;
  await new Promise((resolve) => window.setTimeout(resolve, 30));

  const width = asNumber(World.width());
  const depth = asNumber(World.depth());
  const maxY = asNumber(World.max_y());
  const world = createWorldState(width, depth, maxY);
  let blockCount = 0;
  for (let y = 0; y < maxY; y += 1) {
    for (let z = 0; z < depth; z += 1) {
      for (let x = 0; x < width; x += 1) {
        const value = asNumber(World.block(config.seed, BigInt(x), BigInt(y), BigInt(z)));
        world.setBlock(x, y, z, value);
        if (value !== 0) blockCount += 1;
      }
    }
  }

  const spawnCell = [Math.floor(width / 2) + 1, Math.floor(depth / 2)];
  const spawnHeight = asNumber(World.column_height(config.seed, BigInt(spawnCell[0]), BigInt(spawnCell[1])));
  const player = createPlayer(spawnCell, spawnHeight);
  const inventory = createInventory();
  const survival = createSurvivalState(config.mode);

  session = {
    id: saved?.id ?? `w${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
    config,
    world,
    width,
    depth,
    maxY,
    blockCount,
    spawnCell,
    spawnHeight,
    player,
    inventory,
    survival,
    mobs: [],
    mobId: 1,
    time: 0.03,
    elapsed: 0,
    particles: [],
    stepAcc: 0,
    pigTimer: 0,
    zombieTimer: 0,
    selectedSlot: 0,
    held: new Set(),
    respawnGrace: 0,
    saveTimer: 0,
    lastWtap: 0,
    lastSpacetap: 0,
    currentTarget: null,
    currentSprinting: false,
    edits: [],
    stats: { mined: 0, placed: 0, walked: 0, eaten: 0, time: 0, kills: 0 },
  };

  if (saved) applySave(saved);

  // Pigs greet the player near spawn; zombies arrive after dark.
  if (session.mobs.length === 0) {
    for (let i = 0; i < 5; i += 1) {
      spawnMob("pig", 6 + Math.random() * 10);
    }
  }

  rebuildMesh();
  renderHotbar();
  updateHud();
  renderVitals();
  modeBadgeEl.textContent = MODE_NAMES[config.mode].toLowerCase();
  modeBadgeEl.classList.toggle("hardcore", isHardcore(config.mode));
  vitalsEl.classList.toggle("hardcore", isHardcore(config.mode));
  lockHintEl.textContent = "Click to capture the mouse";
  saveSession();

  window.__bend2craft = {
    world: {
      seed: seedLabel(config.seed),
      width,
      depth,
      maxY,
      get blockCount() { return session.blockCount; },
    },
    getBlock: (x, y, z) => session.world.blockAt(x, y, z),
    getInventory: () => session.inventory.map((item) => ({ ...item })),
    getPlayer: () => ({ ...session.player }),
    getSurvival: () => ({ ...session.survival }),
    getMode: () => session.config.mode,
    getMobs: () => session.mobs.map((mob) => ({ ...mob })),
    getTime: () => ({ time: session.time, elapsed: session.elapsed }),
  };

  playTone("splash");
  showScreen("playing");
  pointerLock.request();
}

function applySave(saved) {
  if (Array.isArray(saved.edits)) {
    for (const [x, y, z, block] of saved.edits) {
      if (session.world.inside(x, y, z)) {
        const previous = session.world.blockAt(x, y, z);
        session.world.setBlock(x, y, z, block);
        if (previous === 0 && block !== 0) session.blockCount += 1;
        if (previous !== 0 && block === 0) session.blockCount -= 1;
      }
    }
    session.edits = saved.edits.slice(-20000);
  }
  if (Array.isArray(saved.inventory) && saved.inventory.length === session.inventory.length) {
    saved.inventory.forEach((item, index) => {
      if (item && typeof item.block === "number" && typeof item.count === "number") {
        session.inventory[index] = { block: item.block, count: item.count };
      }
    });
  }
  if (saved.player) {
    Object.assign(session.player, {
      x: Number(saved.player.x) || session.player.x,
      y: Number(saved.player.y) || session.player.y,
      z: Number(saved.player.z) || session.player.z,
      yaw: Number(saved.player.yaw) || 0,
      pitch: Number(saved.player.pitch) || 0,
    });
  }
  if (saved.survival) {
    session.survival.health = Math.min(20, Math.max(0, Number(saved.survival.health) || 20));
    session.survival.hunger = Math.min(20, Math.max(0, Number(saved.survival.hunger) || 0));
    session.survival.dead = false;
  }
  if (saved.stats) Object.assign(session.stats, saved.stats);
  session.selectedSlot = Number(saved.selectedSlot) || 0;
  if (typeof saved.time === "number") session.time = ((saved.time % 1) + 1) % 1;
  if (typeof saved.elapsed === "number") session.elapsed = Math.max(0, saved.elapsed);
}

function surfaceY(store, maxY, x, z) {
  for (let y = maxY - 1; y >= 0; y -= 1) {
    if (store.blockAt(x, y, z) !== 0) return y + 1.05;
  }
  return 1.05;
}

function countMobs(kind) {
  return session.mobs.filter((mob) => !mob.dead && mob.kind === kind).length;
}

// Spawns a mob on the surface at a random angle around the player.
function spawnMob(kind, minDist, maxDist = minDist + 10) {
  const caps = MOB_CAPS[kind] ?? 5;
  if (countMobs(kind) >= caps) return null;
  const angle = Math.random() * Math.PI * 2;
  const dist = minDist + Math.random() * (maxDist - minDist);
  const x = Math.floor(session.player.x + Math.cos(angle) * dist);
  const z = Math.floor(session.player.z + Math.sin(angle) * dist);
  if (!session.world.inside(x, 1, z)) return null;
  const y = surfaceY(session.world, session.maxY, x, z);
  const mob = createMob(kind, x + 0.5, y, z + 0.5);
  mob.id = session.mobId++;
  mob.yaw = Math.random() * Math.PI * 2;
  session.mobs.push(mob);
  return mob;
}

function spawnParticles(x, y, z, color, count, speed = 2.5, size = 0.12, life = 0.7) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const up = Math.random() * speed;
    const outward = (0.3 + Math.random() * 0.7) * speed;
    session.particles.push({
      x, y: y + Math.random() * 0.5, z,
      vx: Math.cos(angle) * outward,
      vy: up,
      vz: Math.sin(angle) * outward,
      life: life * (0.6 + Math.random() * 0.4),
      maxLife: life,
      size: size * (0.7 + Math.random() * 0.6),
      color,
    });
  }
  if (session.particles.length > 400) {
    session.particles.splice(0, session.particles.length - 400);
  }
}

function updateParticles(dt) {
  const alive = [];
  for (const particle of session.particles) {
    particle.life -= dt;
    if (particle.life <= 0) continue;
    particle.vy -= 12 * dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.z += particle.vz * dt;
    alive.push(particle);
  }
  session.particles = alive;
}

function snapshotSession() {
  return {
    id: session.id,
    name: session.config.name,
    seedText: session.config.seedText,
    seed: seedLabel(session.config.seed),
    mode: session.config.mode,
    difficulty: session.config.difficulty,
    createdAt: session.createdAt ?? Date.now(),
    lastPlayed: Date.now(),
    time: session.time,
    elapsed: session.elapsed,
    player: {
      x: session.player.x,
      y: session.player.y,
      z: session.player.z,
      yaw: session.player.yaw,
      pitch: session.player.pitch,
    },
    inventory: session.inventory.map((item) => ({ ...item })),
    survival: { health: session.survival.health, hunger: session.survival.hunger },
    selectedSlot: session.selectedSlot,
    edits: session.edits.slice(-20000),
    stats: { ...session.stats },
  };
}

function saveSession() {
  if (!session) return;
  const worlds = loadWorlds();
  const snapshot = snapshotSession();
  snapshot.createdAt = findWorld(session.id)?.createdAt ?? Date.now();
  const index = worlds.findIndex((world) => world.id === session.id);
  if (index === -1) worlds.unshift(snapshot);
  else worlds[index] = snapshot;
  persistWorlds(worlds.slice(0, 24));
}

function recordEdit(x, y, z, block) {
  session.edits.push([x, y, z, block]);
  if (session.edits.length > 20000) session.edits.shift();
}

// --- HUD ---

function renderHearts(container, value, hardcore) {
  let html = "";
  for (let heart = 0; heart < 10; heart += 1) {
    const points = Math.max(0, Math.min(2, value - heart * 2));
    const glyph = points >= 2 ? "❤" : points >= 1 ? "💔" : "♡";
    const cls = points >= 2 ? "" : points >= 1 ? "half" : "empty";
    void hardcore;
    html += `<span class="${cls}">${glyph}</span>`;
  }
  container.innerHTML = html;
}

function renderHungerRow(container, value) {
  let html = "";
  for (let cell = 0; cell < 10; cell += 1) {
    const points = Math.max(0, Math.min(2, value - cell * 2));
    const glyph = points >= 2 ? "🍗" : points >= 1 ? "🍖" : "·";
    const cls = points >= 2 ? "" : points >= 1 ? "half" : "empty";
    html += `<span class="${cls}">${glyph}</span>`;
  }
  container.innerHTML = html;
}

function renderVitals() {
  if (!session) return;
  const { survival, config } = session;
  renderHearts(heartsEl, survival.health, isHardcore(config.mode));
  const showHunger = config.mode !== GAME_MODES.CREATIVE;
  hungerEl.style.display = showHunger ? "" : "none";
  if (showHunger) renderHungerRow(hungerEl, survival.hunger);
  const low = survival.health <= 6 && !isDead(survival);
  vignetteEl.style.opacity = low ? String(1 - survival.health / 8) : "0";
}

function renderHotbar() {
  if (!session) return;
  hotbarEl.innerHTML = session.inventory.map((item, slot) => {
    const info = BLOCK_INFO[item.block] ?? BLOCK_INFO[0];
    const empty = item.block === 0 || item.count === 0;
    const selected = slot === session.selectedSlot;
    const infinite = session.config.mode === GAME_MODES.CREATIVE && !empty;
    return `<button class="hotbar-slot${selected ? " selected" : ""}${empty ? " empty" : ""}"
      type="button" data-slot="${slot}" aria-label="Slot ${slot + 1}: ${info.name}, ${infinite ? "unlimited" : item.count}"
      title="${slot + 1}: ${info.name}">
      <span class="slot-key">${slot + 1}</span>
      <span class="slot-swatch" style="--slot-color: ${info.color}"></span>
      <span class="slot-name">${info.name}</span>
      <span class="slot-count">${infinite ? "∞" : item.count || ""}</span>
    </button>`;
  }).join("");
}

function selectSlot(slot) {
  if (!session || slot < 0 || slot >= session.inventory.length) return;
  session.selectedSlot = slot;
  playTone("click");
  renderHotbar();
  updateHud();
}

function formatTime(seconds) {
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

function updateHud() {
  if (!session) return;
  const { player, config } = session;
  const item = selectedItem(session.inventory, session.selectedSlot);
  const name = item === null || item.block === 0 ? "empty" : BLOCK_NAMES[item.block];
  const count = item === null ? 0 : item.count;
  coordsEl.style.display = options.showCoords ? "" : "none";
  coordsEl.textContent = `x ${player.x.toFixed(1)} · y ${player.y.toFixed(1)} · z ${player.z.toFixed(1)}`;
  seedEl.textContent = `seed: ${seedLabel(config.seed)} · ${MODE_NAMES[config.mode]} · ${DIFFICULTY_NAMES[config.difficulty]} · Day ${dayCount(session.elapsed)}${isDay(session.time) ? "" : " 🌙"}`;
  selectedEl.textContent = `selected: ${name} · ${session.config.mode === GAME_MODES.CREATIVE && item?.block ? "∞" : count}${player.flying ? " · flying" : ""}`;
  statsEl.textContent = `${session.blockCount} blocks · ${visibleFaceCount} faces · ${formatTime(session.stats.time)}`;
}

// --- Survival gameplay ---

function hurtPlayer(amount, cause) {
  if (!session || session.respawnGrace > 0) return 0;
  const dealt = applyDamage(session.survival, amount, session.config.mode);
  if (dealt > 0) {
    flashDamage();
    playTone("hurt");
    renderVitals();
  }
  if (isDead(session.survival)) onDeath(cause);
  return dealt;
}

function eatSelected() {
  if (!session || screen !== "playing" || isDead(session.survival)) return false;
  const item = selectedItem(session.inventory, session.selectedSlot);
  const food = item && FOOD_VALUES[item.block];
  if (!item || !food || item.count < 1) {
    toast("Select food to eat (apples fall from leaves, pigs drop pork).");
    return false;
  }
  if (session.survival.hunger >= 20) {
    toast("Hunger is already full.");
    return false;
  }
  if (session.config.mode !== GAME_MODES.CREATIVE && !consume(session.inventory, session.selectedSlot)) return false;
  eatFood(session.survival, food);
  session.stats.eaten += 1;
  const info = BLOCK_INFO[item.block];
  if (info) {
    spawnParticles(session.player.x, session.player.y + 1.4, session.player.z, hexToRgb(info.color), 8, 1.5);
  }
  playTone("eat");
  renderHotbar();
  renderVitals();
  updateHud();
  return true;
}

function nearestMobHit(player, maxDistance) {
  const eye = [player.x, player.y + EYE_HEIGHT, player.z];
  const direction = cameraDirection(player);
  let best = null;
  for (const mob of session.mobs) {
    if (mob.dead) continue;
    const dist = rayHitMob(eye, direction, mob, maxDistance);
    if (dist !== null && (best === null || dist < best.dist)) {
      best = { mob, dist };
    }
  }
  return best;
}

function knockback(mob, direction) {
  const { world } = session;
  const push = 0.45;
  const nx = mob.x + direction[0] * push;
  const nz = mob.z + direction[2] * push;
  if (!overlapsPlayer(session.player, Math.floor(nx), Math.floor(mob.y), Math.floor(nz))) {
    const before = [mob.x, mob.z];
    mob.x = nx;
    mob.z = nz;
    if (world.blockAt(Math.floor(nx), Math.floor(mob.y), Math.floor(nz)) !== 0 ||
        world.blockAt(Math.floor(nx), Math.floor(mob.y + 1), Math.floor(nz)) !== 0) {
      mob.x = before[0];
      mob.z = before[1];
    }
  }
}

function killMob(mob) {
  session.stats.kills += 1;
  const palette = MOB_COLORS[mob.kind] ?? MOB_COLORS.pig;
  spawnParticles(mob.x, mob.y + 0.7, mob.z, palette.body, 14, 3);
  spawnParticles(mob.x, mob.y + 0.7, mob.z, [0.9, 0.9, 0.9], 6, 1.5);
  playTone(mob.kind === "zombie" ? "groan" : "oink");
  for (const drop of mobDrops(mob.kind)) {
    if (!collect(session.inventory, drop)) {
      toast("Inventory is full — mob loot lost.");
      break;
    }
  }
  const names = { 7: "porkchop", 8: "rotten flesh" };
  toast(`Got ${names[mobDrops(mob.kind)[0]] ?? "loot"}! Press E to eat.`);
  renderHotbar();
  updateHud();
}

function interact(button) {
  if (!session || screen !== "playing" || isDead(session.survival)) return;
  const { world, player, config } = session;
  const { inside, blockAt, setBlock } = world;
  if (button === 0) {
    const hit = nearestMobHit(player, 4.5);
    if (hit) {
      const direction = cameraDirection(player);
      const died = damageMob(hit.mob, 4);
      knockback(hit.mob, direction);
      spawnParticles(hit.mob.x, hit.mob.y + 0.8, hit.mob.z, [0.8, 0.1, 0.1], 8, 2.5);
      playTone("hurt");
      if (config.difficulty !== DIFFICULTIES.PEACEFUL) addExhaustion(session.survival, 0.15, config.mode);
      if (died) killMob(hit.mob);
      else if (hit.mob.kind === "pig") playTone("oink");
      renderVitals();
      return;
    }
    const target = raycast(world, player);
    if (!target) return;
    const [x, y, z] = target.hit;
    const removedBlock = blockAt(x, y, z);
    if (y === 0 || removedBlock === 0) return;
    if (config.mode === GAME_MODES.CREATIVE) {
      setBlock(x, y, z, 0);
    } else {
      if (!collect(session.inventory, removedBlock)) {
        toast("Inventory is full.");
        return;
      }
      // Leaves occasionally hide an apple, the survival food source.
      if (removedBlock === 4 && Math.random() < 0.2) {
        if (collect(session.inventory, 6)) toast("Found an apple! Press E to eat.");
      }
      setBlock(x, y, z, 0);
    }
    session.blockCount -= 1;
    session.stats.mined += 1;
    recordEdit(x, y, z, 0);
    if (config.difficulty !== DIFFICULTIES.PEACEFUL) addExhaustion(session.survival, 0.2, config.mode);
    spawnParticles(x + 0.5, y + 0.5, z + 0.5, BLOCK_COLORS[removedBlock] ?? [1, 0, 1], 10, 2.5);
    playTone("break");
  } else if (button === 2) {
    const item = selectedItem(session.inventory, session.selectedSlot);
    const food = item && FOOD_VALUES[item.block];
    if (!target) {
      if (food) eatSelected();
      return;
    }
    const [px, py, pz] = target.place ?? [];
    const wantsPlace = target.place && item && isPlaceable(item.block) && item.count > 0;
    if (wantsPlace) {
      if (!inside(px, py, pz) || blockAt(px, py, pz) !== 0 || overlapsPlayer(player, px, py, pz)) return;
      if (config.mode !== GAME_MODES.CREATIVE && !consume(session.inventory, session.selectedSlot)) return;
      setBlock(px, py, pz, item.block);
      session.blockCount += 1;
      session.stats.placed += 1;
      recordEdit(px, py, pz, item.block);
      if (config.difficulty !== DIFFICULTIES.PEACEFUL) addExhaustion(session.survival, 0.1, config.mode);
      playTone("place");
    } else if (food) {
      eatSelected();
      return;
    } else {
      return;
    }
  } else {
    return;
  }
  renderHotbar();
  updateHud();
  renderVitals();
  rebuildMesh();
}

const DEATH_CAUSES = {
  fall: "took fatal fall damage",
  void: "fell into the void",
  starve: "starved to death",
  mob: "was slain by a zombie",
};

function onDeath(cause) {
  if (!session || isDead(session.survival) === false) return;
  saveSession();
  playTone("death");
  const hardcore = isHardcore(session.config.mode);
  if (hardcore) {
    persistWorlds(loadWorlds().filter((world) => world.id !== session.id));
    deathTitleEl.textContent = "Game Over!";
    deathTitleEl.classList.add("dead-hardcore");
  } else {
    deathTitleEl.textContent = "You died!";
    deathTitleEl.classList.remove("dead-hardcore");
  }
  deathDetailEl.textContent = hardcore
    ? `Hardcore ${session.config.name} ${DEATH_CAUSES[cause] ?? "died"} — the world was deleted.`
    : `${session.config.name} ${DEATH_CAUSES[cause] ?? "died"}. Your blocks are still here.`;
  deathStatsEl.textContent =
    `Survived ${formatTime(session.stats.time)} · walked ${Math.round(session.stats.walked)}m · mined ${session.stats.mined} · placed ${session.stats.placed}`;
  const respawnButton = screens.death.querySelector('[data-action="respawn"]');
  respawnButton.style.display = hardcore ? "none" : "";
  showScreen("death");
}

function respawn() {
  if (!session) return;
  const { player, spawnCell, spawnHeight } = session;
  player.x = spawnCell[0] + 0.5;
  player.y = spawnHeight + 0.05;
  player.z = spawnCell[1] + 0.5;
  player.velocityY = 0;
  player.peakY = player.y;
  player.lastFall = 0;
  player.flying = false;
  session.survival.health = 20;
  session.survival.hunger = 20;
  session.survival.exhaustion = 0;
  session.survival.regenTimer = 0;
  session.survival.starveTimer = 0;
  session.survival.dead = false;
  session.respawnGrace = 2;
  saveSession();
  renderVitals();
  updateHud();
  showScreen("playing");
  pointerLock.request();
  toast("Respawned. Watch your step.");
}

// --- Frame loop ---

function renderScene(eye, direction, time, mobs, particles, outlineTarget, targetFov) {
  resizeCanvas();
  const sky = skyColor(time);
  gl.clearColor(sky[0], sky[1], sky[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.useProgram(program);
  gl.uniform1f(brightnessLocation, brightness(time));

  const center = [eye[0] + direction[0], eye[1] + direction[1], eye[2] + direction[2]];
  const view = lookAt(eye, center, [0, 1, 0]);
  currentFov += (targetFov - currentFov) * 0.12;
  const projection = perspective((currentFov * Math.PI) / 180, canvas.width / canvas.height, 0.05, 220);
  gl.uniformMatrix4fv(viewProjectionLocation, false, multiply4(projection, view));

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.enableVertexAttribArray(colorLocation);
  gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, meshVertexCount);

  if (outlineTarget) drawOutline(view, projection);
  const dynamic = createMeshArrays();
  buildDynamicMesh(dynamic, eye, time, particles);
  drawDynamic(dynamic);
  const textured = createTexArrays();
  buildTexturedMesh(textured, mobs, performance.now());
  drawTextured(textured, view, projection, brightness(time));
}

function drawTextured(arrays, view, projection, light) {
  if (arrays.positions.length === 0) return;
  gl.useProgram(texProgram);
  gl.uniformMatrix4fv(texViewProjectionLocation, false, multiply4(projection, view));
  gl.uniform1f(texBrightnessLocation, light);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, mobTexture);
  gl.uniform1i(texAtlasLocation, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, texPositionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arrays.positions), gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(texPositionLocation);
  gl.vertexAttribPointer(texPositionLocation, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, texUvBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arrays.uvs), gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(texUvLocation);
  gl.vertexAttribPointer(texUvLocation, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, texShadeBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arrays.shades), gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(texShadeLocation);
  gl.vertexAttribPointer(texShadeLocation, 1, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, arrays.positions.length / 3);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

function renderSession() {
  const { player } = session;
  const eye = [player.x, player.y + EYE_HEIGHT, player.z];
  const direction = cameraDirection(player);
  const sprintKick = session.currentSprinting && options.fovKick ? 8 : 0;
  const targetFov = options.fov + sprintKick + (player.flying ? 4 : 0);
  renderScene(eye, direction, session.time, session.mobs, session.particles,
    session.currentTarget, targetFov);
}

let preview = null;
let previewAngle = 0.6;
let previewTime = 0.08;

function renderPreview(dt) {
  previewAngle += dt * 0.045;
  previewTime = (previewTime + dt / DAY_LENGTH) % 1;
  const cx = preview.width / 2;
  const cz = preview.depth / 2;
  const eye = [cx + Math.cos(previewAngle) * 22, 15, cz + Math.sin(previewAngle) * 22];
  const center = [cx, 7, cz];
  const direction = normalize([center[0] - eye[0], center[1] - eye[1], center[2] - eye[2]]);
  renderScene(eye, direction, previewTime, [], [], null, 70);
}

async function buildPreview() {
  const seed = World.default_seed();
  const width = asNumber(World.width());
  const depth = asNumber(World.depth());
  const maxY = asNumber(World.max_y());
  const store = createWorldState(width, depth, maxY);
  for (let y = 0; y < maxY; y += 1) {
    for (let z = 0; z < depth; z += 1) {
      for (let x = 0; x < width; x += 1) {
        store.setBlock(x, y, z, asNumber(World.block(seed, BigInt(x), BigInt(y), BigInt(z))));
      }
    }
  }
  preview = { world: store, width, depth, maxY };
  if (!session) uploadStaticMesh(buildVoxelMesh(store, width, depth, maxY));
}

function drawOutline(view, projection) {
  const target = session.currentTarget;
  if (!target) return;
  const [x, y, z] = target.hit;
  const positions = [];
  const colors = [];
  const grow = 0.002;
  for (const edge of OUTLINE_EDGES) {
    positions.push(
      x + edge[0] - grow, y + edge[1] - grow, z + edge[2] - grow,
      x + edge[3] + grow, y + edge[4] + grow, z + edge[5] + grow,
    );
    colors.push(0, 0, 0, 0, 0, 0);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, outlinePositionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, outlineColorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.DYNAMIC_DRAW);
  gl.uniformMatrix4fv(viewProjectionLocation, false, multiply4(projection, view));
  gl.bindBuffer(gl.ARRAY_BUFFER, outlinePositionBuffer);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, outlineColorBuffer);
  gl.enableVertexAttribArray(colorLocation);
  gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.LINES, 0, positions.length / 3);
}

function updateLockHint() {
  lockHintEl.textContent = document.pointerLockElement === canvas
    ? "Press Esc to open the menu"
    : "Click to capture the mouse";
}

function tickSession(dt) {
  const { world, player, survival, config, spawnCell, spawnHeight, held } = session;
  session.time = advanceTime(session.time, dt);
  session.elapsed += dt;
  const daylight = isDay(session.time);
  const step = movePlayer(world, player, held, dt, spawnCell, spawnHeight);
  session.currentSprinting = step.sprinting;

  if (step.moved > 0) {
    session.stats.walked += step.moved;
    if (config.mode !== GAME_MODES.CREATIVE && config.difficulty !== DIFFICULTIES.PEACEFUL) {
      addExhaustion(survival, step.moved * (step.sprinting ? 0.35 : 0.08), config.mode);
    }
    if (player.grounded) {
      session.stepAcc += step.moved;
      const stride = step.sprinting ? 3 : 2.2;
      if (session.stepAcc >= stride) {
        session.stepAcc = 0;
        playTone("step");
      }
    }
  }

  if (step.landed && step.fallDistance > 0) {
    if (step.fallDistance > 1) {
      spawnParticles(player.x, player.y + 0.1, player.z, [0.6, 0.57, 0.5], 8, 1.8);
      playTone("land");
    }
    if (takesDamage(config.mode)) {
      const damage = fallDamage(step.fallDistance);
      if (damage > 0) hurtPlayer(damage, "fall");
    }
  }
  if (step.voidFell && takesDamage(config.mode)) {
    hurtPlayer(VOID_DAMAGE, "void");
  }

  if (takesDamage(config.mode)) {
    const rate = config.difficulty === DIFFICULTIES.PEACEFUL ? 3 : 1;
    const events = survivalTick(survival, dt * rate, config.mode);
    if (events.healed > 0) renderVitals();
    if (events.starved > 0) {
      flashDamage();
      playTone("hurt");
      renderVitals();
      if (isDead(survival)) onDeath("starve");
    }
    if (config.difficulty === DIFFICULTIES.PEACEFUL && survival.hunger < 20) {
      survival.hunger = Math.min(20, survival.hunger + dt * 2);
    }
  }

  if (session.respawnGrace > 0) session.respawnGrace -= dt;
  session.stats.time += dt;
  session.saveTimer += dt;
  if (session.saveTimer > 10) {
    session.saveTimer = 0;
    saveSession();
  }

  tickMobs(dt, daylight);
  updateParticles(dt);

  session.currentTarget = raycast(world, player);
  updateHud();
  if (Math.floor(session.stats.time * 2) !== Math.floor((session.stats.time - dt) * 2)) {
    renderVitals();
  }
}

function tickMobs(dt, daylight) {
  const { world, player, config, spawnCell, spawnHeight } = session;
  const hostile = config.mode !== GAME_MODES.CREATIVE;
  const playerPos = { x: player.x, z: player.z };
  const survivors = [];
  for (const mob of session.mobs) {
    const events = tickMob(world, mob, playerPos, dt, {
      isDay: daylight,
      hostile,
      spawnCell,
      spawnHeight,
    });
    if (events.removed && !events.died) continue;
    if (events.died) {
      killMob(mob);
      continue;
    }
    if (events.attacked > 0) hurtPlayer(events.attacked, "mob");
    if (events.burned > 0) {
      spawnParticles(mob.x, mob.y + 1, mob.z, [1, 0.5, 0.1], 3, 1.2, 0.1, 0.4);
      if (Math.random() < 0.1) playTone("burn");
    }
    survivors.push(mob);
  }
  session.mobs = survivors;

  // Peaceful worlds stay free of monsters.
  if (config.difficulty === DIFFICULTIES.PEACEFUL) {
    if (session.mobs.some((mob) => mob.kind === "zombie")) {
      for (const mob of session.mobs) {
        if (mob.kind === "zombie") spawnParticles(mob.x, mob.y + 0.7, mob.z, [0.9, 0.9, 0.9], 6, 1.5);
      }
      session.mobs = session.mobs.filter((mob) => mob.kind !== "zombie");
    }
    return;
  }
  session.pigTimer += dt;
  if (session.pigTimer > 15 && daylight) {
    session.pigTimer = 0;
    spawnMob("pig", 10, 20);
  }
  session.zombieTimer += dt;
  if (session.zombieTimer > 6 && !daylight && hostile) {
    session.zombieTimer = 0;
    spawnMob("zombie", 12, 24);
  }
}

// --- Menu actions ---

const pointerLock = createPointerLockController(
  () => document.pointerLockElement === canvas,
  () => canvas.requestPointerLock(),
);

function openPause() {
  if (!session || screen !== "playing") return;
  saveSession();
  pauseInfoEl.textContent =
    `${session.config.name} · ${MODE_NAMES[session.config.mode]} · ${DIFFICULTY_NAMES[session.config.difficulty]} · seed ${seedLabel(session.config.seed)}`;
  showScreen("pause");
}

function quitToTitle() {
  saveSession();
  session = null;
  window.__bend2craft = undefined;
  if (preview) {
    uploadStaticMesh(buildVoxelMesh(preview.world, preview.width, preview.depth, preview.maxY));
  }
  renderWorldList();
  showScreen("title");
}

function playSelectedWorld() {
  const saved = selectedWorldId ? findWorld(selectedWorldId) : null;
  if (!saved) {
    toast("Select a world first, or create a new one.");
    return;
  }
  const config = {
    name: saved.name,
    seedText: saved.seedText ?? saved.seed ?? "",
    seed: seedFromSearch(`?seed=${encodeURIComponent(saved.seedText ?? saved.seed ?? "")}`, World.default_seed()),
    mode: saved.mode,
    difficulty: saved.difficulty,
  };
  playTone("click");
  void startSession(config, saved).catch(showError);
}

function confirmCreateWorld() {
  const name = worldNameInput.value.trim() || DEFAULT_WORLD_NAME;
  const seedText = seedInput.value.trim() || randomSeedText();
  const config = createWorldConfig({
    name,
    seedText,
    mode: draftConfig.mode,
    difficulty: draftConfig.difficulty,
  });
  const errors = validateWorldConfig(config);
  if (errors.length > 0) {
    createErrorEl.textContent = errors.join(" ");
    createErrorEl.hidden = false;
    return;
  }
  createErrorEl.hidden = true;
  playTone("click");
  void startSession({ ...config, seed: resolveSeed(config.seedText) }).catch(showError);
}

function handleAction(action) {
  playTone("click");
  switch (action) {
    case "singleplayer":
      renderWorldList();
      showScreen("worlds");
      break;
    case "options":
      optionsReturn = screen === "pause" ? "pause" : "title";
      renderOptionsMenu();
      showScreen("options");
      break;
    case "help":
      showScreen("help");
      break;
    case "help-done":
      showScreen("title");
      break;
    case "back-title":
      showScreen("title");
      break;
    case "back-worlds":
      renderWorldList();
      showScreen("worlds");
      break;
    case "create":
      draftConfig = createWorldConfig({ mode: GAME_MODES.SURVIVAL, difficulty: DIFFICULTIES.NORMAL });
      worldNameInput.value = "";
      if (!seedInput.value) seedInput.value = "";
      renderCreateMenu();
      showScreen("create");
      break;
    case "random-seed":
      seedInput.value = randomSeedText();
      break;
    case "cycle-mode": {
      const keepSeed = seedInput.value;
      const keepName = worldNameInput.value;
      draftConfig = createWorldConfig({
        name: keepName,
        seedText: keepSeed,
        mode: cycleMode(draftConfig.mode),
        difficulty: draftConfig.difficulty,
      });
      renderCreateMenu();
      break;
    }
    case "cycle-difficulty":
      draftConfig = createWorldConfig({
        name: worldNameInput.value,
        seedText: seedInput.value,
        mode: draftConfig.mode,
        difficulty: cycleDifficulty(draftConfig.difficulty),
      });
      renderCreateMenu();
      break;
    case "confirm-create":
      confirmCreateWorld();
      break;
    case "play":
      playSelectedWorld();
      break;
    case "delete": {
      if (!selectedWorldId) {
        toast("Nothing to delete.");
        break;
      }
      const worlds = loadWorlds().filter((world) => world.id !== selectedWorldId);
      persistWorlds(worlds);
      selectedWorldId = null;
      renderWorldList();
      toast("World deleted.");
      break;
    }
    case "toggle-coords":
      options.showCoords = !options.showCoords;
      saveOptions();
      break;
    case "toggle-sound":
      options.sound = !options.sound;
      saveOptions();
      break;
    case "toggle-fovkick":
      options.fovKick = !options.fovKick;
      saveOptions();
      break;
    case "reset-options":
      options = createDefaultOptions();
      saveOptions();
      break;
    case "options-done":
      saveOptions();
      showScreen(optionsReturn === "pause" && session ? "pause" : "title");
      break;
    case "resume":
      showScreen("playing");
      pointerLock.request();
      break;
    case "pause-options":
      optionsReturn = "pause";
      renderOptionsMenu();
      showScreen("options");
      break;
    case "respawn-pause":
    case "respawn":
      respawn();
      break;
    case "quit-title":
      quitToTitle();
      break;
    case "death-title":
      quitToTitle();
      break;
    default:
      break;
  }
}

// --- Boot ---

try {
  setupGL();
  currentFov = options.fov;

  const presetSeed = new URLSearchParams(window.location.search).get("seed")?.trim();
  if (presetSeed) seedInput.value = presetSeed;

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleAction(button.dataset.action));
  });
  worldListEl.addEventListener("click", (event) => {
    const item = event.target.closest("[data-world]");
    if (!item) return;
    selectedWorldId = item.dataset.world;
    renderWorldList();
  });
  worldListEl.addEventListener("dblclick", () => playSelectedWorld());
  fovInput.addEventListener("input", () => {
    options.fov = Number(fovInput.value);
    fovValue.textContent = fovInput.value;
  });
  fovInput.addEventListener("change", saveOptions);
  sensitivityInput.addEventListener("input", () => {
    options.sensitivity = Number(sensitivityInput.value);
    sensitivityValue.textContent = Number(sensitivityInput.value).toFixed(1);
  });
  sensitivityInput.addEventListener("change", saveOptions);

  hotbarEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-slot]");
    if (button !== null) selectSlot(Number(button.dataset.slot));
  });
  canvas.addEventListener("click", () => {
    if (screen === "playing") pointerLock.request();
  });
  canvas.addEventListener("mousedown", (event) => {
    event.preventDefault();
    if (screen !== "playing" || !session) return;
    if (document.pointerLockElement !== canvas) {
      pointerLock.request();
      return;
    }
    interact(event.button);
  });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  document.addEventListener("pointerlockchange", () => {
    pointerLock.handleChange();
    updateLockHint();
    if (document.pointerLockElement !== canvas && screen === "playing" && session && !isDead(session.survival)) {
      openPause();
    }
  });
  document.addEventListener("mousemove", (event) => {
    if (document.pointerLockElement !== canvas || !session || screen !== "playing") return;
    const scale = 0.0022 * options.sensitivity;
    session.player.yaw += event.movementX * scale;
    session.player.pitch = Math.max(-1.45, Math.min(1.45, session.player.pitch - event.movementY * scale));
  });
  window.addEventListener("keydown", (event) => {
    if (!session || screen !== "playing") return;
    const now = performance.now();
    if (["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight"].includes(event.code)) {
      event.preventDefault();
      if (event.code === "KeyW" && !event.repeat) {
        if (now - session.lastWtap < 280) session.held.add("Sprint");
        session.lastWtap = now;
      }
      if (event.code === "Space" && !event.repeat && session.config.mode === GAME_MODES.CREATIVE) {
        if (now - session.lastSpacetap < 280) {
          session.player.flying = !session.player.flying;
          session.player.velocityY = 0;
          toast(session.player.flying ? "Flying enabled." : "Flying disabled.");
          updateHud();
        }
        session.lastSpacetap = now;
      }
      session.held.add(event.code);
    }
    if (event.code === "Space" && session.player.grounded && !session.player.flying) {
      session.player.velocityY = JUMP_SPEED;
      session.player.grounded = false;
      if (session.config.mode !== GAME_MODES.CREATIVE && session.config.difficulty !== DIFFICULTIES.PEACEFUL) {
        addExhaustion(session.survival, session.held.has("Sprint") || isSprinting(session.held) ? 0.6 : 0.25, session.config.mode);
      }
    }
    if (event.code === "KeyE") eatSelected();
    const slot = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9"].indexOf(event.code);
    if (slot !== -1) selectSlot(slot);
  });
  window.addEventListener("keyup", (event) => {
    if (!session) return;
    session.held.delete(event.code);
    if (event.code === "KeyW") session.held.delete("Sprint");
  });
  window.addEventListener("resize", () => {
    if (gl) resizeCanvas();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && screen === "playing") openPause();
  });

  renderWorldList();
  renderCreateMenu();
  renderOptionsMenu();
  showScreen("title");
  void buildPreview().catch(showError);

  let previousTime = performance.now();
  function frame(now) {
    const dt = Math.min((now - previousTime) / 1000, 0.05);
    previousTime = now;
    if (session && (screen === "playing" || screen === "pause" || screen === "death")) {
      if (screen === "playing" && !isDead(session.survival)) tickSession(dt);
      renderSession();
    } else if (preview) {
      renderPreview(dt);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
} catch (error) {
  showError(error);
}
