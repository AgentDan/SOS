import { cloneElement, isValidElement, useEffect, useId, useMemo, useRef, useState } from "react";
import { getSection, isAbort, saveDraft, uploadModel } from "../api/admin-api.js";
import {
  addProduct,
  applyNeedFields,
  applyTypeFields,
  compareSizes,
  filterRows,
  formToProduct,
  matchingNeeds,
  needToForm,
  parseObjectText,
  productRows,
  productToForm,
  removeProduct,
  replaceItem,
  replaceProduct,
  splitWords,
  typeFacts,
  typeToForm,
  validateNeedForm,
  validateProductForm,
  validateTypeForm
} from "../lib/catalog.js";
import { problemLines } from "../lib/messages.js";
import { Banner } from "../components/Banner.jsx";
import { confirmAction } from "../components/confirm.jsx";
import { ErrorBlock } from "../components/ErrorBlock.jsx";
import { Loading } from "../components/Loading.jsx";
import { Btn } from "../ui/Btn.jsx";
import { Card } from "../ui/Card.jsx";
import { Check, Switch } from "../ui/Check.jsx";
import { controlClass } from "../ui/control.js";
import { Field } from "../ui/Field.jsx";
import { MultiSelect } from "../ui/MultiSelect.jsx";
import { Pill } from "../ui/Pill.jsx";
import { Segmented } from "../ui/Segmented.jsx";
import { Select } from "../ui/Select.jsx";

const PAGE = 100;
const MAX_BYTES = 25 * 1024 * 1024;
const LEAVE_TEXT = "Есть несохранённые правки. Уйти без сохранения?";
const SAVED_TEXT = "Сохранено в черновик. Клиент увидит это после публикации.";
const LINK =
  "text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const AXIS_LABEL = { width: "Ширина", depth: "Глубина", height: "Высота" };
const TABS = [
  { id: "products", text: "Товары" },
  { id: "types", text: "Типы" },
  { id: "needs", text: "Потребности" }
];
const CARD_TABS = [
  { id: "main", text: "Основное" },
  { id: "model", text: "3D-модель" },
  { id: "links", text: "Связи" }
];

function findBy(list, key, value) {
  return (Array.isArray(list) ? list : []).find((item) => item && item[key] === value) || null;
}

function sameList(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}

function sameProductForm(left, right) {
  if (!left || !right) return false;
  return (
    left.sku === right.sku &&
    left.type === right.type &&
    left.name === right.name &&
    left.label === right.label &&
    left.width === right.width &&
    left.depth === right.depth &&
    left.height === right.height &&
    left.priceEur === right.priceEur &&
    left.words === right.words &&
    left.movable === right.movable &&
    left.seatHeightMm === right.seatHeightMm &&
    left.hostSku === right.hostSku
  );
}

function sameTypeForm(left, right) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return (
    left.label === right.label &&
    left.canBeHost === right.canBeHost &&
    left.maxOnScene === right.maxOnScene &&
    left.extraText === right.extraText &&
    sameList(left.canHostOn, right.canHostOn)
  );
}

function sameNeedForm(left, right) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return left.name === right.name && left.why === right.why && left.type === right.type && left.minWidth === right.minWidth;
}

function readRouteProduct(source, { create, sku }) {
  if (create || !sku) return { product: null, form: productToForm(null) };
  const product = findBy(source && source.products, "sku", sku);
  if (!product) return { product: null, form: productToForm(null) };
  return { product, form: productToForm(product) };
}

function uploadLines(err) {
  if (err && err.status === 422 && err.body && typeof err.body.error === "string" && err.body.error.length > 0) {
    return [err.body.error];
  }
  if (err && err.body && err.body.error === "expected a GLB body") return ["Файл пустой или это не GLB"];
  if (err && err.body && err.body.error === "unknown sku") return ["Такого товара нет в сохранённом каталоге"];
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

function formatMeasure(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.round(value * 10) / 10);
  if (value == null || value === "") return "—";
  return String(value);
}

function criteriaLabel(need, types) {
  const criteria = need && need.criteria && typeof need.criteria === "object" ? need.criteria : {};
  const facts = typeFacts(criteria.type, types);
  const name = facts ? facts.label : criteria.type || "—";
  if (criteria.minWidth == null || criteria.minWidth === "") return name;
  return `${name}, от ${criteria.minWidth} мм`;
}

