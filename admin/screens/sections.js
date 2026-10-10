import { isAbort, listSections } from "../api/admin-api.js";
import { problemLines } from "../lib/messages.js";
import { labelSections } from "../lib/sections.js";
import { el, errorBlock, loading, sectionTile } from "../ui.js";

function mountSections(root, { openSection }) {
  const controller = new AbortController();
  let alive = true;
  root.replaceChildren(loading());

  listSections({ signal: controller.signal })
    .then((list) => {
      if (!alive) return;
      const tiles = labelSections(list).map((item) => sectionTile(item, openSection));
      root.replaceChildren(
        el("h1", { text: "Разделы" }),
        el("p", { className: "muted", text: "Откройте раздел, чтобы править черновик, публиковать и откатывать." }),
        tiles.length > 0 ? el("div", { className: "tiles" }, tiles) : el("p", { className: "muted", text: "Разделов пока нет" })
      );
    })
    .catch((err) => {
      if (!alive || isAbort(err) || err.status === 401) return;
      root.replaceChildren(el("h1", { text: "Разделы" }), errorBlock(problemLines(err.status, err.body)));
    });

  return () => {
    alive = false;
    controller.abort();
  };
}

export { mountSections };
