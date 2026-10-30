import { useEffect, useId, useRef, useState } from "react";
import {
  getHealth,
  getSection,
  isAbort,
  listSections,
  onWrite,
  publishSection,
  readJournal,
  rollbackSection
} from "../api/admin-api.js";
import { diffJson } from "../lib/diff-json.js";
import { healthLine, actionLabel, formatJournalDetail, formatLocalTime, problemLines } from "../lib/messages.js";
import { sectionLabel } from "../lib/sections.js";
import {
  filterJournal,
  publishOrder,
  publishReport,
  rollbackTarget,
  sectionCountText,
  unpublished
} from "../lib/versions.js";
import { Banner } from "../components/Banner.jsx";
import { confirmAction } from "../components/confirm.jsx";
import { ErrorBlock } from "../components/ErrorBlock.jsx";
import { Loading } from "../components/Loading.jsx";
import { Btn } from "../ui/Btn.jsx";
import { Card } from "../ui/Card.jsx";
import { Field } from "../ui/Field.jsx";
import { Pill } from "../ui/Pill.jsx";
import { Segmented } from "../ui/Segmented.jsx";

const LIMITS = [50, 100, 200];
const PREVIEW = 30;
const FILTERS = [
  { id: "all", text: "Все" },
  { id: "publish", text: "Публикации" },
  { id: "draft", text: "Правки" },
  { id: "model", text: "Модели" },
  { id: "knob", text: "Ручки" }
];
const INPUT =
  "w-full rounded-lg border bg-surface px-2.5 py-2 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60";
const LINKED =
  "Анкета, каталог и диалог связаны между собой. Если правили связанные места, публикуйте вместе.";

function versionText(value) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "—";
}

function reconcile(prev, list) {
  const names = unpublished(list).map((item) => item.name);
  const selected = new Set();
  for (const name of names) {
    if (!prev.known.has(name) || prev.selected.has(name)) selected.add(name);
  }
  return { known: new Set(names), selected };
}

function rollbackText(target, list) {
  const dirty = unpublished(list).some((item) => item.name === target.section);
  const extra = dirty ? " Несохранённый черновик раздела будет заменён." : "";
  return `Откатить раздел «${sectionLabel(target.section)}» на версию ${target.version}? Черновик тоже вернётся к этой версии.${extra}`;
}

function DraftHealth({ draft }) {
  const line = healthLine("Проверка данных", draft);
  if (line.ok) return <Pill tone="ok">Проверка данных: ошибок нет</Pill>;
  const lines = line.errors.length > 0 ? line.errors : [line.text];
  return (
    <div>
      <Pill tone="bad">Проверка данных: найдены ошибки</Pill>
      <div className="mt-2">
        <ErrorBlock lines={lines} />
      </div>
    </div>
  );
}

