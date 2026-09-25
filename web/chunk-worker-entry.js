import WorldState from "../world/world_state.bend";
import Light from "../world/light.bend";
import Villagers from "../world/villagers.bend";

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
    const generationChunkX = message.generationChunkX ?? (chunkX < 0 ? -chunkX : chunkX);
    const generationChunkZ = message.generationChunkZ ?? (chunkZ < 0 ? -chunkZ : chunkZ);
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
