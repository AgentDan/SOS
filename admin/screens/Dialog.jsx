import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { getSection, isAbort, listKnobs, saveDraft } from "../api/admin-api.js";
import { diffJson } from "../lib/diff-json.js";
import { sameJson } from "../lib/edits.js";
import {
  checkKnobValue,
  describeValue,
  getAtPath,
  knobPath,
  knobsForSection,
  labelFor,
  leafMatches,
  pathKey,
  setAtPath
} from "../lib/form-tree.js";
import { dialogSectionName } from "../lib/nav.js";
import { problemLines } from "../lib/messages.js";
import { Banner } from "../components/Banner.jsx";
import { confirmAction } from "../components/confirm.jsx";
import { ErrorBlock } from "../components/ErrorBlock.jsx";
import { Loading } from "../components/Loading.jsx";
import { Btn } from "../ui/Btn.jsx";
import { Card } from "../ui/Card.jsx";
import { controlClass } from "../ui/control.js";
import { Field } from "../ui/Field.jsx";
import { Pill } from "../ui/Pill.jsx";
import { Segmented } from "../ui/Segmented.jsx";
import { Switch } from "../ui/Check.jsx";

const TABS = [
  { id: "consultant", text: "Консультант" },
  { id: "director", text: "Режиссёр" },
  { id: "sales", text: "Продажа" },
  { id: "commands", text: "Команды сцены" },
  { id: "ai-rules", text: "Правила AI" }
];

const GAIN_ROWS = [
  ["reaction", "Реакция"],
  ["bridge", "Мостик"],
  ["tip", "Совет"],
  ["story", "История"],
  ["pause", "Пауза"],
  ["decline", "Отказ"],
  ["confirm", "Подтверждение"]
];

const SAVED_TEXT = "Сохранено в черновик. Клиент увидит это после публикации.";
const LINK =
  "text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const JSON_HINT = "Новые элементы добавляются в режиме JSON";

const FormContext = createContext(null);

function useForm() {
  const value = useContext(FormContext);
  if (!value) throw new Error("Поле формы вне экрана диалога");
  return value;
}

function cleanDraft(value) {
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === "string")) return value.filter((item) => item !== "");
    return value.map((item) => cleanDraft(item));
  }
  if (value && typeof value === "object") {
    const next = {};
    for (const key of Object.keys(value)) next[key] = cleanDraft(value[key]);
    return next;
  }
  return value;
}

function hasAtPath(root, path) {
  if (!Array.isArray(path) || path.length === 0) return false;
  const parent = path.length === 1 ? root : getAtPath(root, path.slice(0, -1));
  const key = path[path.length - 1];
  if (Array.isArray(parent)) return typeof key === "number" && key >= 0 && key < parent.length;
  if (parent && typeof parent === "object" && !Array.isArray(parent)) return Object.hasOwn(parent, key);
  return false;
}

function isKnobPath(path, knobs) {
  const key = pathKey(path);
  return knobs.some((knob) => knob && knob.path === key);
}

function groupKeys(value, path, knobs) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value).filter((key) => !isKnobPath([...path, key], knobs));
}

/* Пустой массив описан как строки, но элемент неизвестен: personas и stages тоже пустые.
   Добавлять строку нельзя — список объектов пополнится только в режиме JSON.
   Непустой список строк остаётся редактором, даже если из него всё удалили. */
function listMode(value, base) {
  if (describeValue(base) === "strings" && Array.isArray(base) && base.length > 0) return "strings";
  const kind = describeValue(value);
  if (kind === "strings" && value.length === 0) return "empty";
  return kind;
}

function nodeHits(value, path, knobs, query) {
  if (String(query ?? "").trim() === "") return true;
  const key = path.length ? String(path[path.length - 1]) : "";
  const label = path.length ? labelFor(path, knobs) : "";
  const kind = describeValue(value);
  if (kind === "group") {
    if (leafMatches(label, key, "", query)) return true;
    return Object.keys(value).some((child) => {
      if (isKnobPath([...path, child], knobs)) return false;
      return nodeHits(value[child], [...path, child], knobs, query);
    });
  }
  if (kind === "objects") {
    if (leafMatches(label, key, "", query)) return true;
    return value.some((item, index) => nodeHits(item, [...path, index], knobs, query));
  }
  return leafMatches(label, key, value, query);
}

