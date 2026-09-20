import * as path from "node:path";
import bendPlugin from "../vendor/bend/bend2/main.ts";

const outdir = path.resolve(process.argv[2] ?? "dist");
const result = await Bun.build({
  entrypoints: [path.resolve("web/chunk-worker-entry.js")],
  outdir,
  plugins: [bendPlugin],
  target: "browser",
  minify: false,
  sourcemap: "none",
});
if (!result.success) {
  console.error(result.logs);
  process.exit(1);
}
const output = result.outputs[0];
await Bun.write(path.join(outdir, "chunk-worker.js"), await output.arrayBuffer());
console.log(path.join(outdir, "chunk-worker.js"));
