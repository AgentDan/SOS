import { cloneElement, isValidElement, useEffect, useId, useMemo, useRef, useState } from "react";
import { getSection, isAbort, saveDraft } from "../api/admin-api.js";
import { sameJson } from "../lib/edits.js";
import { problemLines } from "../lib/messages.js";
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
} from "../lib/questionnaire.js";
import { Banner } from "../components/Banner.jsx";
import { confirmAction } from "../components/confirm.jsx";
import { ErrorBlock } from "../components/ErrorBlock.jsx";
import { Loading } from "../components/Loading.jsx";
import { Btn } from "../ui/Btn.jsx";
import { Card } from "../ui/Card.jsx";
import { Check } from "../ui/Check.jsx";
import { controlClass } from "../ui/control.js";
import { Field } from "../ui/Field.jsx";
import { MultiSelect } from "../ui/MultiSelect.jsx";
import { Pill } from "../ui/Pill.jsx";
import { Segmented } from "../ui/Segmented.jsx";
import { Select } from "../ui/Select.jsx";

const TABS = [
  { id: "questions", text: "Вопросы" },
  { id: "scenarios", text: "Сценарии" },
  { id: "phases", text: "Фазы" }
];

const LEVELS = {
  high: { mark: "●", word: "высокая", tone: "ok" },
  medium: { mark: "◐", word: "средняя", tone: "warn" },
  low: { mark: "○", word: "низкая", tone: "neutral" }
};

const SAVED_TEXT = "Сохранено в черновик. Клиент увидит это после публикации.";
const LINK =
  "text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const CATALOG_WARNING = "Каталог не загрузился: правка вывода недоступна. Остальное работает.";
const JSON_HREF = "#/sections/questionnaire";

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function questionLabel(question) {
  if (!question) return "";
  const text = typeof question.textFallback === "string" ? question.textFallback.trim() : "";
  return text || (typeof question.id === "string" ? question.id : "");
}