function textRows(value) {
  const text = typeof value === "string" ? value : "";
  const byLines = text.split("\n").length;
  const byLength = Math.ceil(text.length / 72);
  return Math.min(16, Math.max(3, byLines, byLength));
}

function preview(value) {
  let text = "";
  try {
    text = JSON.stringify(value) ?? "";
  } catch {
    text = "";
  }
  if (text.length <= 120) return text;
  return `${text.slice(0, 119)}…`;
}

function numberClass(bad) {
  const border = bad
    ? "border border-bad bg-bad-soft focus-visible:outline-bad"
    : "border border-line bg-surface focus-visible:outline-accent";
  return `rounded-lg ${border} px-2.5 py-2 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60`;
}

function applyNumber(raw, knob, commit, mark, path) {
  const text = String(raw);
  const trimmed = text.trim();
  const partial =
    trimmed === "" || trimmed === "-" || trimmed === "+" || trimmed === "." || trimmed === "-." || trimmed.endsWith(".");
  if (partial) {
    mark(path, text);
    return;
  }
  const check = checkKnobValue(knob || { type: "number" }, text);
  if (typeof check.value === "number" && Number.isFinite(check.value)) commit(path, check.value);
  else mark(path, text);
}

function objectDraft(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function FieldTitle({ path, changed }) {
  const { knobs } = useForm();
  const text = labelFor(path, knobs);
  const raw = text === String(path[path.length - 1]);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className={raw ? "font-mono text-sm [overflow-wrap:anywhere]" : "[overflow-wrap:anywhere]"}>{text}</span>
      {changed ? <Pill tone="warn">изменено</Pill> : null}
    </span>
  );
}

function Fold({ title, changed, defaultOpen, forceOpen, children }) {
  const { disabled } = useForm();
  const [opened, setOpened] = useState(defaultOpen);
  const open = forceOpen || opened;
  return (
    <details open={open} className="rounded-lg border border-line px-3 py-2">
      <summary
        className="cursor-pointer rounded-md font-medium [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        onClick={(event) => {
          event.preventDefault();
          if (forceOpen || disabled) return;
          setOpened((value) => !value);
        }}
      >
        <span className="inline-flex flex-wrap items-center gap-2">
          {title}
          {changed ? <Pill tone="warn">изменено</Pill> : null}
        </span>
      </summary>
      {open ? <div className="mt-3 flex flex-col gap-3">{children}</div> : null}
    </details>
  );
}

function UnknownValue({ value }) {
  return (
    <div>
      <p className="m-0 text-sm text-muted">Это значение правится в режиме JSON</p>
      {preview(value) ? <p className="mt-1 mb-0 font-mono text-xs [overflow-wrap:anywhere] text-muted">{preview(value)}</p> : null}
    </div>
  );
}

function SettingList({ value, base, path }) {
  const { knobs, query } = useForm();
  const keys = groupKeys(value, path, knobs);
  const label = path.length ? labelFor(path, knobs) : "";
  const keyName = path.length ? String(path[path.length - 1]) : "";
  const titleHit = query.trim() !== "" && path.length > 0 && leafMatches(label, keyName, "", query);
  const visible = keys.filter((key) => {
    if (query.trim() === "" || titleHit) return true;
    return nodeHits(value[key], [...path, key], knobs, query);
  });
  if (visible.length === 0) {
    if (path.length === 0 && query.trim() !== "") {
      return <p className="m-0 text-sm text-muted">Ничего не найдено</p>;
    }
    return null;
  }
  return visible.map((key) => (
    <SettingNode
      key={key}
      value={value[key]}
      base={base && typeof base === "object" ? base[key] : undefined}
      path={[...path, key]}
    />
  ));
}

