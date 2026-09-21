import assert from "node:assert/strict";
import {
  cameraDirection,
  applyLavaDamage,
  collidesAt,
  createPlayer,
  createWorldState,
  mobRegion,
  lavaContact,
  movePlayer,
  overlapsPlayer,
  raycast,
  respawnPlayer,
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

const region = mobRegion(world, 2.5, 1.2, 2.5);
assert.equal(region.width, 5n);
assert.equal(region.height, 6n);
assert.equal(region.depth, 5n);
let regionCells = 0;
for (let node = region.blocks; node?.$ === "Con"; node = node.tail) regionCells += 1;
assert.equal(regionCells, 150);
player.health = 0;
movePlayer(world, player, new Set(), 0.016, [2, 2], 1);
assert.equal(player.health, 0);
respawnPlayer(player, [2, 2], 1);
assert.equal(player.health, 20);
assert.ok(Math.abs(player.x - 2.5) < 0.001);

const lavaWorld = createWorldState(6, 6, 6);
lavaWorld.setBlock(2, 0, 2, 1);
lavaWorld.setBlock(2, 1, 2, 21);
const lavaPlayer = createPlayer([2, 2], 1);
assert.equal(lavaContact(lavaWorld, lavaPlayer), true);
applyLavaDamage(lavaPlayer, 0.5);
assert.equal(lavaPlayer.health, 18);

const freeWorld = createWorldState(8, 8, 6);
for (let z = 0; z < 8; z += 1) for (let x = 0; x < 8; x += 1) freeWorld.setBlock(x, 0, z, 1);
const freePlayer = createPlayer([3, 3], 1);
movePlayer(freeWorld, freePlayer, new Set(["KeyW"]), 0.2, [3, 3], 1);
assert.ok(freePlayer.z < 3.5);

// Diagonal movement uses small per-tick displacements. With single-precision
// domain coordinates the F32 step must stay well above the float grid,
// otherwise W at 45 degrees freezes while cardinals keep moving.
const diagPlayer = createPlayer([3, 3], 1);
diagPlayer.x = 3.5;
diagPlayer.y = 1.05;
diagPlayer.z = 3.5;
diagPlayer.yaw = Math.PI / 4;
diagPlayer.pitch = 0;
diagPlayer.velocityY = 0;
diagPlayer.grounded = true;
for (let i = 0; i < 12; i += 1) {
  movePlayer(freeWorld, diagPlayer, new Set(["KeyW"]), 1 / 60, [3, 3], 1);
}
assert.ok(diagPlayer.x - 3.5 > 0.3, `diagonal W must move +x, got ${diagPlayer.x - 3.5}`);
assert.ok(3.5 - diagPlayer.z > 0.3, `diagonal W must move -z, got ${3.5 - diagPlayer.z}`);

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
