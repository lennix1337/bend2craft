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
world.setBlock(4, 1, 4, 7);

const player = createPlayer([2, 2], 1);
assert.equal(collidesAt(world, player, 2.5, 1, 2.5), false);
assert.equal(collidesAt(world, player, 4.5, 1, 4.5), false);
assert.equal(overlapsPlayer(player, 2, 1, 2), true);
player.health = 0;
movePlayer(world, player, new Set(), 0.016, [2, 2], 1);
assert.equal(player.health, 20);
assert.ok(Math.abs(player.x - 2.5) < 0.001);

const freeWorld = createWorldState(8, 8, 6);
for (let z = 0; z < 8; z += 1) for (let x = 0; x < 8; x += 1) freeWorld.setBlock(x, 0, z, 1);
const freePlayer = createPlayer([3, 3], 1);
movePlayer(freeWorld, freePlayer, new Set(["KeyW"]), 0.2, [3, 3], 1);
assert.ok(freePlayer.z < 3.5);

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

const jumpWorld = createWorldState(4, 4, 4);
for (let z = 0; z < 4; z += 1) {
  for (let x = 0; x < 4; x += 1) jumpWorld.setBlock(x, 0, z, 1);
}
const heldJumpPlayer = createPlayer([1, 1], 1);
heldJumpPlayer.y = 1.2;
heldJumpPlayer.velocityY = -2;
const heldSpace = new Set(["Space"]);
for (let i = 0; i < 60 && !heldJumpPlayer.grounded; i += 1) {
  movePlayer(jumpWorld, heldJumpPlayer, heldSpace, 0.016, [1, 1], 1);
}
assert.equal(heldJumpPlayer.grounded, true);
movePlayer(jumpWorld, heldJumpPlayer, heldSpace, 0.016, [1, 1], 1);
assert.equal(heldJumpPlayer.grounded, false);
assert.ok(heldJumpPlayer.velocityY > 0);
console.log("game state ok");
