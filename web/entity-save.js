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

export function restoreEntities(saved, fallbackMobs, fallbackDrops) {
  const entities = saved?.entities?.$ === "Entities" ? saved.entities : null;
  const drops = normalizeDrops(restoreList(entities?.drops, fallbackDrops));
  return {
    mobs: restoreList(entities?.mobs, fallbackMobs),
    drops,
  };
}

export function restoreVillagers(saved, fallback) {
  return restoreList(saved?.villagers, fallback);
}
