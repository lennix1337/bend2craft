import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// Static file server for the built Bend2Craft bundle in dist/.
// English-only copy per repository rules. Dependency-free (Node stdlib).

const root = fileURLToPath(new URL("../dist/", import.meta.url));
// Default 8080 keeps the one-click bundle clear of `npm run dev` on 3000.
const port = Number(process.env.PORT ?? 8080);

const types = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
  [".txt", "text/plain; charset=utf-8"],
]);

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  let relative = decodeURIComponent(url.pathname);
  if (relative === "/") relative = "/index.html";
  const file = path.normalize(path.join(root, relative));
  if (!file.startsWith(root)) {
    response.writeHead(403, { "content-type": "text/plain" });
    response.end("Forbidden");
    return;
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("Not found");
      return;
    }
    const type = types.get(path.extname(file).toLowerCase()) ?? "application/octet-stream";
    response.writeHead(200, { "content-type": type, "cache-control": "no-cache" });
    response.end(data);
  });
});

server.listen(port, () => {
  console.log(`Bend2Craft at http://localhost:${port}/?seed=1337 (serving ${root})`);
  console.log("Press Ctrl+C to stop.");
});
