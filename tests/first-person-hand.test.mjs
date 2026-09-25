import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  firstPersonOverlayItem,
  firstPersonOverlayPose,
} from "../web/first-person-overlay.js";
import { blockFaceTile } from "../web/texture-atlas.js";

const neutral = firstPersonOverlayPose({
  time: 0,
  speed: 0,
  grounded: true,
  swing: 0,
  motionEnabled: true,
});
assert.deepEqual(neutral, { x: 0, y: 0, rotation: -0.32, scale: 1 });

const walking = firstPersonOverlayPose({
  time: 0.25,
  speed: 4.5,
  grounded: true,
  swing: 0,
  motionEnabled: true,
});
assert.notDeepEqual(walking, neutral);
assert.ok(walking.x !== 0 || walking.y !== 0);

const swinging = firstPersonOverlayPose({
  time: 0,
  speed: 0,
  grounded: true,
  swing: 0.5,
  motionEnabled: true,
});
assert.ok(swinging.y > neutral.y);
assert.ok(swinging.rotation < neutral.rotation);
assert.ok(swinging.scale > neutral.scale);

const reduced = firstPersonOverlayPose({
  time: 0.25,
  speed: 4.5,
  grounded: true,
  swing: 0,
  motionEnabled: false,
});
assert.deepEqual(reduced, neutral);

assert.deepEqual(firstPersonOverlayItem({ selectedBlock: null, selectedItem: null }), {
  kind: "empty",
  block: null,
  item: null,
  tile: null,
});
assert.deepEqual(firstPersonOverlayItem({ selectedBlock: 1, selectedItem: null }), {
  kind: "block",
  block: 1,
  item: null,
  tile: 1,
});
assert.deepEqual(firstPersonOverlayItem({ selectedBlock: 3, selectedItem: null }), {
  kind: "block",
  block: 3,
  item: null,
  tile: blockFaceTile(3, 1),
});
assert.deepEqual(firstPersonOverlayItem({
  selectedBlock: null,
  selectedItem: { item: "wooden_pickaxe" },
}), {
  kind: "item",
  block: null,
  item: "wooden_pickaxe",
  tile: null,
});

const gameSource = await readFile(new URL("../web/game.js", import.meta.url), "utf8");
const indexSource = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
const styleSource = await readFile(new URL("../web/styles.css", import.meta.url), "utf8");
assert.doesNotMatch(gameSource, /for \(const part of firstPersonHandParts/);
assert.match(gameSource, /drawFirstPersonOverlay/);
assert.match(indexSource, /id="first-person-hand-canvas"/);
assert.match(styleSource, /#first-person-hand-canvas/);
assert.match(styleSource, /image-rendering:\s*pixelated/);

console.log("first person overlay ok");