function SettingNode({ value, base, path }) {
  const { knobs, query, disabled, invalid, commit, markInvalid } = useForm();
  const kind = listMode(value, base);
  const changed = !sameJson(value, base);
  const searching = query.trim() !== "";

  if (kind === "group") {
    const keys = groupKeys(value, path, knobs);
    if (Object.keys(value).length > 0 && keys.length === 0) return null;
    return (
      <Fold
        title={<FieldTitle path={path} changed={false} />}
        changed={changed}
        defaultOpen={keys.length <= 8}
        forceOpen={searching}
      >
        <SettingList value={value} base={base} path={path} />
      </Fold>
    );
  }

  if (kind === "objects") {
    const label = labelFor(path, knobs);
    const titleHit = searching && leafMatches(label, String(path[path.length - 1]), "", query);
    const indexes = value
      .map((_, index) => index)
      .filter((index) => titleHit || !searching || nodeHits(value[index], [...path, index], knobs, query));
    return (
      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium text-ink">
          <FieldTitle path={path} changed={changed} />
        </div>
        {indexes.map((index) => {
          const item = value[index];
          const itemBase = Array.isArray(base) ? base[index] : undefined;
          const fields = describeValue(item) === "group" ? Object.keys(item).length : 0;
          return (
            <Fold
              key={index}
              title={`Элемент ${index + 1}`}
              changed={!sameJson(item, itemBase)}
              defaultOpen={fields <= 8}
              forceOpen={searching}
            >
              {describeValue(item) === "group" ? (
                <SettingList value={item} base={itemBase} path={[...path, index]} />
              ) : (
                <UnknownValue value={item} />
              )}
            </Fold>
          );
        })}
        <p className="m-0 text-xs text-muted">{JSON_HINT}</p>
      </div>
    );
  }

  if (kind === "empty") {
    return (
      <div>
        <div className="text-sm font-medium text-ink">
          <FieldTitle path={path} changed={changed} />
        </div>
        <p className="mt-1 mb-0 text-xs text-muted">{JSON_HINT}</p>
      </div>
    );
  }

  if (kind === "strings") {
    const title = labelFor(path, knobs);
    return (
      <div>
        <div className="text-sm font-medium text-ink">
          <FieldTitle path={path} changed={changed} />
        </div>
        <div className="mt-1 flex flex-col gap-2">
          {value.map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                className={controlClass}
                type="text"
                value={item}
                disabled={disabled}
                autoComplete="off"
                aria-label={`${title} ${index + 1}`}
                onChange={(event) => commit([...path, index], event.target.value)}
              />
              <Btn
                size="sm"
                disabled={disabled}
                aria-label={`Удалить ${title} ${index + 1}`}
                onClick={() => commit(path, value.filter((_, itemIndex) => itemIndex !== index))}
              >
                ×
              </Btn>
            </div>
          ))}
        </div>
        <div className="mt-2">
          <Btn size="sm" disabled={disabled} onClick={() => commit(path, [...value, ""])}>
            + Добавить
          </Btn>
        </div>
      </div>
    );
  }

  if (kind === "text" || kind === "longtext") {
    const shown = typeof value === "string" ? value : "";
    return (
      <Field label={<FieldTitle path={path} changed={changed} />}>
        {kind === "text" ? (
          <input
            className={controlClass}
            type="text"
            value={shown}
            disabled={disabled}
            autoComplete="off"
            onChange={(event) => commit(path, event.target.value)}
          />
        ) : (
          <textarea
            className={`${controlClass} resize-y`}
            rows={textRows(shown)}
            value={shown}
            disabled={disabled}
            onChange={(event) => commit(path, event.target.value)}
          />
        )}
      </Field>
    );
  }

  if (kind === "number") {
    const key = pathKey(path);
    const raw = invalid[key];
    const shown = raw !== undefined ? raw : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
    const bad = raw !== undefined;
    return (
      <div>
        <Field label={<FieldTitle path={path} changed={changed} />}>
          <input
            className={`${numberClass(bad)} w-full`}
            type="text"
            inputMode="decimal"
            value={shown}
            disabled={disabled}
            autoComplete="off"
            aria-invalid={bad || undefined}
            onChange={(event) => applyNumber(event.target.value, null, commit, markInvalid, path)}
          />
        </Field>
        {bad ? (
          <p className="mt-1 mb-0 text-sm text-bad" role="alert">
            Введите число
          </p>
        ) : null}
      </div>
    );
  }

  if (kind === "boolean") {
    const title = labelFor(path, knobs);
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-medium text-ink">
          <FieldTitle path={path} changed={changed} />
        </div>
        <span className="inline-flex items-center gap-2">
          <Switch
            checked={value === true}
            disabled={disabled}
            label={title}
            onChange={(checked) => commit(path, checked)}
          />
          <span className="text-sm text-muted">{value === true ? "да" : "нет"}</span>
        </span>
      </div>
    );
  }

  return (
    <div>
      <div className="text-sm font-medium text-ink">
        <FieldTitle path={path} changed={changed} />
      </div>
      <div className="mt-1">
        <UnknownValue value={value} />
      </div>
    </div>
  );
}

