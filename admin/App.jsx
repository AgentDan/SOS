import { useCallback, useEffect, useRef, useState } from "react";
import { isAbort, listSections, onWrite, setUnauthorizedHandler } from "./api/admin-api.js";
import { loginFailure } from "./lib/messages.js";
import { NAV_LEGACY, NAV_MAIN, activeNavId, screenTitle } from "./lib/nav.js";
import { sectionCountText, unpublished } from "./lib/versions.js";
import { clearToken, getToken } from "./session/token.js";
import { confirmAction } from "./components/confirm.jsx";
import { Loading } from "./components/Loading.jsx";
import { AppFrame } from "./ui/AppFrame.jsx";
import { Btn } from "./ui/Btn.jsx";
import { Pill } from "./ui/Pill.jsx";
import { Shell } from "./ui/Shell.jsx";
import { Catalog } from "./screens/Catalog.jsx";
import { Knobs } from "./screens/Knobs.jsx";
import { Login } from "./screens/Login.jsx";
import { LinkMap } from "./screens/LinkMap.jsx";
import { Models } from "./screens/Models.jsx";
import { Overview } from "./screens/Overview.jsx";
import { SectionEditor } from "./screens/SectionEditor.jsx";
import { Sections } from "./screens/Sections.jsx";
import { Versions } from "./screens/Versions.jsx";

const LEAVE_TEXT = "Есть несохранённые правки. Уйти без сохранения?";
const NAV = [
  ...NAV_MAIN.map((item) => ({ ...item, group: "main" })),
  ...NAV_LEGACY.map((item) => ({ ...item, group: "legacy" }))
];

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
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
    return {
      screen: "catalog",
      tab: tab === "types" || tab === "needs" ? tab : "products",
      sku: create ? "" : params.get("sku") || "",
      create
    };
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
  if (route.screen === "catalog") {
    const params = new URLSearchParams();
    if (route.tab === "types" || route.tab === "needs") params.set("tab", route.tab);
    if (route.create) params.set("create", "1");
    else if (route.sku) params.set("sku", route.sku);
    const query = params.toString();
    return query ? `#/catalog?${query}` : "#/catalog";
  }
  return "#/overview";
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

function App() {
  const [mode, setMode] = useState(() => (getToken() ? "boot" : "login"));
  const [loginMessage, setLoginMessage] = useState("");
  const [route, setRoute] = useState(parseHash);
  const [visit, setVisit] = useState(0);
  const [sectionList, setSectionList] = useState(null);
  const [writeTick, setWriteTick] = useState(0);
  const [wakeTick, setWakeTick] = useState(0);
  const dirtyRef = useRef(false);
  const modeRef = useRef(mode);
  const hashRef = useRef(location.hash);
  const suppressRef = useRef(false);

  const markDirty = useCallback((value) => {
    dirtyRef.current = value;
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
      if (dirtyRef.current && !confirmAction(LEAVE_TEXT)) {
        suppressRef.current = true;
        location.hash = hashRef.current;
        return;
      }
      dirtyRef.current = false;
      hashRef.current = location.hash;
      setRoute(parseHash());
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
    document.title = documentTitle(next);
  }, [mode]);

  useEffect(() => {
    if (mode === "app") document.title = documentTitle(route);
  }, [mode, route]);

  useEffect(() => {
    if (mode !== "app") return undefined;
    return onWrite(() => setWriteTick((value) => value + 1));
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

  function requestGo(nextRoute) {
    const next = hrefFor(nextRoute);
    if (dirtyRef.current && !confirmAction(LEAVE_TEXT)) return;
    dirtyRef.current = false;
    if (sameHash(location.hash, next)) {
      setRoute(parseHash());
      setVisit((value) => value + 1);
      return;
    }
    location.hash = next;
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
  let screen = <Overview key={screenKey} openSection={openSection} />;
  if (route.screen === "section") screen = <SectionEditor key={screenKey} name={route.name} onDirty={markDirty} />;
  else if (route.screen === "sections") screen = <Sections key={screenKey} openSection={openSection} />;
  else if (route.screen === "knobs") screen = <Knobs key={screenKey} openSection={openSection} />;
  else if (route.screen === "models") screen = <Models key={screenKey} onDirty={markDirty} />;
  else if (route.screen === "map") screen = <LinkMap key={screenKey} openSection={openSection} />;
  else if (route.screen === "journal") screen = <Versions key={screenKey} />;
  else if (route.screen === "catalog") {
    screen = <Catalog key={screenKey} route={route} onDirty={markDirty} requestGo={requestGo} />;
  }

  return (
    <AppFrame>
      <Shell
        nav={NAV}
        activeId={activeNavId(route)}
        onGo={goNav}
        onLogout={logout}
        title={screenTitle(route)}
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
    </AppFrame>
  );
}

export { App };
