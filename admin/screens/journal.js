import { isAbort, readJournal } from "../api/admin-api.js";
import { actionLabel, formatJournalDetail, formatLocalTime, problemLines } from "../lib/messages.js";
import { sectionLabel } from "../lib/sections.js";
import { el, errorBlock, loading } from "../ui.js";

const LIMITS = [50, 100, 200];

function journalTable(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return el("p", { className: "muted", text: "Записей пока нет" });
  }
  const body = el("tbody");
  for (const entry of entries) {
    body.append(
      el(
        "tr",
        null,
        el("td", { text: formatLocalTime(entry && entry.ts) }),
        el("td", { text: actionLabel(entry && entry.action) }),
        el("td", { text: sectionLabel(entry && entry.section) }),
        el("td", { text: formatJournalDetail(entry && entry.detail) })
      )
    );
  }
  return el(
    "table",
    null,
    el(
      "thead",
      null,
      el(
        "tr",
        null,
        el("th", { scope: "col", text: "Время" }),
        el("th", { scope: "col", text: "Действие" }),
        el("th", { scope: "col", text: "Раздел" }),
        el("th", { scope: "col", text: "Детали" })
      )
    ),
    body
  );
}

function mountJournal(root) {
  const controller = new AbortController();
  let alive = true;
  let limit = 50;
  let working = false;
  const status = el("div", { className: "status" });
  const tableHost = el("div", { className: "table-wrap" });
  const select = el("select");
  for (const value of LIMITS) {
    select.append(el("option", { value: String(value), text: String(value) }));
  }
  const refresh = el("button", { type: "button", text: "Обновить" });

  function setWorking(on) {
    working = on;
    refresh.disabled = on;
    select.disabled = on;
  }

  async function load() {
    if (working) return;
    setWorking(true);
    status.replaceChildren();
    try {
      const entries = await readJournal(limit, { signal: controller.signal });
      if (!alive) return;
      const rows = Array.isArray(entries) ? [...entries].reverse() : [];
      tableHost.replaceChildren(journalTable(rows));
    } catch (err) {
      if (!alive || isAbort(err) || err.status === 401) return;
      tableHost.replaceChildren();
      status.replaceChildren(errorBlock(problemLines(err.status, err.body)));
    } finally {
      if (alive) setWorking(false);
    }
  }

  select.addEventListener("change", () => {
    limit = Number(select.value);
    load();
  });
  refresh.addEventListener("click", () => load());

  root.replaceChildren(
    el("h1", { text: "Журнал правок" }),
    el(
      "div",
      { className: "toolbar" },
      el("label", { className: "field inline" }, el("span", { text: "Сколько записей" }), select),
      refresh
    ),
    status,
    tableHost
  );
  tableHost.replaceChildren(loading());
  load();

  return () => {
    alive = false;
    controller.abort();
  };
}

export { mountJournal };
