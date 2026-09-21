import Fluids from "../world/fluids.bend";
import Simulation from "../world/simulation.bend";

function sampleList(values) {
  let list = { $: "Nil" };
  for (let index = values.length - 1; index >= 0; index -= 1) {
    list = { $: "Con", head: values[index], tail: list };
  }
  return list;
}

function listLength(list) {
  let count = 0;
  for (let node = list; node?.$ === "Con"; node = node.tail) count += 1;
  return count;
}

function measure(fn, repeats = 10) {
  fn();
  const start = performance.now();
  for (let repeat = 0; repeat < repeats; repeat += 1) fn();
  return (performance.now() - start) / repeats;
}

const samples = sampleList([
  Fluids.sample(2n, 2n, 2n, 1),
  Fluids.sample(1n, 3n, 2n, 0),
  Fluids.sample(3n, 3n, 2n, 0),
  Fluids.sample(2n, 3n, 1n, 0),
  Fluids.sample(2n, 3n, 3n, 0),
]);
const seeded = Fluids.seed(Fluids.empty(), 2n, 3n, 2n, 3);
const flowing = Fluids.tick(seeded, samples);
const simulation = Simulation.empty();
let manyFlows = Fluids.empty();
for (let index = 0; index < 40; index += 1) {
  manyFlows = Fluids.seed(manyFlows, BigInt(index), 1n, 1n, 8);
}

console.log(JSON.stringify({
  flowCount: listLength(Fluids.state_flows(flowing)),
  tickAndChangesMs: measure(() => {
    const next = Fluids.tick(seeded, samples);
    Fluids.changes(seeded, next);
  }),
  unifiedTickMs: measure(() => {
    Simulation.tick_with_fluids(simulation, 1n, { $: "Nil" }, seeded, samples);
  }),
  remove40Ms: measure(() => Fluids.remove(manyFlows, 39n, 1n, 1n)),
}));
