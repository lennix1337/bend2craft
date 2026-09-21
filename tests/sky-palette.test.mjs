import assert from "node:assert/strict";
import { skyPalette } from "../web/sky-palette.js";

const bright = skyPalette(1);
const dim = skyPalette(0.28);
assert.equal(bright.top.length, 3);
assert.equal(bright.horizon.length, 3);
assert.ok(bright.top.every((value) => value >= 0 && value <= 1));
assert.ok(bright.horizon.every((value) => value >= 0 && value <= 1));
assert.ok(bright.top[2] > dim.top[2]);
assert.ok(bright.cssTop.startsWith("rgb("));
assert.ok(bright.cssHorizon.startsWith("rgb("));
assert.notEqual(bright.cssTop, dim.cssTop);

console.log("sky palette ok");