function Labeled({ label, error, children }) {
  const errorId = useId();
  const control = isValidElement(children)
    ? cloneElement(children, {
        "aria-invalid": error ? true : undefined,
        "aria-describedby": error ? errorId : undefined
      })
    : children;
  return (
    <div>
      <Field label={label}>{control}</Field>
      {error ? (
        <p id={errorId} className="mt-1 mb-0 text-sm text-bad" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Notice({ notice }) {
  if (!notice) return null;
  if (notice.kind === "saved") {
    return (
      <div className="mb-3">
        <Banner kind="ok" text={SAVED_TEXT} />
        <a className={LINK} href="#/journal">
          Опубликовать
        </a>
      </div>
    );
  }
  if (notice.kind === "ok") return <Banner kind="ok" text={notice.text} />;
  if (notice.kind === "warn") return <Banner kind="warn" text={notice.text} />;
  return null;
}

function Conflict({ working, onLoad }) {
  return (
    <div className="mb-3">
      <Banner kind="warn" text="Раздел уже изменили в другом месте" />
      <Btn disabled={working} onClick={onLoad}>
        Загрузить актуальную версию
      </Btn>
    </div>
  );
}

function Catalog({ route = {}, onDirty = () => {}, requestGo }) {
  const tab = route.tab === "types" || route.tab === "needs" ? route.tab : "products";
  const routeSku = typeof route.sku === "string" ? route.sku : "";
  const routeCreate = Boolean(route.create);
  const routeKey = routeCreate ? "new" : routeSku;

  const [phase, setPhase] = useState("loading");
  const [loadError, setLoadError] = useState(null);
  const [draft, setDraft] = useState(null);
  const [published, setPublished] = useState(null);
  const [draftVersion, setDraftVersion] = useState(null);
  const [form, setForm] = useState(() => productToForm(null));
  const [savedForm, setSavedForm] = useState(() => productToForm(null));
  const [original, setOriginal] = useState(null);
  const [syncKey, setSyncKey] = useState(null);
  const [appliedTab, setAppliedTab] = useState(null);
  const [typeId, setTypeId] = useState("");
  const [typeForm, setTypeForm] = useState(null);
  const [typeSaved, setTypeSaved] = useState(null);
  const [needId, setNeedId] = useState("");
  const [needForm, setNeedForm] = useState(null);
  const [needSaved, setNeedSaved] = useState(null);
  const [notice, setNotice] = useState(null);
  const [serverLines, setServerLines] = useState(null);
  const [working, setWorking] = useState(false);
  const [text, setText] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [visible, setVisible] = useState(PAGE);
  const [seenFilter, setSeenFilter] = useState("\n");
  const [cardTab, setCardTab] = useState("main");
  const [file, setFile] = useState(null);
  const [fileNote, setFileNote] = useState("");
  const [uploadError, setUploadError] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);

  const aliveRef = useRef(true);
  const workingRef = useRef(false);
  const draftRef = useRef(null);
  const versionRef = useRef(null);
  const controllerRef = useRef(null);
  const pendingRef = useRef(null);

  draftRef.current = draft;
  versionRef.current = draftVersion;

  const filterKey = `${typeFilter}\n${text}`;
  const shownLimit = seenFilter === filterKey ? visible : PAGE;
  if (seenFilter !== filterKey) {
    setSeenFilter(filterKey);
    setVisible(PAGE);
  }

  const routeMismatch = Boolean(draft) && (appliedTab !== tab || syncKey !== routeKey);
  let activeForm = form;
  let activeSaved = savedForm;
  let activeOriginal = original;
  let activeTypeForm = typeForm;
  let activeTypeSaved = typeSaved;
  let activeNeedForm = needForm;
  let activeNeedSaved = needSaved;
  if (routeMismatch) {
    const loaded = readRouteProduct(draft, { create: routeCreate, sku: routeSku });
    const pending = pendingRef.current;
    activeSaved = loaded.form;
    activeOriginal = loaded.product;
    activeForm = loaded.form;
    if (pending && !routeCreate && pending.sku === routeSku && loaded.product && loaded.product.type !== "person") {
      activeForm = { ...loaded.form, movable: pending.movable };
    }
    if (appliedTab !== tab && typeId) {
      const type = findBy(draft.types, "id", typeId);
      if (type) {
        activeTypeForm = typeToForm(type);
        activeTypeSaved = activeTypeForm;
      }
    }
    if (appliedTab !== tab && needId) {
      const need = findBy(draft.needs, "id", needId);
      if (need) {
        activeNeedForm = needToForm(need);
        activeNeedSaved = activeNeedForm;
      }
    }
    setAppliedTab(tab);
    setSyncKey(routeKey);
    setForm(activeForm);
    setSavedForm(activeSaved);
    setOriginal(activeOriginal);
    if (activeTypeForm !== typeForm) {
      setTypeForm(activeTypeForm);
      setTypeSaved(activeTypeSaved);
    }
    if (activeNeedForm !== needForm) {
      setNeedForm(activeNeedForm);
      setNeedSaved(activeNeedSaved);
    }
    setServerLines(null);
    setUploadError(null);
    setUploadResult(null);
    setFile(null);
    setFileNote("");
    setCardTab("main");
  }

  const products = draft && Array.isArray(draft.products) ? draft.products : [];
  const types = draft && Array.isArray(draft.types) ? draft.types : [];
  const needs = draft && Array.isArray(draft.needs) ? draft.needs : [];
  const rows = useMemo(() => productRows(draft, published), [draft, published]);
  const filtered = useMemo(() => filterRows(rows, { type: typeFilter, text }), [rows, typeFilter, text]);
  const shown = filtered.slice(0, shownLimit);

  const productDirty = !sameProductForm(activeForm, activeSaved);
  const typeDirty = !sameTypeForm(activeTypeForm, activeTypeSaved);
  const needDirty = !sameNeedForm(activeNeedForm, activeNeedSaved);
  const dirty = productDirty || typeDirty || needDirty;
  const productErrors = validateProductForm(activeForm, {
    existingSkus: products.map((item) => item && item.sku).filter((sku) => typeof sku === "string"),
    isNew: !activeOriginal,
    typeIds: types.map((item) => item && item.id).filter((id) => typeof id === "string"),
    productSkus: products.map((item) => item && item.sku).filter((sku) => typeof sku === "string")
  });
  const typeErrors = activeTypeForm ? validateTypeForm(activeTypeForm, activeTypeForm.extraText) : {};
  const needErrors = activeNeedForm ? validateNeedForm(activeNeedForm) : {};
  const shownProductErrors = productDirty ? productErrors : {};
  const shownTypeErrors = typeDirty ? typeErrors : {};
  const shownNeedErrors = needDirty ? needErrors : {};

  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);

  useEffect(() => {
    if (pendingRef.current && pendingRef.current.sku === routeSku && syncKey === routeKey) pendingRef.current = null;
  }, [routeSku, routeKey, syncKey]);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    aliveRef.current = true;
    getSection("catalog", { signal: controller.signal })
      .then((data) => {
        if (!aliveRef.current) return;
        adopt(data, true);
      })
      .catch((err) => {
        if (!aliveRef.current || isAbort(err) || (err && err.status === 401)) return;
        setLoadError(problemLines(err && err.status, err && err.body));
        setPhase("error");
      });
    return () => {
      aliveRef.current = false;
      onDirty(false);
      controller.abort();
    };
  }, [onDirty]);

  function adopt(data, resetForms) {
    const nextDraft = data && data.draft && typeof data.draft === "object" ? data.draft : { types: [], needs: [], products: [] };
    const nextPublished = data && data.published && typeof data.published === "object" ? data.published : { products: [] };
    draftRef.current = nextDraft;
    versionRef.current = data ? data.draftVersion : null;
    setDraft(nextDraft);
    setPublished(nextPublished);
    setDraftVersion(data ? data.draftVersion : null);
    setPhase("ready");
    if (resetForms) {
      setSyncKey(null);
      setAppliedTab(null);
    }
  }

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

  function go(patch) {
    requestGo({
      screen: "catalog",
      tab: Object.hasOwn(patch, "tab") ? patch.tab : tab,
      sku: Object.hasOwn(patch, "sku") ? patch.sku : routeCreate ? "" : routeSku,
      create: Object.hasOwn(patch, "create") ? patch.create : routeCreate
    });
  }

  function clearSavedNotice() {
    setNotice((current) => (current && current.kind === "saved" ? null : current));
  }

  function patchForm(patch) {
    setForm((prev) => ({ ...prev, ...patch }));
    setServerLines(null);
    clearSavedNotice();
  }

  function selectSku(sku) {
    if (!routeCreate && sku === routeSku && tab === "products") return;
    go({ tab: "products", sku, create: false });
  }

  function onMovable(sku, checked) {
    if (!routeCreate && sku === routeSku) {
      patchForm({ movable: checked });
      return;
    }
    pendingRef.current = { sku, movable: checked };
    const before = location.hash;
    go({ tab: "products", sku, create: false });
    if (location.hash === before) pendingRef.current = null;
  }

  async function loadLatest() {
    if (!confirmAction("Несохранённый текст пропадёт. Загрузить актуальную версию?")) return;
    if (!begin()) return;
    try {
      const data = await getSection("catalog", { signal: controllerRef.current.signal });
      if (!aliveRef.current) return;
      onDirty(false);
      adopt(data, true);
      setServerLines(null);
      setNotice({ kind: "ok", text: "Загружена актуальная версия с сервера" });
    } catch (err) {
      if (stopIfAuth(err)) return;
      setServerLines(problemLines(err.status, err.body));
    } finally {
      finish();
    }
  }

  async function persist(nextDraft, after) {
    if (!begin()) return;
    try {
      setNotice(null);
      setServerLines(null);
      await saveDraft("catalog", nextDraft, versionRef.current, { signal: controllerRef.current.signal });
      const data = await getSection("catalog", { signal: controllerRef.current.signal });
      if (!aliveRef.current) return;
      onDirty(false);
      adopt(data, true);
      setNotice({ kind: "saved" });
      if (after) after(data);
    } catch (err) {
      if (stopIfAuth(err)) return;
      if (err.status === 409) {
        setNotice({ kind: "conflict" });
        return;
      }
      setServerLines(problemLines(err.status, err.body));
    } finally {
      finish();
    }
  }

  function saveProduct() {
    if (!productDirty || Object.keys(productErrors).length > 0) return;
    const product = formToProduct(activeForm, activeOriginal);
    const nextDraft = activeOriginal
      ? replaceProduct(draftRef.current, activeOriginal.sku, product)
      : addProduct(draftRef.current, product);
    persist(nextDraft, () => {
      if (!activeOriginal) requestGo({ screen: "catalog", tab: "products", sku: product.sku, create: false });
    });
  }

  function deleteProduct() {
    if (!activeOriginal) return;
    const sku = activeOriginal.sku;
    if (!confirmAction(`Удалить товар ${sku} из черновика? Файл модели на диске останется.`)) return;
    const nextDraft = removeProduct(draftRef.current, sku);
    persist(nextDraft, () => {
      requestGo({ screen: "catalog", tab: "products", sku: "", create: false });
    });
  }

  async function onUpload() {
    if (!file || !activeOriginal || productDirty) return;
    const name = typeof file.name === "string" ? file.name : "";
    if (!name.toLowerCase().endsWith(".glb")) {
      setFileNote("Нужен файл с расширением .glb");
      setUploadError(null);
      setUploadResult(null);
      return;
    }
    if (file.size === 0) {
      setFileNote("Файл пустой");
      setUploadError(null);
      setUploadResult(null);
      return;
    }
    if (file.size > MAX_BYTES) {
      setFileNote("Файл больше 25 МБ");
      setUploadError(null);
      setUploadResult(null);
      return;
    }
    if (!begin()) return;
    try {
      setFileNote("");
      setUploadError(null);
      setUploadResult(null);
      const bytes = await file.arrayBuffer();
      const report = await uploadModel(activeOriginal.sku, bytes, { signal: controllerRef.current.signal });
      if (!aliveRef.current) return;
      setUploadResult(report);
    } catch (err) {
      if (stopIfAuth(err)) return;
      setUploadError(uploadLines(err));
    } finally {
      finish();
    }
  }

  function selectType(id) {
    if (id === typeId) return;
    if (typeDirty && !confirmAction(LEAVE_TEXT)) return;
    const type = findBy(draftRef.current && draftRef.current.types, "id", id);
    if (!type) return;
    const next = typeToForm(type);
    setTypeId(id);
    setTypeForm(next);
    setTypeSaved(next);
    setServerLines(null);
  }

  function selectNeed(id) {
    if (id === needId) return;
    if (needDirty && !confirmAction(LEAVE_TEXT)) return;
    const need = findBy(draftRef.current && draftRef.current.needs, "id", id);
    if (!need) return;
    const next = needToForm(need);
    setNeedId(id);
    setNeedForm(next);
    setNeedSaved(next);
    setServerLines(null);
  }

  function saveType() {
    if (!typeDirty || Object.keys(typeErrors).length > 0 || !activeTypeForm) return;
    const parsed = parseObjectText(activeTypeForm.extraText);
    if (!parsed.ok) return;
    const type = findBy(draftRef.current && draftRef.current.types, "id", typeId);
    if (!type) return;
    const max = String(activeTypeForm.maxOnScene ?? "").trim();
    const next = applyTypeFields(type, {
      label: activeTypeForm.label.trim(),
      canBeHost: activeTypeForm.canBeHost === true,
      canHostOn: activeTypeForm.canHostOn,
      maxOnScene: max === "" ? "" : Number(max),
      extra: parsed.value
    });
    persist(replaceItem(draftRef.current, "types", typeId, next));
  }

  function saveNeed() {
    if (!needDirty || Object.keys(needErrors).length > 0 || !activeNeedForm) return;
    const need = findBy(draftRef.current && draftRef.current.needs, "id", needId);
    if (!need) return;
    const min = String(activeNeedForm.minWidth ?? "").trim();
    const next = applyNeedFields(need, {
      name: activeNeedForm.name.trim(),
      why: activeNeedForm.why,
      type: activeNeedForm.type,
      minWidth: min === "" ? "" : Number(min)
    });
    persist(replaceItem(draftRef.current, "needs", needId, next));
  }

  if (phase === "loading") return <Loading text="Загружаем каталог…" />;
  if (phase === "error") return <ErrorBlock lines={loadError || ["Не получилось выполнить запрос"]} />;

  const preview = formToProduct(activeForm, activeOriginal);
  const facts = typeFacts(preview.type, types);
  const matched = matchingNeeds(preview, needs);
  const uploadBlocked = !activeOriginal || productDirty;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-2xl font-semibold">Каталог</h1>
        <Btn onClick={() => requestGo({ screen: "section", name: "catalog" })}>Режим JSON</Btn>
      </div>
      <div className="mb-4">
        <Segmented label="Разделы каталога" items={TABS} value={tab} onChange={(id) => go({ tab: id })} />
      </div>
      {notice && notice.kind === "conflict" ? <Conflict working={working} onLoad={loadLatest} /> : <Notice notice={notice} />}
      {tab === "products" ? (
        <ProductsPane
          rows={rows}
          shown={shown}
          hidden={filtered.length - shown.length}
          text={text}
          typeFilter={typeFilter}
          types={types}
          products={products}
          routeSku={routeSku}
          routeCreate={routeCreate}
          form={activeForm}
          original={activeOriginal}
          errors={shownProductErrors}
          cardTab={cardTab}
          working={working}
          canSave={productDirty && Object.keys(productErrors).length === 0 && !working}
          productDirty={productDirty}
          file={file}
          fileNote={fileNote}
          uploadError={uploadError}
          uploadResult={uploadResult}
          uploadBlocked={uploadBlocked}
          serverLines={serverLines}
          facts={facts}
          matched={matched}
          onText={setText}
          onTypeFilter={setTypeFilter}
          onResetFilter={() => {
            setText("");
            setTypeFilter("");
          }}
          onMore={() => setVisible((value) => value + PAGE)}
          onNew={() => {
            if (routeCreate && tab === "products") return;
            go({ tab: "products", sku: "", create: true });
          }}
          onSelect={selectSku}
          onMovable={onMovable}
          onCardTab={setCardTab}
          onPatch={patchForm}
          onCancel={() => {
            setForm(activeSaved);
            setServerLines(null);
          }}
          onSave={saveProduct}
          onDelete={deleteProduct}
          onFile={(next) => {
            setFile(next);
            setFileNote("");
            setUploadError(null);
            setUploadResult(null);
          }}
          onUpload={onUpload}
        />
      ) : null}
      {tab === "types" ? (
        <TypesPane
          types={types}
          products={products}
          typeId={typeId}
          form={activeTypeForm}
          errors={shownTypeErrors}
          working={working}
          canSave={typeDirty && Object.keys(typeErrors).length === 0 && !working}
          dirty={typeDirty}
          serverLines={serverLines}
          onSelect={selectType}
          onPatch={(patch) => {
            setTypeForm((prev) => ({ ...prev, ...patch }));
            setServerLines(null);
            clearSavedNotice();
          }}
          onCancel={() => {
            setTypeForm(activeTypeSaved);
            setServerLines(null);
          }}
          onSave={saveType}
        />
      ) : null}
      {tab === "needs" ? (
        <NeedsPane
          needs={needs}
          types={types}
          products={products}
          needId={needId}
          form={activeNeedForm}
          errors={shownNeedErrors}
          working={working}
          canSave={needDirty && Object.keys(needErrors).length === 0 && !working}
          dirty={needDirty}
          serverLines={serverLines}
          onSelect={selectNeed}
          onPatch={(patch) => {
            setNeedForm((prev) => ({ ...prev, ...patch }));
            setServerLines(null);
            clearSavedNotice();
          }}
          onCancel={() => {
            setNeedForm(activeNeedSaved);
            setServerLines(null);
          }}
          onSave={saveNeed}
        />
      ) : null}
    </>
  );
}

