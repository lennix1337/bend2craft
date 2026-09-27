import assert from "node:assert/strict";
import * as http from "node:http";
import Multiplayer from "../world/multiplayer.bend";
import { attachMultiplayer } from "../server/node-host.mjs";
import { INTERPOLATION_DELAY_MS, connectMultiplayer, createEntityMirror, createRemotePlayers, lerpAngle } from "../web/multiplayer.js";
import { MOB_BODY, TILE_PLAYER_SLEEVE, playerBoxes } from "../web/mob-models.js";

// Angles blend along the short arc.
assert.ok(Math.abs(lerpAngle(3.0, -3.0, 0.5) - (3.0 + (2 * Math.PI - 6) / 2)) < 1e-9);
assert.equal(lerpAngle(0, 1, 0.25), 0.25);

// Presence renders one interpolation delay in the past.
const remote = createRemotePlayers();
remote.join({ id: 4, name: "Bia", pose: { x: 0, y: 9, z: 0, yaw: 0, pitch: 0 } }, 1000);
remote.pose(4, { x: 1, y: 9, z: 0, yaw: 0.5, pitch: 0 }, 1100);
remote.pose(4, { x: 2, y: 9, z: 0, yaw: 1.0, pitch: 0 }, 1200);
const [mid] = remote.views(1150 + INTERPOLATION_DELAY_MS);
assert.equal(mid.name, "Bia");
assert.ok(Math.abs(mid.x - 1.5) < 1e-9);
assert.ok(Math.abs(mid.yaw - 0.75) < 1e-9);
assert.ok(Math.abs(mid.speed - 10) < 1e-9);
const [late] = remote.views(5000);
assert.equal(late.x, 2, "past the last snapshot the player holds still");
assert.equal(remote.pose(99, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }, 0), false);
remote.join({ id: 5, name: "Caio", pose: null });
assert.equal(remote.views(5000).length, 1, "a player with no pose yet is not drawn");
assert.equal(remote.count(), 2);
assert.equal(remote.leave(4), true);
assert.equal(remote.name(5), "Caio");

// Server entities: mobs glide from the previous snapshot to the latest.
const mirror = createEntityMirror({ tickMs: 200 });
mirror.push({ mobs: [[7, 2, 0, 9, 0, 0, -1, 20, 1, 0, 0]], drops: [[40, 48, 1, 9, 1, 2]] }, 0);
mirror.push({ mobs: [[7, 2, 2, 9, 0, 0, -1, 18, 1, 1, 0]], drops: [] }, 1000);
assert.equal(mirror.mobs(1100)[0].x, 1);
assert.equal(mirror.mobs(1300)[0].x, 2);
assert.equal(mirror.mobs(1300)[0].burning, true);
assert.deepEqual(mirror.drops(), []);
mirror.push({ mobs: [], drops: [[41, 12, 3, 9, 3, 1]] }, 1400);
assert.deepEqual(mirror.mobs(1500), []);
assert.equal(mirror.drops()[0].item, 12);

// The player model stands on its feet, fits the entity envelope and faces yaw.
const standing = playerBoxes({ id: 1, x: 10, y: 5, z: 10, yaw: 0, pitch: 0, speed: 0 }, 2);
for (const part of standing) {
  assert.ok(part.c[1] - part.s[1] / 2 >= 5 - 1e-9);
  assert.ok(part.c[1] + part.s[1] / 2 <= 5 + MOB_BODY.height + 1e-9);
  assert.ok(Math.hypot(part.c[0] - 10, part.c[2] - 10) <= MOB_BODY.radius);
}
const eyes = (boxes) => boxes.filter((part) => part.s[2] === 0.02);
assert.ok(eyes(standing).every((part) => part.c[2] < 10), "yaw 0 faces -Z");
const turned = playerBoxes({ id: 1, x: 10, y: 5, z: 10, yaw: Math.PI / 2, pitch: 0, speed: 0 }, 2);
assert.ok(eyes(turned).every((part) => part.c[0] > 10), "yaw pi/2 faces +X");
assert.ok(standing.some((part) => part.tile === TILE_PLAYER_SLEEVE), "remote players wear the first-person sleeve");
const walking = playerBoxes({ id: 1, x: 10, y: 5, z: 10, yaw: 0, pitch: 0, speed: 4.3 }, 0.1);
assert.ok(walking.some((part) => part.pitch !== 0 && part.s[1] === 0.75), "legs swing while walking");
assert.ok(standing.filter((part) => part.s[1] === 0.75).every((part) => part.pitch === 0 || Object.is(part.pitch, -0)));

