const FACE_LIGHT_TINTS = Object.freeze([
  [1.04, 1.02, 0.96],
  [0.78, 0.84, 0.94],
  [1.0, 1.0, 1.0],
  [0.92, 0.96, 1.04],
  [1.02, 1.0, 0.96],
  [0.86, 0.91, 1.0],
]);

export function litFaceColor(faceIndex, daylight, light, shade = 1) {
  const tint = FACE_LIGHT_TINTS[Math.max(0, Math.min(5, Math.trunc(faceIndex)))] ?? FACE_LIGHT_TINTS[2];
  const lightFactor = 0.35 + 0.65 * Math.max(0, Math.min(15, Number(light))) / 15;
  const value = Math.min(1, Math.max(0, Number(daylight)) * lightFactor * Number(shade));
  return tint.map((channel) => Math.min(1, value * channel));
}

export function litEntityFaceColor(tint, faceIndex, daylight, shade = 1) {
  const base = litFaceColor(faceIndex, Math.max(0.36, Number(daylight)), 15, shade);
  return tint.map((channel, index) => Math.min(1, Math.max(0, Number(channel)) * base[index]));
}
