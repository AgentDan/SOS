import test from "node:test";
import assert from "node:assert/strict";
import {
  addOption,
  addQuestion,
  addScenario,
  inferenceCell,
  inferencesFor,
  inferencesForAnyAnswer,
  moveQuestion,
  needReach,
  nextConfidence,
  phaseGroups,
  removeOption,
  removeQuestion,
  removeScenario,
  renamePhase,
  renameScenario,
  scenarioBlockReason,
  scenarioPick,
  setAppliesTo,
  setDefaultScenario,
  setDependsOn,
  setInference,
  setScenarioPick,
  updateOption,
  updateQuestion,
  usageOfOption,
  usageOfQuestion,
  validateQuestionForm,
  validateScenarioForm
} from "./questionnaire.js";

function snapshot(value) {
  return structuredClone(value);
}

function untouched(before, value) {
  assert.deepEqual(value, before);
}

function sample() {
  return {
    phases: [
      { id: "needs", order: 2, name: "Потребности", note: "phase-note" },
      { id: "situation", order: 1, name: "Ситуация" },
      { id: "confirmation", order: 3, name: "Подтверждение" }
    ],
    scenarios: [
      { id: "home", name: "Дом", tone: "warm" },
      { id: "game", name: "Игра" }
    ],
    questions: [
      {
        id: "q1",
        phase: "situation",
        priority: 10,
        textFallback: "Чем заняты",
        type: "single",
        note: "keep-q",
        options: [
          { id: "a", label: "А", hint: "keep-o" },
          { id: "b", label: "Б" }
        ],
        dependsOn: [],
        appliesToScenarios: ["home"]
      },
      {
        id: "q2",
        phase: "situation",
        priority: 10,
        textFallback: "Второе",
        type: "single",
        options: [{ id: "yes", label: "Да" }],
        dependsOn: [{ questionId: "q1", optionId: "a", extra: true }],
        appliesToScenarios: []
      },
      {
        id: "q3",
        phase: "needs",
        priority: 5,
        textFallback: "Ширина",
        type: "single",
        options: [
          { id: "narrow", label: "Узкий" },
          { id: "wide", label: "Широкий" }
        ],
        dependsOn: [
          { questionId: "q1", optionId: "b" },
          { questionId: "other", optionId: "z" }
        ],
        appliesToScenarios: ["game"]
      },
      {
        id: "q4",
        phase: "needs",
        priority: 9,
        textFallback: "Рост",
        type: "text",
        options: [{ id: "cm", label: "см", heightCm: 175 }],
        dependsOn: [],
        appliesToScenarios: []
      }
    ],
    inference: [
      { id: "inf_a_desk", when: { questionId: "q1", optionId: "a" }, resultNeed: "desk", confidence: "high", note: "keep-i" },
      { id: "inf_a_desk_2", when: { questionId: "q1", optionId: "a" }, resultNeed: "desk", confidence: "low" },
      { id: "inf_any_lamp", when: { questionId: "q1" }, resultNeed: "lamp", confidence: "medium" },
      { id: "inf_wide", when: { questionId: "q3", optionId: "wide" }, resultNeed: "desk", confidence: "high" }
    ],
    scenarioRules: [
      { when: { questionId: "q1", optionId: "a" }, scenario: "game", note: "keep-s" },
      { when: { questionId: "q3", optionId: "wide" }, scenario: "home" }
    ],
    defaultScenario: "home",
    extra: { ok: true }
  };
}

test("phaseGroups sorts phases by order and questions by priority", () => {
  const groups = phaseGroups(sample());
  assert.deepEqual(
    groups.map((group) => group.id),
    ["situation", "needs", "confirmation"]
  );
  assert.deepEqual(
    groups[0].questions.map((question) => question.id),
    ["q1", "q2"]
  );
  assert.deepEqual(
    groups[1].questions.map((question) => question.id),
    ["q4", "q3"]
  );
  assert.equal(groups[1].note, "phase-note");
  assert.equal(groups[2].questions.length, 0);
});

test("phaseGroups keeps array order when priority is equal and ignores garbage", () => {
  const draft = sample();
  draft.questions[0].priority = 4;
  draft.questions[1].priority = 4;
  const situation = phaseGroups(draft).find((group) => group.id === "situation");
  assert.deepEqual(
    situation.questions.map((question) => question.id),
    ["q1", "q2"]
  );
  assert.deepEqual(phaseGroups(null), []);
  assert.deepEqual(phaseGroups({ phases: "no", questions: 1 }), []);
  assert.deepEqual(phaseGroups(undefined), []);
});

