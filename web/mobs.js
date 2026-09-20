// Pure mob simulation: pigs wander and flee, zombies chase, attack and
// burn in daylight. Mirrors world/mobs.bend for creature stats.
// Dependency-free and testable without a browser.

import { JUMP_SPEED, movePlayer } from "./game-state.js";

export const KINDS = Object.freeze({
  pig: Object.freeze({ health: 10, damage: 0, speed: 2.0, hostile: false, drop: 7 }),
  zombie: Object.freeze({ health: 20, damage: 3, speed: 2.6, hostile: true, drop: 8 }),
});

export const MOB_CAPS = Object.freeze({ pig: 6, zombie: 5 });
export const ZOMBIE_BURN_SECONDS = 0.5;
export const ZOMBIE_REACH = 1.8;

export function createMob(kind, x, y, z) {
  const stats = KINDS[kind];
  if (!stats) throw new Error(`Unknown mob kind: ${kind}`);
  return {
    id: 0,
    kind,
    x,
    y,
    z,
    yaw: 0,
    velocityY: 0,
    grounded: false,
    flying: false,
    peakY: y,
    lastFall: 0,
    health: stats.health,
    maxHealth: stats.health,
    hurtTimer: 0,
    fleeTimer: 0,
    attackCooldown: 0,
    burnTimer: 0,
    wanderTimer: 0,
    wanderYaw: 0,
    wanderMoving: false,
    moving: false,
    fellOut: false,
    dead: false,
  };
}

export function mobDrops(kind) {
  return [KINDS[kind].drop];
}

export function damageMob(mob, amount) {
  if (mob.dead || amount <= 0) return false;
  mob.health = Math.max(0, mob.health - Math.floor(amount));
  mob.hurtTimer = 0.3;
  if (!KINDS[mob.kind].hostile) mob.fleeTimer = 1.2;
  if (mob.health <= 0) {
    mob.dead = true;
    return true;
  }
  return false;
}

function yawToward(fromX, fromZ, toX, toZ) {
  return Math.atan2(toX - fromX, -(toZ - fromZ));
}

function wanderBrain(mob, dt, rng) {
  mob.wanderTimer -= dt;
  if (mob.wanderTimer <= 0) {
    mob.wanderYaw = rng() * Math.PI * 2;
    mob.wanderMoving = rng() < 0.65;
    mob.wanderTimer = 1.5 + rng() * 3;
  }
  mob.yaw = mob.wanderYaw;
  mob.moving = mob.wanderMoving;
}

export function tickMob(world, mob, playerPos, dt, env = {}) {
  const events = { moved: 0, died: false, attacked: 0, burned: 0, removed: false };
  if (mob.dead) {
    events.removed = true;
    return events;
  }
  const { isDay = true, rng = Math.random, spawnCell = [0, 0], spawnHeight = 0, hostile = true } = env;
  const stats = KINDS[mob.kind];
  mob.hurtTimer = Math.max(0, mob.hurtTimer - dt);
  mob.fleeTimer = Math.max(0, mob.fleeTimer - dt);
  mob.attackCooldown = Math.max(0, mob.attackCooldown - dt);

  const dx = playerPos.x - mob.x;
  const dz = playerPos.z - mob.z;
  const distToPlayer = Math.hypot(dx, dz);
  let speed = stats.speed;
  mob.moving = false;

  if (mob.kind === "zombie" && hostile) {
    if (!isDay || distToPlayer < 12) {
      mob.yaw = yawToward(mob.x, mob.z, playerPos.x, playerPos.z);
      mob.moving = true;
    }
    if (distToPlayer < ZOMBIE_REACH && mob.attackCooldown <= 0) {
      mob.attackCooldown = 1.0;
      events.attacked = stats.damage;
    }
  } else if (mob.kind === "pig") {
    if (mob.fleeTimer > 0 && distToPlayer < 8) {
      mob.yaw = yawToward(playerPos.x, playerPos.z, mob.x, mob.z);
      mob.moving = true;
      speed = stats.speed * 1.6;
    } else {
      wanderBrain(mob, dt, rng);
    }
  } else {
    // Non-hostile zombies graze like pigs instead of hunting.
    wanderBrain(mob, dt, rng);
  }
  if (mob.kind === "zombie") {
    if (isDay) {
      mob.burnTimer += dt;
      if (mob.burnTimer >= ZOMBIE_BURN_SECONDS) {
        mob.burnTimer = 0;
        events.burned = 1;
        if (damageMob(mob, 1)) {
          events.died = true;
          return events;
        }
      }
    } else {
      mob.burnTimer = 0;
    }
  }

  const beforeX = mob.x;
  const beforeZ = mob.z;
  const held = mob.moving ? new Set(["KeyW"]) : new Set();
  const step = movePlayer(world, mob, held, dt, spawnCell, spawnHeight, {
    sprint: false,
    speed,
    voidRespawn: false,
  });
  events.moved = step.moved;
  if (step.voidFell) {
    mob.dead = true;
    mob.fellOut = true;
    events.removed = true;
    return events;
  }
  // Hop over single-block obstacles instead of getting stuck forever.
  const expected = speed * dt;
  if (mob.moving && mob.grounded && expected > 0 && Math.hypot(mob.x - beforeX, mob.z - beforeZ) < expected * 0.2) {
    mob.velocityY = JUMP_SPEED;
  }
  return events;
}

// Slab ray test against the mob body box. Returns distance or null.
export function rayHitMob(origin, direction, mob, maxDistance) {
  const height = mob.kind === "zombie" ? 1.9 : 1.2;
  const min = [mob.x - 0.4, mob.y, mob.z - 0.4];
  const max = [mob.x + 0.4, mob.y + height, mob.z + 0.4];
  let near = 0;
  let far = maxDistance;
  for (let axis = 0; axis < 3; axis += 1) {
    const o = origin[axis];
    const d = direction[axis];
    if (Math.abs(d) < 1e-9) {
      if (o < min[axis] || o > max[axis]) return null;
    } else {
      let t0 = (min[axis] - o) / d;
      let t1 = (max[axis] - o) / d;
      if (t0 > t1) [t0, t1] = [t1, t0];
      near = Math.max(near, t0);
      far = Math.min(far, t1);
      if (near > far) return null;
    }
  }
  return near;
}
