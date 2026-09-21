import InventoryDomain from "../world/inventory.bend";

export const MAX_STACK = Number(InventoryDomain.max_stack());
export const HOTBAR_SIZE = 9;
export const INVENTORY_SIZE = Number(InventoryDomain.slot_count());

export const BLOCK_INFO = Object.freeze({
  0: Object.freeze({ name: "air", color: "#8bbfdc" }),
  1: Object.freeze({ name: "stone", color: "#7f8a91" }),
  2: Object.freeze({ name: "dirt", color: "#9b5c38" }),
  3: Object.freeze({ name: "grass", color: "#58ad42" }),
  4: Object.freeze({ name: "leaves", color: "#2e8c43" }),
  5: Object.freeze({ name: "wood", color: "#a66a3f" }),
  6: Object.freeze({ name: "sand", color: "#d9bd72" }),
  7: Object.freeze({ name: "water", color: "#4d9bd6" }),
  21: Object.freeze({ name: "lava", color: "#e56b2f" }),
  22: Object.freeze({ name: "cobblestone", color: "#777b7d" }),
  23: Object.freeze({ name: "obsidian", color: "#29233f" }),
  8: Object.freeze({ name: "coal ore", color: "#3d4148" }),
  9: Object.freeze({ name: "iron ore", color: "#b27b63" }),
  10: Object.freeze({ name: "diamond ore", color: "#4fd6d2" }),
  11: Object.freeze({ name: "furnace", color: "#5b5f66" }),
  12: Object.freeze({ name: "torch", color: "#f5b44c" }),
  13: Object.freeze({ name: "bed", color: "#c94f62" }),
  14: Object.freeze({ name: "closed door", color: "#8c5a38" }),
  15: Object.freeze({ name: "open door", color: "#b47a4d" }),
  16: Object.freeze({ name: "wheat crop", color: "#78b84a" }),
  17: Object.freeze({ name: "growing wheat", color: "#a3c64f" }),
  18: Object.freeze({ name: "ripe wheat", color: "#d5b83f" }),
  19: Object.freeze({ name: "mature wheat", color: "#f0c84b" }),
  20: Object.freeze({ name: "farmland", color: "#523d29" }),
  25: Object.freeze({ name: "glass", color: "#b5d9e8" }),
  26: Object.freeze({ name: "chest", color: "#9d6a3e" }),
  27: Object.freeze({ name: "crafting table", color: "#9d6a3e" }),
});

export const ITEM_IDS = Object.freeze({
  empty: 0,
  stone: 1,
  dirt: 2,
  grass: 3,
  leaves: 4,
  wood: 5,
  sand: 6,
  water: 7,
  planks: 8,
  sticks: 9,
  crafting_table: 10,
  wooden_pickaxe: 11,
  wool: 12,
  rotten_flesh: 13,
  coal: 14,
  raw_iron: 15,
  diamond: 16,
  stone_pickaxe: 17,
  iron_pickaxe: 18,
  diamond_pickaxe: 19,
  iron_ingot: 20,
  furnace: 21,
  torch: 22,
  bed: 23,
  door: 24,
  wheat_seeds: 25,
  wheat: 26,
  wooden_hoe: 27,
  empty_bucket: 28,
  water_bucket: 29,
  lava_bucket: 30,
  cobblestone: 31,
  obsidian: 32,
  wooden_sword: 33,
  stone_sword: 34,
  iron_sword: 35,
  diamond_sword: 36,
  bow: 37,
  shield: 38,
  arrow: 39,
  glass: 40,
  bread: 41,
  apple: 42,
  chest: 43,
});
const ITEM_NAMES = Object.freeze(Object.fromEntries(
  Object.entries(ITEM_IDS).map(([name, id]) => [id, name]),
));

export const BLOCK_TO_ITEM = Object.freeze({
  1: "stone",
  2: "dirt",
  3: "grass",
  4: "leaves",
  5: "wood",
  6: "sand",
  7: "water",
  8: "coal",
  9: "raw_iron",
  10: "diamond",
  11: "furnace",
  12: "torch",
  13: "bed",
  14: "door",
  15: "door",
  16: "wheat_seeds",
  17: "wheat_seeds",
  18: "wheat_seeds",
  19: "wheat",
  20: "dirt",
  22: "cobblestone",
  23: "obsidian",
  25: "glass",
  26: "chest",
  27: "crafting_table",
});

