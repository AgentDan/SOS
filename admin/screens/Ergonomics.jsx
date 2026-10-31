import { useEffect, useId, useRef, useState } from "react";
import { getSection, isAbort, saveDraft } from "../api/admin-api.js";
import { diffJson } from "../lib/diff-json.js";
import { sameJson } from "../lib/edits.js";
import {
  draftFromForm,
  ergoTargets,
  formFromDraft,
  heightSamples,
  isDirtyForm,
  validateErgonomicsForm
} from "../lib/ergonomics.js";
import { problemLines } from "../lib/messages.js";
import { Banner } from "../components/Banner.jsx";
import { confirmAction } from "../components/confirm.jsx";
import { ErrorBlock } from "../components/ErrorBlock.jsx";
import { Loading } from "../components/Loading.jsx";
import { Btn } from "../ui/Btn.jsx";
import { Card } from "../ui/Card.jsx";
import { Field } from "../ui/Field.jsx";
import { Pill } from "../ui/Pill.jsx";
import { Segmented } from "../ui/Segmented.jsx";
import { Select } from "../ui/Select.jsx";

const SAVED_TEXT = "Сохранено в черновик. Клиент увидит это после публикации.";
const LINK =
  "text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const HANDS = [
  { id: "right", text: "Правая" },
  { id: "left", text: "Левая" }
];
const RESULT_ROWS = [
  ["seatHeightMm", "Высота сиденья"],
  ["deskHeightMm", "Высота стола"],
  ["eyeHeightMm", "Высота глаз"],
  ["monitorDistanceMm", "Расстояние до экрана"],
  ["monitorTopMm", "Верх монитора"]
];

function fieldClass(bad) {
  const border = bad
    ? "border border-bad bg-bad-soft focus-visible:outline-bad"
    : "border border-line bg-surface focus-visible:outline-accent";
  return `w-full min-w-0 rounded-lg ${border} px-2.5 py-2 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60`;
}

function sliderValue(value, range) {
  const parsed = Number(String(value ?? "").trim().replace(",", "."));
  const current = Number.isFinite(parsed) ? parsed : range.min;
  return String(Math.round(Math.min(range.max, Math.max(range.min, current))));
}

function boundsRange(bounds) {
  if (!bounds) return null;
  const min = bounds.heightMinCm;
  const max = bounds.heightMaxCm;
  if (typeof min !== "number" || typeof max !== "number") return null;
  if (!Number.isInteger(min) || !Number.isInteger(max) || min >= max) return null;
  return { min, max };
}

