import { buildChunkMeshBatch } from "./mesh-worker-core.js";

self.onmessage = (event) => {
  const { id, chunkSize, maxY, activeKeys, targets, chunks, existingMeshes } = event.data;
  try {
    const result = buildChunkMeshBatch({
      chunkSize,
      maxY,
      activeKeys,
      targets,
      chunks,
      existingMeshes,
    });
    self.postMessage({ id, ...result });
  } catch (error) {
    self.postMessage({ id, error: String(error?.stack ?? error) });
  }
};
