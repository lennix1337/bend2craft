import WorldState from "../world/world_state.bend";
import Light from "../world/light.bend";

self.postMessage({ workerReady: true });
self.onmessage = (event) => {
  const { id, version, seed, chunkX, chunkZ, edits } = event.data;
  try {
    const generationChunkX = event.data.generationChunkX ?? (chunkX < 0 ? -chunkX : chunkX);
    const generationChunkZ = event.data.generationChunkZ ?? (chunkZ < 0 ? -chunkZ : chunkZ);
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
