// One multiplayer world: the connected players and the Bend room that owns
// the shared edit log. The room is transport-agnostic: the Node LAN server
// (server/node-host.mjs), the Bun dev server and the Cloudflare Durable Object
// (cloudflare/worker.js) each hand it a `send(text)` per connection and feed
// it the text frames they receive.
//
// Authority lives in Bend (world/multiplayer.bend): this module decodes
// messages, calls the Bend room with whole batches, and fans the results out.
// Every accepted batch goes to every player, the sender included, so all
// clients apply the same batches in the same sequence order. Chest contents
// and furnaces, and the world clock, are the room's too: every chest or
// furnace change is sent to every player as its full state, and the host calls
// `tick()` every TICK_MS to advance the furnaces.
import {
  MAX_PLAYERS,
  PROTOCOL_VERSION,
  bendChestsToWire,
  bendEditsToWire,
  bendFurnaceToWire,
  bendFurnacesToWire,
  bendSlotsToWire,
  decodeClientMessage,
  isWireChest,
  isWireEditList,
  isWireFurnace,
  sanitizeName,
  wireChestsToBend,
  wireEditsToBend,
  wireFurnacesToBend,
} from "../web/multiplayer-protocol.js";

export const SNAPSHOT_VERSION = 2;
export const TICK_MS = 200;
const FURNACE_OPS = Object.freeze({ input: 0, fuel: 1, output: 2 });

function validSnapshot(snapshot, seed) {
  if (snapshot?.version !== 1 && snapshot?.version !== SNAPSHOT_VERSION) return false;
  if (!isWireEditList(snapshot.edits, Infinity) || !Number.isInteger(snapshot.seq)) return false;
  if (String(snapshot.seed) !== seed.toString()) return false;
  if (snapshot.version === 1) return true;
  return Array.isArray(snapshot.chests)
    && snapshot.chests.every((chest) => isWireChest(chest) && chest.slots !== null)
    && (snapshot.furnaces === undefined
      || (Array.isArray(snapshot.furnaces) && snapshot.furnaces.every((f) => isWireFurnace(f) && f.state !== null)))
    && Number.isFinite(snapshot.time) && snapshot.time >= 0;
}

/**
 * @param {object} options
 * @param {object} options.authority   the compiled world/multiplayer.bend module
 * @param {bigint} options.seed        the world seed
 * @param {object} [options.snapshot]  a snapshot from `room.snapshot()` to resume
 * @param {(change: {
 *   seq: number, edits: number[][], chests: { pos: number[], slots: number[][] | null }[],
 *   furnaces: { pos: number[], state: number[] | null }[], time?: number, tick?: boolean
 * }) => void} [options.onChange]
 *   called after the room changed: accepted edits, chests and furnaces that
 *   changed (null: removed), the new world time when the clock was reset, and
 *   `tick: true` when only furnace smelting moved
 * @param {(event: "joined" | "left", player: object) => void} [options.onPresence]
 * @param {() => number} [options.now]  millisecond wall clock
 */
