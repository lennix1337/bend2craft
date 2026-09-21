import assert from "node:assert/strict";
import {
  createFrameMetrics,
  formatDebugText,
  sampleFrame,
} from "../web/frame-metrics.js";

let metrics = createFrameMetrics();
metrics = sampleFrame(metrics, 1000 / 60);
assert.equal(metrics.frameCount, 1);
assert.ok(Math.abs(metrics.fps - 60) < 0.1);
assert.ok(Math.abs(metrics.frameMs - (1000 / 60)) < 0.01);
assert.equal(metrics.minFps, metrics.fps);
assert.equal(metrics.maxFps, metrics.fps);

metrics = sampleFrame(metrics, 1000 / 30);
assert.equal(metrics.frameCount, 2);
assert.ok(metrics.frameMs > 30);
assert.ok(metrics.fps < 60 && metrics.fps > 30);
assert.ok(metrics.minFps <= metrics.fps);
assert.ok(metrics.maxFps >= metrics.fps);

const text = formatDebugText({
  ...metrics,
  player: { x: 1.25, y: 8, z: -2.5 },
  activeChunks: 25,
  pendingChunks: 2,
  pinnedChunks: 1,
  blockCount: 1200,
  terrainQuads: 300,
  waterQuads: 40,
  dynamicQuads: 12,
  workerRequests: 27,
  workerHydrates: 25,
  simulationTime: 9,
  mobs: 3,
  villagers: 2,
  drops: 1,
});
assert.match(text, /FPS/);
assert.match(text, /XYZ 1\.25 8\.00 -2\.50/);
assert.match(text, /chunks 25 active · 2 pending · 1 pinned/);
assert.match(text, /mesh 1,200 blocks · 300 terrain quads · 40 water quads · 12 dynamic quads/);
assert.match(text, /workers 27 requests · 25 hydrated/);
assert.match(text, /entities 3 mobs · 2 villagers · 1 drops/);

console.log("frame metrics ok");
