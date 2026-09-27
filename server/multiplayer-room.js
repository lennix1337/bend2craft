// One multiplayer world: the connected players and the Bend room that owns
// the shared edit log. The room is transport-agnostic: the Node LAN server
// (server/node-host.mjs), the Bun dev server and the Cloudflare Durable Object
// (cloudflare/worker.js) each hand it a `send(text)` per connection and feed
// it the text frames they receive.
//
// Authority lives in Bend (world/multiplayer.bend): this module decodes
// messages, calls the Bend room with whole batches, and fans the results out.
// Every accepted batch goes to every player, the sender included, so all
// clients apply the same batches in the same sequence order.
import {
  MAX_PLAYERS,
  PROTOCOL_VERSION,
  bendEditsToWire,
  decodeClientMessage,
  isWireEditList,
  sanitizeName,
  wireEditsToBend,
} from "../web/multiplayer-protocol.js";

export const SNAPSHOT_VERSION = 1;

/**
 * @param {object} options
 * @param {object} options.authority   the compiled world/multiplayer.bend module
 * @param {bigint} options.seed        the world seed
 * @param {object} [options.snapshot]  a snapshot from `room.snapshot()` to resume
 * @param {(change: { seq: number, edits: number[][] }) => void} [options.onChange]
 *   called with every accepted batch, after the edit log changed
 * @param {(event: "joined" | "left", player: object) => void} [options.onPresence]
 */
export function createMultiplayerRoom({
  authority, seed, snapshot = null, onChange = () => {}, onPresence = () => {},
}) {
  if (typeof seed !== "bigint") throw new TypeError("seed must be a bigint");
  let state = authority.empty();
  if (snapshot !== null) {
    if (snapshot?.version !== SNAPSHOT_VERSION || !isWireEditList(snapshot.edits, Infinity)
      || !Number.isInteger(snapshot.seq) || String(snapshot.seed) !== seed.toString()) {
      throw new Error("The multiplayer world snapshot is not valid for this seed.");
    }
    state = authority.restore(snapshot.seq >>> 0, wireEditsToBend(snapshot.edits));
  }
  const players = new Map();
  let nextId = 1;
  const counters = { accepted: 0, rejected: 0, dropped: 0 };

  function broadcast(message, except = null) {
    const text = JSON.stringify(message);
    for (const player of players.values()) {
      if (player !== except && player.ready) player.send(text);
    }
  }

  function publicPlayer(player) {
    return { id: player.id, name: player.name, pose: player.pose };
  }

  function welcome(player) {
    player.send(JSON.stringify({
      t: "welcome",
      v: PROTOCOL_VERSION,
      id: player.id,
      seed: seed.toString(),
      seq: Number(authority.room_seq(state)),
      edits: bendEditsToWire(authority.room_edits(state)),
      players: [...players.values()].filter((other) => other !== player && other.ready).map(publicPlayer),
    }));
  }

  function handlePose(player, message) {
    if (!authority.valid_pose(message.x, message.y, message.z, message.yaw, message.pitch)) {
      counters.dropped += 1;
      return;
    }
    player.pose = {
      x: message.x,
      y: message.y,
      z: message.z,
      yaw: message.yaw,
      pitch: authority.clamp_pitch(message.pitch),
    };
    broadcast({ t: "pose", id: player.id, ...player.pose }, player);
  }

  function handleEdits(player, message) {
    const result = authority.submit(state, wireEditsToBend(message.edits));
    state = authority.submission_room(result);
    const accepted = bendEditsToWire(authority.submission_accepted(result));
    const rejectedList = authority.submission_rejected(result);
    if (accepted.length > 0) {
      counters.accepted += accepted.length;
      const seq = Number(authority.room_seq(state));
      broadcast({ t: "edits", seq, from: player.id, edits: accepted });
      onChange({ seq, edits: accepted });
    }
    if (rejectedList.$ === "Con") {
      const revert = bendEditsToWire(authority.revert(rejectedList, authority.room_edits(state), seed));
      counters.rejected += message.edits.length - accepted.length;
      if (revert.length > 0) player.send(JSON.stringify({ t: "revert", edits: revert }));
    }
  }

  /**
   * Registers a connection. `send` delivers one text frame and `close` ends
   * the connection; the returned handle receives this connection's frames.
   */
  function connect(send, close = () => {}) {
    const player = { id: 0, name: "", pose: null, ready: false, send, close };
    let closed = false;

    function refuse(message) {
      send(JSON.stringify({ t: "error", message }));
      closed = true;
      close(1008, message);
    }

    function receive(text) {
      if (closed) return;
      const message = decodeClientMessage(typeof text === "string" ? text : String(text));
      if (message === null) {
        counters.dropped += 1;
        return;
      }
      if (!player.ready) {
        if (message.t !== "hello") return;
        if (message.v !== PROTOCOL_VERSION) {
          refuse(`This server speaks multiplayer protocol ${PROTOCOL_VERSION}; update the game.`);
          return;
        }
        if (players.size >= MAX_PLAYERS) {
          refuse(`The server is full (${MAX_PLAYERS} players).`);
          return;
        }
        player.id = nextId;
        nextId += 1;
        player.name = sanitizeName(message.name, `Player ${player.id}`);
        players.set(player.id, player);
        welcome(player);
        player.ready = true;
        broadcast({ t: "joined", player: publicPlayer(player) }, player);
        onPresence("joined", publicPlayer(player));
        return;
      }
      if (message.t === "pose") handlePose(player, message);
      else if (message.t === "edits") handleEdits(player, message);
    }

    function disconnect() {
      if (closed && !players.has(player.id)) return;
      closed = true;
      if (players.get(player.id) === player) {
        players.delete(player.id);
        broadcast({ t: "left", id: player.id });
        onPresence("left", publicPlayer(player));
      }
    }

    return { receive, disconnect, get id() { return player.id; } };
  }

  function takeSnapshot() {
    return {
      version: SNAPSHOT_VERSION,
      seed: seed.toString(),
      seq: Number(authority.room_seq(state)),
      edits: bendEditsToWire(authority.room_edits(state)),
    };
  }

  return {
    connect,
    snapshot: takeSnapshot,
    playerCount: () => players.size,
    players: () => [...players.values()].map(publicPlayer),
    counters: () => ({ ...counters }),
  };
}
