export const MAX_STACK = 64;

export const BLOCK_INFO = Object.freeze({
  0: Object.freeze({ name: "air", color: "#8bbfdc" }),
  1: Object.freeze({ name: "stone", color: "#7f8a91" }),
  2: Object.freeze({ name: "dirt", color: "#9b5c38" }),
  3: Object.freeze({ name: "grass", color: "#58ad42" }),
  4: Object.freeze({ name: "leaves", color: "#2e8c43" }),
  5: Object.freeze({ name: "wood", color: "#a66a3f" }),
  6: Object.freeze({ name: "apple", color: "#d63b2f" }),
  7: Object.freeze({ name: "porkchop", color: "#f0a0a8" }),
  8: Object.freeze({ name: "rotten flesh", color: "#6b5b3e" }),
});

// Hunger restored by eating one item. Apples drop from leaves,
// pork from pigs and flesh from zombies.
export const FOOD_VALUES = Object.freeze({ 6: 4, 7: 3, 8: 2 });

// Food is eaten, never placed as a block.
export function isPlaceable(block) {
  return block !== 0 && !(block in FOOD_VALUES);
}

const INITIAL_SLOTS = [
  { block: 1, count: 32 },
  { block: 2, count: 24 },
  { block: 3, count: 16 },
  { block: 4, count: 8 },
  { block: 5, count: 8 },
  { block: 0, count: 0 },
  { block: 0, count: 0 },
  { block: 0, count: 0 },
  { block: 0, count: 0 },
];

export function createInventory() {
  return INITIAL_SLOTS.map(({ block, count }) => ({ block, count }));
}

export function selectedItem(inventory, slot) {
  return inventory[slot] ?? null;
}

export function collect(inventory, block, amount = 1) {
  if (block === 0 || amount < 1) return false;
  const next = inventory.map(({ block: id, count }) => ({ block: id, count }));
  let remaining = amount;

  for (const item of next) {
    if (item.block !== block || item.count >= MAX_STACK) continue;
    const added = Math.min(remaining, MAX_STACK - item.count);
    item.count += added;
    remaining -= added;
    if (remaining === 0) break;
  }
  for (const item of next) {
    if (remaining === 0) break;
    if (item.block !== 0 || item.count !== 0) continue;
    const added = Math.min(remaining, MAX_STACK);
    item.block = block;
    item.count = added;
    remaining -= added;
    if (remaining === 0) break;
  }
  if (remaining !== 0) return false;

  inventory.forEach((item, index) => {
    item.block = next[index].block;
    item.count = next[index].count;
  });
  return true;
}

export function consume(inventory, slot, amount = 1) {
  const item = selectedItem(inventory, slot);
  if (item === null || amount < 1 || item.block === 0 || item.count < amount) return false;
  item.count -= amount;
  if (item.count === 0) item.block = 0;
  return true;
}
