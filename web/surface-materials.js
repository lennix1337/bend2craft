export const SURFACE_MATERIAL_WATER = 1;
export const SURFACE_MATERIAL_LAVA = 2;
export const SURFACE_MATERIAL_FIRE = 3;

export function surfaceMaterial(block) {
  if (Number(block) === 7) return SURFACE_MATERIAL_WATER;
  if (Number(block) === 21) return SURFACE_MATERIAL_LAVA;
  if (Number(block) === 24) return SURFACE_MATERIAL_FIRE;
  return 10 + Number(block);
}

export function movesSurfaceGeometry(material) {
  return Number(material) === SURFACE_MATERIAL_WATER;
}
