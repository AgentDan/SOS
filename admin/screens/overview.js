import { getHealth, isAbort, listSections } from "../api/admin-api.js";
import { dataVersionText, healthLine, problemLines } from "../lib/messages.js";
import { labelSections } from "../lib/sections.js";
import { banner, el, errorBlock, loading, sectionTile } from "../ui.js";

const HEALTH_TITLES = [
  ["draft", "черновик"],
  ["published", "опубликованное"],
  ["knobs", "ручки"]
];

function healthView(title, report) {
  const line = healthLine(title, report);
  if (line.ok || line.errors.length === 0) {
    return el("p", { className: line.ok ? "health health-ok" : "health health-bad", text: line.text });
  }
  return el(
    "details",
    { className: "health health-bad", open: "true" },
    el("summary", { text: line.text }),
    el(
      "ul",
      { className: "error-lines" },
      line.errors.map((item) => el("li", { text: item }))
    )
  );
}

function mountOverview(root, { openSection }) {
  const controller = new AbortController();
  let alive = true;
  root.replaceChildren(loading());

  (async () => {
    const signal = controller.signal;
    const [sectionsOutcome, healthOutcome] = await Promise.all([
      listSections({ signal }).then(
        (value) => ({ ok: true, value }),
        (error) => ({ ok: false, error })
      ),
      getHealth({ signal }).then(
        (value) => ({ ok: true, value }),
        (error) => ({ ok: false, error })
      )
    ]);
    if (!alive) return;
    if (!sectionsOutcome.ok && (isAbort(sectionsOutcome.error) || sectionsOutcome.error.status === 401)) return;

    const head = el("h1", { text: "Обзор" });
    const goal = el("p", { className: "goal", text: "Провести продажу и сделать клиента лояльным" });

    if (!sectionsOutcome.ok) {
      root.replaceChildren(head, goal, errorBlock(problemLines(sectionsOutcome.error.status, sectionsOutcome.error.body)));
      return;
    }

    const tiles = labelSections(sectionsOutcome.value).map((item) => sectionTile(item, openSection));
    const map = el(
      "section",
      null,
      el("h2", { text: "Карта системы" }),
      tiles.length > 0 ? el("div", { className: "tiles" }, tiles) : el("p", { className: "muted", text: "Разделов пока нет" })
    );

    let healthNode;
    if (!healthOutcome.ok) {
      if (isAbort(healthOutcome.error) || healthOutcome.error.status === 401) return;
      healthNode = el(
        "section",
        null,
        el("h2", { text: "Здоровье данных" }),
        errorBlock(problemLines(healthOutcome.error.status, healthOutcome.error.body))
      );
    } else {
      const report = healthOutcome.value && typeof healthOutcome.value === "object" ? healthOutcome.value : {};
      healthNode = el(
        "section",
        null,
        el("h2", { text: "Здоровье данных" }),
        el("p", { text: dataVersionText(report.dataVersion) }),
        ...HEALTH_TITLES.map(([key, title]) => healthView(title, report[key]))
      );
    }

    root.replaceChildren(head, goal, map, healthNode);
  })().catch((err) => {
    if (!alive || isAbort(err)) return;
    root.replaceChildren(el("h1", { text: "Обзор" }), banner("error", "Не получилось открыть обзор"));
  });

  return () => {
    alive = false;
    controller.abort();
  };
}

export { mountOverview };
