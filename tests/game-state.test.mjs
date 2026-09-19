import assert from "node:assert/strict";
import {
  cameraDirection,
  collidesAt,
  createPlayer,
  createWorldState,
  movePlayer,
  overlapsPlayer,
  raycast,
} from "../web/game-state.js";

const world = createWorldState(6, 6, 6);
for (let z = 0; z < 6; z += 1) {
  for (let x = 0; x < 6; x += 1) world.setBlock(x, 0, z, 1);
}
world.setBlock(3, 1, 2, 1);
world.setBlock(2, 2, 1, 1);

const player = createPlayer([2, 2], 1);
assert.equal(collidesAt(world, player, 2.5, 1, 2.5), false);
assert.equal(overlapsPlayer(player, 2, 1, 2), true);

movePlayer(world, player, new Set(["KeyD"]), 0.05, [2, 2], 1);
assert.equal(player.x, 2.5);

for (let i = 0; i < 20; i += 1) {
  movePlayer(world, player, new Set(), 0.05, [2, 2], 1);
}
assert.equal(player.grounded, true);
assert.equal(player.y, 1);

const direction = cameraDirection(player);
assert.ok(direction[2] < 0);
const hit = raycast(world, player);
assert.deepEqual(hit?.hit, [2, 2, 1]);
console.log("game state ok");
