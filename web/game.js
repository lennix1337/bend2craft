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
import Fluids from "../world/fluids.bend";
import Fire from "../world/fire.bend";
import {
  HOTBAR_SIZE,
  RECIPES,
  blockForItem,
  canCraft,
  collectItem,
  consume,
  createInventory,
  craft,
  emptyBucket,
  emptyLavaBucket,
  fillBucket,
  fillLavaBucket,
  foodValue,
  itemColor,
  itemId,
  itemName,
  itemNameFromId,
  mineInteraction,
  miningDuration,
  placeInteraction,
  moveItem,
  selectedItem,
  tradeInventory,
  useTool,
} from "./inventory.js";
import {
  EYE_HEIGHT,
  DOMAIN_COORDINATE_OFFSET,
  applyDamage,
  applyLavaDamage,
  cameraDirection,
  clampPlayer,
  createPlayer,
  eatFood,
  mobRegion,
  movePlayer,
  lavaContact,
  overlapsPlayer,
  raycast,
  respawnPlayer,
} from "./game-state.js";
import { createChunkedWorld } from "./chunk-world.js";
import { quadCorners } from "./greedy-mesh.js";
import { dropBoxes, faceYaw, mobBoxes, villagerBoxes } from "./mob-models.js";
import { createAsyncChunkMeshCache } from "./mesh-cache.js";
import { createMeshRebuildScheduler } from "./mesh-rebuild-scheduler.js";
import { sampleSignedSurfaceGrid } from "./horizon-grid.js";
import { readAtlasTilePixels } from "./atlas-probe.js";
import { atlasSourceCanvas, atlasUV, blockFaceTileAt, createTextureAtlas } from "./texture-atlas.js";
import { drawItemTexture, itemTexture } from "./item-atlas.js";
import { characterRenderDescriptor, heldItemPose } from "./character-view.js";
import { cameraMotion } from "./visual-motion.js";
import { createFrameMetrics, formatDebugText, sampleFrame } from "./frame-metrics.js";
import { entityShadow } from "./entity-shadow.js";
import { firstPersonHandParts } from "./first-person-hand.js";
import { furnaceControlHidden } from "./hud-visibility.js";
import { litEntityFaceColor, litFaceColor } from "./material-lighting.js";
import { createMiningState, miningStateMatches } from "./mining-controller.js";
import { miningProgress } from "./mining-progress.js";
import {
  SURFACE_MATERIAL_FIRE,
  SURFACE_MATERIAL_LAVA,
  SURFACE_MATERIAL_WATER,
} from "./surface-materials.js";
import { concatFloat32Arrays } from "./vertex-buffer-compose.js";
import { skyPalette } from "./sky-palette.js";
import { decodeSave } from "./save-state.js";
import { loadTransactional, saveTransactional } from "./persistent-save.js";
import { packEntityState, restoreEntities, restoreVillagers } from "./entity-save.js";
import { createFixedTicker } from "./simulation-ticker.js";
import { createColumnHeightCache } from "./drop-ground-cache.js";
import { buildChunkBuckets, concatBendLists } from "./entity-chunks.js";
import { seedFromSearch, seedLabel } from "./seed.js";
import { createPointerLockController } from "./pointer-lock.js";
import {
  createProfile,
  getActiveProfile,
  getProfile,
  getWorld,
  loadProfilesDoc,
  migrateLegacySave,
  saveKeyFor,
  saveProfilesDoc,
  touchProfile,
  touchWorld,
} from "./profiles.js";
import { loadOptions, normalizeWorldMode, worldModeLabel } from "./settings.js";
import { createWorkerScheduler } from "./worker-scheduler.js";

const canvas = document.getElementById("game");
const crosshairEl = document.getElementById("crosshair");
const miningProgressEl = document.getElementById("mining-progress");
const miningProgressFillEl = document.getElementById("mining-progress-fill");
const coordsEl = document.getElementById("coords");
const seedEl = document.getElementById("seed");
const selectedEl = document.getElementById("selected");
const statsEl = document.getElementById("stats");
const debugOverlayEl = document.getElementById("debug-overlay");
const vitalsEl = document.getElementById("vitals");
const heartsEl = document.getElementById("hearts");
const hungerEl = document.getElementById("hunger");
const damageFlashEl = document.getElementById("damage-flash");
const pauseEl = document.getElementById("pause");
const pauseSubtitleEl = document.getElementById("pause-subtitle");
const deathEl = document.getElementById("death");
const deathStatsEl = document.getElementById("death-stats");
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
const sessionParams = new URLSearchParams(window.location.search);
const options = loadOptions(window.localStorage);

function resolveSession() {
  let doc = loadProfilesDoc(window.localStorage);
  let profile = sessionParams.get("profile") !== null
    ? getProfile(doc, sessionParams.get("profile"))
    : getActiveProfile(doc);
  if (profile === null) {
    const created = createProfile(doc, "Player 1");
    if (created.ok) {
      doc = created.doc;
      saveProfilesDoc(window.localStorage, doc);
      profile = created.profile;
    }
  }
  let worldName = "Wilderness";
  let mode = "survival";
  let seed = null;
  const worldId = sessionParams.get("world");
  if (profile !== null && worldId !== null) {
    const entry = getWorld(doc, profile.id, worldId);
    if (entry !== null) {
      worldName = entry.name;
      mode = normalizeWorldMode(entry.mode);
      try {
        seed = BigInt(entry.seed);
      } catch {
        seed = null;
      }
    }
  }
  if (seed === null) {
    seed = seedFromSearch(window.location.search, World.default_seed());
  }
  const profileId = profile === null ? "guest" : profile.id;
  const profileName = profile === null ? "Guest" : profile.name;
  return { doc, profile, profileId, profileName, worldId, worldName, mode, seed };
}

const session = resolveSession();
const SEED = session.seed;
const SAVE_KEY = saveKeyFor(session.profileId, seedLabel(SEED));
const WORLD_NAME = session.worldName;
const PROFILE_NAME = session.profileName;
const WORLD_MODE = session.mode;
const PEACEFUL = WORLD_MODE === "peaceful";
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
let terrainMaterialBuffer;
let waterPositionBuffer;
let waterColorBuffer;
let waterUvBuffer;
let waterMaterialBuffer;
let waterTileBuffer;
let dynamicPositionBuffer;
let dynamicColorBuffer;
let dynamicUvBuffer;
let dynamicTileBuffer;
let shadowPositionBuffer;
let shadowColorBuffer;
let shadowUvBuffer;
let positionLocation;
let colorLocation;
let uvLocation;
let materialLocation;
let tileLocation;
let tileBuffer;
let viewProjectionLocation;
let cameraLocation;
let skyColorLocation;
let atlasLocation;
let shadowPassLocation;
let miningProgressLocation;
let terrainVertexCount = 0;
let waterVertexCount = 0;
let dynamicVertexCount = 0;
let shadowVertexCount = 0;
let terrainQuadCount = 0;
let waterQuadCount = 0;
let dynamicQuadCount = 0;
let shadowQuadCount = 0;
let horizonMesh = {
  opaque: { positions: [], colors: [], uvs: [], tiles: [], materials: [], quadCount: 0 },
  water: { positions: [], colors: [], uvs: [], materials: [], tiles: [], quadCount: 0 },
};
let visibleFaceCount = 0;
let daylight = 1;
let worldTime = 0;
let skyCssTick = -1;
let frameMetrics = createFrameMetrics();
let debugVisible = false;