function KnobNumber({ knob, value, base, path, disabled, invalidText, onCommit, onInvalid }) {
  const rangeId = useId();
  const numberId = useId();
  const min = knob.min;
  const max = knob.max;
  const hasRange = typeof min === "number" && typeof max === "number";
  const current = typeof value === "number" && Number.isFinite(value) ? value : hasRange ? min : 0;
  const slider = hasRange ? Math.min(max, Math.max(min, current)) : current;
  const step = hasRange && Number.isInteger(min) && Number.isInteger(max) ? 1 : "any";
  const sliderValue = step === 1 ? Math.round(slider) : slider;
  const check =
    invalidText !== undefined ? { ok: false, message: "Введите число" } : checkKnobValue(knob, value);
  const shown = invalidText !== undefined ? invalidText : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
  const changed = !sameJson(value, base);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={hasRange ? rangeId : numberId} className="text-sm font-medium text-ink">
          {knob.label}
        </label>
        {changed ? <Pill tone="warn">изменено</Pill> : null}
      </div>
      <div className={hasRange ? "grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-3" : ""}>
        {hasRange ? (
          <input
            id={rangeId}
            className="h-2 w-full cursor-pointer accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
            type="range"
            min={min}
            max={max}
            step={step}
            value={sliderValue}
            disabled={disabled}
            onChange={(event) => onCommit(path, Number(event.target.value))}
          />
        ) : null}
        <input
          id={numberId}
          className={`${numberClass(!check.ok)} w-full`}
          type="text"
          inputMode="decimal"
          value={shown}
          disabled={disabled}
          autoComplete="off"
          aria-label={`${knob.label}, число`}
          aria-invalid={!check.ok || undefined}
          onChange={(event) => applyNumber(event.target.value, knob, onCommit, onInvalid, path)}
        />
      </div>
      {knob.description ? <p className="m-0 text-sm text-muted">{knob.description}</p> : null}
      {!check.ok ? (
        <p className="m-0 text-sm text-bad" role="alert">
          {check.message}
        </p>
      ) : null}
    </div>
  );
}