test("inferencesFor returns only the chosen answer and inferencesForAnyAnswer the rest", () => {
  const draft = sample();
  assert.deepEqual(
    inferencesFor(draft, "q1", "a").map((rule) => rule.id),
    ["inf_a_desk", "inf_a_desk_2"]
  );
  assert.deepEqual(
    inferencesForAnyAnswer(draft, "q1").map((rule) => rule.id),
    ["inf_any_lamp"]
  );
  assert.deepEqual(inferencesFor(draft, "q1", "missing"), []);
  assert.deepEqual(inferencesFor(null, "q1", "a"), []);
  assert.deepEqual(inferencesForAnyAnswer(draft, ""), []);
  assert.deepEqual(inferencesFor(draft, "q1", null), []);
});

test("inferenceCell reads the first known confidence", () => {
  const draft = sample();
  assert.equal(inferenceCell(draft, "q1", "a", "desk"), "high");
  assert.equal(inferenceCell(draft, "q1", null, "lamp"), "medium");
  assert.equal(inferenceCell(draft, "q1", "b", "desk"), null);
  assert.equal(inferenceCell(null, "q1", "a", "desk"), null);
  assert.equal(inferenceCell(draft, "", "a", "desk"), null);
});

test("nextConfidence walks null, high, medium, low and treats garbage as null", () => {
  assert.equal(nextConfidence(null), "high");
  assert.equal(nextConfidence("high"), "medium");
  assert.equal(nextConfidence("medium"), "low");
  assert.equal(nextConfidence("low"), null);
  assert.equal(nextConfidence("nope"), "high");
  assert.equal(nextConfidence(undefined), "high");
});

test("setInference adds, changes and removes without duplicating a triple", () => {
  const draft = sample();
  const before = snapshot(draft);
  const added = setInference(draft, "q1", "b", "lamp", "high");
  assert.equal(inferenceCell(added, "q1", "b", "lamp"), "high");
  assert.equal(added.inference.at(-1).id, "inf_b_lamp");
  const again = setInference(added, "q1", "b", "lamp", "medium");
  assert.equal(again.inference.filter((rule) => rule.when.optionId === "b" && rule.resultNeed === "lamp").length, 1);
  assert.equal(inferenceCell(again, "q1", "b", "lamp"), "medium");
  const cleared = setInference(again, "q1", "b", "lamp", null);
  assert.equal(inferenceCell(cleared, "q1", "b", "lamp"), null);
  assert.equal(setInference(cleared, "q1", "b", "lamp", null), cleared);
  untouched(before, draft);
});

test("setInference updates every rule of the triple and keeps unknown fields", () => {
  const draft = sample();
  const before = snapshot(draft);
  const next = setInference(draft, "q1", "a", "desk", "medium");
  const rules = next.inference.filter((rule) => rule.resultNeed === "desk" && rule.when.optionId === "a");
  assert.equal(rules.length, 2);
  assert.deepEqual(
    rules.map((rule) => rule.confidence),
    ["medium", "medium"]
  );
  assert.equal(rules[0].note, "keep-i");
  assert.equal(rules[0].id, "inf_a_desk");
  assert.equal(setInference(next, "q1", "a", "desk", "medium"), next);
  const gone = setInference(next, "q1", "a", "desk", null);
  assert.equal(gone.inference.some((rule) => rule.id === "inf_a_desk" || rule.id === "inf_a_desk_2"), false);
  assert.equal(gone.inference.some((rule) => rule.id === "inf_any_lamp"), true);
  untouched(before, draft);
});

test("setInference adds a suffix when the id is taken and supports any answer", () => {
  const draft = sample();
  draft.inference.push({ id: "inf_b_lamp", when: { questionId: "q3", optionId: "narrow" }, resultNeed: "lamp", confidence: "low" });
  const next = setInference(draft, "q1", "b", "lamp", "high");
  assert.equal(next.inference.at(-1).id, "inf_b_lamp_2");
  const any = setInference(draft, "q3", null, "lamp", "low");
  const rule = any.inference.at(-1);
  assert.equal(rule.id, "inf_any_lamp_2");
  assert.deepEqual(rule.when, { questionId: "q3" });
  assert.equal(setInference(draft, "", "a", "desk", "high"), draft);
  assert.equal(setInference(draft, "q1", "a", "desk", "huge"), draft);
  assert.equal(setInference(null, "q1", "a", "desk", "high"), null);
  assert.equal(setInference({ inference: "no" }, "q1", "a", "desk", "high").inference, "no");
});

