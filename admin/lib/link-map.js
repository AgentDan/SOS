function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function idOf(value) {
  return typeof value === "string" && value.length > 0 ? value : "";
}

function cloneJson(value) {
  if (Array.isArray(value)) {
    const list = [];
    for (const item of value) {
      const next = cloneJson(item);
      if (next !== undefined) list.push(next);
    }
    return list;
  }
  if (isRecord(value)) {
    const out = {};
    for (const key of Object.keys(value)) {
      const next = cloneJson(value[key]);
      if (next !== undefined) out[key] = next;
    }
    return out;
  }
  if (typeof value === "string" || typeof value === "boolean" || value === null) return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function pickLabel(candidates, fallback) {
  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return fallback;
}

function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  if (isRecord(value)) {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) out[key] = ordered(value[key]);
    }
    return out;
  }
  return value === undefined ? null : value;
}

function stamp(data) {
  try {
    return JSON.stringify(ordered(data === undefined ? null : data));
  } catch {
    return "";
  }
}

function linkKey(link) {
  const kind = link && typeof link.kind === "string" ? link.kind : "";
  const from = link && typeof link.from === "string" ? link.from : "";
  const to = link && typeof link.to === "string" ? link.to : "";
  const label = link && typeof link.label === "string" ? link.label : "";
  return `${kind}|${from}|${to}|${label}`;
}

function problem(level, text, nodeId) {
  const item = { level, text };
  if (nodeId) item.nodeId = nodeId;
  return item;
}

function questionData(question) {
  const data = { id: question.id };
  if (typeof question.textFallback === "string") data.textFallback = question.textFallback;
  if (typeof question.phase === "string") data.phase = question.phase;
  if (typeof question.type === "string") data.type = question.type;
  if (typeof question.priority === "number" && Number.isFinite(question.priority)) data.priority = question.priority;
  if (Array.isArray(question.dependsOn)) {
    data.dependsOn = question.dependsOn.map((item) => {
      if (!isRecord(item)) return {};
      const dep = {};
      if (typeof item.questionId === "string") dep.questionId = item.questionId;
      if (typeof item.optionId === "string") dep.optionId = item.optionId;
      return dep;
    });
  }
  return data;
}

function productData(product) {
  const data = { sku: product.sku };
  if (typeof product.type === "string") data.type = product.type;
  if (typeof product.name === "string") data.name = product.name;
  if (typeof product.label === "string") data.label = product.label;
  if (isRecord(product.dimensions)) {
    const dimensions = cloneJson(product.dimensions);
    if (dimensions) data.dimensions = dimensions;
  }
  if (typeof product.priceEur === "number" && Number.isFinite(product.priceEur)) data.priceEur = product.priceEur;
  if (typeof product.movable === "boolean") data.movable = product.movable;
  if (isRecord(product.media) && typeof product.media.model3d === "string") data.model3d = product.media.model3d;
  if (Array.isArray(product.words)) {
    const words = product.words.filter((item) => typeof item === "string" && item.length > 0);
    if (words.length > 0) data.words = words;
  }
  return data;
}

function whenOf(item) {
  return isRecord(item && item.when) ? item.when : {};
}

function named(item, index) {
  if (item && typeof item.id === "string" && item.id.length > 0) return item.id;
  return String(index + 1);
}

function shown(value) {
  return value || "—";
}

const KIND_TITLE = {
  scenario: ["Сценарий", "сценарий"],
  question: ["Вопрос", "вопрос"],
  option: ["Ответ", "ответ"],
  need: ["Потребность", "потребность"],
  type: ["Тип", "тип"],
  product: ["Товар", "товар"]
};

function nodeOf(nodesById, id) {
  if (!(nodesById instanceof Map) || typeof id !== "string") return null;
  return nodesById.get(id) || null;
}

function titleOf(node, id) {
  if (node && typeof node.label === "string" && node.label.trim().length > 0) return node.label;
  if (node && typeof node.key === "string" && node.key.length > 0) return node.key;
  if (typeof id === "string") {
    const cut = id.indexOf(":");
    if (cut >= 0 && cut < id.length - 1) return id.slice(cut + 1);
  }
  return "…";
}

