import assert from "node:assert/strict";
import Multiplayer from "../world/multiplayer.bend";
import WorldState from "../world/world_state.bend";
import World from "../world/world.bend";
import { createMultiplayerRoom } from "../server/multiplayer-room.js";
import {
  MAX_PLAYERS,
  PROTOCOL_VERSION,
  bendEditsToWire,
  decodeClientMessage,
  decodeServerMessage,
  multiplayerUrl,
  sanitizeName,
  wireEditsToBend,
} from "../web/multiplayer-protocol.js";

const SEED = 1337n;

// Protocol shapes -------------------------------------------------------------
assert.equal(decodeClientMessage("not json"), null);
assert.equal(decodeClientMessage(JSON.stringify({ t: "edits", edits: [[1, 2, 3]] })), null);
assert.equal(decodeClientMessage(JSON.stringify({ t: "edits", edits: [[-1, 2, 3, 1]] })), null);
assert.equal(decodeClientMessage(JSON.stringify({ t: "edits", edits: [[1.5, 2, 3, 1]] })), null);
assert.equal(decodeClientMessage(JSON.stringify({ t: "edits", edits: [] })), null);
assert.deepEqual(decodeClientMessage(JSON.stringify({ t: "edits", edits: [[1, 2, 3, 4]] })), { t: "edits", edits: [[1, 2, 3, 4]] });
assert.equal(decodeClientMessage(JSON.stringify({ t: "pose", x: 1, y: 2, z: 3, yaw: "a", pitch: 0 })), null);
assert.equal(decodeClientMessage(JSON.stringify({ t: "teleport" })), null);
assert.equal(sanitizeName("  Lu\u0007cas   the\tgreat  "), "Lucas the great");
assert.equal(sanitizeName("x".repeat(80)).length, 24);
assert.equal(sanitizeName(""), "Player");
assert.equal(decodeServerMessage(JSON.stringify({ t: "left" })), null);
assert.deepEqual(bendEditsToWire(wireEditsToBend([[1, 2, 3, 4], [5, 6, 7, 0]])), [[1, 2, 3, 4], [5, 6, 7, 0]]);
// The wire list builds the same records WorldState makes.
assert.deepEqual(wireEditsToBend([[1, 2, 3, 4]]).head, WorldState.make_edit(1n, 2n, 3n, 4));
const page = { protocol: "http:", host: "192.168.0.10:8080" };
assert.equal(multiplayerUrl("", page), "ws://192.168.0.10:8080/multiplayer");
assert.equal(multiplayerUrl("", { protocol: "https:", host: "craft.example.dev" }), "wss://craft.example.dev/multiplayer");
assert.equal(multiplayerUrl("10.0.0.5:8080", page), "ws://10.0.0.5:8080/multiplayer");
assert.equal(multiplayerUrl("https://abc.trycloudflare.com/?play=1", page), "wss://abc.trycloudflare.com/multiplayer");
assert.equal(multiplayerUrl("ws://host:9000/custom", page), "ws://host:9000/custom");
assert.throws(() => multiplayerUrl("ftp://host", page));

// Room ------------------------------------------------------------------------
function client(room, name) {
  const inbox = [];
  const closed = [];
  const handle = room.connect((text) => inbox.push(JSON.parse(text)), (code, reason) => closed.push({ code, reason }));
  handle.receive(JSON.stringify({ t: "hello", v: PROTOCOL_VERSION, name }));
  return { handle, inbox, closed, last: (type) => inbox.filter((m) => m.t === type).at(-1) };
}

let changes = 0;
const room = createMultiplayerRoom({ authority: Multiplayer, seed: SEED, onChange: () => { changes += 1; } });
const alice = client(room, "Alice");
const welcomeA = alice.last("welcome");
assert.ok(decodeServerMessage(JSON.stringify(welcomeA)));
assert.equal(welcomeA.seed, "1337");
assert.equal(welcomeA.seq, 0);
assert.deepEqual(welcomeA.edits, []);
assert.deepEqual(welcomeA.players, []);

// Frames before hello are ignored; a second player sees the first.
const early = room.connect(() => assert.fail("no reply before hello"));
early.receive(JSON.stringify({ t: "edits", edits: [[1, 8, 1, 0]] }));
early.disconnect();
const bob = client(room, "Bob");
assert.deepEqual(bob.last("welcome").players.map((p) => p.name), ["Alice"]);
assert.equal(alice.last("joined").player.name, "Bob");

