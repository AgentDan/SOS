import { useCallback, useEffect, useRef, useState } from "react";
import { isAbort, listSections, setUnauthorizedHandler } from "./api/admin-api.js";
import { loginFailure } from "./lib/messages.js";
import { NAV_LEGACY, NAV_MAIN, activeNavId, screenTitle } from "./lib/nav.js";
import { clearToken, getToken } from "./session/token.js";
import { confirmAction } from "./components/confirm.jsx";
import { Loading } from "./components/Loading.jsx";
import { AppFrame } from "./ui/AppFrame.jsx";
import { Shell } from "./ui/Shell.jsx";
import { Journal } from "./screens/Journal.jsx";
import { Knobs } from "./screens/Knobs.jsx";
import { Login } from "./screens/Login.jsx";
import { LinkMap } from "./screens/LinkMap.jsx";
import { Models } from "./screens/Models.jsx";
import { Overview } from "./screens/Overview.jsx";
import { SectionEditor } from "./screens/SectionEditor.jsx";
import { Sections } from "./screens/Sections.jsx";

const LEAVE_TEXT = "Есть несохранённые правки. Уйти без сохранения?";
const NAV = [
  ...NAV_MAIN.map((item) => ({ ...item, group: "main" })),
  ...NAV_LEGACY.map((item) => ({ ...item, group: "legacy" }))
];

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
  if (head === "models") return { screen: "models" };
  if (head === "map") return { screen: "map" };
  if (head === "journal") return { screen: "journal" };
  return { screen: "overview" };
}

function hrefFor(route) {
  if (route.screen === "section") return `#/sections/${encodeURIComponent(route.name)}`;
  if (route.screen === "sections") return "#/sections";
  if (route.screen === "knobs") return "#/knobs";
  if (route.screen === "models") return "#/models";
  if (route.screen === "map") return "#/map";
  if (route.screen === "journal") return "#/journal";
  return "#/overview";
}

function sameHash(hash, next) {
  return hash === next || ((hash === "" || hash === "#") && next === "#/overview");
}

function documentTitle(route) {
  return `Админка — ${screenTitle(route)}`;
}

function App() {
  const [mode, setMode] = useState(() => (getToken() ? "boot" : "login"));
  const [loginMessage, setLoginMessage] = useState("");
  const [route, setRoute] = useState(parseHash);
  const [visit, setVisit] = useState(0);
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
  else if (route.screen === "journal") screen = <Journal key={screenKey} />;

  return (
    <AppFrame>
      <Shell nav={NAV} activeId={activeNavId(route)} onGo={goNav} onLogout={logout} title={screenTitle(route)}>
        {screen}
      </Shell>
    </AppFrame>
  );
}

export { App };
