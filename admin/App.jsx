import { useCallback, useEffect, useRef, useState } from "react";
import { isAbort, listSections, setUnauthorizedHandler } from "./api/admin-api.js";
import { loginFailure } from "./lib/messages.js";
import { sectionLabel } from "./lib/sections.js";
import { clearToken, getToken } from "./session/token.js";
import { confirmAction } from "./components/confirm.jsx";
import { Loading } from "./components/Loading.jsx";
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
  ["overview", "Обзор"],
  ["sections", "Разделы"],
  ["knobs", "Ручки"],
  ["models", "Модели"],
  ["map", "Карта связей"],
  ["journal", "Журнал"]
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

function titleFor(route) {
  if (route.screen === "section") return `Админка — ${sectionLabel(route.name)}`;
  const names = {
    overview: "Обзор",
    sections: "Разделы",
    knobs: "Ручки",
    models: "Модели",
    map: "Карта связей",
    journal: "Журнал"
  };
  return `Админка — ${names[route.screen] || "Обзор"}`;
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
    document.title = titleFor(next);
  }, [mode]);

  useEffect(() => {
    if (mode === "app") document.title = titleFor(route);
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

  if (mode === "boot") {
    return (
      <div className="box-border min-h-screen bg-[#f3f0e8] [color-scheme:light] text-[16px] leading-[1.45] text-[#1e1b16] font-[system-ui,sans-serif] dark:bg-[#14171c] dark:text-[#f3efe6] dark:[color-scheme:dark] [&_*]:box-border">
        <Loading text="Проверяем вход…" />
      </div>
    );
  }

  if (mode === "login") {
    return (
      <div className="box-border min-h-screen bg-[#f3f0e8] [color-scheme:light] text-[16px] leading-[1.45] text-[#1e1b16] font-[system-ui,sans-serif] dark:bg-[#14171c] dark:text-[#f3efe6] dark:[color-scheme:dark] [&_*]:box-border">
        <Login
          message={loginMessage}
          onSuccess={() => {
            setLoginMessage("");
            setMode("app");
          }}
        />
      </div>
    );
  }

  const active = route.screen === "section" ? "sections" : route.screen;
  const screenKey = `${route.screen}:${route.name || ""}:${visit}`;
  let screen = <Overview key={screenKey} openSection={openSection} />;
  if (route.screen === "section") screen = <SectionEditor key={screenKey} name={route.name} onDirty={markDirty} />;
  else if (route.screen === "sections") screen = <Sections key={screenKey} openSection={openSection} />;
  else if (route.screen === "knobs") screen = <Knobs key={screenKey} openSection={openSection} />;
  else if (route.screen === "models") screen = <Models key={screenKey} onDirty={markDirty} />;
  else if (route.screen === "map") screen = <LinkMap key={screenKey} openSection={openSection} />;
  else if (route.screen === "journal") screen = <Journal key={screenKey} />;

  return (
    <div className="box-border min-h-screen bg-[#f3f0e8] [color-scheme:light] text-[16px] leading-[1.45] text-[#1e1b16] font-[system-ui,sans-serif] dark:bg-[#14171c] dark:text-[#f3efe6] dark:[color-scheme:dark] [&_*]:box-border">
      <div className="grid min-h-screen grid-cols-[220px_minmax(0,1fr)] max-[800px]:grid-cols-1">
        <aside className="sticky top-0 z-[2] flex min-h-screen flex-col gap-2 self-start border-r border-[#ddd4c6] dark:border-[#343b46] bg-[#e7e1d6] dark:bg-[#191d24] px-4 py-5 max-[800px]:min-h-0 max-[800px]:flex-row max-[800px]:flex-wrap max-[800px]:items-center max-[800px]:border-r-0 max-[800px]:border-b">
          <p className="mt-0 mb-0 text-xl font-bold">deskOS</p>
          <p className="mt-0 mb-3 text-[#5e584e] dark:text-[#b7b0a4] max-[800px]:hidden">админка</p>
          <nav className="flex flex-col gap-1 max-[800px]:flex-row max-[800px]:flex-wrap">
            {NAV.map(([screenName, text]) => {
              const on = screenName === active;
              return (
                <button
                  key={screenName}
                  type="button"
                  data-screen={screenName}
                  className={
                    on
                      ? "cursor-pointer rounded-lg border border-[#ddd4c6] dark:border-[#343b46] bg-[#fffdf8] dark:bg-[#1e232b] px-3 py-2 text-left font-[650] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f6b4a] dark:focus-visible:outline-[#3d9a6e]"
                      : "cursor-pointer rounded-lg border border-transparent bg-transparent px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f6b4a] dark:focus-visible:outline-[#3d9a6e]"
                  }
                  aria-current={on ? "page" : undefined}
                  onClick={() => requestGo({ screen: screenName })}
                >
                  {text}
                </button>
              );
            })}
          </nav>
          <button
            type="button"
            className="mt-auto cursor-pointer rounded-lg border border-[#ddd4c6] dark:border-[#343b46] bg-[#fffdf8] dark:bg-[#1e232b] px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f6b4a] dark:focus-visible:outline-[#3d9a6e] max-[800px]:mt-0 max-[800px]:ml-auto"
            onClick={logout}
          >
            Выйти
          </button>
        </aside>
        <main id="content" className="min-w-0 px-8 pt-7 pb-12 max-[900px]:px-4 max-[900px]:pt-5 max-[900px]:pb-10">
          {screen}
        </main>
      </div>
    </div>
  );
}

export { App };
