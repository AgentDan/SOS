import { sectionLabel } from "./sections.js";

const NAV_MAIN = [
  { id: "home", text: "Главная", route: { screen: "overview" } },
  { id: "catalog", text: "Каталог", route: { screen: "catalog" } },
  { id: "questionnaire", text: "Анкета", route: { screen: "section", name: "questionnaire" } },
  { id: "dialog", text: "Диалог", route: { screen: "section", name: "consultant" } },
  { id: "ergonomics", text: "Эргономика", route: { screen: "section", name: "ergonomics" } },
  { id: "map", text: "Карта связей", route: { screen: "map" } },
  { id: "journal", text: "Версии и журнал", route: { screen: "journal" } }
];

const NAV_LEGACY = [
  { id: "sections", text: "Разделы", route: { screen: "sections" } },
  { id: "knobs", text: "Ручки", route: { screen: "knobs" } },
  { id: "models", text: "Модели", route: { screen: "models" } }
];

const SCREEN_TITLES = {
  overview: "Главная",
  sections: "Разделы",
  knobs: "Ручки",
  models: "Модели",
  map: "Карта связей",
  journal: "Версии и журнал",
  catalog: "Каталог"
};

const DIALOG_SECTIONS = new Set(["consultant", "director", "sales", "commands", "ai-rules"]);

function activeNavId(route) {
  if (!route || typeof route !== "object") return "sections";
  if (route.screen === "section") {
    if (route.name === "catalog" || route.name === "questionnaire" || route.name === "ergonomics") {
      return route.name;
    }
    if (DIALOG_SECTIONS.has(route.name)) return "dialog";
    return "sections";
  }
  if (route.screen === "overview") return "home";
  if (route.screen === "catalog") return "catalog";
  if (
    route.screen === "map" ||
    route.screen === "journal" ||
    route.screen === "knobs" ||
    route.screen === "models" ||
    route.screen === "sections"
  ) {
    return route.screen;
  }
  return "sections";
}

function screenTitle(route) {
  if (!route || typeof route !== "object") return "Главная";
  if (route.screen === "section") return sectionLabel(route.name);
  return SCREEN_TITLES[route.screen] || "Главная";
}

export { NAV_MAIN, NAV_LEGACY, activeNavId, screenTitle };