// Poses are validated in Bend and relayed to the others only.
alice.handle.receive(JSON.stringify({ t: "pose", x: 10.5, y: 9, z: -4, yaw: 1, pitch: 9 }));
const pose = bob.last("pose");
assert.equal(pose.id, alice.handle.id);
assert.ok(Math.abs(pose.pitch - 1.5533) < 1e-4, "pitch is clamped by the room");
assert.equal(alice.last("pose"), undefined);
const posesBefore = bob.inbox.length;
alice.handle.receive(JSON.stringify({ t: "pose", x: 0, y: 1e9, z: 0, yaw: 0, pitch: 0 }));
assert.equal(bob.inbox.length, posesBefore, "an out-of-world pose is dropped");

// Edits: accepted batches go to everyone in sequence order, the sender too.
alice.handle.receive(JSON.stringify({ t: "edits", edits: [[40, 8, 40, 12], [41, 8, 40, 0]] }));
assert.deepEqual(alice.last("edits"), { t: "edits", seq: 1, from: alice.handle.id, edits: [[40, 8, 40, 12], [41, 8, 40, 0]] });
assert.deepEqual(bob.last("edits"), alice.last("edits"));
assert.equal(changes, 1);

// A partly invalid batch: the valid edit lands, the sender gets the
// authoritative value of the refused in-world cell.
bob.handle.receive(JSON.stringify({ t: "edits", edits: [[40, 8, 40, 99], [42, 8, 40, 22]] }));
assert.deepEqual(alice.last("edits").edits, [[42, 8, 40, 22]]);
assert.equal(alice.last("edits").seq, 2);
assert.deepEqual(bob.last("revert"), { t: "revert", edits: [[40, 8, 40, 12]] });
assert.equal(alice.last("revert"), undefined);

// A late joiner receives the whole log.
const carol = client(room, "Carol");
assert.equal(carol.last("welcome").seq, 2);
assert.deepEqual(carol.last("welcome").edits, [[40, 8, 40, 12], [41, 8, 40, 0], [42, 8, 40, 22]]);
assert.deepEqual(carol.last("welcome").players.map((p) => p.name).sort(), ["Alice", "Bob"]);
assert.equal(carol.last("welcome").players.find((p) => p.name === "Alice").pose.x, 10.5);

// Leaving is announced once.
carol.handle.disconnect();
carol.handle.disconnect();
assert.equal(alice.inbox.filter((m) => m.t === "left").length, 1);
assert.equal(room.playerCount(), 2);

// Snapshots resume the same world; a snapshot for another seed is refused.
const snapshot = room.snapshot();
assert.deepEqual(snapshot, { version: 1, seed: "1337", seq: 2, edits: [[40, 8, 40, 12], [41, 8, 40, 0], [42, 8, 40, 22]] });
const resumed = createMultiplayerRoom({ authority: Multiplayer, seed: SEED, snapshot: JSON.parse(JSON.stringify(snapshot)) });
const dave = client(resumed, "Dave");
assert.equal(dave.last("welcome").seq, 2);
assert.deepEqual(dave.last("welcome").edits, snapshot.edits);
assert.throws(() => createMultiplayerRoom({ authority: Multiplayer, seed: 7n, snapshot }));

// Replaying the welcome log plus later batches gives the room's world.
let local = wireEditsToBend(dave.last("welcome").edits);
assert.equal(Number(WorldState.block(local, SEED, 42n, 8n, 40n)), 22);
assert.equal(Number(WorldState.block(local, SEED, 20n, 8n, 20n)), Number(World.block(SEED, 20n, 8n, 20n)));
void local;

// Version mismatch and a full server are refused with a reason.
const stale = [];
const staleClosed = [];
room.connect((text) => stale.push(JSON.parse(text)), (code) => staleClosed.push(code))
  .receive(JSON.stringify({ t: "hello", v: PROTOCOL_VERSION + 1, name: "Old" }));
assert.equal(stale[0].t, "error");
assert.deepEqual(staleClosed, [1008]);
const full = createMultiplayerRoom({ authority: Multiplayer, seed: SEED });
for (let index = 0; index < MAX_PLAYERS; index += 1) client(full, `P${index}`);
const extra = client(full, "Extra");
assert.equal(extra.inbox[0].t, "error");
assert.equal(full.playerCount(), MAX_PLAYERS);

console.log("multiplayer room ok");
