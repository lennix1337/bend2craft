import assert from "node:assert/strict";
import Entities from "../world/entities.bend";

function listValues(list) {
  const values = [];
  for (let node = list; node?.$ === "Con"; node = node.tail) values.push(node.head);
  return values;
}

const mobState = Entities.spawn(1337n, 0n, 0n, 80n, 80n);
const mobs = listValues(mobState);
assert.ok(mobs.length > 0);
assert.ok(mobs.every((mob) => mob.$ === "Mob" && Number(mob.health) === 20 && mob.alive === true));
assert.ok(new Set(mobs.map((mob) => Number(mob.kind))).size >= 1);

const stepped = listValues(Entities.step(Entities.spawn(1337n, 0n, 0n, 80n, 80n), 40.5, 40.5, 1.0));
assert.equal(stepped.length, mobs.length);

const budgetedInput = {
  $: "Con",
  head: Entities.make_mob(1n, 2, 10.0, 8.0, 0.5, 20.0, true),
  tail: {
    $: "Con",
    head: Entities.make_mob(2n, 2, 100.0, 8.0, 0.5, 20.0, true),
    tail: { $: "Nil" },
  },
};
const budgeted = listValues(Entities.step_budgeted(budgetedInput, 0.0, 0.5, 1.0, 32.0));
assert.ok(Number(budgeted[0].x) < 10.0);
assert.ok(Number(budgeted[1].x) < 100.0);
assert.ok(10.0 - Number(budgeted[0].x) > 100.0 - Number(budgeted[1].x));

const drop = Entities.drop_for(budgeted[0]);
const dropState = { $: "Con", head: drop, tail: { $: "Nil" } };
const ground = { $: "Con", head: { $: "Ground", x: Number(drop.x), z: Number(drop.z), y: 1.0 }, tail: { $: "Nil" } };
const fallingDrops = listValues(Entities.step_drops(dropState, 0.2, ground));
assert.ok(Number(fallingDrops[0].y) < Number(drop.y));
let landedDrops = dropState;
for (let index = 0; index < 20; index += 1) landedDrops = Entities.step_drops(landedDrops, 0.2, ground);
assert.equal(Number(listValues(landedDrops)[0].y), 1);
assert.equal(listValues(landedDrops)[0].settled, true);

const hostile = mobs.find((mob) => Number(mob.kind) === 2);
assert.ok(hostile);
assert.ok(Number(Entities.threat_damage(mobState, hostile.x, hostile.z)) > 0);

const targetId = Number(mobs[0].id);
const attacked = Entities.attack(Entities.spawn(1337n, 0n, 0n, 80n, 80n), BigInt(targetId), 4.0);
assert.equal(attacked.hit, true);
assert.equal(Number(listValues(attacked.mobs)[0].health), 16);
let killed = Entities.spawn(1337n, 0n, 0n, 80n, 80n);
let killedResult = null;
for (let index = 0; index < 5; index += 1) killedResult = Entities.attack(killed, BigInt(targetId), 4.0), killed = killedResult.mobs;
assert.equal(killedResult.drops.$, "Con");
assert.ok([12, 13].includes(Number(killedResult.drops.head.item)));
console.log(JSON.stringify({ mobs: mobs.length, kinds: [...new Set(mobs.map((mob) => Number(mob.kind)))] }));
