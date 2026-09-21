function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value)));
}

function cssRgb(color) {
  return `rgb(${color.map((channel) => Math.round(channel * 255)).join(", ")})`;
}

export function skyPalette(daylight) {
  const light = clamp01(daylight);
  const top = [
    0.05 + 0.39 * light,
    0.1 + 0.56 * light,
    0.18 + 0.64 * light,
  ];
  const horizon = [
    0.18 + 0.48 * light,
    0.24 + 0.52 * light,
    0.3 + 0.5 * light,
  ];
  return {
    top,
    horizon,
    cssTop: cssRgb(top),
    cssHorizon: cssRgb(horizon),
  };
}
