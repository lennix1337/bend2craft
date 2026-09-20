// Pure survival state. Mirrors world/survival.bend so the Bend 2 engine
// stays the source of truth for damage and hunger rules.
// Dependency-free and testable without a browser.

export const MAX_HEALTH = 20;
export const MAX_HUNGER = 20;
export const FALL_SAFE_BLOCKS = 3;

export const GAME_MODES = Object.freeze({
  SURVIVAL: 0,
  CREATIVE: 1,
  HARDCORE: 2,
});

export const REGEN_MIN_HUNGER = 18;
export const STARVE_DAMAGE = 1;
export const REGEN_HEAL = 1;
export const VOID_DAMAGE = 4;

export function createSurvivalState(mode = GAME_MODES.SURVIVAL) {
  return {
    health: MAX_HEALTH,
    hunger: MAX_HUNGER,
    exhaustion: 0,
    regenTimer: 0,
    starveTimer: 0,
    mode,
    dead: false,
  };
}

export function fallDamage(blocks) {
  const whole = Math.floor(Number(blocks) || 0);
  return Math.max(0, whole - FALL_SAFE_BLOCKS);
}

export function isDead(state) {
  return state.health <= 0 || state.dead === true;
}

export function isCreative(mode) {
  return mode === GAME_MODES.CREATIVE;
}

export function isHardcore(mode) {
  return mode === GAME_MODES.HARDCORE;
}

export function takesDamage(mode) {
  return mode === GAME_MODES.SURVIVAL || mode === GAME_MODES.HARDCORE;
}

export function drainsHunger(mode) {
  return takesDamage(mode);
}

export function applyDamage(state, amount, mode = state.mode) {
  if (!takesDamage(mode) || amount <= 0) return 0;
  const dealt = Math.min(state.health, Math.floor(amount));
  state.health = Math.max(0, state.health - dealt);
  if (state.health <= 0) state.dead = true;
  return dealt;
}

export function heal(state, amount) {
  if (amount <= 0 || isDead(state)) return 0;
  const healed = Math.min(MAX_HEALTH - state.health, Math.floor(amount));
  state.health += healed;
  return healed;
}

export function drainHunger(state, amount) {
  if (amount <= 0) return 0;
  const drained = Math.min(state.hunger, Math.floor(amount));
  state.hunger -= drained;
  return drained;
}

export function eatFood(state, hungerPoints) {
  if (hungerPoints <= 0 || isDead(state)) return 0;
  const restored = Math.min(MAX_HUNGER - state.hunger, Math.floor(hungerPoints));
  state.hunger += restored;
  state.exhaustion = Math.max(0, state.exhaustion - restored);
  return restored;
}

export function shouldRegen(state, mode = state.mode) {
  return (
    takesDamage(mode) &&
    !isDead(state) &&
    state.health > 0 &&
    state.health < MAX_HEALTH &&
    state.hunger >= REGEN_MIN_HUNGER
  );
}

export function shouldStarve(state, mode = state.mode) {
  return takesDamage(mode) && !isDead(state) && state.hunger <= 0;
}

// Exhaustion accumulates from effort; every 4 points cost 1 hunger.
export function addExhaustion(state, amount, mode = state.mode) {
  if (!drainsHunger(mode) || amount <= 0) return 0;
  state.exhaustion += amount;
  let spent = 0;
  while (state.exhaustion >= 4 && state.hunger > 0) {
    state.exhaustion -= 4;
    state.hunger -= 1;
    spent += 1;
  }
  if (state.hunger <= 0) {
    state.hunger = 0;
    state.exhaustion = Math.min(state.exhaustion, 4);
  }
  return spent;
}

// Fixed-step survival tick: regen drains hunger, starvation hurts.
// Returns a small event summary for the HUD and tests.
export function survivalTick(state, dt, mode = state.mode) {
  const events = { healed: 0, starved: 0 };
  if (!takesDamage(mode) || isDead(state)) {
    state.regenTimer = 0;
    state.starveTimer = 0;
    return events;
  }
  if (shouldRegen(state, mode)) {
    state.regenTimer += dt;
    if (state.regenTimer >= 3) {
      state.regenTimer = 0;
      if (state.hunger > 0) {
        state.hunger -= 1;
        events.healed = heal(state, REGEN_HEAL);
      }
    }
  } else {
    state.regenTimer = 0;
  }
  if (shouldStarve(state, mode)) {
    state.starveTimer += dt;
    if (state.starveTimer >= 2) {
      state.starveTimer = 0;
      events.starved = applyDamage(state, STARVE_DAMAGE, mode);
    }
  } else {
    state.starveTimer = 0;
  }
  return events;
}
