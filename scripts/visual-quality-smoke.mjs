import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:3000";
const captureDir = process.env.BEND2CRAFT_CAPTURE_DIR ?? "/tmp/bend2craft-quality";
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const consoleErrors = [];
const pageErrors = [];
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => pageErrors.push(String(error)));

try {
  await page.goto(`${baseUrl}/?test=1&quality=high&play=1&seed=1337&renderer=webgl&world=visual-quality`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForFunction(
    () => window.__bend2craft?.getFrameDiagnostics?.().meshRebuildPending === false
      && window.__bend2craft?.world?.pendingChunks === 0,
    null,
    { timeout: 30000 },
  );

  const poses = [
    { name: "spawn-day", time: 12, x: 25.5, z: 16.5, yaw: 0.0, pitch: -0.18 },
    { name: "terrain-detail", time: 12, x: 25.5, z: 24.5, yaw: 0.65, pitch: -0.22 },
    { name: "spawn-night", time: 58.9, x: 25.5, z: 16.5, yaw: 0.0, pitch: -0.18 },
  ];
  const captures = [];
  for (const pose of poses) {
    await page.evaluate(({ time, x, z, yaw, pitch }) => {
      window.__bend2craft.setWorldTimeForTest(time);
      window.__bend2craft.teleportForTest(x, z, 9, yaw, pitch);
    }, pose);
    await page.waitForTimeout(500);
    const path = `${captureDir}/${pose.name}.png`;
    await page.screenshot({ path });
    const probe = await page.evaluate(async () => {
      const region = [300, 210, 96, 96];
      const first = window.__bend2craft.readFramePixels(...region);
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      const second = window.__bend2craft.readFramePixels(...region);
      let changedPixels = 0;
      let nonBlackPixels = 0;
      for (let index = 0; index < first.length; index += 4) {
        if (first[index] !== second[index]
          || first[index + 1] !== second[index + 1]
          || first[index + 2] !== second[index + 2]
          || first[index + 3] !== second[index + 3]) changedPixels += 1;
        if (first[index] + first[index + 1] + first[index + 2] > 12) nonBlackPixels += 1;
      }
      return { pixels: first.length / 4, changedPixels, nonBlackPixels, frame: window.__bend2craft.getFrameDiagnostics() };
    });
    assert.ok(probe.pixels > 0);
    assert.equal(probe.frame.shaderQuality, 1, "visual-quality smoke must exercise the advanced shader path");
    assert.ok(probe.nonBlackPixels > probe.pixels * 0.2, `${pose.name} should not render a blank frame`);
    assert.ok(probe.changedPixels <= 96, `${pose.name} should not flicker in a static pose`);
    captures.push({ ...pose, path, probe });
  }

  const atlas = await page.evaluate(() => {
    const probes = Array.from({ length: 50 }, (_, tile) => window.__bend2craft.getAtlasTexelProbe(tile));
    return {
      mismatches: probes.reduce((sum, probe) => sum + probe.mismatches, 0),
      flipped: probes.reduce((sum, probe) => sum + probe.flippedMismatches, 0),
    };
  });
  assert.equal(atlas.mismatches, 0, "visible atlas texels must match the source canvas");
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ captures, atlas, consoleErrors, pageErrors }));
} finally {
  await browser.close();
}