export const ITEM_TO_BLOCK = Object.freeze({
  stone: 1,
  dirt: 2,
  grass: 3,
  leaves: 4,
  wood: 5,
  sand: 6,
  water: 7,
  furnace: 11,
  torch: 12,
  bed: 13,
  door: 14,
  crafting_table: 27,
  glass: 25,
  chest: 26,
  cobblestone: 22,
  obsidian: 23,
});

export const ITEM_INFO = Object.freeze({
  stone: Object.freeze({ name: "stone", color: BLOCK_INFO[1].color, block: 1, placeable: true, collectible: true }),
  dirt: Object.freeze({ name: "dirt", color: BLOCK_INFO[2].color, block: 2, placeable: true, collectible: true }),
  grass: Object.freeze({ name: "grass", color: BLOCK_INFO[3].color, block: 3, placeable: true, collectible: true }),
  leaves: Object.freeze({ name: "leaves", color: BLOCK_INFO[4].color, block: 4, placeable: true, collectible: true }),
  wood: Object.freeze({ name: "wood", color: BLOCK_INFO[5].color, block: 5, placeable: true, collectible: true }),
  sand: Object.freeze({ name: "sand", color: BLOCK_INFO[6].color, block: 6, placeable: true, collectible: true }),
  water: Object.freeze({ name: "water", color: BLOCK_INFO[7].color, block: 7, placeable: false, collectible: false }),
  planks: Object.freeze({ name: "wood planks", color: "#c28a4d", block: null, placeable: false, collectible: true }),
  sticks: Object.freeze({ name: "sticks", color: "#d8a66a", block: null, placeable: false, collectible: true }),
  crafting_table: Object.freeze({ name: "crafting table", color: "#9d6a3e", block: 27, placeable: true, collectible: true }),
  wooden_pickaxe: Object.freeze({ name: "wooden pickaxe", color: "#b77b48", block: null, placeable: false, collectible: true }),
  wool: Object.freeze({ name: "wool", color: "#ece8d8", block: null, placeable: false, collectible: true }),
  rotten_flesh: Object.freeze({ name: "rotten flesh", color: "#8c4d45", block: null, placeable: false, collectible: true }),
  coal: Object.freeze({ name: "coal", color: "#24262b", block: null, placeable: false, collectible: true }),
  raw_iron: Object.freeze({ name: "raw iron", color: "#c28a6d", block: null, placeable: false, collectible: true }),
  diamond: Object.freeze({ name: "diamond", color: "#68e4df", block: null, placeable: false, collectible: true }),
  stone_pickaxe: Object.freeze({ name: "stone pickaxe", color: "#92999f", block: null, placeable: false, collectible: true }),
  iron_pickaxe: Object.freeze({ name: "iron pickaxe", color: "#d5d9dc", block: null, placeable: false, collectible: true }),
  diamond_pickaxe: Object.freeze({ name: "diamond pickaxe", color: "#5ee8e0", block: null, placeable: false, collectible: true }),
  iron_ingot: Object.freeze({ name: "iron ingot", color: "#d9dde2", block: null, placeable: false, collectible: true }),
  furnace: Object.freeze({ name: "furnace", color: "#5b5f66", block: 11, placeable: true, collectible: true }),
  torch: Object.freeze({ name: "torch", color: "#f5b44c", block: 12, placeable: true, collectible: true }),
  bed: Object.freeze({ name: "bed", color: "#c94f62", block: 13, placeable: true, collectible: true }),
  door: Object.freeze({ name: "door", color: "#8c5a38", block: 14, placeable: true, collectible: true }),
  wheat_seeds: Object.freeze({ name: "wheat seeds", color: "#d5b83f", block: null, placeable: false, collectible: true }),
  wheat: Object.freeze({ name: "wheat", color: "#f0c84b", block: null, placeable: false, collectible: true }),
  wooden_hoe: Object.freeze({ name: "wooden hoe", color: "#b77b48", block: null, placeable: false, collectible: true }),
  empty_bucket: Object.freeze({ name: "empty bucket", color: "#b8c0c8", block: null, placeable: false, collectible: true }),
  water_bucket: Object.freeze({ name: "water bucket", color: "#4d9bd6", block: null, placeable: false, collectible: true }),
  lava_bucket: Object.freeze({ name: "lava bucket", color: "#e56b2f", block: null, placeable: false, collectible: true }),
  cobblestone: Object.freeze({ name: "cobblestone", color: BLOCK_INFO[22].color, block: 22, placeable: true, collectible: true }),
  obsidian: Object.freeze({ name: "obsidian", color: BLOCK_INFO[23].color, block: 23, placeable: true, collectible: true }),
  wooden_sword: Object.freeze({ name: "wooden sword", color: "#b77b48", block: null, placeable: false, collectible: true }),
  stone_sword: Object.freeze({ name: "stone sword", color: "#92999f", block: null, placeable: false, collectible: true }),
  iron_sword: Object.freeze({ name: "iron sword", color: "#d5d9dc", block: null, placeable: false, collectible: true }),
  diamond_sword: Object.freeze({ name: "diamond sword", color: "#5ee8e0", block: null, placeable: false, collectible: true }),
  bow: Object.freeze({ name: "bow", color: "#8c5a38", block: null, placeable: false, collectible: true }),
  shield: Object.freeze({ name: "shield", color: "#7f8a91", block: null, placeable: false, collectible: true }),
  arrow: Object.freeze({ name: "arrow", color: "#d8cfc0", block: null, placeable: false, collectible: true }),
  glass: Object.freeze({ name: "glass", color: "#b5d9e8", block: 25, placeable: true, collectible: true }),
  bread: Object.freeze({ name: "bread", color: "#d59b45", block: null, placeable: false, collectible: true }),
  apple: Object.freeze({ name: "apple", color: "#c94a3f", block: null, placeable: false, collectible: true }),
  chest: Object.freeze({ name: "chest", color: "#9d6a3e", block: 26, placeable: true, collectible: true }),
});

