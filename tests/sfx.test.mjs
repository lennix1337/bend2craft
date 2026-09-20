import assert from "node:assert/strict";
import { TONES, toneSchedule } from "../web/sfx.js";

assert.ok(Object.keys(TONES).length >= 10);
for (const [kind, notes] of Object.entries(TONES)) {
  assert.ok(Array.isArray(notes) && notes.length > 0, `${kind} has notes`);
  for (const [frequency, duration, type, gain] of notes) {
    assert.ok(frequency > 0, `${kind} frequency`);
    assert.ok(duration > 0 && duration < 2, `${kind} duration`);
    assert.ok(["sine", "square", "sawtooth", "triangle"].includes(type), `${kind} wave`);
    assert.ok(gain > 0 && gain <= 0.2, `${kind} gain`);
  }
}
assert.equal(toneSchedule("missing"), TONES.click);
assert.equal(toneSchedule("hurt"), TONES.hurt);
console.log("sfx ok");
