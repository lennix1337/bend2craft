import assert from "node:assert/strict";
import Entities from "../world/entities.bend";

function listValues(list) {
  const values = [];
  for (let node = list; node?.$ === "Con"; node = node.tail) values.push(node.head);
  return values;
}

function flatRegion(originX, originY, originZ, wallX = null) {
  const values = [];
  for (let ly = 0; ly < 6; ly += 1) {
    for (let lz = 0; lz < 5; lz += 1) {
      for (let lx = 0; lx < 5; lx += 1) {
        const wx = originX + lx;
        const wy = originY + ly;
        values.push(wy === 0 || (wallX !== null && wx === wallX && wy <= 3) ? 1 : 0);
      }
    }
  }
  let cells = { $: "Nil" };
  for (let index = values.length - 1; index >= 0; index -= 1) {
    cells = { $: "Con", head: values[index], tail: cells };
  }
  return {
    $: "Region",
    blocks: cells,
    origin_x: BigInt(originX),
    origin_y: BigInt(originY),
    origin_z: BigInt(originZ),
    width: 5n,
    height: 6n,
    depth: 5n,
  };
}

function airRegions(count) {
  let cells = { $: "Nil" };
  for (let index = 5 * 6 * 5 - 1; index >= 0; index -= 1) {
    cells = { $: "Con", head: 0, tail: cells };
  }
  const region = {
    $: "Region",
    blocks: cells,
    origin_x: 0n,
    origin_y: 0n,
    origin_z: 0n,
    width: 5n,
    height: 6n,
    depth: 5n,
  };
  let list = { $: "Nil" };
  for (let index = 0; index < count; index += 1) {
    list = { $: "Con", head: region, tail: list };
  }
  return list;
}

const mobState = Entities.spawn(1337n, 0n, 0n, 80n, 80n);
const mobs = listValues(mobState);
assert.ok(mobs.length > 0);
assert.ok(mobs.every((mob) => mob.$ === "Mob" && Number(mob.health) === 20 && mob.alive === true));
assert.ok(new Set(mobs.map((mob) => Number(mob.kind))).size >= 1);
const peacefulMobs = listValues(Entities.spawn_for_mode(1337n, 0n, 0n, 80n, 80n, true));
assert.ok(peacefulMobs.length > 0);
assert.ok(peacefulMobs.length < mobs.length);
assert.ok(peacefulMobs.every((mob) => Number(mob.kind) === 1));
const protectedMobs = listValues(Entities.spawn_for_player(1337n, 0n, 0n, 80n, 80n, 40n, 0n, false));
assert.ok(protectedMobs.every((mob) => !(Number(mob.x) === 40.5 && Number(mob.z) === 0.5)));
const safeAreaMobs = listValues(Entities.spawn_for_player(1337n, 0n, 0n, 80n, 80n, 40n, 24n, false));
assert.ok(safeAreaMobs.every((mob) => (
  Math.abs(Number(mob.x) - 40.5) > 8.1
    || Math.abs(Number(mob.z) - 24.5) > 8.1
)));
const safeWorldMobs = listValues(Entities.spawn_for_player(1337n, 0n, 0n, 48n, 48n, 40n, 24n, false));
assert.ok(safeWorldMobs.every((mob) => (
  Math.abs(Number(mob.x) - 40.5) > 8.1
    || Math.abs(Number(mob.z) - 24.5) > 8.1
)));
const crowded = {
  $: "Con",
  head: Entities.make_mob(90n, 2, 40.5, 8.0, 24.5, 20.0, true),
  tail: {
    $: "Con",
    head: Entities.make_mob(91n, 1, 12.5, 8.0, 12.5, 20.0, true),
    tail: { $: "Nil" },
  },
};
const respawnSafe = listValues(Entities.remove_spawn_area(crowded, 40n, 24n));
assert.deepEqual(respawnSafe.map((mob) => Number(mob.id)), [91]);

