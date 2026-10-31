import { dialogSectionName } from "./nav.js";

/* Разбор адреса админки. Хеш передаёт вызывающий код, к location функции не ходят. */

function catalogRoute(params) {
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

function parseHash(hash) {
  const source = typeof hash === "string" ? hash : "";
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
  if (head === "models") return catalogRoute(new URLSearchParams());
  if (head === "map") return { screen: "map" };
  if (head === "journal") return { screen: "journal" };
  if (head === "ergonomics") return { screen: "ergonomics" };
  if (head === "catalog") return catalogRoute(params);
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
  if (route.screen === "map") return "#/map";
  if (route.screen === "journal") return "#/journal";
  if (route.screen === "ergonomics") return "#/ergonomics";
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

export { hrefFor, parseHash, sameHash, staysOnQuestionnaire };
