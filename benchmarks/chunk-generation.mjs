import WorldState from "../world/world_state.bend";
import Light from "../world/light.bend";

const seed = 1337n;
const edits = WorldState.empty();
const sources = WorldState.torches(edits);
const rows = [];
for (const [chunkX, chunkZ] of [[0n, 0n], [1n, 0n], [2n, 0n], [1n, 1n], [2n, 1n]]) {
  const worldStart = performance.now();
  const blocks = WorldState.chunk(seed, chunkX, chunkZ, edits);
  const worldMs = performance.now() - worldStart;
  const lightStart = performance.now();
  const lights = Light.chunk(sources, seed, chunkX, chunkZ);
  const lightMs = performance.now() - lightStart;
  rows.push({ chunkX: Number(chunkX), chunkZ: Number(chunkZ), cells: blocks.length, lightCells: lights.length, worldMs, lightMs, totalMs: worldMs + lightMs });
}
console.log(JSON.stringify(rows));