const steppedRegions = airRegions(mobs.length);
const stepped = listValues(Entities.step_world(Entities.spawn(1337n, 0n, 0n, 80n, 80n), 40.5, 40.5, 1.0, 3.0, 0n, steppedRegions));
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
const attacked = Entities.attack(Entities.spawn(1337n, 0n, 0n, 80n, 80n), BigInt(targetId), 4.0, 0.0, 0.5, { $: "Nil" });
assert.equal(attacked.hit, true);
assert.equal(Number(listValues(attacked.mobs)[0].health), 16);
let killed = Entities.spawn(1337n, 0n, 0n, 80n, 80n);
let killedResult = null;
for (let index = 0; index < 5; index += 1) killedResult = Entities.attack(killed, BigInt(targetId), 4.0, 0.0, 0.5, { $: "Nil" }), killed = killedResult.mobs;
assert.equal(killedResult.drops.$, "Con");
assert.ok([12, 13].includes(Number(killedResult.drops.head.item)));

// Existing drops survive attacks, including one that kills.
const secondId = Number(listValues(killed)[1].id);
const oldDrop = Entities.drop_for(listValues(killed)[1]);
const priorDrops = { $: "Con", head: oldDrop, tail: { $: "Nil" } };
let preserving = null;
let preservingMobs = killed;
for (let index = 0; index < 5; index += 1) {
  preserving = Entities.attack(preservingMobs, BigInt(secondId), 4.0, 0.0, 0.5, index === 0 ? priorDrops : preserving.drops);
  preservingMobs = preserving.mobs;
}
assert.equal(listValues(preserving.drops).length, 2);

// Knockback pushes the target away from the attacker.
const loneVictim = {
  $: "Con",
  head: Entities.make_mob(11n, 2, 10.5, 1.0, 2.5, 20.0, true),
  tail: { $: "Nil" },
};
const pushed = Entities.attack(loneVictim, 11n, 4.0, 0.0, 2.5, { $: "Nil" });
assert.equal(pushed.hit, true);
assert.ok(Number(listValues(pushed.mobs)[0].x) > 10.5);

// Hostile walks toward the player on flat ground and stays grounded.
const openChaser = {
  $: "Con",
  head: Entities.make_mob(12n, 2, 10.5, 1.0, 2.5, 20.0, true),
  tail: { $: "Nil" },
};
const openRegion = {
  $: "Con",
  head: flatRegion(8, 0, 0),
  tail: { $: "Nil" },
};
let chase = openChaser;
for (let index = 0; index < 5; index += 1) {
  chase = Entities.step_world(chase, 0.0, 2.5, 0.2, 1.0, 0n, openRegion);
}
const chaser = listValues(chase)[0];
assert.ok(Number(chaser.x) < 10.5);
assert.equal(Number(chaser.y), 1);
assert.ok(Number(chaser.heading_x) < -0.99);
assert.ok(Math.abs(Number(chaser.heading_z)) < 0.01);

// A wall stops the chase: no clipping through.
const walledChaser = {
  $: "Con",
  head: Entities.make_mob(13n, 2, 10.5, 1.0, 2.5, 20.0, true),
  tail: { $: "Nil" },
};
const walledRegion = {
  $: "Con",
  head: flatRegion(8, 0, 0, 9),
  tail: { $: "Nil" },
};
let blocked = walledChaser;
for (let index = 0; index < 10; index += 1) {
  blocked = Entities.step_world(blocked, 0.0, 2.5, 0.2, 1.0, 0n, walledRegion);
}
const stopped = listValues(blocked)[0];
assert.ok(Number(stopped.x) < 10.5);
assert.ok(Number(stopped.x) > 9.5);
assert.equal(Number(stopped.y), 1);

// Falling mobs snap to the floor instead of hovering.
const fallingMob = {
  $: "Con",
  head: Entities.make_mob(14n, 2, 10.5, 5.0, 2.5, 20.0, true),
  tail: { $: "Nil" },
};
const landed = listValues(Entities.step_world(fallingMob, 0.0, 2.5, 0.2, 1.0, 0n, openRegion))[0];
assert.equal(Number(landed.y), 1);

