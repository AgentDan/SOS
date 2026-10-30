import { useEffect, useMemo, useState } from "react";
import { getHealth, getSection, isAbort, listSections, readJournal } from "../api/admin-api.js";
import { buildLinkMap, summarizeProblems } from "../lib/link-map.js";
import { gapRows, homeStats, recentRows, routeForSection } from "../lib/home.js";
import { actionLabel, dataVersionText, formatJournalDetail, formatLocalTime, healthLine, problemLines } from "../lib/messages.js";
import { labelSections, sectionLabel } from "../lib/sections.js";
import { sectionCountText, unpublished } from "../lib/versions.js";
import { Btn } from "../ui/Btn.jsx";
import { Card } from "../ui/Card.jsx";
import { Pill } from "../ui/Pill.jsx";

const HEALTH_TITLES = [
  ["draft", "черновик"],
  ["published", "опубликованное"],
  ["knobs", "ручки"]
];
const GAP_PREVIEW = 8;
const LINK =
  "text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function draftOf(section) {
  if (!section || typeof section !== "object") return {};
  const draft = section.draft;
  return draft && typeof draft === "object" ? draft : {};
}

function versionNum(value) {
  return typeof value === "number" && Number.isFinite(value) ? `v${value}` : "—";
}

function versionLine(item) {
  return `опубликовано ${versionNum(item.publishedVersion)} · черновик ${versionNum(item.draftVersion)}`;
}

function linesOf(slot) {
  return slot && Array.isArray(slot.lines) && slot.lines.length > 0 ? slot.lines : ["Не получилось выполнить запрос"];
}

function errorLines(...slots) {
  const lines = [];
  for (const slot of slots) {
    if (!slot || slot.status !== "error") continue;
    for (const line of linesOf(slot)) {
      if (!lines.includes(line)) lines.push(line);
    }
  }
  return lines.length > 0 ? lines : ["Не получилось выполнить запрос"];
}

function LoadError({ lines }) {
  const list = Array.isArray(lines) && lines.length > 0 ? lines : ["Не получилось выполнить запрос"];
  return (
    <ul className="m-0 list-disc pl-5 text-bad" role="alert">
      {list.map((line, index) => (
        <li key={`${index}:${line}`} className="[overflow-wrap:anywhere]">
          {line}
        </li>
      ))}
    </ul>
  );
}

function Block({ title, status, lines, children, extra }) {
  return (
    <Card className="min-w-0 p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-lg font-semibold">{title}</h2>
        {extra}
      </div>
      {status === "loading" ? <p className="m-0 text-muted">Загрузка…</p> : null}
      {status === "error" ? <LoadError lines={lines} /> : null}
      {status === "ready" ? children : null}
    </Card>
  );
}

function Stat({ label, status, lines, value, note, noteWarn = false, action }) {
  return (
    <Card as="div" className="min-w-0 p-4">
      <p className="m-0 text-sm text-muted">{label}</p>
      {status === "loading" ? <p className="mt-2 mb-0 text-muted">Загрузка…</p> : null}
      {status === "error" ? (
        <div className="mt-2">
          <LoadError lines={lines} />
        </div>
      ) : null}
      {status === "ready" ? (
        <>
          <p className="mt-1 mb-0 text-2xl font-semibold [overflow-wrap:anywhere]">{value}</p>
          {note ? <p className={`mt-1 mb-0 text-sm ${noteWarn ? "text-warn" : "text-muted"}`}>{note}</p> : null}
          {action ? <div className="mt-3">{action}</div> : null}
        </>
      ) : null}
    </Card>
  );
}

