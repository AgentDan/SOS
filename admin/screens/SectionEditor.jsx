import { useEffect, useRef, useState } from "react";
import {
  getSection,
  isAbort,
  publishSection,
  rollbackSection,
  saveDraft
} from "../api/admin-api.js";
import { draftsDiffer, hasUnsavedEdits } from "../lib/edits.js";
import { parseJsonText } from "../lib/json-text.js";
import { formatLocalTime, historyLabel, problemLines } from "../lib/messages.js";
import { sectionLabel } from "../lib/sections.js";
import { Banner } from "../components/Banner.jsx";
import { ConfirmButton, confirmAction } from "../components/confirm.jsx";
import { DataTable } from "../components/DataTable.jsx";
import { ErrorBlock } from "../components/ErrorBlock.jsx";
import { Loading } from "../components/Loading.jsx";
import { banner, bannerTone, bannerWord, flag, primary } from "../styles/classes.js";

function pretty(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function Notice({ notice, working, onLoadLatest }) {
  if (!notice) return null;
  if (notice.kind === "conflict") {
    return (
      <div className={`${banner} ${bannerTone.warn}`} role="status">
        <span className={bannerWord}>Внимание</span>
        <span>Раздел уже изменили в другом месте</span>
        <button type="button" className="col-span-full w-full" disabled={working} onClick={onLoadLatest}>
          Загрузить актуальную версию
        </button>
      </div>
    );
  }
  if (notice.kind === "problem") return <ErrorBlock lines={problemLines(notice.status, notice.body)} />;
  return <Banner kind={notice.kind} text={notice.text} />;
}

function HistoryTable({ history, working, rollbackMessage, onRollback }) {
  const rows = [...history].reverse();
  if (rows.length === 0) return <p className="text-muted">Истории пока нет</p>;
  return (
    <DataTable
      columns={[
        {
          key: "version",
          title: "Версия",
          render: (entry) => (entry && entry.version == null ? "—" : String(entry.version))
        },
        {
          key: "date",
          title: "Дата",
          render: (entry) => (entry && entry.date ? formatLocalTime(entry.date) : "—")
        },
        { key: "desc", title: "Описание", render: (entry) => historyLabel(entry) },
        {
          key: "action",
          title: "Действие",
          render: (entry) => (
            <ConfirmButton
              message={() => rollbackMessage(entry && entry.version)}
              disabled={working || typeof (entry && entry.version) !== "number"}
              onConfirm={() => onRollback(entry.version)}
            >
              Откатить на эту версию
            </ConfirmButton>
          )
        }
      ]}
      rows={rows}
      rowKey={(entry, index) => `${entry && entry.version != null ? entry.version : "x"}-${index}`}
    />
  );
}

function SectionEditor({ name, onDirty }) {
  const label = sectionLabel(name);
  const [phase, setPhase] = useState("loading");
  const [loadError, setLoadError] = useState(null);
  const [text, setText] = useState("");
  const [serverText, setServerText] = useState("");
  const [draftVersion, setDraftVersion] = useState(null);
  const [publishedVersion, setPublishedVersion] = useState(null);
  const [publishedSnapshot, setPublishedSnapshot] = useState(undefined);
  const [draftValue, setDraftValue] = useState(undefined);
  const [history, setHistory] = useState([]);
  const [notice, setNotice] = useState(null);
  const [working, setWorking] = useState(false);
  const [description, setDescription] = useState("");

  const aliveRef = useRef(true);
  const workingRef = useRef(false);
  const textRef = useRef("");
  const serverTextRef = useRef("");
  const baseVersionRef = useRef(null);
  const descriptionRef = useRef("");
  const descriptionInputRef = useRef(null);
  const controllerRef = useRef(null);

  useEffect(() => {
    if (phase !== "ready") return undefined;
    onDirty(hasUnsavedEdits(text, serverText));
    return () => onDirty(false);
  }, [phase, text, serverText, onDirty]);

  function adopt(data, { replaceText, keepStatus }) {
    const nextServer = pretty(data.draft);
    baseVersionRef.current = data.draftVersion;
    serverTextRef.current = nextServer;
    if (replaceText) {
      textRef.current = nextServer;
      setText(nextServer);
    }
    setServerText(nextServer);
    setDraftVersion(data.draftVersion);
    setPublishedVersion(data.publishedVersion);
    setPublishedSnapshot(data.published);
    setDraftValue(data.draft);
    setHistory(Array.isArray(data.history) ? data.history : []);
    if (!keepStatus) setNotice(null);
  }

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    aliveRef.current = true;
    let alive = true;
    getSection(name, { signal: controller.signal })
      .then((data) => {
        if (!alive) return;
        adopt(data, { replaceText: true, keepStatus: false });
        setPhase("ready");
      })
      .catch((err) => {
        if (!alive || isAbort(err) || err.status === 401) return;
        setLoadError(err);
        setPhase("error");
      });
    return () => {
      alive = false;
      aliveRef.current = false;
      onDirty(false);
      controller.abort();
    };
  }, [name, onDirty]);

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

  async function reload({ replaceText, keepStatus }) {
    const data = await getSection(name, { signal: controllerRef.current.signal });
    if (!aliveRef.current) return false;
    adopt(data, { replaceText, keepStatus });
    return true;
  }

  async function loadLatest() {
    if (!begin()) return;
    try {
      const ok = await reload({ replaceText: true, keepStatus: true });
      if (!ok || !aliveRef.current) return;
      setNotice({ kind: "ok", text: "Загружена актуальная версия с сервера" });
    } catch (err) {
      if (stopIfAuth(err)) return;
      setNotice({ kind: "problem", status: err.status, body: err.body });
    } finally {
      finish();
    }
  }

  async function reset() {
    if (workingRef.current) return;
    const dirty = hasUnsavedEdits(textRef.current, serverTextRef.current);
    if (dirty && !confirmAction("Сбросить правки и вернуть то, что сейчас на сервере?")) return;
    if (!begin()) return;
    try {
      const ok = await reload({ replaceText: true, keepStatus: true });
      if (!ok || !aliveRef.current) return;
      setNotice({ kind: "ok", text: "В редакторе снова то, что лежит на сервере" });
    } catch (err) {
      if (stopIfAuth(err)) return;
      setNotice({ kind: "problem", status: err.status, body: err.body });
    } finally {
      finish();
    }
  }

  async function save() {
    if (workingRef.current) return;
    const parsed = parseJsonText(textRef.current);
    if (!parsed.ok) {
      setNotice({ kind: "error", text: parsed.message });
      return;
    }
    if (!begin()) return;
    try {
      const result = await saveDraft(name, parsed.value, baseVersionRef.current, {
        signal: controllerRef.current.signal
      });
      if (!aliveRef.current) return;
      baseVersionRef.current = result.draftVersion;
      serverTextRef.current = textRef.current;
      setServerText(textRef.current);
      setDraftVersion(result.draftVersion);
      setDraftValue(parsed.value);
      setNotice({ kind: "ok", text: `Сохранено, версия черновика ${result.draftVersion}` });
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

  async function publish() {
    if (workingRef.current) return;
    const descriptionValue = descriptionRef.current.trim();
    if (!descriptionValue) {
      setNotice({ kind: "warn", text: "Напишите, что изменено" });
      descriptionInputRef.current?.focus();
      return;
    }
    const parsed = parseJsonText(textRef.current);
    if (!parsed.ok) {
      setNotice({ kind: "error", text: parsed.message });
      return;
    }
    if (hasUnsavedEdits(textRef.current, serverTextRef.current)) {
      setNotice({ kind: "warn", text: "Сначала сохраните черновик" });
      return;
    }
    if (!confirmAction(`Опубликовать раздел «${label}»? Клиент увидит эти данные.`)) return;
    if (!begin()) return;
    try {
      const result = await publishSection(name, descriptionValue, { signal: controllerRef.current.signal });
      if (!aliveRef.current) return;
      descriptionRef.current = "";
      setDescription("");
      const ok = await reload({ replaceText: true, keepStatus: true });
      if (!ok || !aliveRef.current) return;
      setNotice({ kind: "ok", text: `Опубликовано, версия ${result.publishedVersion}` });
    } catch (err) {
      if (stopIfAuth(err)) return;
      setNotice({ kind: "problem", status: err.status, body: err.body });
    } finally {
      finish();
    }
  }

  function rollbackMessage(version) {
    const extra = hasUnsavedEdits(textRef.current, serverTextRef.current)
      ? " Несохранённый текст в редакторе пропадёт."
      : "";
    return `Откатить раздел «${label}» на версию ${version}? Черновик тоже вернётся к этой версии.${extra}`;
  }

  async function rollback(version) {
    if (!begin()) return;
    try {
      const result = await rollbackSection(name, version, { signal: controllerRef.current.signal });
      if (!aliveRef.current) return;
      const ok = await reload({ replaceText: true, keepStatus: true });
      if (!ok || !aliveRef.current) return;
      setNotice({ kind: "ok", text: `Откат выполнен, опубликованная версия ${result.publishedVersion}` });
    } catch (err) {
      if (stopIfAuth(err)) return;
      setNotice({ kind: "problem", status: err.status, body: err.body });
    } finally {
      finish();
    }
  }

  if (phase === "loading") return <Loading />;
  if (phase === "error") {
    return (
      <>
        <h1>{label}</h1>
        <ErrorBlock lines={problemLines(loadError && loadError.status, loadError && loadError.body)} />
      </>
    );
  }

  const differs = draftsDiffer(draftValue, publishedSnapshot);

  return (
    <>
      <h1>{label}</h1>
      <div className="mb-7 grid grid-cols-[minmax(0,1fr)_280px] items-start gap-4 max-[900px]:grid-cols-1">
        <div>
          <h2>Черновик</h2>
          <textarea
            className="min-h-[60vh] w-full resize-y overflow-auto border border-line bg-surface p-3 font-editor text-[13px] leading-[1.45] whitespace-pre"
            wrap="off"
            spellCheck={false}
            autoCapitalize="off"
            aria-label="Черновик раздела"
            value={text}
            disabled={working}
            onChange={(event) => {
              textRef.current = event.target.value;
              setText(event.target.value);
            }}
          />
        </div>
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3.5">
          <h2>Версии</h2>
          <p>{`Черновик: версия ${draftVersion}`}</p>
          <p>{`Опубликовано: версия ${publishedVersion}`}</p>
          <p className={differs ? flag : "text-muted"}>
            {differs ? "Черновик отличается от опубликованного" : "Черновик совпадает с опубликованным"}
          </p>
          <button type="button" className={`w-full ${primary}`} disabled={working} onClick={save}>
            Сохранить черновик
          </button>
          <label className="my-1 flex flex-col gap-1">
            <span>Что изменено</span>
            <input
              ref={descriptionInputRef}
              type="text"
              autoComplete="off"
              value={description}
              disabled={working}
              onChange={(event) => {
                descriptionRef.current = event.target.value;
                setDescription(event.target.value);
              }}
            />
          </label>
          <button type="button" className={`w-full ${primary}`} disabled={working} onClick={publish}>
            Опубликовать
          </button>
          <button type="button" className="w-full" disabled={working} onClick={reset}>
            Сбросить правки
          </button>
          <div className="empty:hidden">
            <Notice notice={notice} working={working} onLoadLatest={loadLatest} />
          </div>
        </div>
      </div>
      <h2>История версий</h2>
      <div className="mb-4 overflow-x-auto">
        <HistoryTable
          history={history}
          working={working}
          rollbackMessage={rollbackMessage}
          onRollback={rollback}
        />
      </div>
    </>
  );
}

export { SectionEditor };
