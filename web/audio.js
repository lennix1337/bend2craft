import { toneSchedule } from "./sfx.js";

export function createAudioMixer({ AudioContextCtor = globalThis.AudioContext, minInterval = 0.06 } = {}) {
  let context = null;
  let master = null;
  const lastPlayed = new Map();

  function ensure() {
    if (context !== null) {
      if (context.state === "suspended") context.resume?.();
      return true;
    }
    if (typeof AudioContextCtor !== "function") return false;
    context = new AudioContextCtor();
    master = context.createGain();
    master.gain.value = 0.18;
    master.connect(context.destination);
    context.resume?.();
    return true;
  }

  function play(kind) {
    if (!ensure()) return false;
    const now = Number(context.currentTime ?? 0);
    if (now - (lastPlayed.get(kind) ?? -Infinity) < minInterval) return false;
    lastPlayed.set(kind, now);
    for (const [frequency, duration, type, volume] of toneSchedule(kind)) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(now);
      oscillator.stop(now + duration);
    }
    return true;
  }

  function destroy() {
    if (context !== null) context.close?.();
    context = null;
    master = null;
    lastPlayed.clear();
  }

  return Object.freeze({ ensure, play, destroy });
}
