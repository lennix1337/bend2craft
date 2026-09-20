import assert from "node:assert/strict";
import State from "../world/world_state.bend";

const empty = State.empty();
const edited = State.set(empty, 40n, 8n, 40n, 0);
assert.notEqual(edited, empty);
assert.equal(Number(State.block(edited, 1337n, 40n, 8n, 40n)), 0);
assert.equal(Number(State.block(empty, 1337n, 40n, 8n, 40n)), 3);
const torchEdits = State.set(empty, 40n, 8n, 40n, 12);
assert.equal(torchEdits.$, "Con");
assert.equal(State.torches(torchEdits).$, "Con");
console.log("bend world state ok");
