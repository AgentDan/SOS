import { isBlank, isMissing, validateEnvelopeFields } from "./envelope.js";

function validateCatalogDraft(catalog, errors) {
  validateEnvelopeFields(catalog, "catalog", errors);

  if (!catalog || typeof catalog !== "object") {
    errors.push("catalog: missing catalog object");
    return;
  }

  const draft = catalog.draft;
  if (!draft || typeof draft !== "object") {
    errors.push("catalog: missing \"draft\" object");
    return;
  }

  const types = Array.isArray(draft.types) ? draft.types : null;
  const products = Array.isArray(draft.products) ? draft.products : null;

  if (!types) errors.push("catalog: missing \"types\" array");
  if (!products) errors.push("catalog: missing \"products\" array");

  const typeIds = new Set();
  if (types) {
    const seenTypeIds = new Set();
    for (const type of types) {
      const label = type && type.id ? type.id : "<unknown type>";

      if (isMissing(type, "id")) {
        errors.push(`catalog: type "${label}" is missing required field "id"`);
      } else if (seenTypeIds.has(type.id)) {
        errors.push(`catalog: duplicate type id "${type.id}"`);
      } else {
        seenTypeIds.add(type.id);
        typeIds.add(type.id);
      }

      if (isMissing(type, "label")) {
        errors.push(`catalog: type "${label}" is missing required field "label"`);
      }

      if (!type || typeof type.canBeHost !== "boolean") {
        errors.push(`catalog: type "${label}" is missing required field "canBeHost"`);
      }

      if (type && (type.maxOnScene === undefined || type.maxOnScene === null || type.maxOnScene === "")) {
        errors.push(`catalog: type "${label}" is missing required field "maxOnScene"`);
      }
    }

    for (const type of types) {
      if (!type || !Array.isArray(type.canHostOn)) continue;
      const label = type.id ? type.id : "<unknown type>";
      for (const hostTypeId of type.canHostOn) {
        if (!typeIds.has(hostTypeId)) {
          errors.push(
            `catalog: type "${label}" canHostOn references unknown type "${hostTypeId}"`
          );
        }
      }
    }
  }

  const seenSkus = new Set();
  const hostBySku = new Map();

  if (products) {
    for (const product of products) {
      const label = product && product.sku ? product.sku : "<unknown sku>";

      for (const field of ["sku", "type", "priceEur"]) {
        if (isMissing(product, field)) {
          errors.push(`catalog: product "${label}" is missing required field "${field}"`);
        }
      }

      const dimensions = product && product.dimensions;
      if (!dimensions || typeof dimensions !== "object") {
        errors.push(`catalog: product "${label}" is missing required field "dimensions"`);
      } else {
        for (const dim of ["width", "depth", "height"]) {
          const value = dimensions[dim];
          if (typeof value !== "number" || !(value > 0)) {
            errors.push(
              `catalog: product "${label}" dimensions.${dim} must be a positive number`
            );
          }
        }
      }

      if (product && product.sku) {
        if (seenSkus.has(product.sku)) {
          errors.push(`catalog: duplicate sku found: "${product.sku}"`);
        }
        seenSkus.add(product.sku);
      }

      if (product && product.type && typeIds.size > 0 && !typeIds.has(product.type)) {
        errors.push(`catalog: product "${label}" references unknown type "${product.type}"`);
      }

      const model3d = product && product.media && product.media.model3d;
      if (model3d !== undefined && model3d !== null && model3d !== "") {
        if (typeof model3d !== "string" || !model3d.startsWith("/")) {
          errors.push(
            `catalog: product "${label}" media.model3d must be a string starting with "/"`
          );
        }
      }
    }

    for (const product of products) {
      const hostSku = product && product.placement && product.placement.hostSku;
      if (!hostSku) continue;

      const label = product.sku ? product.sku : "<unknown sku>";

      if (hostSku === product.sku) {
        errors.push(`catalog: product "${label}" placement.hostSku refers to itself`);
        continue;
      }

      if (!seenSkus.has(hostSku)) {
        errors.push(
          `catalog: product "${label}" placement.hostSku "${hostSku}" does not exist in catalog`
        );
        continue;
      }

      if (product.sku) {
        hostBySku.set(product.sku, hostSku);
      }
    }

    for (const sku of hostBySku.keys()) {
      const visited = new Set();
      let current = sku;
      while (current && hostBySku.has(current)) {
        if (visited.has(current)) {
          errors.push(`catalog: circular placement chain detected involving "${sku}"`);
          break;
        }
        visited.add(current);
        current = hostBySku.get(current);
      }
    }
  }

  const needs = Array.isArray(draft.needs) ? draft.needs : null;
  if (!needs) {
    errors.push("catalog: missing \"needs\" array");
  } else {
    const seenNeedIds = new Set();
    for (const need of needs) {
      const label = need && need.id ? need.id : "<unknown need>";

      if (isMissing(need, "id")) {
        errors.push(`catalog: need "${label}" is missing required field "id"`);
      } else if (seenNeedIds.has(need.id)) {
        errors.push(`catalog: duplicate need id "${need.id}"`);
      } else {
        seenNeedIds.add(need.id);
      }

      const criteria = need && need.criteria;
      if (!criteria || typeof criteria !== "object" || Array.isArray(criteria)) {
        errors.push(`catalog: need "${label}" is missing required field "criteria"`);
      } else if (isMissing(criteria, "type")) {
        errors.push(`catalog: need "${label}" criteria is missing required field "type"`);
      } else if (typeIds.size > 0 && !typeIds.has(criteria.type)) {
        errors.push(
          `catalog: need "${label}" criteria.type references unknown type "${criteria.type}"`
        );
      }
    }
  }

  const fileNames = catalog.skuFileNames;
  if (Array.isArray(fileNames) && products) {
    for (let index = 0; index < products.length; index += 1) {
      const sku = products[index] && products[index].sku;
      if (isBlank(sku)) continue;
      if (fileNames[index] !== `${sku}.json`) {
        errors.push(`catalog: file name must be "${sku}.json"`);
      }
    }
  }
}

function validateInferenceNeeds(questionnaire, catalog, errors) {
  const inference = questionnaire?.draft?.inference;
  if (!Array.isArray(inference)) return;

  const needIds = new Set(
    (catalog?.draft?.needs ?? [])
      .filter((need) => need && !isBlank(need.id))
      .map((need) => need.id)
  );

  for (const rule of inference) {
    if (!rule || isBlank(rule.resultNeed)) continue;
    if (needIds.has(rule.resultNeed)) continue;

    const label = rule.id ? rule.id : "<unknown inference>";
    errors.push(
      `questionnaire: inference "${label}" resultNeed "${rule.resultNeed}" does not exist in catalog.draft.needs`
    );
  }
}

export { validateCatalogDraft, validateInferenceNeeds };
