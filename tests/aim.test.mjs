import assert from "node:assert/strict";
import { bodyBox, mobBox, rayHitBox } from "../web/aim.js";

// Zombies stand taller than pigs, so their hitbox is taller.
assert.equal(mobBox({ kind: 1, x: 0, y: 0, z: -3 }).maxY, 1.2);
assert.equal(mobBox({ kind: 2, x: 0, y: 0, z: -3 }).maxY, 1.9);

// Aiming down at a pig from eye height hits; aiming past it misses.
const pig = bodyBox(0, 0, -3, 1.2);
assert.ok(rayHitBox([0, 1.6, 0], [0, -0.2, -1], pig, 8) !== null);
assert.equal(rayHitBox([0, 1.6, 0], [0, 0, 1], pig, 8), null);
assert.equal(rayHitBox([0, 1.6, 0], [0, -0.2, -1], pig, 1), null);

// A level eye ray meets the taller zombie box but sails over the pig.
const zombie = bodyBox(0, 0, -3, 1.9);
assert.ok(rayHitBox([0, 1.6, 0], [0, 0, -1], zombie, 8) !== null);
assert.equal(rayHitBox([0, 1.6, 0], [0, 0, -1], pig, 8), null);

// Facing away along an axis still resolves through slab swapping.
assert.ok(rayHitBox([0, 1.6, -3], [0, -0.2, 1], bodyBox(0, 0, 3, 1.2), 8) !== null);
console.log("aim ok");
