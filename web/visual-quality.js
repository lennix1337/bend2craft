// Adaptive quality for the presentation pipeline.
//
// The expensive stages (volumetric cloud march, shadow filter taps, bloom mips)
// are cheap on a discrete GPU and ruinous on a software rasteriser or a weak
// integrated part. Rather than picking one budget at boot, the controller
// watches a smoothed frame time and walks a quality ladder, so a fast machine
// gets the full effect and a slow one degrades to something that still runs.
//
// It is deliberately hysteretic and one-step-at-a-time: a controller that
// reacts to every frame oscillates visibly, because the very act of changing
// quality changes the frame time.

/**
 * Per-tier presentation budget.
 *
 * `renderScale` is the lever that scales the whole frame, so it is the one that
 * matters first when the budget is blown: dropping every effect's step count
 * still leaves the per-pixel cost of an offscreen HDR target, a bloom chain and
 * a composite, and that is what actually dominates on a weak or software
 * rasteriser.
 */
export const VISUAL_QUALITY_TIERS = Object.freeze([
  Object.freeze({ name: "minimal", cloudSteps: 8, cloudLightSteps: 1, shadowTaps: 4, bloomMips: 3, godraySteps: 0, waterDetail: 0.0, grassWind: 0.0, renderScale: 0.55 , shadowMapSize: 512 }),
  Object.freeze({ name: "low", cloudSteps: 11, cloudLightSteps: 1, shadowTaps: 6, bloomMips: 4, godraySteps: 0, waterDetail: 0.4, grassWind: 0.6, renderScale: 0.72 , shadowMapSize: 1024 }),
  Object.freeze({ name: "medium", cloudSteps: 12, cloudLightSteps: 1, shadowTaps: 10, bloomMips: 5, godraySteps: 16, waterDetail: 0.8, grassWind: 0.85, renderScale: 0.88 , shadowMapSize: 1024 }),
  Object.freeze({ name: "high", cloudSteps: 17, cloudLightSteps: 2, shadowTaps: 16, bloomMips: 6, godraySteps: 24, waterDetail: 1.0, grassWind: 1.0, renderScale: 1.0 , shadowMapSize: 2048 }),
  Object.freeze({ name: "ultra", cloudSteps: 24, cloudLightSteps: 3, shadowTaps: 24, bloomMips: 6, godraySteps: 32, waterDetail: 1.0, grassWind: 1.0, renderScale: 1.0 , shadowMapSize: 2048 }),
]);

export const DEFAULT_VISUAL_QUALITY = 3;
/** Frame-time budget for one step down, in milliseconds. */
export const DOWNGRADE_BUDGET_MS = 26;
/** Frame-time head-room needed before stepping back up. */
export const UPGRADE_BUDGET_MS = 12;
/** Frames to wait after a change before the next one is allowed. */
export const SETTLE_FRAMES = 20;
/**
 * A single frame this far over budget means the current tier is not merely a
 * little too expensive, it is unusable. Climbing down one step per settle window
 * would take seconds of unplayable frames, so a panic drops several tiers at once.
 */
export const PANIC_BUDGET_MS = 90;
export const PANIC_STEP = 3;

/**
 * Resolve a level to a tier index. Both the ladder position and the tier name
 * are accepted, because every caller that pins a tier has a name in hand (a URL
 * parameter, a stored preference) while the controller works in indices. Accepting
 * only an index made a name resolve to NaN and silently fall back to the default,
 * so "ultra" quietly ran "high".
 */
export function clampVisualQuality(value) {
  const named = visualQualityTierByName(value);
  if (named !== null) return VISUAL_QUALITY_TIERS.indexOf(named);
  const index = Math.trunc(Number(value));
  if (!Number.isFinite(index)) return DEFAULT_VISUAL_QUALITY;
  return Math.max(0, Math.min(VISUAL_QUALITY_TIERS.length - 1, index));
}

/** Resolve a tier by name, or null when the name is unknown. */
export function visualQualityTierByName(name) {
  const key = String(name ?? "").trim().toLowerCase();
  return VISUAL_QUALITY_TIERS.find((tier) => tier.name === key) ?? null;
}

/** Accepts a tier name or an index, for a `?graphics=` style override. */
export function parseVisualQuality(value) {
  if (value === null || value === undefined) return null;
  const named = visualQualityTierByName(value);
  if (named !== null) return named.name;
  const index = Number(value);
  if (!Number.isFinite(index)) return null;
  return VISUAL_QUALITY_TIERS[clampVisualQuality(index)].name;
}

export function createVisualQualityController({ initial = DEFAULT_VISUAL_QUALITY, auto = true } = {}) {
  let level = clampVisualQuality(initial);
  let settleFrames = SETTLE_FRAMES;
  let smoothedMs = 0;
  let samples = 0;
  return {
    get level() {
      return level;
    },
    get tier() {
      return VISUAL_QUALITY_TIERS[level];
    },
    get auto() {
      return auto;
    },
    get smoothedFrameMs() {
      return smoothedMs;
    },
    get samples() {
      return samples;
    },
    /** Pin the level and stop adapting. */
    setLevel(value) {
      level = clampVisualQuality(value);
      settleFrames = SETTLE_FRAMES;
      return this.tier;
    },
    /**
     * Feed one frame. Returns the tier to use this frame; it is the same
     * object until the controller decides to move.
     */
    sample(frameMs) {
      const elapsed = Math.max(0.1, Number(frameMs) || 0.1);
      // A panic fires on the raw frame, not the average: the point is to escape a
      // catastrophic tier immediately rather than after it has been smoothed.
      if (auto && elapsed > PANIC_BUDGET_MS && level > 0) {
        level = Math.max(0, level - PANIC_STEP);
        settleFrames = SETTLE_FRAMES;
        smoothedMs = elapsed;
        samples = 1;
        return this.tier;
      }
      smoothedMs = samples === 0 ? elapsed : smoothedMs * 0.88 + elapsed * 0.12;
      samples += 1;
      if (!auto) return this.tier;
      if (settleFrames > 0) {
        settleFrames -= 1;
        return this.tier;
      }
      if (smoothedMs > DOWNGRADE_BUDGET_MS && level > 0) {
        level -= 1;
        settleFrames = SETTLE_FRAMES;
        smoothedMs = 0;
      } else if (smoothedMs < UPGRADE_BUDGET_MS && level < VISUAL_QUALITY_TIERS.length - 1) {
        level += 1;
        settleFrames = SETTLE_FRAMES;
        smoothedMs = 0;
      }
      return this.tier;
    },
  };
}
