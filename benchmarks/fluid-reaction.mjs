import Fluids from "../world/fluids.bend";

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

const sampleValues = [];
for (let x = 0; x < 24; x += 1) {
  for (let z = 0; z < 24; z += 1) sampleValues.push(Fluids.sample(BigInt(x), 3n, BigInt(z), 0));
}
const samples = sampleList(sampleValues);
let state = Fluids.seed_lava(Fluids.empty(), 2n, 3n, 2n, 8);
for (let index = 0; index < 10; index += 1) state = Fluids.tick(state, samples);
const start = performance.now();
const reactions = Fluids.reactions(state, samples);
const elapsedMs = performance.now() - start;
console.log(JSON.stringify({ flows: listLength(Fluids.state_flows(state)), reactions: listLength(reactions), elapsedMs }));
