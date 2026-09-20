import * as path from "node:path";
import bendPlugin from "../vendor/bend/bend2/main.ts";

const outdir = path.resolve(".dev");
const page = await Bun.build({
  entrypoints: [path.resolve("web/index.html")],
  outdir,
  plugins: [bendPlugin],
  target: "browser",
  minify: false,
  sourcemap: "none",
});
if (!page.success) {
  console.error(page.logs);
  process.exit(1);
}
const worker = await Bun.build({
  entrypoints: [path.resolve("web/chunk-worker-entry.js")],
  outdir,
  plugins: [bendPlugin],
  target: "browser",
  minify: false,
  sourcemap: "none",
});
if (!worker.success) {
  console.error(worker.logs);
  process.exit(1);
}
await Bun.write(path.join(outdir, "chunk-worker.js"), await worker.outputs[0].arrayBuffer());

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  async fetch(request) {
    const url = new URL(request.url);
    const relative = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = Bun.file(path.join(outdir, relative));
    if (await file.exists()) return new Response(file);
    return new Response("Not found", { status: 404 });
  },
});
console.log(`url: ${server.url}`);
await new Promise(() => {});