export function createMultiplayerRoom({
  authority, seed, snapshot = null, onChange = () => {}, onPresence = () => {}, now = () => Date.now(),
}) {
  if (typeof seed !== "bigint") throw new TypeError("seed must be a bigint");
  let state = authority.empty();
  let clockOrigin = now();
  if (snapshot !== null) {
    if (!validSnapshot(snapshot, seed)) {
      throw new Error("The multiplayer world snapshot is not valid for this seed.");
    }
    state = authority.restore(
      snapshot.seq >>> 0,
      wireEditsToBend(snapshot.edits),
      wireChestsToBend(snapshot.chests ?? []),
      wireFurnacesToBend(snapshot.furnaces ?? []),
    );
    // The clock runs while the server runs and resumes where it stopped.
    clockOrigin = now() - (snapshot.time ?? 0) * 1000;
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

  function worldTime() {
    return Math.max(0, (now() - clockOrigin) / 1000);
  }

  function chestAt([x, y, z]) {
    const at = [BigInt(x), BigInt(y), BigInt(z)];
    return {
      pos: [x, y, z],
      slots: authority.has_chest(state, ...at) ? bendSlotsToWire(authority.chest_slots(state, ...at)) : null,
    };
  }

  function furnaceAt([x, y, z]) {
    const at = [BigInt(x), BigInt(y), BigInt(z)];
    return {
      pos: [x, y, z],
      state: authority.has_furnace(state, ...at) ? bendFurnaceToWire(authority.furnace_state(state, ...at)) : null,
    };
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
      chests: bendChestsToWire(authority.room_chests(state)),
      furnaces: bendFurnacesToWire(authority.room_furnaces(state)),
      time: worldTime(),
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
    const chests = [];
    const furnaces = [];
    for (let node = authority.submission_changes(result); node?.$ === "Con"; node = node.tail) {
      const pos = [Number(node.head.x), Number(node.head.y), Number(node.head.z)];
      // Tags can carry a module prefix ("multiplayer.ChestPlaced").
      if (node.head.$.includes("Chest")) {
        chests.push(chestAt(pos));
      } else {
        furnaces.push(furnaceAt(pos));
      }
    }
    if (accepted.length > 0) {
      counters.accepted += accepted.length;
      const seq = Number(authority.room_seq(state));
      broadcast({ t: "edits", seq, from: player.id, edits: accepted });
      for (const chest of chests) broadcast({ t: "chest", ...chest });
      for (const furnace of furnaces) broadcast({ t: "furnace", ...furnace });
      onChange({ seq, edits: accepted, chests, furnaces });
    }
    if (rejectedList.$ === "Con") {
      const revert = bendEditsToWire(authority.revert(rejectedList, authority.room_edits(state), seed));
      counters.rejected += message.edits.length - accepted.length;
      if (revert.length > 0) player.send(JSON.stringify({ t: "revert", edits: revert }));
      // A refused break of a chest leaves the chest standing: resend it so the
      // sender's predicted removal is undone too.
      for (const [x, y, z] of revert) {
        const chest = chestAt([x, y, z]);
        if (chest.slots !== null) player.send(JSON.stringify({ t: "chest", ...chest }));
      }
    }
  }

  function handleChest(player, message) {
    const [x, y, z] = message.pos.map(BigInt);
    const outcome = message.op === "deposit"
      ? authority.deposit(state, x, y, z, message.item, message.count, message.durability)
      : authority.withdraw(state, x, y, z, BigInt(message.index), message.amount);
    const ok = authority.outcome_ok(outcome);
    player.send(JSON.stringify({
      t: "chest-result",
      id: message.id,
      ok,
      op: message.op,
      item: Number(authority.outcome_item(outcome)),
      amount: Number(authority.outcome_amount(outcome)),
      durability: Number(authority.outcome_durability(outcome)),
    }));
    if (!ok) return;
    state = authority.outcome_room(outcome);
    const chest = chestAt(message.pos);
    broadcast({ t: "chest", ...chest });
    onChange({ seq: Number(authority.room_seq(state)), edits: [], chests: [chest], furnaces: [] });
  }

  function handleFurnace(player, message) {
    const [x, y, z] = message.pos.map(BigInt);
    const outcome = authority.furnace_op(state, FURNACE_OPS[message.op], x, y, z, message.item);
    const ok = authority.outcome_ok(outcome);
    player.send(JSON.stringify({
      t: "furnace-result",
      id: message.id,
      ok,
      op: message.op,
      item: Number(authority.outcome_item(outcome)),
      amount: Number(authority.outcome_amount(outcome)),
    }));
    if (!ok) return;
    state = authority.outcome_room(outcome);
    const furnace = furnaceAt(message.pos);
    broadcast({ t: "furnace", ...furnace });
    onChange({ seq: Number(authority.room_seq(state)), edits: [], chests: [], furnaces: [furnace] });
  }

  // One smelting step for every furnace; only furnaces that moved are sent.
  function tick() {
    const before = bendFurnacesToWire(authority.room_furnaces(state));
    if (before.length === 0) return 0;
    state = authority.tick(state);
    const after = bendFurnacesToWire(authority.room_furnaces(state));
    const changed = after.filter((furnace, index) => furnace.state.join() !== before[index]?.state.join());
    if (changed.length === 0) return 0;
    broadcast({ t: "furnaces", furnaces: changed });
    onChange({ seq: Number(authority.room_seq(state)), edits: [], chests: [], furnaces: changed, tick: true });
    return changed.length;
  }

  function handleTime(message) {
    if (message.op !== "morning") return;
    clockOrigin = now();
    broadcast({ t: "time", time: 0 });
    onChange({ seq: Number(authority.room_seq(state)), edits: [], chests: [], furnaces: [], time: 0 });
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
      else if (message.t === "chest") handleChest(player, message);
      else if (message.t === "furnace") handleFurnace(player, message);
      else if (message.t === "time") handleTime(message);
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
      chests: bendChestsToWire(authority.room_chests(state)),
      furnaces: bendFurnacesToWire(authority.room_furnaces(state)),
      time: worldTime(),
    };
  }

  return {
    connect,
    tick,
    snapshot: takeSnapshot,
    playerCount: () => players.size,
    worldTime,
    players: () => [...players.values()].map(publicPlayer),
    counters: () => ({ ...counters }),
  };
}
