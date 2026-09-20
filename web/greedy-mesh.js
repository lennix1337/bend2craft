const FACE_DIRECTIONS = [
  [0, 1, 0],
  [0, -1, 0],
  [1, 0, 0],
  [-1, 0, 0],
  [0, 0, 1],
  [0, 0, -1],
];

function cellKey(u, v) {
  return `${u},${v}`;
}

function planeCell(faceIndex, x, y, z) {
  switch (faceIndex) {
    case 0:
      return { fixed: y + 1, u: x, v: z };
    case 1:
      return { fixed: y, u: x, v: z };
    case 2:
      return { fixed: x + 1, u: z, v: y };
    case 3:
      return { fixed: x, u: z, v: y };
    case 4:
      return { fixed: z + 1, u: x, v: y };
    case 5:
      return { fixed: z, u: x, v: y };
    default:
      throw new RangeError(`Unknown face index: ${faceIndex}`);
  }
}

function sameCell(mask, visited, u, v, block, light) {
  const key = cellKey(u, v);
  const cell = mask.get(key);
  return !visited.has(key) && cell?.block === block && cell?.light === light;
}

function mergePlane(faceIndex, fixed, mask) {
  const cells = [...mask.entries()]
    .map(([key, cell]) => {
      const [u, v] = key.split(",").map(Number);
      return { u, v, ...cell };
    })
    .sort((a, b) => a.v - b.v || a.u - b.u);
  const visited = new Set();
  const quads = [];

  for (const start of cells) {
    const startKey = cellKey(start.u, start.v);
    if (visited.has(startKey)) continue;
    const { block, light } = start;
    let width = 1;
    while (sameCell(mask, visited, start.u + width, start.v, block, light)) width += 1;

    let height = 1;
    while (true) {
      const row = [];
      for (let offset = 0; offset < width; offset += 1) {
        const u = start.u + offset;
        const v = start.v + height;
        if (!sameCell(mask, visited, u, v, block, light)) break;
        row.push(cellKey(u, v));
      }
      if (row.length !== width) break;
      height += 1;
    }

    for (let offsetV = 0; offsetV < height; offsetV += 1) {
      for (let offsetU = 0; offsetU < width; offsetU += 1) {
        visited.add(cellKey(start.u + offsetU, start.v + offsetV));
      }
    }
    quads.push({
      faceIndex,
      fixed,
      u: start.u,
      v: start.v,
      width,
      height,
      block,
      x: start.x,
      y: start.y,
      z: start.z,
      light,
    });
  }
  return quads;
}

export function buildGreedyQuads({ forEachLoadedBlock, blockAt, isActive, lightAt = null }) {
  if (typeof forEachLoadedBlock !== "function" || typeof blockAt !== "function" || typeof isActive !== "function") {
    throw new TypeError("greedy meshing requires forEachLoadedBlock, blockAt and isActive");
  }

  const planes = new Map();
  let blockCount = 0;
  forEachLoadedBlock((x, y, z, value) => {
    const block = Number(value);
    if (block === 0) return;
    blockCount += 1;
    for (let faceIndex = 0; faceIndex < FACE_DIRECTIONS.length; faceIndex += 1) {
      const [dx, dy, dz] = FACE_DIRECTIONS[faceIndex];
      const neighborX = x + dx;
      const neighborY = y + dy;
      const neighborZ = z + dz;
      const neighbor = isActive(neighborX, neighborZ) ? Number(blockAt(neighborX, neighborY, neighborZ) ?? 0) : 0;
      if (neighbor !== 0) continue;
      const { fixed, u, v } = planeCell(faceIndex, x, y, z);
      const light = typeof lightAt === "function"
        ? Number(lightAt(neighborX, neighborY, neighborZ))
        : 15;
      const planeKey = `${faceIndex}:${fixed}`;
      let mask = planes.get(planeKey);
      if (mask === undefined) {
        mask = new Map();
        planes.set(planeKey, mask);
      }
      mask.set(cellKey(u, v), { block, x, y, z, light });
    }
  });

  const quads = [];
  for (const [planeKey, mask] of planes) {
    const separator = planeKey.indexOf(":");
    const faceIndex = Number(planeKey.slice(0, separator));
    const fixed = Number(planeKey.slice(separator + 1));
    quads.push(...mergePlane(faceIndex, fixed, mask));
  }
  return { blockCount, quads };
}

export function quadCorners(quad) {
  const { faceIndex, fixed, u, v, width, height } = quad;
  const topInset = quad.block === 20 ? 1 / 16 : 0;
  switch (faceIndex) {
    case 0:
      return [[u, fixed - topInset, v], [u + width, fixed - topInset, v], [u + width, fixed - topInset, v + height], [u, fixed - topInset, v + height]];
    case 1:
      return [[u, fixed, v + height], [u + width, fixed, v + height], [u + width, fixed, v], [u, fixed, v]];
    case 2:
      return [[fixed, v, u], [fixed, v, u + width], [fixed, v + height - topInset, u + width], [fixed, v + height - topInset, u]];
    case 3:
      return [[fixed, v, u + width], [fixed, v, u], [fixed, v + height - topInset, u], [fixed, v + height - topInset, u + width]];
    case 4:
      return [[u + width, v, fixed], [u, v, fixed], [u, v + height - topInset, fixed], [u + width, v + height - topInset, fixed]];
    case 5:
      return [[u, v, fixed], [u + width, v, fixed], [u + width, v + height - topInset, fixed], [u, v + height - topInset, fixed]];
    default:
      throw new RangeError(`Unknown face index: ${faceIndex}`);
  }
}
