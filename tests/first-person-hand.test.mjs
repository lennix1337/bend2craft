import assert from "node:assert/strict";
import { firstPersonHandParts } from "../web/first-person-hand.js";

const camera = {
  eye: [0, 1.62, 0],
  direction: [0, 0, -1],
  right: [1, 0, 0],
  up: [0, 1, 0],
};

const emptyHand = firstPersonHandParts({ ...camera, time: 0, speed: 0, grounded: true });
assert.equal(emptyHand.length, 2);
assert.ok(emptyHand.every((part) => part.s.every((value) => value > 0)));
assert.ok(emptyHand.every((part) => part.c[2] < camera.eye[2]));
assert.deepEqual(emptyHand[0].s, [0.16, 0.46, 0.16]);
assert.deepEqual(emptyHand[1].s, [0.22, 0.22, 0.22]);

const blockHand = firstPersonHandParts({
  ...camera,
  time: 0,
  speed: 0,
  grounded: true,
  selectedBlock: 1,
});
assert.equal(blockHand.length, 3);
assert.equal(blockHand[2].tile, 1);
assert.deepEqual(blockHand[2].s, [0.16, 0.16, 0.16]);
assert.ok(blockHand[2].c[2] < blockHand[1].c[2]);

const pickaxeHand = firstPersonHandParts({
  ...camera,
  time: 0,
  speed: 0,
  grounded: true,
  selectedItem: { item: "wooden_pickaxe" },
});
assert.equal(pickaxeHand.length, 4);
assert.ok(pickaxeHand.some((part) => part.s[1] > 0.4));
assert.ok(pickaxeHand.some((part) => part.s[0] > 0.25));

const torchHand = firstPersonHandParts({
  ...camera,
  time: 0,
  speed: 0,
  grounded: true,
  selectedItem: { item: "torch" },
});
assert.equal(torchHand.length, 3);

const walking = firstPersonHandParts({
  ...camera,
  time: 0.25,
  speed: 4.5,
  grounded: true,
  selectedBlock: 1,
});
assert.notDeepEqual(walking, blockHand);

const swinging = firstPersonHandParts({
  ...camera,
  time: 0.08,
  speed: 0,
  grounded: true,
  selectedBlock: 1,
  swing: 1,
});
assert.notDeepEqual(swinging, blockHand);

const turned = firstPersonHandParts({
  ...camera,
  cameraYaw: Math.PI / 2,
  cameraPitch: -0.2,
  time: 0,
  speed: 0,
  grounded: true,
  selectedItem: { item: "wooden_pickaxe" },
});
assert.ok(turned.every((part) => Math.abs(part.yaw - Math.PI / 2) < 1e-9));
assert.ok(turned.every((part) => Math.abs(part.pitch + 0.2) < 1e-9));

console.log("first person hand ok");
