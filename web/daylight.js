// World-time to daylight: 0.28 at the darkest night, 1 at noon. The game and
// the multiplayer server both read it (the server decides when monsters spawn
// and burn), so the formula lives in one place.
export function daylightForTime(time) {
  return 0.28 + 0.72 * (0.5 + 0.5 * Math.sin(Number(time) * 0.08));
}

// Below this, night monsters spawn.
export const NIGHT_DAYLIGHT = 0.4;
