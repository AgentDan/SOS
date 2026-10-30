const SCENE_NAMES = ["Домашний офис", "Игровая станция", "Учёба", "Творчество", "Гостиная", "Офис", "Мастерская"];
const QUESTION_THEMES = [
  "Чем вы занимаетесь за столом",
  "Какой у вас рост",
  "Какой рукой вы работаете",
  "Насколько широкий стол нужен",
  "Бывает ли боль в спине",
  "Сколько часов вы сидите",
  "Нужен ли второй монитор",
  "Играете ли вечером",
  "Нужна ли подсветка",
  "Где стоит стол"
];
const ANSWERS = ["Да", "Нет", "Иногда", "Не уверен", "Правой рукой", "Левой рукой", "Широкий", "Компактный", "Выше", "Ниже"];
const TYPE_CATALOG = [
  ["monitor", "Монитор", "монитор", "MON"],
  ["desk", "Стол", "стол", "DSK"],
  ["chair", "Кресло", "кресло", "CHR"],
  ["keyboard", "Клавиатура", "клавиатура", "KB"],
  ["mouse", "Мышь", "мышь", "MS"],
  ["speaker", "Колонки", "колонки", "SPK"],
  ["lamp", "Лампа", "лампа", "LMP"],
  ["stand", "Подставка", "подставка", "STD"],
  ["hub", "Хаб", "хаб", "HUB"],
  ["mat", "Коврик", "коврик", "MAT"]
];
const CONFIDENCE = ["high", "medium", "low"];

function countOf(value, fallback) {
  const number = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback;
  return number < 0 ? 0 : number;
}

function optionRange(value) {
  const list = Array.isArray(value) && value.length > 0 ? value : [3, 5];
  const minRaw = typeof list[0] === "number" && Number.isFinite(list[0]) ? Math.trunc(list[0]) : 3;
  const maxRaw = list.length > 1 && typeof list[1] === "number" && Number.isFinite(list[1]) ? Math.trunc(list[1]) : minRaw;
  const min = Math.max(1, Math.min(minRaw, maxRaw));
  const max = Math.max(min, Math.max(minRaw, maxRaw));
  return [min, max];
}

