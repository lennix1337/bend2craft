// Cloudflare deployment: one Worker serves the built game from dist/ and
// routes /multiplayer to a Durable Object that holds the shared world. The
// Durable Object runs the same room as the Node server, with the compiled Bend
// authority, and keeps the edit log in its SQLite storage.
//
// Deploy with `npm run build` and then `npx wrangler deploy` (see README).
import { DurableObject } from "cloudflare:workers";
import authority from "../dist/multiplayer-authority.js";
import { createMultiplayerRoom, SNAPSHOT_VERSION } from "../server/multiplayer-room.js";
import { MAX_MESSAGE_BYTES, MULTIPLAYER_PATH } from "../web/multiplayer-protocol.js";

const DEFAULT_SEED = "1337";

export class MultiplayerWorld extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    sql.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    sql.exec(
      "CREATE TABLE IF NOT EXISTS edits (x INTEGER NOT NULL, y INTEGER NOT NULL, z INTEGER NOT NULL,"
      + " block INTEGER NOT NULL, PRIMARY KEY (x, y, z))",
    );
    const meta = new Map(sql.exec("SELECT key, value FROM meta").toArray().map((row) => [row.key, row.value]));
    const configured = /^\d+$/.test(String(env.SEED ?? "")) ? String(env.SEED) : DEFAULT_SEED;
    const seed = meta.get("seed") ?? configured;
    if (!meta.has("seed")) sql.exec("INSERT INTO meta (key, value) VALUES ('seed', ?)", seed);
    const edits = sql.exec("SELECT x, y, z, block FROM edits").toArray().map((row) => [row.x, row.y, row.z, row.block]);
    this.room = createMultiplayerRoom({
      authority,
      seed: BigInt(seed),
      snapshot: { version: SNAPSHOT_VERSION, seed, seq: Number(meta.get("seq") ?? 0), edits },
      onChange: ({ seq, edits: accepted }) => {
        for (const [x, y, z, block] of accepted) {
          sql.exec(
            "INSERT INTO edits (x, y, z, block) VALUES (?, ?, ?, ?)"
            + " ON CONFLICT (x, y, z) DO UPDATE SET block = excluded.block",
            x, y, z, block,
          );
        }
        sql.exec(
          "INSERT INTO meta (key, value) VALUES ('seq', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
          String(seq),
        );
      },
    });
  }

  async fetch(request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    server.accept();
    const handle = this.room.connect(
      (text) => {
        try {
          server.send(text);
        } catch {
          // The peer is gone; its close event removes it from the room.
        }
      },
      (code, reason) => server.close(code, reason),
    );
    server.addEventListener("message", (event) => {
      const data = typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data);
      if (data.length > MAX_MESSAGE_BYTES) {
        server.close(1009, "Message too big");
        return;
      }
      handle.receive(data);
    });
    const leave = () => handle.disconnect();
    server.addEventListener("close", leave);
    server.addEventListener("error", leave);
    return new Response(null, { status: 101, webSocket: client });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === MULTIPLAYER_PATH) {
      // One shared world per deployment.
      const world = env.MULTIPLAYER_WORLD.get(env.MULTIPLAYER_WORLD.idFromName("world"));
      return world.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
