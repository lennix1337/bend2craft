export const TERRAIN_VERTEX_STRIDE_FLOATS = 13;
export const TERRAIN_VERTEX_STRIDE_BYTES = TERRAIN_VERTEX_STRIDE_FLOATS * Float32Array.BYTES_PER_ELEMENT;

// The culler needs a per-chunk box, and the packed buffer already holds every
// position. Reading the bounds back from the packed data keeps the stride
// knowledge in this module instead of duplicating it in the renderer.
export function packedLayerBounds(packed, empty) {
  const bounds = empty();
  if (packed === null || packed === undefined || packed.vertexCount === 0) return bounds;
  const { data } = packed;
  for (let vertex = 0; vertex < packed.vertexCount; vertex += 1) {
    const base = vertex * TERRAIN_VERTEX_STRIDE_FLOATS;
    bounds.minX = Math.min(bounds.minX, data[base]);
    bounds.minY = Math.min(bounds.minY, data[base + 1]);
    bounds.minZ = Math.min(bounds.minZ, data[base + 2]);
    bounds.maxX = Math.max(bounds.maxX, data[base]);
    bounds.maxY = Math.max(bounds.maxY, data[base + 1]);
    bounds.maxZ = Math.max(bounds.maxZ, data[base + 2]);
  }
  return bounds;
}

function isNumericArray(value) {
  return Array.isArray(value) || ArrayBuffer.isView(value);
}

function requiredArray(layer, name) {
  const value = layer?.[name];
  if (!isNumericArray(value)) throw new TypeError(`terrain layer is missing ${name}`);
  return value;
}

function emptyLayer() {
  return {
    data: new Float32Array(),
    vertexCount: 0,
    strideBytes: TERRAIN_VERTEX_STRIDE_BYTES,
    quadCount: 0,
  };
}

export function packTerrainLayer(layer) {
  if (layer === null || layer === undefined) return emptyLayer();
  const positions = requiredArray(layer, "positions");
  const colors = requiredArray(layer, "colors");
  const uvs = requiredArray(layer, "uvs");
  const materials = requiredArray(layer, "materials");
  const tiles = requiredArray(layer, "tiles");
  if (positions.length % 3 !== 0) throw new RangeError("terrain positions must contain vec3 values");
  const vertexCount = positions.length / 3;
  if (colors.length !== vertexCount * 3) throw new RangeError("terrain colors do not match positions");
  if (uvs.length !== vertexCount * 2) throw new RangeError("terrain uvs do not match positions");
  if (materials.length !== vertexCount) throw new RangeError("terrain materials do not match positions");
  if (tiles.length !== vertexCount * 4) throw new RangeError("terrain tiles do not match positions");
  const data = new Float32Array(vertexCount * TERRAIN_VERTEX_STRIDE_FLOATS);
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const source = vertex * TERRAIN_VERTEX_STRIDE_FLOATS;
    const position = vertex * 3;
    const uv = vertex * 2;
    const tile = vertex * 4;
    data[source] = positions[position];
    data[source + 1] = positions[position + 1];
    data[source + 2] = positions[position + 2];
    data[source + 3] = colors[position];
    data[source + 4] = colors[position + 1];
    data[source + 5] = colors[position + 2];
    data[source + 6] = uvs[uv];
    data[source + 7] = uvs[uv + 1];
    data[source + 8] = materials[vertex];
    data[source + 9] = tiles[tile];
    data[source + 10] = tiles[tile + 1];
    data[source + 11] = tiles[tile + 2];
    data[source + 12] = tiles[tile + 3];
  }
  return {
    data,
    vertexCount,
    strideBytes: TERRAIN_VERTEX_STRIDE_BYTES,
    quadCount: Number(layer.quadCount ?? vertexCount / 6),
  };
}

/**
 * Decide how a chunk publication must be applied. The WebGPU backend keeps one
 * buffer per chunk, so an edit that leaves the resident key set untouched can
 * be applied in place, while a streaming change has to retire buffers and is a
 * full resync. Ordering is ignored because streaming reorders the resident map.
 */
export function classifyChunkUpdate(residentKeys, incomingKeys) {
  if (residentKeys === null || residentKeys === undefined) return "resync";
  const resident = new Set(residentKeys);
  const incoming = new Set(incomingKeys);
  if (resident.size !== incoming.size) return "resync";
  for (const key of incoming) {
    if (!resident.has(key)) return "resync";
  }
  return "edit";
}

export function packTerrainChunks(chunks) {
  if (!Array.isArray(chunks)) throw new TypeError("terrain chunks must be an array");
  return chunks.map((chunk) => ({
    key: String(chunk.key),
    opaque: packTerrainLayer(chunk.vertexData?.opaque),
    water: packTerrainLayer(chunk.vertexData?.water),
  }));
}
