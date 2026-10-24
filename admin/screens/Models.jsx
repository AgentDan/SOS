import { useEffect, useState } from "react";
import { getSection, isAbort, uploadModel } from "../api/admin-api.js";
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

function Models() {
  const [products, setProducts] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [sku, setSku] = useState("");
  const [file, setFile] = useState(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    getSection("catalog", { signal: controller.signal })
      .then((section) => {
        if (!alive) return;
        const list = section && section.draft && Array.isArray(section.draft.products) ? section.draft.products : [];
        const rows = list
          .filter((item) => item && typeof item.sku === "string" && item.sku.length > 0)
          .slice()
          .sort((a, b) => (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0));
        setProducts(rows);
      })
      .catch((err) => {
        if (!alive || isAbort(err) || err.status === 401) return;
        setLoadError(problemLines(err.status, err.body));
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  async function onUpload() {
    if (!sku || !file || working) return;
    setWorking(true);
    setError(null);
    setResult(null);
    try {
      const data = await file.arrayBuffer();
      const report = await uploadModel(sku, data);
      setResult(report);
    } catch (err) {
      if (isAbort(err) || err.status === 401) return;
      setError(uploadLines(err));
    } finally {
      setWorking(false);
    }
  }

  if (products === null && !loadError) return <Loading text="Загружаем каталог…" />;

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
    </>
  );
}

export { Models };