function valuesFromList(list) {
  const values = [];
  for (let node = list; node?.$ === "Con"; node = node.tail) values.push(Number(node.head));
  if (list?.$ !== "Nil" && values.length === 0) throw new TypeError("Bend inventory list is invalid");
  return values;
}

const recipeValues = valuesFromList(InventoryDomain.recipe_data());
const RECIPE_IDS = [
  "planks",
  "sticks",
  "crafting_table",
  "wooden_pickaxe",
  "stone_pickaxe",
  "iron_pickaxe",
  "diamond_pickaxe",
  "furnace",
  "torch",
  "bed",
  "door",
  "wooden_hoe",
  "empty_bucket",
  "wooden_sword",
  "stone_sword",
  "iron_sword",
  "diamond_sword",
  "bow",
  "arrow",
  "shield",
  "bread",
];
export const RECIPES = Object.freeze(RECIPE_IDS.map((id, recipeIndex) => {
  const offset = recipeIndex * 8;
  const ingredients = [];
  for (let index = 0; index < 2; index += 1) {
    const item = recipeValues[offset + index * 2];
    const count = recipeValues[offset + index * 2 + 1];
    if (item !== 0 && count !== 0) ingredients.push({ item: ITEM_NAMES[item], count });
  }
  return Object.freeze({
    id,
    name: ITEM_INFO[id].name[0].toUpperCase() + ITEM_INFO[id].name.slice(1),
    ingredients: Object.freeze(ingredients),
    output: Object.freeze({ item: ITEM_NAMES[recipeValues[offset + 4]], count: recipeValues[offset + 5] }),
  });
}));

const DOMAIN_STATES = new WeakMap();

function numericItem(value) {
  const id = itemId(value);
  return id === null ? 0 : ITEM_IDS[id] ?? 0;
}

function slotView(item, count, durability, previous, durabilityByItem) {
  const name = ITEM_NAMES[item] ?? "empty";
  if (item === 0 || count === 0) return { block: 0, count: 0 };
  const block = ITEM_TO_BLOCK[name];
  const view = block === undefined ? { item: name, count } : { block, count };
  if ([11, 17, 18, 19, 27, 33, 34, 35, 36, 37, 38].includes(item)) {
    view.durabilityMax = Number(InventoryDomain.tool_max_durability(item));
    view.durability = durability || previous?.durability || durabilityByItem?.get(name) || view.durabilityMax;
  }
  return view;
}

function viewFromDomain(list, previous = [], durabilityByItem = null, expectedLength = INVENTORY_SIZE) {
  const view = [];
  for (let node = list; node?.$ === "Con"; node = node.tail) {
    const slot = node.head;
    view.push(slotView(Number(slot.item), Number(slot.count), Number(slot.durability), previous[view.length], durabilityByItem));
  }
  if (view.length !== expectedLength) throw new TypeError("Bend inventory returned an invalid slot count");
  return view;
}

function domainFromView(inventory) {
  let list = { $: "Nil" };
  for (let index = inventory.length - 1; index >= 0; index -= 1) {
    const slot = inventory[index] ?? { block: 0, count: 0 };
    const item = numericItem(slot);
    const maxDurability = Number(InventoryDomain.tool_max_durability(item));
    const durability = Number.isFinite(slot.durability) ? Number(slot.durability) : maxDurability;
    list = {
      $: "Con",
      head: { $: "Slot", item, count: Number(slot.count) || 0, durability },
      tail: list,
    };
  }
  return list;
}