test("needReach counts rules per need and keeps zeros", () => {
  const reach = needReach(sample(), [{ id: "desk", name: "Стол" }, { id: "lamp" }, { id: "none" }, null, "bad"]);
  assert.deepEqual(reach, [
    { id: "desk", count: 3 },
    { id: "lamp", count: 1 },
    { id: "none", count: 0 }
  ]);
  assert.deepEqual(needReach(null, null), []);
  assert.deepEqual(needReach(sample(), "needs"), []);
});

test("moveQuestion swaps two distinct priorities inside the phase", () => {
  const draft = sample();
  const before = snapshot(draft);
  const next = moveQuestion(draft, "q3", "up");
  const needs = next.questions.filter((question) => question.phase === "needs");
  assert.equal(needs.find((question) => question.id === "q3").priority, 9);
  assert.equal(needs.find((question) => question.id === "q4").priority, 5);
  assert.equal(next.questions.find((question) => question.id === "q1").priority, 10);
  assert.equal(next.questions.find((question) => question.id === "q3").note, undefined);
  assert.deepEqual(
    phaseGroups(next).find((group) => group.id === "needs").questions.map((question) => question.id),
    ["q3", "q4"]
  );
  assert.equal(moveQuestion(draft, "q4", "up"), draft);
  assert.equal(moveQuestion(draft, "q3", "down"), draft);
  untouched(before, draft);
});

test("moveQuestion renumbers the whole phase when priorities tie", () => {
  const draft = sample();
  const before = snapshot(draft);
  const next = moveQuestion(draft, "q2", "up");
  const situation = next.questions.filter((question) => question.phase === "situation");
  assert.equal(situation.find((question) => question.id === "q2").priority, 20);
  assert.equal(situation.find((question) => question.id === "q1").priority, 10);
  assert.equal(situation.find((question) => question.id === "q1").note, "keep-q");
  assert.equal(next.questions.find((question) => question.id === "q4").priority, 9);
  assert.deepEqual(
    phaseGroups(next).find((group) => group.id === "situation").questions.map((question) => question.id),
    ["q2", "q1"]
  );
  assert.equal(moveQuestion(draft, "q1", "up"), draft);
  assert.equal(moveQuestion(draft, "q2", "sideways"), draft);
  assert.equal(moveQuestion(draft, "missing", "down"), draft);
  assert.equal(moveQuestion(null, "q1", "up"), null);
  untouched(before, draft);
});

test("usageOfQuestion and usageOfOption list inference, scenario rules and other questions", () => {
  const draft = sample();
  assert.deepEqual(usageOfQuestion(draft, "q1"), {
    inference: { count: 3, ids: ["inf_a_desk", "inf_a_desk_2", "inf_any_lamp"] },
    scenarioRules: { count: 1, ids: ["0"] },
    dependsOn: { count: 2, ids: ["q2", "q3"] }
  });
  assert.deepEqual(usageOfOption(draft, "q1", "a"), {
    inference: { count: 2, ids: ["inf_a_desk", "inf_a_desk_2"] },
    scenarioRules: { count: 1, ids: ["0"] },
    dependsOn: { count: 1, ids: ["q2"] }
  });
  assert.deepEqual(usageOfOption(draft, "q1", "missing").inference.count, 0);
  assert.equal(usageOfQuestion(null, "q1").dependsOn.count, 0);
  assert.equal(usageOfQuestion(draft, "").inference.count, 0);
});

test("removeQuestion drops the question and all three kinds of links", () => {
  const draft = sample();
  const before = snapshot(draft);
  const next = removeQuestion(draft, "q1");
  assert.equal(next.questions.some((question) => question.id === "q1"), false);
  assert.deepEqual(
    next.inference.map((rule) => rule.id),
    ["inf_wide"]
  );
  assert.equal(next.scenarioRules.length, 1);
  assert.equal(next.scenarioRules[0].when.questionId, "q3");
  const second = next.questions.find((question) => question.id === "q2");
  assert.deepEqual(second.dependsOn, []);
  const third = next.questions.find((question) => question.id === "q3");
  assert.deepEqual(third.dependsOn, [{ questionId: "other", optionId: "z" }]);
  assert.equal(next.extra.ok, true);
  assert.equal(next.defaultScenario, "home");
  assert.equal(removeQuestion(draft, "missing"), draft);
  untouched(before, draft);
});

