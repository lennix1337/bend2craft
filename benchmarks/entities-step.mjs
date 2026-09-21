import Entities from "../world/entities.bend";

function elapsed(run) {
  const start = performance.now();
  let state = null;
  for (let index = 0; index < 100; index += 1) state = run();
  return { ms: performance.now() - start, state };
}

const initial = Entities.spawn(1337n, 0n, 0n, 256n, 256n);
let count = 0;
for (let node = initial; node?.$ === "Con"; node = node.tail) count += 1;
let airCells = { $: "Nil" };
for (let index = 5 * 6 * 5 - 1; index >= 0; index -= 1) {
  airCells = { $: "Con", head: 0, tail: airCells };
}
const airRegion = {
  $: "Region",
  blocks: airCells,
  origin_x: 0n,
  origin_y: 0n,
  origin_z: 0n,
  width: 5n,
  height: 6n,
  depth: 5n,
};
let airRegions = { $: "Nil" };
for (let index = 0; index < count; index += 1) {
  airRegions = { $: "Con", head: airRegion, tail: airRegions };
}
const full = elapsed(() => Entities.step_world(initial, 40.5, 40.5, 0.2, 10.0, 0n, airRegions));
const budgeted = elapsed(() => Entities.step_budgeted(initial, 40.5, 40.5, 0.2, 32.0));
console.log(JSON.stringify({ count, fullMs: Number(full.ms.toFixed(2)), budgetedMs: Number(budgeted.ms.toFixed(2)) }));
