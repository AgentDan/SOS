import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSection, isAbort, listSections, onWrite, setUnauthorizedHandler } from "./api/admin-api.js";
import { loginFailure } from "./lib/messages.js";
import { NAV_LEGACY, NAV_MAIN, activeNavId, dialogSectionName, screenTitle } from "./lib/nav.js";
import { buildSearchIndex, kindTitle, searchIndex } from "./lib/search.js";
import { sectionCountText, unpublished } from "./lib/versions.js";
import { clearToken, getToken } from "./session/token.js";
import { confirmAction } from "./components/confirm.jsx";
import { Loading } from "./components/Loading.jsx";
import { AppFrame } from "./ui/AppFrame.jsx";
import { Btn } from "./ui/Btn.jsx";
import { Pill } from "./ui/Pill.jsx";
import { SearchPalette } from "./ui/SearchPalette.jsx";
import { Shell } from "./ui/Shell.jsx";
import { Catalog } from "./screens/Catalog.jsx";
import { Dialog } from "./screens/Dialog.jsx";
import { Home } from "./screens/Home.jsx";
import { Knobs } from "./screens/Knobs.jsx";
import { Login } from "./screens/Login.jsx";
import { LinkMap } from "./screens/LinkMap.jsx";
import { Models } from "./screens/Models.jsx";
import { Questionnaire } from "./screens/Questionnaire.jsx";
import { SectionEditor } from "./screens/SectionEditor.jsx";
import { Sections } from "./screens/Sections.jsx";
import { Versions } from "./screens/Versions.jsx";

const LEAVE_TEXT = "Есть несохранённые правки. Уйти без сохранения?";
const NAV = [
  ...NAV_MAIN.map((item) => ({ ...item, group: "main" })),
  ...NAV_LEGACY.map((item) => ({ ...item, group: "legacy" }))
];

