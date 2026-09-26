import assert from "node:assert/strict";
import {
  DOWNGRADE_BUDGET_MS,
  PANIC_BUDGET_MS,
  UPGRADE_BUDGET_MS,
  VISUAL_QUALITY_TIERS,
  clampVisualQuality,
  createVisualQualityController,
  parseVisualQuality,
  visualQualityTierByName,
} from "../web/visual-quality.js";

assert.ok(VISUAL_QUALITY_TIERS.length >= 3, "there must be a ladder to walk down");
assert.equal(VISUAL_QUALITY_TIERS[0].name, "minimal");
assert.equal(VISUAL_QUALITY_TIERS[VISUAL_QUALITY_TIERS.length - 1].name, "ultra");

// The ladder must be monotone: a cheaper tier may never do more work than a
// dearer one, or "stepping down" would not be a step down.
const costKeys = ["cloudSteps", "cloudLightSteps", "shadowTaps", "bloomMips", "godraySteps"];
for (let index = 1; index < VISUAL_QUALITY_TIERS.length; index += 1) {
  for (const key of costKeys) {
    const previous = VISUAL_QUALITY_TIERS[index - 1][key];
    const current = VISUAL_QUALITY_TIERS[index][key];
    assert.ok(
      current >= previous,
      `${key} must not fall going from ${VISUAL_QUALITY_TIERS[index - 1].name} to ${VISUAL_QUALITY_TIERS[index].name}`,
    );
  }
}
// The top tier has to be worth the name, and the bottom tier must still be a
// real render rather than a stub.
assert.ok(VISUAL_QUALITY_TIERS[0].cloudSteps >= 4, "the cheapest tier still marches the cloud deck");
assert.ok(VISUAL_QUALITY_TIERS[0].shadowTaps >= 4, "the cheapest tier still filters the shadow map");
assert.ok(VISUAL_QUALITY_TIERS[VISUAL_QUALITY_TIERS.length - 1].cloudSteps >= 16, "ultra must be a real march");

assert.equal(clampVisualQuality(-5), 0);
assert.equal(clampVisualQuality(99), VISUAL_QUALITY_TIERS.length - 1);
assert.equal(clampVisualQuality("nope"), 3, "a non-numeric level falls back to the default");
// A tier *name* has to resolve to its own index, not to the default. This is the
// form every pin arrives in (a URL parameter, a stored preference), and a name
// that fell through to NaN silently ran the default tier instead.
for (const tier of VISUAL_QUALITY_TIERS) {
  assert.equal(clampVisualQuality(tier.name), VISUAL_QUALITY_TIERS.indexOf(tier), `${tier.name} must resolve to its own index`);
  assert.equal(clampVisualQuality(tier.name.toUpperCase()), VISUAL_QUALITY_TIERS.indexOf(tier), "a name match is case insensitive");
  assert.equal(clampVisualQuality(` ${tier.name} `), VISUAL_QUALITY_TIERS.indexOf(tier), "a name match tolerates whitespace");
  // A pin is the only way to reach a tier with adaptation off, so the round trip
  // through the parser has to land on exactly that tier.
  assert.equal(clampVisualQuality(parseVisualQuality(tier.name)), VISUAL_QUALITY_TIERS.indexOf(tier));
}
assert.equal(visualQualityTierByName("ultra")?.name, "ultra");
assert.equal(visualQualityTierByName("ULTRA")?.name, "ultra");
assert.equal(visualQualityTierByName("nope"), null);
assert.equal(parseVisualQuality("minimal"), "minimal");
assert.equal(parseVisualQuality("0"), "minimal");
assert.equal(parseVisualQuality("3"), "high");
assert.equal(parseVisualQuality(null), null);
assert.equal(parseVisualQuality(undefined), null);
assert.equal(parseVisualQuality("nope"), null);

// A pinned controller must not adapt, or a `?graphics=` override would be
// silently undone by the very next frame.
const pinned = createVisualQualityController({ initial: 0, auto: false });
for (let frame = 0; frame < 200; frame += 1) pinned.sample(400);
assert.equal(pinned.level, 0, "auto:false must pin the level");
assert.equal(pinned.tier.name, "minimal");
assert.equal(pinned.auto, false);

// The controller starts high and walks down under load.
const adaptive = createVisualQualityController({ initial: VISUAL_QUALITY_TIERS.length - 1 });
const startLevel = adaptive.level;
for (let frame = 0; frame < 400; frame += 1) adaptive.sample(120);
assert.ok(adaptive.level < startLevel, "a sustained 120 ms frame time must step the tier down");
assert.equal(adaptive.auto, true);

// A single catastrophic frame must drop several tiers at once. Climbing one step
// per settle window would leave the game unplayable for seconds.
const panicking = createVisualQualityController({ initial: VISUAL_QUALITY_TIERS.length - 1 });
panicking.sample(PANIC_BUDGET_MS * 2);
assert.ok(
  panicking.level <= VISUAL_QUALITY_TIERS.length - 1 - 3,
  "a panic frame must drop more than one tier",
);

// It must recover once there is headroom again, and never overshoot the ladder.
const recovering = createVisualQualityController({ initial: 1 });
for (let frame = 0; frame < 4000; frame += 1) recovering.sample(2);
assert.equal(recovering.tier.name, "ultra", "sustained headroom must climb back to the top tier");
for (let frame = 0; frame < 4000; frame += 1) recovering.sample(1000);
assert.equal(recovering.tier.name, "minimal", "sustained load must fall back to the bottom tier");

// A bad sample must not produce a NaN level or a torn timer.
const robust = createVisualQualityController({ initial: 2 });
for (const bad of [Number.NaN, 0, -1, Number.POSITIVE_INFINITY, undefined]) robust.sample(bad);
assert.ok(Number.isInteger(robust.level));
assert.ok(robust.level >= 0 && robust.level < VISUAL_QUALITY_TIERS.length);
assert.ok(robust.smoothedFrameMs > 0, "a smoothed frame time is always reported");

// The hysteresis band must be real: a frame time between the two budgets must
// not move the level, or the controller oscillates and the image visibly flickers.
const steady = createVisualQualityController({ initial: 2 });
const middle = (DOWNGRADE_BUDGET_MS + UPGRADE_BUDGET_MS) / 2;
for (let frame = 0; frame < 600; frame += 1) steady.sample(middle);
assert.equal(steady.level, 2, "a frame time inside the hysteresis band must hold the tier");

console.log("visual quality ok");
