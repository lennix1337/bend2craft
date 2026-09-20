import Entities from "../world/entities.bend";

function elapsed(run) {
  const start = performance.now();
  let state = null;
  for (let index = 0; index < 100; index += 1) state = run();
  return { ms: performance.now() - start, state };
}

const initial = Entities.spawn(1337n, 0n, 0n, 256n, 256n);
const full = elapsed(() => Entities.step(initial, 40.5, 40.5, 0.2));
const budgeted = elapsed(() => Entities.step_budgeted(initial, 40.5, 40.5, 0.2, 32.0));
let count = 0;
for (let node = initial; node?.$ === "Con"; node = node.tail) count += 1;
console.log(JSON.stringify({ count, fullMs: Number(full.ms.toFixed(2)), budgetedMs: Number(budgeted.ms.toFixed(2)) }));
