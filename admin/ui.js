function el(tag, props, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null) continue;
    if (key === "className") node.className = value;
    else if (key === "text") node.textContent = String(value);
    else if (key === "hidden" || key === "disabled" || key === "checked") node[key] = Boolean(value);
    else if (key === "htmlFor") node.htmlFor = String(value);
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    if (typeof child === "string" || typeof child === "number") node.append(document.createTextNode(String(child)));
    else node.append(child);
  }
  return node;
}

function fillBanner(node, kind, text) {
  const word = kind === "ok" ? "Готово" : kind === "warn" ? "Внимание" : "Ошибка";
  node.className = `banner banner-${kind === "ok" ? "ok" : kind === "warn" ? "warn" : "error"}`;
  node.hidden = false;
  node.replaceChildren(
    el("span", { className: "banner-word", text: word }),
    el("span", { className: "banner-text", text })
  );
}

function banner(kind, text) {
  const node = el("div", { role: kind === "error" ? "alert" : "status" });
  fillBanner(node, kind, text);
  return node;
}

function errorBlock(lines) {
  const list = el("ul", { className: "error-lines" });
  for (const line of lines) list.append(el("li", { text: line }));
  return el("div", { className: "banner banner-error", role: "alert" }, el("span", { className: "banner-word", text: "Ошибка" }), list);
}

function sectionTile(item, onOpen) {
  const published = typeof item.publishedVersion === "number" ? item.publishedVersion : "нет";
  const draft = typeof item.draftVersion === "number" ? item.draftVersion : "нет";
  return el(
    "button",
    { type: "button", className: "tile", onClick: () => onOpen(item.name) },
    el("span", { className: "tile-title", text: item.label }),
    el("span", { className: "tile-meta", text: `Опубликовано: версия ${published}` }),
    el("span", { className: "tile-meta", text: `Черновик: версия ${draft}` }),
    item.hasUnpublishedChanges
      ? el("span", { className: "flag flag-warn", text: "Есть неопубликованные правки" })
      : null
  );
}

function loading(text = "Загрузка…") {
  return el("p", { className: "loading", text });
}

export { el, banner, fillBanner, errorBlock, sectionTile, loading };
