import assert from "node:assert/strict";
import {
  createInventory,
  selectedItem,
  collect,
  consume,
} from "../web/inventory.js";

const inventory = createInventory();
assert.deepEqual(selectedItem(inventory, 0), { block: 1, count: 32 });
assert.equal(consume(inventory, 0), true);
assert.equal(selectedItem(inventory, 0).count, 31);
assert.equal(collect(inventory, 5), true);
assert.deepEqual(selectedItem(inventory, 4), { block: 5, count: 9 });
assert.deepEqual(selectedItem(inventory, 5), { block: 0, count: 0 });
assert.equal(consume(inventory, 8), false);
console.log("inventory ok");