function chipClass(active) {
  return active
    ? "cursor-pointer rounded-full border border-accent bg-accent-soft px-3 py-1 text-sm font-medium text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    : "cursor-pointer rounded-full border border-line bg-surface px-3 py-1 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
}

function rowClass(selected) {
  return `cursor-pointer border-b border-line ${selected ? "bg-accent-soft" : "hover:bg-side"} focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent`;
}

function ProductsPane(props) {
  const counts = new Map();
  for (const row of props.rows) counts.set(row.type, (counts.get(row.type) || 0) + 1);
  const emptyFilter = props.shown.length === 0;
  const hostOptions = props.products.filter((item) => item && item.sku && item.sku !== props.form.sku);
  const words = splitWords(props.form.words);
  const showForm = props.routeCreate || props.original;
  const person = props.form.type === "person";

  return (
    <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)] items-start gap-4 narrow:grid-cols-1">
      <div className="min-w-0">
        <div className="mb-3 flex flex-col gap-3">
          <Labeled label="Поиск">
            <input
              className={controlClass}
              type="search"
              value={props.text}
              placeholder="Артикул, название или слово"
              autoComplete="off"
              onChange={(event) => props.onText(event.target.value)}
            />
          </Labeled>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Фильтр по типу">
            <button type="button" className={chipClass(props.typeFilter === "")} onClick={() => props.onTypeFilter("")}>
              Все
            </button>
            {props.types.map((type) => (
              <button
                key={type.id}
                type="button"
                className={chipClass(props.typeFilter === type.id)}
                onClick={() => props.onTypeFilter(type.id)}
              >
                {`${type.label || type.id} (${counts.get(type.id) || 0})`}
              </button>
            ))}
          </div>
          <div>
            <Btn onClick={props.onNew}>Новый товар</Btn>
          </div>
        </div>
        {emptyFilter ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="m-0 text-muted">{props.rows.length === 0 ? "В черновике пока нет товаров" : "Ничего не найдено"}</p>
            {props.rows.length > 0 ? (
              <Btn size="sm" onClick={props.onResetFilter}>
                Сбросить
              </Btn>
            ) : null}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-muted">
                    {["SKU", "Название", "Тип", "Ш × Г × В", "Цена", "Модель", "Двигается", ""].map((title) => (
                      <th key={title || "status"} scope="col" className="px-2 py-2 font-medium">
                        {title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {props.shown.map((row) => {
                    const selected = !props.routeCreate && row.sku === props.routeSku;
                    const showSwitch = selected ? props.form.type !== "person" : row.movable != null;
                    const movable = selected ? props.form.movable : row.movable;
                    return (
                      <tr
                        key={row.sku}
                        tabIndex={0}
                        aria-selected={selected}
                        className={rowClass(selected)}
                        onClick={() => props.onSelect(row.sku)}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          props.onSelect(row.sku);
                        }}
                      >
                        <td className="px-2 py-2 align-top font-medium">{row.sku}</td>
                        <td className="px-2 py-2 align-top">
                          <div>{row.label || "—"}</div>
                          {row.name ? <div className="text-xs text-muted">{row.name}</div> : null}
                        </td>
                        <td className="px-2 py-2 align-top">{row.typeLabel || "—"}</td>
                        <td className="px-2 py-2 align-top whitespace-nowrap">
                          {row.width == null ? "—" : `${row.width} × ${row.depth} × ${row.height}`}
                        </td>
                        <td className="px-2 py-2 align-top whitespace-nowrap">{row.priceEur == null ? "—" : `${row.priceEur} €`}</td>
                        <td className="px-2 py-2 align-top">
                          {row.modelListed ? "✓ указана" : <span className="text-muted">нет</span>}
                        </td>
                        <td className="px-2 py-2 align-top">
                          {showSwitch ? (
                            <Switch
                              checked={movable === true}
                              disabled={props.working}
                              label={`Двигается: ${row.sku}`}
                              onChange={(checked) => props.onMovable(row.sku, checked)}
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-2 py-2 align-top">
                          {row.unpublished ? <Pill tone="warn">не опубликовано</Pill> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {props.hidden > 0 ? (
              <div className="mt-3">
                <Btn onClick={props.onMore}>Показать ещё 100</Btn>
              </div>
            ) : null}
          </>
        )}
      </div>
      <Card className="min-w-0 p-4">
        {!showForm ? (
          <p className="m-0 text-muted">
            {props.routeSku ? `Товар ${props.routeSku} не найден в черновике.` : "Выберите товар в таблице или создайте новый."}
          </p>
        ) : (
          <>
            <h2 className="mt-0 mb-3 text-lg font-semibold">{props.original ? props.original.sku : "Новый товар"}</h2>
            <div className="mb-4">
              <Segmented label="Карточка товара" items={CARD_TABS} value={props.cardTab} onChange={props.onCardTab} />
            </div>
            {props.cardTab === "main" ? (
              <div className="flex flex-col gap-3">
                <Labeled label="Артикул" error={props.errors.sku}>
                  <input
                    className={controlClass}
                    value={props.form.sku}
                    readOnly={Boolean(props.original)}
                    autoComplete="off"
                    onChange={(event) => props.onPatch({ sku: event.target.value })}
                  />
                </Labeled>
                <Labeled label="Тип" error={props.errors.type}>
                  <Select value={props.form.type} disabled={props.working} onChange={(event) => props.onPatch({ type: event.target.value })}>
                    <option value="">Выберите тип</option>
                    {props.types.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.label || type.id}
                      </option>
                    ))}
                  </Select>
                </Labeled>
                <Labeled label="Название" error={props.errors.name}>
                  <input
                    className={controlClass}
                    value={props.form.name}
                    autoComplete="off"
                    disabled={props.working}
                    onChange={(event) => props.onPatch({ name: event.target.value })}
                  />
                </Labeled>
                <Labeled label="Подпись" error={props.errors.label}>
                  <input
                    className={controlClass}
                    value={props.form.label}
                    autoComplete="off"
                    disabled={props.working}
                    onChange={(event) => props.onPatch({ label: event.target.value })}
                  />
                </Labeled>
                <div className="grid grid-cols-3 gap-2 narrow:grid-cols-1">
                  <Labeled label="Ширина, мм" error={props.errors.width}>
                    <input
                      className={controlClass}
                      inputMode="decimal"
                      value={props.form.width}
                      autoComplete="off"
                      disabled={props.working}
                      onChange={(event) => props.onPatch({ width: event.target.value })}
                    />
                  </Labeled>
                  <Labeled label="Глубина, мм" error={props.errors.depth}>
                    <input
                      className={controlClass}
                      inputMode="decimal"
                      value={props.form.depth}
                      autoComplete="off"
                      disabled={props.working}
                      onChange={(event) => props.onPatch({ depth: event.target.value })}
                    />
                  </Labeled>
                  <Labeled label="Высота, мм" error={props.errors.height}>
                    <input
                      className={controlClass}
                      inputMode="decimal"
                      value={props.form.height}
                      autoComplete="off"
                      disabled={props.working}
                      onChange={(event) => props.onPatch({ height: event.target.value })}
                    />
                  </Labeled>
                </div>
                {person ? null : (
                  <Labeled label="Цена, евро" error={props.errors.priceEur}>
                    <input
                      className={controlClass}
                      inputMode="decimal"
                      value={props.form.priceEur}
                      autoComplete="off"
                      disabled={props.working}
                      onChange={(event) => props.onPatch({ priceEur: event.target.value })}
                    />
                  </Labeled>
                )}
                <div>
                  <Labeled label="Слова" error={props.errors.words}>
                    <input
                      className={controlClass}
                      value={props.form.words}
                      autoComplete="off"
                      disabled={props.working}
                      placeholder="через запятую"
                      onChange={(event) => props.onPatch({ words: event.target.value })}
                    />
                  </Labeled>
                  {words.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {words.map((word) => (
                        <Pill key={word}>{word}</Pill>
                      ))}
                    </div>
                  ) : null}
                </div>
                {person ? null : (
                  <Check
                    checked={props.form.movable === true}
                    disabled={props.working}
                    label="Двигается на сцене"
                    onChange={(checked) => props.onPatch({ movable: checked })}
                  />
                )}
                <details className="rounded-lg border border-line px-3 py-2">
                  <summary className="cursor-pointer font-medium">
                    Размещение
                    {props.form.seatHeightMm || props.form.hostSku ? <span className="ml-2 font-normal text-muted">задано</span> : null}
                  </summary>
                  <div className="mt-3 flex flex-col gap-3">
                    <Labeled label="Высота сиденья, мм" error={props.errors.seatHeightMm}>
                      <input
                        className={controlClass}
                        inputMode="numeric"
                        value={props.form.seatHeightMm}
                        autoComplete="off"
                        disabled={props.working}
                        onChange={(event) => props.onPatch({ seatHeightMm: event.target.value })}
                      />
                    </Labeled>
                    <Labeled label="SKU хозяина" error={props.errors.hostSku}>
                      <Select
                        value={props.form.hostSku}
                        disabled={props.working}
                        onChange={(event) => props.onPatch({ hostSku: event.target.value })}
                      >
                        <option value="">Не задан</option>
                        {hostOptions.map((item) => (
                          <option key={item.sku} value={item.sku}>
                            {item.label ? `${item.sku} — ${item.label}` : item.sku}
                          </option>
                        ))}
                      </Select>
                    </Labeled>
                  </div>
                </details>
                {props.serverLines ? <ErrorBlock lines={props.serverLines} /> : null}
                <div className="flex flex-wrap gap-2">
                  <Btn kind="primary" busy={props.working} disabled={!props.canSave} onClick={props.onSave}>
                    Сохранить в черновик
                  </Btn>
                  <Btn disabled={!props.productDirty || props.working} onClick={props.onCancel}>
                    Отменить
                  </Btn>
                </div>
                {props.original ? (
                  <div className="pt-2">
                    <Btn kind="danger" disabled={props.working} onClick={props.onDelete}>
                      Удалить товар
                    </Btn>
                  </div>
                ) : null}
              </div>
            ) : null}
            {props.cardTab === "model" ? (
              <ModelPane
                blocked={props.uploadBlocked}
                person={props.original && props.original.type === "person"}
                working={props.working}
                file={props.file}
                fileNote={props.fileNote}
                uploadError={props.uploadError}
                uploadResult={props.uploadResult}
                onFile={props.onFile}
                onUpload={props.onUpload}
              />
            ) : null}
            {props.cardTab === "links" ? <LinksPane facts={props.facts} matched={props.matched} types={props.types} /> : null}
          </>
        )}
      </Card>
    </div>
  );
}

function ModelPane({ blocked, person, working, file, fileNote, uploadError, uploadResult, onFile, onUpload }) {
  const compared = uploadResult ? compareSizes(uploadResult.sizeMm, uploadResult.catalogMm) : [];
  const mismatch = compared.some((row) => !row.ok);
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-muted">
        Загруженная модель сразу попадает на сервер. Каталог в черновике по-прежнему нужно опубликовать.
      </p>
      {blocked ? (
        <p className="m-0">Сначала сохраните товар в черновик: сервер сверяет модель с сохранёнными размерами.</p>
      ) : (
        <>
          <Labeled label="Файл .glb">
            <input
              className={controlClass}
              type="file"
              accept=".glb,model/gltf-binary"
              disabled={working}
              onChange={(event) => onFile(event.target.files && event.target.files[0] ? event.target.files[0] : null)}
            />
          </Labeled>
          {fileNote ? (
            <p className="m-0 text-sm text-bad" role="alert">
              {fileNote}
            </p>
          ) : null}
          <div>
            <Btn kind="primary" busy={working} disabled={!file} onClick={onUpload}>
              Загрузить
            </Btn>
          </div>
        </>
      )}
      {uploadError ? <ErrorBlock lines={uploadError} /> : null}
      {uploadResult ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  {["Ось", "В модели", "В каталоге", "Разница"].map((title) => (
                    <th key={title} scope="col" className="px-2 py-2 font-medium">
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compared.map((row) => (
                  <tr key={row.axis} className="border-b border-line">
                    <th scope="row" className="px-2 py-2 text-left font-medium">
                      {AXIS_LABEL[row.axis]}
                    </th>
                    <td className="px-2 py-2">{formatMeasure(row.model)}</td>
                    <td className="px-2 py-2">{formatMeasure(row.catalog)}</td>
                    <td className="px-2 py-2">
                      <span className="inline-flex flex-wrap items-center gap-2">
                        {formatMeasure(row.diff)}
                        {row.ok ? <Pill tone="ok">✓</Pill> : <Pill tone="bad">не совпадает</Pill>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {mismatch ? <p className="m-0">Размеры модели и каталога не совпали. Поправьте размеры товара или модель.</p> : null}
          {person ? (
            <p className="m-0">Для манекена колайдеры не строятся.</p>
          ) : (
            <>
              <h3 className="mt-2 mb-1 text-base font-semibold">Части</h3>
              <p className="m-0 text-sm text-muted">Центр относительно середины модели, размеры части — полные, в миллиметрах.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-muted">
                      {["Имя", "Центр, мм", "Размер, мм"].map((title) => (
                        <th key={title} scope="col" className="px-2 py-2 font-medium">
                          {title}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(Array.isArray(uploadResult.parts) ? uploadResult.parts : []).map((part, index) => (
                      <tr key={`${part && part.name ? part.name : "part"}-${index}`} className="border-b border-line">
                        <td className="px-2 py-2">{part && part.name ? part.name : "—"}</td>
                        <td className="px-2 py-2">{vecMm(part && part.center)}</td>
                        <td className="px-2 py-2">{vecMm(part && part.size)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}

function LinksPane({ facts, matched, types }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="mt-0 mb-2 text-base font-semibold">Тип</h3>
        {facts ? (
          <dl className="m-0 grid gap-2">
            <div>
              <dt className="text-sm text-muted">Название</dt>
              <dd className="m-0">{facts.label}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Может быть хозяином</dt>
              <dd className="m-0">{facts.canBeHost ? "да" : "нет"}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Лежит на</dt>
              <dd className="m-0">{facts.canHostOn.length > 0 ? facts.canHostOn.map((item) => item.label).join(", ") : "—"}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Максимум на сцене</dt>
              <dd className="m-0">{facts.maxOnScene == null ? "—" : String(facts.maxOnScene)}</dd>
            </div>
          </dl>
        ) : (
          <p className="m-0 text-muted">Тип не найден</p>
        )}
      </div>
      <div>
        <h3 className="mt-0 mb-2 text-base font-semibold">Подходит под потребности</h3>
        {matched.length === 0 ? (
          <p className="m-0 flex flex-wrap items-center gap-2">
            Ни одной потребности не подходит <Pill tone="warn">нет</Pill>
          </p>
        ) : (
          <ul className="m-0 list-disc pl-5">
            {matched.map((need) => (
              <li key={need.id} className="my-1">
                <span className="font-medium">{need.name || need.id}</span>
                <span className="block text-sm text-muted">{criteriaLabel(need, types)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <a className={LINK} href="#/map">
        Показать на карте связей
      </a>
    </div>
  );
}

function TypesPane({ types, products, typeId, form, errors, working, canSave, dirty, serverLines, onSelect, onPatch, onCancel, onSave }) {
  const options = types.map((type) => ({ id: type.id, label: type.label || type.id }));
  const known = new Set(options.map((item) => item.id));
  const extraOptions = form ? form.canHostOn.filter((id) => !known.has(id)).map((id) => ({ id, label: id })) : [];
  return (
    <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)] items-start gap-4 narrow:grid-cols-1">
      <div className="min-w-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                {["id", "Название", "Хозяин?", "Лежит на", "Максимум", "Товаров"].map((title) => (
                  <th key={title} scope="col" className="px-2 py-2 font-medium">
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {types.map((type) => {
                const hosts = Array.isArray(type.canHostOn) ? type.canHostOn : [];
                const hostLabels = hosts.map((id) => {
                  const found = types.find((item) => item.id === id);
                  return found && found.label ? found.label : id;
                });
                const count = products.filter((item) => item && item.type === type.id).length;
                const selected = type.id === typeId;
                return (
                  <tr
                    key={type.id}
                    tabIndex={0}
                    aria-selected={selected}
                    className={rowClass(selected)}
                    onClick={() => onSelect(type.id)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      onSelect(type.id);
                    }}
                  >
                    <td className="px-2 py-2 align-top font-medium">{type.id}</td>
                    <td className="px-2 py-2 align-top">{type.label || "—"}</td>
                    <td className="px-2 py-2 align-top">{type.canBeHost ? "да" : "нет"}</td>
                    <td className="px-2 py-2 align-top">{hostLabels.length > 0 ? hostLabels.join(", ") : "—"}</td>
                    <td className="px-2 py-2 align-top">{type.maxOnScene == null ? "—" : String(type.maxOnScene)}</td>
                    <td className="px-2 py-2 align-top">{count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 mb-0 text-sm text-muted">Новые типы добавляются в режиме JSON.</p>
      </div>
      <Card className="min-w-0 p-4">
        {form ? (
          <div className="flex flex-col gap-3">
            <h2 className="mt-0 mb-0 text-lg font-semibold">{typeId}</h2>
            <Labeled label="Название" error={errors.label}>
              <input
                className={controlClass}
                value={form.label}
                autoComplete="off"
                disabled={working}
                onChange={(event) => onPatch({ label: event.target.value })}
              />
            </Labeled>
            <Check
              checked={form.canBeHost === true}
              disabled={working}
              label="Может быть хозяином"
              onChange={(checked) => onPatch({ canBeHost: checked })}
            />
            <div>
              <p className="mt-0 mb-1 text-sm font-medium">Лежит на</p>
              <MultiSelect
                options={[...options, ...extraOptions]}
                value={form.canHostOn}
                disabled={working}
                onChange={(canHostOn) => onPatch({ canHostOn })}
              />
            </div>
            <Labeled label="Максимум на сцене" error={errors.maxOnScene}>
              <input
                className={controlClass}
                inputMode="numeric"
                value={form.maxOnScene}
                autoComplete="off"
                disabled={working}
                placeholder="пусто — без ограничения"
                onChange={(event) => onPatch({ maxOnScene: event.target.value })}
              />
            </Labeled>
            <Labeled label="Остальные поля (JSON)" error={errors.extra}>
              <textarea
                className={`${controlClass} min-h-40 font-mono text-sm`}
                value={form.extraText}
                spellCheck={false}
                disabled={working}
                onChange={(event) => onPatch({ extraText: event.target.value })}
              />
            </Labeled>
            {serverLines ? <ErrorBlock lines={serverLines} /> : null}
            <div className="flex flex-wrap gap-2">
              <Btn kind="primary" busy={working} disabled={!canSave} onClick={onSave}>
                Сохранить в черновик
              </Btn>
              <Btn disabled={!dirty || working} onClick={onCancel}>
                Отменить
              </Btn>
            </div>
          </div>
        ) : (
          <p className="m-0 text-muted">Выберите тип в таблице.</p>
        )}
      </Card>
    </div>
  );
}

function NeedsPane({ needs, types, products, needId, form, errors, working, canSave, dirty, serverLines, onSelect, onPatch, onCancel, onSave }) {
  return (
    <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)] items-start gap-4 narrow:grid-cols-1">
      <div className="min-w-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                {["id", "Название", "Зачем", "Критерий", "Товаров"].map((title) => (
                  <th key={title} scope="col" className="px-2 py-2 font-medium">
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {needs.map((need) => {
                const count = products.filter((item) => matchingNeeds(item, [need]).length > 0).length;
                const selected = need.id === needId;
                return (
                  <tr
                    key={need.id}
                    tabIndex={0}
                    aria-selected={selected}
                    className={rowClass(selected)}
                    onClick={() => onSelect(need.id)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      onSelect(need.id);
                    }}
                  >
                    <td className="px-2 py-2 align-top font-medium">{need.id}</td>
                    <td className="px-2 py-2 align-top">{need.name || "—"}</td>
                    <td className="px-2 py-2 align-top">{need.why || "—"}</td>
                    <td className="px-2 py-2 align-top">{criteriaLabel(need, types)}</td>
                    <td className="px-2 py-2 align-top">{count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 mb-0 text-sm text-muted">Новые потребности добавляются в режиме JSON.</p>
      </div>
      <Card className="min-w-0 p-4">
        {form ? (
          <div className="flex flex-col gap-3">
            <h2 className="mt-0 mb-0 text-lg font-semibold">{needId}</h2>
            <Labeled label="Название" error={errors.name}>
              <input
                className={controlClass}
                value={form.name}
                autoComplete="off"
                disabled={working}
                onChange={(event) => onPatch({ name: event.target.value })}
              />
            </Labeled>
            <Labeled label="Зачем" error={errors.why}>
              <textarea
                className={`${controlClass} min-h-24`}
                value={form.why}
                disabled={working}
                onChange={(event) => onPatch({ why: event.target.value })}
              />
            </Labeled>
            <Labeled label="Тип критерия" error={errors.type}>
              <Select value={form.type} disabled={working} onChange={(event) => onPatch({ type: event.target.value })}>
                <option value="">Выберите тип</option>
                {types.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.label || type.id}
                  </option>
                ))}
              </Select>
            </Labeled>
            <Labeled label="Минимальная ширина, мм" error={errors.minWidth}>
              <input
                className={controlClass}
                inputMode="numeric"
                value={form.minWidth}
                autoComplete="off"
                disabled={working}
                placeholder="пусто — без ограничения"
                onChange={(event) => onPatch({ minWidth: event.target.value })}
              />
            </Labeled>
            {serverLines ? <ErrorBlock lines={serverLines} /> : null}
            <div className="flex flex-wrap gap-2">
              <Btn kind="primary" busy={working} disabled={!canSave} onClick={onSave}>
                Сохранить в черновик
              </Btn>
              <Btn disabled={!dirty || working} onClick={onCancel}>
                Отменить
              </Btn>
            </div>
          </div>
        ) : (
          <p className="m-0 text-muted">Выберите потребность в таблице.</p>
        )}
      </Card>
    </div>
  );
}

export { Catalog };
