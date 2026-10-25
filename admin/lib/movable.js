function movableOf(product) {
  return !(product && product.movable === false);
}

function physicsRows(draftProducts, publishedProducts) {
  const publishedBySku = new Map();
  const publishedList = Array.isArray(publishedProducts) ? publishedProducts : [];
  for (const product of publishedList) {
    if (product && typeof product.sku === "string" && product.sku.length > 0) {
      publishedBySku.set(product.sku, product);
    }
  }

  const list = Array.isArray(draftProducts) ? draftProducts : [];
  return list
    .filter((item) => item && typeof item.sku === "string" && item.sku.length > 0 && item.type !== "person")
    .slice()
    .sort((a, b) => (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0))
    .map((item) => {
      const movable = movableOf(item);
      const published = publishedBySku.get(item.sku);
      const publishedMovable = published ? movableOf(published) : true;
      return {
        sku: item.sku,
        label: typeof item.label === "string" ? item.label : "",
        type: typeof item.type === "string" ? item.type : "",
        movable,
        unpublished: movable !== publishedMovable
      };
    });
}

function movableEdits(rows, toggles) {
  const values = toggles && typeof toggles === "object" ? toggles : {};
  const edits = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row.sku !== "string") continue;
    if (!Object.hasOwn(values, row.sku)) continue;
    const next = values[row.sku] === true;
    if (next !== (row.movable === true)) edits.push({ sku: row.sku, movable: next });
  }
  return edits;
}

function draftWithMovable(draft, edits) {
  const next = draft && typeof draft === "object" ? structuredClone(draft) : { products: [] };
  const bySku = new Map();
  for (const edit of Array.isArray(edits) ? edits : []) {
    if (!edit || typeof edit.sku !== "string") continue;
    bySku.set(edit.sku, edit.movable === true);
  }
  const products = Array.isArray(next.products) ? next.products : [];
  for (const product of products) {
    if (!product || !bySku.has(product.sku)) continue;
    product.movable = bySku.get(product.sku);
  }
  return next;
}

export { movableOf, physicsRows, movableEdits, draftWithMovable };
