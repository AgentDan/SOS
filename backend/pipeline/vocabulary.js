function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function catalogProducts(catalog) {
  return catalog?.products ?? catalog?.draft?.products ?? [];
}

function buildVocabulary({ commands, consultant, catalog } = {}) {
  const vocabCommands = [];
  for (const entry of asArray(commands?.commands)) {
    if (!isPlainObject(entry) || typeof entry.action !== "string" || !Array.isArray(entry.words)) {
      continue;
    }
    vocabCommands.push({ action: entry.action, words: [...entry.words] });
  }

  const products = [];
  for (const product of asArray(catalogProducts(catalog))) {
    if (!isPlainObject(product) || typeof product.sku !== "string" || !Array.isArray(product.words)) {
      continue;
    }
    products.push({ sku: product.sku, words: [...product.words] });
  }

  const topicsSrc = isPlainObject(consultant?.topics) ? consultant.topics : {};
  const topics = {
    cheaper: Array.isArray(topicsSrc.cheaper) ? [...topicsSrc.cheaper] : [],
    smalltalk: Array.isArray(topicsSrc.smalltalk) ? [...topicsSrc.smalltalk] : []
  };

  const faq = [];
  for (const entry of asArray(consultant?.faq)) {
    if (!isPlainObject(entry) || typeof entry.id !== "string" || !Array.isArray(entry.words)) {
      continue;
    }
    faq.push({ id: entry.id, words: [...entry.words] });
  }

  return { commands: vocabCommands, products, topics, faq };
}

export { buildVocabulary };
