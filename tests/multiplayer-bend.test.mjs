import assert from "node:assert/strict";
import Multiplayer from "../world/multiplayer.bend";
import WorldState from "../world/world_state.bend";
import World from "../world/world.bend";

const SEED = 1337n;
const list = (items) => items.reduceRight((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" });
const array = (node) => {
  const items = [];
  for (; node?.$ === "Con"; node = node.tail) items.push(node.head);
  assert.equal(node?.$, "Nil");
  return items;
};
const edit = (x, y, z, block) => WorldState.make_edit(BigInt(x), BigInt(y), BigInt(z), block);
const cells = (edits) => array(edits).map((e) => [Number(e.x), Number(e.y), Number(e.z), Number(e.block)]);

// An empty room starts at sequence 0 with no edits.
const empty = Multiplayer.empty();
assert.equal(Number(Multiplayer.room_seq(empty)), 0);
assert.equal(Multiplayer.room_edits(empty).$, "Nil");

// Valid edits are accepted in order, applied, and advance the sequence.
const first = Multiplayer.submit(empty, list([edit(40, 8, 40, 12), edit(41, 8, 40, 0)]));
const room1 = Multiplayer.submission_room(first);
assert.equal(Number(Multiplayer.room_seq(room1)), 1);
assert.deepEqual(cells(Multiplayer.submission_accepted(first)), [[40, 8, 40, 12], [41, 8, 40, 0]]);
assert.equal(Multiplayer.submission_rejected(first).$, "Nil");
assert.equal(Number(WorldState.block(Multiplayer.room_edits(room1), SEED, 40n, 8n, 40n)), 12);
assert.equal(Number(WorldState.block(Multiplayer.room_edits(room1), SEED, 41n, 8n, 40n)), 0);

// A later edit of the same cell wins, and the log keeps one entry per cell.
const second = Multiplayer.submit(room1, list([edit(40, 8, 40, 22)]));
const room2 = Multiplayer.submission_room(second);
assert.equal(Number(Multiplayer.room_seq(room2)), 2);
assert.equal(Number(WorldState.block(Multiplayer.room_edits(room2), SEED, 40n, 8n, 40n)), 22);
assert.equal(array(Multiplayer.room_edits(room2)).length, 2);

// Unknown blocks, out-of-height cells and out-of-range coordinates are refused
// individually; the valid edits of the same batch still land.
const origin = Number(World.negative_origin());
const mixed = Multiplayer.submit(room2, list([
  edit(10, 8, 10, 99),
  edit(10, Number(World.max_y()), 10, 1),
  edit(origin, 8, 10, 1),
  edit(origin - 5, 8, 10, 1),
]));
assert.deepEqual(cells(Multiplayer.submission_accepted(mixed)), [[origin - 5, 8, 10, 1]]);
assert.equal(array(Multiplayer.submission_rejected(mixed)).length, 3);
const room3 = Multiplayer.submission_room(mixed);
assert.equal(Number(WorldState.block(Multiplayer.room_edits(room3), SEED, 10n, 8n, 10n)), Number(World.block(SEED, 10n, 8n, 10n)));

// Rejected in-world cells come back with their authoritative value, so the
// client can undo its prediction; cells outside the world have none.
const reverted = cells(Multiplayer.revert(Multiplayer.submission_rejected(mixed), Multiplayer.room_edits(room3), SEED));
assert.deepEqual(reverted, [[10, 8, 10, Number(World.block(SEED, 10n, 8n, 10n))]]);
const revertEdited = cells(Multiplayer.revert(list([edit(40, 8, 40, 99)]), Multiplayer.room_edits(room3), SEED));
assert.deepEqual(revertEdited, [[40, 8, 40, 22]]);

// An oversized batch is refused whole and leaves the room untouched.
const oversized = list(Array.from({ length: Number(Multiplayer.max_batch()) + 1 }, (_, i) => edit(i % 40, 8, 5, 1)));
const refused = Multiplayer.submit(room3, oversized);
assert.equal(Multiplayer.submission_accepted(refused).$, "Nil");
assert.equal(Number(Multiplayer.room_seq(Multiplayer.submission_room(refused))), Number(Multiplayer.room_seq(room3)));
const atLimit = list(Array.from({ length: Number(Multiplayer.max_batch()) }, (_, i) => edit(i % 40, 8, 5, 1)));
assert.equal(array(Multiplayer.submission_accepted(Multiplayer.submit(room3, atLimit))).length, Number(Multiplayer.max_batch()));

// Replaying accepted batches in sequence order on a client converges on the
// room's log, whatever the client predicted locally in between.
let client = WorldState.set(WorldState.empty(), 40n, 8n, 40n, 5);
client = Multiplayer.merge(Multiplayer.submission_accepted(first), client);
client = Multiplayer.merge(Multiplayer.submission_accepted(second), client);
client = Multiplayer.merge(Multiplayer.submission_accepted(mixed), client);
for (const [x, y, z] of [[40, 8, 40], [41, 8, 40], [origin - 5, 8, 10], [10, 8, 10]]) {
  assert.equal(
    Number(WorldState.block(client, SEED, BigInt(x), BigInt(y), BigInt(z))),
    Number(WorldState.block(Multiplayer.room_edits(room3), SEED, BigInt(x), BigInt(y), BigInt(z))),
  );
}

// A restored room keeps its sequence and log.
const restored = Multiplayer.restore(7, Multiplayer.room_edits(room3));
assert.equal(Number(Multiplayer.room_seq(restored)), 7);

// Poses: finite, inside the world band; NaN and infinities refused.
assert.equal(Multiplayer.valid_pose(12.5, 9.0, -30.25, 1.2, -0.4), true);
assert.equal(Multiplayer.valid_pose(Number.NaN, 9.0, 0.0, 0.0, 0.0), false);
assert.equal(Multiplayer.valid_pose(0.0, Number.POSITIVE_INFINITY, 0.0, 0.0, 0.0), false);
assert.equal(Multiplayer.valid_pose(0.0, 9.0, 0.0, Number.NEGATIVE_INFINITY, 0.0), false);
assert.equal(Multiplayer.valid_pose(0.0, 400.0, 0.0, 0.0, 0.0), false);
assert.equal(Multiplayer.valid_pose(0.0, -65.0, 0.0, 0.0, 0.0), false);
assert.equal(Multiplayer.valid_pose(5e7, 9.0, 0.0, 0.0, 0.0), false);
assert.ok(Math.abs(Multiplayer.clamp_pitch(3.0) - 1.5533) < 1e-4);
assert.ok(Math.abs(Multiplayer.clamp_pitch(-3.0) + 1.5533) < 1e-4);
assert.ok(Math.abs(Multiplayer.clamp_pitch(0.25) - 0.25) < 1e-6);

console.log("bend multiplayer ok");
