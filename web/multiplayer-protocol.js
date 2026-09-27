// Wire protocol shared by the multiplayer client (web/multiplayer.js) and the
// server room (server/multiplayer-room.js). Messages are JSON text frames.
//
// This module only checks shapes, so a malformed message is dropped before it
// reaches Bend. Whether an edit is allowed in the world, and whether a pose is
// inside it, is decided by world/multiplayer.bend.
//
// Edits travel as [x, y, z, block] in stored (Bend) coordinates: the same
// non-negative encoding WorldState keeps (see web/world-coordinates.js).

export const PROTOCOL_VERSION = 1;
export const MULTIPLAYER_PATH = "/multiplayer";
export const MAX_MESSAGE_BYTES = 256 * 1024;
export const MAX_EDITS_PER_MESSAGE = 4096;
export const MAX_PLAYERS = 16;
export const MAX_NAME_LENGTH = 24;
export const POSE_INTERVAL_MS = 100;

function isStoredInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function isWireEdit(value) {
  return Array.isArray(value)
    && value.length === 4
    && isStoredInteger(value[0])
    && isStoredInteger(value[1])
    && isStoredInteger(value[2])
    && Number.isInteger(value[3])
    && value[3] >= 0
    && value[3] <= 0xffffffff;
}

export function isWireEditList(value, limit = MAX_EDITS_PER_MESSAGE) {
  return Array.isArray(value) && value.length <= limit && value.every(isWireEdit);
}

function isNumber(value) {
  return typeof value === "number";
}

export function isWirePose(value) {
  return value !== null
    && typeof value === "object"
    && isNumber(value.x)
    && isNumber(value.y)
    && isNumber(value.z)
    && isNumber(value.yaw)
    && isNumber(value.pitch);
}

/** A display name: trimmed, control characters removed, bounded length. */
export function sanitizeName(value, fallback = "Player") {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/\s+/g, " ").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return cleaned.length === 0 ? fallback : [...cleaned].slice(0, MAX_NAME_LENGTH).join("");
}

/**
 * Parses one client -> server message. Returns null for anything that is not
 * a well-formed message of a known type.
 */
export function decodeClientMessage(text) {
  if (typeof text !== "string" || text.length > MAX_MESSAGE_BYTES) return null;
  let message;
  try {
    message = JSON.parse(text);
  } catch {
    return null;
  }
  if (message === null || typeof message !== "object") return null;
  switch (message.t) {
    case "hello":
      if (message.v !== PROTOCOL_VERSION) return { t: "hello", v: message.v, name: sanitizeName(message.name) };
      return { t: "hello", v: PROTOCOL_VERSION, name: sanitizeName(message.name) };
    case "pose":
      return isWirePose(message)
        ? { t: "pose", x: message.x, y: message.y, z: message.z, yaw: message.yaw, pitch: message.pitch }
        : null;
    case "edits":
      return isWireEditList(message.edits) && message.edits.length > 0
        ? { t: "edits", edits: message.edits }
        : null;
    default:
      return null;
  }
}

/** Parses one server -> client message; null when it is not well formed. */
export function decodeServerMessage(text) {
  if (typeof text !== "string") return null;
  let message;
  try {
    message = JSON.parse(text);
  } catch {
    return null;
  }
  if (message === null || typeof message !== "object" || typeof message.t !== "string") return null;
  switch (message.t) {
    case "welcome":
      return Number.isInteger(message.id)
        && typeof message.seed === "string"
        && /^\d+$/.test(message.seed)
        && Number.isInteger(message.seq)
        && isWireEditList(message.edits, Infinity)
        && Array.isArray(message.players)
        ? message
        : null;
    case "edits":
    case "revert":
      return isWireEditList(message.edits, Infinity) ? message : null;
    case "pose":
      return Number.isInteger(message.id) && isWirePose(message) ? message : null;
    case "joined":
      return Number.isInteger(message.player?.id) && typeof message.player?.name === "string" ? message : null;
    case "left":
      return Number.isInteger(message.id) ? message : null;
    case "error":
      return typeof message.message === "string" ? message : null;
    default:
      return null;
  }
}

/** Converts wire edits to a Bend `List<Edit>` of `{ $: "Edit" }` records. */
export function wireEditsToBend(edits) {
  let list = { $: "Nil" };
  for (let index = edits.length - 1; index >= 0; index -= 1) {
    const [x, y, z, block] = edits[index];
    list = { $: "Con", head: { $: "Edit", x: BigInt(x), y: BigInt(y), z: BigInt(z), block }, tail: list };
  }
  return list;
}

/** Converts a Bend `List<Edit>` to wire edits. */
export function bendEditsToWire(list) {
  const edits = [];
  for (let node = list; node?.$ === "Con"; node = node.tail) {
    const edit = node.head;
    edits.push([Number(edit.x), Number(edit.y), Number(edit.z), Number(edit.block)]);
  }
  return edits;
}

/**
 * The WebSocket URL of a multiplayer server. An explicit address may be a full
 * ws:// or wss:// URL, an http(s):// page URL, or a bare host[:port]; with no
 * address the page's own origin hosts the server.
 */
export function multiplayerUrl(address, location) {
  const pageSecure = location?.protocol === "https:";
  const raw = typeof address === "string" ? address.trim() : "";
  if (raw === "") {
    return `${pageSecure ? "wss" : "ws"}://${location.host}${MULTIPLAYER_PATH}`;
  }
  let url;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    url = new URL(raw);
  } else {
    url = new URL(`${pageSecure ? "wss" : "ws"}://${raw}`);
  }
  if (url.protocol === "http:") url.protocol = "ws:";
  if (url.protocol === "https:") url.protocol = "wss:";
  if (url.protocol !== "ws:" && url.protocol !== "wss:") throw new Error(`Unsupported server address: ${raw}`);
  if (url.pathname === "/" || url.pathname === "") url.pathname = MULTIPLAYER_PATH;
  url.search = "";
  url.hash = "";
  return url.toString();
}