function kindWords(node, id) {
  const kind = node && typeof node.kind === "string" ? node.kind : typeof id === "string" ? id.split(":")[0] : "";
  return KIND_TITLE[kind] || ["Узел", "узел"];
}

function describeLink(link, nodesById) {
  if (!isRecord(link)) return "";
  const from = nodeOf(nodesById, link.from);
  const to = nodeOf(nodesById, link.to);
  const text = `${kindWords(from, link.from)[0]} «${titleOf(from, link.from)}» → ${kindWords(to, link.to)[1]} «${titleOf(to, link.to)}»`;
  if (typeof link.label === "string" && link.label.length > 0) return `${text} (${link.label})`;
  return text;
}

function buildLinkMap(input) {
  const source = isRecord(input) ? input : {};
  const questionnaire = isRecord(source.questionnaire) ? source.questionnaire : {};
  const catalog = isRecord(source.catalog) ? source.catalog : {};

  const listedScenarios = new Set();
  const scenarioNodes = [];
  const scenarioIds = new Set();

  function addScenario(id, record) {
    if (!id || scenarioIds.has(id)) return;
    scenarioIds.add(id);
    const data = record ? { id: record.id } : { id };
    if (record && typeof record.name === "string") data.name = record.name;
    scenarioNodes.push({
      id: `scenario:${id}`,
      kind: "scenario",
      key: id,
      label: pickLabel([data.name, id], id),
      data
    });
  }

  for (const scenario of asArray(questionnaire.scenarios)) {
    if (!isRecord(scenario)) continue;
    const id = idOf(scenario.id);
    if (!id) continue;
    listedScenarios.add(id);
    addScenario(id, scenario);
  }

  const questions = [];
  const questionIds = new Set();
  for (const question of asArray(questionnaire.questions)) {
    if (!isRecord(question)) continue;
    const id = idOf(question.id);
    if (!id || questionIds.has(id)) continue;
    questionIds.add(id);
    questions.push(question);
  }

  for (const question of questions) {
    for (const raw of asArray(question.appliesToScenarios)) addScenario(idOf(raw), null);
  }

  const ruleList = asArray(questionnaire.scenarioRules);
  for (const rule of ruleList) {
    if (!isRecord(rule)) continue;
    addScenario(idOf(rule.scenario), null);
  }

  const defaultScenario = idOf(questionnaire.defaultScenario);
  if (defaultScenario) addScenario(defaultScenario, null);

  const questionNodes = [];
  const optionNodes = [];
  const optionKeys = new Set();
  const optionsByQuestion = new Map();

  for (const question of questions) {
    questionNodes.push({
      id: `question:${question.id}`,
      kind: "question",
      key: question.id,
      label: pickLabel([question.textFallback, question.id], question.id),
      data: questionData(question)
    });
    const optionIds = [];
    const seen = new Set();
    for (const option of asArray(question.options)) {
      if (!isRecord(option)) continue;
      const optionId = idOf(option.id);
      if (!optionId || seen.has(optionId)) continue;
      seen.add(optionId);
      optionIds.push(optionId);
      const key = `${question.id}:${optionId}`;
      optionKeys.add(key);
      const data = cloneJson(option);
      data.questionId = question.id;
      optionNodes.push({
        id: `option:${key}`,
        kind: "option",
        key,
        label: pickLabel([option.label, optionId], optionId),
        data
      });
    }
    optionsByQuestion.set(question.id, optionIds);
  }

  const needRecords = [];
  const needIds = new Set();
  for (const need of asArray(catalog.needs)) {
    if (!isRecord(need)) continue;
    const id = idOf(need.id);
    if (!id || needIds.has(id)) continue;
    needIds.add(id);
    needRecords.push(need);
  }

  const typeRecords = [];
  const typeIds = new Set();
  for (const type of asArray(catalog.types)) {
    if (!isRecord(type)) continue;
    const id = idOf(type.id);
    if (!id || typeIds.has(id)) continue;
    typeIds.add(id);
    typeRecords.push(type);
  }

  const productRecords = [];
  const productIds = new Set();
  for (const product of asArray(catalog.products)) {
    if (!isRecord(product)) continue;
    const sku = idOf(product.sku);
    if (!sku || productIds.has(sku)) continue;
    productIds.add(sku);
    productRecords.push(product);
  }

  const needNodes = needRecords.map((need) => ({
    id: `need:${need.id}`,
    kind: "need",
    key: need.id,
    label: pickLabel([need.name, need.id], need.id),
    data: cloneJson(need)
  }));
  const typeNodes = typeRecords.map((type) => ({
    id: `type:${type.id}`,
    kind: "type",
    key: type.id,
    label: pickLabel([type.label, type.id], type.id),
    data: cloneJson(type)
  }));
  const productNodes = productRecords.map((product) => ({
    id: `product:${product.sku}`,
    kind: "product",
    key: product.sku,
    label: pickLabel([product.label, product.name, product.sku], product.sku),
    data: productData(product)
  }));

  const nodes = [...scenarioNodes, ...questionNodes, ...optionNodes, ...needNodes, ...typeNodes, ...productNodes];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const links = [];
  const seenLinks = new Set();

  function addLink(from, to, kind, label) {
    if (!nodeIds.has(from) || !nodeIds.has(to)) return;
    const key = linkKey({ kind, from, to, label });
    if (seenLinks.has(key)) return;
    seenLinks.add(key);
    links.push({ from, to, kind, label });
  }

  const influenced = new Set();
  const inferred = new Set();
  const matched = new Set();
  const typesWithProducts = new Set();
  const scenariosWithQuestions = new Set();

  for (const question of questions) {
    for (const raw of asArray(question.appliesToScenarios)) {
      const scenarioId = idOf(raw);
      if (!scenarioId) continue;
      const before = links.length;
      addLink(`scenario:${scenarioId}`, `question:${question.id}`, "applies", "");
      if (links.length > before) scenariosWithQuestions.add(scenarioId);
    }
    for (const optionId of optionsByQuestion.get(question.id) || []) {
      addLink(`question:${question.id}`, `option:${question.id}:${optionId}`, "has-option", "");
    }
  }

  const inferenceItems = asArray(questionnaire.inference).filter(isRecord);
  for (const item of inferenceItems) {
    const when = whenOf(item);
    const questionId = idOf(when.questionId);
    const optionId = idOf(when.optionId);
    const needId = idOf(item.resultNeed);
    if (questionId && optionId) influenced.add(`${questionId}:${optionId}`);
    if (needId) inferred.add(needId);
    if (!questionId || !optionId || !needId) continue;
    if (!optionKeys.has(`${questionId}:${optionId}`) || !needIds.has(needId)) continue;
    const confidence = typeof item.confidence === "string" ? item.confidence : "";
    addLink(`option:${questionId}:${optionId}`, `need:${needId}`, "infers", confidence);
  }

  const ruleItems = [];
  for (let index = 0; index < ruleList.length; index += 1) {
    if (isRecord(ruleList[index])) ruleItems.push({ rule: ruleList[index], index });
  }
  for (const { rule } of ruleItems) {
    const when = whenOf(rule);
    const questionId = idOf(when.questionId);
    const optionId = idOf(when.optionId);
    const scenarioId = idOf(rule.scenario);
    if (questionId && optionId) influenced.add(`${questionId}:${optionId}`);
    if (!questionId || !optionId || !scenarioId) continue;
    if (!optionKeys.has(`${questionId}:${optionId}`)) continue;
    addLink(`option:${questionId}:${optionId}`, `scenario:${scenarioId}`, "picks-scenario", "");
  }

  const firstRule = isRecord(ruleList[0]) ? ruleList[0] : null;
  if (defaultScenario && firstRule) {
    const questionId = idOf(whenOf(firstRule).questionId);
    if (questionId) addLink(`question:${questionId}`, `scenario:${defaultScenario}`, "default-scenario", "по умолчанию");
  }

  function widthOk(criteria, product) {
    if (typeof criteria.minWidth !== "number" || !Number.isFinite(criteria.minWidth)) return true;
    const width = isRecord(product.dimensions) ? product.dimensions.width : undefined;
    return typeof width === "number" && Number.isFinite(width) && width >= criteria.minWidth;
  }

  for (const need of needRecords) {
    const criteria = isRecord(need.criteria) ? need.criteria : null;
    const typeId = criteria ? idOf(criteria.type) : "";
    if (typeId && typeIds.has(typeId)) addLink(`need:${need.id}`, `type:${typeId}`, "needs-type", "");
    if (!typeId) continue;
    for (const product of productRecords) {
      if (idOf(product.type) !== typeId) continue;
      if (!criteria || !widthOk(criteria, product)) continue;
      addLink(`need:${need.id}`, `product:${product.sku}`, "matches", "");
      matched.add(need.id);
    }
  }

  for (const type of typeRecords) {
    for (const product of productRecords) {
      if (idOf(product.type) !== type.id) continue;
      addLink(`type:${type.id}`, `product:${product.sku}`, "is-type", "");
      typesWithProducts.add(type.id);
    }
  }

  for (const type of typeRecords) {
    for (const host of asArray(type.canHostOn)) {
      const hostId = idOf(host);
      if (!hostId || !typeIds.has(hostId)) continue;
      addLink(`type:${type.id}`, `type:${hostId}`, "hosts-on", "ставится на");
    }
  }

  const problems = [];

  inferenceItems.forEach((item, index) => {
    const when = whenOf(item);
    const questionId = idOf(when.questionId);
    const optionId = idOf(when.optionId);
    const needId = idOf(item.resultNeed);
    const name = named(item, index);
    const questionKnown = Boolean(questionId && questionIds.has(questionId));
    const optionKnown = Boolean(questionKnown && optionId && optionKeys.has(`${questionId}:${optionId}`));
    if (!questionKnown) {
      problems.push(problem("error", `Вывод «${name}» ссылается на несуществующий вопрос «${shown(questionId)}»`));
    }
    if (!optionKnown) {
      problems.push(
        problem(
          "error",
          `Вывод «${name}» ссылается на несуществующий ответ «${shown(questionId)}:${shown(optionId)}»`,
          questionKnown ? `question:${questionId}` : undefined
        )
      );
    }
    if (!needId || !needIds.has(needId)) {
      let nodeId;
      if (optionKnown) nodeId = `option:${questionId}:${optionId}`;
      else if (questionKnown) nodeId = `question:${questionId}`;
      problems.push(problem("error", `Вывод «${name}» ссылается на несуществующую потребность «${shown(needId)}»`, nodeId));
    }
  });

  for (const { rule, index } of ruleItems) {
    const when = whenOf(rule);
    const questionId = idOf(when.questionId);
    const optionId = idOf(when.optionId);
    const scenarioId = idOf(rule.scenario);
    const questionKnown = Boolean(questionId && questionIds.has(questionId));
    const optionKnown = Boolean(questionKnown && optionId && optionKeys.has(`${questionId}:${optionId}`));
    const prefix = `Правило сценария ${index + 1}`;
    if (!questionKnown) {
      problems.push(problem("error", `${prefix} ссылается на несуществующий вопрос «${shown(questionId)}»`));
    }
    if (!optionKnown) {
      problems.push(
        problem(
          "error",
          `${prefix} ссылается на несуществующий ответ «${shown(questionId)}:${shown(optionId)}»`,
          questionKnown ? `question:${questionId}` : undefined
        )
      );
    }
    if (!scenarioId || !listedScenarios.has(scenarioId)) {
      problems.push(
        problem(
          "error",
          `${prefix} ссылается на несуществующий сценарий «${shown(scenarioId)}»`,
          scenarioId ? `scenario:${scenarioId}` : undefined
        )
      );
    }
  }

  if (defaultScenario && !listedScenarios.has(defaultScenario)) {
    problems.push(
      problem(
        "error",
        `Сценарий по умолчанию «${defaultScenario}» не входит в список сценариев`,
        `scenario:${defaultScenario}`
      )
    );
  }

  for (const product of productRecords) {
    const typeId = idOf(product.type);
    if (!typeId || !typeIds.has(typeId)) {
      problems.push(
        problem(
          "error",
          `Товар «${product.sku}» с типом «${shown(typeId)}», которого нет среди типов`,
          `product:${product.sku}`
        )
      );
    }
  }

  for (const need of needRecords) {
    const typeId = isRecord(need.criteria) ? idOf(need.criteria.type) : "";
    if (!typeId || !typeIds.has(typeId)) {
      problems.push(
        problem(
          "error",
          `Потребность «${pickLabel([need.name, need.id], need.id)}» с типом «${shown(typeId)}», которого нет среди типов`,
          `need:${need.id}`
        )
      );
    }
  }

  for (const need of needRecords) {
    const label = pickLabel([need.name, need.id], need.id);
    if (!inferred.has(need.id)) {
      problems.push(problem("warn", `Потребность «${label}» не выводит ни один ответ`, `need:${need.id}`));
    }
    if (!matched.has(need.id)) {
      problems.push(problem("warn", `Под потребность «${label}» не подходит ни один товар`, `need:${need.id}`));
    }
  }

  for (const type of typeRecords) {
    if (typesWithProducts.has(type.id)) continue;
    problems.push(
      problem("warn", `Тип «${pickLabel([type.label, type.id], type.id)}» без товаров`, `type:${type.id}`)
    );
  }

  for (const question of questions) {
    const optionIds = optionsByQuestion.get(question.id) || [];
    const hit = optionIds.some((optionId) => influenced.has(`${question.id}:${optionId}`));
    if (hit) continue;
    problems.push(
      problem(
        "warn",
        `Вопрос «${pickLabel([question.textFallback, question.id], question.id)}»: ни один ответ ни на что не влияет`,
        `question:${question.id}`
      )
    );
  }

  for (const node of scenarioNodes) {
    if (scenariosWithQuestions.has(node.key)) continue;
    problems.push(problem("warn", `Сценарий «${node.label}» без вопросов`, node.id));
  }

  return { nodes, links, problems };
}

