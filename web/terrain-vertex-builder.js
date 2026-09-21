import { quadCorners } from "./greedy-mesh.js";
import { atlasUV, blockFaceTileAt } from "./texture-atlas.js";
import { litFaceColor } from "./material-lighting.js";
import {
  SURFACE_MATERIAL_FIRE,
  SURFACE_MATERIAL_LAVA,
  SURFACE_MATERIAL_WATER,
  surfaceMaterial,
} from "./surface-materials.js";

const FACE_SHADES = [1.0, 0.52, 0.82, 0.7, 0.92, 0.62];
function blockColor(block, faceIndex, x, z, light, daylight) {
  const variation = (((x * 17 + z * 31) % 5) + 5) % 5 * 0.012;
  const top = block === 3 && faceIndex === 0;
  const shade = FACE_SHADES[faceIndex] + (top ? variation : variation * 0.5);
  return litFaceColor(faceIndex, daylight, light, shade);
}

function appendQuad(layer, quad, daylight) {
  const color = blockColor(quad.block, quad.faceIndex, quad.x, quad.z, quad.light, daylight);
  const corners = quadCorners(quad);
  const uv = atlasUV(blockFaceTileAt(quad.block, quad.faceIndex, quad.x, quad.z));
  const tileRect = quad.faceIndex >= 2
    ? [uv[0], uv[5], uv[4], uv[1]]
    : [uv[0], uv[1], uv[4], uv[5]];
  const localUv = [[0, 0], [quad.width, 0], [quad.width, quad.height], [0, quad.height]];
  const material = surfaceMaterial(quad.block);
  for (const cornerIndex of [0, 1, 2, 0, 2, 3]) {
    const corner = corners[cornerIndex];
    const ao = quad.ao?.[cornerIndex] ?? 1;
    layer.positions.push(corner[0], corner[1], corner[2]);
    layer.colors.push(color[0] * ao, color[1] * ao, color[2] * ao);
    layer.uvs.push(localUv[cornerIndex][0], localUv[cornerIndex][1]);
    layer.tiles.push(...tileRect);
    layer.materials.push(material);
  }
  layer.quadCount += 1;
}

function typedLayer(layer) {
  return {
    positions: new Float32Array(layer.positions),
    colors: new Float32Array(layer.colors),
    uvs: new Float32Array(layer.uvs),
    materials: new Float32Array(layer.materials),
    tiles: new Float32Array(layer.tiles),
    quadCount: layer.quadCount,
  };
}

export function buildTerrainVertexArrays(quads, daylight = 1) {
  if (!Array.isArray(quads)) throw new TypeError("terrain vertex builder requires quads");
  const opaque = { positions: [], colors: [], uvs: [], materials: [], tiles: [], quadCount: 0 };
  const water = { positions: [], colors: [], uvs: [], materials: [], tiles: [], quadCount: 0 };
  for (const quad of quads) {
    const material = surfaceMaterial(quad.block);
    const target = material === SURFACE_MATERIAL_WATER
      || material === SURFACE_MATERIAL_LAVA
      || material === SURFACE_MATERIAL_FIRE
      ? water
      : opaque;
    appendQuad(target, quad, daylight);
  }
  return { opaque: typedLayer(opaque), water: typedLayer(water) };
}
