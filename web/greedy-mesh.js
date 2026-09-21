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

const FLUID_BLOCKS = new Set([7, 21, 24]);

function isFluid(block) {
  return FLUID_BLOCKS.has(block);
}

function isOpaque(block) {
  return block !== 0 && !isFluid(block);
}

function occupied(blockAt, isActive, x, y, z) {
  return isActive(x, z) && isOpaque(Number(blockAt(x, y, z) ?? 0));
}

function topCornerAmbient(quad, cornerIndex, blockAt, isActive) {
  const minX = quad.u;
  const maxX = quad.u + quad.width;
  const minZ = quad.v;
  const maxZ = quad.v + quad.height;
  const vertexX = cornerIndex === 0 || cornerIndex === 3 ? minX : maxX;
  const vertexZ = cornerIndex === 0 || cornerIndex === 1 ? minZ : maxZ;
  const sideX = occupied(
    blockAt,
    isActive,
    vertexX === minX ? vertexX - 1 : vertexX,
    quad.y,
    Math.floor(vertexZ),
  );
  const sideZ = occupied(
    blockAt,
    isActive,
    Math.floor(vertexX),
    quad.y,
    vertexZ === minZ ? vertexZ - 1 : vertexZ,
  );
  const diagonal = occupied(
    blockAt,
    isActive,
    vertexX === minX ? vertexX - 1 : vertexX,
    quad.y,
    vertexZ === minZ ? vertexZ - 1 : vertexZ,
  );
  if (sideX && sideZ) return 0.62;
  return 1 - (sideX ? 0.14 : 0) - (sideZ ? 0.14 : 0) - (diagonal ? 0.1 : 0);
}

function ambientCorners(quad, blockAt, isActive) {
  if (quad.faceIndex !== 0 || isFluid(quad.block)) return [1, 1, 1, 1];
  return [0, 1, 2, 3].map((cornerIndex) => topCornerAmbient(quad, cornerIndex, blockAt, isActive));
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
      // Fluids are transparent: terrain under a fluid keeps its faces,
      // while same-fluid interior faces stay culled.
      if (isOpaque(neighbor) || (neighbor === block && isFluid(block))) continue;
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
  for (const quad of quads) quad.ao = ambientCorners(quad, blockAt, isActive);
  return { blockCount, quads };
}

export function quadCorners(quad) {
  const { faceIndex, fixed, u, v, width, height } = quad;
  // Recessed top surfaces read as soil/water instead of full cubes.
  const topInset = quad.block === 20 ? 1 / 16 : isFluid(quad.block) ? 2 / 16 : 0;
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