// A real session against the Node host: welcome, edit fan-out, poses, leave.
const server = http.createServer();
attachMultiplayer(server, { authority: Multiplayer, seed: 42n, file: null, log: () => {} });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `ws://127.0.0.1:${server.address().port}/multiplayer`;
const first = await connectMultiplayer({ url, name: "Lucas" });
assert.equal(first.seed, "42");
assert.deepEqual(first.edits, []);
assert.deepEqual(first.chests, []);
assert.deepEqual(first.furnaces, []);
assert.equal(typeof first.worldTime(), "number");
const second = await connectMultiplayer({ url, name: "Amigo" });
assert.deepEqual(second.players.map((p) => p.name), ["Lucas"]);
const got = (session, type) => new Promise((resolve) => session.on(type, resolve));

// Messages that arrive before start() are held, in order, not lost.
const early = [];
first.on("joined", (message) => early.push(message.player.name));
await new Promise((resolve) => setTimeout(resolve, 100));
assert.deepEqual(early, []);
first.start();
assert.deepEqual(early, ["Amigo"]);
second.start();

const edits = got(second, "edits");
assert.equal(first.queueEdit([5, 9, 5, 12]), true);
assert.equal(first.queueEdit([6, 9, 5, 0]), true);
const batch = await edits;
assert.deepEqual(batch.edits, [[5, 9, 5, 12], [6, 9, 5, 0]], "queued edits leave as one batch");
assert.equal(second.seq, 1);

const pose = got(second, "pose");
assert.equal(first.sendPose({ x: 1, y: 9, z: 2, yaw: 0, pitch: 0 }, 0), true);
assert.equal(first.sendPose({ x: 1.5, y: 9, z: 2, yaw: 0, pitch: 0 }, 50), false, "poses are throttled");
assert.equal((await pose).x, 1);

const reverted = got(first, "revert");
first.queueEdit([5, 9, 5, 250]);
assert.deepEqual((await reverted).edits, [[5, 9, 5, 12]]);

// Chest requests resolve with the server's answer; broadcasts reach everyone.
const chestSeen = got(second, "chest");
first.queueEdit([20, 9, 20, 26]);
assert.equal((await chestSeen).slots.length, 9);
const deposited = await first.chestRequest("deposit", { pos: [20, 9, 20], item: 5, count: 2, durability: 0 });
assert.equal(deposited.ok, true);
assert.equal(deposited.amount, 2);
const missing = await first.chestRequest("withdraw", { pos: [21, 9, 20], index: 0, amount: 1 });
assert.equal(missing.ok, false);
const taken = await second.chestRequest("withdraw", { pos: [20, 9, 20], index: 0, amount: 64 });
assert.deepEqual([taken.ok, taken.item, taken.amount], [true, 5, 2]);

// Furnace requests too.
const furnaceSeen = got(second, "furnace");
first.queueEdit([22, 9, 20, 11]);
assert.deepEqual((await furnaceSeen).state, [0, 0, 0, 0, 0, 0, 0, 0]);
assert.equal((await first.furnaceRequest("input", { pos: [22, 9, 20], item: 15 })).ok, true);
assert.equal((await second.furnaceRequest("output", { pos: [22, 9, 20] })).ok, false);

// The shared clock: every client reads the server's time; morning resets it.
assert.ok(first.worldTime() >= 0);
assert.ok(Math.abs(first.worldTime() - second.worldTime()) < 1);
const morning = got(second, "time");
assert.equal(first.sendMorning(), true);
assert.equal((await morning).time, 0);
assert.ok(second.worldTime() < 1);

const left = got(second, "left");
first.close();
assert.equal((await left).id, first.id);
const disconnected = got(second, "disconnect");
second.close();
await disconnected;

await assert.rejects(connectMultiplayer({ url: "ws://127.0.0.1:1/multiplayer", name: "x", timeoutMs: 2000 }));
await new Promise((resolve) => server.close(resolve));
console.log("multiplayer client ok");
