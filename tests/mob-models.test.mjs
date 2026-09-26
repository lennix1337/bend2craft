import assert from "node:assert/strict";
import {
  MOB_BODY,
  dropBoxes,
  faceYaw,
  blinkFactor,
  mobBoxes,
  villagerBoxes,
  villagerRobeTint,
} from "../web/mob-models.js";

assert.equal(faceYaw(0, 0, 0, -1), 0);
assert.ok(Math.abs(faceYaw(0, 0, 1, 0) - Math.PI / 2) < 1e-9);
assert.ok(Math.abs(Math.abs(faceYaw(0, 0, 0, 1)) - Math.PI) < 1e-9);
assert.ok(Math.abs(faceYaw(0, 0, -1, 0) + Math.PI / 2) < 1e-9);
assert.equal(blinkFactor(0, 1), 1);
assert.ok(blinkFactor(0, 5) < 1);

const zombie = { id: 3, kind: 2, x: 10, y: 5, z: 20 };
const zombieBoxes = mobBoxes(zombie, 1.5);
assert.equal(zombieBoxes.length, 11);
for (const part of zombieBoxes) {
  assert.equal(part.c.length, 3);
  assert.equal(part.s.length, 3);
  assert.ok(part.s.every((side) => side > 0));
  assert.ok(Number.isInteger(part.tile));
  assert.equal(part.tint.length, 3);
}
const zombieLegs = zombieBoxes.filter((part) => part.s[0] === 0.2 && part.s[1] === 0.75);
assert.equal(zombieLegs.length, 2);
assert.ok(zombieBoxes.every((part) => part.c[1] > zombie.y));
assert.equal(zombieBoxes.filter((part) => part.s[0] === 0.2 && part.s[1] === 0.055).length, 1);
assert.equal(zombieBoxes.filter((part) => part.s[0] === 0.18 && part.s[1] === 0.18).length, 2);
assert.ok(zombieBoxes.some((part) => part.s[0] === 0.46 && part.s[1] === 0.46));
assert.deepEqual(mobBoxes(zombie, 1.5), zombieBoxes);
assert.notDeepEqual(mobBoxes(zombie, 1.5), mobBoxes(zombie, 1.9));

const pig = { id: 4, kind: 1, x: 10, y: 5, z: 20 };
const pigBoxes = mobBoxes(pig, 1.5);
assert.equal(pigBoxes.length, 14);
const pigLegs = pigBoxes.filter((part) => part.s[0] === 0.16 && part.s[1] === 0.4);
assert.equal(pigLegs.length, 4);
assert.ok(pigLegs.every((part) => part.c[1] > pig.y));
assert.equal(pigBoxes.filter((part) => part.s[0] === 0.035 && part.s[1] === 0.04).length, 2);

// Facing +X moves the -Z-authored eyes onto +X.
const faced = mobBoxes(zombie, 1.5, Math.PI / 2);
const eyes = faced.filter((part) => part.s[0] < 0.1);
assert.equal(eyes.length, 2);
for (const eye of eyes) {
  assert.ok(Math.abs(eye.c[0] - zombie.x - 0.215) < 1e-9);
  assert.ok(Math.abs(Math.abs(eye.c[2] - zombie.z) - 0.1) < 1e-9);
}

const villager = { id: 7, profession: 1, x: 1, y: 2, z: 3 };
const villagerParts = villagerBoxes(villager, 0.5);
assert.equal(villagerParts.length, 7);
const villagerArms = villagerParts.filter((part) => part.s[0] === 0.19 && part.s[1] === 0.62);
assert.equal(villagerArms.length, 2);
assert.notEqual(villagerArms[0].pitch, villagerArms[1].pitch);
assert.deepEqual(villagerBoxes(villager, 0.5), villagerBoxes(villager, 0.5));
assert.notDeepEqual(villagerBoxes(villager, 0.5), villagerBoxes(villager, 1.5));
assert.notDeepEqual(villagerRobeTint(2), villagerRobeTint(1));

const drop = { id: 9, item: 12, x: 4, y: 6, z: 8, amount: 1 };
const spun = dropBoxes(drop, 2.0);
assert.equal(spun.length, 1);
assert.deepEqual(spun[0].c, [4, 6.14, 8]);
assert.notEqual(dropBoxes(drop, 2.0)[0].yaw, dropBoxes(drop, 2.5)[0].yaw);

// Hurt flash overrides every part tint.
const flashed = mobBoxes(zombie, 1.5, 0, true);
assert.equal(flashed.length, zombieBoxes.length);
for (const part of flashed) {
  assert.deepEqual(part.tint, [1.0, 0.3, 0.25]);
}
assert.notDeepEqual(flashed, zombieBoxes);
// MOB_BODY is the published envelope, and the fire plume is emitted in a ring at
// its radius. If a model grows past it the plume goes back inside the body and
// the depth test discards every particle, which reads as "the fire stopped
// working" rather than as a stale constant. So the envelope is measured from the
// models instead of trusted.
const AXIS = ["x", "y", "z"];
const atRest = (entity) => [
  ...mobBoxes(entity, 0),
  ...mobBoxes({ ...entity, kind: 1 }, 0),
  ...villagerBoxes({ id: 1, profession: 0, x: entity.x, y: entity.y, z: entity.z }, 0),
];
for (const entity of [{ id: 1, kind: 2, x: 10, y: 5, z: 20 }, { id: 2, kind: 1, x: 0, y: 0, z: 0 }]) {
  for (const part of atRest(entity)) {
    assert.equal(part.s.length, 3, "every box needs three extents for the envelope check");
    for (let axis = 0; axis < 3; axis += 1) {
      const extent = Math.abs(part.c[axis] - entity[AXIS[axis]]) + part.s[axis] / 2;
      const limit = axis === 1 ? MOB_BODY.height : MOB_BODY.radius;
      assert.ok(extent <= limit + 1e-9,
        `a model box reaches ${extent.toFixed(3)} on ${AXIS[axis]}, outside MOB_BODY.${limit}`);
    }
  }
}
// The ring has to clear the widest part of the widest model, not merely reach it:
// a particle exactly on the surface is still behind the body's front faces.
assert.ok(MOB_BODY.radius >= 0.82, "the plume ring must clear the widest model, arms and snout included");
assert.ok(MOB_BODY.height >= 1.92, "the envelope must clear the tallest model");

console.log("mob models ok");
