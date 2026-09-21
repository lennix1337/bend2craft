import * as path from "node:path";
import bendPlugin from "../vendor/bend/bend2/main.ts";

const outdir = path.resolve(process.argv[2] ?? "dist");

async function buildWorker(entrypoint, filename, plugins = []) {
  const result = await Bun.build({
    entrypoints: [path.resolve(entrypoint)],
    outdir,
    plugins,
    target: "browser",
    minify: false,
    sourcemap: "none",
  });
  if (!result.success) {
    console.error(result.logs);
    process.exit(1);
  }
  await Bun.write(path.join(outdir, filename), await result.outputs[0].arrayBuffer());
  console.log(path.join(outdir, filename));
}

await buildWorker("web/chunk-worker-entry.js", "chunk-worker.js", [bendPlugin]);
await buildWorker("web/mesh-worker-entry.js", "mesh-worker.js");