function createRandom(seed) {
  let state = typeof seed === "number" && Number.isFinite(seed) ? Math.trunc(Math.abs(seed)) : 1;
  if (state === 0) state = 1;
  return function next() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function pickInt(next, min, max) {
  const span = max - min + 1;
  if (span <= 1) return min;
  return min + Math.floor(next() * span);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makePublished(options, next) {
  const scenarioCount = countOf(options.scenarios, 5);
  const questionCount = countOf(options.questions, 60);
  const needCount = countOf(options.needs, 40);
  const typeCount = countOf(options.types, 25);
  const productCount = countOf(options.products, 500);
  const [minOptions, maxOptions] = optionRange(options.optionsPerQuestion);

  const scenarios = [];
  for (let index = 0; index < scenarioCount; index += 1) {
    scenarios.push({
      id: `scene_${index + 1}`,
      name: SCENE_NAMES[index] || `Сценарий ${index + 1}`
    });
  }

  const types = [];
  for (let index = 0; index < typeCount; index += 1) {
    const empty = typeCount >= 2 && index === typeCount - 1;
    if (empty) {
      types.push({ id: "type_empty", label: "Пустой тип", canBeHost: false, canHostOn: [] });
      continue;
    }
    const base = TYPE_CATALOG[index % TYPE_CATALOG.length];
    const cycle = Math.floor(index / TYPE_CATALOG.length);
    types.push({
      id: cycle === 0 ? base[0] : `${base[0]}_${cycle + 1}`,
      label: cycle === 0 ? base[1] : `${base[1]} ${cycle + 1}`,
      canBeHost: base[0] === "desk",
      canHostOn: [],
      word: base[2],
      prefix: base[3]
    });
  }
  const productTypes = types.filter((type) => type.id !== "type_empty");
  const desk = types.find((type) => type.id === "desk");
  if (desk) {
    for (const type of types) {
      if (type.id === "monitor" || type.id.startsWith("monitor_")) type.canHostOn = [desk.id];
    }
  }

  const questions = [];
  for (let index = 0; index < questionCount; index += 1) {
    const optionCount = pickInt(next, minOptions, maxOptions);
    const optionList = [];
    for (let optionIndex = 0; optionIndex < optionCount; optionIndex += 1) {
      optionList.push({
        id: `a${optionIndex + 1}`,
        label: ANSWERS[optionIndex % ANSWERS.length]
      });
    }
    const scenario = scenarios.length > 0 ? scenarios[index % scenarios.length] : null;
    questions.push({
      id: `q_${index + 1}`,
      phase: index % 3 === 0 ? "situation" : "needs",
      priority: index + 1,
      textFallback: `Вопрос ${index + 1}: ${QUESTION_THEMES[index % QUESTION_THEMES.length]}?`,
      type: "single",
      options: optionList,
      dependsOn: [],
      appliesToScenarios: scenario ? [scenario.id] : []
    });
  }

  const needs = [];
  for (let index = 0; index < needCount; index += 1) {
    const type = productTypes.length > 0 ? productTypes[index % productTypes.length] : null;
    needs.push({
      id: `need_${index + 1}`,
      name: `Потребность ${index + 1}: ${type ? type.label : "без типа"}`,
      criteria: type ? { type: type.id } : { type: "" }
    });
  }
  const noInferNeed = needs.length >= 1 ? needs[needs.length - 1] : null;
  const noProductNeed = needs.length >= 2 ? needs[needs.length - 2] : null;
  if (noProductNeed) {
    if (types.some((type) => type.id === "type_empty")) noProductNeed.criteria = { type: "type_empty" };
    else if (productTypes[0]) noProductNeed.criteria = { type: productTypes[0].id, minWidth: 1000000 };
    noProductNeed.name = `Потребность ${needs.indexOf(noProductNeed) + 1}: без товара`;
  }
  if (noInferNeed && noInferNeed !== noProductNeed) {
    noInferNeed.name = `Потребность ${needs.indexOf(noInferNeed) + 1}: без вывода`;
  }

  const idle = questions.length >= 1 ? questions[questions.length - 1] : null;
  const active = questions.filter((question) => question !== idle);
  const pool = needs.filter((need) => need !== noInferNeed);
  const inference = [];
  for (let index = 0; index < active.length; index += 1) {
    const question = active[index];
    const option = question.options[0];
    const need = pool.length > 0 ? pool[index % pool.length] : null;
    if (!option || !need) continue;
    inference.push({
      id: `inf_${index + 1}`,
      when: { questionId: question.id, optionId: option.id },
      resultNeed: need.id,
      confidence: CONFIDENCE[index % CONFIDENCE.length]
    });
  }

  const scenarioRules = [];
  for (let index = 0; index < scenarios.length; index += 1) {
    const question = active.length > 0 ? active[index % active.length] : null;
    const option = question && question.options[0];
    if (!option) continue;
    scenarioRules.push({
      when: { questionId: question.id, optionId: option.id },
      scenario: scenarios[index].id
    });
  }

  const products = [];
  const leadCount = productCount > 50 && productTypes.length > 1 ? Math.min(55, productCount) : 0;
  for (let index = 0; index < productCount; index += 1) {
    const type =
      productTypes.length === 0
        ? null
        : index < leadCount
          ? productTypes[0]
          : productTypes[(index - leadCount) % productTypes.length];
    const prefix = type && type.prefix ? type.prefix : "SKU";
    const sku = `${prefix}-${String(index + 1).padStart(4, "0")}`;
    const word = type && type.word ? type.word : "товар";
    const width = 480 + pickInt(next, 0, 16) * 80;
    products.push({
      sku,
      type: type ? type.id : "none",
      name: `Товар ${sku}`,
      label: `${word} ${sku}`,
      dimensions: {
        width,
        depth: 180 + (index % 6) * 40,
        height: 80 + (index % 8) * 45
      },
      priceEur: 40 + pickInt(next, 0, 40) * 15,
      movable: true,
      words: [word, "товар", sku.toLowerCase()]
    });
  }

  for (const type of types) {
    delete type.word;
    delete type.prefix;
  }

  return {
    questionnaire: {
      scenarios,
      questions,
      inference,
      scenarioRules,
      defaultScenario: scenarios[0] ? scenarios[0].id : ""
    },
    catalog: {
      types,
      needs,
      products
    }
  };
}

function makeDraft(published) {
  const questionnaire = clone(published.questionnaire);
  const catalog = clone(published.catalog);

  if (questionnaire.questions[0]) questionnaire.questions[0].textFallback += " — правка";
  if (questionnaire.questions[1]) questionnaire.questions[1].textFallback += " — правка";
  if (catalog.needs[0]) catalog.needs[0].name += " — правка";
  if (catalog.products[0]) catalog.products[0].priceEur += 17;
  if (catalog.types[0]) catalog.types[0].label += " — правка";

  if (questionnaire.scenarios.length >= 2) {
    const removed = questionnaire.scenarios.pop();
    for (const question of questionnaire.questions) {
      question.appliesToScenarios = question.appliesToScenarios.filter((id) => id !== removed.id);
    }
    questionnaire.scenarioRules = questionnaire.scenarioRules.filter((rule) => rule.scenario !== removed.id);
    if (questionnaire.defaultScenario === removed.id && questionnaire.scenarios[0]) {
      questionnaire.defaultScenario = questionnaire.scenarios[0].id;
    }
  }
  if (catalog.products.length >= 2) catalog.products.pop();

  const hostType = catalog.types.find((type) => type.id !== "type_empty") || catalog.types[0];
  const hostScenario = questionnaire.scenarios[0];
  if (hostType) {
    catalog.needs.push({
      id: "need_draft_new",
      name: "Новая потребность",
      criteria: { type: hostType.id }
    });
    catalog.products.push({
      sku: "NEW-0001",
      type: hostType.id,
      name: "Товар NEW-0001",
      label: "новый товар",
      dimensions: { width: 800, depth: 240, height: 160 },
      priceEur: 99,
      movable: true,
      words: ["новый", "товар"]
    });
  }
  if (hostScenario) {
    questionnaire.questions.push({
      id: "q_draft_new",
      phase: "situation",
      priority: 1000,
      textFallback: "Вопрос черновика: что добавить?",
      type: "single",
      options: [{ id: "yes", label: "Добавить" }],
      dependsOn: [],
      appliesToScenarios: [hostScenario.id]
    });
    questionnaire.inference.push({
      id: "inf_draft_new",
      when: { questionId: "q_draft_new", optionId: "yes" },
      resultNeed: "need_draft_new",
      confidence: "high"
    });
    questionnaire.scenarioRules.push({
      when: { questionId: "q_draft_new", optionId: "yes" },
      scenario: hostScenario.id
    });
  }

  return { questionnaire, catalog };
}

function makeSampleData(options = {}) {
  const source = options && typeof options === "object" ? options : {};
  const next = createRandom(source.seed === undefined ? 1 : source.seed);
  const published = makePublished(source, next);
  const draft = makeDraft(published);
  return {
    questionnaire: { published: published.questionnaire, draft: draft.questionnaire },
    catalog: { published: published.catalog, draft: draft.catalog }
  };
}

export { makeSampleData };
