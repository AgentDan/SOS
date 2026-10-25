import { useEffect, useRef, useState } from "react";
import { getSection, isAbort, saveDraft, uploadModel } from "../api/admin-api.js";
import { draftWithMovable, movableEdits, physicsRows } from "../lib/movable.js";
import { problemLines } from "../lib/messages.js";
import { Banner } from "../components/Banner.jsx";
import { BusyButton } from "../components/BusyButton.jsx";
import { DataTable } from "../components/DataTable.jsx";
import { ErrorBlock } from "../components/ErrorBlock.jsx";
import { Loading } from "../components/Loading.jsx";

const FIELD =
  "w-full rounded-lg border border-[#ddd4c6] dark:border-[#343b46] bg-[#fffdf8] dark:bg-[#1e232b] px-2.5 py-2 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f6b4a] dark:focus-visible:outline-[#3d9a6e]";

function uploadLines(err) {
  if (err && err.status === 422 && err.body && typeof err.body.error === "string" && err.body.error.length > 0) {
    return [err.body.error];
  }
  return problemLines(err && err.status, err && err.body);
}

function mmFromMeters(value) {
  if (!Number.isFinite(value)) return "—";
  return String(Math.round(value * 1000 * 10) / 10);
}

function vecMm(values) {
  if (!Array.isArray(values)) return "—";
  return values.map((value) => mmFromMeters(value)).join(" × ");
}

function sizeText(size, key) {
  if (!size || !Number.isFinite(Number(size[key]))) return "—";
  return String(size[key]);
}

function togglesFrom(rows) {
  const next = {};
  for (const row of rows) next[row.sku] = row.movable === true;
  return next;
}

function PhysicsNotice({ notice, working, onLoadLatest }) {
  if (!notice) return null;
  if (notice.kind === "conflict") {
    return (
      <div
        className="mb-3 grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 rounded-[10px] border-l-4 border-l-[#7a4e00] dark:border-l-[#ffe0a3] bg-[#fff4d6] dark:bg-[#3a2e12] px-3 py-2.5 text-[#7a4e00] dark:text-[#ffe0a3]"
        role="status"
      >
        <span className="font-bold">Внимание</span>
        <span>Раздел уже изменили в другом месте</span>
        <button
          type="button"
          className="col-span-full w-full cursor-pointer rounded-lg border border-[#ddd4c6] dark:border-[#343b46] bg-[#fffdf8] dark:bg-[#1e232b] px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f6b4a] dark:focus-visible:outline-[#3d9a6e]"
          disabled={working}
          onClick={onLoadLatest}
        >
          Загрузить актуальную версию
        </button>
      </div>
    );
  }
  if (notice.kind === "problem") return <ErrorBlock lines={problemLines(notice.status, notice.body)} />;
  return <Banner kind={notice.kind} text={notice.text} />;
}

