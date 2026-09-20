import assert from "node:assert/strict";
import {
  MAX_HEALTH,
  MAX_HUNGER,
  FALL_SAFE_BLOCKS,
  GAME_MODES,
  createSurvivalState,
  fallDamage,
  applyDamage,
  heal,
  drainHunger,
  eatFood,
  isDead,
  isHardcore,
  isCreative,
  takesDamage,
  shouldRegen,
  shouldStarve,
  addExhaustion,
} from "../web/survival.js";

assert.equal(MAX_HEALTH, 20);
assert.equal(MAX_HUNGER, 20);
assert.equal(FALL_SAFE_BLOCKS, 3);

// Fall damage mirrors Minecraft: no damage within 3 blocks, then 1 per block.
assert.equal(fallDamage(0), 0);
assert.equal(fallDamage(3), 0);
assert.equal(fallDamage(4), 1);
assert.equal(fallDamage(10), 7);
assert.equal(fallDamage(3.9), 0);

// Damage saturates at zero and reports death.
const player = createSurvivalState(GAME_MODES.SURVIVAL);
assert.deepEqual({ health: player.health, hunger: player.hunger }, { health: 20, hunger: 20 });
assert.equal(isDead(player), false);
applyDamage(player, 7, GAME_MODES.SURVIVAL);
assert.equal(player.health, 13);
applyDamage(player, 99, GAME_MODES.SURVIVAL);
assert.equal(player.health, 0);
assert.equal(isDead(player), true);

// Healing caps at the maximum; the dead can only return via respawn.
heal(player, 5);
assert.equal(player.health, 0);
const revived = createSurvivalState(GAME_MODES.SURVIVAL);
revived.health = 15;
heal(revived, 5);
assert.equal(revived.health, MAX_HEALTH);
heal(revived, 99);
assert.equal(revived.health, MAX_HEALTH);

// Hunger drains to zero and eating caps at the maximum.
const eater = createSurvivalState(GAME_MODES.SURVIVAL);
drainHunger(eater, 6);
assert.equal(eater.hunger, 14);
drainHunger(eater, 99);
assert.equal(eater.hunger, 0);
eatFood(eater, 4);
assert.equal(eater.hunger, 4);
eatFood(eater, 99);
assert.equal(eater.hunger, MAX_HUNGER);

// Creative mode takes no damage and never drains hunger.
const creative = createSurvivalState(GAME_MODES.CREATIVE);
assert.equal(isCreative(GAME_MODES.CREATIVE), true);
assert.equal(takesDamage(GAME_MODES.CREATIVE), false);
applyDamage(creative, 10, GAME_MODES.CREATIVE);
assert.equal(creative.health, MAX_HEALTH);
assert.equal(shouldStarve(creative, GAME_MODES.CREATIVE), false);

// Hardcore is survival with permadeath.
assert.equal(isHardcore(GAME_MODES.HARDCORE), true);
assert.equal(isHardcore(GAME_MODES.SURVIVAL), false);
assert.equal(takesDamage(GAME_MODES.HARDCORE), true);

// Regen needs high hunger; starvation needs empty hunger.
const hungry = createSurvivalState(GAME_MODES.SURVIVAL);
hungry.health = 10;
hungry.hunger = 18;
assert.equal(shouldRegen(hungry, GAME_MODES.SURVIVAL), true);
hungry.hunger = 10;
assert.equal(shouldRegen(hungry, GAME_MODES.SURVIVAL), false);
hungry.hunger = 0;
assert.equal(shouldStarve(hungry, GAME_MODES.SURVIVAL), true);

// Exhaustion accumulates and spills whole hunger points.
const runner = createSurvivalState(GAME_MODES.SURVIVAL);
addExhaustion(runner, 3.0);
assert.equal(runner.hunger, 20);
addExhaustion(runner, 1.5);
assert.equal(runner.hunger, 19);

console.log("survival ok");
