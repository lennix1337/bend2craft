// The multiplayer server's mobs and dropped items.
//
// The server keeps its own cache of the chunks around players and mobs, made
// by Bend's bulk chunk export (WorldState.chunk) and patched with every
// accepted edit, so mobs walk on the same terrain the players see. Each tick
// runs the Bend rules: MultiplayerMobs.step_world (every mob chases or flees
// the nearest player), Entities.sunlight_damage, Entities.threat_damage per
// player, Entities.step_drops, night spawns around each player, and
// MultiplayerMobs.despawn. Attacks and pickups are checked against the pose the
// server holds for the player.
import Entities from "../world/entities.bend";
import MultiplayerMobs from "../world/multiplayer_mobs.bend";
import World from "../world/world.bend";
import WorldState from "../world/world_state.bend";
import { chunkIndex } from "../web/chunk-world.js";
import { NIGHT_DAYLIGHT, daylightForTime } from "../web/daylight.js";
import { createColumnHeightCache, isDropSolid } from "../web/drop-ground-cache.js";
import { DOMAIN_COORDINATE_OFFSET, mobRegion } from "../web/game-state.js";
import { NIGHT_SPAWN, nightSpawns } from "../web/mob-spawning.js";
import { generationChunkCoordinate, worldCoordinate } from "../web/world-coordinates.js";

const CHUNK_SIZE = Number(World.chunk_size());
const MAX_Y = Number(World.max_y());
const OFFSET = BigInt(DOMAIN_COORDINATE_OFFSET);
const DESPAWN_RADIUS = 64;
const SPAWN_INTERVAL = 5;
const DESPAWN_INTERVAL = 10;
const CHUNK_KEEP_RADIUS = 5;
// Drops thrown by players get ids far above any mob id (a kill drop reuses the
// mob's id), so the two never collide.
const PLAYER_DROP_BASE = 1_000_000_000;

function bendList(items) {
  let list = { $: "Nil" };
  for (let index = items.length - 1; index >= 0; index -= 1) list = { $: "Con", head: items[index], tail: list };
  return list;
}

function listItems(list) {
  const items = [];
  for (let node = list; node?.$ === "Con"; node = node.tail) items.push(node.head);
  return items;
}

const round = (value) => Math.round(Number(value) * 1000) / 1000;

export function mobToWire(mob) {
  return [
    Number(mob.id), Number(mob.kind), round(mob.x), round(mob.y), round(mob.z),
    round(mob.heading_x), round(mob.heading_z), round(mob.health),
    mob.alive ? 1 : 0, mob.burning ? 1 : 0, round(mob.panic),
  ];
}

export function dropToWire(drop) {
  return [Number(drop.id), Number(drop.item), round(drop.x), round(drop.y), round(drop.z), Number(drop.amount)];
}

/**
 * @param {object} options
 * @param {bigint} options.seed
 * @param {() => object} options.edits  the room's current Bend edit log
 * @param {boolean} [options.peaceful]  no monsters
 * @param {() => number} [options.random]
 */