test("removeOption drops the answer and its links but keeps the last non-text answer", () => {
  const draft = sample();
  const before = snapshot(draft);
  assert.equal(removeOption(draft, "q2", "yes"), draft);
  const next = removeOption(draft, "q1", "a");
  const question = next.questions.find((item) => item.id === "q1");
  assert.deepEqual(
    question.options.map((option) => option.id),
    ["b"]
  );
  assert.equal(question.note, "keep-q");
  assert.equal(next.inference.some((rule) => rule.id === "inf_a_desk" || rule.id === "inf_a_desk_2"), false);
  assert.equal(next.inference.some((rule) => rule.id === "inf_any_lamp"), true);
  assert.equal(next.scenarioRules.some((rule) => rule.when.optionId === "a"), false);
  assert.deepEqual(next.questions.find((item) => item.id === "q2").dependsOn, []);
  assert.deepEqual(next.questions.find((item) => item.id === "q3").dependsOn, [
    { questionId: "q1", optionId: "b" },
    { questionId: "other", optionId: "z" }
  ]);
  const textQuestion = removeOption(next, "q4", "cm");
  assert.deepEqual(textQuestion.questions.find((item) => item.id === "q4").options, []);
  assert.equal(removeOption(draft, "q1", "missing"), draft);
  untouched(before, draft);
});

test("addQuestion appends a single question and refuses an empty answer list", () => {
  const draft = sample();
  const before = snapshot(draft);
  assert.equal(addQuestion(draft, { id: "q9", phase: "situation", textFallback: "Новый" }), draft);
  assert.equal(addQuestion(draft, { id: "q9", phase: "situation", textFallback: "Новый", options: [] }), draft);
  assert.equal(
    addQuestion(draft, { id: "q9", phase: "situation", textFallback: "Новый", options: [{ id: "", label: "А" }] }),
    draft
  );
  const next = addQuestion(draft, {
    id: " q9 ",
    phase: "situation",
    textFallback: " Новый ",
    mark: "keep",
    options: [{ id: "one", label: "Один", hint: "opt" }]
  });
  const question = next.questions.at(-1);
  assert.equal(question.id, "q9");
  assert.equal(question.type, "single");
  assert.equal(question.priority, 9);
  assert.deepEqual(question.dependsOn, []);
  assert.deepEqual(question.appliesToScenarios, []);
  assert.equal(question.mark, "keep");
  assert.equal(question.options[0].hint, "opt");
  assert.equal(question.textFallback, "Новый");
  const emptyPhase = addQuestion(draft, {
    id: "q8",
    phase: "confirmation",
    textFallback: "Там пусто",
    options: [{ id: "one", label: "Один" }]
  });
  assert.equal(emptyPhase.questions.at(-1).priority, 10);
  assert.equal(addQuestion(draft, { id: "q1", phase: "situation", textFallback: "Есть", options: [{ id: "a", label: "А" }] }), draft);
  untouched(before, draft);
});

test("updateQuestion and updateOption keep ids and unknown fields", () => {
  const draft = sample();
  const before = snapshot(draft);
  const renamed = updateQuestion(draft, "q1", { textFallback: "Другой", id: "nope", phase: "needs" });
  const question = renamed.questions.find((item) => item.id === "q1");
  assert.equal(question.textFallback, "Другой");
  assert.equal(question.phase, "needs");
  assert.equal(question.note, "keep-q");
  assert.equal(updateQuestion(renamed, "q1", { textFallback: "Другой" }), renamed);
  const option = updateOption(draft, "q1", "a", { label: "Новая", id: "z", heightCm: 180 });
  const stored = option.questions.find((item) => item.id === "q1").options[0];
  assert.equal(stored.id, "a");
  assert.equal(stored.label, "Новая");
  assert.equal(stored.heightCm, 180);
  assert.equal(stored.hint, "keep-o");
  const cleared = updateOption(option, "q1", "a", { heightCm: undefined });
  assert.equal(Object.hasOwn(cleared.questions[0].options[0], "heightCm"), false);
  assert.equal(cleared.questions[0].options[0].hint, "keep-o");
  assert.equal(updateQuestion(draft, "missing", { textFallback: "x" }), draft);
  assert.equal(updateOption(null, "q1", "a", { label: "x" }), null);
  untouched(before, draft);
});

