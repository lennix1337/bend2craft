// Menu options and world creation settings.
// Pure and dependency-free; persistence is injected by the caller so the
// rules stay testable without a browser. Only options the game implements
// are exposed: field of view, mouse sensitivity, render distance and the
// coordinates readout.

export const OPTIONS_KEY = "bend2craft-options";
export const MIN_FOV = 60;
export const MAX_FOV = 110;
export const MIN_SENSITIVITY = 0.5;
export const MAX_SENSITIVITY = 3;
export const MIN_RENDER_DISTANCE = 2;
export const MAX_RENDER_DISTANCE = 6;
export const DEFAULT_RENDER_DISTANCE = 2;
export const DEFAULT_WORLD_NAME = "New World";
export const WORLD_MODES = Object.freeze({
  SURVIVAL: "survival",
  PEACEFUL: "peaceful",
});
export const DEFAULT_WORLD_MODE = WORLD_MODES.SURVIVAL;

export function normalizeWorldMode(value) {
  return value === WORLD_MODES.PEACEFUL ? WORLD_MODES.PEACEFUL : DEFAULT_WORLD_MODE;
}

export function worldModeLabel(value) {
  return normalizeWorldMode(value) === WORLD_MODES.PEACEFUL ? "Peaceful" : "Survival";
}

export function createDefaultOptions() {
  return { fov: 75, sensitivity: 1, showCoords: true, renderDistance: DEFAULT_RENDER_DISTANCE };
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

export function sanitizeOptions(raw = {}) {
  const fallback = createDefaultOptions();
  return {
    fov: clampNumber(raw.fov, MIN_FOV, MAX_FOV, fallback.fov),
    sensitivity: clampNumber(raw.sensitivity, MIN_SENSITIVITY, MAX_SENSITIVITY, fallback.sensitivity),
    showCoords: raw.showCoords === undefined ? fallback.showCoords : Boolean(raw.showCoords),
    renderDistance: clampInteger(raw.renderDistance, MIN_RENDER_DISTANCE, MAX_RENDER_DISTANCE, fallback.renderDistance),
  };
}

export function loadOptions(store) {
  try {
    const raw = store.getItem(OPTIONS_KEY);
    if (!raw) return createDefaultOptions();
    return sanitizeOptions(JSON.parse(raw));
  } catch {
    return createDefaultOptions();
  }
}

export function saveOptions(store, options) {
  try {
    store.setItem(OPTIONS_KEY, JSON.stringify(sanitizeOptions(options)));
    return true;
  } catch {
    return false;
  }
}

export function createWorldConfig({ name = "", seedText = "", mode = DEFAULT_WORLD_MODE } = {}) {
  return {
    name: String(name ?? "").trim() || DEFAULT_WORLD_NAME,
    seedText: String(seedText ?? "").trim(),
    mode: normalizeWorldMode(mode),
  };
}

export function validateWorldConfig(config) {
  const errors = [];
  if (!config || typeof config !== "object") return ["World settings are missing."];
  if (typeof config.name !== "string" || config.name.trim().length === 0) {
    errors.push("World name is missing.");
  }
  if (typeof config.seedText !== "string") errors.push("Seed must be text.");
  if (config.mode !== WORLD_MODES.SURVIVAL && config.mode !== WORLD_MODES.PEACEFUL) {
    errors.push("World mode is invalid.");
  }
  return errors;
}

export function randomSeedText() {
  return String(Math.floor(Math.random() * 1000000));
}

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
