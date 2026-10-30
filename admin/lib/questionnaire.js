import { sameJson } from "./edits.js";

const CONFIDENCE = ["high", "medium", "low"];
const ID_RE = /^[A-Za-z0-9_-]+$/;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function copyDraft(draft) {
  return structuredClone(draft);
}

function editableList(draft, key) {
  if (!isRecord(draft)) return null;
  if (!Object.hasOwn(draft, key)) return [];
  return Array.isArray(draft[key]) ? draft[key] : null;
}

function priorityValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function byPriority(questions) {
  return questions
    .map((question, index) => ({ question, index }))
    .sort((left, right) => {
      const lp = priorityValue(left.question && left.question.priority);
      const rp = priorityValue(right.question && right.question.priority);
      const lRank = lp == null ? -Infinity : lp;
      const rRank = rp == null ? -Infinity : rp;
      if (rRank !== lRank) return rRank - lRank;
      return left.index - right.index;
    })
    .map((item) => item.question);
}

function phaseGroups(draft) {
  const phases = asList(draft && draft.phases)
    .map((phase, index) => ({ phase, index }))
    .filter((item) => isRecord(item.phase));
  phases.sort((left, right) => {
    const lo = priorityValue(left.phase.order);
    const ro = priorityValue(right.phase.order);
    const lRank = lo == null ? Infinity : lo;
    const rRank = ro == null ? Infinity : ro;
    if (lRank !== rRank) return lRank - rRank;
    return left.index - right.index;
  });
  const questions = asList(draft && draft.questions).filter((question) => isRecord(question));
  return phases.map(({ phase }) => {
    const inPhase = questions.filter((question) => question.phase === phase.id);
    return { ...structuredClone(phase), questions: byPriority(inPhase) };
  });
}

function whenOf(rule) {
  return rule && isRecord(rule.when) ? rule.when : null;
}

function isAnyAnswer(when) {
  return Boolean(when) && (when.optionId == null || when.optionId === "");
}

function sameOption(when, optionId) {
  if (!when) return false;
  if (optionId == null || optionId === "") return isAnyAnswer(when);
  return when.optionId === optionId;
}

function inferencesFor(draft, questionId, optionId) {
  if (typeof questionId !== "string" || !questionId) return [];
  if (typeof optionId !== "string" || !optionId) return [];
  return asList(draft && draft.inference).filter((rule) => {
    const when = whenOf(rule);
    return Boolean(when) && when.questionId === questionId && when.optionId === optionId;
  });
}

function inferencesForAnyAnswer(draft, questionId) {
  if (typeof questionId !== "string" || !questionId) return [];
  return asList(draft && draft.inference).filter((rule) => {
    const when = whenOf(rule);
    return Boolean(when) && when.questionId === questionId && isAnyAnswer(when);
  });
}

function rulesForTriple(draft, questionId, optionId, needId) {
  return asList(draft && draft.inference).filter((rule) => {
    const when = whenOf(rule);
    return Boolean(when) && when.questionId === questionId && sameOption(when, optionId) && rule.resultNeed === needId;
  });
}

function inferenceCell(draft, questionId, optionId, needId) {
  if (typeof questionId !== "string" || !questionId) return null;
  if (typeof needId !== "string" || !needId) return null;
  if (!(optionId == null || typeof optionId === "string")) return null;
  for (const rule of rulesForTriple(draft, questionId, optionId, needId)) {
    if (CONFIDENCE.includes(rule.confidence)) return rule.confidence;
  }
  return null;
}