test("addOption appends an answer and refuses a duplicate id", () => {
  const draft = sample();
  const before = snapshot(draft);
  const next = addOption(draft, "q2", { id: "no", label: "Нет", hint: "n" });
  assert.equal(next.questions.find((item) => item.id === "q2").options[1].hint, "n");
  assert.equal(addOption(draft, "q2", { id: "yes", label: "Ещё" }), draft);
  assert.equal(addOption(draft, "q2", { id: "", label: "Нет" }), draft);
  assert.equal(addOption(draft, "missing", { id: "no", label: "Нет" }), draft);
  untouched(before, draft);
});

test("setDependsOn and setAppliesTo replace lists and keep the rest", () => {
  const draft = sample();
  const before = snapshot(draft);
  const depends = setDependsOn(draft, "q2", [{ questionId: "q3", optionId: "wide" }]);
  assert.deepEqual(depends.questions.find((item) => item.id === "q2").dependsOn, [{ questionId: "q3", optionId: "wide" }]);
  assert.equal(setDependsOn(depends, "q2", [{ questionId: "q3", optionId: "wide" }]), depends);
  assert.equal(setDependsOn(draft, "q2", "no"), draft);
  const applied = setAppliesTo(draft, "q1", ["game", "home", 4]);
  assert.deepEqual(applied.questions.find((item) => item.id === "q1").appliesToScenarios, ["game", "home"]);
  assert.equal(applied.questions.find((item) => item.id === "q1").note, "keep-q");
  assert.equal(setAppliesTo(draft, "missing", []), draft);
  untouched(before, draft);
});

test("scenarioPick and setScenarioPick create, replace and delete a rule", () => {
  const draft = sample();
  const before = snapshot(draft);
  assert.equal(scenarioPick(draft, "q1", "a"), "game");
  assert.equal(scenarioPick(draft, "q1", "b"), null);
  assert.equal(scenarioPick(null, "q1", "a"), null);
  const replaced = setScenarioPick(draft, "q1", "a", "home");
  assert.equal(replaced.scenarioRules[0].scenario, "home");
  assert.equal(replaced.scenarioRules[0].note, "keep-s");
  assert.equal(scenarioPick(replaced, "q1", "a"), "home");
  const created = setScenarioPick(draft, "q1", "b", "game");
  assert.deepEqual(created.scenarioRules.at(-1), { when: { questionId: "q1", optionId: "b" }, scenario: "game" });
  const removed = setScenarioPick(created, "q1", "a", null);
  assert.equal(scenarioPick(removed, "q1", "a"), null);
  assert.equal(scenarioPick(removed, "q1", "b"), "game");
  assert.equal(setScenarioPick(removed, "q1", "a", null), removed);
  assert.equal(setScenarioPick(draft, "q1", "", "home"), draft);
  untouched(before, draft);
});

test("setScenarioPick rewrites every rule of the same answer", () => {
  const draft = sample();
  draft.scenarioRules.push({ when: { questionId: "q1", optionId: "a" }, scenario: "home" });
  const next = setScenarioPick(draft, "q1", "a", "game");
  const rules = next.scenarioRules.filter((rule) => rule.when.optionId === "a" && rule.when.questionId === "q1");
  assert.deepEqual(
    rules.map((rule) => rule.scenario),
    ["game", "game"]
  );
});

test("scenarios can be added, renamed and removed only when unused", () => {
  const draft = sample();
  const before = snapshot(draft);
  assert.equal(
    scenarioBlockReason(draft, "home"),
    "это сценарий по умолчанию; есть правила выбора этого сценария; вопросы показываются только в этом сценарии"
  );
  assert.equal(scenarioBlockReason(draft, "game"), "есть правила выбора этого сценария; вопросы показываются только в этом сценарии");
  assert.equal(removeScenario(draft, "home"), draft);
  assert.equal(removeScenario(draft, "game"), draft);
  const added = addScenario(draft, { id: " spare ", name: " Запас ", hue: "blue" });
  assert.equal(added.scenarios.at(-1).id, "spare");
  assert.equal(added.scenarios.at(-1).hue, "blue");
  assert.equal(scenarioBlockReason(added, "spare"), null);
  const renamed = renameScenario(added, "spare", "Запасной");
  assert.equal(renamed.scenarios.at(-1).name, "Запасной");
  assert.equal(renamed.scenarios.at(-1).id, "spare");
  const removed = removeScenario(renamed, "spare");
  assert.equal(removed.scenarios.some((item) => item.id === "spare"), false);
  assert.equal(addScenario(draft, { id: "home", name: "Ещё" }), draft);
  assert.equal(addScenario(draft, { id: "", name: "Пусто" }), draft);
  assert.equal(renameScenario(draft, "missing", "Нет"), draft);
  const switched = setDefaultScenario(draft, "game");
  assert.equal(switched.defaultScenario, "game");
  assert.equal(switched.scenarios[0].tone, "warm");
  assert.equal(setDefaultScenario(draft, "missing"), draft);
  assert.equal(setDefaultScenario(switched, "game"), switched);
  untouched(before, draft);
});

