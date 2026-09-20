import World from "../world/world.bend";
import WorldState from "../world/world_state.bend";
import Structures from "../world/structures.bend";
import Horizon from "../world/horizon.bend";
import Light from "../world/light.bend";
import LightDirty from "../world/light-dirty.bend";
import Entities from "../world/entities.bend";
import Villagers from "../world/villagers.bend";
import Furnace from "../world/furnace.bend";
import Furnaces from "../world/furnaces.bend";
import Simulation from "../world/simulation.bend";
import Crops from "../world/crops.bend";
import Farmland from "../world/farmland.bend";
import {
  HOTBAR_SIZE,
  RECIPES,
  blockForItem,
  canPlaceBlock,
  canCraft,
  collectItem,
  consume,
  createInventory,
  craft,
  foodValue,
  itemColor,
  itemId,
  itemName,
  itemNameFromId,
  mineDrop,
  moveItem,
  selectedItem,
  tradeInventory,
  useTool,
} from "./inventory.js";
import {
  EYE_HEIGHT,
  applyDamage,
  cameraDirection,
  clampPlayer,
  createPlayer,
  eatFood,
  movePlayer,
  overlapsPlayer,
  raycast,
} from "./game-state.js";
import { createChunkedWorld } from "./chunk-world.js";
import { quadCorners } from "./greedy-mesh.js";
import { createChunkMeshCache } from "./mesh-cache.js";
import { atlasUV, createTextureAtlas } from "./texture-atlas.js";
import { drawItemTexture, itemTexture } from "./item-atlas.js";
import { characterRenderDescriptor, heldItemPose } from "./character-view.js";
import { decodeSave, encodeSave } from "./save-state.js";
import { packEntityState, restoreEntities, restoreVillagers } from "./entity-save.js";
import { createFixedTicker } from "./simulation-ticker.js";
import { createColumnHeightCache } from "./drop-ground-cache.js";
import { buildChunkBuckets, concatBendLists } from "./entity-chunks.js";
import { seedFromSearch, seedLabel } from "./seed.js";
import { createPointerLockController } from "./pointer-lock.js";

const canvas = document.getElementById("game");
const coordsEl = document.getElementById("coords");
const seedEl = document.getElementById("seed");
const selectedEl = document.getElementById("selected");
const statsEl = document.getElementById("stats");
const hotbarEl = document.getElementById("hotbar-slots");
const heldItemViewEl = document.getElementById("held-item-view");
const heldItemCanvasEl = document.getElementById("held-item-canvas");
const heldItemLabelEl = document.getElementById("held-item-label");
const inventoryToggleEl = document.getElementById("inventory-toggle");
const furnaceToggleEl = document.getElementById("furnace-toggle");
const inventoryPanelEl = document.getElementById("inventory-panel");
const furnacePanelEl = document.getElementById("furnace-panel");
const inventorySlotsEl = document.getElementById("inventory-slots");
const recipeListEl = document.getElementById("recipe-list");
const inventoryMessageEl = document.getElementById("inventory-message");
const furnaceStatusEl = document.getElementById("furnace-status");
const lockHintEl = document.getElementById("lock-hint");
const helpEl = document.getElementById("help");
const errorEl = document.getElementById("error");
const SEED = seedFromSearch(window.location.search, World.default_seed());
const SAVE_KEY = `bend2craft-save-${seedLabel(SEED)}`;
const pointerLock = createPointerLockController(
  () => document.pointerLockElement === canvas,
  () => canvas.requestPointerLock(),
);

