export const TERRAIN_VERTEX_STRIDE_FLOATS = 13;
export const TERRAIN_VERTEX_STRIDE_BYTES = TERRAIN_VERTEX_STRIDE_FLOATS * Float32Array.BYTES_PER_ELEMENT;

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

export function packTerrainChunks(chunks) {
  if (!Array.isArray(chunks)) throw new TypeError("terrain chunks must be an array");
  return chunks.map((chunk) => ({
    key: String(chunk.key),
    opaque: packTerrainLayer(chunk.vertexData?.opaque),
    water: packTerrainLayer(chunk.vertexData?.water),
  }));
}