test("renamePhase changes only the name", () => {
  const draft = sample();
  const before = snapshot(draft);
  const next = renamePhase(draft, "situation", "Обстановка");
  const phase = next.phases.find((item) => item.id === "situation");
  assert.equal(phase.name, "Обстановка");
  assert.equal(phase.order, 1);
  assert.equal(renamePhase(next, "situation", "Обстановка"), next);
  assert.equal(renamePhase(draft, "situation", 5), draft);
  assert.equal(renamePhase(draft, "missing", "Нет"), draft);
  assert.equal(renamePhase(null, "situation", "Нет"), null);
  untouched(before, draft);
});

test("validateQuestionForm checks id, text, answers and height", () => {
  const errors = validateQuestionForm(
    {
      id: "Вопрос",
      phase: "",
      textFallback: "  ",
      type: "single",
      options: [
        { id: "", label: "" },
        { id: "same", label: "Один", heightCm: 90 },
        { id: "same", label: "Два", heightCm: "175.5" },
        { id: "ok", label: "Три", heightCm: 250 }
      ]
    },
    { existingIds: ["q1"], isNew: true }
  );
  assert.equal(errors.id, "Только латиница, цифры, _ и -");
  assert.equal(errors.phase, "Выберите фазу");
  assert.equal(errors.textFallback, "Укажите текст вопроса");
  assert.equal(errors["options.0.id"], "Укажите идентификатор ответа");
  assert.equal(errors["options.0.label"], "Укажите подпись");
  assert.equal(errors["options.1.heightCm"], "Нужно целое число от 100 до 250");
  assert.equal(errors["options.2.id"], "Такой ответ уже есть");
  assert.equal(errors["options.2.heightCm"], "Нужно целое число от 100 до 250");
  assert.equal(errors["options.3.heightCm"], undefined);
  const taken = validateQuestionForm(
    { id: "q1", phase: "situation", textFallback: "Текст", type: "single", options: [{ id: "a", label: "А" }] },
    { existingIds: ["q1"], isNew: true }
  );
  assert.equal(taken.id, "Такой идентификатор уже есть");
  const own = validateQuestionForm(
    { id: "q1", phase: "situation", textFallback: "Текст", type: "single", options: [{ id: "a", label: "А" }] },
    { existingIds: ["q1"], isNew: false }
  );
  assert.deepEqual(own, {});
  const empty = validateQuestionForm({ id: "q9", phase: "situation", textFallback: "Текст", type: "single", options: [] }, { isNew: true });
  assert.equal(empty.options, "Добавьте хотя бы один ответ");
  const textType = validateQuestionForm({ id: "q9", phase: "situation", textFallback: "Текст", type: "text", options: [] }, { isNew: true });
  assert.deepEqual(textType, {});
  const blankId = validateQuestionForm({ id: " ", phase: "situation", textFallback: "Текст", options: [{ id: "a", label: "А" }] }, {});
  assert.equal(blankId.id, "Укажите идентификатор");
});

test("validateQuestionForm and validateScenarioForm tolerate garbage", () => {
  assert.equal(validateQuestionForm(null, null).textFallback, "Укажите текст вопроса");
  assert.equal(validateQuestionForm(undefined, { existingIds: "no", isNew: true }).id, "Укажите идентификатор");
  const scenario = validateScenarioForm({ id: "Дом", name: " " }, { existingIds: ["home"] });
  assert.equal(scenario.id, "Только латиница, цифры, _ и -");
  assert.equal(scenario.name, "Укажите название");
  assert.deepEqual(validateScenarioForm({ id: "spare", name: "Запас" }, { existingIds: ["home"] }), {});
  assert.equal(validateScenarioForm(null, null).id, "Укажите идентификатор");
});
