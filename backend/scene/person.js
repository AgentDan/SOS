// models/character.glb, корень «Low-poly Character - Formal male seated static».
// Сидящий мужчина, референс роста 180 см. Узлов ANCHOR_* нет.
// Габариты: ширина 814 мм по x, симметрично вокруг нуля;
// высота 1420 мм по y, от y = 0 (подошвы на полу) до макушки;
// по z от −153 мм (спина) до +625 мм (колени и ступни вперёд).
// Начало координат на полу, по центру по x, по z примерно под тазом. Модель смотрит в +z.
// Высота сиденья кресла не нужна: ноги модели стоят на полу.
// Смещение относительно кресла берётся из mannequin.offsetMm, по умолчанию {0, 0, 0}.

function productsOf(catalog) {
  const products = catalog?.products ?? catalog?.draft?.products ?? [];
  return Array.isArray(products) ? products : [];
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

function axisMm(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function offsetOf(mannequin) {
  const offset = mannequin?.offsetMm;
  return {
    x: axisMm(offset?.x),
    y: axisMm(offset?.y),
    z: axisMm(offset?.z)
  };
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
    chair = place;
    break;
  }
  if (!chair) return null;

  const scale = scaleOf(body?.heightCm, mannequin.referenceHeightCm);
  if (scale === null) return null;

  const offset = offsetOf(mannequin);
  return {
    sku: mannequin.sku,
    x: chair.x + offset.x,
    y: offset.y,
    z: chair.z + offset.z,
    rotY: chair.rotY,
    scale
  };
}

export { placePerson };
