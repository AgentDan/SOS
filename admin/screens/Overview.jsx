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
    return (
      <p className={line.ok ? "mt-0 mb-2 text-[#0f6b3c] dark:text-[#b7ebc9] before:font-bold before:content-['Ок._']" : "mt-0 mb-2 text-[#8e1d1d] dark:text-[#ffb4b4]"}>{line.text}</p>
    );
  }
  return (
    <details
      className="mt-0 mb-2 text-[#8e1d1d] dark:text-[#ffb4b4] [&_summary]:cursor-pointer [&_summary]:before:font-bold [&_summary]:before:content-['Ошибка._']"
      open
    >
      <summary>{line.text}</summary>
      <ul className="m-0 list-disc pl-[1.1rem] [&_li]:my-0.5 [&_li]:[overflow-wrap:anywhere]">
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
        <h1 className="mt-0 mb-3 font-[650] leading-tight text-[1.6rem]">Обзор</h1>
        <Banner kind="error" text="Не получилось открыть обзор" />
      </>
    );
  }

  const tiles = view.kind === "ready" ? view.sections : [];
  return (
    <>
      <h1 className="mt-0 mb-3 font-[650] leading-tight text-[1.6rem]">Обзор</h1>
      <p className="mt-0 mb-[22px] rounded-xl border border-[#ddd4c6] dark:border-[#343b46] bg-[#fffdf8] dark:bg-[#1e232b] px-3.5 py-3 shadow-[0_1px_2px_rgba(40,32,20,0.06)] dark:shadow-none">
        Провести продажу и сделать клиента лояльным
      </p>
      {view.kind === "sections-error" ? <ErrorBlock lines={view.lines} /> : null}
      {view.kind === "ready" ? (
        <>
          <section>
            <h2 className="mt-0 mb-2.5 font-[650] leading-tight text-[1.15rem]">Карта системы</h2>
            {tiles.length > 0 ? (
              <div className="mb-7 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                {tiles.map((item) => (
                  <SectionTile key={item.name} item={item} onOpen={openSection} />
                ))}
              </div>
            ) : (
              <p className="mt-0 mb-2 text-[#5e584e] dark:text-[#b7b0a4]">Разделов пока нет</p>
            )}
          </section>
          <section>
            <h2 className="mt-0 mb-2.5 font-[650] leading-tight text-[1.15rem]">Здоровье данных</h2>
            {view.health.kind === "error" ? <ErrorBlock lines={view.health.lines} /> : null}
            {view.health.kind === "report" ? (
              <>
                <p className="mt-0 mb-2">{dataVersionText(view.health.report.dataVersion)}</p>
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
