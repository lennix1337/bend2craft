import assert from "node:assert/strict";
import { createChunkedWorld } from "../web/chunk-world.js";

// A shared-world batch arrives with an edit log that already contains it. The
// world adopts the log, writes the cells of loaded chunks, and invalidates only
// the in-flight requests of chunks the batch touched, so streaming elsewhere is
// not restarted by every remote edit.
const SIZE = 4;
const MAX_Y = 2;
const cells = SIZE * SIZE * MAX_Y;
const requests = [];
const world = createChunkedWorld({
  chunkSize: SIZE,
  maxY: MAX_Y,
  renderRadius: 1,
  loadBudget: 1,
  initialEdits: "log-0",
  generateChunk: () => new Array(cells).fill(1),
  requestChunk: (chunkX, chunkZ, edits, version) => requests.push({ chunkX, chunkZ, edits, version }),
  applyEdit: (edits, x, y, z, value) => `${edits}+${x},${y},${z}=${value}`,
});

const filled = () => new Uint8Array(cells).fill(1);
const lights = () => new Uint8Array(cells).fill(15);

// Hydrate the center chunk, leave two neighbours in flight.
world.loadAround(1, 1);
assert.equal(requests.length, 1);
assert.equal(world.hydrateChunk(0, 0, filled(), lights(), requests[0].version), true);
world.loadAround(1, 1);
world.loadAround(1, 1);
const inFlight = requests.slice(1);
assert.equal(inFlight.length, 2);
assert.equal(world.isLoaded(1, 1), true);
assert.equal(world.isLoaded(inFlight[0].chunkX * SIZE, inFlight[0].chunkZ * SIZE), false);

// One cell in the loaded chunk and one in the first in-flight chunk.
const touched = inFlight[0];
const remoteX = touched.chunkX * SIZE + 1;
const remoteZ = touched.chunkZ * SIZE + 1;
assert.equal(world.mergeEdits("log-1", [{ x: 2, y: 0, z: 2, value: 0 }], [[remoteX, remoteZ]]), true);
assert.equal(world.getEdits(), "log-1");
assert.equal(world.blockAt(2, 0, 2), 0);

// The touched request is stale: its reply is refused and it is asked again
// with the new log. The untouched request still lands.
assert.equal(world.hydrateChunk(touched.chunkX, touched.chunkZ, filled(), lights(), touched.version), false);
const other = inFlight[1];
assert.equal(world.hydrateChunk(other.chunkX, other.chunkZ, filled(), lights(), other.version), true);
const before = requests.length;
world.loadAround(1, 1);
const retry = requests.slice(before).find((r) => r.chunkX === touched.chunkX && r.chunkZ === touched.chunkZ);
assert.ok(retry, "the stale chunk is requested again");
assert.equal(retry.edits, "log-1");
assert.equal(world.hydrateChunk(retry.chunkX, retry.chunkZ, filled(), lights(), retry.version), true);

// Invalid cells refuse the whole merge and keep the old log.
assert.equal(world.mergeEdits("log-2", [{ x: 0, y: MAX_Y, z: 0, value: 1 }]), false);
assert.equal(world.getEdits(), "log-1");
// A batch with no loaded cells only adopts the log.
assert.equal(world.mergeEdits("log-3", []), true);
assert.equal(world.getEdits(), "log-3");

console.log("chunk world remote edits ok");
