import { buildGreedyQuads } from "./greedy-mesh.js";

function chunkKey(chunkX, chunkZ) {
  return `${chunkX},${chunkZ}`;
}

function parseChunkKey(key) {
  return key.split(",").map(Number);
}

function sameMaterial(a, b) {
  return a.faceIndex === b.faceIndex && a.fixed === b.fixed && a.block === b.block && a.light === b.light;
}

function mergePass(quads, horizontal) {
  const sorted = [...quads].sort((a, b) => {
    const fields = horizontal
      ? ["faceIndex", "fixed", "block", "v", "height", "u"]
      : ["faceIndex", "fixed", "block", "u", "width", "v"];
    for (const field of fields) {
      if (a[field] !== b[field]) return a[field] - b[field];
    }
    return 0;
  });
  const merged = [];
  for (const quad of sorted) {
    const previous = merged[merged.length - 1];
    const adjacent = horizontal
      ? previous?.u + previous?.width === quad.u && previous?.v === quad.v && previous?.height === quad.height
      : previous?.v + previous?.height === quad.v && previous?.u === quad.u && previous?.width === quad.width;
    if (previous !== undefined && sameMaterial(previous, quad) && adjacent) {
      merged[merged.length - 1] = {
        ...previous,
        width: horizontal ? previous.width + quad.width : previous.width,
        height: horizontal ? previous.height : previous.height + quad.height,
      };
    } else {
      merged.push(quad);
    }
  }
  return merged;
}

export function mergeChunkQuads(quads) {
  let merged = quads;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = mergePass(mergePass(merged, true), false);
    if (next.length === merged.length) return next;
    merged = next;
  }
  return merged;
}

export function createChunkMeshCache(world, buildQuads = buildGreedyQuads) {
  if (!world || typeof world.forEachActiveChunk !== "function" || typeof world.forEachChunkBlock !== "function") {
    throw new TypeError("mesh cache requires chunk iteration methods");
  }
  const meshes = new Map();
  const dirty = new Set();
  let rebuildCount = 0;

  function activeKeys() {
    const keys = new Set();
    world.forEachActiveChunk((chunkX, chunkZ) => keys.add(chunkKey(chunkX, chunkZ)));
    return keys;
  }

  function syncActiveChunks() {
    const active = activeKeys();
    for (const key of meshes.keys()) {
      if (!active.has(key)) meshes.delete(key);
    }
    for (const key of active) {
      if (!meshes.has(key)) dirty.add(key);
    }
    return active;
  }

  function invalidateChunk(chunkX, chunkZ) {
    const key = chunkKey(chunkX, chunkZ);
    dirty.add(key);
  }

  function invalidateBlock(x, z) {
    const [chunkX, chunkZ] = world.chunkCoordinates(x, z);
    const localX = ((x % world.chunkSize) + world.chunkSize) % world.chunkSize;
    const localZ = ((z % world.chunkSize) + world.chunkSize) % world.chunkSize;
    const chunkXs = [chunkX];
    const chunkZs = [chunkZ];
    if (localX === 0) chunkXs.push(chunkX - 1);
    if (localX === world.chunkSize - 1) chunkXs.push(chunkX + 1);
    if (localZ === 0) chunkZs.push(chunkZ - 1);
    if (localZ === world.chunkSize - 1) chunkZs.push(chunkZ + 1);
    for (const nextZ of chunkZs) {
      for (const nextX of chunkXs) invalidateChunk(nextX, nextZ);
    }
  }

  function rebuildDirty() {
    const active = syncActiveChunks();
    for (const key of [...dirty]) {
      dirty.delete(key);
      if (!active.has(key)) continue;
      const [chunkX, chunkZ] = parseChunkKey(key);
      meshes.set(key, buildQuads({
        forEachLoadedBlock: (callback) => world.forEachChunkBlock(chunkX, chunkZ, callback),
        blockAt: world.blockAt,
        isActive: world.isActive,
        lightAt: world.lightAt,
      }));
      rebuildCount += 1;
    }
  }

  function snapshot(merge = true) {
    const quads = [];
    let blockCount = 0;
    for (const mesh of meshes.values()) {
      blockCount += mesh.blockCount;
      quads.push(...mesh.quads);
    }
    return { blockCount, quads: merge ? mergeChunkQuads(quads) : quads, rebuildCount, dirtyChunks: dirty.size };
  }

  return {
    invalidateBlock,
    invalidateChunk,
    rebuildDirty,
    snapshot,
    get rebuildCount() { return rebuildCount; },
  };
}