function takeNodes(list) {
  const map = new Map();
  for (const node of asArray(list)) {
    if (!isRecord(node) || typeof node.id !== "string" || node.id.length === 0) continue;
    if (!map.has(node.id)) map.set(node.id, node);
  }
  return map;
}

function takeLinks(list) {
  const map = new Map();
  for (const link of asArray(list)) {
    if (!isRecord(link)) continue;
    const key = linkKey(link);
    if (!map.has(key)) map.set(key, link);
  }
  return map;
}

function diffMaps(published, draft) {
  const publishedNodes = takeNodes(published && published.nodes);
  const draftNodes = takeNodes(draft && draft.nodes);
  const publishedLinks = takeLinks(published && published.links);
  const draftLinks = takeLinks(draft && draft.links);

  const nodes = new Map();
  let nodesAdded = 0;
  let nodesRemoved = 0;
  let nodesChanged = 0;
  const nodeIds = new Set([...draftNodes.keys(), ...publishedNodes.keys()]);
  for (const id of nodeIds) {
    const inDraft = draftNodes.has(id);
    const inPublished = publishedNodes.has(id);
    let status = "same";
    if (inDraft && !inPublished) {
      status = "added";
      nodesAdded += 1;
    } else if (inPublished && !inDraft) {
      status = "removed";
      nodesRemoved += 1;
    } else if (stamp(publishedNodes.get(id).data) !== stamp(draftNodes.get(id).data)) {
      status = "changed";
      nodesChanged += 1;
    }
    nodes.set(id, status);
  }

  const links = new Map();
  let linksAdded = 0;
  let linksRemoved = 0;
  const keys = new Set([...draftLinks.keys(), ...publishedLinks.keys()]);
  for (const key of keys) {
    const inDraft = draftLinks.has(key);
    const inPublished = publishedLinks.has(key);
    let status = "same";
    if (inDraft && !inPublished) {
      status = "added";
      linksAdded += 1;
    } else if (inPublished && !inDraft) {
      status = "removed";
      linksRemoved += 1;
    }
    links.set(key, status);
  }

  return {
    nodes,
    links,
    counts: { nodesAdded, nodesRemoved, nodesChanged, linksAdded, linksRemoved }
  };
}

