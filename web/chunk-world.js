export const DEFAULT_CHUNK_SIZE = 16;

function validInteger(value) {
  return Number.isInteger(value);
}

function materializeChunk(generated, cellCount) {
  const data = new Uint8Array(cellCount);
  if (Array.isArray(generated) || ArrayBuffer.isView(generated)) {
    for (let index = 0; index < cellCount; index += 1) {
      data[index] = Number(generated[index] ?? 0);
    }
    return data;
  }

  let node = generated;
  let index = 0;
  while (node?.$ === "Con" && index < cellCount) {
    data[index] = Number(node.head);
    node = node.tail;
    index += 1;
  }
  if (index !== cellCount || node?.$ !== "Nil") {
    throw new TypeError("generateChunk must return a fixed-size array or list");
  }
  return data;
}

function applyLightPatch(generated, chunks, chunkSize, maxY, indexOf) {
  let node = generated;
  while (node?.$ === "Con") {
    const cell = node.head;
    const x = Number(cell.x);
    const y = Number(cell.y);
    const z = Number(cell.z);
    if (validInteger(x) && validInteger(y) && validInteger(z) && y >= 0 && y < maxY) {
      const chunkX = Math.floor(x / chunkSize);
      const chunkZ = Math.floor(z / chunkSize);
      const chunk = chunks.get(chunkKey(chunkX, chunkZ));
      if (chunk !== undefined) {
        const localX = x - chunkX * chunkSize;
        const localZ = z - chunkZ * chunkSize;
        chunk.light[indexOf(localX, y, localZ)] = Number(cell.light);
      }
    }
    node = node.tail;
  }
  if (node?.$ !== "Nil") throw new TypeError("generateLightCells must return a list");
}

export function chunkKey(chunkX, chunkZ) {
  return `${chunkX},${chunkZ}`;
}

