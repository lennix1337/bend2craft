import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? null;
const browser = await chromium.launch({
  headless: true,
  args: ["--enable-unsafe-webgpu", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const consoleErrors = [];
const pageErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => pageErrors.push(String(error)));
try {
  await page.goto(baseUrl ?? "about:blank");
  const support = await page.evaluate(async () => {
    if (navigator.gpu === undefined) {
      return { supported: false, adapterName: null, reason: "navigator.gpu is unavailable" };
    }
    const adapter = await navigator.gpu.requestAdapter();
    return adapter === null
      ? { supported: false, adapterName: null, reason: "no WebGPU adapter was returned" }
      : { supported: true, adapterName: adapter.name ?? null, reason: null };
  });
  if (!support.supported || baseUrl === null) {
    console.log(JSON.stringify(support));
    process.exitCode = 0;
  } else {
    await page.goto(`${baseUrl}/?play=1&renderer=auto&seed=1337`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await page.waitForFunction(
      () => ["webgpu", "webgl"].includes(window.__bend2craft?.getFrameDiagnostics?.().renderer),
      null,
      { timeout: 30000 },
    );
    await page.waitForFunction(
      () => window.__bend2craft?.world?.activeChunks > 0
        && window.__bend2craft?.world?.pendingChunks === 0,
      null,
      { timeout: 30000 },
    );
    await page.waitForFunction(
      () => window.__bend2craft?.getFrameDiagnostics?.().meshRebuildPending === false,
      null,
      { timeout: 30000 },
    );
    const state = await page.evaluate(() => ({
      frame: window.__bend2craft.getFrameDiagnostics(),
      gpuBuffers: window.__bend2craft.glBufferSizes(),
      errorHidden: document.getElementById("error")?.hidden ?? false,
    }));
    assert.equal(state.errorHidden, true);
    assert.ok(["webgpu", "webgl"].includes(state.frame.renderer));
    assert.equal(state.frame.pendingChunks, 0);
    assert.ok(state.frame.meshWorkerResponses > 0);
    if (state.frame.renderer === "webgpu") {
      assert.ok(state.gpuBuffers.chunks > 0);
      assert.equal(state.gpuBuffers.vertexStrideBytes, 52);
      assert.ok(state.gpuBuffers.terrainBufferReuses > 0);
    }
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(pageErrors, []);
    console.log(JSON.stringify({ support, state, consoleErrors, pageErrors }));
  }
} finally {
  await browser.close();
}
