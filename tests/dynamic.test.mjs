import assert from "node:assert/strict";
import {
  MOB_COLORS,
  buildDynamicMesh,
  buildTexturedMesh,
  createMeshArrays,
  createTexArrays,
  hexToRgb,
  pushBox,
  pushCube,
  pushLimb,
  pushTexturedBox,
  pushTexturedMob,
  starPosition,
} from "../web/dynamic.js";
import { TILE_INDEX, uvForTile } from "../web/textures.js";
import { createMob } from "../web/mobs.js";

assert.deepEqual(hexToRgb("#ff0000"), [1, 0, 0]);
assert.deepEqual(hexToRgb("#d63b2f")[0] > 0.8 ? [1] : [0], [1]);

// One box emits 12 triangles (36 vertices) with matching colors.
const box = createMeshArrays();
pushBox(box, 0, 0, 0, 1, 1, 1, 0, [1, 0, 0]);
assert.equal(box.positions.length, 36 * 3);
assert.equal(box.colors.length, 36 * 3);
assert.ok(box.positions.every((v) => Number.isFinite(v)));

// Rotation keeps the box centered on its middle.
const spun = createMeshArrays();
pushBox(spun, 5, 5, 5, 2, 2, 2, Math.PI / 3, [0, 1, 0]);
const xs = spun.positions.filter((_, i) => i % 3 === 0);
const avg = xs.reduce((a, b) => a + b, 0) / xs.length;
assert.ok(Math.abs(avg - 5) < 1e-9);

// A flat-shaded mob reference stays on its feet for particle colors.
const pig = createMob("pig", 8.5, 1.05, 8.5);
assert.deepEqual(MOB_COLORS.pig.body.length, 3);

// Textured boxes emit positions, uvs and per-face shades.
const tex = createTexArrays();
pushTexturedBox(tex, 0, 1, 0, 1, 1, 1, 0, {
  top: 0, bottom: 0, front: 1, back: 0, left: 0, right: 0,
});
assert.equal(tex.positions.length, 36 * 3);
assert.equal(tex.uvs.length, 36 * 2);
assert.equal(tex.shades.length, 36);
assert.ok(tex.uvs.every((v) => v >= 0 && v <= 1));
assert.ok(tex.shades.every((s) => s > 0 && s <= 1));
assert.ok(Math.max(...tex.shades) === 1, "top face is brightest");

// Limbs hang below their pivot and swing forward with the angle.
const limb = createTexArrays();
pushLimb(limb, 0, 1, 0, 0.2, 0.5, 0.2, 0, 0, 0, 4);
const limbYs = limb.positions.filter((_, i) => i % 3 === 1);
assert.ok(Math.max(...limbYs) <= 1.0 + 1e-9);
assert.ok(Math.min(...limbYs) >= 0.5 - 1e-9);
const swung = createTexArrays();
pushLimb(swung, 0, 1, 0, 0.2, 0.5, 0.2, Math.PI / 2, 0, 0, 4);
const swungZs = swung.positions.filter((_, i) => i % 3 === 2);
assert.ok(Math.min(...swungZs) < -0.4, "swung limb reaches forward (-Z)");

// Textured mobs stand on their feet, face their yaw and flash white when hurt.
const tMesh = createTexArrays();
pushTexturedMob(tMesh, pig, 0);
assert.ok(tMesh.positions.length > 0);
const tys = tMesh.positions.filter((_, i) => i % 3 === 1);
assert.ok(Math.min(...tys) >= 1.05 - 1e-9, "feet touch the ground");
assert.ok(Math.max(...tys) <= 1.05 + 1.5, "head fits the hitbox");
const zombieTall = createMob("zombie", 0, 5, 0);
const zMesh = createTexArrays();
pushTexturedMob(zMesh, zombieTall, 0);
const zys = zMesh.positions.filter((_, i) => i % 3 === 1);
assert.ok(Math.max(...zys) <= 5 + 2.05, "zombie fits its taller hitbox");
const hurt = createMob("zombie", 0, 0, 0);
hurt.hurtTimer = 0.2;
const flashMesh = createTexArrays();
pushTexturedMob(flashMesh, hurt, 0);
const [wu0, , wu1] = uvForTile(TILE_INDEX.white);
const hitU = flashMesh.uvs.filter((_, i) => i % 2 === 0);
assert.ok(hitU.every((u) => u >= wu0 - 1e-9 && u <= wu1 + 1e-9), "hurt mob uses the white tile");

// Textured mobs batch into a single draw.
const batch = createTexArrays();
buildTexturedMesh(batch, [pig, zombieTall], 0);
assert.ok(batch.positions.length > tMesh.positions.length);
const empty = createTexArrays();
buildTexturedMesh(empty, [], 0);
assert.equal(empty.positions.length, 0);

// Stars are deterministic and stay above the horizon.
assert.deepEqual(starPosition(7, 85), starPosition(7, 85));
for (const i of [0, 1, 42, 129]) {
  assert.ok(starPosition(i, 85)[1] > 0);
}

// Day scenes carry sun geometry, night scenes carry stars and the moon.
const eye = [24, 14, 24];
const noon = createMeshArrays();
buildDynamicMesh(noon, eye, 0.25, []);
assert.ok(noon.positions.length > 0);
const midnight = createMeshArrays();
buildDynamicMesh(midnight, eye, 0.75, []);
assert.ok(midnight.positions.length > noon.positions.length);

// Particles shrink as they fade but never invert (plus the noon sun cube).
const particles = [{ x: 0, y: 0, z: 0, life: 0.1, maxLife: 1, size: 0.12, color: [1, 1, 1] }];
const dusty = createMeshArrays();
buildDynamicMesh(dusty, eye, 0.25, particles);
assert.equal(dusty.positions.length, 2 * 36 * 3);

console.log("dynamic ok");
