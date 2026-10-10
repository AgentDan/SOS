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
import { banner, el, errorBlock, loading } from "../ui.js";

function pretty(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function problemView(status, body) {
  return errorBlock(problemLines(status, body));
}

function mountSectionEditor(root, { name, onDirty }) {
  const controller = new AbortController();
  const signal = controller.signal;
  let alive = true;
  let working = false;
  let serverText = "";
  let baseVersion = null;
  let textarea = null;
  let status = null;
  let draftVersionNode = null;
  let publishedVersionNode = null;
  let diffNode = null;
  let historyNode = null;
  let descriptionInput = null;
  let publishedSnapshot;
  const label = sectionLabel(name);

  function showDiff(draft) {
    const differs = draftsDiffer(draft, publishedSnapshot);
    diffNode.className = differs ? "flag flag-warn" : "muted";
    diffNode.textContent = differs
      ? "Черновик отличается от опубликованного"
      : "Черновик совпадает с опубликованным";
  }

  function dirtyNow() {
    return Boolean(textarea) && hasUnsavedEdits(textarea.value, serverText);
  }

  function syncDirty() {
    onDirty(dirtyNow());
  }

  function setWorking(on) {
    working = on;
    for (const button of root.querySelectorAll("button")) button.disabled = on;
    if (textarea) textarea.disabled = on;
    if (descriptionInput) descriptionInput.disabled = on;
  }

  function show(node) {
    if (status) status.replaceChildren(node);
  }

  async function reload({ replaceText, keepStatus }) {
    const data = await getSection(name, { signal });
    if (!alive || !textarea) return;
    baseVersion = data.draftVersion;
    publishedSnapshot = data.published;
    serverText = pretty(data.draft);
    if (replaceText) {
      textarea.value = serverText;
      syncDirty();
    }
    draftVersionNode.textContent = `Черновик: версия ${data.draftVersion}`;
    publishedVersionNode.textContent = `Опубликовано: версия ${data.publishedVersion}`;
    showDiff(data.draft);
    historyNode.replaceChildren(historyView(Array.isArray(data.history) ? data.history : []));
    if (!keepStatus) status.replaceChildren();
  }

  function historyView(history) {
    if (history.length === 0) return el("p", { className: "muted", text: "Истории пока нет" });
    const body = el("tbody");
    for (const entry of [...history].reverse()) {
      const version = entry && entry.version;
      const button = el("button", {
        type: "button",
        text: "Откатить на эту версию",
        onClick: () => rollback(version)
      });
      if (typeof version !== "number") button.disabled = true;
      body.append(
        el(
          "tr",
          null,
          el("td", { text: version == null ? "—" : String(version) }),
          el("td", { text: entry && entry.date ? formatLocalTime(entry.date) : "—" }),
          el("td", { text: historyLabel(entry) }),
          el("td", null, button)
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
          el("th", { scope: "col", text: "Версия" }),
          el("th", { scope: "col", text: "Дата" }),
          el("th", { scope: "col", text: "Описание" }),
          el("th", { scope: "col", text: "Действие" })
        )
      ),
      body
    );
  }

  function conflictBox() {
    return el(
      "div",
      { className: "banner banner-warn", role: "status" },
      el("span", { className: "banner-word", text: "Внимание" }),
      el("span", { className: "banner-text", text: "Раздел уже изменили в другом месте" }),
      el("button", { type: "button", text: "Загрузить актуальную версию", onClick: () => loadLatest() })
    );
  }

  async function loadLatest() {
    if (working) return;
    setWorking(true);
    try {
      await reload({ replaceText: true, keepStatus: true });
      if (!alive) return;
      show(banner("ok", "Загружена актуальная версия с сервера"));
    } catch (err) {
      if (!alive || isAbort(err) || err.status === 401) return;
      show(problemView(err.status, err.body));
    } finally {
      if (alive) setWorking(false);
    }
  }

  async function reset() {
    if (working) return;
    if (dirtyNow() && !window.confirm("Сбросить правки и вернуть то, что сейчас на сервере?")) return;
    setWorking(true);
    try {
      await reload({ replaceText: true, keepStatus: true });
      if (!alive) return;
      show(banner("ok", "В редакторе снова то, что лежит на сервере"));
    } catch (err) {
      if (!alive || isAbort(err) || err.status === 401) return;
      show(problemView(err.status, err.body));
    } finally {
      if (alive) setWorking(false);
    }
  }

  async function save() {
    if (working || !textarea) return;
    const parsed = parseJsonText(textarea.value);
    if (!parsed.ok) {
      show(banner("error", parsed.message));
      return;
    }
    setWorking(true);
    try {
      const result = await saveDraft(name, parsed.value, baseVersion, { signal });
      if (!alive) return;
      baseVersion = result.draftVersion;
      serverText = textarea.value;
      draftVersionNode.textContent = `Черновик: версия ${result.draftVersion}`;
      showDiff(parsed.value);
      syncDirty();
      show(banner("ok", `Сохранено, версия черновика ${result.draftVersion}`));
    } catch (err) {
      if (!alive || isAbort(err) || err.status === 401) return;
      if (err.status === 409) {
        show(conflictBox());
        return;
      }
      show(problemView(err.status, err.body));
    } finally {
      if (alive) setWorking(false);
    }
  }

  async function publish() {
    if (working || !textarea) return;
    const description = descriptionInput.value.trim();
    if (!description) {
      show(banner("warn", "Напишите, что изменено"));
      descriptionInput.focus();
      return;
    }
    const parsed = parseJsonText(textarea.value);
    if (!parsed.ok) {
      show(banner("error", parsed.message));
      return;
    }
    if (dirtyNow()) {
      show(banner("warn", "Сначала сохраните черновик"));
      return;
    }
    const agreed = window.confirm(`Опубликовать раздел «${label}»? Клиент увидит эти данные.`);
    if (!agreed) return;
    setWorking(true);
    try {
      const result = await publishSection(name, description, { signal });
      if (!alive) return;
      descriptionInput.value = "";
      await reload({ replaceText: true, keepStatus: true });
      if (!alive) return;
      show(banner("ok", `Опубликовано, версия ${result.publishedVersion}`));
    } catch (err) {
      if (!alive || isAbort(err) || err.status === 401) return;
      show(problemView(err.status, err.body));
    } finally {
      if (alive) setWorking(false);
    }
  }

  async function rollback(version) {
    if (working) return;
    const extra = dirtyNow() ? " Несохранённый текст в редакторе пропадёт." : "";
    const agreed = window.confirm(
      `Откатить раздел «${label}» на версию ${version}? Черновик тоже вернётся к этой версии.${extra}`
    );
    if (!agreed) return;
    setWorking(true);
    try {
      const result = await rollbackSection(name, version, { signal });
      if (!alive) return;
      await reload({ replaceText: true, keepStatus: true });
      if (!alive) return;
      show(banner("ok", `Откат выполнен, опубликованная версия ${result.publishedVersion}`));
    } catch (err) {
      if (!alive || isAbort(err) || err.status === 401) return;
      show(problemView(err.status, err.body));
    } finally {
      if (alive) setWorking(false);
    }
  }

  function build(data) {
    serverText = pretty(data.draft);
    baseVersion = data.draftVersion;
    publishedSnapshot = data.published;
    textarea = el("textarea", {
      className: "json-editor",
      wrap: "off",
      spellcheck: "false",
      autocapitalize: "off",
      "aria-label": "Черновик раздела"
    });
    textarea.value = serverText;
    textarea.addEventListener("input", syncDirty);
    status = el("div", { className: "status" });
    draftVersionNode = el("p", { text: `Черновик: версия ${data.draftVersion}` });
    publishedVersionNode = el("p", { text: `Опубликовано: версия ${data.publishedVersion}` });
    diffNode = el("p");
    showDiff(data.draft);
    descriptionInput = el("input", { type: "text", autocomplete: "off" });
    historyNode = el("div", { className: "table-wrap" }, historyView(Array.isArray(data.history) ? data.history : []));

    root.replaceChildren(
      el("h1", { text: label }),
      el(
        "div",
        { className: "editor-grid" },
        el("div", { className: "editor-main" }, el("h2", { text: "Черновик" }), textarea),
        el(
          "div",
          { className: "editor-side" },
          el("h2", { text: "Версии" }),
          draftVersionNode,
          publishedVersionNode,
          diffNode,
          el("button", { type: "button", className: "primary", text: "Сохранить черновик", onClick: () => save() }),
          el("label", { className: "field" }, el("span", { text: "Что изменено" }), descriptionInput),
          el("button", { type: "button", className: "primary", text: "Опубликовать", onClick: () => publish() }),
          el("button", { type: "button", text: "Сбросить правки", onClick: () => reset() }),
          status
        )
      ),
      el("h2", { text: "История версий" }),
      historyNode
    );
    syncDirty();
  }

  root.replaceChildren(loading());
  getSection(name, { signal })
    .then((data) => {
      if (!alive) return;
      build(data);
    })
    .catch((err) => {
      if (!alive || isAbort(err) || err.status === 401) return;
      root.replaceChildren(el("h1", { text: label }), problemView(err.status, err.body));
    });

  return () => {
    alive = false;
    onDirty(false);
    controller.abort();
  };
}

export { mountSectionEditor };