export function createChunkedWorld({
  chunkSize = DEFAULT_CHUNK_SIZE,
  maxY,
  renderRadius = 2,
  loadBudget = Infinity,
  generateChunk,
  generateLightChunk = null,
  generateLightCells = null,
  affectedLightChunks = null,
  affectedLightCells = null,
  invalidateLightFields = null,
  requestChunk = null,
  generateBlock,
  initialEdits = null,
  applyEdit = null,
}) {
  if (!validInteger(chunkSize) || chunkSize < 1) {
    throw new RangeError("chunkSize must be a positive integer");
  }
  if (!validInteger(maxY) || maxY < 1) {
    throw new RangeError("maxY must be a positive integer");
  }
  if (!validInteger(renderRadius) || renderRadius < 0) {
    throw new RangeError("renderRadius must be a non-negative integer");
  }
  if (!(loadBudget === Infinity || (validInteger(loadBudget) && loadBudget > 0))) {
    throw new RangeError("loadBudget must be a positive integer or Infinity");
  }
  if (typeof generateChunk !== "function" && typeof generateBlock !== "function") {
    throw new TypeError("generateChunk or generateBlock must be a function");
  }

  const chunks = new Map();
  const pendingRequests = new Set();
  const pinnedKeys = new Set();
  let loadVersion = 0;
  let edits = initialEdits;
  const legacyEdits = new Map();
  let activeKeys = new Set();
  let lastLightDirtyCells = { $: "Nil" };

  const indexOf = (x, y, z) => x + chunkSize * (z + chunkSize * y);

  function inside(x, y, z) {
    return validInteger(x) && validInteger(y) && validInteger(z) && y >= 0 && y < maxY;
  }

  function chunkCoordinates(x, z) {
    return [Math.floor(x / chunkSize), Math.floor(z / chunkSize)];
  }

  function localCoordinates(x, y, z) {
    const [chunkX, chunkZ] = chunkCoordinates(x, z);
    return {
      chunkX,
      chunkZ,
      localX: x - chunkX * chunkSize,
      localY: y,
      localZ: z - chunkZ * chunkSize,
    };
  }

  function buildChunk(chunkX, chunkZ) {
    const key = chunkKey(chunkX, chunkZ);
    const cellCount = chunkSize * chunkSize * maxY;
    let data;
    if (typeof generateChunk === "function") {
      data = materializeChunk(generateChunk(chunkX, chunkZ, edits), cellCount);
    } else {
      data = new Uint8Array(cellCount);
      for (let y = 0; y < maxY; y += 1) {
        for (let z = 0; z < chunkSize; z += 1) {
          for (let x = 0; x < chunkSize; x += 1) {
            const globalX = chunkX * chunkSize + x;
            const globalZ = chunkZ * chunkSize + z;
            data[indexOf(x, y, z)] = Number(generateBlock(globalX, y, globalZ));
          }
        }
      }
    }
    let light = new Uint8Array(cellCount);
    light.fill(15);
    if (typeof generateLightChunk === "function") {
      light = materializeChunk(generateLightChunk(chunkX, chunkZ, edits), cellCount);
    }
    if (typeof applyEdit !== "function") {
      const chunkEdits = legacyEdits.get(key);
      if (chunkEdits !== undefined) {
        for (const [index, value] of chunkEdits) data[index] = value;
      }
    }
    return { chunkX, chunkZ, data, light };
  }

  function getChunk(chunkX, chunkZ) {
    const key = chunkKey(chunkX, chunkZ);
    let chunk = chunks.get(key);
    if (chunk === undefined) {
      chunk = buildChunk(chunkX, chunkZ);
      chunks.set(key, chunk);
    }
    return chunk;
  }

  function loadAround(x, z, radius = renderRadius, budget = loadBudget) {
    const [centerX, centerZ] = chunkCoordinates(x, z);
    const candidates = [];
    const nextKeys = new Set();
    for (let chunkZ = centerZ - radius; chunkZ <= centerZ + radius; chunkZ += 1) {
      for (let chunkX = centerX - radius; chunkX <= centerX + radius; chunkX += 1) {
        const key = chunkKey(chunkX, chunkZ);
        candidates.push({ key, distance: (chunkX - centerX) ** 2 + (chunkZ - centerZ) ** 2 });
        nextKeys.add(key);
      }
    }
    candidates.sort((a, b) => a.distance - b.distance || a.key.localeCompare(b.key));

    const pinnedCandidates = [...pinnedKeys]
      .filter((key) => !nextKeys.has(key))
      .map((key) => ({ key, distance: -1 }));
    const loadCandidates = [...pinnedCandidates, ...candidates];
    let loaded = 0;
    for (const { key } of loadCandidates) {
      if (chunks.has(key)) continue;
      if (pendingRequests.has(key)) continue;
      if (loaded >= budget) break;
      const [chunkX, chunkZ] = key.split(",").map(Number);
      if (typeof requestChunk === "function") {
        pendingRequests.add(key);
        requestChunk(chunkX, chunkZ, edits, loadVersion);
      } else {
        getChunk(chunkX, chunkZ);
      }
      loaded += 1;
    }
    const readyKeys = new Set([...nextKeys].filter((key) => chunks.has(key)));

    let changed = readyKeys.size !== activeKeys.size;
    if (!changed) {
      for (const key of readyKeys) {
        if (!activeKeys.has(key)) {
          changed = true;
          break;
        }
      }
    }
    activeKeys = readyKeys;
    for (const key of chunks.keys()) {
      if (!activeKeys.has(key) && !pinnedKeys.has(key)) chunks.delete(key);
    }
    const pendingRender = [...nextKeys].filter((key) => !chunks.has(key)).length;
    const pendingPinned = [...pinnedKeys].filter((key) => !chunks.has(key)).length;
    return {
      center: [centerX, centerZ],
      activeChunks: activeKeys.size,
      changed,
      pendingChunks: pendingRender + pendingPinned,
    };
  }

  function pinChunk(chunkX, chunkZ) {
    if (!validInteger(chunkX) || !validInteger(chunkZ)) return false;
    pinnedKeys.add(chunkKey(chunkX, chunkZ));
    return true;
  }

  function unpinChunk(chunkX, chunkZ) {
    const key = chunkKey(chunkX, chunkZ);
    pinnedKeys.delete(key);
    if (!activeKeys.has(key)) chunks.delete(key);
    return true;
  }

  function hydrateChunk(chunkX, chunkZ, generated, generatedLight, version = loadVersion) {
    if (version !== loadVersion) return false;
    const cellCount = chunkSize * chunkSize * maxY;
    const key = chunkKey(chunkX, chunkZ);
    chunks.set(key, {
      chunkX,
      chunkZ,
      data: materializeChunk(generated, cellCount),
      light: materializeChunk(generatedLight, cellCount),
    });
    pendingRequests.delete(key);
    return true;
  }

  function blockAt(x, y, z) {
    if (!validInteger(x) || !validInteger(y) || !validInteger(z) || y < 0 || y >= maxY) return 0;
    const { chunkX, chunkZ, localX, localY, localZ } = localCoordinates(x, y, z);
    const chunk = chunks.get(chunkKey(chunkX, chunkZ));
    if (chunk === undefined) return 0;
    return chunk.data[indexOf(localX, localY, localZ)];
  }

  function isActive(x, z) {
    if (!validInteger(x) || !validInteger(z)) return false;
    const [chunkX, chunkZ] = chunkCoordinates(x, z);
    return activeKeys.has(chunkKey(chunkX, chunkZ));
  }

  function setBlock(x, y, z, value) {
    if (!inside(x, y, z) || !Number.isInteger(value) || value < 0 || value > 255) return false;
    const { chunkX, chunkZ, localX, localY, localZ } = localCoordinates(x, y, z);
    const chunk = getChunk(chunkX, chunkZ);
    const index = indexOf(localX, localY, localZ);
    const previousBlock = chunk.data[index];
    const key = chunkKey(chunkX, chunkZ);
    if (typeof applyEdit === "function") {
      edits = applyEdit(edits, x, y, z, value);
    } else {
      let chunkEdits = legacyEdits.get(key);
      if (chunkEdits === undefined) {
        chunkEdits = new Map();
        legacyEdits.set(key, chunkEdits);
      }
      chunkEdits.set(index, value);
    }
    chunk.data[index] = value;
    if (typeof invalidateLightFields === "function") {
      invalidateLightFields(x, y, z, Number(previousBlock), value);
    }
    if (typeof generateLightChunk === "function" && (previousBlock === 12 || value === 12)) {
      if (typeof affectedLightCells === "function") lastLightDirtyCells = affectedLightCells(x, y, z);
      const cellCount = chunkSize * chunkSize * maxY;
      if (typeof generateLightCells === "function" && typeof affectedLightCells === "function") {
        applyLightPatch(generateLightCells(lastLightDirtyCells, edits), chunks, chunkSize, maxY, indexOf);
      } else if (typeof affectedLightChunks === "function") {
        const seen = new Set();
        let node = affectedLightChunks(x, z, chunkSize);
        while (node?.$ === "Con") {
          const nextChunkX = Number(node.head.x);
          const nextChunkZ = Number(node.head.z);
          const nextKey = chunkKey(nextChunkX, nextChunkZ);
          if (!seen.has(nextKey)) {
            seen.add(nextKey);
            const neighbor = chunks.get(nextKey);
            if (neighbor !== undefined) {
              neighbor.light = materializeChunk(
                generateLightChunk(neighbor.chunkX, neighbor.chunkZ, edits),
                cellCount,
              );
            }
          }
          node = node.tail;
        }
      } else {
        for (const neighbor of chunks.values()) {
          if (Math.abs(neighbor.chunkX - chunkX) > 1 || Math.abs(neighbor.chunkZ - chunkZ) > 1) continue;
          neighbor.light = materializeChunk(
            generateLightChunk(neighbor.chunkX, neighbor.chunkZ, edits),
            cellCount,
          );
        }
      }
    } else {
      lastLightDirtyCells = { $: "Nil" };
    }
    return true;
  }

  function lightAt(x, y, z) {
    if (!validInteger(x) || !validInteger(y) || !validInteger(z) || y < 0 || y >= maxY) return 0;
    const { chunkX, chunkZ, localX, localY, localZ } = localCoordinates(x, y, z);
    const chunk = chunks.get(chunkKey(chunkX, chunkZ));
    if (chunk === undefined) return 0;
    return chunk.light[indexOf(localX, localY, localZ)];
  }

  function forEachLoadedBlock(callback) {
    forEachActiveChunk((chunkX, chunkZ) => {
      forEachChunkBlock(chunkX, chunkZ, callback);
    });
  }

  function forEachActiveChunk(callback) {
    for (const key of activeKeys) {
      const chunk = chunks.get(key);
      if (chunk === undefined) continue;
      callback(chunk.chunkX, chunk.chunkZ);
    }
  }

  function forEachPinnedChunk(callback) {
    for (const key of pinnedKeys) {
      const chunk = chunks.get(key);
      if (chunk === undefined) continue;
      callback(chunk.chunkX, chunk.chunkZ);
    }
  }

  function forEachChunkBlock(chunkX, chunkZ, callback) {
    const chunk = chunks.get(chunkKey(chunkX, chunkZ));
    if (chunk === undefined) return;
      for (let y = 0; y < maxY; y += 1) {
        for (let z = 0; z < chunkSize; z += 1) {
          for (let x = 0; x < chunkSize; x += 1) {
            callback(
              chunk.chunkX * chunkSize + x,
              y,
              chunk.chunkZ * chunkSize + z,
              chunk.data[indexOf(x, y, z)],
            );
          }
        }
      }
  }

  function replaceEdits(nextEdits) {
    if (typeof applyEdit !== "function") return false;
    edits = nextEdits;
    loadVersion += 1;
    pendingRequests.clear();
    chunks.clear();
    activeKeys = new Set();
    return true;
  }

  return {
    chunkSize,
    maxY,
    inside,
    chunkCoordinates,
    isActive,
    blockAt,
    lightAt,
    setBlock,
    loadAround,
    getEdits: () => edits,
    getLightDirtyCells: () => lastLightDirtyCells,
    replaceEdits,
    hydrateChunk,
    pinChunk,
    unpinChunk,
    forEachLoadedBlock,
    forEachActiveChunk,
    forEachPinnedChunk,
    forEachChunkBlock,
    activeChunkCount: () => activeKeys.size,
    pinnedChunkCount: () => pinnedKeys.size,
  };
}
