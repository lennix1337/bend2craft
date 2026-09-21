import Fire from "../world/fire.bend";

function sampleList(values) {
  let list = { $: "Nil" };
  for (let index = values.length - 1; index >= 0; index -= 1) {
    list = { $: "Con", head: values[index], tail: list };
  }
  return list;
}

function measure(fn, repeats = 10) {
  fn();
  const start = performance.now();
  for (let repeat = 0; repeat < repeats; repeat += 1) fn();
  return (performance.now() - start) / repeats;
}

const samples = sampleList([
  Fire.sample(2n, 3n, 2n, 0),
  Fire.sample(4n, 3n, 2n, 5),
]);
const state = Fire.ignite(Fire.empty(), 2n, 3n, 2n);
console.log(JSON.stringify({
  tickAndChangesMs: measure(() => {
    const next = Fire.tick(state, samples);
    Fire.changes(state, next);
  }),
}));