function parseHash(hash) {
  const source = typeof hash === "string" ? hash : location.hash;
  const raw = source.replace(/^#\/?/, "");
  const cut = raw.indexOf("?");
  const path = cut >= 0 ? raw.slice(0, cut) : raw;
  const params = new URLSearchParams(cut >= 0 ? raw.slice(cut + 1) : "");
  const [head, ...rest] = path.split("/");
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
  if (head === "models") return { screen: "models" };
  if (head === "map") return { screen: "map" };
  if (head === "journal") return { screen: "journal" };
  if (head === "catalog") {
    const tab = params.get("tab");
    const create = params.get("create") === "1";
    const named = tab === "types" || tab === "needs" ? tab : "products";
    const item = named === "products" ? "" : params.get("item") || "";
    return {
      screen: "catalog",
      tab: named,
      sku: create ? "" : params.get("sku") || "",
      create,
      item
    };
  }
  if (head === "dialog") {
    let decoded = rest[0] || "";
    try {
      decoded = decoded ? decodeURIComponent(decoded) : "";
    } catch {
      decoded = rest[0] || "";
    }
    return { screen: "dialog", name: dialogSectionName(decoded) };
  }
  if (head === "questionnaire") {
    const tab = params.get("tab");
    const route = { screen: "questionnaire", q: params.get("q") || "" };
    if (tab === "scenarios" || tab === "phases") route.tab = tab;
    return route;
  }
  return { screen: "overview" };
}

function hrefFor(route) {
  if (!route || typeof route !== "object") return "#/overview";
  if (route.screen === "section") return `#/sections/${encodeURIComponent(route.name)}`;
  if (route.screen === "sections") return "#/sections";
  if (route.screen === "knobs") return "#/knobs";
  if (route.screen === "models") return "#/models";
  if (route.screen === "map") return "#/map";
  if (route.screen === "journal") return "#/journal";
  if (route.screen === "dialog") return `#/dialog/${encodeURIComponent(dialogSectionName(route.name))}`;
  if (route.screen === "catalog") {
    const params = new URLSearchParams();
    if (route.tab === "types" || route.tab === "needs") params.set("tab", route.tab);
    if ((route.tab === "types" || route.tab === "needs") && typeof route.item === "string" && route.item.length > 0) {
      params.set("item", route.item);
    }
    if (route.create) params.set("create", "1");
    else if (route.sku) params.set("sku", route.sku);
    const query = params.toString();
    return query ? `#/catalog?${query}` : "#/catalog";
  }
  if (route.screen === "questionnaire") {
    const params = new URLSearchParams();
    if (route.q) params.set("q", route.q);
    if (route.tab === "scenarios" || route.tab === "phases") params.set("tab", route.tab);
    const query = params.toString();
    return query ? `#/questionnaire?${query}` : "#/questionnaire";
  }
  return "#/overview";
}

function staysOnQuestionnaire(prevHash, nextHash) {
  return parseHash(prevHash).screen === "questionnaire" && parseHash(nextHash).screen === "questionnaire";
}

function sameHash(hash, next) {
  return hash === next || ((hash === "" || hash === "#") && next === "#/overview");
}

function documentTitle(route) {
  return `Админка — ${screenTitle(route)}`;
}

function PublishStatus({ list, onOpen }) {
  const pending = Array.isArray(list) ? unpublished(list) : null;
  return (
    <>
      {pending == null ? null : pending.length === 0 ? (
        <Pill tone="ok">Всё опубликовано</Pill>
      ) : (
        <Pill tone="warn">
          <span title={pending.map((item) => item.label).join(", ")}>
            {`Не опубликовано: ${sectionCountText(pending.length)}`}
          </span>
        </Pill>
      )}
      <Btn kind="primary" className="whitespace-nowrap" onClick={onOpen}>
        Проверить и опубликовать
      </Btn>
    </>
  );
}

function SearchButton({ open = false, onClick }) {
  return (
    <button
      type="button"
      className="flex h-9 w-full max-w-md cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface px-3 text-left text-sm text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent narrow:w-9 narrow:justify-center narrow:px-0"
      aria-label="Найти товар, вопрос, потребность"
      aria-haspopup="dialog"
      aria-keyshortcuts="Control+K"
      aria-expanded={open}
      onClick={onClick}
    >
      <svg className="hidden h-4 w-4 narrow:block" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M16 16l4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="min-w-0 flex-1 truncate narrow:hidden">Найти товар, вопрос, потребность…</span>
      <kbd className="rounded-md border border-line bg-side px-1.5 py-0.5 text-xs text-muted narrow:hidden">Ctrl K</kbd>
    </button>
  );
}

function App() {
  const [mode, setMode] = useState(() => (getToken() ? "boot" : "login"));
  const [loginMessage, setLoginMessage] = useState("");
  const [route, setRoute] = useState(parseHash);
  const [visit, setVisit] = useState(0);
  const [sectionList, setSectionList] = useState(null);
  const [writeTick, setWriteTick] = useState(0);
  const [wakeTick, setWakeTick] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchState, setSearchState] = useState({ status: "idle", index: null, error: false });
  const dirtyRef = useRef(false);
  const searchCacheRef = useRef({ fresh: false, index: null });
  const searchGenRef = useRef(0);
  const searchAbortRef = useRef(null);
  const modeRef = useRef(mode);
  const hashRef = useRef(location.hash);
  const suppressRef = useRef(false);

  const markDirty = useCallback((value) => {
    dirtyRef.current = value;
  }, []);

  const ensureSearch = useCallback((force) => {
    if (!force && searchCacheRef.current.fresh && searchCacheRef.current.index) {
      setSearchState({ status: "ready", index: searchCacheRef.current.index, error: false });
      return;
    }
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    const gen = searchGenRef.current;
    setSearchState((prev) => ({
      status: "loading",
      index: (prev && prev.index) || searchCacheRef.current.index || buildSearchIndex({}),
      error: false
    }));
    Promise.all([
      getSection("questionnaire", { signal: controller.signal }),
      getSection("catalog", { signal: controller.signal })
    ]).then(
      ([questionnaire, catalog]) => {
        if (controller.signal.aborted) return;
        const index = buildSearchIndex({
          questionnaire: questionnaire && questionnaire.draft,
          catalog: catalog && catalog.draft
        });
        searchCacheRef.current = { fresh: searchGenRef.current === gen, index };
        setSearchState({ status: "ready", index, error: false });
      },
      (err) => {
        if (controller.signal.aborted || isAbort(err) || (err && err.status === 401)) return;
        const index = buildSearchIndex({});
        searchCacheRef.current = { fresh: false, index };
        setSearchState({ status: "error", index, error: true });
      }
    );
  }, []);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (modeRef.current !== "app") return;
      dirtyRef.current = false;
      setLoginMessage("Неверный токен");
      setMode("login");
    });
    return () => setUnauthorizedHandler(() => {});
  }, []);

  useEffect(() => {
    function onBeforeUnload(event) {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }
    function onHashChange() {
      if (modeRef.current !== "app") return;
      if (suppressRef.current) {
        suppressRef.current = false;
        hashRef.current = location.hash;
        return;
      }
      const stay = staysOnQuestionnaire(hashRef.current, location.hash);
      if (!stay && dirtyRef.current && !confirmAction(LEAVE_TEXT)) {
        suppressRef.current = true;
        location.hash = hashRef.current;
        return;
      }
      if (!stay) dirtyRef.current = false;
      const next = parseHash();
      hashRef.current = location.hash;
      setRoute(next);
      const canonical = hrefFor(next);
      if (next.screen === "dialog" && location.hash !== canonical) {
        suppressRef.current = true;
        hashRef.current = canonical;
        location.hash = canonical;
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  useEffect(() => {
    if (!getToken()) return undefined;
    const controller = new AbortController();
    let alive = true;
    listSections({ signal: controller.signal })
      .then(() => {
        if (alive) setMode("app");
      })
      .catch((err) => {
        if (!alive || isAbort(err)) return;
        if (!err || err.status === 401) clearToken();
        setLoginMessage(loginFailure(err && err.status));
        setMode("login");
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (mode === "login") {
      document.title = "Админка SOS";
      return;
    }
    if (mode !== "app") return;
    if (!location.hash || location.hash === "#") {
      suppressRef.current = true;
      location.hash = "#/overview";
    }
    hashRef.current = location.hash;
    const next = parseHash();
    setRoute(next);
    const canonical = hrefFor(next);
    if (next.screen === "dialog" && location.hash !== canonical) {
      suppressRef.current = true;
      hashRef.current = canonical;
      location.hash = canonical;
    }
    document.title = documentTitle(next);
  }, [mode]);

  useEffect(() => {
    if (mode === "app") document.title = documentTitle(route);
  }, [mode, route]);

  useEffect(() => {
    if (mode !== "app") return undefined;
    return onWrite(() => {
      searchGenRef.current += 1;
      searchCacheRef.current.fresh = false;
      setWriteTick((value) => value + 1);
    });
  }, [mode]);

  useEffect(() => {
    if (mode !== "app") return undefined;
    function onWake() {
      if (document.visibilityState === "hidden") return;
      setWakeTick((value) => value + 1);
    }
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== "app") return undefined;
    const controller = new AbortController();
    let alive = true;
    listSections({ signal: controller.signal }).then(
      (value) => {
        if (!alive) return;
        setSectionList(Array.isArray(value) ? value : []);
      },
      (err) => {
        if (!alive || isAbort(err)) return;
      }
    );
    return () => {
      alive = false;
      controller.abort();
    };
  }, [mode, route, writeTick, wakeTick]);

  useEffect(() => {
    if (mode !== "app") setSearchOpen(false);
  }, [mode]);

  useEffect(() => {
    if (!searchOpen) return undefined;
    ensureSearch(false);
  }, [searchOpen, ensureSearch]);

  useEffect(() => {
    if (mode !== "app") return undefined;
    function onKey(event) {
      if (event.altKey || event.shiftKey || event.repeat) return;
      if (!event.ctrlKey && !event.metaKey) return;
      const key = typeof event.key === "string" ? event.key.toLowerCase() : "";
      if (key !== "k" && key !== "л" && event.code !== "KeyK") return;
      event.preventDefault();
      setSearchQuery("");
      setSearchOpen((open) => !open);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);

  useEffect(() => () => searchAbortRef.current?.abort(), []);

  const searchGroups = useMemo(() => {
    const index = searchState.index || buildSearchIndex({});
    if (searchQuery.trim().length === 0) {
      const screens = index.filter((item) => item && item.kind === "screen");
      if (screens.length === 0) return [];
      return [{ kind: "screen", title: kindTitle("screen"), items: screens }];
    }
    return searchIndex(index, searchQuery);
  }, [searchState.index, searchQuery]);

  function requestGo(nextRoute) {
    const next = hrefFor(nextRoute);
    const stay = staysOnQuestionnaire(location.hash, next);
    if (!stay && dirtyRef.current && !confirmAction(LEAVE_TEXT)) return false;
    if (!stay) dirtyRef.current = false;
    if (sameHash(location.hash, next)) {
      if (stay) return true;
      setRoute(parseHash());
      setVisit((value) => value + 1);
      return true;
    }
    location.hash = next;
    return true;
  }

  function logout() {
    if (dirtyRef.current && !confirmAction(LEAVE_TEXT)) return;
    dirtyRef.current = false;
    clearToken();
    setLoginMessage("");
    setMode("login");
  }

  function openSection(sectionName) {
    requestGo({ screen: "section", name: sectionName });
  }

  function goNav(id) {
    const item = NAV.find((entry) => entry.id === id);
    if (item) requestGo(item.route);
  }

  if (mode === "boot") {
    return (
      <AppFrame>
        <Loading text="Проверяем вход…" />
      </AppFrame>
    );
  }

  if (mode === "login") {
    return (
      <AppFrame>
        <Login
          message={loginMessage}
          onSuccess={() => {
            setLoginMessage("");
            setMode("app");
          }}
        />
      </AppFrame>
    );
  }

  const screenKey = `${route.screen}:${route.name || ""}:${visit}`;
  let screen = <Home key={screenKey} requestGo={requestGo} />;
  if (route.screen === "section") screen = <SectionEditor key={screenKey} name={route.name} onDirty={markDirty} />;
  else if (route.screen === "sections") screen = <Sections key={screenKey} openSection={openSection} />;
  else if (route.screen === "knobs") screen = <Knobs key={screenKey} openSection={openSection} />;
  else if (route.screen === "models") screen = <Models key={screenKey} onDirty={markDirty} />;
  else if (route.screen === "map") screen = <LinkMap key={screenKey} openSection={openSection} />;
  else if (route.screen === "journal") screen = <Versions key={screenKey} />;
  else if (route.screen === "catalog") {
    screen = <Catalog key={screenKey} route={route} onDirty={markDirty} requestGo={requestGo} />;
  } else if (route.screen === "dialog") {
    screen = <Dialog key={screenKey} name={route.name} onDirty={markDirty} />;
  } else if (route.screen === "questionnaire") {
    screen = <Questionnaire key={screenKey} route={route} onDirty={markDirty} />;
  }

  return (
    <AppFrame>
      <Shell
        nav={NAV}
        activeId={activeNavId(route)}
        onGo={goNav}
        onLogout={logout}
        title={screenTitle(route)}
        search={
          <SearchButton
            open={searchOpen}
            onClick={() => {
              setSearchQuery("");
              setSearchOpen(true);
            }}
          />
        }
        topRight={
          <PublishStatus
            list={sectionList}
            onOpen={() => {
              if (route.screen === "journal") return;
              requestGo({ screen: "journal" });
            }}
          />
        }
      >
        {screen}
      </Shell>
      {searchOpen ? (
        <SearchPalette
          query={searchQuery}
          onQuery={setSearchQuery}
          groups={searchGroups}
          loading={searchState.status === "loading"}
          error={searchState.error}
          onRetry={() => ensureSearch(true)}
          onClose={() => setSearchOpen(false)}
          onPick={(entry) => {
            if (!entry || !entry.route) return;
            if (requestGo(entry.route) === false) return;
            setSearchOpen(false);
          }}
        />
      ) : null}
    </AppFrame>
  );
}

export { App };