// Passive mobs wander instead of standing still.
const grazer = {
  $: "Con",
  head: Entities.make_mob(15n, 1, 5.5, 1.0, 2.5, 20.0, true),
  tail: { $: "Nil" },
};
const grazeRegion = {
  $: "Con",
  head: flatRegion(3, 0, 0),
  tail: { $: "Nil" },
};
const grazedEarly = listValues(Entities.step_world(grazer, 0.0, 2.5, 0.2, 0.0, 0n, grazeRegion))[0];
const grazedLate = listValues(Entities.step_world(grazer, 0.0, 2.5, 0.2, 3.0, 0n, grazeRegion))[0];
assert.ok(Math.abs(Number(grazedEarly.x) - 5.5) + Math.abs(Number(grazedEarly.z) - 2.5) > 0.01);
assert.ok(Math.abs(Number(grazedLate.x) - Number(grazedEarly.x)) + Math.abs(Number(grazedLate.z) - Number(grazedEarly.z)) > 0.01);
// A one-block ledge is climbed, not treated as a wall.
function ledgeRegion() {
  const values = [];
  for (let ly = 0; ly < 6; ly += 1) {
    for (let lz = 0; lz < 5; lz += 1) {
      for (let lx = 0; lx < 5; lx += 1) {
        const wx = 4 + lx;
        const wy = ly;
        values.push(wy === 0 || (wx === 5 && wy === 1) ? 1 : 0);
      }
    }
  }
  let cells = { $: "Nil" };
  for (let index = values.length - 1; index >= 0; index -= 1) {
    cells = { $: "Con", head: values[index], tail: cells };
  }
  return {
    $: "Con",
    head: {
      $: "Region",
      blocks: cells,
      origin_x: 4n,
      origin_y: 0n,
      origin_z: 0n,
      width: 5n,
      height: 6n,
      depth: 5n,
    },
    tail: { $: "Nil" },
  };
}
const climber = {
  $: "Con",
  head: Entities.make_mob(16n, 2, 7.5, 1.0, 2.5, 20.0, true),
  tail: { $: "Nil" },
};
let climbing = climber;
for (let index = 0; index < 12; index += 1) {
  climbing = Entities.step_world(climbing, 0.0, 2.5, 0.2, 1.0, 0n, ledgeRegion());
}
const climbed = listValues(climbing)[0];
assert.ok(Number(climbed.x) < 7.5);
assert.equal(Number(climbed.y), 2);
console.log(JSON.stringify({ mobs: mobs.length, kinds: [...new Set(mobs.map((mob) => Number(mob.kind)))] }));
const deathDrop = Entities.make_drop(999n, 5, 3.5, 2.5, 3.5, 8);
assert.equal(deathDrop.$, 'Drop');
assert.equal(Number(deathDrop.item), 5);
assert.equal(Number(deathDrop.amount), 8);
const scattered = Entities.cons_drop(deathDrop, Entities.empty_drops());
assert.equal(Entities.remove_drop(scattered, 999n).$, 'Nil');
console.log('death drops ok');

// Distinct AI: brutes threaten harder, skittish flee, despawn clears the far.
const brute = Entities.make_mob(1001n, 4, 10.5, 1.0, 10.5, 40.0, true);
const skittish = Entities.make_mob(1002n, 3, 20.5, 1.0, 20.5, 20.0, true);
assert.equal(Number(Entities.drop_for(brute).item), 13);
assert.equal(Number(Entities.drop_for(skittish).item), 12);
assert.equal(Number(Entities.threat_damage(Entities.cons_mob(brute, { $: "Nil" }), 10.5, 10.5)), 4);
assert.equal(Number(Entities.threat_damage(Entities.cons_mob(skittish, { $: "Nil" }), 20.5, 20.5)), 0);
const mixed = Entities.cons_mob(skittish, Entities.cons_mob(brute, { $: "Nil" }));
assert.equal(Number(Entities.threat_damage(mixed, 10.5, 10.5)), 4);
const kept = Entities.despawn(mixed, 10.5, 10.5, 48.0);
assert.equal(Number(Entities.count_alive(kept, 0n)), 2);
const cleared = Entities.despawn(mixed, 500.5, 500.5, 48.0);
assert.equal(Number(Entities.count_alive(cleared, 0n)), 0);
const fled = Entities.step_budgeted(Entities.cons_mob(skittish, { $: "Nil" }), 20.5, 25.5, 1.0, 64.0);
assert.ok(Number(fled.head.z) < 20.5, `skittish must flee the player, z=${Number(fled.head.z)}`);
console.log('mob AI ok');