function stateFor(inventory) {
  const state = domainFromView(inventory);
  DOMAIN_STATES.set(inventory, state);
  return state;
}

function applyResult(inventory, result) {
  const durabilityByItem = new Map(
    inventory
      .filter((item) => item?.durability)
      .map((item) => [itemId(item), item.durability]),
  );
  DOMAIN_STATES.set(inventory, result.slots);
  const next = viewFromDomain(result.slots, inventory, durabilityByItem);
  inventory.splice(0, inventory.length, ...next);
  return result.ok;
}

export function toDomain(inventory) {
  return stateFor(inventory);
}

export function applyDomainResult(inventory, result) {
  return applyResult(inventory, result);
}

export function tradeInventory(inventory, costItem, costAmount, rewardItem, rewardAmount) {
  return applyResult(inventory, InventoryDomain.trade(
    stateFor(inventory),
    Number(costItem),
    Number(costAmount),
    Number(rewardItem),
    Number(rewardAmount),
  ));
}

export function createInventory() {
  const domainState = InventoryDomain.create();
  const inventory = viewFromDomain(domainState);
  DOMAIN_STATES.set(inventory, domainState);
  return inventory;
}

export function selectedItem(inventory, slot) {
  return Array.isArray(inventory) && Number.isInteger(slot) && slot >= 0 && slot < inventory.length
    ? inventory[slot]
    : null;
}

export function itemId(value) {
  if (typeof value === "number") return BLOCK_TO_ITEM[value] ?? null;
  if (typeof value === "string") return ITEM_INFO[value] === undefined ? null : value;
  if (value === null || typeof value !== "object") return null;
  if (typeof value.item === "string") return ITEM_INFO[value.item] === undefined ? null : value.item;
  if (Number.isInteger(value.block)) return BLOCK_TO_ITEM[value.block] ?? null;
  return null;
}

export function itemName(value) {
  const id = itemId(value);
  return id === null ? "empty" : ITEM_INFO[id].name;
}

export function itemNameFromId(id) {
  const name = ITEM_NAMES[Number(id)];
  return name === undefined ? null : name;
}

export function itemColor(value) {
  const id = itemId(value);
  return id === null ? BLOCK_INFO[0].color : ITEM_INFO[id].color;
}

export function blockForItem(value) {
  const id = itemId(value);
  if (id === null || !InventoryDomain.is_placeable(ITEM_IDS[id])) return null;
  return ITEM_INFO[id].block;
}

export function isPlaceable(value) {
  return blockForItem(value) !== null;
}

export function canCollectBlock(block, y) {
  return InventoryDomain.can_collect_block(block, BigInt(y));
}

export function canPlaceBlock(item, targetEmpty, inside, overlapsPlayer) {
  const id = itemId(item);
  return id !== null && InventoryDomain.can_place(
    ITEM_IDS[id],
    Boolean(targetEmpty),
    Boolean(inside),
    Boolean(overlapsPlayer),
  );
}

export function canMine(item, block) {
  return InventoryDomain.can_mine(numericItem(item), block);
}

export function miningDuration(item, block) {
  return Number(InventoryDomain.mining_duration(numericItem(item), Number(block)));
}

export function mineDrop(item, block, y = 1) {
  const id = itemId(item);
  if (id === null) return { item: 0, amount: 0, valid: false };
  const result = InventoryDomain.mine_drop(ITEM_IDS[id], block, BigInt(y));
  return {
    item: Number(result.item),
    amount: Number(result.amount),
    valid: result.valid,
  };
}

export function mineAndCollect(inventory, item, block, y = 1) {
  return applyResult(inventory, InventoryDomain.mine_collect(
    stateFor(inventory),
    numericItem(item),
    Number(block),
    BigInt(y),
  ));
}

export function placeItem(inventory, slot, item, targetEmpty, inside, overlapsPlayer) {
  return applyResult(inventory, InventoryDomain.place(
    stateFor(inventory),
    BigInt(slot),
    numericItem(item),
    Boolean(targetEmpty),
    Boolean(inside),
    Boolean(overlapsPlayer),
  ));
}

export function fillBucket(inventory, slot) {
  return applyResult(inventory, InventoryDomain.fill_bucket_at(stateFor(inventory), BigInt(slot)));
}

export function emptyBucket(inventory, slot) {
  return applyResult(inventory, InventoryDomain.empty_bucket_at(stateFor(inventory), BigInt(slot)));
}

