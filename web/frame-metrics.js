function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export function createFrameMetrics() {
  return {
    fps: 0,
    frameMs: 0,
    frameCount: 0,
    minFps: Infinity,
    maxFps: 0,
  };
}

/** Update a smoothed frame-time sample without touching browser state. */
export function sampleFrame(metrics, elapsedMs) {
  const frameMs = Math.max(0.1, finite(elapsedMs, 0.1));
  const instantFps = Math.min(240, 1000 / frameMs);
  const fps = metrics.frameCount === 0
    ? instantFps
    : metrics.fps * 0.9 + instantFps * 0.1;
  return {
    ...metrics,
    fps,
    frameMs,
    frameCount: metrics.frameCount + 1,
    minFps: Math.min(metrics.minFps, instantFps),
    maxFps: Math.max(metrics.maxFps, instantFps),
  };
}

export function formatDebugText(snapshot) {
  const player = snapshot.player ?? {};
  const minFps = Number.isFinite(Number(snapshot.minFps)) ? Number(snapshot.minFps) : 0;
  const maxFps = Number.isFinite(Number(snapshot.maxFps)) ? Number(snapshot.maxFps) : 0;
  return [
    `FPS ${finite(snapshot.fps).toFixed(0)} · ${finite(snapshot.frameMs).toFixed(1)} ms · min ${minFps.toFixed(0)} · max ${maxFps.toFixed(0)} · frames ${Math.trunc(finite(snapshot.frameCount))}`,
    `XYZ ${finite(player.x).toFixed(2)} ${finite(player.y).toFixed(2)} ${finite(player.z).toFixed(2)}`,
    `chunks ${Math.trunc(finite(snapshot.activeChunks))} active · ${Math.trunc(finite(snapshot.pendingChunks))} pending · ${Math.trunc(finite(snapshot.pinnedChunks))} pinned`,
    `mesh ${Math.trunc(finite(snapshot.blockCount)).toLocaleString("en-US")} blocks · ${Math.trunc(finite(snapshot.terrainQuads)).toLocaleString("en-US")} terrain quads · ${Math.trunc(finite(snapshot.waterQuads)).toLocaleString("en-US")} water quads · ${Math.trunc(finite(snapshot.dynamicQuads)).toLocaleString("en-US")} dynamic quads · ${Math.trunc(finite(snapshot.shadowQuads))} shadow quads · ${Math.trunc(finite(snapshot.meshRebuilds))} rebuilds`,
    `workers ${Math.trunc(finite(snapshot.workerRequests))} requests · ${Math.trunc(finite(snapshot.workerHydrates))} hydrated · ${Math.trunc(finite(snapshot.workerRejects))} rejects · sim ${finite(snapshot.simulationTime).toFixed(1)}`,
    `entities ${Math.trunc(finite(snapshot.mobs))} mobs · ${Math.trunc(finite(snapshot.villagers))} villagers · ${Math.trunc(finite(snapshot.drops))} drops`,
  ].join("\n");
}
