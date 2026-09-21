import { buildGreedyQuads } from "./greedy-mesh.js";
import { mergeChunkQuads } from "./mesh-merge.js";
export { mergeChunkQuads } from "./mesh-merge.js";

function concatFloat32Arrays(values) {
  const total = values.reduce((sum, value) => sum + value.length, 0);
  const result = new Float32Array(total);
  let offset = 0;
  for (const value of values) {
    result.set(value, offset);
    offset += value.length;
  }
  return result;
}

function composeVertexData(meshes) {
  const opaque = [];
  const water = [];
  let opaqueQuadCount = 0;
  let waterQuadCount = 0;
  for (const mesh of meshes) {
    const vertexData = mesh.vertexData ?? buildTerrainVertexArrays(mesh.quads);
    opaque.push(vertexData.opaque);
    water.push(vertexData.water);
    opaqueQuadCount += vertexData.opaque.quadCount;
    waterQuadCount += vertexData.water.quadCount;
  }
  const composeLayer = (layers, quadCount) => ({
    positions: concatFloat32Arrays(layers.map((layer) => layer.positions)),
    colors: concatFloat32Arrays(layers.map((layer) => layer.colors)),
    uvs: concatFloat32Arrays(layers.map((layer) => layer.uvs)),
    materials: concatFloat32Arrays(layers.map((layer) => layer.materials)),
    tiles: concatFloat32Arrays(layers.map((layer) => layer.tiles)),
    quadCount,
  });
  return {
    opaque: composeLayer(opaque, opaqueQuadCount),
    water: composeLayer(water, waterQuadCount),
  };
}
import { buildTerrainVertexArrays } from "./terrain-vertex-builder.js";

function chunkKey(chunkX, chunkZ) {
  return `${chunkX},${chunkZ}`;
}

export function buildChunkMeshes({
  chunkSize,
  maxY,
  activeKeys,
  targets,
  chunks,
  daylight = 1,
}) {
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || !Number.isInteger(maxY) || maxY < 1) {
    throw new RangeError("mesh worker dimensions must be positive integers");
  }
  if (!Array.isArray(activeKeys) || !Array.isArray(targets) || !Array.isArray(chunks)) {
    throw new TypeError("mesh worker inputs must be arrays");
  }

  const active = new Set(activeKeys);
  const byKey = new Map(chunks.map((chunk) => [chunk.key ?? chunkKey(chunk.chunkX, chunk.chunkZ), chunk]));
  const indexOf = (x, y, z) => x + chunkSize * (z + chunkSize * y);

  function chunkAt(x, z) {
    const chunkX = Math.floor(x / chunkSize);
    const chunkZ = Math.floor(z / chunkSize);
    return byKey.get(chunkKey(chunkX, chunkZ));
  }

  function blockAt(x, y, z) {
    if (!Number.isInteger(y) || y < 0 || y >= maxY) return 0;
    const chunk = chunkAt(x, z);
    if (chunk === undefined) return 0;
    const localX = x - chunk.chunkX * chunkSize;
    const localZ = z - chunk.chunkZ * chunkSize;
    return Number(chunk.data[indexOf(localX, y, localZ)] ?? 0);
  }

  function lightAt(x, y, z) {
    if (!Number.isInteger(y) || y < 0 || y >= maxY) return 0;
    const chunk = chunkAt(x, z);
    if (chunk === undefined) return 0;
    const localX = x - chunk.chunkX * chunkSize;
    const localZ = z - chunk.chunkZ * chunkSize;
    return Number(chunk.light[indexOf(localX, y, localZ)] ?? 0);
  }

  const meshes = [];
  for (const key of targets) {
    const chunk = byKey.get(key);
    if (chunk === undefined || !active.has(key)) continue;
    const mesh = buildGreedyQuads({
      forEachLoadedBlock(callback) {
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
      },
      blockAt,
      isActive: (x, z) => active.has(chunkKey(Math.floor(x / chunkSize), Math.floor(z / chunkSize))),
      lightAt,
    });
    meshes.push({
      key,
      chunkX: chunk.chunkX,
      chunkZ: chunk.chunkZ,
      ...mesh,
      vertexData: buildTerrainVertexArrays(mesh.quads, daylight),
    });
  }
  return meshes;
}

export function buildChunkMeshBatch({ existingMeshes = [], merge = true, ...options }) {
  const meshes = buildChunkMeshes(options);
  const byKey = new Map(existingMeshes.map((mesh) => [mesh.key, mesh]));
  for (const mesh of meshes) byKey.set(mesh.key, mesh);
  const active = new Set(options.activeKeys);
  const allMeshes = [...byKey.values()].filter((mesh) => active.has(mesh.key));
  const quads = [];
  let blockCount = 0;
  for (const mesh of allMeshes) {
    blockCount += mesh.blockCount;
    quads.push(...mesh.quads);
  }
  const mergedQuads = merge ? mergeChunkQuads(quads) : quads;
  return {
    meshes,
    blockCount,
    quads: mergedQuads,
    vertexData: merge
      ? buildTerrainVertexArrays(mergedQuads, options.daylight ?? 1)
      : composeVertexData(allMeshes),
    activeKeys: [...active],
  };
}
