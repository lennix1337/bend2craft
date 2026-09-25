import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// Static file server for the built Bend2Craft bundle in dist/.
// English-only copy per repository rules. Dependency-free (Node stdlib).

const root = path.resolve(fileURLToPath(new URL("../dist/", import.meta.url)));
const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? "127.0.0.1";
const shouldOpenBrowser = process.argv.includes("--open");

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`PORT must be an integer from 1 to 65535; received ${process.env.PORT}`);
}
if (!existsSync(path.join(root, "index.html"))) {
  throw new Error(`Built bundle not found at ${root}. Run "npm run build" first.`);
}

const types = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
  [".txt", "text/plain; charset=utf-8"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

function noStore(response, status, body, type = "text/plain; charset=utf-8") {
  response.writeHead(status, {
    "cache-control": "no-store, max-age=0",
    "content-type": type,
    "x-content-type-options": "nosniff",
  });
  response.end(body);
}

function openBrowser(url) {
  let command;
  let args;
  if (process.platform === "win32") {
    command = "rundll32.exe";
    args = ["url.dll,FileProtocolHandler", url];
  } else if (process.platform === "darwin") {
    command = "open";
    args = [url];
  } else {
    command = "xdg-open";
    args = [url];
  }
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: process.platform === "win32",
  });
  child.once("error", (error) => {
    console.error(`Could not open the browser automatically: ${error.message}`);
  });
  child.unref();
}

const server = http.createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    noStore(response, 405, "Method not allowed");
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
  } catch {
    noStore(response, 400, "Bad request");
    return;
  }

  const relative = pathname.replace(/^\/+/, "") || "index.html";
  const file = path.resolve(root, relative);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
    noStore(response, 403, "Forbidden");
    return;
  }

  fs.readFile(file, (error, data) => {
    if (error) {
      noStore(response, 404, "Not found");
      return;
    }
    const type = types.get(path.extname(file).toLowerCase()) ?? "application/octet-stream";
    response.writeHead(200, {
      "cache-control": "no-store, max-age=0",
      "content-length": data.length,
      "content-type": type,
      "x-content-type-options": "nosniff",
    });
    if (request.method === "HEAD") response.end();
    else response.end(data);
  });
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Close the old Bend2Craft server or set PORT to another port.`);
  } else {
    console.error(`Bend2Craft server error: ${error.message}`);
  }
  process.exitCode = 1;
});

server.listen(port, host, () => {
  const displayHost = host === "0.0.0.0" || host === "::" ? "localhost" : host;
  const url = `http://${displayHost}:${port}/?play=1&seed=1337&renderer=webgl`;
  console.log(`Bend2Craft at ${url}`);
  console.log(`Serving ${root} with browser caching disabled.`);
  console.log("Press Ctrl+C to stop.");
  if (shouldOpenBrowser) openBrowser(url);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
  });
}
