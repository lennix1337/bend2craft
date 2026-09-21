import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:3000";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const consoleErrors = [];
const pageErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => pageErrors.push(String(error)));

try {
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle", timeout: 30000 });
  await page.locator('[data-action="goto-options"]').click();
  const renderDistanceOptions = await page.evaluate(() => {
    const input = document.getElementById("input-render-distance");
    const renderer = document.getElementById("input-renderer");
    return {
      min: Number(input?.min),
      max: Number(input?.max),
      value: Number(input?.value),
      output: document.getElementById("render-distance-value")?.textContent,
      rendererValue: renderer?.value,
      rendererOptions: [...(renderer?.options ?? [])].map((option) => option.value),
    };
  });
  assert.deepEqual(renderDistanceOptions, {
    min: 2,
    max: 6,
    value: 2,
    output: "2",
    rendererValue: "auto",
    rendererOptions: ["auto", "webgpu", "webgl"],
  });
  await page.locator("#input-render-distance").evaluate((input) => {
    input.value = "4";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const savedRenderDistance = await page.evaluate(() => JSON.parse(
    window.localStorage.getItem("bend2craft-options"),
  ).renderDistance);
  assert.equal(savedRenderDistance, 4);
  await page.locator("#input-renderer").selectOption("webgl");
  const savedRenderer = await page.evaluate(() => JSON.parse(
    window.localStorage.getItem("bend2craft-options"),
  ).renderer);
  assert.equal(savedRenderer, "webgl");
  await page.evaluate(() => window.localStorage.setItem(
    "bend2craft-options",
    JSON.stringify({ fov: 75, sensitivity: 1, showCoords: true, renderDistance: 2, renderer: "auto" }),
  ));

  await page.goto(`${baseUrl}/?play=1&seed=1337`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForFunction(
    () => window.__bend2craft?.world?.activeChunks > 0 && window.__bend2craft?.world?.pendingChunks === 0,
    null,
    { timeout: 30000 },
  );
  await page.waitForFunction(
    () => window.__bend2craft?.getFrameDiagnostics?.().meshRebuildPending === false,
    null,
    { timeout: 30000 },
  );
  const state = await page.evaluate(() => ({
    errorHidden: document.getElementById("error")?.hidden ?? false,
    activeChunks: window.__bend2craft?.world?.activeChunks ?? 0,
    pendingChunks: window.__bend2craft?.world?.pendingChunks ?? -1,
    miningProgressHidden: document.getElementById("mining-progress")?.hidden ?? false,
    lightProbe: typeof window.__bend2craft?.getLight === "function",
    frame: window.__bend2craft?.getFrameDiagnostics?.() ?? null,
  }));
  assert.equal(state.errorHidden, true);
  assert.ok(state.activeChunks > 0);
  assert.equal(state.pendingChunks, 0);
  assert.equal(state.miningProgressHidden, true);
  assert.equal(state.lightProbe, true);
  assert.equal(state.frame?.playerSpawnReady, true);
  assert.ok(state.frame?.meshRebuilds > 0);
  assert.ok(state.frame?.workerHydrates > 0);
  assert.ok(state.frame?.meshWorkerResponses > 0);

  const initialTarget = await page.evaluate(() => {
    const player = window.__bend2craft.getPlayer();
    for (let y = 8; y < 16; y += 1) {
      for (let x = Math.floor(player.x) - 6; x <= Math.floor(player.x) + 6; x += 1) {
        for (let z = Math.floor(player.z) - 6; z <= Math.floor(player.z) + 6; z += 1) {
          const block = window.__bend2craft.getBlock(x, y, z);
          if (block === 0 || block === 7 || block === 21 || block === 24
            || ![2, 3, 4, 5, 6, 13, 14, 15, 16, 17, 18, 19, 20].includes(block)) continue;
          const dx = x + 0.5 - player.x;
          const dy = y + 0.5 - (player.y + 1.62);
          const dz = z + 0.5 - player.z;
          const horizontal = Math.hypot(dx, dz);
          const distance = Math.hypot(horizontal, dy);
          if (horizontal < 0.5 || distance > 7.5) continue;
          const yaw = Math.atan2(dx, -dz);
          const pitch = Math.atan2(dy, horizontal);
          const target = window.__bend2craft.setViewForTest(player.x, player.y, player.z, yaw, pitch);
          if (target?.hit) return { block, target, x, y, z, yaw, pitch };
        }
      }
    }
    return null;
  });
  assert.ok(initialTarget?.target?.hit, "the first-person raycast must find a target block");

  let textureProbe = null;
  let animatedSurfaceProbe = null;
  let atlasProbe = null;
  if (state.frame?.renderer === "webgl") {
  textureProbe = await page.evaluate(async () => {
    const region = [300, 210, 64, 64];
    const first = window.__bend2craft.readFramePixels(...region);
    // Read twice in the same rendered frame so intentional day/night changes
    // do not get confused with same-frame texture flicker.
    const second = window.__bend2craft.readFramePixels(...region);
    let changedPixels = 0;
    for (let index = 0; index < first.length; index += 4) {
      if (first[index] !== second[index]
        || first[index + 1] !== second[index + 1]
        || first[index + 2] !== second[index + 2]
        || first[index + 3] !== second[index + 3]) changedPixels += 1;
    }
    return { region, pixels: first.length / 4, changedPixels };
  });
  assert.ok(textureProbe.pixels > 0);
  assert.ok(textureProbe.changedPixels <= 64, "static terrain pixels should not flicker between frames");

  animatedSurfaceProbe = await page.evaluate(async () => {
    const region = [100, 210, 64, 64];
    const first = window.__bend2craft.readFramePixels(...region);
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const second = window.__bend2craft.readFramePixels(...region);
    let changedPixels = 0;
    for (let index = 0; index < first.length; index += 4) {
      if (first[index] !== second[index]
        || first[index + 1] !== second[index + 1]
        || first[index + 2] !== second[index + 2]
        || first[index + 3] !== second[index + 3]) changedPixels += 1;
    }
    return { region, pixels: first.length / 4, changedPixels };
  });
  assert.ok(animatedSurfaceProbe.changedPixels > 0, "animated surface should update over time");
  assert.ok(animatedSurfaceProbe.changedPixels < animatedSurfaceProbe.pixels, "animated surface must not flash the whole frame");

  atlasProbe = await page.evaluate(() => {
    const probes = Array.from({ length: 50 }, (_, tile) => window.__bend2craft.getAtlasTexelProbe(tile));
    return {
      tiles: probes.length,
      totalMismatches: probes.reduce((sum, probe) => sum + probe.mismatches, 0),
      maxMismatches: Math.max(...probes.map((probe) => probe.mismatches)),
      flippedMismatches: probes.reduce((sum, probe) => sum + probe.flippedMismatches, 0),
    };
  });
  assert.equal(atlasProbe.tiles, 50);
  assert.equal(atlasProbe.totalMismatches, 0, "WebGL atlas texels must match all source tiles");
  }

  const interactionProbe = await page.evaluate(async ({ targetInfo }) => {
    const beforeInventory = window.__bend2craft.getInventory();
    window.__bend2craft.resumeForTest();
    window.__bend2craft.interactForTest(0);
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    return {
      hit: targetInfo.target.hit,
      beforeBlock: targetInfo.block,
      beforeInventory,
    };
  }, { targetInfo: initialTarget });
  const hitCoordinates = {
    x: interactionProbe.hit[0],
    y: interactionProbe.hit[1],
    z: interactionProbe.hit[2],
    beforeBlock: interactionProbe.beforeBlock,
  };
  await page.waitForFunction(
    ({ x, y, z, beforeBlock }) => window.__bend2craft.getBlock(x, y, z) !== beforeBlock,
    hitCoordinates,
    { timeout: 3000 },
  );
  const mined = await page.evaluate(({ x, y, z }) => ({
    block: window.__bend2craft.getBlock(x, y, z),
    inventory: window.__bend2craft.getInventory(),
  }), interactionProbe.hit);
  assert.equal(mined.block, 0);
  assert.notDeepEqual(mined.inventory, interactionProbe.beforeInventory);

  const placement = await page.evaluate(() => {
    const target = window.__bend2craft.getRaycastTarget();
    const result = window.__bend2craft.interactForTest(2);
    return { target, result };
  });
  assert.ok(placement.target?.place, "right-click raycast must expose a placement cell");
  const placeCoordinates = {
    x: placement.target.place[0],
    y: placement.target.place[1],
    z: placement.target.place[2],
  };
  await page.waitForFunction(
    ({ x, y, z }) => window.__bend2craft.getBlock(x, y, z) === 1,
    placeCoordinates,
    { timeout: 3000 },
  );
  const interactionResult = await page.evaluate(({ hit, place }) => ({
    placedBlock: window.__bend2craft.getBlock(...place),
  }), { hit: interactionProbe.hit, place: placement.target.place });
  assert.equal(interactionResult.placedBlock, 1);

  const mobProbe = await page.evaluate(() => {
    const mob = window.__bend2craft.getMobs().find((entry) => entry.alive);
    if (mob === undefined) return null;
    window.__bend2craft.teleportForTest(mob.x, mob.z, mob.y, 0, -0.18);
    const hits = [];
    for (let index = 0; index < 5; index += 1) hits.push(window.__bend2craft.attack());
    const after = window.__bend2craft.getMobs().find((entry) => entry.id === mob.id);
    return {
      id: mob.id,
      kind: mob.kind,
      hits,
      beforeHealth: mob.health,
      afterHealth: after?.health ?? null,
      alive: after?.alive ?? null,
      drops: window.__bend2craft.getDrops(),
    };
  });
  assert.ok(mobProbe !== null, "a spawned mob is required for combat smoke");
  assert.ok(mobProbe.hits.some(Boolean));
  assert.equal(mobProbe.alive, false);
  assert.ok(mobProbe.drops.length > 0, "a killed mob must produce a Bend drop");
  const drop = mobProbe.drops[0];
  const entityPersistenceBefore = await page.evaluate(({ mobId, dropId }) => {
    window.__bend2craft.teleportForTest(40.5, 24.5, 8);
    window.__bend2craft.save();
    return {
      mob: window.__bend2craft.getMobs().find((entry) => entry.id === mobId),
      drop: window.__bend2craft.getDrops().find((entry) => entry.id === dropId),
    };
  }, { mobId: mobProbe.id, dropId: drop.id });
  assert.equal(entityPersistenceBefore.mob?.alive, false);
  assert.ok(entityPersistenceBefore.drop !== undefined);

  await page.reload({ waitUntil: "networkidle", timeout: 30000 });
  await page.waitForFunction(
    () => window.__bend2craft?.world?.activeChunks > 0 && window.__bend2craft?.world?.pendingChunks === 0,
    null,
    { timeout: 30000 },
  );
  await page.waitForFunction(
    () => window.__bend2craft?.getFrameDiagnostics?.().meshRebuildPending === false,
    null,
    { timeout: 30000 },
  );
  const entityPersistenceAfter = await page.evaluate(({ mobId, dropId }) => ({
    mob: window.__bend2craft.getMobs().find((entry) => entry.id === mobId),
    drop: window.__bend2craft.getDrops().find((entry) => entry.id === dropId),
  }), { mobId: mobProbe.id, dropId: drop.id });
  assert.equal(entityPersistenceAfter.mob?.alive, false);
  assert.ok(entityPersistenceAfter.drop !== undefined);

  await page.evaluate(() => {
    const currentDrop = window.__bend2craft.getDrops()[0];
    window.__bend2craft.teleportForTest(currentDrop.x, currentDrop.z, currentDrop.y);
    window.__bend2craft.resumeForTest();
  });
  await page.waitForFunction(() => window.__bend2craft.getDrops().length === 0, null, { timeout: 5000 });
  const collectedInventory = await page.evaluate(() => window.__bend2craft.getInventory());
  assert.ok(collectedInventory.some((item) => item.item === "wool" || item.item === "rotten_flesh"));

  const hostile = await page.evaluate(() => window.__bend2craft.getMobs()
    .find((entry) => entry.alive && entry.kind === 2));
  assert.ok(hostile !== undefined, "a hostile mob is required for damage smoke");
  await page.evaluate(({ x, y, z }) => window.__bend2craft.teleportForTest(x, z, y), hostile);
  await page.evaluate(() => window.__bend2craft.resumeForTest());
  await page.waitForFunction(() => window.__bend2craft.getPlayer().health < 20, null, { timeout: 5000 });
  const damageProbe = await page.evaluate(() => window.__bend2craft.getPlayer());
  assert.ok(damageProbe.health < 20);

  await page.evaluate(() => window.__bend2craft.hurt(100));
  await page.waitForFunction(() => document.getElementById("death")?.hidden === false, null, { timeout: 5000 });
  await page.locator('[data-action="respawn"]').click();
  await page.waitForFunction(
    () => window.__bend2craft.getPlayer().health > 0 && document.getElementById("death")?.hidden === true,
    null,
    { timeout: 5000 },
  );

  const persistenceBefore = await page.evaluate(({ place }) => {
    window.__bend2craft.save();
    return {
      player: window.__bend2craft.getPlayer(),
      inventory: window.__bend2craft.getInventory(),
      placedBlock: window.__bend2craft.getBlock(...place),
    };
  }, { place: placement.target.place });
  assert.ok(persistenceBefore.inventory.some((item) => item.item === "wool"));
  assert.equal(persistenceBefore.placedBlock, 1);

  await page.reload({ waitUntil: "networkidle", timeout: 30000 });
  await page.waitForFunction(
    () => window.__bend2craft?.world?.activeChunks > 0 && window.__bend2craft?.world?.pendingChunks === 0,
    null,
    { timeout: 30000 },
  );
  await page.waitForFunction(
    () => window.__bend2craft?.getFrameDiagnostics?.().meshRebuildPending === false,
    null,
    { timeout: 30000 },
  );
  const persistenceAfter = await page.evaluate(({ place }) => ({
    player: window.__bend2craft.getPlayer(),
    inventory: window.__bend2craft.getInventory(),
    placedBlock: window.__bend2craft.getBlock(...place),
  }), { place: placement.target.place });
  assert.ok(persistenceAfter.player.health > 0);
  assert.ok(persistenceAfter.inventory.some((item) => item.item === "wool"));
  assert.equal(persistenceAfter.placedBlock, 1);

  const negativeRequest = await page.evaluate(() => (
    window.__bend2craft.teleportForTest(-40, -40, 8, Math.PI * 0.25, -0.18)
  ));
  assert.ok(negativeRequest.pendingChunks > 0);
  await page.waitForFunction(
    () => {
      const diagnostics = window.__bend2craft.getFrameDiagnostics();
      return diagnostics.player.x < 0
        && diagnostics.player.z < 0
        && diagnostics.activeChunks > 0
        && diagnostics.pendingChunks === 0
        && diagnostics.meshRebuildPending === false;
    },
    null,
    { timeout: 30000 },
  );
  const negativeState = await page.evaluate(() => window.__bend2craft.getFrameDiagnostics());
  assert.ok(negativeState.player.x < 0 && negativeState.player.z < 0);
  assert.equal(negativeState.pendingChunks, 0);
  await page.evaluate(() => window.__bend2craft.resumeForTest());

  const streamingSwap = await page.evaluate(() => {
    const before = window.__bend2craft.world.activeChunks;
    const result = window.__bend2craft.loadChunksAt(256, 256, 1, false);
    return {
      before,
      after: window.__bend2craft.world.activeChunks,
      pending: window.__bend2craft.world.pendingChunks,
      reportedActive: result.activeChunks,
    };
  });
  assert.ok(streamingSwap.before > 0);
  assert.ok(streamingSwap.pending > 0);
  assert.ok(streamingSwap.after > 0, "keep the current render window while a swap is pending");
  assert.ok(streamingSwap.reportedActive > 0);

  await page.locator("#inventory-toggle").click();
  await page.waitForFunction(() => document.getElementById("inventory-panel")?.hidden === false);
  const inventoryIconProbe = await page.evaluate(() => {
    const swatches = [...document.querySelectorAll(".inventory-slot .slot-swatch[data-item]")];
    return {
      slots: document.querySelectorAll(".inventory-slot").length,
      painted: swatches.filter((node) => getComputedStyle(node).backgroundImage !== "none").length,
      namesHidden: [...document.querySelectorAll(".inventory-slot .slot-name")]
        .every((node) => getComputedStyle(node).display === "none"),
    };
  });
  assert.ok(inventoryIconProbe.slots > 0);
  assert.ok(inventoryIconProbe.painted > 0, "open inventory slots must use the item atlas icons");
  assert.equal(inventoryIconProbe.namesHidden, true);
  await page.locator("[data-close-inventory]").click();
  await page.waitForFunction(() => document.getElementById("inventory-panel")?.hidden === true);

  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ ...state, textureProbe, animatedSurfaceProbe, atlasProbe, interactionResult, mobProbe, collectedInventory, damageProbe, persistenceBefore, persistenceAfter, entityPersistenceBefore, entityPersistenceAfter, negativeState, streamingSwap, inventoryToggle: "ok", consoleErrors, pageErrors }));
} finally {
  await browser.close();
}
