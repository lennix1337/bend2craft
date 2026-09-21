import assert from "node:assert/strict";
import {
  TERRAIN_VERTEX_STRIDE_FLOATS,
  packTerrainChunks,
  packTerrainLayer,
} from "../web/webgpu-chunk-buffers.js";

const layer = {
  positions: Float32Array.of(1, 2, 3, 4, 5, 6),
  colors: Float32Array.of(0.1, 0.2, 0.3, 0.4, 0.5, 0.6),
  uvs: Float32Array.of(0, 1, 1, 0),
  materials: Float32Array.of(12, 13),
  tiles: Float32Array.of(0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7),
  quadCount: 1,
};

const packed = packTerrainLayer(layer);
assert.ok(packed.data instanceof Float32Array);
assert.equal(TERRAIN_VERTEX_STRIDE_FLOATS, 13);
assert.equal(packed.vertexCount, 2);
assert.equal(packed.strideBytes, 52);
assert.equal(packed.quadCount, 1);
assert.deepEqual(Array.from(packed.data.slice(0, 13)), [
  1, 2, 3,
  0.10000000149011612, 0.20000000298023224, 0.30000001192092896,
  0, 1,
  12,
  0, 0.10000000149011612, 0.20000000298023224, 0.30000001192092896,
]);
assert.deepEqual(Array.from(packed.data.slice(13, 26)), [
  4, 5, 6,
  0.4000000059604645, 0.5, 0.6000000238418579,
  1, 0,
  13,
  0.4000000059604645, 0.5, 0.6000000238418579, 0.699999988079071,
]);

const chunks = packTerrainChunks([
  { key: "0,0", vertexData: { opaque: layer, water: null } },
  { key: "1,0", vertexData: { opaque: null, water: layer } },
]);
assert.equal(chunks.length, 2);
assert.equal(chunks[0].key, "0,0");
assert.equal(chunks[0].opaque.vertexCount, 2);
assert.equal(chunks[0].water.vertexCount, 0);
assert.equal(chunks[1].opaque.vertexCount, 0);
assert.equal(chunks[1].water.vertexCount, 2);
assert.deepEqual(packTerrainLayer(null), {
  data: new Float32Array(),
  vertexCount: 0,
  strideBytes: 52,
  quadCount: 0,
});
assert.throws(() => packTerrainLayer({ positions: [0, 0, 0] }), /missing colors/);

console.log("webgpu chunk buffers ok");
