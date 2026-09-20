import assert from "node:assert/strict";
import {
  packEntityState,
  restoreEntities,
  restoreVillagers,
} from "../web/entity-save.js";

const mobs = {
  $: "Con",
  head: { $: "Mob", id: 7n, kind: 2, x: 12.5, y: 8, z: 4.5, health: 16, alive: true },
  tail: { $: "Nil" },
};
const drops = {
  $: "Con",
  head: { $: "Drop", id: 3n, item: 13, x: 12, y: 8, z: 4, amount: 1 },
  tail: { $: "Nil" },
};
const villagers = {
  $: "Con",
  head: { $: "Villager", id: 2n, profession: 1, x: 24.5, y: 9, z: 28.5, home_x: 24n, home_z: 28n, resting: true },
  tail: { $: "Nil" },
};
const saved = { entities: packEntityState(mobs, drops), villagers };
const restoredEntities = restoreEntities(saved, { $: "Nil" }, { $: "Nil" });
assert.equal(restoredEntities.mobs.head.id, 7n);
assert.equal(restoredEntities.mobs.head.x, 12.5);
assert.equal(restoredEntities.drops.head.id, 3n);
assert.equal(restoreVillagers(saved, { $: "Nil" }).head.id, 2n);
assert.equal(restoreVillagers({}, villagers), villagers);
assert.equal(restoreEntities({}, mobs, drops).mobs, mobs);
const oldDropSave = {
  entities: { $: "Entities", mobs: { $: "Nil" }, drops: { $: "Con", head: { $: "Drop", id: 4n, item: 13, x: 1, y: 2, z: 3, amount: 1 }, tail: { $: "Nil" } } },
};
const migratedDrop = restoreEntities(oldDropSave, { $: "Nil" }, { $: "Nil" }).drops.head;
assert.equal(migratedDrop.velocity_y, 0);
assert.equal(migratedDrop.settled, false);
console.log("entity save ok");