const CHAIN_KINDS = new Set(["applies", "has-option", "infers", "needs-type", "matches", "is-type", "hosts-on"]);
const SCENARIO_LINK_KINDS = new Set(["picks-scenario", "default-scenario"]);

function walk(start, next) {
  const seen = new Set();
  if (typeof start !== "string" || start.length === 0) return seen;
  const stack = [start];
  while (stack.length > 0) {
    const current = stack.pop();
    if (seen.has(current)) continue;
    seen.add(current);
    for (const item of next.get(current) || []) {
      if (typeof item === "string" && item.length > 0) stack.push(item);
    }
  }
  return seen;
}

function chainOf(nodeId, links) {
  const start = typeof nodeId === "string" ? nodeId : "";
  const forward = new Map();
  const backward = new Map();
  for (const link of asArray(links)) {
    if (!isRecord(link) || !CHAIN_KINDS.has(link.kind)) continue;
    if (typeof link.from !== "string" || typeof link.to !== "string") continue;
    if (!forward.has(link.from)) forward.set(link.from, []);
    forward.get(link.from).push(link.to);
    if (!backward.has(link.to)) backward.set(link.to, []);
    backward.get(link.to).push(link.from);
  }
  const down = walk(start, forward);
  const up = walk(start, backward);
  const ids = new Set([...down, ...up]);
  const linkKeys = new Set();
  const selectedScenario = start.startsWith("scenario:") ? start : "";
  for (const link of asArray(links)) {
    if (!isRecord(link) || typeof link.from !== "string" || typeof link.to !== "string") continue;
    const both = ids.has(link.from) && ids.has(link.to);
    const toSelected = Boolean(selectedScenario) && link.to === selectedScenario;
    if (CHAIN_KINDS.has(link.kind)) {
      if (both) linkKeys.add(linkKey(link));
    } else if (SCENARIO_LINK_KINDS.has(link.kind) && (both || toSelected)) {
      linkKeys.add(linkKey(link));
    }
  }
  return { down, up, ids, linkKeys };
}