export function createMobWorld({ seed, edits, peaceful = false, random = Math.random }) {
  const chunks = new Map();
  let mobs = { $: "Nil" };
  let drops = Entities.empty_drops();
  let populated = false;
  let spawnTimer = 0;
  let despawnTimer = 0;
  let ticks = 0;
  let nextDropId = PLAYER_DROP_BASE;

  function chunkData(chunkX, chunkZ) {
    const key = `${chunkX},${chunkZ}`;
    let data = chunks.get(key);
    if (data === undefined) {
      const generated = WorldState.chunk(
        seed,
        BigInt(generationChunkCoordinate(chunkX, CHUNK_SIZE)),
        BigInt(generationChunkCoordinate(chunkZ, CHUNK_SIZE)),
        edits(),
      );
      data = Uint8Array.from(Array.isArray(generated) || ArrayBuffer.isView(generated)
        ? generated
        : listItems(generated), Number);
      chunks.set(key, data);
    }
    return data;
  }

  function blockAt(x, y, z) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z) || y < 0 || y >= MAX_Y) return 0;
    const chunkX = Math.floor(x / CHUNK_SIZE);
    const chunkZ = Math.floor(z / CHUNK_SIZE);
    return chunkData(chunkX, chunkZ)[chunkIndex(CHUNK_SIZE, x - chunkX * CHUNK_SIZE, y, z - chunkZ * CHUNK_SIZE)];
  }

  const terrain = { blockAt, maxY: MAX_Y };
  const ground = createColumnHeightCache({ maxY: MAX_Y, blockAt, isSolid: isDropSolid });

  /** Accepted edits, as wire edits in stored coordinates. */
  function applyEdits(wireEdits) {
    for (const [storedX, y, storedZ, value] of wireEdits) {
      const x = worldCoordinate(storedX);
      const z = worldCoordinate(storedZ);
      const chunkX = Math.floor(x / CHUNK_SIZE);
      const chunkZ = Math.floor(z / CHUNK_SIZE);
      const data = chunks.get(`${chunkX},${chunkZ}`);
      if (data !== undefined && y >= 0 && y < MAX_Y) {
        data[chunkIndex(CHUNK_SIZE, x - chunkX * CHUNK_SIZE, y, z - chunkZ * CHUNK_SIZE)] = value;
      }
      ground.invalidate(x, z);
    }
  }

  function regionsFor(list) {
    return bendList(listItems(list).map((mob) => {
      const region = mobRegion(terrain, Number(mob.x), Number(mob.y), Number(mob.z));
      return {
        $: "Region",
        blocks: region.blocks,
        origin_x: region.originX,
        origin_y: region.originY,
        origin_z: region.originZ,
        width: region.width,
        height: region.height,
        depth: region.depth,
      };
    }));
  }

  function groundsFor(list) {
    return bendList(listItems(list).map((drop) => {
      const x = Math.floor(Number(drop.x));
      const z = Math.floor(Number(drop.z));
      // Entities.ground_y matches the drop's own x and z exactly.
      return { $: "Ground", x: Number(drop.x), z: Number(drop.z), y: ground.get(x, z) };
    }));
  }

  function views() {
    return listItems(mobs).map((mob) => ({ id: Number(mob.id), kind: Number(mob.kind), alive: mob.alive }));
  }

  function evictChunks(players) {
    const anchors = [...players, ...listItems(mobs).map((mob) => ({ x: Number(mob.x), z: Number(mob.z) }))]
      .map(({ x, z }) => [Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)]);
    for (const key of chunks.keys()) {
      const [chunkX, chunkZ] = key.split(",").map(Number);
      const needed = anchors.some(([ax, az]) => Math.abs(ax - chunkX) <= CHUNK_KEEP_RADIUS && Math.abs(az - chunkZ) <= CHUNK_KEEP_RADIUS);
      if (!needed) chunks.delete(key);
    }
    if (chunks.size === 0) ground.clear();
  }

  /**
   * One simulation step. `players` are [{ id, x, y, z }] (players with a known
   * pose). Returns the damage each player takes this step, by id.
   */
  function tick(dt, time, players) {
    const hurts = new Map();
    if (players.length === 0) return hurts;
    const daylight = daylightForTime(time);
    if (!populated) {
      populated = true;
      const [first] = players;
      mobs = Entities.spawn_for_player(
        seed, daylight, 0n, 0n, World.width(), World.depth(),
        BigInt(Math.max(0, Math.floor(first.x))), BigInt(Math.max(0, Math.floor(first.z))), peaceful,
      );
    }
    const targets = bendList(players.map((player) => MultiplayerMobs.make_target(player.x, player.y, player.z)));
    if (mobs.$ === "Con") {
      mobs = MultiplayerMobs.step_world(mobs, targets, dt, time, OFFSET, regionsFor(mobs));
      const sunlight = Entities.sunlight_damage(mobs, edits(), seed, daylight, dt, drops);
      mobs = sunlight.mobs;
      drops = sunlight.drops;
      // Sunlight never moves a body, so windows built now line up with the list.
      const regions = regionsFor(mobs);
      for (const player of players) {
        const threat = Number(Entities.threat_damage(mobs, player.x, player.y, player.z, OFFSET, regions));
        if (threat > 0) hurts.set(player.id, threat * dt);
      }
    }
    if (drops.$ === "Con") drops = Entities.step_drops(drops, dt, groundsFor(drops));
    spawnTimer += dt;
    if (spawnTimer >= SPAWN_INTERVAL) {
      spawnTimer = 0;
      if (!peaceful && daylight < NIGHT_DAYLIGHT) {
        const limits = {
          ...NIGHT_SPAWN,
          maxAlive: NIGHT_SPAWN.maxAlive * players.length,
          maxHostile: NIGHT_SPAWN.maxHostile * players.length,
        };
        for (const player of players) {
          const spawns = nightSpawns({ seed, mobs: views(), anchorX: player.x, anchorZ: player.z, maxY: MAX_Y, random, limits });
          let nextId = views().reduce((max, mob) => Math.max(max, mob.id + 1), 1);
          for (const spawn of spawns) {
            mobs = Entities.cons_mob(
              Entities.make_mob(BigInt(nextId), spawn.kind, spawn.x, spawn.y, spawn.z, spawn.health, true),
              mobs,
            );
            nextId += 1;
          }
        }
      }
    }
    despawnTimer += dt;
    if (despawnTimer >= DESPAWN_INTERVAL) {
      despawnTimer = 0;
      mobs = MultiplayerMobs.despawn(mobs, targets, DESPAWN_RADIUS);
    }
    ticks += 1;
    if (ticks % 50 === 0) evictChunks(players);
    return hurts;
  }

  /** A player's hit on a mob, from that player's pose. */
  function attack(pose, mobId, damage, ranged) {
    const before = listItems(mobs).find((mob) => Number(mob.id) === mobId);
    const result = MultiplayerMobs.attack(mobs, BigInt(mobId), damage, pose.x, pose.y, pose.z, ranged, drops);
    if (!result.hit) return { hit: false, killed: false, kind: 0 };
    mobs = result.mobs;
    drops = result.drops;
    const after = listItems(mobs).find((mob) => Number(mob.id) === mobId);
    return {
      hit: true,
      killed: Boolean(before?.alive) && after !== undefined && !after.alive,
      kind: Number(before?.kind ?? 0),
    };
  }

  function pickup(pose, dropId) {
    const result = MultiplayerMobs.pickup(drops, BigInt(dropId), pose.x, pose.y, pose.z);
    if (!MultiplayerMobs.pickup_ok(result)) return { ok: false, item: 0, amount: 0 };
    drops = MultiplayerMobs.pickup_drops(result);
    return {
      ok: true,
      item: Number(MultiplayerMobs.pickup_item(result)),
      amount: Number(MultiplayerMobs.pickup_amount(result)),
    };
  }

  /** An item a player threw or spilled, at (x, y, z). */
  function addDrop(item, amount, x, y, z) {
    const id = nextDropId;
    nextDropId += 1;
    drops = Entities.cons_drop(Entities.make_drop(BigInt(id), item, x, y, z, amount), drops);
    return id;
  }

  function snapshot() {
    return { mobs: listItems(mobs).map(mobToWire), drops: listItems(drops).map(dropToWire) };
  }

  return {
    tick,
    attack,
    pickup,
    addDrop,
    applyEdits,
    snapshot,
    blockAt,
    cachedChunks: () => chunks.size,
    // Test seam: place mobs directly.
    setMobsForTest(list) {
      mobs = list;
      populated = true;
    },
  };
}
