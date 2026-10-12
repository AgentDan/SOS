import { useEffect, useRef, useState } from "react";
import { isAbort, readJournal } from "../api/admin-api.js";
import { actionLabel, formatJournalDetail, formatLocalTime, problemLines } from "../lib/messages.js";
import { sectionLabel } from "../lib/sections.js";
import { DataTable } from "../components/DataTable.jsx";
import { ErrorBlock } from "../components/ErrorBlock.jsx";
import { Loading } from "../components/Loading.jsx";

const LIMITS = [50, 100, 200];

function JournalTable({ entries }) {
  if (entries.length === 0) return <p className="text-muted">Записей пока нет</p>;
  return (
    <DataTable
      columns={[
        { key: "ts", title: "Время", render: (entry) => formatLocalTime(entry && entry.ts) },
        { key: "action", title: "Действие", render: (entry) => actionLabel(entry && entry.action) },
        { key: "section", title: "Раздел", render: (entry) => sectionLabel(entry && entry.section) },
        { key: "detail", title: "Детали", render: (entry) => formatJournalDetail(entry && entry.detail) }
      ]}
      rows={entries}
      rowKey={(entry, index) => `${entry && entry.ts ? entry.ts : "row"}-${index}`}
    />
  );
}

function Journal() {
  const [limit, setLimit] = useState(50);
  const [refresh, setRefresh] = useState(0);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [working, setWorking] = useState(false);
  const workingRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;

    async function load() {
      if (workingRef.current) return;
      workingRef.current = true;
      setWorking(true);
      setError(null);
      try {
        const entries = await readJournal(limit, { signal: controller.signal });
        if (!alive) return;
        setRows(Array.isArray(entries) ? [...entries].reverse() : []);
      } catch (err) {
        if (!alive || isAbort(err) || err.status === 401) return;
        setRows(null);
        setError(problemLines(err.status, err.body));
      } finally {
        if (alive) {
          workingRef.current = false;
          setWorking(false);
        }
      }
    }

    load();
    return () => {
      alive = false;
      workingRef.current = false;
      controller.abort();
    };
  }, [limit, refresh]);

  return (
    <>
      <h1>Журнал правок</h1>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-row items-center gap-2">
          <span>Сколько записей</span>
          <select
            className="w-auto"
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
        <button type="button" disabled={working} onClick={() => setRefresh((value) => value + 1)}>
          Обновить
        </button>
      </div>
      <div className="empty:hidden">{error ? <ErrorBlock lines={error} /> : null}</div>
      <div className="mb-4 overflow-x-auto">
        {error ? null : rows == null ? <Loading /> : <JournalTable entries={rows} />}
      </div>
    </>
  );
}

export { Journal };
