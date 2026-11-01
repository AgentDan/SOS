function positive(value, fallback) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

function finite(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

const PANEL_BOTTOM = 0.42;
const PANEL_TOP_INSET = 0.5;
const CORNER_MARGIN = 0.35;
const PANEL_GAP = 0.2;

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

function fitDoor(door, wallLength, roomHeight) {
  if (!door || typeof door !== "object") return null;
  const center = finite(door.center);
  const width = finite(door.width);
  const height = finite(door.height);
  if (center === null || width === null || height === null) return null;
  if (width <= 0 || height <= 0) return null;
  const half = wallLength / 2;
  if (center - width / 2 < -half - 1e-6) return null;
  if (center + width / 2 > half + 1e-6) return null;
  if (height > roomHeight + 1e-6) return null;
  return { center, width, height };
}

function fitPanel(panel, wallLength, roomHeight) {
  if (!panel || typeof panel !== "object") return null;
  const s0 = finite(panel.s0);
  const s1 = finite(panel.s1);
  const bottom = finite(panel.bottom);
  const top = finite(panel.top);
  if (s0 === null || s1 === null || bottom === null || top === null) return null;
  if (!(s1 > s0) || !(top > bottom)) return null;
  if (s0 < -1e-6 || s1 > wallLength + 1e-6) return null;
  if (bottom < -1e-6 || top > roomHeight + 1e-6) return null;
  return { s0, s1, bottom, top };
}

function flankPanels(wallLength, roomHeight, openingWidth) {
  const bottom = PANEL_BOTTOM;
  const top = roomHeight - PANEL_TOP_INSET;
  const half = wallLength / 2;
  const open0 = -openingWidth / 2;
  const open1 = openingWidth / 2;
  const drafts = [
    { s0: CORNER_MARGIN, s1: open0 - PANEL_GAP + half, bottom, top },
    { s0: open1 + PANEL_GAP + half, s1: wallLength - CORNER_MARGIN, bottom, top }
  ];
  const panels = [];
  for (const draft of drafts) {
    const fitted = fitPanel(draft, wallLength, roomHeight);
    if (fitted) panels.push(fitted);
  }
  return panels;
}

function rowPanels(wallLength, roomHeight, count) {
  const bottom = PANEL_BOTTOM;
  const top = roomHeight - PANEL_TOP_INSET;
  const available = wallLength - CORNER_MARGIN * 2 - PANEL_GAP * (count - 1);
  const panelWidth = available / count;
  const panels = [];
  for (let i = 0; i < count; i += 1) {
    const s0 = CORNER_MARGIN + i * (panelWidth + PANEL_GAP);
    const fitted = fitPanel({ s0, s1: s0 + panelWidth, bottom, top }, wallLength, roomHeight);
    if (fitted) panels.push(fitted);
  }
  return panels;
}

function computeRoomPlan(room = {}) {
  const source = room && typeof room === "object" && !Array.isArray(room) ? room : {};
  const width = positive(source.width, 6);
  const depth = positive(source.depth, 6);
  const height = positive(source.height, 2.8);
  const listed = Array.isArray(source.windows) ? source.windows : defaultWindows(width, height);
  const windows = [];
  for (const item of listed) {
    const fitted = fitWindow(item, width, height);
    if (fitted) windows.push(fitted);
  }
  const bare = source.panels === false;
  const leftWindow = fitWindow({ center: 0, width: 1.2, height: 1.5, sill: 0.85 }, depth, height);
  const frontDoor = fitDoor({ center: 0, width: 0.95, height: 2.1 }, width, height);
  return {
    width,
    depth,
    height,
    walls: [
      { side: "back", length: width, windows },
      {
        side: "left",
        length: depth,
        windows: leftWindow ? [leftWindow] : [],
        panels: bare ? [] : flankPanels(depth, height, 1.2)
      },
      {
        side: "right",
        length: depth,
        panels: bare ? [] : rowPanels(depth, height, 3)
      },
      {
        side: "front",
        length: width,
        doors: frontDoor ? [frontDoor] : [],
        panels: bare ? [] : flankPanels(width, height, 0.95)
      }
    ]
  };
}

export { computeRoomPlan };
