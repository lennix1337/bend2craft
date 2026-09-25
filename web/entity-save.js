function isBendList(value) {
  return value?.$ === "Nil" || value?.$ === "Con";
}

export function restoreList(value, fallback) {
  return isBendList(value) ? value : fallback;
}

export function packEntityState(mobs, drops) {
  return { $: "Entities", mobs, drops };
}

function normalizeDrops(list) {
  if (list?.$ === "Nil") return list;
  if (list?.$ !== "Con") return list;
  const drop = list.head;
  const normalized = drop?.$ === "Drop" && drop.velocity_y === undefined
    ? { ...drop, velocity_y: 0, settled: false }
    : drop;
  return { $: "Con", head: normalized, tail: normalizeDrops(list.tail) };
}

function normalizeMobs(list) {
  if (list?.$ === "Nil") return list;
  if (list?.$ !== "Con") return list;
  const mob = list.head;
  let normalized = mob;
  if (mob?.$ === "Mob") {
    const numericHealth = Number(mob.health);
    const health = Number.isFinite(numericHealth) ? Math.max(0, numericHealth) : 0;
    normalized = {
      ...mob,
      health,
      alive: health > 0 && mob.alive !== false,
      heading_x: mob.heading_x ?? 0,
      heading_z: mob.heading_z ?? -1,
    };
  }
  return { $: "Con", head: normalized, tail: normalizeMobs(list.tail) };
}

export function restoreEntities(saved, fallbackMobs, fallbackDrops) {
  const entities = saved?.entities?.$ === "Entities" ? saved.entities : null;
  const restoredMobs = restoreList(entities?.mobs, fallbackMobs);
  const mobs = entities?.mobs === undefined ? restoredMobs : normalizeMobs(restoredMobs);
  const drops = normalizeDrops(restoreList(entities?.drops, fallbackDrops));
  return {
    mobs,
    drops,
  };
}

export function restoreVillagers(saved, fallback) {
  return restoreList(saved?.villagers, fallback);
}