function HealthLine({ title, report }) {
  const line = healthLine(title, report);
  if (line.ok) {
    return (
      <p className="mt-0 mb-2">
        <span>{`${title}: `}</span>
        <span className="font-semibold text-accent">Ок</span>
      </p>
    );
  }
  const errors = line.errors.length > 0 ? line.errors : [line.text];
  return (
    <div className="mt-0 mb-2 text-bad">
      <p className="m-0 font-semibold">{line.text}</p>
      <ul className="m-0 list-disc pl-5">
        {errors.map((item, index) => (
          <li key={`${index}:${item}`} className="[overflow-wrap:anywhere]">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Home({ requestGo = () => {} }) {
  const [pack, setPack] = useState({
    sections: { status: "loading" },
    health: { status: "loading" },
    journal: { status: "loading" },
    catalog: { status: "loading" },
    questionnaire: { status: "loading" }
  });
  const [gapsOpen, setGapsOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    const signal = controller.signal;
    Promise.allSettled([
      listSections({ signal }),
      getHealth({ signal }),
      readJournal(6, { signal }),
      getSection("catalog", { signal }),
      getSection("questionnaire", { signal })
    ]).then((results) => {
      if (!alive) return;
      const names = ["sections", "health", "journal", "catalog", "questionnaire"];
      const next = {};
      for (let index = 0; index < names.length; index += 1) {
        const result = results[index];
        if (result.status === "fulfilled") {
          next[names[index]] = { status: "ready", value: result.value };
          continue;
        }
        const reason = result.reason;
        if (isAbort(reason) || (reason && reason.status === 401)) return;
        next[names[index]] = { status: "error", lines: problemLines(reason && reason.status, reason && reason.body) };
      }
      setPack(next);
    });
    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  const link = useMemo(() => {
    if (pack.catalog.status !== "ready" || pack.questionnaire.status !== "ready") return null;
    return buildLinkMap({
      questionnaire: draftOf(pack.questionnaire.value),
      catalog: draftOf(pack.catalog.value)
    });
  }, [pack.catalog, pack.questionnaire]);

  const stats = useMemo(() => {
    return homeStats({
      catalog: pack.catalog.status === "ready" ? draftOf(pack.catalog.value) : null,
      questionnaire: pack.questionnaire.status === "ready" ? draftOf(pack.questionnaire.value) : null,
      problems: link ? link.problems : []
    });
  }, [pack.catalog, pack.questionnaire, link]);

  const gaps = link ? gapRows(link.problems, link.nodes) : [];
  const summary = link ? summarizeProblems(link.problems).filter((row) => row.count > 0) : [];
  const shownGaps = gapsOpen ? gaps : gaps.slice(0, GAP_PREVIEW);
  const pending = pack.sections.status === "ready" ? unpublished(pack.sections.value) : [];
  const tiles = pack.sections.status === "ready" ? labelSections(pack.sections.value) : [];
  const journal = pack.journal.status === "ready" ? recentRows(pack.journal.value, 6) : [];
  const needsStatus =
    pack.catalog.status === "loading" || pack.questionnaire.status === "loading"
      ? "loading"
      : pack.catalog.status === "error"
        ? "error"
        : pack.questionnaire.status === "error"
          ? "error"
          : "ready";
  const needsLines = errorLines(pack.catalog, pack.questionnaire);
  const gapStatus =
    pack.catalog.status === "loading" || pack.questionnaire.status === "loading"
      ? "loading"
      : pack.catalog.status === "error"
        ? "error"
        : pack.questionnaire.status === "error"
          ? "error"
          : "ready";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="m-0 text-2xl font-semibold">Главная</h1>
        <p className="mt-1 mb-0 text-sm text-muted">Провести продажу и сделать клиента лояльным</p>
      </div>

      <div className="grid grid-cols-4 gap-3 narrow:grid-cols-1">
        <Stat
          label="Товары"
          status={pack.catalog.status}
          lines={linesOf(pack.catalog)}
          value={stats.products}
          note={`без модели: ${stats.withoutModel}`}
        />
        <Stat
          label="Вопросы"
          status={pack.questionnaire.status}
          lines={linesOf(pack.questionnaire)}
          value={stats.questions}
          note={`ответов: ${stats.answers}`}
        />
        <Stat
          label="Потребности"
          status={needsStatus}
          lines={needsLines}
          value={stats.needs}
          note={`без вывода: ${stats.needsWithoutAnswer}`}
          noteWarn={stats.needsWithoutAnswer > 0}
        />
        <Stat
          label="Не опубликовано"
          status={pack.sections.status}
          lines={linesOf(pack.sections)}
          value={pending.length === 0 ? "Всё опубликовано" : sectionCountText(pending.length)}
          action={
            pending.length === 0 ? null : (
              <Btn size="sm" kind="primary" onClick={() => requestGo({ screen: "journal" })}>
                Проверить и опубликовать
              </Btn>
            )
          }
        />
      </div>

      <div className="grid grid-cols-2 items-start gap-4 narrow:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-4">
          <Block title="Не опубликовано" status={pack.sections.status} lines={linesOf(pack.sections)}>
            {pending.length === 0 ? (
              <p className="m-0 text-muted">Все изменения опубликованы</p>
            ) : (
              <ul className="m-0 list-none p-0">
                {pending.map((item) => (
                  <li key={item.name} className="flex flex-wrap items-center gap-2 border-b border-line py-2">
                    <div className="min-w-0 flex-1">
                      <p className="m-0 font-medium">{item.label}</p>
                      <p className="m-0 text-sm text-muted">{versionLine(item)}</p>
                    </div>
                    <Btn size="sm" onClick={() => requestGo({ screen: "journal" })}>
                      Показать разницу
                    </Btn>
                    <Btn size="sm" onClick={() => requestGo(routeForSection(item.name))}>
                      Открыть
                    </Btn>
                  </li>
                ))}
              </ul>
            )}
          </Block>

          <Block
            title="Дыры в данных"
            status={gapStatus}
            lines={needsLines}
            extra={
              gapStatus === "ready" ? (
                <a className={LINK} href="#/map">
                  На карте связей
                </a>
              ) : null
            }
          >
            {gaps.length === 0 ? (
              <p className="m-0 text-muted">Дыр не найдено</p>
            ) : (
              <>
                {summary.length > 0 ? (
                  <ul className="m-0 mb-3 list-none p-0 text-sm">
                    {summary.map((row) => (
                      <li key={row.id} className="mb-1">
                        {`${row.label}: ${row.count}`}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <ul className="m-0 list-none p-0">
                  {shownGaps.map((row, index) => (
                    <li key={`${row.level}:${index}:${row.text}`} className="flex flex-wrap items-start gap-2 border-b border-line py-2">
                      <span className={`w-28 shrink-0 text-xs font-medium ${row.level === "error" ? "text-bad" : "text-warn"}`}>
                        {row.level === "error" ? "Ошибка" : "Внимание"}
                      </span>
                      <p className="m-0 min-w-0 flex-1 [overflow-wrap:anywhere]">{row.text}</p>
                      {row.route ? (
                        <Btn size="sm" onClick={() => requestGo(row.route)}>
                          Открыть
                        </Btn>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {gaps.length > GAP_PREVIEW && !gapsOpen ? (
                  <div className="mt-3">
                    <Btn size="sm" onClick={() => setGapsOpen(true)}>
                      {`Показать все (${gaps.length})`}
                    </Btn>
                  </div>
                ) : null}
              </>
            )}
          </Block>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Block title="Здоровье данных" status={pack.health.status} lines={linesOf(pack.health)}>
            <p className="mt-0 mb-2">{dataVersionText(pack.health.value && pack.health.value.dataVersion)}</p>
            {HEALTH_TITLES.map(([key, title]) => (
              <HealthLine key={key} title={title} report={pack.health.value && pack.health.value[key]} />
            ))}
          </Block>

          <Block
            title="Последние правки"
            status={pack.journal.status}
            lines={linesOf(pack.journal)}
            extra={
              pack.journal.status === "ready" ? (
                <a className={LINK} href="#/journal">
                  Весь журнал
                </a>
              ) : null
            }
          >
            {journal.length === 0 ? (
              <p className="m-0 text-muted">Записей пока нет</p>
            ) : (
              <ul className="m-0 list-none p-0">
                {journal.map((entry, index) => (
                  <li key={`${entry.ts || "row"}-${index}`} className="border-b border-line py-2">
                    <p className="m-0">
                      <span className="text-muted">{formatLocalTime(entry.ts)}</span>
                      {` · ${actionLabel(entry.action)} · ${sectionLabel(entry.section)}`}
                    </p>
                    <p className="m-0 text-sm text-muted [overflow-wrap:anywhere]">{formatJournalDetail(entry.detail)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Block>
        </div>
      </div>

      <Block title="Разделы" status={pack.sections.status} lines={linesOf(pack.sections)}>
        {tiles.length === 0 ? (
          <p className="m-0 text-muted">Разделов пока нет</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            {tiles.map((item) => (
              <button
                key={item.name}
                type="button"
                className="flex cursor-pointer flex-col items-start gap-1 rounded-xl border border-line bg-surface px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                onClick={() => requestGo(routeForSection(item.name))}
              >
                <span className="font-semibold">{item.label}</span>
                {item.hasUnpublishedChanges ? <Pill tone="warn">не опубликовано</Pill> : null}
                <span className="text-sm text-muted">{versionLine(item)}</span>
              </button>
            ))}
          </div>
        )}
      </Block>
    </div>
  );
}

export { Home };
