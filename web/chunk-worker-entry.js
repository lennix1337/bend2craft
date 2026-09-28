import { WorldState, Light, Villagers } from "./bend-modules.js";

// Kept in step with GENERATION_CHUNK_OFFSET in web/game.js.
const GENERATION_CHUNK_OFFSET = 1_000_000;

self.postMessage({ workerReady: true });
self.onmessage = (event) => {
  const message = event.data;
  if (message.type === "pathGrid") {
    try {
      const grid = Villagers.path_grid(BigInt(message.seed), message.edits);
      self.postMessage({ type: "pathGrid", requestId: message.requestId, grid });
    } catch (error) {
      self.postMessage({
        type: "pathGrid",
        requestId: message.requestId,
        error: String(error?.stack ?? error),
      });
    }
    return;
  }

  const { id, version, seed, chunkX, chunkZ, edits } = message;
  try {
    // A Bend Nat cannot be negative and the 2.0.32 JS lane refuses one outright,
    // so a chunk below the origin is generated under a positive offset. The
    // offset matches GENERATION_CHUNK_OFFSET in web/game.js, which sends
    // generationChunkX/Z for every request; the fallback here covers a caller
    // that omits them and must use the same value, or the worker would generate
    // a different chunk than the main thread.
    const generationChunkX = message.generationChunkX ?? (chunkX < 0 ? GENERATION_CHUNK_OFFSET - chunkX : chunkX);
    const generationChunkZ = message.generationChunkZ ?? (chunkZ < 0 ? GENERATION_CHUNK_OFFSET - chunkZ : chunkZ);
    const blocks = WorldState.chunk(BigInt(seed), BigInt(generationChunkX), BigInt(generationChunkZ), edits);
    const lights = Light.chunk_with_edits(
      WorldState.light_sources(edits),
      edits,
      BigInt(seed),
      BigInt(generationChunkX),
      BigInt(generationChunkZ),
    );
    self.postMessage({ id, version, chunkX, chunkZ, blocks, lights });
  } catch (error) {
    self.postMessage({ id, version, chunkX, chunkZ, error: String(error?.stack ?? error) });
  }
};