function DiffTable({ diff, expanded, working, onExpand }) {
  const shown = expanded ? diff.rows : diff.rows.slice(0, PREVIEW);
  const hidden = !expanded && diff.rows.length > PREVIEW;
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="text-muted">
            <th scope="col" className="border-b border-line px-2 py-1 font-medium">
              Поле
            </th>
            <th scope="col" className="border-b border-line px-2 py-1 font-medium">
              Сейчас у клиента
            </th>
            <th scope="col" className="border-b border-line px-2 py-1 font-medium">
              После публикации
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((item) => (
            <tr key={`${item.kind}:${item.path}`}>
              <td className="border-b border-line px-2 py-1 align-top [overflow-wrap:anywhere]">{item.path}</td>
              <td className="border-b border-line bg-bad-soft px-2 py-1 align-top [overflow-wrap:anywhere]">{item.was}</td>
              <td className="border-b border-line bg-accent-soft px-2 py-1 align-top [overflow-wrap:anywhere]">{item.now}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {diff.truncated ? (
        <p className="mt-2 mb-0 text-sm text-muted">
          {`показано ${diff.rows.length} из ${diff.total}`}
        </p>
      ) : null}
      {hidden ? (
        <div className="mt-2">
          <Btn size="sm" disabled={working} onClick={onExpand}>
            {`Показать все (${diff.total})`}
          </Btn>
        </div>
      ) : null}
    </div>
  );
}

function ChangeRow({ item, state, open, expanded, working, onToggleCheck, onToggleOpen, onExpand, onRetry }) {
  const checkedId = useId();
  return (
    <div className="border-b border-line py-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={checkedId} className="flex items-center gap-2 font-medium">
          <input
            id={checkedId}
            type="checkbox"
            className="h-4 w-4 accent-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed"
            checked={item.checked}
            disabled={working}
            onChange={() => onToggleCheck(item.name)}
          />
          {item.label}
        </label>
        <span className="text-sm text-muted">
          {`опубликовано v${versionText(item.publishedVersion)}, черновик v${versionText(item.draftVersion)}`}
        </span>
        {state?.status === "ready" ? (
          <Pill tone={state.first ? "ok" : "warn"}>{state.first ? "первая публикация" : `изменено полей: ${state.diff.total}`}</Pill>
        ) : null}
        {state?.status === "loading" || !state ? <span className="text-sm text-muted">считаем…</span> : null}
        {state?.status === "error" ? (
          <>
            <span className="text-sm text-bad [overflow-wrap:anywhere]">{state.lines.join(". ")}</span>
            <Btn size="sm" disabled={working} onClick={() => onRetry(item.name)}>
              Повторить
            </Btn>
          </>
        ) : null}
        {state?.status === "ready" ? (
          <Btn size="sm" disabled={working} onClick={() => onToggleOpen(item.name)}>
            {open ? "Скрыть разницу" : "Показать разницу"}
          </Btn>
        ) : null}
      </div>
      {open && state?.status === "ready" ? (
        <DiffTable diff={state.diff} expanded={expanded} working={working} onExpand={() => onExpand(item.name)} />
      ) : null}
    </div>
  );
}

function JournalList({ entries, working, onRollback }) {
  if (entries.length === 0) return <p className="mt-3 mb-0 text-muted">Записей пока нет</p>;
  return (
    <ul className="m-0 mt-3 list-none p-0">
      {entries.map((entry, index) => {
        const target = rollbackTarget(entry);
        const marked = entry.action === "publish" || entry.action === "rollback";
        return (
          <li
            key={`${entry && entry.ts ? entry.ts : "row"}-${index}`}
            className="flex flex-wrap items-start gap-2 border-b border-line py-2"
          >
            <span
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${marked ? "bg-accent" : "bg-muted"}`}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="m-0 font-semibold">
                {`${sectionLabel(entry && entry.section)} · ${actionLabel(entry && entry.action)}`}
              </p>
              <p className="m-0 text-sm text-muted [overflow-wrap:anywhere]">
                {`${formatLocalTime(entry && entry.ts)}. ${formatJournalDetail(entry && entry.detail)}`}
              </p>
            </div>
            {target ? (
              <Btn size="sm" disabled={working} onClick={() => onRollback(target)}>
                Откатить
              </Btn>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function Versions() {
  const leftId = useId();
  const rightId = useId();
  const errorId = useId();
  const descriptionRef = useRef(null);
  const aliveRef = useRef(true);
  const workingRef = useRef(false);
  const publishAbortRef = useRef(null);

  const [list, setList] = useState(null);
  const [listError, setListError] = useState(null);
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState(null);
  const [rows, setRows] = useState(null);
  const [journalError, setJournalError] = useState(null);
  const [diffs, setDiffs] = useState({});
  const [selection, setSelection] = useState({ known: new Set(), selected: new Set() });
  const [open, setOpen] = useState({});
  const [full, setFull] = useState({});
  const [description, setDescription] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const [rollbackError, setRollbackError] = useState(null);
  const [work, setWork] = useState(null);
  const [limit, setLimit] = useState(50);
  const [filter, setFilter] = useState("all");
  const [tick, setTick] = useState(0);

  const working = work !== null;
  const pending = unpublished(list);
  const selectedCount = pending.filter((item) => selection.selected.has(item.name)).length;
  const draftOk = Boolean(health && health.draft && health.draft.ok === true);
  const visible = filterJournal(rows || [], filter);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      publishAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    return onWrite(() => {
      if (workingRef.current) return;
      setTick((value) => value + 1);
    });
  }, []);

  useEffect(() => {
    function onWake() {
      if (document.visibilityState === "hidden") return;
      if (workingRef.current) return;
      setTick((value) => value + 1);
    }
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    const signal = controller.signal;

    listSections({ signal }).then(
      (value) => {
        if (!alive) return;
        const next = Array.isArray(value) ? value : [];
        setList(next);
        setListError(null);
        setSelection((prev) => reconcile(prev, next));
      },
      (err) => {
        if (!alive || isAbort(err) || err?.status === 401) return;
        setListError(problemLines(err.status, err.body));
      }
    );
    getHealth({ signal }).then(
      (value) => {
        if (!alive) return;
        setHealth(value && typeof value === "object" ? value : null);
        setHealthError(null);
      },
      (err) => {
        if (!alive || isAbort(err) || err?.status === 401) return;
        setHealthError(problemLines(err.status, err.body));
      }
    );
    readJournal(limit, { signal }).then(
      (value) => {
        if (!alive) return;
        setRows(Array.isArray(value) ? [...value].reverse() : []);
        setJournalError(null);
      },
      (err) => {
        if (!alive || isAbort(err) || err?.status === 401) return;
        setJournalError(problemLines(err.status, err.body));
      }
    );

    return () => {
      alive = false;
      controller.abort();
    };
  }, [limit, tick]);

  useEffect(() => {
    if (!Array.isArray(list)) return undefined;
    const names = unpublished(list).map((item) => item.name);
    const controller = new AbortController();
    let alive = true;

    setDiffs((prev) => {
      const next = {};
      for (const name of names) {
        const current = prev[name];
        next[name] = current && current.status === "ready" ? current : { status: "loading" };
      }
      return next;
    });

    for (const name of names) {
      getSection(name, { signal: controller.signal }).then(
        (data) => {
          if (!alive) return;
          const payload = data && typeof data === "object" ? data : {};
          setDiffs((prev) => ({
            ...prev,
            [name]: {
              status: "ready",
              diff: diffJson(payload.published, payload.draft),
              first: payload.published === undefined
            }
          }));
        },
        (err) => {
          if (!alive || isAbort(err) || err?.status === 401) return;
          setDiffs((prev) => ({
            ...prev,
            [name]: { status: "error", lines: problemLines(err.status, err.body) }
          }));
        }
      );
    }

    return () => {
      alive = false;
      controller.abort();
    };
  }, [list]);

  function toggleCheck(name) {
    setSelection((prev) => {
      const selected = new Set(prev.selected);
      if (selected.has(name)) selected.delete(name);
      else selected.add(name);
      return { ...prev, selected };
    });
  }

  function retryDiff(name) {
    if (workingRef.current) return;
    setDiffs((prev) => ({ ...prev, [name]: { status: "loading" } }));
    getSection(name).then(
      (data) => {
        if (!aliveRef.current) return;
        const payload = data && typeof data === "object" ? data : {};
        setDiffs((prev) => ({
          ...prev,
          [name]: {
            status: "ready",
            diff: diffJson(payload.published, payload.draft),
            first: payload.published === undefined
          }
        }));
      },
      (err) => {
        if (!aliveRef.current || isAbort(err) || err?.status === 401) return;
        setDiffs((prev) => ({
          ...prev,
          [name]: { status: "error", lines: problemLines(err.status, err.body) }
        }));
      }
    );
  }

  async function publishSelected() {
    if (workingRef.current || !draftOk) return;
    const text = description.trim();
    if (!text) {
      setInvalid(true);
      descriptionRef.current?.focus();
      return;
    }
    const names = publishOrder(pending.filter((item) => selection.selected.has(item.name)).map((item) => item.name));
    if (names.length === 0) return;
    const labels = names.map((name) => sectionLabel(name)).join(", ");
    if (!confirmAction(`Опубликовать: ${labels}? Клиент увидит эти данные.`)) return;
    if (workingRef.current) return;

    workingRef.current = true;
    setWork("publish");
    setOutcome(null);
    const controller = new AbortController();
    publishAbortRef.current = controller;
    const results = [];
    let problems = [];
    try {
      for (const name of names) {
        try {
          const result = await publishSection(name, text, { signal: controller.signal });
          results.push({ name, ok: true, version: result && result.publishedVersion });
        } catch (err) {
          if (!aliveRef.current || isAbort(err) || err?.status === 401) return;
          problems = problemLines(err.status, err.body);
          results.push({ name, ok: false, problem: problems[0] || "" });
          break;
        }
      }
      if (!aliveRef.current) return;
      const report = publishReport(results);
      let published = null;
      let publishedProblem = null;
      try {
        const nextHealth = await getHealth({ signal: controller.signal });
        if (!aliveRef.current) return;
        published = nextHealth && nextHealth.published;
        setHealth(nextHealth && typeof nextHealth === "object" ? nextHealth : null);
        setHealthError(null);
      } catch (err) {
        if (!aliveRef.current || isAbort(err) || err?.status === 401) return;
        publishedProblem = problemLines(err.status, err.body);
      }
      setOutcome({ report, problems, published, publishedProblem });
      if (results.length > 0 && results.every((item) => item.ok)) {
        setDescription("");
        setInvalid(false);
      }
      setTick((value) => value + 1);
    } finally {
      workingRef.current = false;
      if (aliveRef.current) setWork(null);
    }
  }

  async function rollback(target) {
    if (workingRef.current) return;
    if (!confirmAction(rollbackText(target, list))) return;
    if (workingRef.current) return;
    workingRef.current = true;
    setWork("rollback");
    setRollbackError(null);
    setOutcome(null);
    try {
      await rollbackSection(target.section, target.version);
      if (!aliveRef.current) return;
      setTick((value) => value + 1);
    } catch (err) {
      if (!aliveRef.current || isAbort(err) || err?.status === 401) return;
      setRollbackError(problemLines(err.status, err.body));
    } finally {
      workingRef.current = false;
      if (aliveRef.current) setWork(null);
    }
  }

  const publishedLine = outcome && outcome.published ? healthLine("Проверка опубликованного", outcome.published) : null;

  return (
    <>
      <h1 className="mt-0 mb-4 text-[1.6rem] leading-tight font-semibold">Версии и журнал</h1>
      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start gap-4 narrow:grid-cols-1">
        <Card aria-labelledby={leftId} className="min-w-0 p-4">
          <h2 id={leftId} className="mt-0 mb-3 text-lg font-semibold">
            Изменения к публикации
          </h2>
          {healthError ? <ErrorBlock lines={healthError} /> : null}
          {!healthError && !health ? <p className="m-0 text-sm text-muted">Проверка данных…</p> : null}
          {health ? <DraftHealth draft={health.draft} /> : null}
          {outcome ? (
            <div className="mt-3">
              <Banner kind={outcome.report.failed.length > 0 ? "error" : "ok"} text={outcome.report.text} />
              {outcome.problems.length > 0 ? <ErrorBlock lines={outcome.problems} /> : null}
              {outcome.publishedProblem ? <ErrorBlock lines={outcome.publishedProblem} /> : null}
              {publishedLine ? <p className="m-0 text-sm">{publishedLine.text}</p> : null}
              {publishedLine && !publishedLine.ok && publishedLine.errors.length > 0 ? (
                <div className="mt-2">
                  <ErrorBlock lines={publishedLine.errors} />
                </div>
              ) : null}
            </div>
          ) : null}
          {list == null && !listError ? (
            <div className="mt-3">
              <Loading />
            </div>
          ) : null}
          {listError ? <ErrorBlock lines={listError} /> : null}
          {list && pending.length === 0 ? <p className="mt-3 mb-0 text-muted">Все изменения опубликованы</p> : null}
          {pending.length > 0 ? (
            <>
              <div className="mt-2">
                {pending.map((item) => (
                  <ChangeRow
                    key={item.name}
                    item={{ ...item, checked: selection.selected.has(item.name) }}
                    state={diffs[item.name]}
                    open={Boolean(open[item.name])}
                    expanded={Boolean(full[item.name])}
                    working={working}
                    onToggleCheck={toggleCheck}
                    onToggleOpen={(name) => setOpen((prev) => ({ ...prev, [name]: !prev[name] }))}
                    onExpand={(name) => setFull((prev) => ({ ...prev, [name]: true }))}
                    onRetry={retryDiff}
                  />
                ))}
              </div>
              {selectedCount < pending.length ? <p className="mt-3 mb-0 text-sm text-muted">{LINKED}</p> : null}
              <div className="mt-4">
                <Field label="Что изменено (попадёт в журнал)">
                  <input
                    ref={descriptionRef}
                    className={`${INPUT} ${invalid ? "border-bad" : "border-line"}`}
                    type="text"
                    autoComplete="off"
                    value={description}
                    disabled={working}
                    aria-invalid={invalid ? "true" : undefined}
                    aria-describedby={invalid ? errorId : undefined}
                    onChange={(event) => {
                      setDescription(event.target.value);
                      if (event.target.value.trim()) setInvalid(false);
                    }}
                  />
                </Field>
                {invalid ? (
                  <p id={errorId} className="mt-1 mb-0 text-sm text-bad" role="alert">
                    Опишите, что изменено
                  </p>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Btn kind="primary" disabled={working || !draftOk || selectedCount === 0} onClick={publishSelected}>
                  {`Опубликовать ${sectionCountText(selectedCount)}`}
                </Btn>
                {work === "publish" ? <span className="text-sm text-muted">Публикуем…</span> : null}
              </div>
            </>
          ) : null}
        </Card>
        <Card aria-labelledby={rightId} className="min-w-0 p-4">
          <h2 id={rightId} className="mt-0 mb-3 text-lg font-semibold">
            История и журнал
          </h2>
          <Segmented label="Фильтр журнала" items={FILTERS} value={filter} disabled={working} onChange={setFilter} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <span>Сколько записей</span>
              <select
                className="rounded-lg border border-line bg-surface px-2.5 py-2 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
                value={String(limit)}
                disabled={working}
                onChange={(event) => setLimit(Number(event.target.value))}
              >
                {LIMITS.map((value) => (
                  <option key={value} value={String(value)}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <Btn disabled={working} onClick={() => setTick((value) => value + 1)}>
              Обновить
            </Btn>
            {work === "rollback" ? <span className="text-sm text-muted">Откатываем…</span> : null}
          </div>
          {journalError ? <ErrorBlock lines={journalError} /> : null}
          {rows == null && !journalError ? <Loading /> : null}
          {rows ? <JournalList entries={visible} working={working} onRollback={rollback} /> : null}
          {rollbackError ? <ErrorBlock lines={rollbackError} /> : null}
        </Card>
      </div>
    </>
  );
}

export { Versions };
