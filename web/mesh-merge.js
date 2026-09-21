function sameMaterial(a, b) {
  return a.faceIndex === b.faceIndex && a.fixed === b.fixed && a.block === b.block && a.light === b.light;
}

function mergePass(quads, horizontal) {
  const sorted = [...quads].sort((a, b) => {
    const fields = horizontal
      ? ["faceIndex", "fixed", "block", "v", "height", "u"]
      : ["faceIndex", "fixed", "block", "u", "width", "v"];
    for (const field of fields) {
      if (a[field] !== b[field]) return a[field] - b[field];
    }
    return 0;
  });
  const merged = [];
  for (const quad of sorted) {
    const previous = merged[merged.length - 1];
    const adjacent = horizontal
      ? previous?.u + previous?.width === quad.u && previous?.v === quad.v && previous?.height === quad.height
      : previous?.v + previous?.height === quad.v && previous?.u === quad.u && previous?.width === quad.width;
    if (previous !== undefined && sameMaterial(previous, quad) && adjacent) {
      merged[merged.length - 1] = {
        ...previous,
        width: horizontal ? previous.width + quad.width : previous.width,
        height: horizontal ? previous.height : previous.height + quad.height,
      };
    } else {
      merged.push(quad);
    }
  }
  return merged;
}

export function mergeChunkQuads(quads) {
  let merged = quads;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = mergePass(mergePass(merged, true), false);
    if (next.length === merged.length) return next;
    merged = next;
  }
  return merged;
}
