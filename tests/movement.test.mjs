import assert from "node:assert/strict";
import {
  MOVE_SPEED,
  SPRINT_SPEED,
  createPlayer,
  createWorldState,
  isSprinting,
  movePlayer,
} from "../web/game-state.js";

assert.ok(SPRINT_SPEED > MOVE_SPEED);

// Sprint is an explicit intent: shift/control keys or the synthetic Sprint flag.
assert.equal(isSprinting(new Set(["ShiftLeft"])), true);
assert.equal(isSprinting(new Set(["ShiftRight"])), true);
assert.equal(isSprinting(new Set(["ControlLeft"])), true);
assert.equal(isSprinting(new Set(["Sprint"])), true);
assert.equal(isSprinting(new Set(["KeyW"])), false);
assert.equal(isSprinting(new Set()), false);

// Sprinting moves faster than walking over the same time step.
function flatWorld() {
  const world = createWorldState(8, 8, 6);
  for (let z = 0; z < 8; z += 1) {
    for (let x = 0; x < 8; x += 1) world.setBlock(x, 0, z, 1);
  }
  return world;
}

const walkWorld = flatWorld();
const walkPlayer = createPlayer([4, 4], 1);
for (let i = 0; i < 20; i += 1) {
  movePlayer(walkWorld, walkPlayer, new Set(["KeyW"]), 0.05, [4, 4], 1);
}
const walkDistance = Math.hypot(walkPlayer.x - 4.5, walkPlayer.z - 4.5);

const sprintWorld = flatWorld();
const sprintPlayer = createPlayer([4, 4], 1);
for (let i = 0; i < 20; i += 1) {
  movePlayer(sprintWorld, sprintPlayer, new Set(["KeyW", "ShiftLeft"]), 0.05, [4, 4], 1);
}
const sprintDistance = Math.hypot(sprintPlayer.x - 4.5, sprintPlayer.z - 4.5);
assert.ok(sprintDistance > walkDistance * 1.25);

// Landing after a fall reports the fall distance for damage handling.
const fallWorld = createWorldState(4, 4, 12);
for (let z = 0; z < 4; z += 1) {
  for (let x = 0; x < 4; x += 1) fallWorld.setBlock(x, 0, z, 1);
}
const fallPlayer = createPlayer([2, 2], 1);
fallPlayer.y = 8;
fallPlayer.velocityY = 0;
let landing = null;
for (let i = 0; i < 120; i += 1) {
  const step = movePlayer(fallWorld, fallPlayer, new Set(), 0.05, [2, 2], 1);
  if (step.landed) {
    landing = step;
    break;
  }
}
assert.ok(landing !== null);
assert.ok(landing.fallDistance >= 5);
assert.equal(fallPlayer.grounded, true);

console.log("movement ok");
