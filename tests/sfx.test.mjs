import assert from "node:assert/strict";
import { TONES, toneSchedule } from "../web/sfx.js";

assert.ok(Object.keys(TONES).length >= 10);
for (const [kind, notes] of Object.entries(TONES)) {
  assert.ok(Array.isArray(notes) && notes.length > 0, `${kind} has notes`);
  for (const [frequency, duration, type, gain, offset = 0] of notes) {
    assert.ok(frequency > 0, `${kind} frequency`);
    assert.ok(duration > 0 && duration < 2, `${kind} duration`);
    assert.ok(["sine", "square", "sawtooth", "triangle"].includes(type), `${kind} wave`);
    assert.ok(gain > 0 && gain <= 0.2, `${kind} gain`);
    assert.ok(offset >= 0 && offset < 1, `${kind} start offset`);
  }
}
assert.equal(toneSchedule("missing"), TONES.click);
assert.equal(toneSchedule("hurt"), TONES.hurt);

/**
 * A schedule is a chord: without an offset every note in a kind starts at the
 * same instant, so a sound that needs to unfold over time - a fire crackling,
 * a footstep landing - collapses into a single simultaneous hit. The optional
 * fifth field is what lets a kind spread its notes out.
 */
assert.ok(TONES.burn.length >= 3, "fire needs more than one note to read as fire");
const burnOffsets = TONES.burn.map(([, , , , offset = 0]) => offset);
assert.ok(new Set(burnOffsets).size > 1, "the fire crackle must be spread over time, not one chord");
assert.ok(Math.max(...burnOffsets) > 0, "at least one fire note has to start late");
assert.ok(Math.max(...burnOffsets) < 1, "the fire schedule must still be short");
// The low sustained note is the roar; without it the crackle has no body under it.
assert.ok(Math.min(...TONES.burn.map(([frequency]) => frequency)) < 200,
  "fire needs a low component or it is just a hiss");

// A mob that is hurt has to say so. These two tones existed but nothing played
// them, so a hit mob was silent.
assert.ok(TONES.oink.length > 0 && TONES.groan.length > 0,
  "the mob hurt tones must exist for the two mob families");

console.log("sfx ok");
