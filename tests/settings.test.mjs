import assert from "node:assert/strict";
import {
  createDefaultOptions,
  createWorldConfig,
  DEFAULT_CONTROLS,
  DEFAULT_RENDERER,
  DEFAULT_RENDER_DISTANCE,
  MAX_RENDER_DISTANCE,
  MIN_RENDER_DISTANCE,
  loadJson,
  loadOptions,
  randomSeedText,
  RENDERER_MODES,
  runtimeRendererMode,
  saveJson,
  saveOptions,
  sanitizeOptions,
  validateWorldConfig,
  WORLD_MODES,
  worldModeLabel,
} from "../web/settings.js";

function memoryStore(entries = {}) {
  const data = new Map(Object.entries(entries));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
  };
}

assert.equal(DEFAULT_RENDER_DISTANCE, 2);
assert.equal(MIN_RENDER_DISTANCE, 2);
assert.equal(MAX_RENDER_DISTANCE, 6);
assert.equal(DEFAULT_RENDERER, RENDERER_MODES.WEBGL);
assert.equal(runtimeRendererMode(RENDERER_MODES.AUTO), RENDERER_MODES.WEBGL);
assert.equal(runtimeRendererMode(RENDERER_MODES.WEBGPU), RENDERER_MODES.WEBGPU);
assert.equal(runtimeRendererMode(RENDERER_MODES.WEBGL), RENDERER_MODES.WEBGL);
assert.deepEqual(createDefaultOptions(), {
  fov: 75,
  sensitivity: 1,
  showCoords: true,
  renderDistance: 2,
  renderer: "webgl",
  controls: DEFAULT_CONTROLS,
});
assert.deepEqual(sanitizeOptions({ fov: 200, sensitivity: -1, renderDistance: 99 }), {
  fov: 110,
  sensitivity: 0.5,
  showCoords: true,
  renderDistance: 6,
  renderer: "webgl",
  controls: DEFAULT_CONTROLS,
});
assert.deepEqual(sanitizeOptions({ fov: "wide" }), createDefaultOptions());
assert.deepEqual(loadOptions(memoryStore()), createDefaultOptions());
assert.deepEqual(loadOptions(memoryStore({ "bend2craft-options": "{\"fov\":90}" })), {
  fov: 90,
  sensitivity: 1,
  showCoords: true,
  renderDistance: 2,
  renderer: "webgl",
  controls: DEFAULT_CONTROLS,
});
assert.equal(sanitizeOptions({ renderDistance: MIN_RENDER_DISTANCE - 1 }).renderDistance, MIN_RENDER_DISTANCE);

const store = memoryStore();
assert.equal(saveOptions(store, {
  fov: 90,
  sensitivity: 2,
  showCoords: false,
  renderDistance: 6,
  renderer: RENDERER_MODES.WEBGPU,
  controls: DEFAULT_CONTROLS,
}), true);
assert.deepEqual(loadOptions(store), {
  fov: 90,
  sensitivity: 2,
  showCoords: false,
  renderDistance: 6,
  renderer: "webgpu",
  controls: DEFAULT_CONTROLS,
});
const rebound = sanitizeOptions({ controls: { drop: "KeyX", attack: "Mouse4" } });
assert.equal(rebound.controls.drop, "KeyX");
assert.equal(rebound.controls.attack, "Mouse4");
assert.equal(rebound.controls.inventory, DEFAULT_CONTROLS.inventory);

assert.deepEqual(createWorldConfig({ name: "  ", seedText: 42 }), { name: "New World", seedText: "42", mode: "survival" });
assert.deepEqual(createWorldConfig({ name: "Lab", seedText: "forest", mode: WORLD_MODES.PEACEFUL }), { name: "Lab", seedText: "forest", mode: "peaceful" });
assert.equal(worldModeLabel("peaceful"), "Peaceful");
assert.equal(worldModeLabel("unknown"), "Survival");
assert.deepEqual(validateWorldConfig(createWorldConfig({ name: "Home", seedText: "forest" })), []);
assert.ok(validateWorldConfig(null).length > 0);
assert.ok(/^\d+$/.test(randomSeedText()));
assert.deepEqual(loadJson(memoryStore(), "missing", { a: 1 }), { a: 1 });
assert.equal(saveJson(store, "key", { b: 2 }), true);
assert.deepEqual(loadJson(store, "key", null), { b: 2 });
console.log("settings ok");
