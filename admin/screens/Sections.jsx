import { useEffect, useState } from "react";
import { isAbort, listSections } from "../api/admin-api.js";
import { problemLines } from "../lib/messages.js";
import { labelSections } from "../lib/sections.js";
import { ErrorBlock } from "../components/ErrorBlock.jsx";
import { Loading } from "../components/Loading.jsx";
import { SectionTile } from "../components/SectionTile.jsx";

function Sections({ openSection }) {
  const [view, setView] = useState({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    listSections({ signal: controller.signal })
      .then((list) => {
        if (!alive) return;
        setView({ kind: "ready", sections: labelSections(list) });
      })
      .catch((err) => {
        if (!alive || isAbort(err) || err.status === 401) return;
        setView({ kind: "error", lines: problemLines(err.status, err.body) });
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  if (view.kind === "loading") return <Loading />;
  return (
    <>
      <h1>Разделы</h1>
      {view.kind === "error" ? <ErrorBlock lines={view.lines} /> : null}
      {view.kind === "ready" ? (
        <>
          <p className="muted">Откройте раздел, чтобы править черновик, публиковать и откатывать.</p>
          {view.sections.length > 0 ? (
            <div className="tiles">
              {view.sections.map((item) => (
                <SectionTile key={item.name} item={item} onOpen={openSection} />
              ))}
            </div>
          ) : (
            <p className="muted">Разделов пока нет</p>
          )}
        </>
      ) : null}
    </>
  );
}

export { Sections };
