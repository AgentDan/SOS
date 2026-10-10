import { isAbort, listSections, setUnauthorizedHandler } from "./api/admin-api.js";
import { loginFailure } from "./lib/messages.js";
import { sectionLabel } from "./lib/sections.js";
import { clearToken, getToken } from "./session/token.js";
import { mountJournal } from "./screens/journal.js";
import { mountKnobs } from "./screens/knobs.js";
import { mountLogin } from "./screens/login.js";
import { mountOverview } from "./screens/overview.js";
import { mountSectionEditor } from "./screens/section-editor.js";
import { mountSections } from "./screens/sections.js";
import { el, loading } from "./ui.js";

const LEAVE_TEXT = "Есть несохранённые правки. Уйти без сохранения?";
const NAV = [
  ["overview", "Обзор"],
  ["sections", "Разделы"],
  ["knobs", "Ручки"],
  ["journal", "Журнал"]
];

const app = document.querySelector("#app");
let cleanup = () => {};
let dirty = false;
let mode = "boot";
let suppress = false;
let currentHash = location.hash;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [head, ...rest] = raw.split("/");
  const name = rest.join("/");
  if (head === "sections" && name) {
    let decoded = name;
    try {
      decoded = decodeURIComponent(name);
    } catch {
      decoded = name;
    }
    return { screen: "section", name: decoded };
  }
  if (head === "sections") return { screen: "sections" };
  if (head === "knobs") return { screen: "knobs" };
  if (head === "journal") return { screen: "journal" };
  return { screen: "overview" };
}

function hrefFor(route) {
  if (route.screen === "section") return `#/sections/${encodeURIComponent(route.name)}`;
  if (route.screen === "sections") return "#/sections";
  if (route.screen === "knobs") return "#/knobs";
  if (route.screen === "journal") return "#/journal";
  return "#/overview";
}

function sameHash(hash, next) {
  return hash === next || ((hash === "" || hash === "#") && next === "#/overview");
}

function titleFor(route) {
  if (route.screen === "section") return `Админка — ${sectionLabel(route.name)}`;
  const names = { overview: "Обзор", sections: "Разделы", knobs: "Ручки", journal: "Журнал" };
  return `Админка — ${names[route.screen] || "Обзор"}`;
}

function markNav(route) {
  const active = route.screen === "section" ? "sections" : route.screen;
  for (const button of app.querySelectorAll("[data-screen]")) {
    const on = button.dataset.screen === active;
    button.classList.toggle("active", on);
    if (on) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
}

function renderRoute() {
  cleanup();
  const content = app.querySelector("#content");
  if (!content) return;
  const route = parseHash();
  markNav(route);
  document.title = titleFor(route);
  const openSection = (name) => requestGo({ screen: "section", name });
  const onDirty = (value) => {
    dirty = value;
  };
  if (route.screen === "section") cleanup = mountSectionEditor(content, { name: route.name, onDirty });
  else if (route.screen === "sections") cleanup = mountSections(content, { openSection });
  else if (route.screen === "knobs") cleanup = mountKnobs(content, { openSection });
  else if (route.screen === "journal") cleanup = mountJournal(content);
  else cleanup = mountOverview(content, { openSection });
}

function requestGo(route) {
  const next = hrefFor(route);
  if (dirty && !window.confirm(LEAVE_TEXT)) return;
  dirty = false;
  if (sameHash(location.hash, next)) {
    renderRoute();
    return;
  }
  location.hash = next;
}

function showLogin(message) {
  mode = "login";
  document.title = "Админка deskOS";
  cleanup();
  cleanup = () => {};
  app.className = "app app-login";
  cleanup = mountLogin(app, {
    message,
    onSuccess() {
      showShell();
    }
  });
}

function showShell() {
  mode = "app";
  cleanup();
  cleanup = () => {};
  app.className = "app app-shell";
  const nav = el("nav");
  for (const [screen, text] of NAV) {
    nav.append(
      el("button", {
        type: "button",
        "data-screen": screen,
        text,
        onClick: () => requestGo({ screen })
      })
    );
  }
  app.replaceChildren(
    el(
      "div",
      { className: "layout" },
      el(
        "aside",
        { className: "sidebar" },
        el("p", { className: "brand", text: "deskOS" }),
        el("p", { className: "brand-note", text: "админка" }),
        nav,
        el("button", { type: "button", className: "logout", text: "Выйти", onClick: logout })
      ),
      el("main", { id: "content", className: "content" })
    )
  );
  if (!location.hash || location.hash === "#") {
    suppress = true;
    location.hash = "#/overview";
  }
  currentHash = location.hash;
  renderRoute();
}

function logout() {
  if (dirty && !window.confirm(LEAVE_TEXT)) return;
  dirty = false;
  clearToken();
  showLogin();
}

window.addEventListener("beforeunload", (event) => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

window.addEventListener("hashchange", () => {
  if (mode !== "app") return;
  if (suppress) {
    suppress = false;
    currentHash = location.hash;
    return;
  }
  if (dirty && !window.confirm(LEAVE_TEXT)) {
    suppress = true;
    location.hash = currentHash;
    return;
  }
  dirty = false;
  currentHash = location.hash;
  renderRoute();
});

setUnauthorizedHandler(() => {
  if (mode !== "app") return;
  dirty = false;
  showLogin("Неверный токен");
});

if (!getToken()) {
  showLogin();
} else {
  app.className = "app app-login";
  app.replaceChildren(loading("Проверяем вход…"));
  listSections()
    .then(() => showShell())
    .catch((err) => {
      if (isAbort(err)) return;
      if (!err || err.status === 401) clearToken();
      showLogin(loginFailure(err && err.status));
    });
}
