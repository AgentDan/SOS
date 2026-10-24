// Цели от роста H в сантиметрах, результат в миллиметрах. Коэффициенты — ergonomics.table.
// Верх стола и монитора: y + height. Глаза по z сдвинуты от центра кресла к столу на eyeForwardMm.
// Расстояние до экрана — модуль разницы по z между глазами и ближайшей к ним гранью монитора.

const DEFAULT_EYE_FORWARD_MM = 150;

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function positive(value) {
  return finite(value) && value > 0;
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function productsOf(catalog) {
  const products = catalog?.products ?? catalog?.draft?.products ?? [];
  return Array.isArray(products) ? products : [];
}

function size(product, key) {
  const value = product?.dimensions?.[key];
  return positive(value) ? value : null;
}

function ofType(products, placements, type) {
  const found = [];
  for (const place of placements) {
    if (!place || typeof place.sku !== "string") continue;
    const product = products.find((item) => item && item.sku === place.sku);
    if (product?.type !== type) continue;
    found.push({ place, product });
  }
  return found;
}

function tableReady(table) {
  return (
    positive(table.seatHeightFactor) &&
    positive(table.deskHeightFactor) &&
    positive(table.eyeAboveSeatFactor) &&
    positive(table.monitorDistanceFactor) &&
    positive(table.monitorDistanceMinMm) &&
    positive(table.monitorDistanceMaxMm) &&
    table.monitorDistanceMinMm < table.monitorDistanceMaxMm
  );
}

function roundMm(value) {
  return Math.round(value);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function topOf(place, product) {
  const height = size(product, "height");
  if (height === null || !finite(place?.y)) return null;
  return place.y + height;
}

function firstZ(items) {
  for (const item of items) {
    if (finite(item.place?.z)) return item.place.z;
  }
  return null;
}

function eyeZ(chairZ, aimZ, forward) {
  if (!finite(chairZ)) return null;
  if (!finite(aimZ) || aimZ === chairZ) return chairZ;
  return chairZ + (aimZ < chairZ ? -forward : forward);
}

function spanAlongZ(product, rotY) {
  const width = size(product, "width");
  const depth = size(product, "depth");
  if (width === null || depth === null) return null;
  const angle = finite(rotY) ? rotY : 0;
  const turns = ((angle % 360) + 360) % 360;
  return turns === 90 || turns === 270 ? width : depth;
}

function distanceToFace(eye, place, product) {
  if (!finite(eye) || !finite(place?.z)) return null;
  const span = spanAlongZ(product, place.rotY);
  if (span === null) return null;
  const low = place.z - span / 2;
  const high = place.z + span / 2;
  const face = Math.abs(eye - low) <= Math.abs(eye - high) ? low : high;
  return Math.abs(eye - face);
}

function deviation(high, low, sku, actual, target, tolerance) {
  if (!finite(actual) || !finite(target) || !finite(tolerance) || tolerance < 0) return null;
  const actualMm = roundMm(actual);
  const deltaMm = actualMm - target;
  if (Math.abs(deltaMm) <= tolerance) return null;
  return {
    code: deltaMm > 0 ? high : low,
    sku,
    actualMm,
    targetMm: target,
    deltaMm
  };
}

function worse(current, next) {
  if (!next) return current;
  if (!current || Math.abs(next.deltaMm) > Math.abs(current.deltaMm)) return next;
  return current;
}

function ergo({ catalog, ergonomics, body, placements } = {}) {
  const table = ergonomics?.table;
  if (!plain(table) || !tableReady(table)) return null;
  if (!positive(body?.heightCm)) return null;

  const list = Array.isArray(placements) ? placements : [];
  const products = productsOf(catalog);
  const chairs = ofType(products, list, "chair");
  if (chairs.length === 0) return null;

  const heightCm = body.heightCm;
  const seatHeightMm = roundMm(heightCm * table.seatHeightFactor);
  const deskHeightMm = roundMm(heightCm * table.deskHeightFactor);
  const eyeHeightMm = roundMm(seatHeightMm + heightCm * table.eyeAboveSeatFactor);
  const monitorDistanceMm = roundMm(
    clamp(
      heightCm * table.monitorDistanceFactor,
      table.monitorDistanceMinMm,
      table.monitorDistanceMaxMm
    )
  );
  const targets = {
    seatHeightMm,
    deskHeightMm,
    eyeHeightMm,
    monitorDistanceMm,
    monitorTopMm: eyeHeightMm,
    hand: body.hand
  };

  const desks = ofType(products, list, "desk_top");
  const monitors = ofType(products, list, "monitor");
  const issues = [];
  const deskTol = table.tolerance?.deskHeightMm;
  const distanceTol = table.tolerance?.monitorDistanceMm;
  const topTol = table.tolerance?.monitorTopMm;

  let deskIssue = null;
  for (const item of desks) {
    deskIssue = worse(
      deskIssue,
      deviation(
        "desk_too_high",
        "desk_too_low",
        item.place.sku,
        topOf(item.place, item.product),
        deskHeightMm,
        deskTol
      )
    );
  }
  if (deskIssue) issues.push(deskIssue);

  const forward = positive(table.eyeForwardMm) ? table.eyeForwardMm : DEFAULT_EYE_FORWARD_MM;
  const deskZ = firstZ(desks);
  const eyes = eyeZ(chairs[0].place.z, deskZ !== null ? deskZ : firstZ(monitors), forward);

  let distanceIssue = null;
  let heightIssue = null;
  for (const item of monitors) {
    distanceIssue = worse(
      distanceIssue,
      deviation(
        "monitor_too_far",
        "monitor_too_close",
        item.place.sku,
        distanceToFace(eyes, item.place, item.product),
        monitorDistanceMm,
        distanceTol
      )
    );
    heightIssue = worse(
      heightIssue,
      deviation(
        "monitor_too_high",
        "monitor_too_low",
        item.place.sku,
        topOf(item.place, item.product),
        eyeHeightMm,
        topTol
      )
    );
  }
  if (distanceIssue) issues.push(distanceIssue);
  if (heightIssue) issues.push(heightIssue);

  return { targets, issues };
}

export { ergo };
