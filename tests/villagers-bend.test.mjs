import assert from "node:assert/strict";
import Inventory from "../world/inventory.bend";
import Villagers from "../world/villagers.bend";
import WorldState from "../world/world_state.bend";

const state = Villagers.spawn(1337n);
assert.equal(state.$, "Con");
const first = state.tail.tail.head;
assert.equal(Number(first.home_x), 25);
assert.equal(Number(first.home_z), 27);
assert.equal(first.resting, true);
assert.equal(Villagers.walkable(1337n, 26n, 9n, 27n), true);
assert.equal(Villagers.walkable(1337n, 21n, 9n, 27n), false);

const grid = Villagers.path_grid(1337n, WorldState.empty());
const edited = WorldState.set(WorldState.empty(), 26n, 9n, 27n, 1);
const editedGrid = Villagers.path_grid(1337n, edited);
function listAt(list, index) {
  let node = list;
  for (let offset = 0; offset < index && node?.$ === "Con"; offset += 1) node = node.tail;
  return Number(node?.head ?? 0);
}
assert.equal(listAt(grid, (27 - 19) * 28 + (26 - 17)), 1);
assert.equal(listAt(editedGrid, (27 - 19) * 28 + (26 - 17)), 0);
const stepped = Villagers.step(state, 1337n, grid, 8n, 1.0);
assert.equal(stepped.$, "Con");
assert.notEqual(Number(stepped.tail.head.z), Number(state.tail.head.z));

const offer = Villagers.trade(state, 0n, first.x, first.z);
assert.equal(offer.ok, true);
assert.equal(Number(offer.cost_item), 13);
assert.equal(Number(offer.reward_item), 20);
const funded = Inventory.add_items(Inventory.create(), offer.cost_item, offer.cost_amount);
const fundedTrade = Inventory.trade(Inventory.add_slots(funded), offer.cost_item, offer.cost_amount, offer.reward_item, offer.reward_amount);
assert.equal(fundedTrade.ok, true);
assert.equal(Number(Inventory.count(fundedTrade.slots, 20)), 1);
assert.equal(Number(Inventory.count(fundedTrade.slots, 13)), 0);
const farOffer = Villagers.trade(state, 0n, 0.0, 0.0);
assert.equal(farOffer.ok, false);
const nearVillager = {
  $: "Con",
  head: { $: "Villager", id: 0n, profession: 1, x: 25.5, y: 9, z: 24.5, home_x: 25n, home_z: 27n, resting: false },
  tail: { $: "Nil" },
};
const closedDoorEdits = WorldState.empty();
const openedDoorEdits = Villagers.open_doors(nearVillager, 1337n, closedDoorEdits);
assert.equal(Number(WorldState.block(openedDoorEdits, 1337n, 25n, 9n, 23n)), 15);
assert.equal(Number(WorldState.block(openedDoorEdits, 1337n, 25n, 10n, 23n)), 15);
const heldOpenEdits = Villagers.update_doors(nearVillager, 1337n, openedDoorEdits, 0.0, 0.0);
assert.equal(Number(WorldState.block(heldOpenEdits, 1337n, 25n, 9n, 23n)), 15);
const closedAgainEdits = Villagers.update_doors({ $: "Nil" }, 1337n, heldOpenEdits, 0.0, 0.0);
assert.equal(Number(WorldState.block(closedAgainEdits, 1337n, 25n, 9n, 23n)), 14);
const sleep = Villagers.sleep(state, 1337n, WorldState.empty(), 27.5, 29.5, 0n);
assert.equal(sleep.ok, true);
assert.equal(Number(sleep.next_tick), 6);
assert.equal(Villagers.sleep(state, 1337n, WorldState.empty(), 27.5, 29.5, 10n).ok, false);
assert.equal(Villagers.sleep(state, 1337n, WorldState.empty(), 0.0, 0.0, 0n).ok, false);
console.log("bend villagers ok");
