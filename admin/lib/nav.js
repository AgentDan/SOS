import { sectionLabel } from "./sections.js";

const NAV_MAIN = [
  { id: "home", text: "Главная", route: { screen: "overview" } },
  { id: "catalog", text: "Каталог", route: { screen: "catalog" } },
  { id: "questionnaire", text: "Анкета", route: { screen: "questionnaire" } },
  { id: "dialog", text: "Диалог", route: { screen: "dialog", name: "consultant" } },
  { id: "ergonomics", text: "Эргономика", route: { screen: "ergonomics" } },
  { id: "map", text: "Карта связей", route: { screen: "map" } },
  { id: "journal", text: "Версии и журнал", route: { screen: "journal" } }
];

const NAV_MORE = [
  { id: "knobs", text: "Ручки продукта", route: { screen: "knobs" } },
  { id: "sections", text: "Разделы (JSON)", route: { screen: "sections" } }
];

const SCREEN_TITLES = {
  overview: "Главная",
  sections: "Разделы (JSON)",
  knobs: "Ручки продукта",
  map: "Карта связей",
  journal: "Версии и журнал",
  catalog: "Каталог",
  dialog: "Диалог",
  questionnaire: "Анкета",
  ergonomics: "Эргономика"
};

const DIALOG_SECTIONS = ["consultant", "director", "sales", "commands", "ai-rules"];

function dialogSectionName(name) {
  return DIALOG_SECTIONS.includes(name) ? name : "consultant";
}

function activeNavId(route) {
  if (!route || typeof route !== "object") return "sections";
  if (route.screen === "questionnaire") return "questionnaire";
  if (route.screen === "dialog") return "dialog";
  if (route.screen === "ergonomics") return "ergonomics";
  if (route.screen === "section") {
    if (route.name === "catalog" || route.name === "questionnaire" || route.name === "ergonomics") {
      return route.name;
    }
    if (DIALOG_SECTIONS.includes(route.name)) return "dialog";
    return "sections";
  }
  if (route.screen === "overview") return "home";
  if (route.screen === "catalog") return "catalog";
  if (route.screen === "map" || route.screen === "journal" || route.screen === "knobs" || route.screen === "sections") {
    return route.screen;
  }
  return "sections";
}

function screenTitle(route) {
  if (!route || typeof route !== "object") return "Главная";
  if (route.screen === "section") return sectionLabel(route.name);
  return SCREEN_TITLES[route.screen] || "Главная";
}

export { DIALOG_SECTIONS, NAV_MAIN, NAV_MORE, activeNavId, dialogSectionName, screenTitle };