const BLOCK_COLORS = {
  1: [0.34, 0.38, 0.42],
  2: [0.53, 0.34, 0.2],
  3: [0.35, 0.72, 0.28],
  4: [0.18, 0.55, 0.26],
  5: [0.55, 0.34, 0.18],
  6: [0.82, 0.7, 0.4],
  7: [0.16, 0.5, 0.82],
  8: [0.12, 0.13, 0.15],
  9: [0.62, 0.38, 0.3],
  10: [0.2, 0.8, 0.78],
  11: [0.28, 0.3, 0.34],
  12: [1.0, 0.62, 0.16],
  13: [0.78, 0.25, 0.38],
  14: [0.55, 0.32, 0.18],
  15: [0.72, 0.48, 0.3],
  16: [0.34, 0.62, 0.2],
  17: [0.55, 0.72, 0.24],
  18: [0.78, 0.68, 0.2],
  19: [0.92, 0.76, 0.24],
  20: [0.32, 0.24, 0.16],
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

function asNumber(value) {
  return Number(value);
}

function showError(error) {
  const message = error instanceof Error ? error.message : String(error);
  errorEl.textContent = `Could not start the world.\n${message}`;
  errorEl.hidden = false;
  throw error;
}

let gl;
let program;
let positionBuffer;
let colorBuffer;
let uvBuffer;
let dynamicPositionBuffer;
let dynamicColorBuffer;
let dynamicUvBuffer;
let positionLocation;
let colorLocation;
let uvLocation;
let viewProjectionLocation;
let cameraLocation;
let skyColorLocation;
let atlasLocation;
let terrainVertexCount = 0;
let dynamicVertexCount = 0;
let terrainQuadCount = 0;
let dynamicQuadCount = 0;
let horizonMesh = { positions: [], colors: [], uvs: [], quadCount: 0 };
let visibleFaceCount = 0;
let daylight = 1;
let worldTime = 0;

try {
  gl = canvas.getContext("webgl", { antialias: false, alpha: false });
  if (!gl) throw new Error("WebGL is not available in this browser.");

  let savedGame = null;
  try {
    const saved = window.localStorage.getItem(SAVE_KEY);
    savedGame = saved === null ? null : decodeSave(saved);
  } catch {
    savedGame = null;
  }

  const lightSourceFieldCache = new Map();
  const sourceFieldKey = (source) => `${source.x},${source.y},${source.z},${source.block}`;
  const invalidateLightFields = (x, y, z, previousBlock, value) => {
    if (previousBlock === 12 || value === 12) {
      lightSourceFieldCache.delete(`${BigInt(x)},${BigInt(y)},${BigInt(z)},12`);
    } else {
      lightSourceFieldCache.clear();
    }
  };
  const generateLightCells = (cells, edits) => {
    const sources = WorldState.torches(edits);
    let fields = { $: "Nil" };
    for (let node = sources; node?.$ === "Con"; node = node.tail) {
      const source = node.head;
      const key = sourceFieldKey(source);
      let own = lightSourceFieldCache.get(key);
      if (own === undefined) {
        own = Light.source_fields_one(source, SEED);
        lightSourceFieldCache.set(key, own);
      }
      fields = Light.append_fields(own, fields);
    }
    return Light.patch_fields(fields, SEED, cells);
  };

  const MAX_Y = asNumber(World.max_y());
  const CHUNK_SIZE = asNumber(World.chunk_size());
  const CHUNK_RENDER_RADIUS = 2;
  const GENERATION_CHUNK_OFFSET = 1_000_000;
  const generationChunkCoordinate = (chunk) => chunk < 0
    ? GENERATION_CHUNK_OFFSET + (-chunk)
    : chunk;
  const storageCoordinate = (value) => {
    if (value >= 0) return value;
    const chunk = Math.floor(value / CHUNK_SIZE);
    const local = value - chunk * CHUNK_SIZE;
    return (GENERATION_CHUNK_OFFSET + (-chunk)) * CHUNK_SIZE + local;
  };
  let world;
  let terrainMeshCache;
  let workerRequestId = 0;
  let workerRequestCount = 0;
  let workerResponseCount = 0;
  let workerHydrateCount = 0;
  let workerRejectCount = 0;
  const chunkWorker = new Worker("/chunk-worker.js", { type: "module" });
  chunkWorker.onmessage = (event) => {
    workerResponseCount += 1;
    const { chunkX, chunkZ, blocks, lights, version, error } = event.data;
    if (error !== undefined) {
      showError(new Error(`Chunk ${chunkX},${chunkZ} failed: ${error}`));
      return;
    }
    if (world.hydrateChunk(chunkX, chunkZ, blocks, lights, version)) {
      dropGroundCache?.clear();
      workerHydrateCount += 1;
      const ready = world.loadAround(player.x, player.z);
      if (ready.changed) {
        rebuildHorizon();
        rebuildMesh(false);
      }
    } else {
      workerRejectCount += 1;
    }
  };
  chunkWorker.onerror = (event) => showError(new Error(event.message || "Chunk worker failed."));
  world = createChunkedWorld({
    chunkSize: CHUNK_SIZE,
    maxY: MAX_Y,
    renderRadius: CHUNK_RENDER_RADIUS,
    loadBudget: 1,
    initialEdits: savedGame?.edits?.$ === "Nil" || savedGame?.edits?.$ === "Con"
      ? savedGame.edits
      : WorldState.empty(),
    generateChunk: (chunkX, chunkZ, edits) => WorldState.chunk(
      SEED,
      BigInt(generationChunkCoordinate(chunkX)),
      BigInt(generationChunkCoordinate(chunkZ)),
      edits,
    ),
    generateLightChunk: (chunkX, chunkZ, edits) => Light.chunk(
      WorldState.torches(edits),
      SEED,
      BigInt(generationChunkCoordinate(chunkX)),
      BigInt(generationChunkCoordinate(chunkZ)),
    ),
    generateLightCells,
    affectedLightChunks: (x, z, chunkSize) => LightDirty.chunks(BigInt(x), BigInt(z), BigInt(chunkSize)),
    affectedLightCells: (x, y, z) => LightDirty.cells_plane(BigInt(x), BigInt(y), BigInt(z)),
    invalidateLightFields,
    requestChunk: (chunkX, chunkZ, edits, version) => {
      workerRequestCount += 1;
      chunkWorker.postMessage({
        id: workerRequestId += 1,
        version,
        seed: SEED,
        chunkX,
        chunkZ,
        generationChunkX: generationChunkCoordinate(chunkX),
        generationChunkZ: generationChunkCoordinate(chunkZ),
        edits,
      });
    },
    applyEdit: (edits, x, y, z, value) => WorldState.set(
      edits,
      BigInt(storageCoordinate(x)),
      BigInt(y),
      BigInt(storageCoordinate(z)),
      value,
    ),
  });
  const { inside, blockAt, lightAt, setBlock: rawSetBlock } = world;
  let dropGroundCache = null;
  const setBlock = (x, y, z, value) => {
    dropGroundCache?.invalidate(Math.floor(x), Math.floor(z));
    return rawSetBlock(x, y, z, value);
  };
  let simulationState = savedGame?.simulation?.$ === "Simulation"
    && savedGame.simulation.crops?.$ === "State"
    && savedGame.simulation.farmland?.$ === "State"
    ? savedGame.simulation
    : Simulation.empty();
  let cropState = savedGame?.crops?.$ === "State"
    ? savedGame.crops
    : Simulation.sim_crops(simulationState);
  let farmlandState = savedGame?.farmland?.$ === "State"
    ? savedGame.farmland
    : Simulation.sim_farmland(simulationState);
  simulationState = Simulation.with_crops(simulationState, cropState);
  simulationState = Simulation.with_farmland(simulationState, farmlandState);
  world.pinChunk(
    Number(Structures.village_origin_x(SEED)) / CHUNK_SIZE | 0,
    Number(Structures.village_origin_z(SEED)) / CHUNK_SIZE | 0,
  );
  simulationState = Simulation.pin(
    simulationState,
    BigInt(Number(Structures.village_origin_x(SEED)) / CHUNK_SIZE | 0),
    BigInt(Number(Structures.village_origin_z(SEED)) / CHUNK_SIZE | 0),
  );

  let blockCount = 0;

  const vertexSource = `
    attribute vec3 aPosition;
    attribute vec3 aColor;
    attribute vec2 aUV;
    uniform mat4 uViewProjection;
    uniform vec3 uCamera;
    varying vec3 vColor;
    varying vec2 vUV;
    varying float vFog;
    void main() {
      vColor = aColor;
      vUV = aUV;
      vFog = clamp((distance(aPosition, uCamera) - 24.0) / 72.0, 0.0, 1.0);
      gl_Position = uViewProjection * vec4(aPosition, 1.0);
    }
  `;
  const fragmentSource = `
    precision mediump float;
    varying vec3 vColor;
    varying vec2 vUV;
    varying float vFog;
    uniform vec3 uSkyColor;
    uniform sampler2D uAtlas;
    void main() {
      vec4 textureColor = texture2D(uAtlas, vUV);
      gl_FragColor = vec4(mix(vColor * textureColor.rgb, uSkyColor, vFog), textureColor.a);
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
  uvBuffer = gl.createBuffer();
  dynamicPositionBuffer = gl.createBuffer();
  dynamicColorBuffer = gl.createBuffer();
  dynamicUvBuffer = gl.createBuffer();
  positionLocation = gl.getAttribLocation(program, "aPosition");
  colorLocation = gl.getAttribLocation(program, "aColor");
  uvLocation = gl.getAttribLocation(program, "aUV");
  viewProjectionLocation = gl.getUniformLocation(program, "uViewProjection");
  cameraLocation = gl.getUniformLocation(program, "uCamera");
  skyColorLocation = gl.getUniformLocation(program, "uSkyColor");
  atlasLocation = gl.getUniformLocation(program, "uAtlas");
  const atlasTexture = createTextureAtlas(gl, BLOCK_COLORS);
  gl.useProgram(program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
  gl.uniform1i(atlasLocation, 0);

  function blockColor(block, faceIndex, x, z, light = 15) {
    const base = BLOCK_COLORS[block] ?? [1, 0, 1];
    const variation = ((x * 17 + z * 31) % 5) * 0.012;
    const top = block === 3 && faceIndex === 0;
    const shade = FACE_SHADES[faceIndex] + (top ? variation : variation * 0.5);
    const lightFactor = 0.35 + 0.65 * Math.max(0, Math.min(15, light)) / 15;
    return base.map((channel) => Math.min(1, channel * shade * daylight * lightFactor));
  }

  let horizonCenterKey = null;
  function rebuildHorizon() {
    const centerChunkX = Math.floor(player.x / CHUNK_SIZE);
    const centerChunkZ = Math.floor(player.z / CHUNK_SIZE);
    const key = `${centerChunkX},${centerChunkZ}`;
    if (key === horizonCenterKey) return;
    horizonCenterKey = key;
    const step = 4;
    const radius = 128;
    const columns = 65;
    const minX = Math.floor(player.x) - radius;
    const minZ = Math.floor(player.z) - radius;
    const sampleMinX = Math.max(0, minX);
    const sampleMinZ = Math.max(0, minZ);
    const surfaces = Horizon.surface_grid(SEED, BigInt(sampleMinX), BigInt(sampleMinZ), BigInt(columns), BigInt(columns), BigInt(step));
    const positions = [];
    const colors = [];
    const uvs = [];
    let quadCount = 0;
    const innerRadius = CHUNK_RENDER_RADIUS * CHUNK_SIZE + step;
    for (let z = 0; z < columns - 1; z += 1) {
      for (let x = 0; x < columns - 1; x += 1) {
        const globalX = minX + x * step;
        const globalZ = minZ + z * step;
        const centerDistance = Math.hypot(globalX + step / 2 - player.x, globalZ + step / 2 - player.z);
        if (centerDistance <= innerRadius) continue;
        const encodedSurface = Number(surfaces[x + columns * z]);
        const water = encodedSurface >= 32;
        const height = water ? encodedSurface - 32 : encodedSurface;
        const corners = [
          [globalX, height, globalZ],
          [globalX + step, height, globalZ],
          [globalX + step, height, globalZ + step],
          [globalX, height, globalZ + step],
        ];
        const tile = water ? 7 : 3;
        const color = blockColor(tile, 0, globalX, globalZ, 15);
        const uv = atlasUV(tile);
        for (const cornerIndex of [0, 1, 2, 0, 2, 3]) {
          const corner = corners[cornerIndex];
          positions.push(corner[0], corner[1], corner[2]);
          colors.push(color[0], color[1], color[2]);
          uvs.push(uv[cornerIndex * 2], uv[cornerIndex * 2 + 1]);
        }
        quadCount += 1;
      }
    }
    horizonMesh = { positions, colors, uvs, quadCount };
  }

  function appendUV(uvs, tile, cornerIndex) {
    const uv = atlasUV(tile);
    uvs.push(uv[cornerIndex * 2], uv[cornerIndex * 2 + 1]);
  }

  function appendMobCube(positions, colors, uvs, mob) {
    const base = mob.kind === 2 ? [0.72, 0.16, 0.14] : [0.92, 0.92, 0.82];
    const tile = mob.kind === 2 ? 9 : 4;
    const scale = [0.72, 1.0, 0.72];
    for (let faceIndex = 0; faceIndex < FACES.length; faceIndex += 1) {
      const color = base.map((channel) => channel * FACE_SHADES[faceIndex] * daylight);
      for (const cornerIndex of [0, 1, 2, 0, 2, 3]) {
        const corner = FACES[faceIndex].corners[cornerIndex];
        positions.push(
          mob.x + (corner[0] - 0.5) * scale[0],
          mob.y + corner[1] * scale[1],
          mob.z + (corner[2] - 0.5) * scale[2],
        );
        colors.push(color[0], color[1], color[2]);
        appendUV(uvs, tile, cornerIndex);
      }
    }
  }

  function appendVillagerCube(positions, colors, uvs, villager) {
    const base = villager.profession === 2 ? [0.24, 0.52, 0.32] : [0.66, 0.46, 0.24];
    const scale = [0.62, 1.35, 0.62];
    for (let faceIndex = 0; faceIndex < FACES.length; faceIndex += 1) {
      const color = base.map((channel) => channel * FACE_SHADES[faceIndex] * daylight);
      for (const cornerIndex of [0, 1, 2, 0, 2, 3]) {
        const corner = FACES[faceIndex].corners[cornerIndex];
        positions.push(
          villager.x + (corner[0] - 0.5) * scale[0],
          villager.y + corner[1] * scale[1],
          villager.z + (corner[2] - 0.5) * scale[2],
        );
        colors.push(color[0], color[1], color[2]);
        appendUV(uvs, villager.profession === 2 ? 3 : 5, cornerIndex);
      }
    }
  }

  function appendDropCube(positions, colors, uvs, drop) {
    const base = drop.item === 12 ? [0.92, 0.9, 0.82] : [0.55, 0.22, 0.2];
    const tile = drop.item === 12 ? 4 : drop.item === 13 ? 9 : 1;
    const scale = [0.28, 0.28, 0.28];
    for (let faceIndex = 0; faceIndex < FACES.length; faceIndex += 1) {
      const color = base.map((channel) => channel * FACE_SHADES[faceIndex] * daylight);
      for (const cornerIndex of [0, 1, 2, 0, 2, 3]) {
        const corner = FACES[faceIndex].corners[cornerIndex];
        positions.push(
          drop.x + (corner[0] - 0.5) * scale[0],
          drop.y + corner[1] * scale[1],
          drop.z + (corner[2] - 0.5) * scale[2],
        );
        colors.push(color[0], color[1], color[2]);
        appendUV(uvs, tile, cornerIndex);
      }
    }
  }

  function rebuildDynamicMesh() {
    const positions = [];
    const colors = [];
    const uvs = [];
    for (const mob of mobs) {
      if (mob.alive) appendMobCube(positions, colors, uvs, mob);
    }
    for (const villager of villagers) appendVillagerCube(positions, colors, uvs, villager);
    for (const drop of drops) appendDropCube(positions, colors, uvs, drop);
    dynamicVertexCount = positions.length / 3;
    dynamicQuadCount = dynamicVertexCount / 6;
    gl.bindBuffer(gl.ARRAY_BUFFER, dynamicPositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, dynamicColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, dynamicUvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.DYNAMIC_DRAW);
    visibleFaceCount = terrainQuadCount + dynamicQuadCount;
    statsEl.textContent = `${blockCount} blocks · ${visibleFaceCount} faces · ${world.activeChunkCount()} chunks · ${mobs.filter((mob) => mob.alive).length} mobs · ${villagers.length} villagers · ${drops.length} drops`;
  }

  function rebuildMesh(merge = true) {
    const positions = [];
    const colors = [];
    const uvs = [];
    terrainMeshCache.rebuildDirty();
    const terrain = terrainMeshCache.snapshot(merge);
    blockCount = terrain.blockCount;
    terrainQuadCount = terrain.quads.length;

    for (const quad of terrain.quads) {
      const color = blockColor(quad.block, quad.faceIndex, quad.x, quad.z, quad.light);
      const corners = quadCorners(quad);
      const uv = atlasUV(quad.block);
      for (const cornerIndex of [0, 1, 2, 0, 2, 3]) {
        const corner = corners[cornerIndex];
        positions.push(corner[0], corner[1], corner[2]);
        colors.push(color[0], color[1], color[2]);
        uvs.push(uv[cornerIndex * 2], uv[cornerIndex * 2 + 1]);
      }
    }
    positions.push(...horizonMesh.positions);
    colors.push(...horizonMesh.colors);
    uvs.push(...horizonMesh.uvs);
    terrainQuadCount += horizonMesh.quadCount;
    terrainVertexCount = positions.length / 3;
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.DYNAMIC_DRAW);
    rebuildDynamicMesh();
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

  const spawnContract = World.spawn_cell(SEED);
  const spawnCell = [Number(spawnContract.x), Number(spawnContract.z)];
  const spawnHeight = Number(spawnContract.height);
  const player = createPlayer(spawnCell, spawnHeight);
  if (savedGame?.player !== null && typeof savedGame?.player === "object") {
    Object.assign(player, savedGame.player);
  }
  clampPlayer(player, Number(World.width()), Number(World.depth()));
  world.loadAround(spawnCell[0], spawnCell[1], undefined, 9);
  terrainMeshCache = createChunkMeshCache(world);
  const inventory = createInventory();
  if (Array.isArray(savedGame?.inventory) && savedGame.inventory.length === inventory.length) {
    inventory.splice(0, inventory.length, ...savedGame.inventory);
  }
  let selectedSlot = 0;
  let inventoryCursor = null;
  let inventoryOpen = false;
  let furnaceWorldState = Furnaces.empty();
  let activeFurnace = null;
  let furnaceOpen = false;
  const held = new Set();
  const restoredEntities = restoreEntities(savedGame, null, null);
  let mobDomainState = restoredEntities.mobs;
  let mobs = [];
  let villagerDomainState = restoreVillagers(savedGame, Villagers.spawn(SEED));
  let villagerPathGrid = Villagers.path_grid(SEED, world.getEdits());
  let villagers = [];
  let villagerTick = Number(savedGame?.villagerTick ?? 0);
  let dropDomainState = restoredEntities.drops;
  let drops = [];
  let simulationTerrainDirty = false;
  let simulationDynamicDirty = false;
  let playerStreamingDirty = false;
  let entityBucketStats = { mobBuckets: 0, activeMobBuckets: 0, dropBuckets: 0, activeDropBuckets: 0 };
  let moveFrameCalls = 0;
  let moveFrameActive = false;

  function invalidateVillagerPath(x, y, z) {
    if (x < 17 || x >= 45 || z < 19 || z >= 45 || y > 10) return;
    villagerPathGrid = Villagers.path_grid(SEED, world.getEdits());
  }

  function toggleDoorAt(x, y, z) {
    const current = blockAt(x, y, z);
    if (current !== 14 && current !== 15) return false;
    let bottom = y;
    if (bottom > 0 && (blockAt(x, bottom - 1, z) === 14 || blockAt(x, bottom - 1, z) === 15)) bottom -= 1;
    const next = current === 14 ? 15 : 14;
    if (bottom + 1 >= MAX_Y) return false;
    setBlock(x, bottom, z, next);
    setBlock(x, bottom + 1, z, next);
    invalidateVillagerPath(x, bottom, z);
    invalidateVillagerPath(x, bottom + 1, z);
    terrainMeshCache.invalidateBlock(x, z);
    return true;
  }

  function pinStoredFurnaces() {
    for (let node = Furnaces.entries(furnaceWorldState); node?.$ === "Con"; node = node.tail) {
      world.pinChunk(
        Math.floor(Number(node.head.x) / CHUNK_SIZE),
        Math.floor(Number(node.head.z) / CHUNK_SIZE),
      );
      simulationState = Simulation.pin(
        simulationState,
        BigInt(Math.floor(Number(node.head.x) / CHUNK_SIZE)),
        BigInt(Math.floor(Number(node.head.z) / CHUNK_SIZE)),
      );
    }
  }

  function hasFurnaceInChunk(chunkX, chunkZ) {
    for (let node = Furnaces.entries(furnaceWorldState); node?.$ === "Con"; node = node.tail) {
      if (Math.floor(Number(node.head.x) / CHUNK_SIZE) === chunkX && Math.floor(Number(node.head.z) / CHUNK_SIZE) === chunkZ) return true;
    }
    return false;
  }

  function pinStoredCrops() {
    for (let node = Crops.entries(cropState); node?.$ === "Con"; node = node.tail) {
      pinCropChunk(Number(node.head.x), Number(node.head.z));
    }
  }

  function pinStoredFarmland() {
    for (let node = Farmland.entries(farmlandState); node?.$ === "Con"; node = node.tail) {
      pinCropChunk(Number(node.head.x), Number(node.head.z));
    }
  }

  function hasCropInChunk(chunkX, chunkZ) {
    for (let node = Crops.entries(cropState); node?.$ === "Con"; node = node.tail) {
      if (Math.floor(Number(node.head.x) / CHUNK_SIZE) === chunkX && Math.floor(Number(node.head.z) / CHUNK_SIZE) === chunkZ) return true;
    }
    return false;
  }

  function hasFarmlandInChunk(chunkX, chunkZ) {
    for (let node = Farmland.entries(farmlandState); node?.$ === "Con"; node = node.tail) {
      if (Math.floor(Number(node.head.x) / CHUNK_SIZE) === chunkX && Math.floor(Number(node.head.z) / CHUNK_SIZE) === chunkZ) return true;
    }
    return false;
  }

  function pinCropChunk(x, z) {
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkZ = Math.floor(z / CHUNK_SIZE);
    world.pinChunk(chunkX, chunkZ);
    simulationState = Simulation.pin(simulationState, BigInt(chunkX), BigInt(chunkZ));
  }

  function releaseUnusedSimulationChunk(chunkX, chunkZ) {
    const villageChunkX = Math.floor(Number(Structures.village_origin_x(SEED)) / CHUNK_SIZE);
    const villageChunkZ = Math.floor(Number(Structures.village_origin_z(SEED)) / CHUNK_SIZE);
    if (chunkX === villageChunkX && chunkZ === villageChunkZ) return;
    if (hasFurnaceInChunk(chunkX, chunkZ) || hasCropInChunk(chunkX, chunkZ) || hasFarmlandInChunk(chunkX, chunkZ)) return;
    world.unpinChunk(chunkX, chunkZ);
    simulationState = Simulation.unpin(simulationState, BigInt(chunkX), BigInt(chunkZ));
  }

  function syncCropBlocks() {
    let changed = false;
    for (let node = Crops.entries(cropState); node?.$ === "Con"; node = node.tail) {
      const crop = node.head;
      const x = Number(crop.x);
      const y = Number(crop.y);
      const z = Number(crop.z);
      const block = Number(Crops.crop_block(crop));
      if (Number(blockAt(x, y, z) ?? 0) === block) continue;
      setBlock(x, y, z, block);
      terrainMeshCache.invalidateBlock(x, z);
      changed = true;
    }
    return changed;
  }

  function syncFarmlandBlocks() {
    let changed = false;
    for (let node = Farmland.entries(farmlandState); node?.$ === "Con"; node = node.tail) {
      const plot = node.head;
      const x = Number(plot.x);
      const y = Number(plot.y);
      const z = Number(plot.z);
      if (Number(blockAt(x, y, z) ?? 0) === 20) continue;
      setBlock(x, y, z, 20);
      terrainMeshCache.invalidateBlock(x, z);
      changed = true;
    }
    return changed;
  }

  function waterSourcesForFarmland() {
    let waters = { $: "Nil" };
    for (let node = Farmland.entries(farmlandState); node?.$ === "Con"; node = node.tail) {
      const plot = node.head;
      const x = Number(plot.x);
      const y = Number(plot.y);
      const z = Number(plot.z);
      for (let dx = -4; dx <= 4; dx += 1) {
        for (let dz = -4; dz <= 4; dz += 1) {
          const waterX = x + dx;
          const waterZ = z + dz;
          if (!inside(waterX, y, waterZ)) continue;
          if (blockAt(waterX, y, waterZ) !== 7 && blockAt(waterX, y + 1, waterZ) !== 7) continue;
          waters = {
            $: "Con",
            head: { $: "Water", x: BigInt(waterX), z: BigInt(waterZ) },
            tail: waters,
          };
        }
      }
    }
    return waters;
  }

  refreshMobs();
  villagers = villagerViews(villagerDomainState);
  if (savedGame?.furnaces?.$ === "World") furnaceWorldState = savedGame.furnaces;
  pinStoredFurnaces();
  pinStoredFarmland();
  pinStoredCrops();
  syncCropBlocks();
  syncFarmlandBlocks();

  function mobViews(list) {
    const views = [];
    for (let node = list; node?.$ === "Con"; node = node.tail) {
      const mob = node.head;
      views.push({
        id: Number(mob.id),
        kind: Number(mob.kind),
        x: Number(mob.x),
        y: Number(mob.y),
        z: Number(mob.z),
        health: Number(mob.health),
        alive: mob.alive,
      });
    }
    return views;
  }

  function villagerViews(list) {
    const views = [];
    for (let node = list; node?.$ === "Con"; node = node.tail) {
      const villager = node.head;
      views.push({
        id: Number(villager.id),
        profession: Number(villager.profession),
        x: Number(villager.x),
        y: Number(villager.y),
        z: Number(villager.z),
        homeX: Number(villager.home_x),
        homeZ: Number(villager.home_z),
        resting: villager.resting,
      });
    }
    return views;
  }

  function dropViews(list) {
    const views = [];
    for (let node = list; node?.$ === "Con"; node = node.tail) {
      const drop = node.head;
      views.push({
        id: Number(drop.id),
        item: Number(drop.item),
        x: Number(drop.x),
        y: Number(drop.y),
        z: Number(drop.z),
        amount: Number(drop.amount),
        velocityY: Number(drop.velocity_y ?? 0),
        settled: drop.settled ?? false,
      });
    }
    return views;
  }

  function splitActiveEntityBuckets(list, getPosition, kind) {
    const buckets = buildChunkBuckets(list, CHUNK_SIZE, getPosition);
    const centerX = Math.floor(player.x / CHUNK_SIZE);
    const centerZ = Math.floor(player.z / CHUNK_SIZE);
    const active = [];
    const dormant = [];
    for (const [key, bucket] of buckets) {
      const [chunkX, chunkZ] = key.split(",").map(Number);
      const target = Math.abs(chunkX - centerX) <= CHUNK_RENDER_RADIUS
        && Math.abs(chunkZ - centerZ) <= CHUNK_RENDER_RADIUS
        ? active
        : dormant;
      target.push(bucket);
    }
    entityBucketStats = {
      ...entityBucketStats,
      [`${kind}Buckets`]: buckets.size,
      [`active${kind[0].toUpperCase()}${kind.slice(1)}Buckets`]: active.length,
    };
    return {
      active: active.reduce(concatBendLists, { $: "Nil" }),
      dormant: dormant.reduce(concatBendLists, { $: "Nil" }),
    };
  }

  function stepMobsBudgeted(dt) {
    const partition = splitActiveEntityBuckets(
      mobDomainState,
      (mob) => ({ x: Number(mob.x), z: Number(mob.z) }),
      "mob",
    );
    mobDomainState = concatBendLists(
      Entities.step(partition.active, player.x, player.z, dt),
      Entities.step(partition.dormant, player.x, player.z, dt / 5),
    );
  }

  function refreshMobs() {
    if (mobDomainState === null) mobDomainState = Entities.spawn(SEED, 0n, 0n, World.width(), World.depth());
    mobs = mobViews(mobDomainState);
    if (dropDomainState === null) dropDomainState = Entities.empty_drops();
    drops = dropViews(dropDomainState);
  }

  function dropSolid(block) {
    return (block > 0 && block < 16) || block === 20;
  }

  dropGroundCache = createColumnHeightCache({ maxY: MAX_Y, blockAt, isSolid: dropSolid });

  function groundSourcesForDrops(list = dropDomainState) {
    let grounds = { $: "Nil" };
    for (let node = list; node?.$ === "Con"; node = node.tail) {
      const drop = node.head;
      const x = Math.floor(Number(drop.x));
      const z = Math.floor(Number(drop.z));
      const floorY = dropGroundCache.get(x, z);
      grounds = {
        $: "Con",
        head: { $: "Ground", x: x + 0.5, z: z + 0.5, y: floorY },
        tail: grounds,
      };
    }
    return grounds;
  }

  function stepDrops(dt) {
    if (dropDomainState?.$ !== "Con") return;
    const partition = splitActiveEntityBuckets(
      dropDomainState,
      (drop) => ({ x: Number(drop.x), z: Number(drop.z) }),
      "drop",
    );
    dropDomainState = concatBendLists(
      Entities.step_drops(partition.active, dt, groundSourcesForDrops(partition.active)),
      Entities.step_drops(partition.dormant, dt / 5, groundSourcesForDrops(partition.dormant)),
    );
    drops = dropViews(dropDomainState);
  }

  function updateMobs(dt) {
    if (mobDomainState === null) return false;
    stepMobsBudgeted(dt);
    mobs = mobViews(mobDomainState);
    const threat = Number(Entities.threat_damage(mobDomainState, player.x, player.z));
    if (threat > 0) applyDamage(player, threat * dt);
    collectNearbyDrops();
    return true;
  }

  function updateVillagers(dt) {
    villagerDomainState = Villagers.step(villagerDomainState, SEED, villagerPathGrid, BigInt(villagerTick), dt);
    villagerTick = (villagerTick + 1) % 24;
    villagers = villagerViews(villagerDomainState);
    const currentEdits = world.getEdits();
    const openedEdits = Villagers.open_doors(villagerDomainState, SEED, currentEdits);
    const doorResult = Villagers.update_doors_result(villagerDomainState, SEED, openedEdits, player.x, player.z);
    const nextEdits = Villagers.door_edits(doorResult);
    const doorChanged = openedEdits !== currentEdits || Villagers.door_changed(doorResult);
    if (doorChanged && world.replaceEdits(nextEdits)) {
      world.loadAround(player.x, player.z);
      world.forEachActiveChunk((chunkX, chunkZ) => terrainMeshCache.invalidateChunk(chunkX, chunkZ));
      villagerPathGrid = Villagers.path_grid(SEED, nextEdits);
    }
    return true;
  }

  function tradeNearestVillager() {
    let nearest = null;
    let nearestDistance = 3 * 3;
    for (const villager of villagers) {
      const dx = villager.x - player.x;
      const dz = villager.z - player.z;
      const distance = dx * dx + dz * dz;
      if (distance < nearestDistance) {
        nearest = villager;
        nearestDistance = distance;
      }
    }
    if (nearest === null) {
      setInventoryMessage("No villager is close enough.");
      return false;
    }
    const offer = Villagers.trade(villagerDomainState, BigInt(nearest.id), player.x, player.z);
    if (!offer.ok) {
      setInventoryMessage("This villager cannot trade right now.");
      return false;
    }
    const ok = tradeInventory(
      inventory,
      offer.cost_item,
      offer.cost_amount,
      offer.reward_item,
      offer.reward_amount,
    );
    setInventoryMessage(ok ? "Trade complete: rotten flesh for iron." : "You need more rotten flesh or inventory space.");
    if (ok) {
      refreshInventoryUi();
      updateHud();
    }
    return ok;
  }

  function sleepAtBed() {
    const result = Villagers.sleep(
      villagerDomainState,
      SEED,
      world.getEdits(),
      player.x,
      player.z,
      BigInt(villagerTick),
    );
    if (!result.ok) {
      setInventoryMessage("You can only sleep near a bed at night.");
      return false;
    }
    villagerTick = Number(result.next_tick);
    worldTime = 0;
    setInventoryMessage("Good morning.");
    updateHud();
    return true;
  }

  function attackNearestMob() {
    if (mobDomainState === null) return false;
    let nearest = null;
    let nearestDistance = 4 * 4;
    for (const mob of mobs) {
      if (!mob.alive) continue;
      const dx = mob.x - player.x;
      const dz = mob.z - player.z;
      const distance = dx * dx + dz * dz;
      if (distance < nearestDistance) {
        nearest = mob;
        nearestDistance = distance;
      }
    }
    if (nearest === null) return false;
    const result = Entities.attack(mobDomainState, BigInt(nearest.id), 4.0);
    if (!result.hit) return false;
    mobDomainState = result.mobs;
    mobs = mobViews(mobDomainState);
    dropDomainState = result.drops;
    drops = dropViews(dropDomainState);
    setInventoryMessage("Mob hit.");
    rebuildDynamicMesh();
    return true;
  }

  function collectNearbyDrops() {
    const target = Entities.nearest_drop(dropDomainState, player.x, player.y, player.z);
    if (target.$ !== "DropFound") return false;
    const item = itemNameFromId(target.item);
    if (item === null || !collectItem(inventory, item, Number(target.amount))) return false;
    dropDomainState = Entities.remove_drop(dropDomainState, BigInt(target.id));
    drops = dropViews(dropDomainState);
    setInventoryMessage(`${itemName({ item })} collected.`);
    refreshInventoryUi();
    updateHud();
    return true;
  }

  function setInventoryMessage(message) {
    inventoryMessageEl.textContent = message;
  }

  function slotMarkup(item, slot, className) {
    const id = itemId(item);
    const empty = id === null;
    const selected = slot === selectedSlot;
    const cursor = slot === inventoryCursor;
    const name = itemName(item);
    const count = item?.count || 0;
    return `<button class="${className}${selected ? " selected" : ""}${cursor ? " cursor" : ""}${empty ? " empty" : ""}"
      type="button" data-slot="${slot}" aria-label="Slot ${slot + 1}: ${name}, ${count}"
      aria-pressed="${selected || cursor}" title="${slot + 1}: ${name}">
      <span class="slot-key">${slot + 1}</span>
      <span class="slot-swatch" style="--slot-color: ${itemColor(item)}"></span>
      <span class="slot-name">${name}</span>
      <span class="slot-count">${count || ""}</span>
      ${item?.durability ? `<span class="slot-durability" style="--durability: ${Math.max(0, Math.min(100, item.durability / item.durabilityMax * 100))}%"></span>` : ""}
    </button>`;
  }

  function renderHotbar() {
    hotbarEl.innerHTML = inventory
      .slice(0, HOTBAR_SIZE)
      .map((item, slot) => slotMarkup(item, slot, "hotbar-slot"))
      .join("");
  }

  function renderInventoryPanel() {
    inventorySlotsEl.innerHTML = inventory
      .map((item, slot) => slotMarkup(item, slot, "inventory-slot"))
      .join("");
    recipeListEl.innerHTML = RECIPES.map((recipe) => {
      const ingredients = recipe.ingredients
        .map(({ item, count }) => `${count} ${itemName(item)}`)
        .join(" + ");
      const available = canCraft(inventory, recipe.id);
      return `<button class="recipe-button" type="button" data-recipe="${recipe.id}" ${available ? "" : "disabled"}>
        <span class="recipe-name">${recipe.name}</span>
        <span class="recipe-cost">${ingredients}</span>
        <span class="recipe-output">→ ${recipe.output.count} ${itemName(recipe.output.item)}</span>
      </button>`;
    }).join("");
  }

  function refreshInventoryUi() {
    renderHotbar();
    renderInventoryPanel();
    updateHeldItemUi();
  }

  function updateHeldItemUi() {
    const descriptor = heldItemPose(selectedItem(inventory, selectedSlot));
    heldItemViewEl.hidden = !descriptor.visible;
    if (!descriptor.visible) {
      heldItemLabelEl.textContent = "Empty hand";
      return;
    }
    const texture = itemTexture(descriptor.item);
    const context = heldItemCanvasEl.getContext("2d");
    if (context !== null && texture !== null) {
      drawItemTexture(context, texture, { size: 72, background: "rgba(255,255,255,0.05)" });
    }
    heldItemLabelEl.textContent = `${descriptor.name}${descriptor.count > 1 ? ` ×${descriptor.count}` : ""}`;
    heldItemViewEl.title = `${descriptor.category} · ${descriptor.model}`;
  }

  function selectSlot(slot) {
    if (slot < 0 || slot >= HOTBAR_SIZE) return;
    selectedSlot = slot;
    refreshInventoryUi();
    updateHud();
  }

  function setInventoryOpen(open) {
    if (open && furnaceOpen) setFurnaceOpen(false);
    inventoryOpen = open;
    inventoryCursor = null;
    inventoryPanelEl.hidden = !open;
    inventoryToggleEl.setAttribute("aria-expanded", String(open));
    inventoryToggleEl.textContent = open ? "Close inventory (E)" : "Inventory (E)";
    if (open && document.pointerLockElement === canvas && typeof document.exitPointerLock === "function") {
      document.exitPointerLock();
    }
    renderInventoryPanel();
  }

  function toggleInventory() {
    setInventoryOpen(!inventoryOpen);
  }

  function furnaceSlot(item) {
    return inventory.findIndex((slot) => itemId(slot) === item);
  }

  function activeFurnaceState() {
    if (activeFurnace === null) return null;
    const lookup = Furnaces.at(
      furnaceWorldState,
      BigInt(activeFurnace[0]),
      BigInt(activeFurnace[1]),
      BigInt(activeFurnace[2]),
    );
    return lookup.$ === "FurnaceFound" ? lookup.furnace : null;
  }

  function setActiveFurnaceState(state) {
    if (activeFurnace === null) return false;
    furnaceWorldState = Furnaces.set(
      furnaceWorldState,
      BigInt(activeFurnace[0]),
      BigInt(activeFurnace[1]),
      BigInt(activeFurnace[2]),
      state,
    );
    return true;
  }

  function updateFurnaceStatus() {
    const state = activeFurnaceState();
    if (state === null) {
      furnaceStatusEl.textContent = "Right-click a placed furnace to open its container.";
      return;
    }
    const input = Number(state.input_count);
    const fuel = Number(state.fuel_count);
    const output = Number(state.output_count);
    const progress = Number(state.progress);
    const burn = Number(state.burn);
    furnaceStatusEl.textContent = `Input: ${input} raw iron · fuel: ${fuel} coal · progress: ${progress}/8 · burn: ${burn} · output: ${output} iron ingot`;
  }

  function setFurnaceOpen(open, location = activeFurnace) {
    if (open) {
      if (location !== null) activeFurnace = location.map((value) => Math.trunc(value));
      if (activeFurnaceState() === null) {
        setInventoryMessage("Right-click a placed furnace first.");
        return false;
      }
    }
    furnaceOpen = open;
    furnacePanelEl.hidden = !open;
    furnaceToggleEl.setAttribute("aria-expanded", String(open));
    furnaceToggleEl.textContent = open ? "Close furnace (R)" : "Furnace (R)";
    if (open) {
      inventoryOpen = false;
      inventoryPanelEl.hidden = true;
      inventoryToggleEl.setAttribute("aria-expanded", "false");
      inventoryToggleEl.textContent = "Inventory (E)";
      if (document.pointerLockElement === canvas && typeof document.exitPointerLock === "function") {
        document.exitPointerLock();
      }
    }
    updateFurnaceStatus();
    return true;
  }

  function toggleFurnace(location = activeFurnace) {
    return setFurnaceOpen(!furnaceOpen, location);
  }

  function furnaceAction(action) {
    if (!furnaceOpen) return false;
    const current = activeFurnaceState();
    if (current === null) return false;
    if (action === "input") {
      const slot = furnaceSlot("raw_iron");
      if (slot === -1) {
        setInventoryMessage("You need raw iron to smelt.");
        return false;
      }
      const loaded = Furnace.load_input(current, 15, 1n);
      if (!loaded.ok || !consume(inventory, slot)) {
        setInventoryMessage("The furnace input is full.");
        return false;
      }
      setActiveFurnaceState(loaded.furnace);
    } else if (action === "fuel") {
      const slot = furnaceSlot("coal");
      if (slot === -1) {
        setInventoryMessage("You need coal to fuel the furnace.");
        return false;
      }
      const loaded = Furnace.load_fuel(current, 14, 1n);
      if (!loaded.ok || !consume(inventory, slot)) {
        setInventoryMessage("The furnace fuel slot is full.");
        return false;
      }
      setActiveFurnaceState(loaded.furnace);
    } else if (action === "output") {
      const extracted = Furnace.take_output(current);
      if (!extracted.ok) {
        setInventoryMessage("The furnace has no iron ingot ready.");
        return false;
      }
      const item = itemNameFromId(extracted.item);
      if (item === null || !collectItem(inventory, item, Number(extracted.amount))) {
        setInventoryMessage("Make room in the inventory first.");
        return false;
      }
      setActiveFurnaceState(extracted.furnace);
    } else {
      return false;
    }
    refreshInventoryUi();
    updateHud();
    updateFurnaceStatus();
    return true;
  }

  function tickFurnace() {
    simulationState = Simulation.tick_with_water(simulationState, 1n, waterSourcesForFarmland());
    cropState = Simulation.sim_crops(simulationState);
    farmlandState = Simulation.sim_farmland(simulationState);
    furnaceWorldState = Furnaces.tick_world(furnaceWorldState);
    if (syncCropBlocks()) simulationTerrainDirty = true;
    if (furnaceOpen) updateFurnaceStatus();
    return true;
  }

  function craftRecipe(recipeId) {
    const recipe = RECIPES.find((entry) => entry.id === recipeId);
    if (recipe === undefined || !craft(inventory, recipeId)) {
      setInventoryMessage("Missing materials or inventory space.");
      return false;
    }
    setInventoryMessage(`${recipe.name} crafted.`);
    refreshInventoryUi();
    return true;
  }

  function eatSelected() {
    const item = selectedItem(inventory, selectedSlot);
    const nutrition = foodValue(item);
    if (nutrition <= 0) {
      setInventoryMessage("The selected item is not food.");
      return false;
    }
    if (player.hunger >= 20) {
      setInventoryMessage("You are not hungry.");
      return false;
    }
    if (!consume(inventory, selectedSlot)) return false;
    eatFood(player, nutrition);
    setInventoryMessage(`${itemName(item)} eaten.`);
    refreshInventoryUi();
    updateHud();
    return true;
  }

  function sameFurnacePosition(position, x, y, z) {
    return position !== null && position[0] === x && position[1] === y && position[2] === z;
  }

  function placeBlockAt(x, y, z, item) {
    const block = blockForItem(item);
    if (block === null || !canPlaceBlock(item, blockAt(x, y, z) === 0, inside(x, y, z), overlapsPlayer(player, x, y, z))) return false;
    let nextFurnaces = furnaceWorldState;
    if (block === 11) {
      const added = Furnaces.add(furnaceWorldState, BigInt(x), BigInt(y), BigInt(z));
      if (!added.ok) return false;
      nextFurnaces = added.world;
    }
    if (!consume(inventory, selectedSlot)) return false;
    furnaceWorldState = nextFurnaces;
    if (block === 11) {
      const chunkX = Math.floor(x / CHUNK_SIZE);
      const chunkZ = Math.floor(z / CHUNK_SIZE);
      world.pinChunk(chunkX, chunkZ);
      simulationState = Simulation.pin(simulationState, BigInt(chunkX), BigInt(chunkZ));
    }
    setBlock(x, y, z, block);
    invalidateVillagerPath(x, y, z);
    terrainMeshCache.invalidateBlock(x, z);
    if (block === 11) activeFurnace = [x, y, z];
    return true;
  }

  function isCropBlock(block) {
    return block >= 16 && block <= 19;
  }

  function tillBlockAt(x, y, z) {
    if (itemId(selectedItem(inventory, selectedSlot)) !== "wooden_hoe") return false;
    const ground = Number(blockAt(x, y, z) ?? 0);
    if (ground !== 2 && ground !== 3) return false;
    const added = Farmland.add(farmlandState, BigInt(x), BigInt(y), BigInt(z));
    farmlandState = added.state;
    simulationState = Simulation.with_farmland(simulationState, farmlandState);
    pinCropChunk(x, z);
    setBlock(x, y, z, 20);
    terrainMeshCache.invalidateBlock(x, z);
    useTool(inventory, selectedSlot);
    setInventoryMessage("Soil tilled into farmland.");
    return true;
  }

  function placeCropAt(x, y, z) {
    if (itemId(selectedItem(inventory, selectedSlot)) !== "wheat_seeds") return false;
    const ground = Number(blockAt(x, y - 1, z) ?? 0);
    const result = Crops.plant(
      cropState,
      BigInt(x),
      BigInt(y),
      BigInt(z),
      ground,
      Number(blockAt(x, y, z) ?? 0),
    );
    if (!result.ok || !consume(inventory, selectedSlot)) {
      setInventoryMessage("Seeds need an empty block above hydrated farmland.");
      return false;
    }
    cropState = result.state;
    simulationState = Simulation.with_crops(simulationState, cropState);
    pinCropChunk(x, z);
    setBlock(x, y, z, 16);
    terrainMeshCache.invalidateBlock(x, z);
    setInventoryMessage("Wheat planted.");
    return true;
  }

  function collectCropHarvest(result) {
    const trial = inventory.map((slot) => ({ ...slot }));
    if (!collectItem(trial, "wheat_seeds", Number(result.seeds))) return false;
    if (!collectItem(trial, "wheat", Number(result.wheat))) return false;
    inventory.splice(0, inventory.length, ...trial);
    return true;
  }

  function harvestCropAt(x, y, z) {
    const result = Crops.harvest(cropState, BigInt(x), BigInt(y), BigInt(z));
    if (!result.ok) return false;
    if (!collectCropHarvest(result)) {
      setInventoryMessage("Make room for seeds and wheat first.");
      return false;
    }
    cropState = result.state;
    simulationState = Simulation.with_crops(simulationState, cropState);
    setBlock(x, y, z, 0);
    terrainMeshCache.invalidateBlock(x, z);
    releaseUnusedSimulationChunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
    setInventoryMessage("Wheat harvested.");
    return true;
  }

  function cropViews() {
    const views = [];
    for (let node = Crops.entries(cropState); node?.$ === "Con"; node = node.tail) {
      const crop = node.head;
      views.push({
        x: Number(crop.x),
        y: Number(crop.y),
        z: Number(crop.z),
        stage: Number(crop.stage),
        age: Number(crop.age),
      });
    }
    return views;
  }

  function farmlandViews() {
    const views = [];
    for (let node = Farmland.entries(farmlandState); node?.$ === "Con"; node = node.tail) {
      const plot = node.head;
      views.push({
        x: Number(plot.x),
        y: Number(plot.y),
        z: Number(plot.z),
        moisture: Number(plot.moisture),
      });
    }
    return views;
  }

  function interact(button) {
    const target = raycast(world, player);
    if (!target) return;
    const [x, y, z] = target.hit;
    if (button === 2 && itemId(selectedItem(inventory, selectedSlot)) === "wooden_hoe" && tillBlockAt(x, y, z)) {
      refreshInventoryUi();
      updateHud();
      rebuildMesh();
      return;
    }
    if (button === 2 && (blockAt(x, y, z) === 14 || blockAt(x, y, z) === 15)) {
      toggleDoorAt(x, y, z);
      return;
    }
    if (button === 2 && blockAt(x, y, z) === 11) {
      setFurnaceOpen(true, [x, y, z]);
      return;
    }
    if (button === 0) {
      const removedBlock = blockAt(x, y, z);
      if (isCropBlock(removedBlock) && removedBlock === 19 && harvestCropAt(x, y, z)) {
        refreshInventoryUi();
        updateHud();
        rebuildMesh();
        return;
      }
      const drop = mineDrop(selectedItem(inventory, selectedSlot), removedBlock, y);
      if (!drop.valid) {
        setInventoryMessage("The selected tool cannot mine this block.");
        return;
      }
      const dropItem = itemNameFromId(drop.item);
      if (dropItem === null || !collectItem(inventory, dropItem, drop.amount)) return;
      setBlock(x, y, z, 0);
      if (isCropBlock(removedBlock)) {
        cropState = Crops.remove(cropState, BigInt(x), BigInt(y), BigInt(z));
        simulationState = Simulation.with_crops(simulationState, cropState);
        releaseUnusedSimulationChunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
      }
      if (removedBlock === 20) {
        farmlandState = Farmland.remove(farmlandState, BigInt(x), BigInt(y), BigInt(z));
        simulationState = Simulation.with_farmland(simulationState, farmlandState);
        releaseUnusedSimulationChunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
      }
      invalidateVillagerPath(x, y, z);
      terrainMeshCache.invalidateBlock(x, z);
      if (removedBlock === 11) {
        const removed = Furnaces.remove(furnaceWorldState, BigInt(x), BigInt(y), BigInt(z));
        furnaceWorldState = removed.world;
        if (!hasFurnaceInChunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE))) {
          world.unpinChunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
          simulationState = Simulation.unpin(simulationState, BigInt(Math.floor(x / CHUNK_SIZE)), BigInt(Math.floor(z / CHUNK_SIZE)));
        }
        if (sameFurnacePosition(activeFurnace, x, y, z)) {
          setFurnaceOpen(false);
          activeFurnace = null;
        }
      }
      useTool(inventory, selectedSlot);
    } else if (button === 2 && target.place) {
      const [px, py, pz] = target.place;
      const item = selectedItem(inventory, selectedSlot);
      if (itemId(item) === "wheat_seeds" && placeCropAt(px, py, pz)) {
        refreshInventoryUi();
        updateHud();
        rebuildMesh();
        return;
      }
      if (!placeBlockAt(px, py, pz, item)) return;
    } else {
      return;
    }
    refreshInventoryUi();
    updateHud();
    rebuildMesh();
  }

  function updateHud() {
    const item = selectedItem(inventory, selectedSlot);
    const name = itemName(item);
    const count = item === null ? 0 : item.count;
    coordsEl.textContent = `x ${player.x.toFixed(1)} · y ${player.y.toFixed(1)} · z ${player.z.toFixed(1)}`;
    seedEl.textContent = `seed: ${seedLabel(SEED)}`;
    selectedEl.textContent = `selected: ${name} · ${count} · hp ${Math.ceil(player.health)} · hunger ${Math.ceil(player.hunger)}`;
  }

  function saveGame() {
    try {
      window.localStorage.setItem(SAVE_KEY, encodeSave({
        version: 1,
        edits: world.getEdits(),
        player: { ...player },
        inventory: inventory.map((item) => ({ ...item })),
        furnaces: furnaceWorldState,
        crops: cropState,
        farmland: farmlandState,
        simulation: simulationState,
        entities: packEntityState(mobDomainState, dropDomainState),
        villagers: villagerDomainState,
        villagerTick: BigInt(villagerTick),
      }));
    } catch {
      // Saving is best-effort when storage is disabled or full.
    }
  }

  function render() {
    resizeCanvas();
    const sky = [
      0.08 + 0.36 * daylight,
      0.12 + 0.54 * daylight,
      0.2 + 0.62 * daylight,
    ];
    gl.clearColor(sky[0], sky[1], sky[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(program);

    const eye = [player.x, player.y + EYE_HEIGHT, player.z];
    const direction = cameraDirection(player);
    const center = [eye[0] + direction[0], eye[1] + direction[1], eye[2] + direction[2]];
    const view = lookAt(eye, center, [0, 1, 0]);
    const projection = perspective(Math.PI / 2.6, canvas.width / canvas.height, 0.05, 120);
    gl.uniformMatrix4fv(viewProjectionLocation, false, multiply4(projection, view));
    gl.uniform3f(cameraLocation, eye[0], eye[1], eye[2]);
    gl.uniform3f(skyColorLocation, sky[0], sky[1], sky[2]);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.enableVertexAttribArray(colorLocation);
    gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.enableVertexAttribArray(uvLocation);
    gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, terrainVertexCount);
    gl.bindBuffer(gl.ARRAY_BUFFER, dynamicPositionBuffer);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, dynamicColorBuffer);
    gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, dynamicUvBuffer);
    gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, dynamicVertexCount);
  }

  function updateLockHint() {
    const locked = document.pointerLockElement === canvas;
    lockHintEl.textContent = locked
      ? "Press Esc to release the mouse"
      : "Click to capture the mouse";
    helpEl?.classList.toggle("is-locked", locked);
  }

  hotbarEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-slot]");
    if (button !== null) selectSlot(Number(button.dataset.slot));
  });
  inventoryToggleEl.addEventListener("click", toggleInventory);
  furnaceToggleEl.addEventListener("click", toggleFurnace);
  inventorySlotsEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-slot]");
    if (button === null) return;
    const slot = Number(button.dataset.slot);
    if (inventoryCursor === null) {
      if (itemId(selectedItem(inventory, slot)) === null) {
        setInventoryMessage("That slot is empty.");
        return;
      }
      inventoryCursor = slot;
      setInventoryMessage("Choose a destination slot to move this stack.");
    } else if (slot === inventoryCursor) {
      inventoryCursor = null;
      setInventoryMessage("Move cancelled.");
    } else if (moveItem(inventory, inventoryCursor, slot)) {
      inventoryCursor = null;
      setInventoryMessage("Item moved.");
    } else {
      setInventoryMessage("That slot cannot accept this item.");
    }
    refreshInventoryUi();
  });
  recipeListEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-recipe]");
    if (button !== null) craftRecipe(button.dataset.recipe);
  });
  inventoryPanelEl.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-inventory]") !== null) toggleInventory();
  });
  furnacePanelEl.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-furnace]") !== null) {
      setFurnaceOpen(false);
      return;
    }
    const action = event.target.closest("[data-furnace-action]")?.dataset.furnaceAction;
    if (action !== undefined) furnaceAction(action);
  });
  canvas.addEventListener("click", () => {
    if (!inventoryOpen && !furnaceOpen) pointerLock.request();
  });
  canvas.addEventListener("mousedown", (event) => {
    event.preventDefault();
    if (inventoryOpen || furnaceOpen) return;
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
  });
  document.addEventListener("mousemove", (event) => {
    if (document.pointerLockElement !== canvas) return;
    player.yaw += event.movementX * 0.0022;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - event.movementY * 0.0022));
  });
  window.addEventListener("keydown", (event) => {
    if (event.code === "KeyE") {
      event.preventDefault();
      toggleInventory();
      return;
    }
    if (event.code === "KeyR") {
      event.preventDefault();
      toggleFurnace();
      return;
    }
    if (event.code === "KeyG") {
      event.preventDefault();
      eatSelected();
      return;
    }
    const slot = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9"].indexOf(event.code);
    if (slot !== -1) {
      event.preventDefault();
      selectSlot(slot);
      return;
    }
    if (event.code === "KeyF") {
      event.preventDefault();
      attackNearestMob();
      return;
    }
    if (event.code === "KeyT") {
      event.preventDefault();
      tradeNearestVillager();
      return;
    }
    if (event.code === "KeyN") {
      event.preventDefault();
      sleepAtBed();
      return;
    }
    if (inventoryOpen || furnaceOpen) return;
    if (["KeyW", "KeyA", "KeyS", "KeyD", "Space"].includes(event.code)) {
      event.preventDefault();
      held.add(event.code);
    }
  });
  window.addEventListener("keyup", (event) => held.delete(event.code));
  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("beforeunload", saveGame);

  rebuildHorizon();
  rebuildMesh();
  refreshInventoryUi();
  setInventoryOpen(false);
  setFurnaceOpen(false);
  updateLockHint();
  updateHud();
  window.__bend2craft = {
    world: {
      seed: seedLabel(SEED),
      chunkSize: CHUNK_SIZE,
      renderRadius: CHUNK_RENDER_RADIUS,
      maxY: MAX_Y,
      get activeChunks() { return world.activeChunkCount(); },
      get pinnedChunks() { return world.pinnedChunkCount(); },
      get simulationTime() { return Number(Simulation.time(simulationState)); },
      get simulationChunks() { return Number(Simulation.pinned_count(simulationState)); },
      get workerRequests() { return workerRequestCount; },
      get workerResponses() { return workerResponseCount; },
      get workerHydrates() { return workerHydrateCount; },
      get workerRejects() { return workerRejectCount; },
      get blockCount() { return blockCount; },
    },
    getMeshStats: () => {
      const mesh = terrainMeshCache.snapshot();
      return {
        blockCount: mesh.blockCount,
        quadCount: mesh.quads.length,
        rebuildCount: mesh.rebuildCount,
        dirtyChunks: mesh.dirtyChunks,
      };
    },
    getBlock: (x, y, z) => blockAt(x, y, z),
    getLight: (x, y, z) => lightAt(x, y, z),
    getEdits: () => world.getEdits(),
    getLightDirtyCells: () => world.getLightDirtyCells(),
    getInventory: () => inventory.map((item) => ({ ...item })),
    getHeldItem: () => heldItemPose(selectedItem(inventory, selectedSlot)),
    getCharacterView: () => characterRenderDescriptor(selectedItem(inventory, selectedSlot)),
    getMobs: () => mobs.map((mob) => ({ ...mob })),
    getVillagers: () => villagers.map((villager) => ({ ...villager })),
    getDrops: () => drops.map((drop) => ({ ...drop })),
    getDropGroundStats: () => dropGroundCache?.stats() ?? { hits: 0, misses: 0, size: 0 },
    getEntityBucketStats: () => ({ ...entityBucketStats }),
    getCrops: cropViews,
    getFarmland: farmlandViews,
    getPlayer: () => ({ ...player }),
    getInputState: () => ({
      held: [...held],
      pointerLocked: document.pointerLockElement === canvas,
      inventoryOpen,
      furnaceOpen,
    }),
    getMovementDiagnostics: () => ({ calls: moveFrameCalls, active: moveFrameActive, player: { ...player } }),
    toggleInventory,
    loadChunksAt: (x, z, budget = Infinity, render = true) => {
      const result = world.loadAround(x, z, undefined, budget);
      if (result.changed && render) rebuildMesh();
      return result;
    },
    pinChunk: (x, z) => world.pinChunk(x, z),
    unpinChunk: (x, z) => world.unpinChunk(x, z),
    save: saveGame,
    attack: attackNearestMob,
    trade: tradeNearestVillager,
    sleep: sleepAtBed,
    toggleDoor: toggleDoorAt,
    tickVillagers: (dt = 1) => {
      const changed = updateVillagers(dt);
      if (changed) rebuildDynamicMesh();
      return changed;
    },
    craft: craftRecipe,
    eat: eatSelected,
    collect: (item, amount = 1) => {
      const ok = collectItem(inventory, item, amount);
      if (ok) {
        refreshInventoryUi();
        updateHud();
      }
      return ok;
    },
    getFurnace: () => {
      const state = activeFurnaceState();
      return state === null ? null : { ...state };
    },
    getFurnacePosition: () => activeFurnace?.slice() ?? null,
    placeFurnaceAt: (x, y, z) => {
      const slot = furnaceSlot("furnace");
      if (slot === -1) return false;
      selectedSlot = slot;
      const ok = placeBlockAt(x, y, z, selectedItem(inventory, selectedSlot));
      if (ok) {
        refreshInventoryUi();
        updateHud();
        rebuildMesh();
      }
      return ok;
    },
    placeAt: (item, x, y, z) => {
      const slot = furnaceSlot(item);
      if (slot === -1) return false;
      selectedSlot = slot;
      const ok = placeBlockAt(x, y, z, selectedItem(inventory, selectedSlot));
      if (ok) {
        refreshInventoryUi();
        updateHud();
        rebuildMesh();
      }
      return ok;
    },
    getFurnaces: () => furnaceWorldState,
    tillAt: (x, y, z) => {
      const slot = furnaceSlot("wooden_hoe");
      if (slot === -1) return false;
      selectedSlot = slot;
      const ok = tillBlockAt(x, y, z);
      if (ok) {
        refreshInventoryUi();
        updateHud();
        rebuildMesh();
      }
      return ok;
    },
    plantCropAt: (x, y, z) => {
      const slot = furnaceSlot("wheat_seeds");
      if (slot === -1) return false;
      selectedSlot = slot;
      const ok = placeCropAt(x, y, z);
      if (ok) {
        refreshInventoryUi();
        updateHud();
        rebuildMesh();
      }
      return ok;
    },
    harvestCropAt,
    furnaceAction,
    tickFurnace,
    toggleFurnace,
    get isInventoryOpen() { return inventoryOpen; },
    get isFurnaceOpen() { return furnaceOpen; },
  };

  let villagerSimulationSteps = 0;
  const playerTicker = createFixedTicker(1 / 60, (dt) => {
    if (world.activeChunkCount() <= 0) {
      moveFrameActive = false;
      return;
    }
    moveFrameCalls += 1;
    moveFrameActive = true;
    movePlayer(world, player, held, dt, spawnCell, spawnHeight, Number(World.width()), Number(World.depth()));
    if (world.loadAround(player.x, player.z).changed) playerStreamingDirty = true;
  });
  let previousPlayerTime = performance.now();
  window.setInterval(() => {
    const now = performance.now();
    const elapsed = Math.min((now - previousPlayerTime) / 1000, 0.25);
    previousPlayerTime = now;
    playerTicker.advance(elapsed);
  }, 16);

  const simulationTicker = createFixedTicker(0.2, (dt) => {
    updateMobs(dt);
    stepDrops(dt);
    simulationDynamicDirty = true;
    villagerSimulationSteps += 1;
    if (villagerSimulationSteps >= 5) {
      villagerSimulationSteps = 0;
      updateVillagers(1.0);
      simulationTerrainDirty = true;
      simulationDynamicDirty = true;
    }
    tickFurnace();
  });
  let previousSimulationTime = performance.now();
  window.setInterval(() => {
    const now = performance.now();
    const elapsed = Math.min((now - previousSimulationTime) / 1000, 1.6);
    previousSimulationTime = now;
    simulationTicker.advance(elapsed);
  }, 50);

  let previousTime = performance.now();
  function frame(now) {
    const dt = Math.min((now - previousTime) / 1000, 0.05);
    previousTime = now;
    worldTime += dt;
    daylight = 0.28 + 0.72 * (0.5 + 0.5 * Math.sin(worldTime * 0.08));
    if (playerStreamingDirty) playerStreamingDirty = false;
    if (world.loadAround(player.x, player.z).changed) {
      rebuildHorizon();
      rebuildMesh(false);
    }
    if (simulationTerrainDirty) {
      simulationTerrainDirty = false;
      rebuildMesh(false);
    }
    if (simulationDynamicDirty) {
      simulationDynamicDirty = false;
      rebuildDynamicMesh();
    }
    updateHud();
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
} catch (error) {
  showError(error);
}
