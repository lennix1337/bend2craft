// Pure menu, mode and option helpers. Dependency-free so the rules can be
// tested without a browser; persistence is injected by the caller.

export const GAME_MODES = Object.freeze({
  SURVIVAL: 0,
  CREATIVE: 1,
  HARDCORE: 2,
});

export const MODE_NAMES = Object.freeze({
  0: "Survival",
  1: "Creative",
  2: "Hardcore",
});

export const MODE_DESCRIPTIONS = Object.freeze({
  0: "Gather blocks, eat food and survive falls, hunger and the void.",
  1: "Unlimited blocks, no damage, no hunger. Fly with double Space.",
  2: "Survival locked on Hard. Death deletes the world forever.",
});

export const DIFFICULTIES = Object.freeze({
  PEACEFUL: 0,
  EASY: 1,
  NORMAL: 2,
  HARD: 3,
});

export const DIFFICULTY_NAMES = Object.freeze({
  0: "Peaceful",
  1: "Easy",
  2: "Normal",
  3: "Hard",
});

export const DEFAULT_WORLD_NAME = "New World";
export const MIN_FOV = 60;
export const MAX_FOV = 110;
export const MIN_SENSITIVITY = 0.5;
export const MAX_SENSITIVITY = 3;

export function createDefaultOptions() {
  return {
    fov: 75,
    sensitivity: 1,
    showCoords: true,
    sound: true,
    fovKick: true,
  };
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function sanitizeOptions(raw = {}) {
  const fallback = createDefaultOptions();
  return {
    fov: clampNumber(raw.fov, MIN_FOV, MAX_FOV, fallback.fov),
    sensitivity: clampNumber(raw.sensitivity, MIN_SENSITIVITY, MAX_SENSITIVITY, fallback.sensitivity),
    showCoords: raw.showCoords === undefined ? fallback.showCoords : Boolean(raw.showCoords),
    sound: raw.sound === undefined ? fallback.sound : Boolean(raw.sound),
    fovKick: raw.fovKick === undefined ? fallback.fovKick : Boolean(raw.fovKick),
  };
}

export function cycleMode(mode) {
  if (mode === GAME_MODES.SURVIVAL) return GAME_MODES.CREATIVE;
  if (mode === GAME_MODES.CREATIVE) return GAME_MODES.HARDCORE;
  return GAME_MODES.SURVIVAL;
}

export function cycleDifficulty(difficulty) {
  return (difficulty + 1) % 4;
}

export function createWorldConfig({ name = "", seedText = "", mode = GAME_MODES.SURVIVAL, difficulty = DIFFICULTIES.NORMAL } = {}) {
  const cleanName = String(name ?? "").trim() || DEFAULT_WORLD_NAME;
  const cleanSeed = String(seedText ?? "").trim();
  const safeMode = Object.values(GAME_MODES).includes(mode) ? mode : GAME_MODES.SURVIVAL;
  const safeDifficulty = Object.values(DIFFICULTIES).includes(difficulty) ? difficulty : DIFFICULTIES.NORMAL;
  return {
    name: cleanName,
    seedText: cleanSeed,
    mode: safeMode,
    // Hardcore is always played on Hard, like Minecraft.
    difficulty: safeMode === GAME_MODES.HARDCORE ? DIFFICULTIES.HARD : safeDifficulty,
  };
}

export function validateWorldConfig(config) {
  const errors = [];
  if (!config || typeof config !== "object") return ["World settings are missing."];
  if (!Object.values(GAME_MODES).includes(config.mode)) errors.push("Unknown game mode.");
  if (!Object.values(DIFFICULTIES).includes(config.difficulty)) errors.push("Unknown difficulty.");
  if (config.mode === GAME_MODES.HARDCORE && config.difficulty !== DIFFICULTIES.HARD) {
    errors.push("Hardcore must use Hard difficulty.");
  }
  if (typeof config.name !== "string" || config.name.trim().length === 0) {
    errors.push("World name is missing.");
  }
  if (typeof config.seedText !== "string") errors.push("Seed must be text.");
  return errors;
}

export function randomSeedText() {
  return String(Math.floor(Math.random() * 1000000));
}

// Storage helpers take an explicit store so they stay testable.
export function loadJson(store, key, fallback) {
  try {
    const raw = store.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function saveJson(store, key, value) {
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