function shortText(value, max = 42) {
  const text = typeof value === "string" ? value : "";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function named(items, id) {
  const found = list(items).find((item) => item && item.id === id);
  if (!found) return typeof id === "string" ? id : "";
  const name = typeof found.name === "string" ? found.name.trim() : "";
  return name || (typeof found.id === "string" ? found.id : "");
}

function orderedQuestions(draft) {
  return phaseGroups(draft).flatMap((group) => group.questions);
}

function questionHash(id) {
  if (!id) return "#/questionnaire";
  return `#/questionnaire?q=${encodeURIComponent(id)}`;
}

function lossText(usage) {
  const inference = usage && usage.inference ? usage.inference.count : 0;
  const scenarioRules = usage && usage.scenarioRules ? usage.scenarioRules.count : 0;
  const dependsOn = usage && usage.dependsOn ? usage.dependsOn.count : 0;
  return `Будут удалены: ${inference} правил вывода, ${scenarioRules} правил сценария, ${dependsOn} зависимостей других вопросов.`;
}

function questionToForm(question, heightText) {
  const source = isRecord(question) ? question : {};
  return {
    id: typeof source.id === "string" ? source.id : "",
    phase: typeof source.phase === "string" ? source.phase : "",
    textFallback: typeof source.textFallback === "string" ? source.textFallback : "",
    type: typeof source.type === "string" && source.type ? source.type : "single",
    options: list(source.options).map((option) => {
      const item = isRecord(option) ? option : {};
      const form = {
        id: typeof item.id === "string" ? item.id : "",
        label: typeof item.label === "string" ? item.label : ""
      };
      const key = `${source.id}:${item.id}`;
      if (heightText && Object.hasOwn(heightText, key)) form.heightCm = heightText[key];
      else if (Object.hasOwn(item, "heightCm")) form.heightCm = item.heightCm == null ? "" : String(item.heightCm);
      return form;
    })
  };
}

function blankName(value) {
  return String(value ?? "").trim() === "";
}

function Labeled({ label, error, children }) {
  const errorId = useId();
  const control = isValidElement(children)
    ? cloneElement(children, {
        "aria-invalid": error ? true : undefined,
        "aria-describedby": error ? errorId : children.props["aria-describedby"]
      })
    : children;
  return (
    <div>
      <Field label={label}>{control}</Field>
      {error ? (
        <p id={errorId} className="mt-1 mb-0 text-sm text-bad" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Notice({ notice, working, onLoad }) {
  if (!notice) return null;
  if (notice.kind === "conflict") {
    return (
      <div className="mb-3">
        <Banner kind="warn" text="Раздел уже изменили в другом месте" />
        <Btn disabled={working} onClick={onLoad}>
          Загрузить актуальную версию
        </Btn>
      </div>
    );
  }
  if (notice.kind === "problem") return <ErrorBlock lines={problemLines(notice.status, notice.body)} />;
  if (notice.kind === "saved") {
    return (
      <div className="mb-3">
        <Banner kind="ok" text={SAVED_TEXT} />
        <a className={LINK} href="#/journal">
          Опубликовать
        </a>
      </div>
    );
  }
  if (notice.kind === "ok" || notice.kind === "warn") return <Banner kind={notice.kind} text={notice.text} />;
  return null;
}

function InferenceChips({ rules, questionId, optionId, needs, disabled, onSet }) {
  const seen = [];
  for (const rule of rules) {
    const id = rule && rule.resultNeed;
    if (typeof id === "string" && id && !seen.includes(id)) seen.push(id);
  }
  const available = list(needs).filter((need) => need && typeof need.id === "string" && need.id && !seen.includes(need.id));

  return (
    <div className="flex flex-wrap items-center gap-2">
      {seen.map((needId) => {
        const confidence = inferenceCell({ inference: rules }, questionId, optionId, needId);
        const level = LEVELS[confidence];
        const name = named(needs, needId);
        const word = level ? level.word : "нет вывода";
        return (
          <span key={needId} className="inline-flex items-center gap-1">
            <button
              type="button"
              className="cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
              disabled={disabled}
              aria-label={`${name}: ${word}. Нажмите, чтобы сменить уверенность`}
              onClick={() => onSet(questionId, optionId, needId, nextConfidence(confidence))}
            >
              <Pill tone={level ? level.tone : "neutral"}>{`${name} · ${word}`}</Pill>
            </button>
            <button
              type="button"
              className="cursor-pointer rounded-md px-1 text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
              disabled={disabled}
              aria-label={`Убрать вывод «${name}»`}
              onClick={() => onSet(questionId, optionId, needId, null)}
            >
              ×
            </button>
          </span>
        );
      })}
      {available.length > 0 ? (
        <Select
          className="w-auto"
          value=""
          disabled={disabled}
          aria-label="Добавить потребность"
          onChange={(event) => {
            const needId = event.target.value;
            if (needId) onSet(questionId, optionId, needId, "high");
          }}
        >
          <option value="">+ потребность</option>
          {available.map((need) => (
            <option key={need.id} value={need.id}>
              {named(needs, need.id)}
            </option>
          ))}
        </Select>
      ) : null}
    </div>
  );
}

function Matrix({ draft, needs, questions, grouped, disabled, onCycle }) {
  const reach = useMemo(() => needReach(draft, needs), [draft, needs]);
  const reachById = useMemo(() => new Map(reach.map((item) => [item.id, item.count])), [reach]);
  const cells = useMemo(() => {
    const map = new Map();
    for (const rule of list(draft && draft.inference)) {
      const when = rule && rule.when;
      if (!when || typeof when.optionId !== "string" || !when.optionId) continue;
      if (!LEVELS[rule.confidence]) continue;
      const key = `${when.questionId}\n${when.optionId}\n${rule.resultNeed}`;
      if (!map.has(key)) map.set(key, rule.confidence);
    }
    return map;
  }, [draft]);

  const columns = list(questions).filter((question) => list(question.options).some((option) => option && option.id));
  if (list(needs).length === 0) {
    return <p className="m-0 text-sm text-muted">В каталоге нет потребностей.</p>;
  }
  if (columns.length === 0) {
    return <p className="m-0 text-sm text-muted">Выберите вопрос, чтобы увидеть таблицу.</p>;
  }

  const headerCell = "sticky top-0 z-20 border-b border-line bg-side px-2 py-2 text-left font-medium text-ink";
  const groupCell = "sticky top-0 z-20 h-11 border-b border-line bg-side px-2 py-2 text-left font-medium text-ink";
  const optionCell = grouped
    ? "sticky top-11 z-20 border-b border-line bg-side px-2 py-2 text-left font-medium text-ink"
    : headerCell;

  return (
    <div className="max-h-[70vh] overflow-auto contain-paint">
      <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
        <thead>
          {grouped ? (
            <tr>
              <th className="sticky top-0 left-0 z-30 min-w-52 border-r border-b border-line bg-side px-3 py-2 text-left align-bottom" rowSpan={2}>
                Потребность
              </th>
              {columns.map((question) => (
                <th key={question.id} className={groupCell} colSpan={list(question.options).filter((option) => option && option.id).length}>
                  <span className="block max-w-48 truncate" title={questionLabel(question)}>
                    {shortText(questionLabel(question), 36)}
                  </span>
                </th>
              ))}
            </tr>
          ) : null}
          <tr>
            {grouped ? null : (
              <th className="sticky top-0 left-0 z-30 min-w-52 border-r border-b border-line bg-side px-3 py-2 text-left">
                Потребность
              </th>
            )}
            {columns.flatMap((question) =>
              list(question.options)
                .filter((option) => option && option.id)
                .map((option) => (
                  <th key={`${question.id}:${option.id}`} className={`${optionCell} max-w-36 min-w-16 font-normal`}>
                    <span className="block max-w-36 truncate" title={option.label || option.id}>
                      {option.label || option.id}
                    </span>
                  </th>
                ))
            )}
          </tr>
        </thead>
        <tbody>
          {list(needs)
            .filter((need) => need && typeof need.id === "string" && need.id)
            .map((need) => (
              <tr key={need.id}>
                <th scope="row" className="sticky left-0 z-10 min-w-52 border-r border-b border-line bg-surface px-3 py-2 text-left align-top font-normal">
                  <span className="block font-medium">{named(needs, need.id)}</span>
                  <span className="block font-mono text-xs text-muted">{need.id}</span>
                  {reachById.get(need.id) === 0 ? (
                    <span className="mt-1 block">
                      <Pill tone="warn">ни один ответ не ведёт сюда</Pill>
                    </span>
                  ) : null}
                </th>
                {columns.flatMap((question) =>
                  list(question.options)
                    .filter((option) => option && option.id)
                    .map((option) => {
                      const confidence = cells.get(`${question.id}\n${option.id}\n${need.id}`) || null;
                      const level = confidence ? LEVELS[confidence] : null;
                      const answer = option.label || option.id;
                      const state = level ? level.word : "нет вывода";
                      return (
                        <td key={`${question.id}:${option.id}`} className="border-r border-b border-line p-1 text-center align-middle">
                          <button
                            type="button"
                            className="inline-flex h-9 min-w-24 cursor-pointer items-center justify-center gap-1 rounded-md border border-line bg-surface px-2 text-sm whitespace-nowrap text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={disabled}
                            aria-label={`Потребность ${named(needs, need.id)}, ответ ${answer}: ${state}`}
                            onClick={() => onCycle(question.id, option.id, need.id)}
                          >
                            {level ? (
                              <>
                                <span aria-hidden="true">{level.mark}</span>
                                <span>{level.word}</span>
                              </>
                            ) : (
                              <span className="sr-only">{state}</span>
                            )}
                          </button>
                        </td>
                      );
                    })
                )}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function Questionnaire({ route = {}, onDirty = () => {} }) {
  const selectedId = typeof route.q === "string" ? route.q : "";
  const [tab, setTab] = useState("questions");
  const [phase, setPhase] = useState("loading");
  const [loadError, setLoadError] = useState(null);
  const [catalogWarning, setCatalogWarning] = useState(false);
  const [needs, setNeeds] = useState([]);
  const [draft, setDraft] = useState(null);
  const [loaded, setLoaded] = useState(null);
  const [version, setVersion] = useState(null);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState(null);
  const [query, setQuery] = useState("");
  const [folded, setFolded] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [heightText, setHeightText] = useState({});
  const [creating, setCreating] = useState(false);
  const [newTried, setNewTried] = useState(false);
  const [newForm, setNewForm] = useState({ id: "", phase: "", text: "", optionId: "", optionLabel: "" });
  const [optionForm, setOptionForm] = useState({ id: "", label: "" });
  const [optionTried, setOptionTried] = useState(false);
  const [scenarioForm, setScenarioForm] = useState({ id: "", name: "" });
  const [scenarioTried, setScenarioTried] = useState(false);
  const [ruleForm, setRuleForm] = useState({ questionId: "", optionId: "", scenarioId: "" });

  const aliveRef = useRef(true);
  const workingRef = useRef(false);
  const controllerRef = useRef(null);
  const draftRef = useRef(null);
  const loadedRef = useRef(null);
  const versionRef = useRef(null);

  draftRef.current = draft;
  loadedRef.current = loaded;
  versionRef.current = version;

  const groups = useMemo(() => phaseGroups(draft), [draft]);
  const questions = useMemo(() => groups.flatMap((group) => group.questions), [groups]);
  const questionCount = questions.length;
  const selected = questions.find((question) => question.id === selectedId) || null;
  const selectedPhase = selected ? selected.phase : "";

  const rawDirty = Boolean(draft && loaded) && !sameJson(draft, loaded);
  const dirty = phase === "ready" && (rawDirty || Object.keys(heightText).length > 0);
  const existingIds = questions.map((question) => question.id).filter((id) => typeof id === "string");
  const errorMap = useMemo(() => {
    if (!draft) return {};
    const ids = list(draft.questions)
      .map((question) => question && question.id)
      .filter((id) => typeof id === "string");
    const map = {};
    for (const question of list(draft.questions)) {
      if (!question || typeof question.id !== "string") continue;
      const errors = validateQuestionForm(questionToForm(question, heightText), { existingIds: ids, isNew: false });
      if (Object.keys(errors).length > 0) map[question.id] = errors;
    }
    return map;
  }, [draft, heightText]);
  const namesInvalid =
    list(draft && draft.scenarios).some((item) => item && blankName(item.name)) ||
    list(draft && draft.phases).some((item) => item && blankName(item.name));
  const invalid = Object.keys(errorMap).length > 0 || namesInvalid || Object.keys(heightText).length > 0;
  const canSave = dirty && !invalid && !working;
  const shownErrors = dirty && selected ? errorMap[selected.id] || {} : {};
  const inferenceLocked = catalogWarning || working;

  useEffect(() => {
    if (phase !== "ready") {
      onDirty(false);
      return undefined;
    }
    onDirty(dirty);
    return () => onDirty(false);
  }, [phase, dirty, onDirty]);

  useEffect(() => {
    setOptionForm({ id: "", label: "" });
    setOptionTried(false);
  }, [selectedId]);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    aliveRef.current = true;
    let alive = true;
    const catalogPromise = getSection("catalog", { signal: controller.signal }).then(
      (data) => ({ ok: true, data }),
      (err) => {
        if (isAbort(err) || (err && err.status === 401)) throw err;
        return { ok: false };
      }
    );
    Promise.all([getSection("questionnaire", { signal: controller.signal }), catalogPromise])
      .then(([section, catalog]) => {
        if (!alive) return;
        adopt(section, catalog);
      })
      .catch((err) => {
        if (!alive || isAbort(err) || (err && err.status === 401)) return;
        setLoadError(problemLines(err && err.status, err && err.body));
        setPhase("error");
      });
    return () => {
      alive = false;
      aliveRef.current = false;
      onDirty(false);
      controller.abort();
    };
  }, [onDirty]);

  function adopt(section, catalogResult) {
    const source = section && section.draft;
    if (!isRecord(source)) {
      setLoadError(["В разделе нет данных"]);
      setPhase("error");
      return false;
    }
    const next = structuredClone(source);
    const frozen = structuredClone(source);
    draftRef.current = next;
    loadedRef.current = frozen;
    versionRef.current = section.draftVersion;
    setDraft(next);
    setLoaded(frozen);
    setVersion(section.draftVersion);
    setHeightText({});
    setPhase("ready");
    if (catalogResult && catalogResult.ok) {
      const catalogDraft = catalogResult.data && catalogResult.data.draft;
      setNeeds(list(catalogDraft && catalogDraft.needs).filter((need) => isRecord(need)));
      setCatalogWarning(false);
    } else {
      setNeeds([]);
      setCatalogWarning(true);
    }
    return true;
  }

  function begin() {
    if (workingRef.current || !aliveRef.current) return false;
    workingRef.current = true;
    setWorking(true);
    return true;
  }

  function finish() {
    if (!aliveRef.current) return;
    workingRef.current = false;
    setWorking(false);
  }

  function stopIfAuth(err) {
    if (!aliveRef.current || isAbort(err)) return true;
    if (err && err.status === 401) {
      aliveRef.current = false;
      return true;
    }
    return false;
  }

  function change(recipe) {
    const current = draftRef.current;
    const next = recipe(current);
    if (!next || next === current) return;
    draftRef.current = next;
    setDraft(next);
    setNotice((prev) => (prev && (prev.kind === "saved" || prev.kind === "ok") ? null : prev));
  }

  function clearHeight(questionId, optionId) {
    const key = `${questionId}:${optionId}`;
    setHeightText((prev) => {
      if (!Object.hasOwn(prev, key)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function selectQuestion(id) {
    const question = orderedQuestions(draftRef.current).find((item) => item.id === id);
    if (question) {
      setFolded((prev) => {
        if (!prev || !prev[question.phase]) return prev;
        return { ...prev, [question.phase]: false };
      });
    }
    const next = questionHash(id);
    if (location.hash !== next) location.hash = next;
  }

  function openJson() {
    if (working) return;
    location.hash = JSON_HREF;
  }

  function cancel() {
    if (working || !loadedRef.current) return;
    const next = structuredClone(loadedRef.current);
    draftRef.current = next;
    setDraft(next);
    setHeightText({});
    setNotice((prev) => (prev && prev.kind === "conflict" ? prev : null));
    onDirty(false);
  }

  async function loadLatest() {
    if (!confirmAction("Несохранённый текст пропадёт. Загрузить актуальную версию?")) return;
    if (!begin()) return;
    try {
      const section = await getSection("questionnaire", { signal: controllerRef.current.signal });
      let catalogResult = { ok: false };
      try {
        const catalog = await getSection("catalog", { signal: controllerRef.current.signal });
        catalogResult = { ok: true, data: catalog };
      } catch (catalogErr) {
        if (stopIfAuth(catalogErr)) return;
      }
      if (!aliveRef.current) return;
      onDirty(false);
      if (!adopt(section, catalogResult)) return;
      setNotice({ kind: "ok", text: "Загружена актуальная версия с сервера" });
    } catch (err) {
      if (stopIfAuth(err)) return;
      setNotice({ kind: "problem", status: err.status, body: err.body });
    } finally {
      finish();
    }
  }

  async function save() {
    if (!canSave || !begin()) return;
    const payload = draftRef.current;
    try {
      setNotice(null);
      const saved = await saveDraft("questionnaire", payload, versionRef.current, { signal: controllerRef.current.signal });
      if (!aliveRef.current) return;
      try {
        const section = await getSection("questionnaire", { signal: controllerRef.current.signal });
        let catalogResult = { ok: false };
        try {
          const catalog = await getSection("catalog", { signal: controllerRef.current.signal });
          catalogResult = { ok: true, data: catalog };
        } catch (catalogErr) {
          if (stopIfAuth(catalogErr)) return;
        }
        if (!aliveRef.current) return;
        onDirty(false);
        if (!adopt(section, catalogResult)) return;
        setNotice({ kind: "saved" });
      } catch (reloadErr) {
        if (stopIfAuth(reloadErr)) return;
        const next = structuredClone(payload);
        const frozen = structuredClone(payload);
        draftRef.current = next;
        loadedRef.current = frozen;
        versionRef.current = saved.draftVersion;
        setDraft(next);
        setLoaded(frozen);
        setVersion(saved.draftVersion);
        setHeightText({});
        onDirty(false);
        setNotice({ kind: "problem", status: reloadErr.status, body: reloadErr.body });
      }
    } catch (err) {
      if (stopIfAuth(err)) return;
      if (err && err.status === 409) {
        setNotice({ kind: "conflict" });
        return;
      }
      setNotice({ kind: "problem", status: err && err.status, body: err && err.body });
    } finally {
      finish();
    }
  }

  function onInference(questionId, optionId, needId, confidence) {
    change((current) => setInference(current, questionId, optionId, needId, confidence));
  }

  function onCycle(questionId, optionId, needId) {
    const current = inferenceCell(draftRef.current, questionId, optionId, needId);
    onInference(questionId, optionId, needId, nextConfidence(current));
  }

  function autoFolded() {
    const map = {};
    if (questionCount > 20) {
      for (const group of groups) {
        if (group.id !== selectedPhase) map[group.id] = true;
      }
    }
    return map;
  }

  function phaseIsFolded(phaseId) {
    if (query.trim()) return false;
    const source = folded || autoFolded();
    return Boolean(source[phaseId]);
  }

  function togglePhase(phaseId) {
    const source = folded || autoFolded();
    setFolded({ ...source, [phaseId]: !source[phaseId] });
  }

  function submitNewQuestion() {
    setNewTried(true);
    const phases = list(draft && draft.phases).filter((item) => item && item.id && item.id !== "confirmation");
    const form = {
      id: newForm.id,
      phase: newForm.phase || (phases[0] && phases[0].id) || "",
      textFallback: newForm.text,
      type: "single",
      options: [{ id: newForm.optionId, label: newForm.optionLabel }]
    };
    const errors = validateQuestionForm(form, { existingIds, isNew: true });
    if (Object.keys(errors).length > 0) return;
    const id = newForm.id.trim();
    change((current) =>
      addQuestion(current, {
        id,
        phase: form.phase,
        textFallback: newForm.text.trim(),
        options: [{ id: newForm.optionId.trim(), label: newForm.optionLabel.trim() }]
      })
    );
    setCreating(false);
    setNewTried(false);
    setNewForm({ id: "", phase: "", text: "", optionId: "", optionLabel: "" });
    selectQuestion(id);
  }

  const newErrors = newTried
    ? validateQuestionForm(
        {
          id: newForm.id,
          phase: newForm.phase || list(draft && draft.phases).find((item) => item && item.id && item.id !== "confirmation")?.id || "",
          textFallback: newForm.text,
          type: "single",
          options: [{ id: newForm.optionId, label: newForm.optionLabel }]
        },
        { existingIds, isNew: true }
      )
    : {};

  const needle = query.trim().toLowerCase();
  const visibleGroups = groups.filter((group) => {
    if (!needle) return true;
    return group.questions.some((question) => {
      const text = questionLabel(question).toLowerCase();
      const id = String(question.id || "").toLowerCase();
      return text.includes(needle) || id.includes(needle);
    });
  });

  const matrixQuestions = showAll ? questions.filter((question) => question.phase !== "confirmation") : selected ? [selected] : [];

  return (
    <div aria-busy={working || undefined}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="m-0 text-2xl font-semibold">Анкета</h1>
          <p className="mt-1 mb-0 text-sm text-muted">Вопросы, ответы и что из них следует</p>
        </div>
        <Btn disabled={working} onClick={openJson}>
          Режим JSON
        </Btn>
      </div>
      <div className="mb-4">
        <Segmented label="Разделы анкеты" items={TABS} value={tab} disabled={working || phase !== "ready"} onChange={setTab} />
      </div>
      {catalogWarning && phase === "ready" ? (
        <div className="mb-4">
          <Banner kind="warn" text={CATALOG_WARNING} />
        </div>
      ) : null}
      {phase === "loading" ? <Loading text="Загружаем анкету…" /> : null}
      {phase === "error" ? <ErrorBlock lines={loadError || ["Не получилось выполнить запрос"]} /> : null}
      {phase === "ready" && draft ? (
        <>
          {tab === "questions" ? (
            <div className="flex min-w-0 flex-col gap-4">
              <div className="grid min-w-0 grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)] items-start gap-4 narrow:grid-cols-1">
                <Card className="min-w-0 p-3">
                  <Field label="Найти вопрос">
                    <input
                      className={controlClass}
                      type="search"
                      value={query}
                      placeholder="Текст или идентификатор"
                      autoComplete="off"
                      disabled={working}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </Field>
                  <div className="mt-3">
                    <Btn
                      disabled={working}
                      onClick={() => {
                        setCreating((value) => !value);
                        setNewForm((prev) => {
                          if (prev.phase) return prev;
                          const first = list(draft.phases).find((item) => item && item.id && item.id !== "confirmation");
                          return first ? { ...prev, phase: first.id } : prev;
                        });
                      }}
                    >
                      Новый вопрос
                    </Btn>
                  </div>
                  {creating ? (
                    <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
                      <Labeled label="Идентификатор" error={newErrors.id}>
                        <input
                          className={controlClass}
                          value={newForm.id}
                          autoComplete="off"
                          spellCheck={false}
                          disabled={working}
                          onChange={(event) => setNewForm((prev) => ({ ...prev, id: event.target.value }))}
                        />
                      </Labeled>
                      <Labeled label="Фаза" error={newErrors.phase}>
                        <Select
                          value={newForm.phase}
                          disabled={working}
                          onChange={(event) => setNewForm((prev) => ({ ...prev, phase: event.target.value }))}
                        >
                          <option value="">Выберите фазу</option>
                          {list(draft.phases)
                            .filter((item) => item && item.id && item.id !== "confirmation")
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name || item.id}
                              </option>
                            ))}
                        </Select>
                      </Labeled>
                      <Labeled label="Текст вопроса" error={newErrors.textFallback}>
                        <textarea
                          className={controlClass}
                          rows={3}
                          value={newForm.text}
                          disabled={working}
                          onChange={(event) => setNewForm((prev) => ({ ...prev, text: event.target.value }))}
                        />
                      </Labeled>
                      <Labeled label="Идентификатор ответа" error={newErrors["options.0.id"]}>
                        <input
                          className={controlClass}
                          value={newForm.optionId}
                          autoComplete="off"
                          spellCheck={false}
                          disabled={working}
                          onChange={(event) => setNewForm((prev) => ({ ...prev, optionId: event.target.value }))}
                        />
                      </Labeled>
                      <Labeled label="Подпись ответа" error={newErrors["options.0.label"]}>
                        <input
                          className={controlClass}
                          value={newForm.optionLabel}
                          disabled={working}
                          onChange={(event) => setNewForm((prev) => ({ ...prev, optionLabel: event.target.value }))}
                        />
                      </Labeled>
                      {newErrors.options ? (
                        <p className="m-0 text-sm text-bad" role="alert">
                          {newErrors.options}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <Btn kind="primary" disabled={working} onClick={submitNewQuestion}>
                          Добавить
                        </Btn>
                        <Btn
                          disabled={working}
                          onClick={() => {
                            setCreating(false);
                            setNewTried(false);
                          }}
                        >
                          Отмена
                        </Btn>
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-3 flex max-h-[70vh] flex-col gap-3 overflow-auto" aria-label="Вопросы по фазам">
                    {visibleGroups.map((group) => {
                      const matched = group.questions.filter((question) => {
                        if (!needle) return true;
                        const text = questionLabel(question).toLowerCase();
                        const id = String(question.id || "").toLowerCase();
                        return text.includes(needle) || id.includes(needle);
                      });
                      if (group.id === "confirmation") {
                        return (
                          <section key={group.id}>
                            <h2 className="m-0 flex items-baseline gap-2 text-sm font-semibold">
                              <span>{group.name || group.id}</span>
                              <span className="font-normal text-muted">{matched.length}</span>
                            </h2>
                            <p className="mt-1 mb-0 text-sm text-muted">вопросы строятся автоматически</p>
                          </section>
                        );
                      }
                      const closed = phaseIsFolded(group.id);
                      return (
                        <section key={group.id}>
                          <button
                            type="button"
                            className="flex w-full cursor-pointer items-baseline gap-2 rounded-md px-1 py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                            aria-expanded={!closed}
                            onClick={() => togglePhase(group.id)}
                          >
                            <span className="text-sm font-semibold">{group.name || group.id}</span>
                            <span className="text-sm text-muted">{matched.length}</span>
                          </button>
                          {closed ? null : (
                            <div className="mt-1 flex flex-col gap-1">
                              {matched.map((question, index) => {
                                const text = questionLabel(question);
                                const active = question.id === selectedId;
                                const atStart = index === 0;
                                const atEnd = index === matched.length - 1;
                                const only = list(question.appliesToScenarios);
                                return (
                                  <div key={question.id} className={`flex items-start gap-1 rounded-lg ${active ? "bg-accent-soft" : ""}`}>
                                    <button
                                      type="button"
                                      className="min-w-0 flex-1 cursor-pointer rounded-lg px-2 py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                                      aria-current={active ? "true" : undefined}
                                      onClick={() => selectQuestion(question.id)}
                                    >
                                      <span className="flex items-baseline gap-2">
                                        <span className="text-sm text-muted">{index + 1}.</span>
                                        <span className="min-w-0 flex-1 truncate" title={text}>
                                          {text}
                                        </span>
                                        <span className="shrink-0 text-xs text-muted" title="Число ответов">
                                          {list(question.options).length}
                                        </span>
                                      </span>
                                      <span className="mt-1 flex flex-wrap gap-1">
                                        {only.length > 0 ? (
                                          <Pill>{`только ${only.map((id) => named(draft.scenarios, id)).join(", ")}`}</Pill>
                                        ) : null}
                                        {list(question.dependsOn).length > 0 ? <Pill>зависит от…</Pill> : null}
                                        {dirty && errorMap[question.id] ? <Pill tone="bad">ошибка</Pill> : null}
                                      </span>
                                    </button>
                                    <div className="flex shrink-0 flex-col gap-1 pt-1">
                                      <Btn
                                        size="sm"
                                        aria-label={`Выше: ${text}`}
                                        disabled={working || atStart || Boolean(needle)}
                                        onClick={() => change((current) => moveQuestion(current, question.id, "up"))}
                                      >
                                        выше
                                      </Btn>
                                      <Btn
                                        size="sm"
                                        aria-label={`Ниже: ${text}`}
                                        disabled={working || atEnd || Boolean(needle)}
                                        onClick={() => change((current) => moveQuestion(current, question.id, "down"))}
                                      >
                                        ниже
                                      </Btn>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </section>
                      );
                    })}
                  </div>
                </Card>
                <Card className="min-w-0 p-4">
                  {selected ? (
                    <QuestionEditor
                      draft={draft}
                      question={selected}
                      needs={needs}
                      errors={shownErrors}
                      working={working}
                      inferenceLocked={inferenceLocked}
                      heightText={heightText}
                      optionForm={optionForm}
                      optionTried={optionTried}
                      onOptionForm={setOptionForm}
                      onOptionTried={setOptionTried}
                      onChange={change}
                      onInference={onInference}
                      onHeight={(optionId, raw) => {
                        const key = `${selected.id}:${optionId}`;
                        const trimmed = raw.trim();
                        if (trimmed === "") {
                          clearHeight(selected.id, optionId);
                          change((current) => updateOption(current, selected.id, optionId, { heightCm: undefined }));
                          return;
                        }
                        if (/^\d+$/.test(trimmed)) {
                          clearHeight(selected.id, optionId);
                          change((current) => updateOption(current, selected.id, optionId, { heightCm: Number(trimmed) }));
                          return;
                        }
                        setHeightText((prev) => ({ ...prev, [key]: raw }));
                        setNotice((prev) => (prev && (prev.kind === "saved" || prev.kind === "ok") ? null : prev));
                      }}
                      onDelete={() => {
                        const usage = usageOfQuestion(draftRef.current, selected.id);
                        const label = questionLabel(selected);
                        if (!confirmAction(`Удалить вопрос «${label}»? ${lossText(usage)}`)) return;
                        change((current) => removeQuestion(current, selected.id));
                        if (location.hash !== "#/questionnaire") location.hash = "#/questionnaire";
                      }}
                    />
                  ) : (
                    <p className="m-0 text-muted">{selectedId ? "Такого вопроса нет." : "Выберите вопрос слева."}</p>
                  )}
                </Card>
              </div>
              <Card className="min-w-0 overflow-hidden p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="m-0 text-lg font-semibold">Ответ → потребность</h2>
                    <p className="mt-1 mb-0 text-sm text-muted">● высокая · ◐ средняя · ○ низкая · пустая клетка — нет вывода</p>
                  </div>
                  <Check checked={showAll} disabled={working} label="Все вопросы" onChange={setShowAll} />
                </div>
                <Matrix
                  draft={draft}
                  needs={needs}
                  questions={matrixQuestions}
                  grouped={showAll}
                  disabled={inferenceLocked}
                  onCycle={onCycle}
                />
              </Card>
            </div>
          ) : null}
          {tab === "scenarios" ? (
            <ScenariosPane
              draft={draft}
              working={working}
              dirty={dirty}
              form={scenarioForm}
              tried={scenarioTried}
              ruleForm={ruleForm}
              onForm={setScenarioForm}
              onTried={setScenarioTried}
              onRuleForm={setRuleForm}
              onChange={change}
            />
          ) : null}
          {tab === "phases" ? <PhasesPane draft={draft} working={working} dirty={dirty} onChange={change} /> : null}
          {dirty || notice ? (
            <div className="sticky bottom-0 z-10 mt-4 border-t border-line bg-paper py-3">
              <Notice notice={notice} working={working} onLoad={loadLatest} />
              {dirty ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Btn kind="primary" busy={working} disabled={!canSave} onClick={save}>
                    Сохранить в черновик
                  </Btn>
                  <Btn disabled={working} onClick={cancel}>
                    Отменить
                  </Btn>
                  {invalid ? <span className="text-sm text-bad">Исправьте ошибки в полях</span> : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function QuestionEditor({
  draft,
  question,
  needs,
  errors,
  working,
  inferenceLocked,
  heightText,
  optionForm,
  optionTried,
  onOptionForm,
  onOptionTried,
  onChange,
  onInference,
  onHeight,
  onDelete
}) {
  const options = list(question.options);
  const showHeight = options.some((option) => option && Object.hasOwn(option, "heightCm")) || Object.keys(heightText).some((key) => key.startsWith(`${question.id}:`));
  const scenarios = list(draft.scenarios).filter((item) => item && item.id);
  const others = orderedQuestions(draft).filter((item) => item.id !== question.id && list(item.options).some((option) => option && option.id));
  const phases = list(draft.phases).filter((item) => item && item.id && (item.id !== "confirmation" || item.id === question.phase));
  const anyRules = inferencesForAnyAnswer(draft, question.id);
  const lastLocked = question.type !== "text" && options.length <= 1;
  const optionProbe = questionToForm(question, heightText);
  optionProbe.options = optionProbe.options.concat([{ id: optionForm.id, label: optionForm.label }]);
  const optionErrors = optionTried
    ? validateQuestionForm(optionProbe, {
        existingIds: list(draft.questions).map((item) => item && item.id).filter((id) => typeof id === "string"),
        isNew: false
      })
    : {};
  const optionIndex = optionProbe.options.length - 1;

  function heightValue(option) {
    const key = `${question.id}:${option.id}`;
    if (Object.hasOwn(heightText, key)) return heightText[key];
    if (!Object.hasOwn(option, "heightCm") || option.heightCm == null) return "";
    return String(option.heightCm);
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="m-0 text-lg font-semibold">Вопрос</h2>
      <Labeled label="Текст вопроса" error={errors.textFallback}>
        <textarea
          className={controlClass}
          rows={3}
          value={typeof question.textFallback === "string" ? question.textFallback : ""}
          disabled={working}
          onChange={(event) => onChange((current) => updateQuestion(current, question.id, { textFallback: event.target.value }))}
        />
      </Labeled>
      <Labeled label="Фаза" error={errors.phase}>
        <Select
          value={question.phase || ""}
          disabled={working}
          onChange={(event) => onChange((current) => updateQuestion(current, question.id, { phase: event.target.value }))}
        >
          {phases.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name || item.id}
            </option>
          ))}
        </Select>
      </Labeled>
      <Field label="Идентификатор" hint="Идентификатор не меняется: на него ссылаются другие правила">
        <input className={`${controlClass} font-mono`} value={question.id || ""} readOnly />
      </Field>
      <Field label="Тип">
        <input className={controlClass} value={question.type || ""} readOnly />
      </Field>
      <Field label="Показывать только в сценариях" hint="Пусто — вопрос показывается во всех сценариях">
        <MultiSelect
          options={scenarios.map((item) => ({ id: item.id, label: named(scenarios, item.id) }))}
          value={list(question.appliesToScenarios).filter((id) => typeof id === "string")}
          disabled={working}
          onChange={(ids) => onChange((current) => setAppliesTo(current, question.id, ids))}
        />
      </Field>
      <div>
        <h3 className="m-0 mb-2 text-base font-semibold">Показывать, если ранее ответили</h3>
        <div className="flex flex-col gap-2">
          {list(question.dependsOn).map((dep, index) => {
            const depQuestion = orderedQuestions(draft).find((item) => item.id === dep.questionId);
            const depOptions = list(depQuestion && depQuestion.options).filter((option) => option && option.id);
            return (
              <div key={`${dep.questionId}:${dep.optionId}:${index}`} className="flex flex-wrap items-center gap-2">
                <Select
                  className="w-auto min-w-40 flex-1"
                  value={dep.questionId || ""}
                  disabled={working}
                  aria-label="Вопрос, от которого зависит показ"
                  onChange={(event) => {
                    const questionId = event.target.value;
                    const nextQuestion = others.find((item) => item.id === questionId) || depQuestion;
                    const optionId = list(nextQuestion && nextQuestion.options).find((option) => option && option.id)?.id || "";
                    onChange((current) => {
                      const target = list(current.questions).find((item) => item && item.id === question.id);
                      const depends = list(target && target.dependsOn).map((item, itemIndex) =>
                        itemIndex === index ? { ...item, questionId, optionId } : item
                      );
                      return setDependsOn(current, question.id, depends);
                    });
                  }}
                >
                  {depQuestion ? null : <option value={dep.questionId}>{dep.questionId}</option>}
                  {others.map((item) => (
                    <option key={item.id} value={item.id}>
                      {shortText(questionLabel(item), 48)}
                    </option>
                  ))}
                </Select>
                <Select
                  className="w-auto min-w-32 flex-1"
                  value={dep.optionId || ""}
                  disabled={working}
                  aria-label="Ответ, от которого зависит показ"
                  onChange={(event) => {
                    const optionId = event.target.value;
                    onChange((current) => {
                      const target = list(current.questions).find((item) => item && item.id === question.id);
                      const depends = list(target && target.dependsOn).map((item, itemIndex) =>
                        itemIndex === index ? { ...item, optionId } : item
                      );
                      return setDependsOn(current, question.id, depends);
                    });
                  }}
                >
                  {depOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label || option.id}
                    </option>
                  ))}
                </Select>
                <Btn
                  size="sm"
                  disabled={working}
                  onClick={() =>
                    onChange((current) => {
                      const target = list(current.questions).find((item) => item && item.id === question.id);
                      const depends = list(target && target.dependsOn).filter((_, itemIndex) => itemIndex !== index);
                      return setDependsOn(current, question.id, depends);
                    })
                  }
                >
                  Убрать
                </Btn>
              </div>
            );
          })}
          <Btn
            size="sm"
            disabled={working || others.length === 0}
            onClick={() =>
              onChange((current) => {
                const pool = orderedQuestions(current).filter(
                  (item) => item.id !== question.id && list(item.options).some((option) => option && option.id)
                );
                const first = pool[0];
                if (!first) return current;
                const option = list(first.options).find((item) => item && item.id);
                if (!option) return current;
                const target = list(current.questions).find((item) => item && item.id === question.id);
                return setDependsOn(current, question.id, [...list(target && target.dependsOn), { questionId: first.id, optionId: option.id }]);
              })
            }
          >
            Добавить условие
          </Btn>
          {others.length === 0 ? <p className="m-0 text-sm text-muted">Нет других вопросов с ответами</p> : null}
        </div>
      </div>
      <div>
        <h3 className="m-0 mb-2 text-base font-semibold">Ответы</h3>
        {anyRules.length > 0 ? (
          <div className="mb-3 rounded-lg border border-line p-3">
            <p className="mt-0 mb-2 text-sm font-medium">Для любого ответа</p>
            <InferenceChips
              rules={anyRules}
              questionId={question.id}
              optionId={null}
              needs={needs}
              disabled={inferenceLocked}
              onSet={onInference}
            />
          </div>
        ) : null}
        <div className="flex flex-col gap-3">
          {options.map((option, index) => {
            if (!option || !option.id) return null;
            const rules = inferencesFor(draft, question.id, option.id);
            return (
              <div key={option.id} className="rounded-lg border border-line p-3">
                <div className="grid grid-cols-2 gap-3 narrow:grid-cols-1">
                  <Field label="Идентификатор ответа">
                    <input className={`${controlClass} font-mono`} value={option.id} readOnly />
                  </Field>
                  <Labeled label="Подпись" error={errors[`options.${index}.label`]}>
                    <input
                      className={controlClass}
                      value={typeof option.label === "string" ? option.label : ""}
                      disabled={working}
                      onChange={(event) =>
                        onChange((current) => updateOption(current, question.id, option.id, { label: event.target.value }))
                      }
                    />
                  </Labeled>
                  {showHeight ? (
                    <Labeled label="Рост, см" error={errors[`options.${index}.heightCm`]}>
                      <input
                        className={controlClass}
                        inputMode="numeric"
                        value={heightValue(option)}
                        disabled={working}
                        onChange={(event) => onHeight(option.id, event.target.value)}
                      />
                    </Labeled>
                  ) : null}
                  <Field label="Выбирает сценарий">
                    <Select
                      value={scenarioPick(draft, question.id, option.id) || ""}
                      disabled={working}
                      onChange={(event) =>
                        onChange((current) => setScenarioPick(current, question.id, option.id, event.target.value || null))
                      }
                    >
                      <option value="">—</option>
                      {scenarios.map((item) => (
                        <option key={item.id} value={item.id}>
                          {named(scenarios, item.id)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="mt-3">
                  <Btn
                    size="sm"
                    kind="danger"
                    disabled={working || lastLocked}
                    onClick={() => {
                      const usage = usageOfOption(draft, question.id, option.id);
                      const label = option.label || option.id;
                      if (!confirmAction(`Убрать ответ «${label}»? ${lossText(usage)}`)) return;
                      onChange((current) => removeOption(current, question.id, option.id));
                    }}
                  >
                    Убрать ответ
                  </Btn>
                  {lastLocked ? <p className="mt-1 mb-0 text-sm text-muted">Последний ответ убрать нельзя</p> : null}
                </div>
                <div className="mt-3">
                  <InferenceChips
                    rules={rules}
                    questionId={question.id}
                    optionId={option.id}
                    needs={needs}
                    disabled={inferenceLocked}
                    onSet={onInference}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
          <h3 className="m-0 text-base font-semibold">Добавить ответ</h3>
          <div className="grid grid-cols-2 gap-3 narrow:grid-cols-1">
            <Labeled label="Идентификатор ответа" error={optionErrors[`options.${optionIndex}.id`]}>
              <input
                className={controlClass}
                value={optionForm.id}
                autoComplete="off"
                spellCheck={false}
                disabled={working}
                onChange={(event) => onOptionForm((prev) => ({ ...prev, id: event.target.value }))}
              />
            </Labeled>
            <Labeled label="Подпись" error={optionErrors[`options.${optionIndex}.label`]}>
              <input
                className={controlClass}
                value={optionForm.label}
                disabled={working}
                onChange={(event) => onOptionForm((prev) => ({ ...prev, label: event.target.value }))}
              />
            </Labeled>
          </div>
          <Btn
            disabled={working}
            onClick={() => {
              onOptionTried(true);
              const probe = questionToForm(question, heightText);
              probe.options = probe.options.concat([{ id: optionForm.id, label: optionForm.label }]);
              const errors = validateQuestionForm(probe, {
                existingIds: list(draft.questions).map((item) => item && item.id).filter((id) => typeof id === "string"),
                isNew: false
              });
              const index = probe.options.length - 1;
              if (errors[`options.${index}.id`] || errors[`options.${index}.label`]) return;
              onChange((current) => addOption(current, question.id, { id: optionForm.id.trim(), label: optionForm.label.trim() }));
              onOptionForm({ id: "", label: "" });
              onOptionTried(false);
            }}
          >
            Добавить ответ
          </Btn>
        </div>
      </div>
      <div>
        <Btn kind="danger" disabled={working} onClick={onDelete}>
          Удалить вопрос
        </Btn>
      </div>
    </div>
  );
}

function ScenariosPane({ draft, working, dirty, form, tried, ruleForm, onForm, onTried, onRuleForm, onChange }) {
  const scenarios = list(draft.scenarios).filter((item) => item && item.id);
  const questions = orderedQuestions(draft).filter((question) => list(question.options).some((option) => option && option.id));
  const ids = scenarios.map((item) => item.id);
  const errors = tried ? validateScenarioForm(form, { existingIds: ids }) : {};
  const chosen = questions.find((question) => question.id === ruleForm.questionId);
  const ruleOptions = list(chosen && chosen.options).filter((option) => option && option.id);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card className="min-w-0 p-4">
        <h2 className="m-0 mb-3 text-lg font-semibold">Сценарии</h2>
        <div className="mb-4 max-w-md">
          <Field label="Сценарий по умолчанию">
            <Select
              value={typeof draft.defaultScenario === "string" ? draft.defaultScenario : ""}
              disabled={working}
              onChange={(event) => onChange((current) => setDefaultScenario(current, event.target.value))}
            >
              {scenarios.map((item) => (
                <option key={item.id} value={item.id}>
                  {named(scenarios, item.id)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="flex flex-col gap-3">
          {scenarios.map((scenario) => {
            const reason = scenarioBlockReason(draft, scenario.id);
            const nameError = dirty && blankName(scenario.name) ? "Укажите название" : "";
            return (
              <div key={scenario.id} className="grid grid-cols-[minmax(8rem,12rem)_minmax(0,1fr)_auto] items-start gap-3 narrow:grid-cols-1">
                <Field label="Идентификатор">
                  <input className={`${controlClass} font-mono`} value={scenario.id} readOnly />
                </Field>
                <Labeled label="Название" error={nameError}>
                  <input
                    className={controlClass}
                    value={typeof scenario.name === "string" ? scenario.name : ""}
                    disabled={working}
                    onChange={(event) => onChange((current) => renameScenario(current, scenario.id, event.target.value))}
                  />
                </Labeled>
                <div className="flex flex-col gap-1 pt-6 narrow:pt-0">
                  <Btn
                    kind="danger"
                    disabled={working || Boolean(reason)}
                    onClick={() => onChange((current) => removeScenario(current, scenario.id))}
                  >
                    Убрать
                  </Btn>
                  {reason ? <p className="m-0 max-w-64 text-sm text-muted">{reason}</p> : null}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
          <h3 className="m-0 text-base font-semibold">Добавить сценарий</h3>
          <div className="grid grid-cols-2 gap-3 narrow:grid-cols-1">
            <Labeled label="Идентификатор" error={errors.id}>
              <input
                className={controlClass}
                value={form.id}
                autoComplete="off"
                spellCheck={false}
                disabled={working}
                onChange={(event) => onForm((prev) => ({ ...prev, id: event.target.value }))}
              />
            </Labeled>
            <Labeled label="Название" error={errors.name}>
              <input
                className={controlClass}
                value={form.name}
                disabled={working}
                onChange={(event) => onForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </Labeled>
          </div>
          <Btn
            disabled={working}
            onClick={() => {
              onTried(true);
              const nextErrors = validateScenarioForm(form, { existingIds: ids });
              if (Object.keys(nextErrors).length > 0) return;
              onChange((current) => addScenario(current, { id: form.id.trim(), name: form.name.trim() }));
              onForm({ id: "", name: "" });
              onTried(false);
            }}
          >
            Добавить сценарий
          </Btn>
        </div>
      </Card>
      <Card className="min-w-0 overflow-hidden p-4">
        <h2 className="m-0 mb-3 text-lg font-semibold">Выбор сценария по ответу</h2>
        <div className="overflow-auto contain-paint">
          <table className="w-full min-w-[40rem] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="border-b border-line px-2 py-2 text-left">Вопрос</th>
                <th className="border-b border-line px-2 py-2 text-left">Ответ</th>
                <th className="border-b border-line px-2 py-2 text-left">Сценарий</th>
                <th className="border-b border-line px-2 py-2 text-left">
                  <span className="sr-only">Действие</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list(draft.scenarioRules).map((rule, index) => {
                const when = rule && rule.when ? rule.when : {};
                const question = questions.find((item) => item.id === when.questionId);
                const options = list(question && question.options).filter((option) => option && option.id);
                return (
                  <tr key={`${when.questionId}:${when.optionId}:${index}`}>
                    <td className="border-b border-line px-2 py-2 align-top">
                      <Select
                        value={when.questionId || ""}
                        disabled={working}
                        aria-label="Вопрос правила сценария"
                        onChange={(event) => {
                          const questionId = event.target.value;
                          const nextQuestion = questions.find((item) => item.id === questionId);
                          const optionId = list(nextQuestion && nextQuestion.options).find((option) => option && option.id)?.id || "";
                          if (!optionId || !rule.scenario) return;
                          onChange((current) => {
                            const cleared = setScenarioPick(current, when.questionId, when.optionId, null);
                            return setScenarioPick(cleared, questionId, optionId, rule.scenario);
                          });
                        }}
                      >
                        {question ? null : <option value={when.questionId}>{when.questionId}</option>}
                        {questions.map((item) => (
                          <option key={item.id} value={item.id}>
                            {shortText(questionLabel(item), 48)}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="border-b border-line px-2 py-2 align-top">
                      <Select
                        value={when.optionId || ""}
                        disabled={working}
                        aria-label="Ответ правила сценария"
                        onChange={(event) => {
                          const optionId = event.target.value;
                          if (!optionId || !rule.scenario) return;
                          onChange((current) => {
                            const cleared = setScenarioPick(current, when.questionId, when.optionId, null);
                            return setScenarioPick(cleared, when.questionId, optionId, rule.scenario);
                          });
                        }}
                      >
                        {options.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label || option.id}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="border-b border-line px-2 py-2 align-top">
                      <Select
                        value={rule.scenario || ""}
                        disabled={working}
                        aria-label="Сценарий"
                        onChange={(event) =>
                          onChange((current) => setScenarioPick(current, when.questionId, when.optionId, event.target.value || null))
                        }
                      >
                        {scenarios.map((item) => (
                          <option key={item.id} value={item.id}>
                            {named(scenarios, item.id)}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="border-b border-line px-2 py-2 align-top">
                      <Btn
                        size="sm"
                        disabled={working}
                        onClick={() => onChange((current) => setScenarioPick(current, when.questionId, when.optionId, null))}
                      >
                        Убрать
                      </Btn>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-4 grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2 narrow:grid-cols-1">
          <Field label="Вопрос">
            <Select
              value={ruleForm.questionId}
              disabled={working}
              onChange={(event) => {
                const questionId = event.target.value;
                const nextQuestion = questions.find((item) => item.id === questionId);
                const optionId = list(nextQuestion && nextQuestion.options).find((option) => option && option.id)?.id || "";
                onRuleForm({ questionId, optionId, scenarioId: ruleForm.scenarioId });
              }}
            >
              <option value="">Выберите вопрос</option>
              {questions.map((item) => (
                <option key={item.id} value={item.id}>
                  {shortText(questionLabel(item), 48)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ответ">
            <Select
              value={ruleForm.optionId}
              disabled={working || !ruleForm.questionId}
              onChange={(event) => onRuleForm((prev) => ({ ...prev, optionId: event.target.value }))}
            >
              <option value="">Выберите ответ</option>
              {ruleOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label || option.id}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Сценарий">
            <Select
              value={ruleForm.scenarioId}
              disabled={working}
              onChange={(event) => onRuleForm((prev) => ({ ...prev, scenarioId: event.target.value }))}
            >
              <option value="">Выберите сценарий</option>
              {scenarios.map((item) => (
                <option key={item.id} value={item.id}>
                  {named(scenarios, item.id)}
                </option>
              ))}
            </Select>
          </Field>
          <Btn
            disabled={working || !ruleForm.questionId || !ruleForm.optionId || !ruleForm.scenarioId}
            onClick={() => {
              onChange((current) => setScenarioPick(current, ruleForm.questionId, ruleForm.optionId, ruleForm.scenarioId));
              onRuleForm({ questionId: "", optionId: "", scenarioId: "" });
            }}
          >
            Добавить
          </Btn>
        </div>
      </Card>
    </div>
  );
}

function PhasesPane({ draft, working, dirty, onChange }) {
  const phases = phaseGroups(draft);
  return (
    <Card className="min-w-0 overflow-hidden p-4">
      <h2 className="m-0 mb-3 text-lg font-semibold">Фазы</h2>
      <div className="overflow-auto contain-paint">
        <table className="w-full min-w-[32rem] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="border-b border-line px-2 py-2 text-left">Порядок</th>
              <th className="border-b border-line px-2 py-2 text-left">Идентификатор</th>
              <th className="border-b border-line px-2 py-2 text-left">Название</th>
            </tr>
          </thead>
          <tbody>
            {phases.map((item) => {
              const nameError = dirty && blankName(item.name) ? "Укажите название" : "";
              return (
                <tr key={item.id}>
                  <td className="border-b border-line px-2 py-2 align-top">{item.order}</td>
                  <td className="border-b border-line px-2 py-2 align-top font-mono">{item.id}</td>
                  <td className="border-b border-line px-2 py-2 align-top">
                    <Labeled label="Название" error={nameError}>
                      <input
                        className={controlClass}
                        value={typeof item.name === "string" ? item.name : ""}
                        disabled={working}
                        onChange={(event) => onChange((current) => renamePhase(current, item.id, event.target.value))}
                      />
                    </Labeled>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 mb-0 text-sm text-muted">Новые фазы добавляются в режиме JSON</p>
    </Card>
  );
}

export { Questionnaire };