function Models({ onDirty = () => {} }) {
  const [products, setProducts] = useState(null);
  const [rows, setRows] = useState([]);
  const [toggles, setToggles] = useState({});
  const [loadError, setLoadError] = useState(null);
  const [sku, setSku] = useState("");
  const [file, setFile] = useState(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [notice, setNotice] = useState(null);

  const aliveRef = useRef(true);
  const workingRef = useRef(false);
  const draftRef = useRef(null);
  const versionRef = useRef(null);
  const rowsRef = useRef([]);
  const togglesRef = useRef({});
  const controllerRef = useRef(null);

  function adopt(data, { replaceToggles }) {
    const list = data && data.draft && Array.isArray(data.draft.products) ? data.draft.products : [];
    const nextProducts = list
      .filter((item) => item && typeof item.sku === "string" && item.sku.length > 0)
      .slice()
      .sort((a, b) => (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0));
    const nextRows = physicsRows(
      data && data.draft ? data.draft.products : [],
      data && data.published ? data.published.products : []
    );
    draftRef.current = data ? data.draft : null;
    versionRef.current = data ? data.draftVersion : null;
    rowsRef.current = nextRows;
    setProducts(nextProducts);
    setRows(nextRows);
    if (replaceToggles) {
      const nextToggles = togglesFrom(nextRows);
      togglesRef.current = nextToggles;
      setToggles(nextToggles);
    }
  }

  useEffect(() => {
    if (products === null) return undefined;
    onDirty(movableEdits(rows, toggles).length > 0);
    return () => onDirty(false);
  }, [products, rows, toggles, onDirty]);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    aliveRef.current = true;
    let alive = true;
    getSection("catalog", { signal: controller.signal })
      .then((section) => {
        if (!alive) return;
        adopt(section, { replaceToggles: true });
      })
      .catch((err) => {
        if (!alive || isAbort(err) || err.status === 401) return;
        setLoadError(problemLines(err.status, err.body));
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

  function onToggle(skuId, checked) {
    const next = { ...togglesRef.current, [skuId]: checked };
    togglesRef.current = next;
    setToggles(next);
  }

  async function loadLatest() {
    if (!begin()) return;
    try {
      const data = await getSection("catalog", { signal: controllerRef.current.signal });
      if (!aliveRef.current) return;
      adopt(data, { replaceToggles: true });
      setNotice({ kind: "ok", text: "Загружена актуальная версия с сервера" });
    } catch (err) {
      if (stopIfAuth(err)) return;
      setNotice({ kind: "problem", status: err.status, body: err.body });
    } finally {
      finish();
    }
  }

  async function onSave() {
    const edits = movableEdits(rowsRef.current, togglesRef.current);
    if (edits.length === 0 || !begin()) return;
    try {
      setNotice(null);
      const nextDraft = draftWithMovable(draftRef.current, edits);
      const saved = await saveDraft("catalog", nextDraft, versionRef.current, {
        signal: controllerRef.current.signal
      });
      if (!aliveRef.current) return;
      const data = await getSection("catalog", { signal: controllerRef.current.signal });
      if (!aliveRef.current) return;
      adopt(data, { replaceToggles: true });
      setNotice({ kind: "ok", text: `Сохранено, версия черновика ${saved.draftVersion}` });
    } catch (err) {
      if (stopIfAuth(err)) return;
      if (err.status === 409) {
        setNotice({ kind: "conflict" });
        return;
      }
      setNotice({ kind: "problem", status: err.status, body: err.body });
    } finally {
      finish();
    }
  }

  async function onUpload() {
    if (!sku || !file || !begin()) return;
    try {
      setError(null);
      setResult(null);
      const data = await file.arrayBuffer();
      const report = await uploadModel(sku, data);
      if (!aliveRef.current) return;
      setResult(report);
    } catch (err) {
      if (stopIfAuth(err)) return;
      setError(uploadLines(err));
    } finally {
      finish();
    }
  }

  if (products === null && !loadError) return <Loading text="Загружаем каталог…" />;

  const edits = movableEdits(rows, toggles);

  const sizeRows = result
    ? [
        {
          label: "GLB",
          width: sizeText(result.sizeMm, "width"),
          depth: sizeText(result.sizeMm, "depth"),
          height: sizeText(result.sizeMm, "height")
        },
        {
          label: "Каталог",
          width: sizeText(result.catalogMm, "width"),
          depth: sizeText(result.catalogMm, "depth"),
          height: sizeText(result.catalogMm, "height")
        }
      ]
    : [];

  return (
    <>
      <h1 className="mt-0 mb-3 font-[650] leading-tight text-[1.6rem]">Модели</h1>
      <p className="mt-0 mb-4 text-[#5e584e] dark:text-[#b7b0a4]">
        Загрузка GLB считает коллайдеры и записывает их в файл модели. Размеры в каталоге не меняются.
      </p>
      {loadError ? <ErrorBlock lines={loadError} /> : null}
      <div className="mb-4 grid max-w-3xl grid-cols-1 gap-3">
        <label className="flex flex-col gap-1">
          <span>Артикул</span>
          <select className={FIELD} value={sku} disabled={working || !products} onChange={(event) => setSku(event.target.value)}>
            <option value="">Выберите артикул</option>
            {(products || []).map((product) => (
              <option key={product.sku} value={product.sku}>
                {product.sku}
                {product.label ? ` — ${product.label}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span>Файл GLB</span>
          <input
            className={FIELD}
            type="file"
            accept=".glb,model/gltf-binary"
            disabled={working}
            onChange={(event) => {
              const next = event.target.files && event.target.files[0];
              setFile(next || null);
              setResult(null);
              setError(null);
            }}
          />
        </label>
        <div>
          <BusyButton busy={working} disabled={!sku || !file} onClick={onUpload}>
            Загрузить
          </BusyButton>
        </div>
      </div>
      {error ? <ErrorBlock lines={error} /> : null}
      {result ? (
        <>
          <Banner kind="ok" text={`Модель ${result.sku} сохранена, ${result.bytes} байт.`} />
          <h2 className="mt-0 mb-2 text-[1.15rem] font-[650]">Размеры, мм</h2>
          <div className="mb-4 overflow-x-auto">
            <DataTable
              columns={[
                { key: "label", title: "", render: (row) => row.label },
                { key: "width", title: "Ширина", render: (row) => row.width },
                { key: "depth", title: "Глубина", render: (row) => row.depth },
                { key: "height", title: "Высота", render: (row) => row.height }
              ]}
              rows={sizeRows}
              rowKey={(row) => row.label}
            />
          </div>
          <h2 className="mt-0 mb-2 text-[1.15rem] font-[650]">Части коллайдера</h2>
          <p className="mt-0 mb-2 text-[#5e584e] dark:text-[#b7b0a4]">
            Центр относительно середины модели, размеры части — полные, в миллиметрах.
          </p>
          <div className="overflow-x-auto">
            <DataTable
              columns={[
                { key: "name", title: "Часть", render: (part) => part.name },
                { key: "center", title: "Центр, мм", render: (part) => vecMm(part.center) },
                { key: "size", title: "Размер, мм", render: (part) => vecMm(part.size) }
              ]}
              rows={Array.isArray(result.parts) ? result.parts : []}
              rowKey={(part, index) => `${part && part.name ? part.name : "part"}-${index}`}
            />
          </div>
        </>
      ) : null}
      {products ? (
        <section className="mt-8">
          <h2 className="mt-0 mb-2 text-[1.15rem] font-[650]">Физика на клиенте</h2>
          <p className="mt-0 mb-3 text-[#5e584e] dark:text-[#b7b0a4]">
            Изменения попадут к клиентам после публикации каталога.
          </p>
          <div className="mb-4 overflow-x-auto">
            <DataTable
              columns={[
                { key: "sku", title: "Артикул", render: (row) => row.sku },
                { key: "label", title: "Название", render: (row) => row.label || "—" },
                { key: "type", title: "Тип", render: (row) => row.type || "—" },
                {
                  key: "movable",
                  title: "Двигается мышью на клиенте",
                  render: (row) => (
                    <label className="flex items-center gap-2">
                      <input
                        className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f6b4a] dark:focus-visible:outline-[#3d9a6e]"
                        type="checkbox"
                        checked={toggles[row.sku] === true}
                        disabled={working}
                        aria-label={`Двигается мышью на клиенте: ${row.sku}`}
                        onChange={(event) => onToggle(row.sku, event.target.checked)}
                      />
                      <span>{toggles[row.sku] === true ? "Включено" : "Выключено"}</span>
                    </label>
                  )
                },
                {
                  key: "unpublished",
                  title: "",
                  render: (row) =>
                    row.unpublished ? (
                      <span className="inline-block rounded-[999px] bg-[#fff4d6] dark:bg-[#3a2e12] px-2 py-0.5 text-[0.86rem] text-[#7a4e00] dark:text-[#ffe0a3]">
                        не опубликовано
                      </span>
                    ) : null
                }
              ]}
              rows={rows}
              rowKey={(row) => row.sku}
            />
          </div>
          <div className="mb-3">
            <BusyButton
              busy={working}
              disabled={edits.length === 0}
              className="border-[#1f6b4a] dark:border-[#3d9a6e] bg-[#1f6b4a] dark:bg-[#3d9a6e] text-[#f4fff8]"
              onClick={onSave}
            >
              Сохранить
            </BusyButton>
          </div>
          <PhysicsNotice notice={notice} working={working} onLoadLatest={loadLatest} />
        </section>
      ) : null}
    </>
  );
}

export { Models };