function onlyHere(scenarioId, nodes, links) {
  const raw = typeof scenarioId === "string" ? scenarioId : "";
  const nodeId = raw.startsWith("scenario:") ? raw : raw ? `scenario:${raw}` : "";
  const scenarios = [];
  for (const node of asArray(nodes)) {
    if (!isRecord(node) || node.kind !== "scenario" || typeof node.id !== "string" || node.id.length === 0) continue;
    if (!scenarios.includes(node.id)) scenarios.push(node.id);
  }
  const mine = chainOf(nodeId, links).ids;
  const others = new Set();
  for (const other of scenarios) {
    if (other === nodeId) continue;
    for (const item of chainOf(other, links).ids) others.add(item);
  }
  const only = new Set();
  for (const item of mine) {
    if (!others.has(item)) only.add(item);
  }
  return only;
}

function fitScale(containerWidth, contentWidth, min, max) {
  const lo = typeof min === "number" && Number.isFinite(min) ? min : 0;
  const hi = typeof max === "number" && Number.isFinite(max) ? max : 1;
  const floor = Math.min(lo, hi);
  const ceil = Math.max(lo, hi);
  const container = typeof containerWidth === "number" ? containerWidth : Number.NaN;
  const content = typeof contentWidth === "number" ? contentWidth : Number.NaN;
  if (!Number.isFinite(container) || !Number.isFinite(content) || container <= 0 || content <= 0) {
    return Math.min(ceil, Math.max(floor, 1));
  }
  return Math.min(ceil, Math.max(floor, container / content));
}

export { buildLinkMap, diffMaps, describeLink, linkKey, chainOf, onlyHere, fitScale };
