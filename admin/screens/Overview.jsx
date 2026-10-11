import { useEffect, useState } from "react";
import { getHealth, isAbort, listSections } from "../api/admin-api.js";
import { dataVersionText, healthLine, problemLines } from "../lib/messages.js";
import { labelSections } from "../lib/sections.js";
import { Banner } from "../components/Banner.jsx";
import { ErrorBlock } from "../components/ErrorBlock.jsx";
import { Loading } from "../components/Loading.jsx";
import { SectionTile } from "../components/SectionTile.jsx";

const HEALTH_TITLES = [
  ["draft", "черновик"],
  ["published", "опубликованное"],
  ["knobs", "ручки"]
];

function HealthView({ title, report }) {
  const line = healthLine(title, report);
  if (line.ok || line.errors.length === 0) {
    return <p className={line.ok ? "health health-ok" : "health health-bad"}>{line.text}</p>;
  }
  return (
    <details className="health health-bad" open>
      <summary>{line.text}</summary>
      <ul className="error-lines">
        {line.errors.map((item, index) => (
          <li key={`${index}:${item}`}>{item}</li>
        ))}
      </ul>
    </details>
  );
}

function Overview({ openSection }) {
  const [view, setView] = useState({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;

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

      if (!sectionsOutcome.ok) {
        setView({
          kind: "sections-error",
          lines: problemLines(sectionsOutcome.error.status, sectionsOutcome.error.body)
        });
        return;
      }

      let health = null;
      if (!healthOutcome.ok) {
        if (isAbort(healthOutcome.error) || healthOutcome.error.status === 401) return;
        health = { kind: "error", lines: problemLines(healthOutcome.error.status, healthOutcome.error.body) };
      } else {
        const report = healthOutcome.value && typeof healthOutcome.value === "object" ? healthOutcome.value : {};
        health = { kind: "report", report };
      }

      setView({ kind: "ready", sections: labelSections(sectionsOutcome.value), health });
    })().catch((err) => {
      if (!alive || isAbort(err)) return;
      setView({ kind: "crash" });
    });

    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  if (view.kind === "loading") return <Loading />;
  if (view.kind === "crash") {
    return (
      <>
        <h1>Обзор</h1>
        <Banner kind="error" text="Не получилось открыть обзор" />
      </>
    );
  }

  const tiles = view.kind === "ready" ? view.sections : [];
  return (
    <>
      <h1>Обзор</h1>
      <p className="goal">Провести продажу и сделать клиента лояльным</p>
      {view.kind === "sections-error" ? <ErrorBlock lines={view.lines} /> : null}
      {view.kind === "ready" ? (
        <>
          <section>
            <h2>Карта системы</h2>
            {tiles.length > 0 ? (
              <div className="tiles">
                {tiles.map((item) => (
                  <SectionTile key={item.name} item={item} onOpen={openSection} />
                ))}
              </div>
            ) : (
              <p className="muted">Разделов пока нет</p>
            )}
          </section>
          <section>
            <h2>Здоровье данных</h2>
            {view.health.kind === "error" ? <ErrorBlock lines={view.health.lines} /> : null}
            {view.health.kind === "report" ? (
              <>
                <p>{dataVersionText(view.health.report.dataVersion)}</p>
                {HEALTH_TITLES.map(([key, title]) => (
                  <HealthView key={key} title={title} report={view.health.report[key]} />
                ))}
              </>
            ) : null}
          </section>
        </>
      ) : null}
    </>
  );
}

export { Overview };
