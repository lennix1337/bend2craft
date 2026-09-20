import assert from "node:assert/strict";
import {
  GAME_MODES,
  DIFFICULTIES,
  MODE_NAMES,
  createDefaultOptions,
  sanitizeOptions,
  createWorldConfig,
  validateWorldConfig,
  cycleMode,
} from "../web/settings.js";

assert.deepEqual(GAME_MODES, { SURVIVAL: 0, CREATIVE: 1, HARDCORE: 2 });
assert.equal(MODE_NAMES[GAME_MODES.HARDCORE], "Hardcore");

// Default options stay inside the playable range.
const options = createDefaultOptions();
assert.ok(options.fov >= 60 && options.fov <= 110);
assert.ok(options.sensitivity > 0 && options.sensitivity <= 3);
assert.equal(typeof options.showCoords, "boolean");

// Sanitizing clamps out-of-range values instead of crashing.
const fixed = sanitizeOptions({ fov: 200, sensitivity: -1, showCoords: 1, sound: false });
assert.equal(fixed.fov, 110);
assert.equal(fixed.sensitivity, 0.5);
assert.equal(fixed.showCoords, true);

// World names fall back to a default; seeds accept text.
const config = createWorldConfig({ name: "   ", seedText: "forest", mode: GAME_MODES.SURVIVAL, difficulty: DIFFICULTIES.NORMAL });
assert.equal(config.name, "New World");
assert.equal(typeof config.seedText, "string");
assert.equal(validateWorldConfig(config).length, 0);
assert.notEqual(validateWorldConfig({ ...config, mode: 99 }).length, 0);

// Hardcore always forces hard difficulty.
const hardcore = createWorldConfig({ name: "Run", seedText: "7", mode: GAME_MODES.HARDCORE, difficulty: DIFFICULTIES.PEACEFUL });
assert.equal(hardcore.difficulty, DIFFICULTIES.HARD);

// Mode button cycles survival -> creative -> hardcore -> survival.
assert.equal(cycleMode(GAME_MODES.SURVIVAL), GAME_MODES.CREATIVE);
assert.equal(cycleMode(GAME_MODES.CREATIVE), GAME_MODES.HARDCORE);
assert.equal(cycleMode(GAME_MODES.HARDCORE), GAME_MODES.SURVIVAL);

console.log("settings ok");
