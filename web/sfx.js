// Procedural sound schedules. Pure data so the mix can be tested;
// the browser adapter in main.js turns schedules into WebAudio notes.

export const TONES = Object.freeze({
  click: Object.freeze([[660, 0.05, "square", 0.05]]),
  break: Object.freeze([[170, 0.09, "sawtooth", 0.08]]),
  place: Object.freeze([[240, 0.07, "square", 0.07]]),
  hurt: Object.freeze([[110, 0.18, "sawtooth", 0.1]]),
  eat: Object.freeze([[520, 0.07, "sine", 0.09], [680, 0.09, "sine", 0.09]]),
  death: Object.freeze([[220, 0.5, "sawtooth", 0.1]]),
  splash: Object.freeze([[392, 0.12, "triangle", 0.08], [523, 0.16, "triangle", 0.08]]),
  step: Object.freeze([[140, 0.05, "triangle", 0.035]]),
  land: Object.freeze([[90, 0.1, "triangle", 0.07]]),
  oink: Object.freeze([[320, 0.08, "square", 0.06], [260, 0.1, "square", 0.06]]),
  groan: Object.freeze([[85, 0.28, "sawtooth", 0.08]]),
  pop: Object.freeze([[500, 0.06, "sine", 0.07]]),
  burn: Object.freeze([[200, 0.12, "sawtooth", 0.05]]),
});

export function toneSchedule(kind) {
  return TONES[kind] ?? TONES.click;
}