export function fillLavaBucket(inventory, slot) {
  return applyResult(inventory, InventoryDomain.fill_lava_bucket_at(stateFor(inventory), BigInt(slot)));
}

export function emptyLavaBucket(inventory, slot) {
  return applyResult(inventory, InventoryDomain.empty_lava_bucket_at(stateFor(inventory), BigInt(slot)));
}

export function mineInteraction(inventory, slot, item, block, x, y, z) {
  const result = InventoryDomain.mine_interaction_at(
    stateFor(inventory),
    BigInt(slot),
    numericItem(item),
    Number(block),
    BigInt(x),
    BigInt(y),
    BigInt(z),
  );
  applyResult(inventory, result);
  return result;
}

export function placeInteraction(inventory, slot, item, block, x, y, z, targetEmpty, inside, overlapsPlayer) {
  const result = InventoryDomain.place_interaction(
    stateFor(inventory),
    BigInt(slot),
    numericItem(item),
    Number(block),
    BigInt(x),
    BigInt(y),
    BigInt(z),
    Boolean(targetEmpty),
    Boolean(inside),
    Boolean(overlapsPlayer),
  );
  applyResult(inventory, result);
  return result;
}

export function toolMaxDurability(item) {
  return Number(InventoryDomain.tool_max_durability(numericItem(item)));
}

export function weaponDamage(item) {
  return Number(InventoryDomain.weapon_damage(numericItem(item)));
}

export function handDamage() {
  return Number(InventoryDomain.hand_damage());
}

export function foodValue(item) {
  return Number(InventoryDomain.food_value(numericItem(item)));
}

export function useTool(inventory, slot) {
  return applyResult(inventory, InventoryDomain.use_tool_at(stateFor(inventory), BigInt(slot)));
}

export function countItem(inventory, value) {
  const id = itemId(value);
  return id === null ? 0 : Number(InventoryDomain.count(stateFor(inventory), ITEM_IDS[id]));
}

export function collectItem(inventory, value, amount = 1) {
  const id = itemId(value);
  if (id === null || !ITEM_INFO[id].collectible) return false;
  return applyResult(inventory, InventoryDomain.pickup(stateFor(inventory), ITEM_IDS[id], BigInt(amount)));
}

export function collect(inventory, block, amount = 1) {
  return collectItem(inventory, BLOCK_TO_ITEM[block] ?? null, amount);
}

export function consume(inventory, slot, amount = 1) {
  return applyResult(inventory, InventoryDomain.consume(stateFor(inventory), BigInt(slot), BigInt(amount)));
}

export function moveItem(inventory, fromSlot, toSlot, amount = null) {
  const source = selectedItem(inventory, fromSlot);
  const requested = amount === null ? source?.count ?? 0 : amount;
  return applyResult(inventory, InventoryDomain.move(stateFor(inventory), BigInt(fromSlot), BigInt(toSlot), BigInt(requested)));
}

export function getRecipe(recipeId) {
  if (typeof recipeId !== "string") return null;
  const normalizedId = recipeId.replaceAll("-", "_");
  return RECIPES.find((recipe) => recipe.id === normalizedId) ?? null;
}

function recipeIndex(recipeId) {
  const recipe = getRecipe(recipeId);
  return recipe === null ? -1 : RECIPES.indexOf(recipe);
}

export function shapedRecipePattern(recipeId) {
  const index = recipeIndex(recipeId);
  if (index === -1) return null;
  return valuesFromList(InventoryDomain.shape_pattern(BigInt(index)));
}

export function craftGrid(inventory, grid, recipeId) {
  const index = recipeIndex(recipeId);
  if (index === -1 || !Array.isArray(grid) || grid.length !== 9) {
    return { ok: false, grid: Array.isArray(grid) ? grid : [] };
  }
  const result = InventoryDomain.craft_grid(
    stateFor(inventory),
    domainFromView(grid),
    BigInt(index),
  );
  applyResult(inventory, result);
  return {
    ok: Boolean(result.ok),
    grid: viewFromDomain(result.grid, grid, null, 9),
    output: Number(result.output),
    amount: Number(result.amount),
  };
}

export function canCraft(inventory, recipeId) {
  const index = recipeIndex(recipeId);
  return index !== -1 && InventoryDomain.craft(stateFor(inventory), BigInt(index)).ok;
}

export function craft(inventory, recipeId) {
  const index = recipeIndex(recipeId);
  return index !== -1 && applyResult(inventory, InventoryDomain.craft(stateFor(inventory), BigInt(index)));
}