function KnobRow({ knob, draft, loaded, disabled, invalid, onCommit, onInvalid }) {
  const path = knobPath(knob);
  const values = Array.isArray(knob.values) ? knob.values : [];
  if (values.length === 0 || !hasAtPath(draft, path)) {
    return (
      <div>
        <p className="m-0 text-sm font-medium text-ink">{knob.label || knob.id}</p>
        <p className="mt-1 mb-0 text-sm text-bad">Значение не найдено в разделе</p>
        <p className="mt-1 mb-0 text-xs text-muted">Его можно поправить в режиме JSON.</p>
      </div>
    );
  }

  const value = getAtPath(draft, path);
  const base = getAtPath(loaded, path);
  const key = pathKey(path);

  if (knob.type === "number") {
    return (
      <KnobNumber
        knob={knob}
        value={value}
        base={base}
        path={path}
        disabled={disabled}
        invalidText={invalid[key]}
        onCommit={onCommit}
        onInvalid={onInvalid}
      />
    );
  }

  if (knob.type === "enum") {
    const options = Array.isArray(knob.options) ? knob.options : [];
    const check = checkKnobValue(knob, value);
    const changed = !sameJson(value, base);
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-ink">{knob.label}</span>
          {changed ? <Pill tone="warn">изменено</Pill> : null}
        </div>
        <Segmented
          label={knob.label}
          items={options.map((option) => ({ id: String(option), text: String(option) }))}
          value={options.includes(value) ? String(value) : ""}
          disabled={disabled}
          onChange={(id) => {
            const found = options.find((option) => String(option) === id);
            if (found !== undefined) onCommit(path, found);
          }}
        />
        {knob.description ? <p className="m-0 text-sm text-muted">{knob.description}</p> : null}
        {!check.ok ? (
          <p className="m-0 text-sm text-bad" role="alert">
            {check.message}
          </p>
        ) : null}
      </div>
    );
  }

  if (knob.type === "boolean") {
    const check = checkKnobValue(knob, value);
    const changed = !sameJson(value, base);
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
            {knob.label}
            {changed ? <Pill tone="warn">изменено</Pill> : null}
          </span>
          <span className="inline-flex items-center gap-2">
            <Switch
              checked={value === true}
              disabled={disabled}
              label={knob.label}
              onChange={(checked) => onCommit(path, checked)}
            />
            <span className="text-sm text-muted">{value === true ? "да" : "нет"}</span>
          </span>
        </div>
        {knob.description ? <p className="m-0 text-sm text-muted">{knob.description}</p> : null}
        {!check.ok ? (
          <p className="m-0 text-sm text-bad" role="alert">
            {check.message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <p className="m-0 text-sm font-medium text-ink">{knob.label || knob.id}</p>
      <p className="mt-1 mb-0 text-sm text-muted">Это значение правится в режиме JSON</p>
    </div>
  );
}

function signed(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const text = String(Math.abs(value));
  if (value > 0) return `+${text}`;
  if (value < 0) return `−${text}`;
  return text;
}

function gainTone(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "text-muted";
  if (value > 0) return "text-accent";
  if (value < 0) return "text-bad";
  return "text-ink";
}

function PatienceCard({ draft }) {
  const low = getAtPath(draft, ["low"]);
  const declines = getAtPath(draft, ["declinesBeforeAssume"]);
  const gains = getAtPath(draft, ["gains"]);
  const table = gains && typeof gains === "object" && !Array.isArray(gains) ? gains : {};
  const known = typeof low === "number" && Number.isFinite(low);
  const pct = known ? Math.min(100, Math.max(0, low)) : null;
  const lowText = known ? String(low) : "—";
  const declineText = typeof declines === "number" && Number.isFinite(declines) ? String(declines) : "—";
  const align = pct == null ? "0" : pct > 80 ? "translateX(-100%)" : pct < 20 ? "translateX(0)" : "translateX(-50%)";

  return (
    <Card className="min-w-0 self-start p-4">
      <h2 className="m-0 mb-3 text-lg font-semibold">Шкала терпения</h2>
      <div className="relative mt-6 h-12">
        <p className="absolute m-[-1px] h-px w-px overflow-hidden border-0 p-0 whitespace-nowrap">
          {`Нижний порог терпения: ${lowText}`}
        </p>
        {pct != null ? (
          <div
            className="absolute top-0 text-xs whitespace-nowrap text-bad"
            style={{ left: `${pct}%`, transform: align }}
          >
            {`порог ${lowText}`}
          </div>
        ) : (
          <div className="absolute top-0 text-xs text-muted">порог —</div>
        )}
        <div className="absolute top-6 right-0 left-0 h-3 overflow-hidden rounded-full bg-accent-soft">
          {pct != null ? <div className="h-full bg-bad-soft" style={{ width: `${pct}%` }} /> : null}
        </div>
        {pct != null ? (
          <div className="absolute top-5 h-5 w-0.5 bg-bad" style={{ left: `${pct}%` }} />
        ) : null}
      </div>
      <ul className="m-0 mt-4 flex list-none flex-col gap-1 p-0">
        {GAIN_ROWS.map(([key, title]) => (
          <li key={key} className={`text-sm ${gainTone(table[key])}`}>
            {`${title} ${signed(table[key])}`}
          </li>
        ))}
      </ul>
      <p className="mt-4 mb-0 text-sm">
        {`После ${declineText} отказов подряд режиссёр перестаёт предлагать потребность.`}
      </p>
      <p className="mt-3 mb-0 text-xs text-muted">Показаны настройки. Пошагового сценария разговора здесь нет.</p>
    </Card>
  );
}

function Dialog({ name: sectionName, onDirty = () => {} }) {
  const name = dialogSectionName(sectionName);
  const [phase, setPhase] = useState("loading");
  const [loadError, setLoadError] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loaded, setLoaded] = useState(null);
  const [published, setPublished] = useState(undefined);
  const [version, setVersion] = useState(null);
  const [knobList, setKnobList] = useState([]);
  const [invalid, setInvalid] = useState({});
  const [query, setQuery] = useState("");
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState(null);

  const aliveRef = useRef(true);
  const workingRef = useRef(false);
  const controllerRef = useRef(null);
  const draftRef = useRef(null);
  const loadedRef = useRef(null);
  const versionRef = useRef(null);

  const sectionKnobs = useMemo(() => knobsForSection(knobList, name), [knobList, name]);
  draftRef.current = draft;
  loadedRef.current = loaded;
  versionRef.current = version;

  const invalidCount = Object.keys(invalid).length;
  const rawDirty = Boolean(draft && loaded) && !sameJson(draft, loaded);
  const structuralDirty = Boolean(draft && loaded) && !sameJson(cleanDraft(draft), loaded);
  const knobBad = sectionKnobs.some((knob) => {
    const path = knobPath(knob);
    if (!draft || !hasAtPath(draft, path)) return false;
    if (Object.hasOwn(invalid, pathKey(path))) return true;
    return !checkKnobValue(knob, getAtPath(draft, path)).ok;
  });
  const dirty = phase === "ready" && (rawDirty || invalidCount > 0);
  const canSave = dirty && invalidCount === 0 && !knobBad && !working;
  const unpublished =
    phase === "ready" && loaded != null && (published === undefined || diffJson(published, loaded).total > 0);

  const commit = useCallback((path, value) => {
    setDraft((prev) => setAtPath(prev, path, value));
    setInvalid((prev) => {
      const key = pathKey(path);
      if (!Object.hasOwn(prev, key)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setNotice((prev) => (prev && (prev.kind === "saved" || prev.kind === "ok") ? null : prev));
  }, []);

  const markInvalid = useCallback((path, raw) => {
    setInvalid((prev) => ({ ...prev, [pathKey(path)]: raw }));
    setNotice((prev) => (prev && (prev.kind === "saved" || prev.kind === "ok") ? null : prev));
  }, []);

  const formApi = {
    knobs: sectionKnobs,
    query,
    disabled: working,
    invalid,
    commit,
    markInvalid
  };

  function adopt(section, knobs) {
    const source = section && section.draft;
    if (!objectDraft(source)) {
      setLoadError(["В разделе нет данных"]);
      setPhase("error");
      return false;
    }
    const next = structuredClone(source);
    const frozen = structuredClone(next);
    draftRef.current = next;
    loadedRef.current = frozen;
    versionRef.current = section.draftVersion;
    setDraft(next);
    setLoaded(frozen);
    setPublished(section.published === undefined ? undefined : structuredClone(section.published));
    setVersion(section.draftVersion);
    setKnobList(Array.isArray(knobs) ? knobs : []);
    setInvalid({});
    setPhase("ready");
    return true;
  }

  useEffect(() => {
    if (phase !== "ready") {
      onDirty(false);
      return undefined;
    }
    onDirty(dirty);
    return () => onDirty(false);
  }, [phase, dirty, onDirty]);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    aliveRef.current = true;
    let alive = true;
    Promise.all([getSection(name, { signal: controller.signal }), listKnobs({ signal: controller.signal })])
      .then(([section, knobs]) => {
        if (!alive) return;
        adopt(section, knobs);
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
  }, [name, onDirty]);

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

  function openTab(next) {
    if (next === name || working) return;
    location.hash = `#/dialog/${encodeURIComponent(next)}`;
  }

  function openJson() {
    if (working) return;
    location.hash = `#/sections/${encodeURIComponent(name)}`;
  }

  function cancel() {
    if (working || !loadedRef.current) return;
    const next = structuredClone(loadedRef.current);
    draftRef.current = next;
    setDraft(next);
    setInvalid({});
    setNotice((prev) => (prev && prev.kind === "conflict" ? prev : null));
    onDirty(false);
  }

  async function loadLatest() {
    if (!confirmAction("Несохранённый текст пропадёт. Загрузить актуальную версию?")) return;
    if (!begin()) return;
    try {
      const [section, knobs] = await Promise.all([
        getSection(name, { signal: controllerRef.current.signal }),
        listKnobs({ signal: controllerRef.current.signal })
      ]);
      if (!aliveRef.current) return;
      onDirty(false);
      if (!adopt(section, knobs)) return;
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
    const payload = cleanDraft(draftRef.current);
    if (sameJson(payload, loadedRef.current)) {
      const next = structuredClone(loadedRef.current);
      draftRef.current = next;
      setDraft(next);
      setInvalid({});
      onDirty(false);
      finish();
      return;
    }
    const blocked = sectionKnobs.some((knob) => {
      const path = knobPath(knob);
      if (!hasAtPath(payload, path)) return false;
      return !checkKnobValue(knob, getAtPath(payload, path)).ok;
    });
    if (blocked || Object.keys(invalid).length > 0) {
      finish();
      return;
    }
    try {
      setNotice(null);
      const saved = await saveDraft(name, payload, versionRef.current, { signal: controllerRef.current.signal });
      if (!aliveRef.current) return;
      try {
        const [section, knobs] = await Promise.all([
          getSection(name, { signal: controllerRef.current.signal }),
          listKnobs({ signal: controllerRef.current.signal })
        ]);
        if (!aliveRef.current) return;
        onDirty(false);
        if (!adopt(section, knobs)) return;
        setNotice({ kind: "saved" });
      } catch (reloadErr) {
        if (stopIfAuth(reloadErr)) return;
        versionRef.current = saved.draftVersion;
        setVersion(saved.draftVersion);
        const next = structuredClone(payload);
        const frozen = structuredClone(payload);
        draftRef.current = next;
        loadedRef.current = frozen;
        setDraft(next);
        setLoaded(frozen);
        setInvalid({});
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

  return (
    <div aria-busy={working || undefined}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="m-0 text-2xl font-semibold">Диалог</h1>
          <p className="mt-1 mb-0 text-sm text-muted">Как консультант говорит и ведёт клиента</p>
        </div>
        <Btn disabled={working} onClick={openJson}>
          Режим JSON
        </Btn>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented label="Разделы диалога" items={TABS} value={name} disabled={working} onChange={openTab} />
        {unpublished ? <Pill tone="warn">не опубликовано</Pill> : null}
      </div>
      {phase === "loading" ? <Loading text="Загружаем раздел…" /> : null}
      {phase === "error" ? <ErrorBlock lines={loadError || ["Не получилось выполнить запрос"]} /> : null}
      {phase === "ready" && draft ? (
        <>
          <div
            className={
              name === "director"
                ? "grid grid-cols-[minmax(0,1fr)_18rem] items-start gap-4 narrow:grid-cols-1"
                : ""
            }
          >
            <div className="flex min-w-0 flex-col gap-4">
              {sectionKnobs.length > 0 ? (
                <Card className="min-w-0 p-4">
                  <h2 className="m-0 mb-3 text-lg font-semibold">Ручки раздела</h2>
                  <div className="flex flex-col gap-4">
                    {sectionKnobs.map((knob) => (
                      <div key={knob.id} className="border-b border-line pb-4 last:border-b-0 last:pb-0">
                        <KnobRow
                          knob={knob}
                          draft={draft}
                          loaded={loaded}
                          disabled={working}
                          invalid={invalid}
                          onCommit={commit}
                          onInvalid={markInvalid}
                        />
                      </div>
                    ))}
                  </div>
                </Card>
              ) : null}
              <Field label="Найти по тексту или ключу">
                <input
                  className={controlClass}
                  type="search"
                  value={query}
                  placeholder="Текст или ключ"
                  autoComplete="off"
                  disabled={working}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </Field>
              <Card className="min-w-0 p-4">
                <h2 className="m-0 mb-3 text-lg font-semibold">Остальные настройки</h2>
                <FormContext.Provider value={formApi}>
                  <div className="flex flex-col gap-3">
                    <SettingList value={draft} base={loaded} path={[]} />
                  </div>
                </FormContext.Provider>
              </Card>
            </div>
            {name === "director" ? <PatienceCard draft={draft} /> : null}
          </div>
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
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export { Dialog };
