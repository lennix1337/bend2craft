import assert from "node:assert/strict";
import World from "../world/world.bend";

const width = Number(World.width());
const depth = Number(World.depth());
const maxY = Number(World.max_y());
assert.equal(width, 48);
assert.equal(depth, 48);
assert.equal(maxY, 20);

let grass = 0;
let leaves = 0;
let wood = 0;
for (let y = 0; y < maxY; y += 1) {
  for (let z = 0; z < depth; z += 1) {
    for (let x = 0; x < width; x += 1) {
      const block = Number(World.block(BigInt(x), BigInt(y), BigInt(z)));
      if (block === 3) grass += 1;
      if (block === 4) leaves += 1;
      if (block === 5) wood += 1;
    }
  }
}
assert.ok(grass > 0);
assert.ok(wood > 0);
assert.ok(leaves > 0);
console.log(JSON.stringify({ width, depth, maxY, grass, wood, leaves }));
