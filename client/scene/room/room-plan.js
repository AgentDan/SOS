function positive(value, fallback) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

function finite(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function defaultWindows(width, height) {
  const windowHeight = Math.min(1.7, height - 0.9);
  return [-0.26 * width, 0.26 * width].map((center) => ({
    center,
    width: 0.9,
    height: windowHeight,
    sill: 0.6
  }));
}

function fitWindow(win, wallLength, roomHeight) {
  if (!win || typeof win !== "object") return null;
  const center = finite(win.center);
  const width = finite(win.width);
  const height = finite(win.height);
  const sill = finite(win.sill);
  if (center === null || width === null || height === null || sill === null) return null;
  if (width <= 0 || height <= 0) return null;
  const half = wallLength / 2;
  if (center - width / 2 < -half - 1e-6) return null;
  if (center + width / 2 > half + 1e-6) return null;
  if (sill < -1e-6) return null;
  if (sill + height > roomHeight + 1e-6) return null;
  return { center, width, height, sill };
}

function sidePanels(depth, height) {
  return [
    { s0: 0.35, s1: depth / 2 - 0.35, bottom: 0.42, top: height - 0.5 },
    { s0: depth / 2 + 0.05, s1: depth - 0.2, bottom: 0.42, top: height - 0.5 }
  ];
}

function computeRoomPlan(room = {}) {
  const source = room && typeof room === "object" && !Array.isArray(room) ? room : {};
  const width = positive(source.width, 4);
  const depth = positive(source.depth, 4);
  const height = positive(source.height, 2.6);
  const listed = Array.isArray(source.windows) ? source.windows : defaultWindows(width, height);
  const windows = [];
  for (const item of listed) {
    const fitted = fitWindow(item, width, height);
    if (fitted) windows.push(fitted);
  }
  const bare = source.panels === false;
  return {
    width,
    depth,
    height,
    walls: [
      { side: "back", length: width, windows },
      { side: "left", length: depth, panels: bare ? [] : sidePanels(depth, height) },
      { side: "right", length: depth, panels: bare ? [] : sidePanels(depth, height) }
    ]
  };
}

export { computeRoomPlan };
