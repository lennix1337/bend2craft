import {
  extractClipPlanes,
  selectVisibleChunks,
} from "../web/chunk-frustum.js";
import { TERRAIN_VERTEX_STRIDE_BYTES } from "../web/webgpu-chunk-buffers.js";

// Reproducible chunk-culling benchmark. It measures the decision cost the WebGPU
// renderer pays once per frame, on the same JavaScript target the browser uses,
// and reports how much of the resident set survives. It does not claim GPU
// acceleration: this is pure arithmetic on the CPU.

const CHUNK_SIZE = 16;
const CHUNKS_PER_AXIS = Number(process.env.RENDER_DISTANCE ?? 2) * 2 + 1;
const ITERATIONS = Number(process.env.CULL_ITERATIONS ?? 2000);

function columnMajorPerspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const range = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * range, -1,
    0, 0, 2 * far * near * range, 0,
  ]);
}

function columnMajorLookAt(eye, center, up = [0, 1, 0]) {
  const normalize = (v) => {
    const length = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / length, v[1] / length, v[2] / length];
  };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
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

// A ring of resident chunks around the camera, with a plausible vertex budget.
function residentChunks() {
  const chunks = [];
  const span = CHUNKS_PER_AXIS;
  for (let z = 0; z < span; z += 1) {
    for (let x = 0; x < span; x += 1) {
      const originX = (x - (span - 1) / 2) * CHUNK_SIZE;
      const originZ = (z - (span - 1) / 2) * CHUNK_SIZE;
      chunks.push({
        key: `${x},${z}`,
        bounds: {
          minX: originX - 1,
          minY: 0,
          minZ: originZ - 1,
          maxX: originX + CHUNK_SIZE + 1,
          maxY: 20,
          maxZ: originZ + CHUNK_SIZE + 1,
        },
        opaqueVertices: 4000 + ((x * 7 + z * 13) % 900),
        waterVertices: (x + z) % 4 === 0 ? 240 : 0,
        strideBytes: TERRAIN_VERTEX_STRIDE_BYTES,
      });
    }
  }
  return chunks;
}

const chunks = residentChunks();
const viewProjection = multiply4(
  columnMajorPerspective(75 * (Math.PI / 180), 16 / 9, 0.1, 200),
  columnMajorLookAt([0, 12, 0], [0, 11, -1]),
);
const planes = extractClipPlanes(viewProjection);

function measure(run) {
  for (let index = 0; index < 200; index += 1) run();
  const start = performance.now();
  let result = null;
  for (let index = 0; index < ITERATIONS; index += 1) result = run();
  return { ms: performance.now() - start, result };
}

const culled = measure(() => selectVisibleChunks(chunks, planes));
const unculled = measure(() => selectVisibleChunks(chunks, null));
const culledMetrics = culled.result.metrics;
const unculledMetrics = unculled.result.metrics;

console.log(JSON.stringify({
  chunksPerAxis: CHUNKS_PER_AXIS,
  residentChunks: chunks.length,
  iterations: ITERATIONS,
  culledDecisionUs: Number((culled.ms / ITERATIONS * 1000).toFixed(2)),
  unculledDecisionUs: Number((unculled.ms / ITERATIONS * 1000).toFixed(2)),
  visibleChunks: culledMetrics.visibleChunks,
  culledChunks: culledMetrics.culledChunks,
  drawCalls: culledMetrics.drawCalls,
  submittedVertices: culledMetrics.submittedVertices,
  submittedVertexBytes: culledMetrics.submittedVertexBytes,
  unculledDrawCalls: unculledMetrics.drawCalls,
  unculledSubmittedVertexBytes: unculledMetrics.submittedVertexBytes,
  savedDrawCalls: unculledMetrics.drawCalls - culledMetrics.drawCalls,
  savedVertexBytes: unculledMetrics.submittedVertexBytes - culledMetrics.submittedVertexBytes,
  savedVertexPercent: Number((
    (1 - culledMetrics.submittedVertexBytes / unculledMetrics.submittedVertexBytes) * 100
  ).toFixed(1)),
}));
