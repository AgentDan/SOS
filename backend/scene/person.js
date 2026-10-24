// models/character.glb: узлов ANCHOR_* нет и отдельного узла сиденья нет.
// Начало координат модели считается стоящим на сиденье, поэтому смещение 0.
const SEAT_OFFSET_MM = 0;

function productsOf(catalog) {
  const products = catalog?.products ?? catalog?.draft?.products ?? [];
  return Array.isArray(products) ? products : [];
}

function seatHeightMm(product) {
  const value = product?.placement?.seatHeightMm;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  return value;
}

function scaleOf(heightCm, referenceHeightCm) {
  if (typeof heightCm !== "number" || !Number.isFinite(heightCm)) return null;
  if (
    typeof referenceHeightCm !== "number" ||
    !Number.isFinite(referenceHeightCm) ||
    !(referenceHeightCm > 0)
  ) {
    return null;
  }
  return Math.min(1.3, Math.max(0.7, heightCm / referenceHeightCm));
}

function placePerson({ catalog, ergonomics, body, placements } = {}) {
  const mannequin = ergonomics?.mannequin;
  if (!mannequin || typeof mannequin.sku !== "string" || mannequin.sku.length === 0) return null;

  const products = productsOf(catalog);
  const product = products.find((item) => item && item.sku === mannequin.sku);
  if (!product) return null;

  const list = Array.isArray(placements) ? placements : [];
  let chair = null;
  for (const place of list) {
    if (!place || typeof place.sku !== "string") continue;
    const item = products.find((entry) => entry && entry.sku === place.sku);
    if (item?.type !== "chair") continue;
    chair = { place, product: item };
    break;
  }
  if (!chair) return null;

  const scale = scaleOf(body?.heightCm, mannequin.referenceHeightCm);
  if (scale === null) return null;

  return {
    sku: mannequin.sku,
    x: chair.place.x,
    y: seatHeightMm(chair.product) - SEAT_OFFSET_MM,
    z: chair.place.z,
    rotY: chair.place.rotY,
    scale
  };
}

export { placePerson };
