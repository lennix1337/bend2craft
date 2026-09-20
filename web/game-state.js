export const PLAYER_RADIUS = 0.3;
export const PLAYER_HEIGHT = 1.8;
export const EYE_HEIGHT = 1.62;
export const MOVE_SPEED = 4.5;
export const SPRINT_MULTIPLIER = 1.5;
export const SPRINT_SPEED = MOVE_SPEED * SPRINT_MULTIPLIER;
export const FLY_SPEED = 7.0;
export const JUMP_SPEED = 7.0;
export const GRAVITY = 20.0;

const SPRINT_KEYS = ["ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "Sprint"];

export function isSprinting(held) {
  for (const key of SPRINT_KEYS) {
    if (held.has(key)) return true;
  }
  return false;
}

export function createWorldState(width, depth, maxY) {
  const blocks = new Uint8Array(width * depth * maxY);
  const indexOf = (x, y, z) => x + width * (z + depth * y);
  const inside = (x, y, z) =>
    x >= 0 && x < width && y >= 0 && y < maxY && z >= 0 && z < depth;
  const blockAt = (x, y, z) => inside(x, y, z) ? blocks[indexOf(x, y, z)] : 0;
  const setBlock = (x, y, z, value) => {
    if (inside(x, y, z)) blocks[indexOf(x, y, z)] = value;
  };
  return { width, depth, maxY, blocks, inside, blockAt, setBlock };
}

export function createPlayer(spawnCell, spawnHeight) {
  return {
    x: spawnCell[0] + 0.5,
    y: spawnHeight + 0.05,
    z: spawnCell[1] + 0.5,
    yaw: 0,
    pitch: -0.18,
    velocityY: 0,
    grounded: false,
    flying: false,
    peakY: spawnHeight + 0.05,
    lastFall: 0,
  };
}

export function collidesAt(world, player, x, y, z) {
  const minX = Math.floor(x - PLAYER_RADIUS + 0.0001);
  const maxX = Math.floor(x + PLAYER_RADIUS - 0.0001);
  const minY = Math.floor(y + 0.0001);
  const maxY = Math.floor(y + PLAYER_HEIGHT - 0.0001);
  const minZ = Math.floor(z - PLAYER_RADIUS + 0.0001);
  const maxZ = Math.floor(z + PLAYER_RADIUS - 0.0001);
  for (let by = minY; by <= maxY; by += 1) {
    for (let bz = minZ; bz <= maxZ; bz += 1) {
      for (let bx = minX; bx <= maxX; bx += 1) {
        if (world.blockAt(bx, by, bz) !== 0) return true;
      }
    }
  }
  return false;
}

export function overlapsPlayer(player, x, y, z) {
  return x + 1 > player.x - PLAYER_RADIUS &&
    x < player.x + PLAYER_RADIUS &&
    y + 1 > player.y &&
    y < player.y + PLAYER_HEIGHT &&
    z + 1 > player.z - PLAYER_RADIUS &&
    z < player.z + PLAYER_RADIUS;
}

export function cameraDirection(player) {
  const cosPitch = Math.cos(player.pitch);
  return [
    Math.sin(player.yaw) * cosPitch,
    Math.sin(player.pitch),
    -Math.cos(player.yaw) * cosPitch,
  ];
}

export function raycast(world, player, maxDistance = 8, step = 0.05) {
  const direction = cameraDirection(player);
  const origin = [player.x, player.y + EYE_HEIGHT, player.z];
  let previous = null;
  let lastEmpty = null;
  for (let distance = 0.1; distance <= maxDistance; distance += step) {
    const x = Math.floor(origin[0] + direction[0] * distance);
    const y = Math.floor(origin[1] + direction[1] * distance);
    const z = Math.floor(origin[2] + direction[2] * distance);
    const cell = `${x},${y},${z}`;
    if (cell === previous) continue;
    previous = cell;
    if (world.blockAt(x, y, z) !== 0) {
      return { hit: [x, y, z], place: lastEmpty };
    }
    lastEmpty = [x, y, z];
  }
  return null;
}

export function movePlayer(world, player, held, dt, spawnCell, spawnHeight, options = {}) {
  const forward = (held.has("KeyW") ? 1 : 0) - (held.has("KeyS") ? 1 : 0);
  const strafe = (held.has("KeyD") ? 1 : 0) - (held.has("KeyA") ? 1 : 0);
  const moving = forward !== 0 || strafe !== 0;
  const sprintIntent = options.sprint ?? isSprinting(held);
  const sprinting = sprintIntent && moving && !player.flying;
  const speed = options.speed ?? (player.flying ? FLY_SPEED : sprinting ? SPRINT_SPEED : MOVE_SPEED);
  const length = Math.hypot(forward, strafe) || 1;
  const f = forward / length;
  const s = strafe / length;
  const dx = (Math.sin(player.yaw) * f + Math.cos(player.yaw) * s) * speed * dt;
  const dz = (-Math.cos(player.yaw) * f + Math.sin(player.yaw) * s) * speed * dt;

  const startX = player.x;
  const startZ = player.z;
  if (!collidesAt(world, player, player.x + dx, player.y, player.z)) player.x += dx;
  if (!collidesAt(world, player, player.x, player.y, player.z + dz)) player.z += dz;
  const moved = Math.hypot(player.x - startX, player.z - startZ);

  if (player.peakY === undefined) player.peakY = player.y;
  if (player.lastFall === undefined) player.lastFall = 0;
  const wasGrounded = player.grounded;
  let landed = false;
  let fallDistance = 0;

  if (player.flying) {
    const up = held.has("Space") ? 1 : 0;
    const down = held.has("ShiftLeft") || held.has("ShiftRight") ? 1 : 0;
    const dy = (up - down) * FLY_SPEED * dt;
    const nextY = player.y + dy;
    if (!collidesAt(world, player, player.x, nextY, player.z)) {
      player.y = nextY;
    }
    player.velocityY = 0;
    player.grounded = false;
    player.peakY = player.y;
  } else if (wasGrounded && player.velocityY === 0 && player.y > player.peakY) {
    player.peakY = player.y;
  }

  if (!player.flying) {
    player.velocityY -= GRAVITY * dt;
    const dy = player.velocityY * dt;
    const nextY = player.y + dy;
    if (!collidesAt(world, player, player.x, nextY, player.z)) {
      if (player.grounded) player.peakY = player.y;
      player.y = nextY;
      player.grounded = false;
      if (player.y > player.peakY) player.peakY = player.y;
    } else if (dy < 0) {
      player.y = Math.floor(nextY) + 1;
      player.velocityY = 0;
      player.grounded = true;
      fallDistance = Math.max(0, player.peakY - player.y);
      player.lastFall = fallDistance;
      player.peakY = player.y;
      landed = true;
    } else {
      player.y = Math.floor(nextY + PLAYER_HEIGHT) - PLAYER_HEIGHT;
      player.velocityY = 0;
    }
  }

  let voidFell = false;
  if (player.y < -10) {
    voidFell = true;
    if (options.voidRespawn ?? true) {
      player.x = spawnCell[0] + 0.5;
      player.y = spawnHeight + 0.05;
      player.z = spawnCell[1] + 0.5;
      player.velocityY = 0;
      player.peakY = player.y;
      player.lastFall = 0;
    }
  }

  return { moved, sprinting, landed, fallDistance, voidFell };
}