try {
  // Keep the last frame readable for browser compositors and visual smoke tests.
  gl = canvas.getContext("webgl", {
    antialias: false,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  if (!gl) throw new Error("WebGL is not available in this browser.");

  let savedGame = null;
  try {
    const migrated = migrateLegacySave(window.localStorage, session.profileId, seedLabel(SEED));
    savedGame = migrated !== null
      ? decodeSave(migrated)
      : loadTransactional(window.localStorage, SAVE_KEY)?.value ?? null;
  } catch {
    savedGame = null;
  }

  const lightSourceFieldCache = new Map();
  const sourceFieldKey = (source) => `${source.x},${source.y},${source.z},${source.block}`;
  const invalidateLightFields = (x, y, z, previousBlock, value) => {
    if (previousBlock === 12 || value === 12) {
      lightSourceFieldCache.delete(`${BigInt(x)},${BigInt(y)},${BigInt(z)},12`);
    } else if (previousBlock === 7 || value === 7 || previousBlock === 21 || value === 21) {
      return;
    } else {
      lightSourceFieldCache.clear();
    }
  };
  const generateLightCells = (cells, edits) => {
    const sources = WorldState.light_sources(edits);
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
    return Light.patch_fields_with_edits(fields, edits, SEED, cells);
  };

  const MAX_Y = asNumber(World.max_y());
  const CHUNK_SIZE = asNumber(World.chunk_size());
  const CHUNK_RENDER_RADIUS = options.renderDistance;
  // Keep the camera clip and fog beyond the selected chunk window. Without
  // this, a larger setting would load chunks that WebGL immediately clips or
  // fades into the sky.
  const RENDER_FAR = Math.max(
    120,
    Math.ceil((CHUNK_RENDER_RADIUS + 2) * CHUNK_SIZE * Math.SQRT2),
  );
  const FOG_DISTANCE = Math.max(
    72,
    (CHUNK_RENDER_RADIUS + 1) * CHUNK_SIZE * 1.5 - 24,
  );
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
  let streamingMeshScheduler = null;
  let deferredMeshRebuildTimer = null;
  let workerRequestId = 0;
  let workerRequestCount = 0;
  let workerResponseCount = 0;
  let workerHydrateCount = 0;
  let workerRejectCount = 0;
  let meshWorkerRequestCount = 0;
  let meshWorkerResponseCount = 0;
  let meshWorkerRejectCount = 0;
  const CHUNK_WORKER_COUNT = Math.min(4, Math.max(2, Number(navigator.hardwareConcurrency) || 2));
  const chunkWorkers = Array.from(
    { length: CHUNK_WORKER_COUNT },
    () => new Worker("/chunk-worker.js", { type: "module" }),
  );
  const chunkWorkerScheduler = createWorkerScheduler(chunkWorkers.length);
  const meshWorker = new Worker("/mesh-worker.js", { type: "module" });
  const requestMeshBuild = (job) => {
    meshWorkerRequestCount += 1;
    const transferables = [];
    for (const chunk of job.chunks) {
      transferables.push(chunk.data.buffer, chunk.light.buffer);
    }
    meshWorker.postMessage({ ...job, daylight: 1 }, transferables);
  };
  meshWorker.onmessage = (event) => {
    const { id, error } = event.data;
    if (error !== undefined) {
      meshWorkerRejectCount += 1;
      showError(new Error(`Mesh build failed: ${error}`));
      return;
    }
    if (terrainMeshCache?.applyBuild(id, event.data)) {
      meshWorkerResponseCount += 1;
      if (hiddenTerrainBlocks.size > 0) {
        // The edit overlay already hides the stale block. Defer the expensive
        // full-buffer upload so the interaction does not become a long frame.
        if (deferredMeshRebuildTimer === null) {
          deferredMeshRebuildTimer = window.setTimeout(() => {
            deferredMeshRebuildTimer = null;
            if (streamingMeshScheduler === null) rebuildMesh(false);
            else streamingMeshScheduler.request();
          }, 450);
        }
      } else if (streamingMeshScheduler === null) rebuildMesh(false);
      else streamingMeshScheduler.request();
    }
  };
  meshWorker.onerror = (event) => {
    meshWorkerRejectCount += 1;
    showError(new Error(event.message || "Mesh worker failed."));
  };
  const handleChunkMessage = (event) => {
    const { chunkX, chunkZ, blocks, lights, version, error, workerReady } = event.data;
    if (workerReady) return;
    workerResponseCount += 1;
    if (error !== undefined) {
      showError(new Error(`Chunk ${chunkX},${chunkZ} failed: ${error}`));
      return;
    }
    if (world.hydrateChunk(chunkX, chunkZ, blocks, lights, version)) {
      dropGroundCache?.clear();
      workerHydrateCount += 1;
      const ready = world.loadAround(player.x, player.z);
      if (ready.changed) {
        streamingMeshScheduler?.request();
      }
    } else {
      workerRejectCount += 1;
    }
  };
  for (const chunkWorker of chunkWorkers) {
    chunkWorker.onmessage = handleChunkMessage;
    chunkWorker.onerror = (event) => showError(new Error(event.message || "Chunk worker failed."));
  }
  world = createChunkedWorld({
    chunkSize: CHUNK_SIZE,
    maxY: MAX_Y,
    renderRadius: CHUNK_RENDER_RADIUS,
    loadBudget: CHUNK_WORKER_COUNT,
    initialEdits: savedGame?.edits?.$ === "Nil" || savedGame?.edits?.$ === "Con"
      ? savedGame.edits
      : WorldState.empty(),
    generateChunk: (chunkX, chunkZ, edits) => WorldState.chunk(
      SEED,
      BigInt(generationChunkCoordinate(chunkX)),
      BigInt(generationChunkCoordinate(chunkZ)),
      edits,
    ),
    generateLightChunk: (chunkX, chunkZ, edits) => Light.chunk_with_edits(
      WorldState.light_sources(edits),
      edits,
      SEED,
      BigInt(generationChunkCoordinate(chunkX)),
      BigInt(generationChunkCoordinate(chunkZ)),
    ),
    generateLightCells,
    affectedLightChunks: (x, z, chunkSize) => LightDirty.chunks(BigInt(x), BigInt(z), BigInt(chunkSize)),
    affectedLightCells: (x, y, z) => LightDirty.cells_plane(BigInt(x), BigInt(y), BigInt(z)),
    affectedLightColumnCells: (x, y, z) => LightDirty.cells_column(BigInt(x), BigInt(y), BigInt(z)),
    invalidateLightFields,
    requestChunk: (chunkX, chunkZ, edits, version) => {
      workerRequestCount += 1;
      chunkWorkers[chunkWorkerScheduler.next()].postMessage({
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
  const { inside, blockAt, lightAt, setBlock: rawSetBlock, setBlocks: rawSetBlocks } = world;
  let dropGroundCache = null;
  let terrainImmediateDirty = false;
  const hiddenTerrainBlocks = new Set();
  const setBlock = (x, y, z, value) => {
    dropGroundCache?.invalidate(Math.floor(x), Math.floor(z));
    const previous = blockAt(x, y, z);
    const changed = rawSetBlock(x, y, z, value);
    if (changed && previous !== value && previous !== 0) hiddenTerrainBlocks.add(`${x},${y},${z}`);
    terrainImmediateDirty = terrainImmediateDirty || changed;
    return changed;
  };
  const setBlocks = (changes) => {
    const previous = changes.map((change) => blockAt(change.x, change.y, change.z));
    for (const change of changes) dropGroundCache?.invalidate(Math.floor(change.x), Math.floor(change.z));
    const changed = rawSetBlocks(changes);
    if (changed) {
      changes.forEach((change, index) => {
        if (previous[index] !== change.value && previous[index] !== 0) {
          hiddenTerrainBlocks.add(`${change.x},${change.y},${change.z}`);
        }
      });
    }
    terrainImmediateDirty = terrainImmediateDirty || changed;
    return changed;
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
  function normalizeFluidState(value) {
    if (value?.$ !== "State") return Fluids.empty();
    const flows = [];
    for (let node = value.flows; node?.$ === "Con"; node = node.tail) {
      const flow = node.head;
      flows.push({
        $: "Flow",
        x: flow.x,
        y: flow.y,
        z: flow.z,
        level: flow.level,
        source: flow.source ?? false,
        block: flow.block ?? 7,
      });
    }
    let list = { $: "Nil" };
    for (let index = flows.length - 1; index >= 0; index -= 1) {
      list = { $: "Con", head: flows[index], tail: list };
    }
    return { $: "State", flows: list };
  }
  let fluidState = savedGame?.fluids?.$ === "State"
    ? Fluids.limit(normalizeFluidState(savedGame.fluids))
    : Fluids.empty();
  let fireState = savedGame?.fire?.$ === "State"
    ? savedGame.fire
    : Fire.empty();
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
    precision mediump float;
    attribute vec3 aPosition;
    attribute vec3 aColor;
    attribute vec2 aUV;
    attribute float aMaterial;
    attribute vec4 aTileRect;
    uniform mat4 uViewProjection;
    uniform vec3 uCamera;
    uniform float uTime;
    uniform float uSurfacePass;
    varying vec3 vColor;
    varying vec2 vUV;
    varying vec3 vWorldPosition;
    varying float vMaterial;
    varying vec4 vTileRect;
    varying float vFog;
    void main() {
      vec3 position = aPosition;
      if (uSurfacePass > 0.5 && aMaterial < ${SURFACE_MATERIAL_WATER + 0.5}) {
        position.y += 0.028 * sin(uTime * 1.6 + position.x * 0.38 + position.z * 0.27)
          + 0.012 * sin(uTime * 2.7 - position.z * 0.19 + position.x * 0.11);
      }
      if (uSurfacePass < 0.5 && aMaterial > 13.5 && aMaterial < 14.5) {
        position.x += 0.025 * sin(uTime * 1.2 + position.x * 0.4 + position.z * 0.27);
        position.z += 0.018 * cos(uTime * 1.05 + position.z * 0.32 + position.x * 0.18);
      }
      vColor = aColor;
      vUV = aUV;
      vWorldPosition = position;
      vMaterial = aMaterial;
      vTileRect = aTileRect;
      vFog = clamp((distance(position, uCamera) - 24.0) / ${FOG_DISTANCE.toFixed(1)}, 0.0, 1.0);
      gl_Position = uViewProjection * vec4(position, 1.0);
    }
  `;
  const fragmentSource = `
    precision mediump float;
    varying vec3 vColor;
    varying vec2 vUV;
    varying vec3 vWorldPosition;
    varying float vMaterial;
    varying vec4 vTileRect;
    varying float vFog;
    uniform float uDaylight;
    uniform vec3 uSkyColor;
    uniform sampler2D uAtlas;
    uniform float uTime;
    uniform float uSurfacePass;
    uniform float uShadowPass;
    uniform float uMiningProgress;
    void main() {
      vec2 localUv = fract(vUV);
      bool miningPass = vTileRect.x < -0.5;
      vec2 tileUv = mix(vTileRect.xy, vTileRect.zw, localUv);
      vec4 textureColor = miningPass ? vec4(1.0) : texture2D(uAtlas, tileUv);
      float materialVariation = fract(sin(dot(floor(vWorldPosition.xz), vec2(12.9898, 78.233))) * 43758.5453);
      vec3 texturedColor = vColor * uDaylight * textureColor.rgb * mix(0.985, 1.015, materialVariation);
      float alpha = textureColor.a;
      if (uShadowPass > 0.5) {
        texturedColor = vec3(0.015, 0.02, 0.018);
        vec2 shadowUv = vUV * 2.0 - 1.0;
        float shadowDistance = length(shadowUv);
        float softness = 1.0 - smoothstep(0.38, 1.0, shadowDistance);
        alpha = 0.28 * softness * (1.0 - vFog * 0.65);
      } else if (miningPass) {
        vec2 fractureUv = vUV * 4.0 + floor(uMiningProgress * 6.0);
        float fractureA = 1.0 - smoothstep(0.0, 0.045, abs(fractureUv.x + fractureUv.y) - 0.5);
        float fractureB = 1.0 - smoothstep(0.0, 0.045, abs(fractureUv.x - fractureUv.y) - 0.5);
        float fracture = max(fractureA, fractureB) * step(0.02, uMiningProgress);
        texturedColor = vec3(0.04, 0.045, 0.04);
        alpha = 0.14 + fracture * 0.72;
      } else if (uSurfacePass > 0.5 && vMaterial < ${SURFACE_MATERIAL_WATER + 0.5}) {
        float rippleA = 0.5 + 0.5 * sin(uTime * 1.8 + vWorldPosition.x * 0.42 + vWorldPosition.z * 0.28);
        float rippleB = 0.5 + 0.5 * sin(uTime * 2.7 - vWorldPosition.z * 0.19 + vWorldPosition.x * 0.11);
        float shimmer = 0.65 * rippleA + 0.35 * rippleB;
        float crest = smoothstep(0.76, 0.98, shimmer);
        texturedColor = mix(vec3(0.035, 0.23, 0.42), vec3(0.18, 0.68, 0.78), shimmer) * uDaylight;
        texturedColor += vec3(0.16, 0.24, 0.22) * crest;
        alpha = 0.76;
      } else if (uSurfacePass > 0.5 && vMaterial < ${SURFACE_MATERIAL_LAVA + 0.5}) {
        texturedColor *= 1.0 + 0.16 * sin(uTime * 2.4 + vWorldPosition.x * 0.5);
        alpha = max(alpha, 0.86);
      } else if (uSurfacePass > 0.5) {
        texturedColor *= 1.0 + 0.25 * sin(uTime * 8.0 + vWorldPosition.y * 4.0);
        alpha = max(alpha, 0.9);
      }
      float outputAlpha = mix(alpha, 0.0, vFog);
      gl_FragColor = vec4(mix(texturedColor, uSkyColor, vFog), outputAlpha);
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
  terrainMaterialBuffer = gl.createBuffer();
  tileBuffer = gl.createBuffer();
  waterPositionBuffer = gl.createBuffer();
  waterColorBuffer = gl.createBuffer();
  waterUvBuffer = gl.createBuffer();
  waterMaterialBuffer = gl.createBuffer();
  waterTileBuffer = gl.createBuffer();
  dynamicPositionBuffer = gl.createBuffer();
  dynamicColorBuffer = gl.createBuffer();
  dynamicUvBuffer = gl.createBuffer();
  dynamicTileBuffer = gl.createBuffer();
  shadowPositionBuffer = gl.createBuffer();
  shadowColorBuffer = gl.createBuffer();
  shadowUvBuffer = gl.createBuffer();
  positionLocation = gl.getAttribLocation(program, "aPosition");
  colorLocation = gl.getAttribLocation(program, "aColor");
  uvLocation = gl.getAttribLocation(program, "aUV");
  materialLocation = gl.getAttribLocation(program, "aMaterial");
  tileLocation = gl.getAttribLocation(program, "aTileRect");
  viewProjectionLocation = gl.getUniformLocation(program, "uViewProjection");
  cameraLocation = gl.getUniformLocation(program, "uCamera");
  const timeLocation = gl.getUniformLocation(program, "uTime");
  const daylightLocation = gl.getUniformLocation(program, "uDaylight");
  const surfacePassLocation = gl.getUniformLocation(program, "uSurfacePass");
  shadowPassLocation = gl.getUniformLocation(program, "uShadowPass");
  miningProgressLocation = gl.getUniformLocation(program, "uMiningProgress");
  skyColorLocation = gl.getUniformLocation(program, "uSkyColor");
  atlasLocation = gl.getUniformLocation(program, "uAtlas");
  const atlasTexture = createTextureAtlas(gl, BLOCK_COLORS);
  gl.useProgram(program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
  gl.uniform1i(atlasLocation, 0);

  function blockColor(block, faceIndex, x, z, light = 15) {
    // Neutral shading only: the texture atlas carries each block's hue.
    // (Multiplying a colored tint here double-colors every surface.)
    const variation = (((x * 17 + z * 31) % 5) + 5) % 5 * 0.012;
    const top = block === 3 && faceIndex === 0;
    const shade = FACE_SHADES[faceIndex] + (top ? variation : variation * 0.5);
    return litFaceColor(faceIndex, 1, light, shade);
  }

  let horizonCenterKey = null;
  function rebuildHorizon() {
    const centerChunkX = Math.floor(player.x / CHUNK_SIZE);
    const centerChunkZ = Math.floor(player.z / CHUNK_SIZE);
    const key = `${centerChunkX},${centerChunkZ}`;
    if (key === horizonCenterKey) return;
    horizonCenterKey = key;
    const step = 4;
    const radius = Math.max(128, CHUNK_RENDER_RADIUS * CHUNK_SIZE + 64);
    const columns = Math.floor((radius * 2) / step) + 1;
    const minX = Math.floor(player.x) - radius;
    const minZ = Math.floor(player.z) - radius;
    const surfaces = sampleSignedSurfaceGrid({
      minX,
      minZ,
      columns,
      rows: columns,
      step,
      encodeCoordinate: storageCoordinate,
      sample: (count, points) => Horizon.surface_points(SEED, count, points),
    }).values;
    const opaque = { positions: [], colors: [], uvs: [], tiles: [], materials: [], quadCount: 0 };
    const waterMesh = { positions: [], colors: [], uvs: [], materials: [], tiles: [], quadCount: 0 };
    const innerRadius = CHUNK_RENDER_RADIUS * CHUNK_SIZE + step;
    for (let z = 0; z < columns - 1; z += 1) {
      for (let x = 0; x < columns - 1; x += 1) {
        // Keep render positions in the signed browser coordinate system. The
        // Bend request uses the encoded Nat coordinate separately.
        const globalX = minX + x * step;
        const globalZ = minZ + z * step;
        const centerDistance = Math.hypot(globalX + step / 2 - player.x, globalZ + step / 2 - player.z);
        if (centerDistance <= innerRadius) continue;
        const encodedSurface = Number(surfaces[x + columns * z]);
        const isWater = encodedSurface >= 32;
        const height = isWater ? encodedSurface - 32 : encodedSurface;
        const corners = [
          [globalX, height, globalZ],
          [globalX + step, height, globalZ],
          [globalX + step, height, globalZ + step],
          [globalX, height, globalZ + step],
        ];
        const tile = isWater ? 7 : 3;
        const color = blockColor(tile, 0, globalX, globalZ, 15);
        const uv = atlasUV(blockFaceTileAt(tile, 0, globalX, globalZ));
        const tileRect = [uv[0], uv[1], uv[4], uv[5]];
        const localUv = [[0, 0], [step, 0], [step, step], [0, step]];
        const target = isWater ? waterMesh : opaque;
        for (const cornerIndex of [0, 1, 2, 0, 2, 3]) {
          const corner = corners[cornerIndex];
          target.positions.push(corner[0], corner[1], corner[2]);
          target.colors.push(color[0], color[1], color[2]);
          target.uvs.push(localUv[cornerIndex][0], localUv[cornerIndex][1]);
          target.tiles.push(...tileRect);
          if (isWater) target.materials.push(1);
          else target.materials.push(10 + tile);
        }
        target.quadCount += 1;
      }
    }
    horizonMesh = { opaque, water: waterMesh };
  }

  function rotatePartPoint(x, y, z, part) {
    // Exact composition: the orbit step already placed center/pivot in the
    // world, so un-rotate into the box frame, pitch about the local pivot,
    // then yaw back. Keeps swinging limbs rigid at any facing.
    const yawSin = Math.sin(part.yaw);
    const yawCos = Math.cos(part.yaw);
    const pitchSin = Math.sin(part.pitch);
    const pitchCos = Math.cos(part.pitch);
    const relX = x - part.c[0];
    const relY = y - part.c[1];
    const relZ = z - part.c[2];
    // Into box frame (inverse yaw).
    const localX = relX * yawCos + relZ * yawSin;
    const localY = relY;
    const localZ = -relX * yawSin + relZ * yawCos;
    let outX = localX;
    let outY = localY;
    let outZ = localZ;
    if (part.pitch !== 0) {
      const pivot = part.pivot ?? part.c;
      const pivotX = (pivot[0] - part.c[0]) * yawCos + (pivot[2] - part.c[2]) * yawSin;
      const pivotY = pivot[1] - part.c[1];
      const pivotZ = -(pivot[0] - part.c[0]) * yawSin + (pivot[2] - part.c[2]) * yawCos;
      const armY = localY - pivotY;
      const armZ = localZ - pivotZ;
      outX = localX;
      outY = pivotY + armY * pitchCos - armZ * pitchSin;
      outZ = pivotZ + armY * pitchSin + armZ * pitchCos;
    }
    // Back to world (yaw).
    return [
      part.c[0] + outX * yawCos - outZ * yawSin,
      part.c[1] + outY,
      part.c[2] + outX * yawSin + outZ * yawCos,
    ];
  }

  function appendBox(positions, colors, uvs, tiles, part) {
    const uv = atlasUV(part.tile);
    const tileRect = [uv[0], uv[1], uv[4], uv[5]];
    const localUv = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (let faceIndex = 0; faceIndex < FACES.length; faceIndex += 1) {
      const color = litEntityFaceColor(part.tint, faceIndex, 1, FACE_SHADES[faceIndex]);
      for (const cornerIndex of [0, 1, 2, 0, 2, 3]) {
        const corner = FACES[faceIndex].corners[cornerIndex];
        const [px, py, pz] = rotatePartPoint(
          part.c[0] + (corner[0] - 0.5) * part.s[0],
          part.c[1] + (corner[1] - 0.5) * part.s[1],
          part.c[2] + (corner[2] - 0.5) * part.s[2],
          part,
        );
        positions.push(px, py, pz);
        colors.push(color[0], color[1], color[2]);
        uvs.push(localUv[cornerIndex][0], localUv[cornerIndex][1]);
        tiles.push(...tileRect);
      }
    }
  }

  function appendMiningCrack(positions, colors, uvs, tiles) {
    if (miningState === null) return;
    const target = raycast(world, player);
    if (target === null || target.place === null) return;
    if (target.hit[0] !== miningState.x || target.hit[1] !== miningState.y || target.hit[2] !== miningState.z) return;
    const normal = [
      target.place[0] - target.hit[0],
      target.place[1] - target.hit[1],
      target.place[2] - target.hit[2],
    ];
    const faceIndex = FACES.findIndex((face) => face.dir.every((value, index) => value === normal[index]));
    if (faceIndex === -1) return;
    const face = FACES[faceIndex];
    const corners = face.corners.map(([x, y, z]) => [
      target.hit[0] + x + normal[0] * 0.004,
      target.hit[1] + y + normal[1] * 0.004,
      target.hit[2] + z + normal[2] * 0.004,
    ]);
    const localUv = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (const cornerIndex of [0, 1, 2, 0, 2, 3]) {
      const corner = corners[cornerIndex];
      positions.push(corner[0], corner[1], corner[2]);
      colors.push(1, 1, 1);
      uvs.push(localUv[cornerIndex][0], localUv[cornerIndex][1]);
      tiles.push(-1, -1, -1, -1);
    }
  }

  function appendShadow(positions, colors, uvs, entity) {
    const shadow = entityShadow(entity);
    positions.push(...shadow.positions);
    for (let index = 0; index < 6; index += 1) {
      colors.push(1, 1, 1);
    }
    uvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  }

  let dynamicStatsTick = -1;

  function rebuildDynamicMesh(time) {
    const positions = [];
    const colors = [];
    const uvs = [];
    const tiles = [];
    const shadowPositions = [];
    const shadowColors = [];
    const shadowUvs = [];
    for (const mob of mobs) {
      if (!mob.alive) continue;
      appendShadow(shadowPositions, shadowColors, shadowUvs, mob);
      const flashed = worldTime - (mobFlash.get(mob.id) ?? -10) < 0.3;
      const heading = Math.atan2(mob.headingX ?? 0, -(mob.headingZ ?? -1));
      for (const part of mobBoxes(mob, time, heading, flashed)) {
        appendBox(positions, colors, uvs, tiles, part);
      }
    }
    for (const villager of villagers) {
      appendShadow(shadowPositions, shadowColors, shadowUvs, villager);
      for (const part of villagerBoxes(villager, time, faceYaw(villager.x, villager.z, player.x, player.z))) {
        appendBox(positions, colors, uvs, tiles, part);
      }
    }
    for (const drop of drops) {
      appendShadow(shadowPositions, shadowColors, shadowUvs, drop);
      for (const part of dropBoxes(drop, time)) appendBox(positions, colors, uvs, tiles, part);
    }
    const eye = [player.x, player.y + EYE_HEIGHT, player.z];
    const direction = cameraDirection(player);
    const right = normalize(cross(direction, [0, 1, 0]));
    const up = normalize(cross(right, direction));
    const selectedBlock = blockForItem(selectedItem(inventory, selectedSlot));
    const swing = Math.max(0, Math.min(1, (0.26 - (time - handSwingTime)) / 0.26));
    for (const part of firstPersonHandParts({
      eye,
      direction,
      right,
      up,
      cameraYaw: player.yaw,
      cameraPitch: player.pitch,
      time,
      speed: visualSpeed,
      grounded: player.grounded,
      selectedBlock,
      selectedItem: selectedItem(inventory, selectedSlot),
      swing,
    })) appendBox(positions, colors, uvs, tiles, part);
    appendMiningCrack(positions, colors, uvs, tiles);
    shadowVertexCount = shadowPositions.length / 3;
    shadowQuadCount = shadowVertexCount / 6;
    dynamicVertexCount = positions.length / 3;
    dynamicQuadCount = dynamicVertexCount / 6;
    gl.bindBuffer(gl.ARRAY_BUFFER, dynamicPositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, dynamicColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, dynamicUvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, dynamicTileBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(tiles), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, shadowPositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(shadowPositions), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, shadowColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(shadowColors), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, shadowUvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(shadowUvs), gl.DYNAMIC_DRAW);
    visibleFaceCount = terrainQuadCount + waterQuadCount + dynamicQuadCount;
    const statsTick = Math.floor(time * 4);
    if (statsTick !== dynamicStatsTick) {
      dynamicStatsTick = statsTick;
      statsEl.textContent = `${blockCount} blocks · ${visibleFaceCount} faces · ${world.activeChunkCount()} chunks · ${mobs.filter((mob) => mob.alive).length} mobs · ${villagers.length} villagers · ${drops.length} drops`;
    }
  }

  function appendTexturedQuad(positions, colors, uvs, quad, materials = null, tiles = null) {
    const color = blockColor(quad.block, quad.faceIndex, quad.x, quad.z, quad.light);
    const corners = quadCorners(quad);
    const uv = atlasUV(blockFaceTileAt(quad.block, quad.faceIndex, quad.x, quad.z));
    const tileRect = quad.faceIndex >= 2
      ? [uv[0], uv[5], uv[4], uv[1]]
      : [uv[0], uv[1], uv[4], uv[5]];
    const localUv = [[0, 0], [quad.width, 0], [quad.width, quad.height], [0, quad.height]];
    for (const cornerIndex of [0, 1, 2, 0, 2, 3]) {
      const corner = corners[cornerIndex];
      const ao = quad.ao?.[cornerIndex] ?? 1;
      positions.push(corner[0], corner[1], corner[2]);
      colors.push(color[0] * ao, color[1] * ao, color[2] * ao);
      uvs.push(localUv[cornerIndex][0], localUv[cornerIndex][1]);
      if (tiles !== null) tiles.push(...tileRect);
      if (materials !== null) {
        materials.push(quad.block === 7 ? 1 : quad.block === 21 ? 2 : quad.block === 24 ? 3 : 10 + quad.block);
      }
    }
  }

  function quadContainsCell(quad, x, y, z) {
    if (quad.faceIndex === 0 || quad.faceIndex === 1) {
      return y === quad.y
        && x >= quad.u && x < quad.u + quad.width
        && z >= quad.v && z < quad.v + quad.height;
    }
    if (quad.faceIndex === 2 || quad.faceIndex === 3) {
      return x === quad.x
        && z >= quad.u && z < quad.u + quad.width
        && y >= quad.v && y < quad.v + quad.height;
    }
    return z === quad.z
      && x >= quad.u && x < quad.u + quad.width
      && y >= quad.v && y < quad.v + quad.height;
  }

  function patchHiddenTerrainGpu(terrain) {
    if (hiddenTerrainBlocks.size === 0 || terrain.vertexData === null) return false;
    const hidden = [...hiddenTerrainBlocks].map((key) => key.split(",").map(Number));
    let opaqueVertex = 0;
    let waterVertex = 0;
    let patched = false;
    for (const quad of terrain.quads) {
      const water = quad.block === 7 || quad.block === 21 || quad.block === 24;
      const vertexOffset = (quad.block === 7 || quad.block === 21 || quad.block === 24)
        ? waterVertex
        : opaqueVertex;
      const shouldHide = hidden.some(([x, y, z]) => quadContainsCell(quad, x, y, z));
      if (shouldHide) {
        const positions = new Float32Array(18);
        for (let vertex = 0; vertex < 6; vertex += 1) {
          positions[vertex * 3 + 1] = -10000;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, water ? waterPositionBuffer : positionBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, vertexOffset * 12, positions);
        patched = true;
      }
      if (water) waterVertex += 6;
      else opaqueVertex += 6;
    }
    return patched;
  }

  function rebuildMesh(merge = true) {
    if (terrainImmediateDirty) {
      terrainMeshCache.rebuildDirty();
      if (patchHiddenTerrainGpu(terrainMeshCache.snapshot(merge))) {
        terrainImmediateDirty = false;
        return;
      }
      terrainImmediateDirty = false;
    }
    terrainMeshCache.rebuildDirty();
    const terrain = terrainMeshCache.snapshot(merge);
    if (!terrainMeshCache.pending && hiddenTerrainBlocks.size > 0) hiddenTerrainBlocks.clear();
    blockCount = terrain.blockCount;
    let positions;
    let colors;
    let uvs;
    let terrainMaterials;
    let tiles;
    let waterPositions;
    let waterColors;
    let waterUvs;
    let waterMaterials;
    let waterTiles;

    if (terrain.vertexData !== null) {
      const opaque = terrain.vertexData.opaque;
      const water = terrain.vertexData.water;
      positions = concatFloat32Arrays(opaque.positions, horizonMesh.opaque.positions);
      colors = concatFloat32Arrays(opaque.colors, horizonMesh.opaque.colors);
      uvs = concatFloat32Arrays(opaque.uvs, horizonMesh.opaque.uvs);
      terrainMaterials = concatFloat32Arrays(opaque.materials, horizonMesh.opaque.materials);
      tiles = concatFloat32Arrays(opaque.tiles, horizonMesh.opaque.tiles);
      waterPositions = concatFloat32Arrays(water.positions, horizonMesh.water.positions);
      waterColors = concatFloat32Arrays(water.colors, horizonMesh.water.colors);
      waterUvs = concatFloat32Arrays(water.uvs, horizonMesh.water.uvs);
      waterMaterials = concatFloat32Arrays(water.materials, horizonMesh.water.materials);
      waterTiles = concatFloat32Arrays(water.tiles, horizonMesh.water.tiles);
      terrainQuadCount = opaque.quadCount + horizonMesh.opaque.quadCount;
      waterQuadCount = water.quadCount + horizonMesh.water.quadCount;
    } else {
      const positionValues = [];
      const colorValues = [];
      const uvValues = [];
      const terrainMaterialValues = [];
      const tileValues = [];
      const waterPositionValues = [];
      const waterColorValues = [];
      const waterUvValues = [];
      const waterMaterialValues = [];
      const waterTileValues = [];
      terrainQuadCount = 0;
      waterQuadCount = 0;
      for (const quad of terrain.quads) {
        if (quad.block === 7 || quad.block === 21 || quad.block === 24) {
          appendTexturedQuad(waterPositionValues, waterColorValues, waterUvValues, quad, waterMaterialValues, waterTileValues);
          waterQuadCount += 1;
        } else {
          appendTexturedQuad(positionValues, colorValues, uvValues, quad, terrainMaterialValues, tileValues);
          terrainQuadCount += 1;
        }
      }
      positionValues.push(...horizonMesh.opaque.positions);
      colorValues.push(...horizonMesh.opaque.colors);
      uvValues.push(...horizonMesh.opaque.uvs);
      terrainMaterialValues.push(...horizonMesh.opaque.materials);
      tileValues.push(...horizonMesh.opaque.tiles);
      terrainQuadCount += horizonMesh.opaque.quadCount;
      waterPositionValues.push(...horizonMesh.water.positions);
      waterColorValues.push(...horizonMesh.water.colors);
      waterUvValues.push(...horizonMesh.water.uvs);
      waterMaterialValues.push(...horizonMesh.water.materials);
      waterTileValues.push(...horizonMesh.water.tiles);
      waterQuadCount += horizonMesh.water.quadCount;
      positions = new Float32Array(positionValues);
      colors = new Float32Array(colorValues);
      uvs = new Float32Array(uvValues);
      terrainMaterials = new Float32Array(terrainMaterialValues);
      tiles = new Float32Array(tileValues);
      waterPositions = new Float32Array(waterPositionValues);
      waterColors = new Float32Array(waterColorValues);
      waterUvs = new Float32Array(waterUvValues);
      waterMaterials = new Float32Array(waterMaterialValues);
      waterTiles = new Float32Array(waterTileValues);
    }
    terrainVertexCount = positions.length / 3;
    waterVertexCount = waterPositions.length / 3;
    if (typeof window !== "undefined" && !window.__meshLogged) {
      window.__meshLogged = true;
      console.log(JSON.stringify({
        uvHead: uvs.slice(0, 24),
        colorHead: colors.slice(0, 24),
        posHead: positions.slice(0, 18),
      }));
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, terrainMaterialBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, terrainMaterials, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, tileBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, tiles, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, waterPositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, waterPositions, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, waterColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, waterColors, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, waterUvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, waterUvs, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, waterMaterialBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, waterMaterials, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, waterTileBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, waterTiles, gl.DYNAMIC_DRAW);
  }

  streamingMeshScheduler = createMeshRebuildScheduler(
    () => {
      rebuildHorizon();
      rebuildMesh(false);
    },
    (callback) => window.setTimeout(() => window.requestAnimationFrame(callback), 100),
  );

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
  let visualSample = { x: player.x, z: player.z, time: performance.now() };
  let visualSpeed = 0;
  world.loadAround(spawnCell[0], spawnCell[1], undefined, 9);
  terrainMeshCache = createAsyncChunkMeshCache(world, requestMeshBuild);
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
  let mobDomainState = PEACEFUL ? { $: "Nil" } : restoredEntities.mobs;
  if (!PEACEFUL && mobDomainState?.$ === "Con") {
    mobDomainState = Entities.remove_spawn_area(
      mobDomainState,
      BigInt(spawnCell[0]),
      BigInt(spawnCell[1]),
    );
  }
  let mobs = [];
  const mobFlash = new Map();
  let handSwingTime = -10;
  let villagerDomainState = restoreVillagers(savedGame, Villagers.spawn(SEED));
  let villagerPathGrid = Villagers.path_grid(SEED, world.getEdits());
  let villagers = [];
  let villagerTick = Number(savedGame?.villagerTick ?? 0);
  let dropDomainState = restoredEntities.drops;
  let drops = [];
  let simulationTerrainDirty = false;
  let playerStreamingDirty = false;
  let playerSpawnReady = Boolean(savedGame?.player && typeof savedGame.player === "object");
  let entityBucketStats = { mobBuckets: 0, activeMobBuckets: 0, dropBuckets: 0, activeDropBuckets: 0 };
  let moveFrameCalls = 0;
  let moveFrameActive = false;

  function invalidateVillagerPath(x, y, z) {
    if (x < 17 || x >= 45 || z < 19 || z >= 45 || y > 10) return;
    villagerPathGrid = Villagers.path_grid(SEED, world.getEdits());
  }

  function editValues(edits) {
    const values = new Map();
    for (let node = edits; node?.$ === "Con"; node = node.tail) {
      const edit = node.head;
      const x = Number(edit.x);
      const y = Number(edit.y);
      const z = Number(edit.z);
      values.set(`${x},${y},${z}`, Number(edit.block));
    }
    return values;
  }

  function activeEditChanges(previousEdits, nextEdits) {
    const previous = editValues(previousEdits);
    const changes = [];
    for (let node = nextEdits; node?.$ === "Con"; node = node.tail) {
      const edit = node.head;
      const x = Number(edit.x);
      const y = Number(edit.y);
      const z = Number(edit.z);
      const value = Number(edit.block);
      if (previous.get(`${x},${y},${z}`) === value || !world.isActive(x, z)) continue;
      changes.push({ x, y, z, value });
    }
    return changes;
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
    rebuildMesh();
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

  function fluidSamples(list) {
    const unique = new Map();
    for (let node = list; node?.$ === "Con"; node = node.tail) {
      const flow = node.head;
      const x = Number(flow.x);
      const y = Number(flow.y);
      const z = Number(flow.z);
      for (const [sampleX, sampleY, sampleZ] of [
        [x, y - 1, z],
        [x - 1, y, z],
        [x + 1, y, z],
        [x, y, z - 1],
        [x, y, z + 1],
      ]) {
        if (!inside(sampleX, sampleY, sampleZ) || !world.isActive(sampleX, sampleZ)) continue;
        const key = `${sampleX},${sampleY},${sampleZ}`;
        if (!unique.has(key)) {
          unique.set(key, Fluids.sample(
            BigInt(sampleX),
            BigInt(sampleY),
            BigInt(sampleZ),
            Number(blockAt(sampleX, sampleY, sampleZ) ?? 1),
          ));
        }
      }
    }
    let samples = { $: "Nil" };
    for (const sample of [...unique.values()].reverse()) {
      samples = { $: "Con", head: sample, tail: samples };
    }
    return samples;
  }

  function isFluidBlock(block) {
    return block === 7 || block === 21;
  }

  function isTransientBlock(block) {
    return isFluidBlock(block) || block === 24;
  }

  function fireSamples(list, fluids = { $: "Nil" }) {
    const unique = new Map();
    for (const sourceList of [list, fluids]) {
      for (let node = sourceList; node?.$ === "Con"; node = node.tail) {
      const cell = node.head;
      const x = Number(cell.x);
      const y = Number(cell.y);
      const z = Number(cell.z);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          for (let dz = -1; dz <= 1; dz += 1) {
            const sampleX = x + dx;
            const sampleY = y + dy;
            const sampleZ = z + dz;
            if (!inside(sampleX, sampleY, sampleZ) || !world.isActive(sampleX, sampleZ)) continue;
            const key = `${sampleX},${sampleY},${sampleZ}`;
            if (!unique.has(key)) {
              unique.set(key, Fire.sample(
                BigInt(sampleX),
                BigInt(sampleY),
                BigInt(sampleZ),
                Number(blockAt(sampleX, sampleY, sampleZ) ?? 1),
              ));
            }
          }
        }
      }
    }
    }
    let samples = { $: "Nil" };
    for (const sample of [...unique.values()].reverse()) {
      samples = { $: "Con", head: sample, tail: samples };
    }
    return samples;
  }

  function tickFluids() {
    const current = Fluids.state_flows(fluidState);
    const samples = fluidSamples(current);
    const previous = fluidState;
    const currentFire = Fire.state_cells(fireState);
    const previousFire = fireState;
    const fireSampleList = fireSamples(currentFire, current);
    const reactionEdits = Fluids.reactions(fluidState, samples);
    const reactedState = Fluids.react(fluidState, samples);
    const advanced = Simulation.tick_with_fluids_and_fire(
      simulationState,
      1n,
      waterSourcesForFarmland(),
      reactedState,
      samples,
      fireState,
      fireSampleList,
    );
    simulationState = Simulation.tick_simulation(advanced);
    fluidState = Simulation.tick_fluids(advanced);
    fireState = Simulation.tick_fire(advanced);
    cropState = Simulation.sim_crops(simulationState);
    farmlandState = Simulation.sim_farmland(simulationState);
    const edits = Fluids.changes(previous, fluidState);
    const fireEdits = Fire.changes(previousFire, fireState);
    const batch = [];
    for (let node = edits; node?.$ === "Con"; node = node.tail) {
      const edit = node.head;
      const x = Number(edit.x);
      const y = Number(edit.y);
      const z = Number(edit.z);
      const value = Number(edit.block);
      if (!inside(x, y, z) || !world.isActive(x, z)) continue;
      const currentBlock = blockAt(x, y, z);
      if (value !== 0 && (isFluidBlock(value) || value === 24) && currentBlock !== 0) continue;
      if (value === 0 && !isTransientBlock(currentBlock)) continue;
      batch.push({ x, y, z, value });
    }
    for (let node = reactionEdits; node?.$ === "Con"; node = node.tail) {
      const edit = node.head;
      const x = Number(edit.x);
      const y = Number(edit.y);
      const z = Number(edit.z);
      if (!inside(x, y, z) || !world.isActive(x, z)) continue;
      batch.push({ x, y, z, value: Number(edit.block) });
    }
    for (let node = fireEdits; node?.$ === "Con"; node = node.tail) {
      const edit = node.head;
      const x = Number(edit.x);
      const y = Number(edit.y);
      const z = Number(edit.z);
      const value = Number(edit.block);
      if (!inside(x, y, z) || !world.isActive(x, z)) continue;
      const currentBlock = blockAt(x, y, z);
      if (value !== 0 && value === 24 && currentBlock !== 0) continue;
      if (value === 0 && currentBlock !== 24) continue;
      batch.push({ x, y, z, value });
    }
    if (batch.length > 0) {
      setBlocks(batch);
      for (const change of batch) {
        terrainMeshCache.invalidateBlock(change.x, change.z);
      }
    }
    return batch.length > 0;
  }

  function seedWaterAt(x, y, z, level = 8) {
    if (!inside(x, y, z) || !world.isActive(x, z) || blockAt(x, y, z) !== 0) return false;
    fluidState = Fluids.seed(fluidState, BigInt(x), BigInt(y), BigInt(z), Number(level));
    setBlock(x, y, z, 7);
    terrainMeshCache.invalidateBlock(x, z);
    saveGame();
    rebuildMesh();
    return true;
  }

  function seedLavaAt(x, y, z, level = 8) {
    if (!inside(x, y, z) || !world.isActive(x, z) || blockAt(x, y, z) !== 0) return false;
    fluidState = Fluids.seed_lava(fluidState, BigInt(x), BigInt(y), BigInt(z), Number(level));
    setBlock(x, y, z, 21);
    terrainMeshCache.invalidateBlock(x, z);
    saveGame();
    rebuildMesh();
    return true;
  }

  function igniteFireAt(x, y, z) {
    if (!inside(x, y, z) || !world.isActive(x, z) || blockAt(x, y, z) !== 0) return false;
    fireState = Fire.ignite(fireState, BigInt(x), BigInt(y), BigInt(z));
    setBlock(x, y, z, 24);
    terrainMeshCache.invalidateBlock(x, z);
    saveGame();
    rebuildMesh();
    return true;
  }

  function collectWaterAt(x, y, z) {
    const slot = furnaceSlot("empty_bucket");
    if (slot === -1 || blockAt(x, y, z) !== 7) return false;
    if (!fillBucket(inventory, slot)) return false;
    fluidState = Fluids.remove(fluidState, BigInt(x), BigInt(y), BigInt(z));
    setBlock(x, y, z, 0);
    terrainMeshCache.invalidateBlock(x, z);
    saveGame();
    rebuildMesh();
    return true;
  }

  function collectLavaAt(x, y, z) {
    const slot = furnaceSlot("empty_bucket");
    if (slot === -1 || blockAt(x, y, z) !== 21) return false;
    if (!fillLavaBucket(inventory, slot)) return false;
    fluidState = Fluids.remove(fluidState, BigInt(x), BigInt(y), BigInt(z));
    setBlock(x, y, z, 0);
    terrainMeshCache.invalidateBlock(x, z);
    saveGame();
    rebuildMesh();
    return true;
  }

  function placeWaterAt(x, y, z) {
    const slot = furnaceSlot("water_bucket");
    if (slot === -1 || !inside(x, y, z) || blockAt(x, y, z) !== 0 || overlapsPlayer(player, x, y, z)) return false;
    if (!emptyBucket(inventory, slot)) return false;
    fluidState = Fluids.seed(fluidState, BigInt(x), BigInt(y), BigInt(z), 8);
    setBlock(x, y, z, 7);
    terrainMeshCache.invalidateBlock(x, z);
    saveGame();
    rebuildMesh();
    return true;
  }

  function placeLavaAt(x, y, z) {
    const slot = furnaceSlot("lava_bucket");
    if (slot === -1 || !inside(x, y, z) || blockAt(x, y, z) !== 0 || overlapsPlayer(player, x, y, z)) return false;
    if (!emptyLavaBucket(inventory, slot)) return false;
    fluidState = Fluids.seed_lava(fluidState, BigInt(x), BigInt(y), BigInt(z), 8);
    setBlock(x, y, z, 21);
    terrainMeshCache.invalidateBlock(x, z);
    saveGame();
    rebuildMesh();
    return true;
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
        headingX: Number(mob.heading_x ?? 0),
        headingZ: Number(mob.heading_z ?? -1),
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

  function mobRegionsFor(domainList) {
    const regions = [];
    for (let node = domainList; node?.$ === "Con"; node = node.tail) {
      const mob = node.head;
      const region = mobRegion(world, Number(mob.x), Number(mob.y), Number(mob.z));
      regions.push({
        $: "Region",
        blocks: region.blocks,
        origin_x: region.originX,
        origin_y: region.originY,
        origin_z: region.originZ,
        width: region.width,
        height: region.height,
        depth: region.depth,
      });
    }
    let list = { $: "Nil" };
    for (let index = regions.length - 1; index >= 0; index -= 1) {
      list = { $: "Con", head: regions[index], tail: list };
    }
    return list;
  }

  function stepMobsBudgeted(dt) {
    const partition = splitActiveEntityBuckets(
      mobDomainState,
      (mob) => ({ x: Number(mob.x), z: Number(mob.z) }),
      "mob",
    );
    mobDomainState = concatBendLists(
      Entities.step_world(
        partition.active,
        player.x,
        player.z,
        dt,
        worldTime,
        BigInt(DOMAIN_COORDINATE_OFFSET),
        mobRegionsFor(partition.active),
      ),
      Entities.step_budgeted(partition.dormant, player.x, player.z, dt / 5, 32.0),
    );
  }

  function refreshMobs() {
    if (mobDomainState === null) mobDomainState = PEACEFUL
      ? { $: "Nil" }
      : Entities.spawn_for_player(
        SEED,
        0n,
        0n,
        World.width(),
        World.depth(),
        BigInt(spawnCell[0]),
        BigInt(spawnCell[1]),
        false,
      );
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
    if (world.pendingChunkCount() > 0) return;
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
    const changes = activeEditChanges(currentEdits, nextEdits);
    if (changes.length > 0 && world.patchEdits(nextEdits, changes)) {
      world.loadAround(player.x, player.z);
      for (const change of changes) terrainMeshCache.invalidateBlock(change.x, change.z);
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
    handSwingTime = worldTime;
    if (heldItemViewEl !== null) {
      heldItemViewEl.classList.remove("is-swinging");
      void heldItemViewEl.offsetWidth;
      heldItemViewEl.classList.add("is-swinging");
      window.setTimeout(() => heldItemViewEl.classList.remove("is-swinging"), 260);
    }
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
    const result = Entities.attack(mobDomainState, BigInt(nearest.id), 4.0, player.x, player.z, dropDomainState);
    if (!result.hit) return false;
    mobDomainState = result.mobs;
    mobs = mobViews(mobDomainState);
    dropDomainState = result.drops;
    drops = dropViews(dropDomainState);
    if (result.drops?.$ === "Con") killCount += 1;
    mobFlash.set(nearest.id, worldTime);
    if (mobFlash.size > 64) {
      for (const key of mobFlash.keys()) {
        if (worldTime - mobFlash.get(key) > 1) mobFlash.delete(key);
        if (mobFlash.size <= 32) break;
      }
    }
    crosshairEl?.animate(
      [
        { transform: "translate(-50%, -50%) scale(1)" },
        { transform: "translate(-50%, -50%) scale(1.8)" },
        { transform: "translate(-50%, -50%) scale(1)" },
      ],
      { duration: 180 },
    );
    setInventoryMessage("Mob hit.");
    rebuildDynamicMesh(worldTime);
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

  const slotIconUrls = new Map();
  function slotIconUrl(name) {
    if (slotIconUrls.has(name)) return slotIconUrls.get(name);
    const texture = itemTexture(name);
    if (texture === null) return null;
    const iconCanvas = document.createElement("canvas");
    iconCanvas.width = 24;
    iconCanvas.height = 24;
    const iconContext = iconCanvas.getContext("2d");
    if (iconContext === null) return null;
    drawItemTexture(iconContext, texture, { size: 24, clear: true });
    const url = iconCanvas.toDataURL("image/png");
    slotIconUrls.set(name, url);
    return url;
  }

  function paintSlotIcons() {
    for (const swatch of document.querySelectorAll(".slot-swatch[data-item]")) {
      const name = swatch.dataset.item;
      if (name === undefined || name === "") continue;
      const url = slotIconUrl(name);
      if (url === null) continue;
      swatch.style.backgroundColor = "transparent";
      swatch.style.backgroundImage = `url("${url}")`;
    }
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
      <span class="slot-swatch" data-item="${empty ? "" : name}" style="--slot-color: ${itemColor(item)}"></span>
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
    paintSlotIcons();
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
    cancelMining();
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
    if (open) paintSlotIcons();
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
    furnaceToggleEl.hidden = furnaceControlHidden(activeFurnace, open);
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
    if (block === null) return false;
    let nextFurnaces = furnaceWorldState;
    if (block === 11) {
      const added = Furnaces.add(furnaceWorldState, BigInt(x), BigInt(y), BigInt(z));
      if (!added.ok) return false;
      nextFurnaces = added.world;
    }
    const placement = placeInteraction(
      inventory,
      selectedSlot,
      item,
      block,
      x,
      y,
      z,
      blockAt(x, y, z) === 0,
      inside(x, y, z),
      overlapsPlayer(player, x, y, z),
    );
    if (!placement.ok) return false;
    furnaceWorldState = nextFurnaces;
    if (block === 11) {
      const chunkX = Math.floor(x / CHUNK_SIZE);
      const chunkZ = Math.floor(z / CHUNK_SIZE);
      world.pinChunk(chunkX, chunkZ);
      simulationState = Simulation.pin(simulationState, BigInt(chunkX), BigInt(chunkZ));
    }
    setBlock(x, y, z, Number(placement.edit.block));
    invalidateVillagerPath(x, y, z);
    terrainMeshCache.invalidateBlock(x, z);
    if (block === 11) {
      activeFurnace = [x, y, z];
      furnaceToggleEl.hidden = false;
    }
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

  let miningState = null;

  function renderMiningProgress(now = performance.now()) {
    const active = miningState !== null;
    const progress = miningProgress(miningState, now);
    if (miningProgressEl !== null) miningProgressEl.hidden = !active;
    if (miningProgressFillEl !== null) {
      miningProgressFillEl.style.width = `${(progress * 100).toFixed(2)}%`;
      miningProgressFillEl.setAttribute("aria-valuenow", String(Math.round(progress * 100)));
    }
  }

  function cancelMining() {
    miningState = null;
    renderMiningProgress();
  }

  function completeMiningAt(x, y, z) {
    const removedBlock = blockAt(x, y, z);
    if (isCropBlock(removedBlock) && removedBlock === 19 && harvestCropAt(x, y, z)) {
      refreshInventoryUi();
      updateHud();
      rebuildMesh();
      return true;
    }
    const mining = mineInteraction(
      inventory,
      selectedSlot,
      selectedItem(inventory, selectedSlot),
      removedBlock,
      x,
      y,
      z,
    );
    if (!mining.ok) {
      setInventoryMessage("The selected tool cannot mine this block.");
      return false;
    }
    setBlock(x, y, z, Number(mining.edit.block));
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
        activeFurnace = null;
        setFurnaceOpen(false);
      }
    }
    refreshInventoryUi();
    updateHud();
    rebuildMesh();
    return true;
  }

  function startMining(target) {
    const [x, y, z] = target.hit;
    const block = blockAt(x, y, z);
    if (isCropBlock(block) && block === 19) {
      completeMiningAt(x, y, z);
      return;
    }
    const item = selectedItem(inventory, selectedSlot);
    const duration = miningDuration(item, block);
    if (!(duration > 0)) {
      setInventoryMessage("The selected tool cannot mine this block.");
      return;
    }
    miningState = createMiningState({
      x,
      y,
      z,
      block,
      slot: selectedSlot,
      item: itemId(item),
      duration,
      startedAt: performance.now(),
    });
    renderMiningProgress(miningState.startedAt);
  }

  function updateMining(now) {
    if (miningState === null) {
      renderMiningProgress(now);
      return;
    }
    const state = miningState;
    const target = raycast(world, player);
    if (!miningStateMatches(
      state,
      target,
      blockAt,
      selectedSlot,
      itemId(selectedItem(inventory, selectedSlot)),
    )) {
      cancelMining();
      return;
    }
    renderMiningProgress(now);
    if (miningProgress(state, now) < 1) return;
    cancelMining();
    completeMiningAt(state.x, state.y, state.z);
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
      startMining(target);
      return;
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

  const heartPips = [];
  const hungerPips = [];
  for (let index = 0; index < 10; index += 1) {
    const heart = document.createElement("div");
    heart.className = "pip full";
    heartsEl.append(heart);
    heartPips.push(heart);
    const food = document.createElement("div");
    food.className = "pip full";
    hungerEl.append(food);
    hungerPips.push(food);
  }
  let vitalsKey = "";
  let lastHealth = 20;
  let debugOverlayTick = -1;

  function paintPips(pips, points) {
    const clamped = Math.max(0, Math.min(20, points));
    pips.forEach((pip, index) => {
      const value = Math.max(0, Math.min(2, clamped - index * 2));
      pip.className = `pip${value >= 2 ? " full" : value > 0 ? " half" : ""}`;
    });
  }

  function updateHud() {
    const item = selectedItem(inventory, selectedSlot);
    const name = itemName(item);
    const count = item === null ? 0 : item.count;
    coordsEl.textContent = `x ${player.x.toFixed(1)} · y ${player.y.toFixed(1)} · z ${player.z.toFixed(1)}`;
    seedEl.textContent = `seed: ${seedLabel(SEED)}`;
    statsEl.textContent = `${blockCount} blocks · ${terrainQuadCount + waterQuadCount} faces · ${world.activeChunkCount()} chunks · ${mobs.filter((mob) => mob.alive).length} mobs · ${villagers.length} villagers · ${drops.length} drops`;
    selectedEl.textContent = count > 0
      ? `${name}${count > 1 ? ` ×${count}` : ""}`
      : "Empty hand";
    const key = `${Math.round(player.health * 2)}|${Math.round(player.hunger * 2)}`;
    if (key !== vitalsKey) {
      vitalsKey = key;
      paintPips(heartPips, player.health);
      paintPips(hungerPips, player.hunger);
    }
    if (player.health < lastHealth - 0.001 && damageFlashEl !== null) {
      damageFlashEl.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 450 });
    }
    lastHealth = player.health;
  }

  function atlasTexelDiagnostics(tile) {
    const size = 16;
    const rendered = readAtlasTilePixels(gl, atlasTexture, tile, size);
    const canvasRef = atlasSourceCanvas(atlasTexture);
    const context = canvasRef?.getContext("2d", { willReadFrequently: true });
    if (context === null || context === undefined) throw new Error("Atlas source pixels are unavailable");
    const source = context.getImageData(0, 0, canvasRef.width, canvasRef.height).data;
    const tileX = (tile % 5) * size;
    const tileY = Math.floor(tile / 5) * size;
    let mismatches = 0;
    let flippedMismatches = 0;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const renderedIndex = (y * size + x) * 4;
        const normalIndex = ((tileY + y) * canvasRef.width + tileX + x) * 4;
        const flippedIndex = ((tileY + size - 1 - y) * canvasRef.width + tileX + x) * 4;
        for (let channel = 0; channel < 4; channel += 1) {
          if (rendered[renderedIndex + channel] !== source[normalIndex + channel]) mismatches += 1;
          if (rendered[renderedIndex + channel] !== source[flippedIndex + channel]) flippedMismatches += 1;
        }
      }
    }
    return { tile, pixels: size * size, mismatches, flippedMismatches };
  }

  function frameDiagnostics() {
    return {
      ...frameMetrics,
      player: { ...player },
      playerSpawnReady,
      activeChunks: world.activeChunkCount(),
      pendingChunks: world.pendingChunkCount(),
      pinnedChunks: world.pinnedChunkCount(),
      blockCount,
      terrainQuads: terrainQuadCount,
      waterQuads: waterQuadCount,
      dynamicQuads: dynamicQuadCount,
      shadowQuads: shadowQuadCount,
      meshRebuilds: terrainMeshCache.rebuildCount,
      meshRebuildRequests: streamingMeshScheduler?.requestCount ?? 0,
      meshRebuildRuns: streamingMeshScheduler?.runCount ?? 0,
      meshRebuildPending: (streamingMeshScheduler?.pending ?? false) || (terrainMeshCache?.pending ?? false),
      meshWorkerRequests: meshWorkerRequestCount,
      meshWorkerResponses: meshWorkerResponseCount,
      meshWorkerRejects: meshWorkerRejectCount,
      workerRequests: workerRequestCount,
      workerHydrates: workerHydrateCount,
      workerRejects: workerRejectCount,
      simulationTime: Number(Simulation.time(simulationState)),
      mobs: mobs.filter((mob) => mob.alive).length,
      villagers: villagers.length,
      drops: drops.length,
      worldTime,
      daylight,
      paused,
    };
  }

  function updateDebugOverlay() {
    if (!debugVisible || debugOverlayEl === null) return;
    const tick = Math.floor(performance.now() / 250);
    if (tick === debugOverlayTick) return;
    debugOverlayTick = tick;
    debugOverlayEl.textContent = formatDebugText(frameDiagnostics());
  }

  function setDebugVisible(visible) {
    debugVisible = Boolean(visible);
    if (debugOverlayEl !== null) debugOverlayEl.hidden = !debugVisible;
    updateDebugOverlay();
  }

  function toggleDebugOverlay() {
    setDebugVisible(!debugVisible);
  }

  function saveGame() {
    try {
      saveTransactional(window.localStorage, SAVE_KEY, {
        version: 1,
        edits: world.getEdits(),
        player: { ...player },
        inventory: inventory.map((item) => ({ ...item })),
        furnaces: furnaceWorldState,
        crops: cropState,
        farmland: farmlandState,
        fluids: fluidState,
        fire: fireState,
        simulation: simulationState,
        entities: packEntityState(mobDomainState, dropDomainState),
        villagers: villagerDomainState,
        villagerTick: BigInt(villagerTick),
      });
      if (session.profile !== null) {
        let doc = loadProfilesDoc(window.localStorage);
        if (session.worldId !== null && getWorld(doc, session.profileId, session.worldId) !== null) {
          doc = touchWorld(doc, session.profileId, session.worldId);
        } else {
          doc = touchProfile(doc, session.profileId);
        }
        saveProfilesDoc(window.localStorage, doc);
      }
    } catch {
      // Saving is best-effort when storage is disabled or full.
    }
  }

  function render() {
    resizeCanvas();
    const palette = skyPalette(daylight);
    const sky = palette.top;
    const skyTick = Math.floor(worldTime * 4);
    if (skyTick !== skyCssTick) {
      skyCssTick = skyTick;
      canvas.style.setProperty("--sky-top", palette.cssTop);
      canvas.style.setProperty("--sky-horizon", palette.cssHorizon);
      canvas.style.setProperty("--sun-alpha", String(Math.max(0, ((daylight - 0.28) / 0.72) * 0.24)));
    }
    gl.clearColor(sky[0], sky[1], sky[2], 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(program);

    const motion = cameraMotion(worldTime, {
      speed: visualSpeed,
      grounded: player.grounded,
    });
    heldItemViewEl?.style.setProperty("--held-sway", `${(motion.sway * 180).toFixed(2)}px`);
    heldItemViewEl?.style.setProperty("--held-bob", `${(-motion.bob * 180).toFixed(2)}px`);
    heldItemViewEl?.style.setProperty("--held-roll", `${(motion.roll * 140).toFixed(2)}deg`);
    const eye = [player.x + motion.sway * 0.5, player.y + EYE_HEIGHT + motion.bob, player.z];
    const direction = cameraDirection(player);
    const center = [eye[0] + direction[0], eye[1] + direction[1], eye[2] + direction[2]];
    const view = lookAt(eye, center, [0, 1, 0]);
    const projection = perspective(options.fov * Math.PI / 180, canvas.width / canvas.height, 0.05, RENDER_FAR);
    gl.uniformMatrix4fv(viewProjectionLocation, false, multiply4(projection, view));
    gl.uniform3f(cameraLocation, eye[0], eye[1], eye[2]);
    gl.uniform1f(timeLocation, worldTime);
    gl.uniform1f(daylightLocation, daylight);
    gl.uniform3f(skyColorLocation, sky[0], sky[1], sky[2]);

    gl.uniform1f(surfacePassLocation, 0);
    gl.uniform1f(shadowPassLocation, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, terrainMaterialBuffer);
    gl.enableVertexAttribArray(materialLocation);
    gl.vertexAttribPointer(materialLocation, 1, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.enableVertexAttribArray(colorLocation);
    gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.enableVertexAttribArray(uvLocation);
    gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, tileBuffer);
    gl.enableVertexAttribArray(tileLocation);
    gl.vertexAttribPointer(tileLocation, 4, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, terrainVertexCount);
    if (waterVertexCount > 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.uniform1f(surfacePassLocation, 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, waterPositionBuffer);
      gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, waterColorBuffer);
      gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, waterUvBuffer);
      gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, waterMaterialBuffer);
      gl.enableVertexAttribArray(materialLocation);
      gl.vertexAttribPointer(materialLocation, 1, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, waterTileBuffer);
      gl.enableVertexAttribArray(tileLocation);
      gl.vertexAttribPointer(tileLocation, 4, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, waterVertexCount);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
    if (shadowVertexCount > 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.uniform1f(shadowPassLocation, 1);
      gl.disableVertexAttribArray(materialLocation);
      gl.vertexAttrib1f(materialLocation, 0);
      gl.disableVertexAttribArray(tileLocation);
      gl.vertexAttrib4f(tileLocation, 0, 0, 1, 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, shadowPositionBuffer);
      gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, shadowColorBuffer);
      gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, shadowUvBuffer);
      gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, shadowVertexCount);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
    gl.uniform1f(shadowPassLocation, 0);
    gl.uniform1f(surfacePassLocation, 0);
    gl.disableVertexAttribArray(materialLocation);
    gl.vertexAttrib1f(materialLocation, 0);
    gl.disableVertexAttribArray(tileLocation);
    gl.vertexAttrib4f(tileLocation, 0, 0, 1, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, dynamicPositionBuffer);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, dynamicColorBuffer);
    gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, dynamicUvBuffer);
    gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, dynamicTileBuffer);
    gl.enableVertexAttribArray(tileLocation);
    gl.vertexAttribPointer(tileLocation, 4, gl.FLOAT, false, 0, 0);
    gl.uniform1f(miningProgressLocation, miningProgress(miningState, performance.now()));
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, dynamicVertexCount);
    gl.disable(gl.BLEND);
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
  window.addEventListener("mouseup", (event) => {
    if (event.button === 0) cancelMining();
  });
  window.addEventListener("blur", cancelMining);
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  let paused = false;
  let hasLockedOnce = false;
  let deadShown = false;
  let killCount = 0;
  // One daylight cycle (sin(worldTime * 0.08)) lasts 2*PI/0.08 seconds.
  const DAY_SECONDS = 78.54;
  function showDeath() {
    deadShown = true;
    held.clear();
    saveGame();
    if (document.pointerLockElement === canvas && typeof document.exitPointerLock === "function") {
      document.exitPointerLock();
    }
    const days = worldTime / DAY_SECONDS;
    deathStatsEl.textContent = `Survived ${days.toFixed(1)} days · ${killCount} mob ${killCount === 1 ? "kill" : "kills"} · ${WORLD_NAME}`;
    deathEl.hidden = false;
  }
  deathEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (button === null) return;
    if (button.dataset.action === "respawn") {
      respawnPlayer(player, spawnCell, spawnHeight);
      mobDomainState = Entities.remove_spawn_area(
        mobDomainState,
        BigInt(spawnCell[0]),
        BigInt(spawnCell[1]),
      );
      refreshMobs();
      deadShown = false;
      deathEl.hidden = true;
      updateHud();
      rebuildDynamicMesh(worldTime);
      saveGame();
      pointerLock.request();
    } else if (button.dataset.action === "quit-title") {
      saveGame();
      window.location.href = window.location.pathname;
    }
  });
  function setPaused(open) {
    if (open === paused) return;
    paused = open;
    if (open) {
      held.clear();
      cancelMining();
      saveGame();
      if (document.pointerLockElement === canvas && typeof document.exitPointerLock === "function") {
        document.exitPointerLock();
      }
      pauseSubtitleEl.textContent = `${WORLD_NAME} · ${PROFILE_NAME}`;
    }
    pauseEl.hidden = !open;
  }
  pauseEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (button === null) return;
    if (button.dataset.action === "resume") {
      setPaused(false);
      pointerLock.request();
    } else if (button.dataset.action === "quit-title") {
      saveGame();
      window.location.href = window.location.pathname;
    }
  });
  document.addEventListener("pointerlockchange", () => {
    const locked = document.pointerLockElement === canvas;
    cancelMining();
    if (locked) hasLockedOnce = true;
    pointerLock.handleChange();
    updateLockHint();
    if (!locked && hasLockedOnce && !inventoryOpen && !furnaceOpen && !paused && Number(player.health) > 0) {
      setPaused(true);
    }
  });
  document.addEventListener("mousemove", (event) => {
    if (document.pointerLockElement !== canvas) return;
    const sensitivity = options.sensitivity * 0.0022;
    player.yaw += event.movementX * sensitivity;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - event.movementY * sensitivity));
  });
  window.addEventListener("keydown", (event) => {
    if (event.code === "F3") {
      event.preventDefault();
      toggleDebugOverlay();
      return;
    }
    if (paused) return;
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
  rebuildDynamicMesh(worldTime);
  refreshInventoryUi();
  setInventoryOpen(false);
  setFurnaceOpen(false);
  updateLockHint();
  vitalsEl.hidden = false;
  coordsEl.style.display = options.showCoords ? "" : "none";
  const brandSpan = document.querySelector("#hud .brand span");
  if (brandSpan !== null) brandSpan.textContent = `${WORLD_NAME} · ${PROFILE_NAME} · ${worldModeLabel(WORLD_MODE)}`;
  updateHud();
  window.__bend2craft = {
    world: {
      seed: seedLabel(SEED),
      mode: WORLD_MODE,
      chunkSize: CHUNK_SIZE,
      renderRadius: CHUNK_RENDER_RADIUS,
      maxY: MAX_Y,
      get activeChunks() { return world.activeChunkCount(); },
      get pinnedChunks() { return world.pinnedChunkCount(); },
      get pendingChunks() { return world.pendingChunkCount(); },
      get simulationTime() { return Number(Simulation.time(simulationState)); },
      get simulationChunks() { return Number(Simulation.pinned_count(simulationState)); },
      workerCount: chunkWorkers.length,
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
        sample: mesh.quads
          .filter((quad) => quad.block === 4 || quad.block === 5)
          .slice(0, 12)
          .map((quad) => ({
            block: quad.block,
            face: quad.faceIndex,
            x: quad.x,
            y: quad.y,
            z: quad.z,
            light: quad.light,
          })),
      };
    },
    getBlock: (x, y, z) => blockAt(x, y, z),
    setViewForTest: (x, y, z, yaw, pitch) => {
      Object.assign(player, {
        x: Number(x),
        y: Number(y),
        z: Number(z),
        yaw: Number(yaw),
        pitch: Number(pitch),
        velocityY: 0,
        grounded: true,
      });
      cancelMining();
      return raycast(world, player);
    },
    getRaycastTarget: () => raycast(world, player),
    interactForTest: (button) => {
      interact(Number(button));
      return raycast(world, player);
    },
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
    getFluids: () => {
      const flows = [];
      for (let node = Fluids.state_flows(fluidState); node?.$ === "Con"; node = node.tail) {
        flows.push({
          x: Number(node.head.x),
          y: Number(node.head.y),
          z: Number(node.head.z),
          level: Number(node.head.level),
          block: Number(node.head.block),
        });
      }
      return flows;
    },
    getFire: () => {
      const cells = [];
      for (let node = Fire.state_cells(fireState); node?.$ === "Con"; node = node.tail) {
        cells.push({
          x: Number(node.head.x),
          y: Number(node.head.y),
          z: Number(node.head.z),
          age: Number(node.head.age),
        });
      }
      return cells;
    },
    getPlayer: () => ({ ...player }),
    getInputState: () => ({
      held: [...held],
      pointerLocked: document.pointerLockElement === canvas,
      inventoryOpen,
      furnaceOpen,
      paused,
    }),
    getMovementDiagnostics: () => ({ calls: moveFrameCalls, active: moveFrameActive, player: { ...player } }),
    getVisualMotion: () => ({
      speed: visualSpeed,
      sample: { ...visualSample },
      motion: cameraMotion(worldTime, { speed: visualSpeed, grounded: player.grounded }),
    }),
    getFrameDiagnostics: () => ({ ...frameDiagnostics(), debugVisible }),
    getAtlasTexelProbe: (tile = 1) => atlasTexelDiagnostics(Math.trunc(tile)),
    readFramePixels: (x, y, width, height) => {
      const left = Math.trunc(x);
      const bottom = Math.trunc(y);
      const pixelWidth = Math.trunc(width);
      const pixelHeight = Math.trunc(height);
      if (left < 0 || bottom < 0 || pixelWidth < 1 || pixelHeight < 1
        || left + pixelWidth > canvas.width || bottom + pixelHeight > canvas.height) {
        throw new RangeError("frame pixel region is outside the canvas");
      }
      const pixels = new Uint8Array(pixelWidth * pixelHeight * 4);
      gl.readPixels(left, bottom, pixelWidth, pixelHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return Array.from(pixels);
    },
    toggleDebug: toggleDebugOverlay,
    hurt: (amount) => applyDamage(player, amount),
    glBufferSizes: () => {
      const sizes = {};
      for (const [name, buffer] of [
        ["position", positionBuffer],
        ["color", colorBuffer],
        ["uv", uvBuffer],
        ["waterPosition", waterPositionBuffer],
        ["waterColor", waterColorBuffer],
        ["waterUv", waterUvBuffer],
      ]) {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        sizes[name] = gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE);
      }
      return {
        ...sizes,
        terrainVertexCount,
        waterVertexCount,
        dynamicVertexCount,
        positionNull: positionBuffer === null,
        colorNull: colorBuffer === null,
        uvNull: uvBuffer === null,
      };
    },
    toggleInventory,
    loadChunksAt: (x, z, budget = Infinity, render = true) => {
      const result = world.loadAround(x, z, undefined, budget);
      if (result.changed && render) rebuildMesh();
      return result;
    },
    teleportForTest: (x, z, y = 8, yaw = player.yaw, pitch = player.pitch) => {
      setPaused(true);
      Object.assign(player, {
        x: Number(x),
        y: Number(y),
        z: Number(z),
        yaw: Number(yaw),
        pitch: Number(pitch),
        velocityY: 0,
        grounded: true,
      });
      cancelMining();
      rebuildHorizon();
      const result = world.loadAround(player.x, player.z, undefined, 9);
      streamingMeshScheduler?.request();
      updateHud();
      return result;
    },
    resumeForTest: () => {
      setPaused(false);
      return { x: player.x, y: player.y, z: player.z };
    },
    pinChunk: (x, z) => world.pinChunk(x, z),
    unpinChunk: (x, z) => world.unpinChunk(x, z),
    save: saveGame,
    attack: attackNearestMob,
    trade: tradeNearestVillager,
    sleep: sleepAtBed,
    seedWaterAt,
    seedLavaAt,
    igniteFireAt,
    collectWaterAt,
    collectLavaAt,
    placeWaterAt,
    placeLavaAt,
    toggleDoor: toggleDoorAt,
    tickVillagers: (dt = 1) => {
      const changed = updateVillagers(dt);
      if (changed) rebuildDynamicMesh(worldTime);
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
    if (!playerSpawnReady) {
      const cellX = Math.floor(player.x);
      const cellY = Math.floor(player.y) - 1;
      const cellZ = Math.floor(player.z);
      const below = cellY >= 0 ? blockAt(cellX, cellY, cellZ) : 0;
      if (!world.isActive(cellX, cellZ) || below === 0 || below === 7 || below === 21 || below === 24) {
        moveFrameActive = false;
        return;
      }
      playerSpawnReady = true;
    }
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
    if (!paused) playerTicker.advance(elapsed);
  }, 16);

  const simulationTicker = createFixedTicker(0.2, (dt) => {
    updateMobs(dt);
    stepDrops(dt);
    collectNearbyDrops();
    if (tickFluids()) simulationTerrainDirty = true;
    if (lavaContact(world, player)) applyLavaDamage(player, dt);
    villagerSimulationSteps += 1;
    if (villagerSimulationSteps >= 5) {
      villagerSimulationSteps = 0;
      updateVillagers(1.0);
      simulationTerrainDirty = true;
    }
    tickFurnace();
  });
  let previousSimulationTime = performance.now();
  window.setInterval(() => {
    const now = performance.now();
    const elapsed = Math.min((now - previousSimulationTime) / 1000, 1.6);
    previousSimulationTime = now;
    if (!paused) simulationTicker.advance(elapsed);
  }, 50);

  // Keep edits, inventory and simulation state durable during long sessions;
  // beforeunload alone loses progress when a tab or browser process crashes.
  window.setInterval(saveGame, 5000);

  let previousTime = performance.now();
  function frame(now) {
    const frameElapsedMs = Math.max(now - previousTime, 0.1);
    const dt = Math.min(frameElapsedMs / 1000, 0.05);
    previousTime = now;
    frameMetrics = sampleFrame(frameMetrics, frameElapsedMs);
    if (!paused) {
      updateMining(now);
      const sampleSeconds = Math.max((now - visualSample.time) / 1000, 0.001);
      visualSpeed = Math.min(6, Math.hypot(player.x - visualSample.x, player.z - visualSample.z) / sampleSeconds);
      visualSample = { x: player.x, z: player.z, time: now };
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
      rebuildDynamicMesh(worldTime);
      updateHud();
      if (!deadShown && Number(player.health) <= 0) showDeath();
    }
    updateDebugOverlay();
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
} catch (error) {
  showError(error);
}