function objectDraft(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readPeople(section) {
  const products = section && section.draft && Array.isArray(section.draft.products) ? section.draft.products : [];
  const people = [];
  const seen = new Set();
  for (const product of products) {
    if (!product || product.type !== "person" || typeof product.sku !== "string" || product.sku.trim() === "") continue;
    const sku = product.sku.trim();
    if (seen.has(sku)) continue;
    seen.add(sku);
    const label = typeof product.label === "string" ? product.label.trim() : "";
    const name = typeof product.name === "string" ? product.name.trim() : "";
    people.push({ sku, title: label || name || sku });
  }
  return people;
}

function personSkusOf(catalog) {
  if (!catalog || catalog.failed) return null;
  return catalog.people.map((item) => item.sku);
}

function MeasureField({ label, hint, error, value, onChange, disabled, decimal = false, range = null }) {
  const errorId = useId();
  const labelNode = hint ? (
    <span className="flex flex-col gap-0.5">
      <span>{label}</span>
      <span className="font-normal text-muted">{hint}</span>
    </span>
  ) : (
    label
  );
  const slider = range ? (
    <input
      className="h-2 w-full min-w-0 cursor-pointer accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
      type="range"
      min={range.min}
      max={range.max}
      step="1"
      value={sliderValue(value, range)}
      disabled={disabled}
      aria-label={label}
      onChange={(event) => onChange(event.target.value)}
    />
  ) : null;
  return (
    <div>
      <Field label={labelNode} before={slider}>
        <input
          className={fieldClass(Boolean(error))}
          type="text"
          inputMode={decimal ? "decimal" : "numeric"}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      </Field>
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

function ValueTable({ targets }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {RESULT_ROWS.map(([key, title]) => (
          <tr key={key} className="border-b border-line last:border-b-0">
            <th scope="row" className="py-1.5 pr-3 text-left font-medium">
              {title}
            </th>
            <td className="py-1.5 text-right tabular-nums">{`${targets[key]} мм`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SampleTable({ rows }) {
  return (
    <div className="mt-4">
      <h3 className="m-0 mb-2 text-sm font-medium">Для границ и по умолчанию</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-line text-muted">
              <th className="py-1 pr-2 font-medium">Рост</th>
              <th className="py-1 pr-2 font-medium">Сиденье</th>
              <th className="py-1 pr-2 font-medium">Стол</th>
              <th className="py-1 pr-2 font-medium">Глаза</th>
              <th className="py-1 pr-2 font-medium">Экран</th>
              <th className="py-1 font-medium">Верх</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.height} className="border-b border-line last:border-b-0">
                <th scope="row" className="py-1 pr-2 font-medium tabular-nums">{`${row.height} см`}</th>
                {RESULT_ROWS.map(([key]) => (
                  <td key={key} className="py-1 pr-2 tabular-nums">
                    {row.targets ? row.targets[key] : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* Схема сбоку: масштаб берётся от самой большой высоты и ещё умещается в карточку по ширине. */
function WorkplaceSketch({ targets }) {
  const seat = targets.seatHeightMm;
  const desk = targets.deskHeightMm;
  const eye = targets.eyeHeightMm;
  const distance = targets.monitorDistanceMm;
  const top = targets.monitorTopMm;
  const label = `Высота сиденья ${seat} мм, высота стола ${desk} мм, высота глаз ${eye} мм, расстояние до экрана ${distance} мм, верх монитора ${top} мм`;
  const floorY = 268;
  const topY = 36;
  const axisX = 168;
  const drawW = 240;
  const maxH = Math.max(seat, desk, eye, top, 1);
  const scale = Math.min((floorY - topY) / maxH, drawW / Math.max(distance, 1));
  const yOf = (mm) => floorY - mm * scale;
  const monitorX = axisX + distance * scale;
  const deskEnd = Math.max(axisX + 70, monitorX);
  const monitorLabelLeft = monitorX > 340;

  return (
    <svg viewBox="0 0 440 300" role="img" aria-label={label} className="mt-4 block h-auto w-full max-w-full">
      <line x1="150" y1={floorY} x2="424" y2={floorY} className="stroke-line" strokeWidth="2" />
      <line
        x1={axisX - 26}
        y1={yOf(seat)}
        x2={axisX + 18}
        y2={yOf(seat)}
        className="stroke-accent"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <line x1={axisX} y1={yOf(seat)} x2={axisX} y2={yOf(eye)} className="stroke-ink" strokeWidth="2" />
      <circle cx={axisX} cy={yOf(eye)} r="5" className="fill-accent" />
      <line
        x1={axisX + 36}
        y1={yOf(desk)}
        x2={deskEnd}
        y2={yOf(desk)}
        className="stroke-ink"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <line
        x1={axisX}
        y1={yOf(eye)}
        x2={monitorX}
        y2={yOf(top)}
        className="stroke-muted"
        strokeWidth="1.5"
        strokeDasharray="4 3"
      />
      <line
        x1={monitorX}
        y1={yOf(top)}
        x2={monitorX}
        y2={Math.min(floorY - 4, yOf(top) + 42)}
        className="stroke-warn"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <text x="146" y={yOf(seat) + 4} textAnchor="end" className="fill-muted text-[12px]">{`Сиденье ${seat} мм`}</text>
      <text x="146" y={yOf(desk) + 4} textAnchor="end" className="fill-muted text-[12px]">{`Стол ${desk} мм`}</text>
      <text x="146" y={yOf(eye) + 4} textAnchor="end" className="fill-muted text-[12px]">{`Глаза ${eye} мм`}</text>
      <text
        x={monitorLabelLeft ? monitorX - 6 : monitorX + 8}
        y={Math.max(16, yOf(top) - 8)}
        textAnchor={monitorLabelLeft ? "end" : "start"}
        className="fill-muted text-[12px]"
      >{`Верх ${top} мм`}</text>
      <text
        x={(axisX + monitorX) / 2}
        y={Math.max(16, Math.min(yOf(eye), yOf(top)) - 8)}
        textAnchor="middle"
        className="fill-muted text-[12px]"
      >{`${distance} мм`}</text>
    </svg>
  );
}

function Ergonomics({ onDirty = () => {}, requestGo = () => {} }) {
  const skuErrorId = useId();
  const handErrorId = useId();
  const [phase, setPhase] = useState("loading");
  const [loadError, setLoadError] = useState(null);
  const [original, setOriginal] = useState(null);
  const [form, setForm] = useState(null);
  const [published, setPublished] = useState(undefined);
  const [catalog, setCatalog] = useState({ failed: false, people: [] });
  const [sampleText, setSampleText] = useState("");
  const [sampleOwn, setSampleOwn] = useState(false);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState(null);

  const aliveRef = useRef(true);
  const workingRef = useRef(false);
  const controllerRef = useRef(null);
  const originalRef = useRef(null);
  const formRef = useRef(null);
  const versionRef = useRef(null);
  const catalogRef = useRef(catalog);

  formRef.current = form;
  catalogRef.current = catalog;

  const personSkus = personSkusOf(catalog);
  const errors = form ? validateErgonomicsForm(form, { personSkus }) : {};
  const errorCount = Object.keys(errors).length;
  const dirty = phase === "ready" && Boolean(form && original) && isDirtyForm(form, formFromDraft(original));
  const canSave = dirty && errorCount === 0 && !working;
  const unpublished =
    phase === "ready" && original != null && (published === undefined || diffJson(published, original).total > 0);
  const workingDraft = form ? draftFromForm(original, form) : null;
  const range = workingDraft ? boundsRange(workingDraft.bounds) : null;
  const shownSample = !form ? "" : sampleOwn ? sampleText : form.defaults.heightCm;
  const sampleDraft = form
    ? draftFromForm(original, { ...form, defaults: { ...form.defaults, heightCm: shownSample } })
    : null;
  const targets = sampleDraft ? ergoTargets(sampleDraft.table, sampleDraft.defaults.heightCm) : null;
  const samples = workingDraft
    ? heightSamples(workingDraft.bounds, workingDraft.defaults).map((height) => ({
        height,
        targets: ergoTargets(workingDraft.table, height)
      }))
    : [];
  const sampleReady = samples.some((row) => row.targets);

  function edit(recipe) {
    setForm((prev) => recipe(prev));
    setNotice((prev) => (prev && (prev.kind === "saved" || prev.kind === "ok") ? null : prev));
  }

  function setBound(key, value) {
    edit((prev) => ({ ...prev, bounds: { ...prev.bounds, [key]: value } }));
  }

  function setDefault(key, value) {
    edit((prev) => ({ ...prev, defaults: { ...prev.defaults, [key]: value } }));
  }

  function setMannequin(key, value) {
    edit((prev) => ({ ...prev, mannequin: { ...prev.mannequin, [key]: value } }));
  }

  function setOffset(key, value) {
    edit((prev) => ({
      ...prev,
      mannequin: { ...prev.mannequin, offsetMm: { ...prev.mannequin.offsetMm, [key]: value } }
    }));
  }

  function setTable(key, value) {
    edit((prev) => ({ ...prev, table: { ...prev.table, [key]: value } }));
  }

  function setTolerance(key, value) {
    edit((prev) => ({
      ...prev,
      table: { ...prev.table, tolerance: { ...prev.table.tolerance, [key]: value } }
    }));
  }

  function adopt(section, catalogResult) {
    const source = section && section.draft;
    if (!objectDraft(source)) {
      setLoadError(["В разделе нет данных"]);
      setPhase("error");
      return false;
    }
    const next = structuredClone(source);
    originalRef.current = next;
    versionRef.current = section.draftVersion;
    setOriginal(next);
    setForm(formFromDraft(next));
    setPublished(section.published === undefined ? undefined : structuredClone(section.published));
    setCatalog({
      failed: Boolean(catalogResult && catalogResult.failed),
      people: catalogResult && !catalogResult.failed ? readPeople(catalogResult.section) : []
    });
    setSampleOwn(false);
    setSampleText("");
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
    loadPair(controller.signal)
      .then((pair) => {
        if (!alive) return;
        adopt(pair.section, pair.catalogResult);
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

  function openJson() {
    if (working) return;
    requestGo({ screen: "section", name: "ergonomics" });
  }

  function cancel() {
    if (working || !originalRef.current) return;
    setForm(formFromDraft(originalRef.current));
    setSampleOwn(false);
    setSampleText("");
    setNotice((prev) => (prev && prev.kind === "conflict" ? prev : null));
    onDirty(false);
  }

  async function loadLatest() {
    if (!confirmAction("Несохранённый текст пропадёт. Загрузить актуальную версию?")) return;
    if (!begin()) return;
    try {
      const pair = await loadPair(controllerRef.current.signal);
      if (!aliveRef.current) return;
      onDirty(false);
      if (!adopt(pair.section, pair.catalogResult)) return;
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
    const payload = draftFromForm(originalRef.current, formRef.current);
    if (sameJson(payload, originalRef.current)) {
      setForm(formFromDraft(originalRef.current));
      setSampleOwn(false);
      onDirty(false);
      finish();
      return;
    }
    const people = personSkusOf(catalogRef.current);
    if (Object.keys(validateErgonomicsForm(formRef.current, { personSkus: people })).length > 0) {
      finish();
      return;
    }
    try {
      setNotice(null);
      const saved = await saveDraft("ergonomics", payload, versionRef.current, { signal: controllerRef.current.signal });
      if (!aliveRef.current) return;
      try {
        const pair = await loadPair(controllerRef.current.signal);
        if (!aliveRef.current) return;
        onDirty(false);
        if (!adopt(pair.section, pair.catalogResult)) return;
        setNotice({ kind: "saved" });
      } catch (reloadErr) {
        if (stopIfAuth(reloadErr)) return;
        const next = structuredClone(payload);
        originalRef.current = next;
        versionRef.current = saved.draftVersion;
        setOriginal(next);
        setForm(formFromDraft(next));
        setSampleOwn(false);
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

  const knownSku = catalog.people.some((item) => item.sku === (form && form.mannequin.sku));

  return (
    <div aria-busy={working || undefined}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="m-0 text-2xl font-semibold">Эргономика</h1>
            {unpublished ? <Pill tone="warn">не опубликовано</Pill> : null}
          </div>
          <p className="mt-1 mb-0 text-sm text-muted">Как рост клиента превращается в размеры рабочего места</p>
        </div>
        <Btn disabled={working} onClick={openJson}>
          Режим JSON
        </Btn>
      </div>
      {phase === "loading" ? <Loading text="Загружаем раздел…" /> : null}
      {phase === "error" ? <ErrorBlock lines={loadError || ["Не получилось выполнить запрос"]} /> : null}
      {phase === "ready" && form ? (
        <>
          <fieldset disabled={working} className="m-0 w-full min-w-0 border-0 p-0">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] items-start gap-4 narrow:grid-cols-1">
              <div className="flex min-w-0 flex-col gap-4">
                <Card className="min-w-0 p-4">
                  <h2 className="m-0 mb-3 text-lg font-semibold">Рост клиента</h2>
                  <div className="flex flex-col gap-4">
                    <MeasureField
                      label="Минимальный рост, см"
                      error={errors["bounds.heightMinCm"]}
                      value={form.bounds.heightMinCm}
                      disabled={working}
                      onChange={(value) => setBound("heightMinCm", value)}
                    />
                    <MeasureField
                      label="Максимальный рост, см"
                      error={errors["bounds.heightMaxCm"]}
                      value={form.bounds.heightMaxCm}
                      disabled={working}
                      onChange={(value) => setBound("heightMaxCm", value)}
                    />
                    <MeasureField
                      label="Рост по умолчанию, см"
                      error={errors["defaults.heightCm"]}
                      value={form.defaults.heightCm}
                      disabled={working}
                      range={range}
                      onChange={(value) => setDefault("heightCm", value)}
                    />
                    <div>
                      <p className="m-0 mb-1 text-sm font-medium">Рабочая рука</p>
                      <Segmented
                        label="Рабочая рука"
                        items={HANDS}
                        value={form.defaults.hand === "left" || form.defaults.hand === "right" ? form.defaults.hand : ""}
                        disabled={working}
                        describedBy={errors["defaults.hand"] ? handErrorId : undefined}
                        onChange={(id) => setDefault("hand", id)}
                      />
                      {errors["defaults.hand"] ? (
                        <p id={handErrorId} className="mt-1 mb-0 text-sm text-bad" role="alert">
                          {errors["defaults.hand"]}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </Card>
                <Card className="min-w-0 p-4">
                  <h2 className="m-0 mb-3 text-lg font-semibold">Манекен</h2>
                  {catalog.failed ? (
                    <div className="mb-3">
                      <Banner kind="warn" text="Каталог не загрузился. Товар-манекен только для чтения." />
                    </div>
                  ) : null}
                  <div className="flex flex-col gap-4">
                    {catalog.failed ? (
                      <MeasureField label="Товар-манекен" value={form.mannequin.sku} disabled onChange={() => {}} />
                    ) : (
                      <div>
                        <Field label="Товар-манекен">
                          <Select
                            invalid={Boolean(errors["mannequin.sku"])}
                            value={form.mannequin.sku}
                            disabled={working}
                            aria-invalid={errors["mannequin.sku"] ? true : undefined}
                            aria-describedby={errors["mannequin.sku"] ? skuErrorId : undefined}
                            onChange={(event) => setMannequin("sku", event.target.value)}
                          >
                            <option value="">Не выбран</option>
                            {catalog.people.map((item) => (
                              <option key={item.sku} value={item.sku}>
                                {item.title === item.sku ? item.sku : `${item.title} · ${item.sku}`}
                              </option>
                            ))}
                            {form.mannequin.sku && !knownSku ? (
                              <option value={form.mannequin.sku}>{form.mannequin.sku}</option>
                            ) : null}
                          </Select>
                        </Field>
                        {errors["mannequin.sku"] ? (
                          <p id={skuErrorId} className="mt-1 mb-0 text-sm text-bad" role="alert">
                            {errors["mannequin.sku"]}
                          </p>
                        ) : null}
                      </div>
                    )}
                    <MeasureField
                      label="Рост манекена, см"
                      error={errors["mannequin.referenceHeightCm"]}
                      value={form.mannequin.referenceHeightCm}
                      disabled={working}
                      onChange={(value) => setMannequin("referenceHeightCm", value)}
                    />
                    <div>
                      <p className="m-0 text-sm font-medium">Смещение, мм</p>
                      <p className="mt-0.5 mb-2 text-sm text-muted">От −500 до 500</p>
                      <div className="grid grid-cols-3 gap-3 narrow:grid-cols-1">
                        <MeasureField
                          label="X"
                          error={errors["mannequin.offsetMm.x"]}
                          value={form.mannequin.offsetMm.x}
                          disabled={working}
                          onChange={(value) => setOffset("x", value)}
                        />
                        <MeasureField
                          label="Y"
                          error={errors["mannequin.offsetMm.y"]}
                          value={form.mannequin.offsetMm.y}
                          disabled={working}
                          onChange={(value) => setOffset("y", value)}
                        />
                        <MeasureField
                          label="Z"
                          error={errors["mannequin.offsetMm.z"]}
                          value={form.mannequin.offsetMm.z}
                          disabled={working}
                          onChange={(value) => setOffset("z", value)}
                        />
                      </div>
                    </div>
                  </div>
                </Card>
                <Card className="min-w-0 p-4">
                  <h2 className="m-0 mb-3 text-lg font-semibold">Формулы стола</h2>
                  <div className="flex flex-col gap-4">
                    <MeasureField
                      label="Высота сиденья: коэффициент на см роста"
                      hint="Сантиметры роста умножаются на это число — высота сиденья в миллиметрах."
                      error={errors["table.seatHeightFactor"]}
                      value={form.table.seatHeightFactor}
                      disabled={working}
                      decimal
                      onChange={(value) => setTable("seatHeightFactor", value)}
                    />
                    <MeasureField
                      label="Высота стола: коэффициент на см роста"
                      hint="Сантиметры роста умножаются на это число — высота стола в миллиметрах."
                      error={errors["table.deskHeightFactor"]}
                      value={form.table.deskHeightFactor}
                      disabled={working}
                      decimal
                      onChange={(value) => setTable("deskHeightFactor", value)}
                    />
                    <MeasureField
                      label="Глаза над сиденьем: коэффициент на см роста"
                      hint="Сантиметры роста умножаются на это число и прибавляются к высоте сиденья."
                      error={errors["table.eyeAboveSeatFactor"]}
                      value={form.table.eyeAboveSeatFactor}
                      disabled={working}
                      decimal
                      onChange={(value) => setTable("eyeAboveSeatFactor", value)}
                    />
                    <MeasureField
                      label="Расстояние до экрана: коэффициент на см роста"
                      hint="Сантиметры роста умножаются на это число, затем расстояние зажимается границами ниже."
                      error={errors["table.monitorDistanceFactor"]}
                      value={form.table.monitorDistanceFactor}
                      disabled={working}
                      decimal
                      onChange={(value) => setTable("monitorDistanceFactor", value)}
                    />
                    <div className="grid grid-cols-2 gap-3 narrow:grid-cols-1">
                      <MeasureField
                        label="Расстояние до экрана не меньше, мм"
                        hint="Нижняя граница расстояния до экрана."
                        error={errors["table.monitorDistanceMinMm"]}
                        value={form.table.monitorDistanceMinMm}
                        disabled={working}
                        onChange={(value) => setTable("monitorDistanceMinMm", value)}
                      />
                      <MeasureField
                        label="не больше, мм"
                        hint="Верхняя граница расстояния до экрана."
                        error={errors["table.monitorDistanceMaxMm"]}
                        value={form.table.monitorDistanceMaxMm}
                        disabled={working}
                        onChange={(value) => setTable("monitorDistanceMaxMm", value)}
                      />
                    </div>
                    <MeasureField
                      label="Сдвиг глаз к столу, мм"
                      hint="На сколько миллиметров глаза сдвинуты от центра кресла к столу. Можно оставить пустым."
                      error={errors["table.eyeForwardMm"]}
                      value={form.table.eyeForwardMm}
                      disabled={working}
                      onChange={(value) => setTable("eyeForwardMm", value)}
                    />
                  </div>
                </Card>
                <Card className="min-w-0 p-4">
                  <h2 className="m-0 mb-1 text-lg font-semibold">Допуски</h2>
                  <p className="mt-0 mb-3 text-sm text-muted">Когда отклонение считается проблемой</p>
                  <div className="flex flex-col gap-4">
                    <MeasureField
                      label="Высота стола, мм"
                      error={errors["table.tolerance.deskHeightMm"]}
                      value={form.table.tolerance.deskHeightMm}
                      disabled={working}
                      onChange={(value) => setTolerance("deskHeightMm", value)}
                    />
                    <MeasureField
                      label="Расстояние до экрана, мм"
                      error={errors["table.tolerance.monitorDistanceMm"]}
                      value={form.table.tolerance.monitorDistanceMm}
                      disabled={working}
                      onChange={(value) => setTolerance("monitorDistanceMm", value)}
                    />
                    <MeasureField
                      label="Верх монитора, мм"
                      error={errors["table.tolerance.monitorTopMm"]}
                      value={form.table.tolerance.monitorTopMm}
                      disabled={working}
                      onChange={(value) => setTolerance("monitorTopMm", value)}
                    />
                  </div>
                </Card>
              </div>
              <Card className="sticky top-16 z-10 max-h-[calc(100vh-8rem)] min-w-0 self-start overflow-auto p-4 narrow:static narrow:max-h-none">
                <h2 className="m-0 mb-3 text-lg font-semibold">Что получится</h2>
                <MeasureField
                  label="Рост для примера, см"
                  value={shownSample}
                  disabled={working}
                  range={range}
                  onChange={(value) => {
                    setSampleOwn(true);
                    setSampleText(value);
                  }}
                />
                <div className="mt-4">
                  {targets ? (
                    <>
                      <ValueTable targets={targets} />
                      <WorkplaceSketch targets={targets} />
                    </>
                  ) : (
                    <p className="m-0 text-sm text-muted">Не хватает данных для расчёта</p>
                  )}
                  {sampleReady ? <SampleTable rows={samples} /> : null}
                </div>
                <p className="mt-3 mb-0 text-xs text-muted">
                  Расчёт повторяет формулы сервера. Допуски на схеме не показываются.
                </p>
              </Card>
            </div>
          </fieldset>
          {dirty || notice ? (
            <div className="sticky bottom-0 z-20 mt-4 border-t border-line bg-paper py-3">
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

async function loadPair(signal) {
  const section = await getSection("ergonomics", { signal });
  try {
    const catalog = await getSection("catalog", { signal });
    return { section, catalogResult: { failed: false, section: catalog } };
  } catch (err) {
    if (isAbort(err) || (err && err.status === 401)) throw err;
    return { section, catalogResult: { failed: true, section: null } };
  }
}

export { Ergonomics };