function freshInferenceId(rules, optionId, needId) {
  const base = optionId ? `inf_${optionId}_${needId}` : `inf_any_${needId}`;
  const used = new Set(asList(rules).map((rule) => (rule && typeof rule.id === "string" ? rule.id : "")));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

function setInference(draft, questionId, optionId, needId, confidence) {
  if (!isRecord(draft)) return draft;
  if (typeof questionId !== "string" || !questionId) return draft;
  if (!(optionId == null || (typeof optionId === "string" && optionId))) return draft;
  if (optionId === "") return draft;
  if (typeof needId !== "string" || !needId) return draft;
  if (confidence !== null && !CONFIDENCE.includes(confidence)) return draft;
  const inference = editableList(draft, "inference");
  if (inference == null) return draft;
  const matched = rulesForTriple(draft, questionId, optionId, needId);
  if (confidence === null) {
    if (matched.length === 0) return draft;
    const next = copyDraft(draft);
    next.inference = asList(next.inference).filter((rule) => !rulesForTriple({ inference: [rule] }, questionId, optionId, needId).length);
    return next;
  }
  if (matched.length > 0) {
    if (matched.every((rule) => rule.confidence === confidence)) return draft;
    const next = copyDraft(draft);
    for (const rule of rulesForTriple(next, questionId, optionId, needId)) rule.confidence = confidence;
    return next;
  }
  const next = copyDraft(draft);
  const list = asList(next.inference);
  const when = { questionId };
  if (optionId) when.optionId = optionId;
  list.push({
    id: freshInferenceId(list, optionId, needId),
    when,
    resultNeed: needId,
    confidence
  });
  next.inference = list;
  return next;
}

function nextConfidence(current) {
  if (current === "high") return "medium";
  if (current === "medium") return "low";
  if (current === "low") return null;
  return "high";
}

function needReach(draft, needs) {
  const counts = new Map();
  for (const rule of asList(draft && draft.inference)) {
    const id = rule && rule.resultNeed;
    if (typeof id !== "string" || !id) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return asList(needs)
    .filter((need) => isRecord(need))
    .map((need) => ({
      id: typeof need.id === "string" ? need.id : "",
      count: counts.get(need.id) || 0
    }));
}

function moveQuestion(draft, questionId, direction) {
  if (!isRecord(draft) || !Array.isArray(draft.questions)) return draft;
  if (direction !== "up" && direction !== "down") return draft;
  if (typeof questionId !== "string" || !questionId) return draft;
  const current = draft.questions.find((question) => question && question.id === questionId);
  if (!current) return draft;
  const indexed = [];
  draft.questions.forEach((question, index) => {
    if (question && question.phase === current.phase) indexed.push({ id: question.id, priority: question.priority, index });
  });
  indexed.sort((left, right) => {
    const lp = priorityValue(left.priority);
    const rp = priorityValue(right.priority);
    const lRank = lp == null ? -Infinity : lp;
    const rRank = rp == null ? -Infinity : rp;
    if (rRank !== lRank) return rRank - lRank;
    return left.index - right.index;
  });
  const pos = indexed.findIndex((item) => item.id === questionId);
  const target = direction === "up" ? pos - 1 : pos + 1;
  if (pos < 0 || target < 0 || target >= indexed.length) return draft;
  const order = indexed.map((item) => item.id);
  const [moved] = order.splice(pos, 1);
  order.splice(target, 0, moved);
  const numbers = indexed.map((item) => priorityValue(item.priority));
  const distinct = numbers.every((value) => value != null) && new Set(numbers).size === indexed.length;
  const assigned = new Map();
  if (distinct) {
    assigned.set(indexed[pos].id, indexed[target].priority);
    assigned.set(indexed[target].id, indexed[pos].priority);
  } else {
    const count = order.length;
    order.forEach((id, index) => assigned.set(id, 10 * (count - index)));
  }
  const next = copyDraft(draft);
  for (const question of next.questions) {
    if (question && assigned.has(question.id)) question.priority = assigned.get(question.id);
  }
  return next;
}

function refId(rule, index) {
  if (rule && typeof rule.id === "string" && rule.id) return rule.id;
  return String(index);
}

function usagePack(inferenceIds, scenarioIds, dependsIds) {
  return {
    inference: { count: inferenceIds.length, ids: inferenceIds },
    scenarioRules: { count: scenarioIds.length, ids: scenarioIds },
    dependsOn: { count: dependsIds.length, ids: dependsIds }
  };
}

function emptyUsage() {
  return usagePack([], [], []);
}

function usageOfQuestion(draft, id) {
  if (!isRecord(draft) || typeof id !== "string" || !id) return emptyUsage();
  const inferenceIds = [];
  asList(draft.inference).forEach((rule, index) => {
    const when = whenOf(rule);
    if (when && when.questionId === id) inferenceIds.push(refId(rule, index));
  });
  const scenarioIds = [];
  asList(draft.scenarioRules).forEach((rule, index) => {
    const when = whenOf(rule);
    if (when && when.questionId === id) scenarioIds.push(refId(rule, index));
  });
  const dependsIds = [];
  for (const question of asList(draft.questions)) {
    if (!question || question.id === id) continue;
    for (const dep of asList(question.dependsOn)) {
      if (dep && dep.questionId === id && typeof question.id === "string") dependsIds.push(question.id);
    }
  }
  return usagePack(inferenceIds, scenarioIds, dependsIds);
}

function usageOfOption(draft, questionId, optionId) {
  if (!isRecord(draft) || typeof questionId !== "string" || !questionId) return emptyUsage();
  if (typeof optionId !== "string" || !optionId) return emptyUsage();
  const inferenceIds = [];
  asList(draft.inference).forEach((rule, index) => {
    const when = whenOf(rule);
    if (when && when.questionId === questionId && when.optionId === optionId) inferenceIds.push(refId(rule, index));
  });
  const scenarioIds = [];
  asList(draft.scenarioRules).forEach((rule, index) => {
    const when = whenOf(rule);
    if (when && when.questionId === questionId && when.optionId === optionId) scenarioIds.push(refId(rule, index));
  });
  const dependsIds = [];
  for (const question of asList(draft.questions)) {
    if (!question || question.id === questionId) continue;
    for (const dep of asList(question.dependsOn)) {
      if (dep && dep.questionId === questionId && dep.optionId === optionId && typeof question.id === "string") {
        dependsIds.push(question.id);
      }
    }
  }
  return usagePack(inferenceIds, scenarioIds, dependsIds);
}

function withoutQuestionLinks(draft, id) {
  draft.inference = asList(draft.inference).filter((rule) => {
    const when = whenOf(rule);
    return !(when && when.questionId === id);
  });
  draft.scenarioRules = asList(draft.scenarioRules).filter((rule) => {
    const when = whenOf(rule);
    return !(when && when.questionId === id);
  });
  for (const question of asList(draft.questions)) {
    if (!question || !Array.isArray(question.dependsOn)) continue;
    question.dependsOn = question.dependsOn.filter((dep) => !(dep && dep.questionId === id));
  }
}

function removeQuestion(draft, id) {
  if (!isRecord(draft) || !Array.isArray(draft.questions)) return draft;
  if (typeof id !== "string" || !id) return draft;
  if (!draft.questions.some((question) => question && question.id === id)) return draft;
  const next = copyDraft(draft);
  next.questions = asList(next.questions).filter((question) => !(question && question.id === id));
  withoutQuestionLinks(next, id);
  return next;
}

function removeOption(draft, questionId, optionId) {
  if (!isRecord(draft) || !Array.isArray(draft.questions)) return draft;
  if (typeof questionId !== "string" || !questionId) return draft;
  if (typeof optionId !== "string" || !optionId) return draft;
  const question = draft.questions.find((item) => item && item.id === questionId);
  if (!question || !Array.isArray(question.options)) return draft;
  if (!question.options.some((option) => option && option.id === optionId)) return draft;
  if (question.type !== "text" && question.options.length <= 1) return draft;
  const next = copyDraft(draft);
  const target = next.questions.find((item) => item && item.id === questionId);
  target.options = target.options.filter((option) => !(option && option.id === optionId));
  next.inference = asList(next.inference).filter((rule) => {
    const when = whenOf(rule);
    return !(when && when.questionId === questionId && when.optionId === optionId);
  });
  next.scenarioRules = asList(next.scenarioRules).filter((rule) => {
    const when = whenOf(rule);
    return !(when && when.questionId === questionId && when.optionId === optionId);
  });
  for (const item of asList(next.questions)) {
    if (!item || !Array.isArray(item.dependsOn)) continue;
    item.dependsOn = item.dependsOn.filter((dep) => !(dep && dep.questionId === questionId && dep.optionId === optionId));
  }
  return next;
}

function usableOption(option) {
  return isRecord(option) && text(option.id) && text(option.label);
}

function addQuestion(draft, input) {
  if (!isRecord(draft)) return draft;
  const questions = editableList(draft, "questions");
  if (questions == null) return draft;
  if (!isRecord(input)) return draft;
  const id = text(input.id);
  const phase = text(input.phase);
  const textFallback = text(input.textFallback);
  const options = asList(input.options);
  if (!id || !phase || !textFallback) return draft;
  if (!options.some(usableOption)) return draft;
  if (options.some((option) => !usableOption(option))) return draft;
  const optionIds = options.map((option) => text(option.id));
  if (new Set(optionIds).size !== optionIds.length) return draft;
  if (questions.some((question) => question && question.id === id)) return draft;
  const inPhase = questions.filter((question) => question && question.phase === phase);
  const priorities = inPhase.map((question) => priorityValue(question.priority)).filter((value) => value != null);
  const priority = priorities.length === 0 ? 10 : Math.min(...priorities) - 1;
  const next = copyDraft(draft);
  const question = structuredClone(input);
  question.id = id;
  question.phase = phase;
  question.textFallback = textFallback;
  question.type = "single";
  question.priority = priority;
  question.options = options.map((option) => {
    const copy = structuredClone(option);
    copy.id = text(option.id);
    copy.label = text(option.label);
    return copy;
  });
  question.dependsOn = [];
  question.appliesToScenarios = [];
  next.questions = asList(next.questions);
  next.questions.push(question);
  return next;
}

function patchRecord(record, patch, locked) {
  let changed = false;
  for (const [key, value] of Object.entries(patch)) {
    if (locked.has(key)) continue;
    if (value === undefined) {
      if (Object.hasOwn(record, key)) {
        delete record[key];
        changed = true;
      }
      continue;
    }
    const cloned = structuredClone(value);
    if (!sameJson(record[key], cloned)) {
      record[key] = cloned;
      changed = true;
    }
  }
  return changed;
}

function updateQuestion(draft, id, patch) {
  if (!isRecord(draft) || !Array.isArray(draft.questions)) return draft;
  if (typeof id !== "string" || !id || !isRecord(patch)) return draft;
  const index = draft.questions.findIndex((question) => question && question.id === id);
  if (index < 0 || !isRecord(draft.questions[index])) return draft;
  const next = copyDraft(draft);
  const changed = patchRecord(next.questions[index], patch, new Set(["id"]));
  return changed ? next : draft;
}

function addOption(draft, questionId, option) {
  if (!isRecord(draft) || !Array.isArray(draft.questions)) return draft;
  if (typeof questionId !== "string" || !questionId || !usableOption(option)) return draft;
  const question = draft.questions.find((item) => item && item.id === questionId);
  if (!question) return draft;
  const optionId = text(option.id);
  const options = asList(question.options);
  if (options.some((item) => item && item.id === optionId)) return draft;
  const next = copyDraft(draft);
  const target = next.questions.find((item) => item && item.id === questionId);
  const copy = structuredClone(option);
  copy.id = optionId;
  copy.label = text(option.label);
  target.options = asList(target.options);
  target.options.push(copy);
  return next;
}

function updateOption(draft, questionId, optionId, patch) {
  if (!isRecord(draft) || !Array.isArray(draft.questions)) return draft;
  if (typeof questionId !== "string" || !questionId) return draft;
  if (typeof optionId !== "string" || !optionId || !isRecord(patch)) return draft;
  const question = draft.questions.find((item) => item && item.id === questionId);
  if (!question || !Array.isArray(question.options)) return draft;
  const index = question.options.findIndex((option) => option && option.id === optionId);
  if (index < 0 || !isRecord(question.options[index])) return draft;
  const next = copyDraft(draft);
  const target = next.questions.find((item) => item && item.id === questionId);
  const changed = patchRecord(target.options[index], patch, new Set(["id"]));
  return changed ? next : draft;
}

function setDependsOn(draft, id, list) {
  if (!isRecord(draft) || !Array.isArray(draft.questions) || !Array.isArray(list)) return draft;
  if (typeof id !== "string" || !id) return draft;
  const question = draft.questions.find((item) => item && item.id === id);
  if (!question) return draft;
  const dependsOn = structuredClone(list);
  if (sameJson(asList(question.dependsOn), dependsOn)) return draft;
  const next = copyDraft(draft);
  const target = next.questions.find((item) => item && item.id === id);
  target.dependsOn = dependsOn;
  return next;
}

function setAppliesTo(draft, id, scenarioIds) {
  if (!isRecord(draft) || !Array.isArray(draft.questions) || !Array.isArray(scenarioIds)) return draft;
  if (typeof id !== "string" || !id) return draft;
  const question = draft.questions.find((item) => item && item.id === id);
  if (!question) return draft;
  const applies = scenarioIds.filter((item) => typeof item === "string");
  if (sameJson(asList(question.appliesToScenarios), applies)) return draft;
  const next = copyDraft(draft);
  const target = next.questions.find((item) => item && item.id === id);
  target.appliesToScenarios = applies.slice();
  return next;
}

function scenarioPick(draft, questionId, optionId) {
  if (typeof questionId !== "string" || !questionId) return null;
  if (typeof optionId !== "string" || !optionId) return null;
  const rule = asList(draft && draft.scenarioRules).find((item) => {
    const when = whenOf(item);
    return Boolean(when) && when.questionId === questionId && when.optionId === optionId && typeof item.scenario === "string";
  });
  return rule ? rule.scenario : null;
}

function setScenarioPick(draft, questionId, optionId, scenarioId) {
  if (!isRecord(draft)) return draft;
  if (typeof questionId !== "string" || !questionId) return draft;
  if (typeof optionId !== "string" || !optionId) return draft;
  if (!(scenarioId == null || (typeof scenarioId === "string" && scenarioId))) return draft;
  const rules = editableList(draft, "scenarioRules");
  if (rules == null) return draft;
  const matches = rules.filter((rule) => {
    const when = whenOf(rule);
    return Boolean(when) && when.questionId === questionId && when.optionId === optionId;
  });
  if (scenarioId == null || scenarioId === "") {
    if (matches.length === 0) return draft;
    const next = copyDraft(draft);
    next.scenarioRules = asList(next.scenarioRules).filter((rule) => {
      const when = whenOf(rule);
      return !(when && when.questionId === questionId && when.optionId === optionId);
    });
    return next;
  }
  if (matches.length > 0) {
    if (matches.every((rule) => rule.scenario === scenarioId)) return draft;
    const next = copyDraft(draft);
    for (const rule of asList(next.scenarioRules)) {
      const when = whenOf(rule);
      if (when && when.questionId === questionId && when.optionId === optionId) rule.scenario = scenarioId;
    }
    return next;
  }
  const next = copyDraft(draft);
  const list = asList(next.scenarioRules);
  list.push({ when: { questionId, optionId }, scenario: scenarioId });
  next.scenarioRules = list;
  return next;
}

function scenarioUsed(draft, id) {
  if (draft.defaultScenario === id) return true;
  if (asList(draft.scenarioRules).some((rule) => rule && rule.scenario === id)) return true;
  return asList(draft.questions).some((question) => question && asList(question.appliesToScenarios).includes(id));
}

function scenarioBlockReason(draft, scenarioId) {
  if (!isRecord(draft) || typeof scenarioId !== "string" || !scenarioId) return null;
  const reasons = [];
  if (draft.defaultScenario === scenarioId) reasons.push("это сценарий по умолчанию");
  if (asList(draft.scenarioRules).some((rule) => rule && rule.scenario === scenarioId)) {
    reasons.push("есть правила выбора этого сценария");
  }
  if (asList(draft.questions).some((question) => question && asList(question.appliesToScenarios).includes(scenarioId))) {
    reasons.push("вопросы показываются только в этом сценарии");
  }
  if (reasons.length === 0) return null;
  return reasons.join("; ");
}

function addScenario(draft, scenario) {
  if (!isRecord(draft) || !isRecord(scenario)) return draft;
  const scenarios = editableList(draft, "scenarios");
  if (scenarios == null) return draft;
  const id = text(scenario.id);
  const name = text(scenario.name);
  if (!id || !name) return draft;
  if (scenarios.some((item) => item && item.id === id)) return draft;
  const next = copyDraft(draft);
  const copy = structuredClone(scenario);
  copy.id = id;
  copy.name = name;
  next.scenarios = asList(next.scenarios);
  next.scenarios.push(copy);
  return next;
}

function renameScenario(draft, id, name) {
  if (!isRecord(draft) || !Array.isArray(draft.scenarios)) return draft;
  if (typeof id !== "string" || !id || typeof name !== "string") return draft;
  const scenario = draft.scenarios.find((item) => item && item.id === id);
  if (!scenario || scenario.name === name) return draft;
  const next = copyDraft(draft);
  const target = next.scenarios.find((item) => item && item.id === id);
  target.name = name;
  return next;
}

function removeScenario(draft, id) {
  if (!isRecord(draft) || !Array.isArray(draft.scenarios)) return draft;
  if (typeof id !== "string" || !id) return draft;
  if (!draft.scenarios.some((item) => item && item.id === id)) return draft;
  if (scenarioUsed(draft, id)) return draft;
  const next = copyDraft(draft);
  next.scenarios = next.scenarios.filter((item) => !(item && item.id === id));
  return next;
}

function setDefaultScenario(draft, id) {
  if (!isRecord(draft) || typeof id !== "string" || !id) return draft;
  if (!asList(draft.scenarios).some((item) => item && item.id === id)) return draft;
  if (draft.defaultScenario === id) return draft;
  const next = copyDraft(draft);
  next.defaultScenario = id;
  return next;
}

function renamePhase(draft, id, name) {
  if (!isRecord(draft) || !Array.isArray(draft.phases)) return draft;
  if (typeof id !== "string" || !id || typeof name !== "string") return draft;
  const phase = draft.phases.find((item) => item && item.id === id);
  if (!phase || phase.name === name) return draft;
  const next = copyDraft(draft);
  const target = next.phases.find((item) => item && item.id === id);
  target.name = name;
  target.id = phase.id;
  return next;
}

function idError(value, existingIds) {
  const id = text(value);
  if (!id) return "Укажите идентификатор";
  if (!ID_RE.test(id)) return "Только латиница, цифры, _ и -";
  if (asList(existingIds).includes(id)) return "Такой идентификатор уже есть";
  return "";
}

function heightError(value) {
  if (value == null || value === "") return "";
  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) return "Нужно целое число от 100 до 250";
  const number = Number(raw);
  if (number < 100 || number > 250) return "Нужно целое число от 100 до 250";
  return "";
}

function validateQuestionForm(form, options = {}) {
  const source = isRecord(form) ? form : {};
  const settings = isRecord(options) ? options : {};
  const errors = {};
  const taken = asList(settings.existingIds).filter((item) => typeof item === "string");
  if (!settings.isNew) {
    const own = text(source.id);
    const index = taken.indexOf(own);
    if (index >= 0) taken.splice(index, 1);
  }
  const idMessage = idError(source.id, taken);
  if (idMessage) errors.id = idMessage;
  if (!text(source.phase)) errors.phase = "Выберите фазу";
  if (!text(source.textFallback)) errors.textFallback = "Укажите текст вопроса";
  const type = typeof source.type === "string" && source.type ? source.type : "single";
  const optionList = asList(source.options);
  if (type !== "text" && optionList.length === 0) errors.options = "Добавьте хотя бы один ответ";
  const seen = new Set();
  optionList.forEach((option, index) => {
    const item = isRecord(option) ? option : {};
    const optionId = text(item.id);
    if (!optionId) errors[`options.${index}.id`] = "Укажите идентификатор ответа";
    else if (seen.has(optionId)) errors[`options.${index}.id`] = "Такой ответ уже есть";
    else seen.add(optionId);
    if (!text(item.label)) errors[`options.${index}.label`] = "Укажите подпись";
    if (Object.hasOwn(item, "heightCm")) {
      const height = heightError(item.heightCm);
      if (height) errors[`options.${index}.heightCm`] = height;
    }
  });
  return errors;
}

function validateScenarioForm(form, options = {}) {
  const source = isRecord(form) ? form : {};
  const settings = isRecord(options) ? options : {};
  const errors = {};
  const idMessage = idError(source.id, settings.existingIds);
  if (idMessage) errors.id = idMessage;
  if (!text(source.name)) errors.name = "Укажите название";
  return errors;
}

export {
  phaseGroups,
  inferencesFor,
  inferencesForAnyAnswer,
  inferenceCell,
  setInference,
  nextConfidence,
  needReach,
  moveQuestion,
  usageOfQuestion,
  usageOfOption,
  removeQuestion,
  removeOption,
  addQuestion,
  updateQuestion,
  addOption,
  updateOption,
  setDependsOn,
  setAppliesTo,
  scenarioPick,
  setScenarioPick,
  scenarioBlockReason,
  addScenario,
  renameScenario,
  removeScenario,
  setDefaultScenario,
  renamePhase,
  validateQuestionForm,
  validateScenarioForm
};
