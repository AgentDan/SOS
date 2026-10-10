import { isAbort, listKnobs, updateKnob } from "../api/admin-api.js";
import {
  boundsText,
  checkKnobValue,
  describeKnobValues,
  groupKnobsByLayer,
  knobTitle,
  readEnumValue
} from "../lib/knobs.js";
import { problemLines } from "../lib/messages.js";
import { sectionLabel } from "../lib/sections.js";
import { banner, el, errorBlock, loading } from "../ui.js";

function readControl(knob, control) {
  if (knob.type === "boolean") return control.checked;
  if (knob.type === "number") {
    if (control.value.trim() === "") return undefined;
    const numeric = Number(control.value);
    return Number.isFinite(numeric) ? numeric : undefined;
  }
  if (knob.type === "enum") return readEnumValue(knob, control.value);
  return control.value;
}

function controlFor(knob, value) {
  if (knob.type === "boolean") {
    const input = el("input", { type: "checkbox" });
    input.checked = value === true;
    const caption = el("span", { text: input.checked ? "Включено" : "Выключено" });
    input.addEventListener("change", () => {
      caption.textContent = input.checked ? "Включено" : "Выключено";
    });
    return el("label", { className: "switch" }, input, caption);
  }
  if (knob.type === "enum") {
    const select = el("select");
    const options = Array.isArray(knob.options) ? knob.options : [];
    if (value != null && !options.some((option) => option === value || String(option) === String(value))) {
      select.append(el("option", { value: String(value), text: String(value) }));
    }
    for (const option of options) {
      const item = el("option", { value: String(option), text: String(option) });
      if (option === value || String(option) === String(value)) item.selected = true;
      select.append(item);
    }
    return select;
  }
  if (knob.type === "number") {
    const input = el("input", { type: "number", step: "any" });
    if (typeof knob.min === "number") input.min = String(knob.min);
    if (typeof knob.max === "number") input.max = String(knob.max);
    if (typeof value === "number" && Number.isFinite(value)) input.value = String(value);
    return input;
  }
  const input = el("input", { type: "text", autocomplete: "off" });
  if (typeof value === "string") input.value = value;
  return input;
}

function valueControl(knob, node) {
  if (knob.type === "boolean") return node.querySelector("input");
  return node;
}

function mountKnobs(root, { openSection }) {
  const controller = new AbortController();
  let alive = true;
  let working = false;

  function setWorking(on) {
    working = on;
    for (const button of root.querySelectorAll("button.apply")) button.disabled = on;
  }

  function apply(knob, row, control, slot) {
    return async () => {
      if (working) return;
      const value = readControl(knob, control);
      const localErrors = checkKnobValue(knob, value);
      if (localErrors.length > 0) {
        slot.replaceChildren(errorBlock(localErrors));
        return;
      }
      setWorking(true);
      slot.replaceChildren(loading("Записываем…"));
      try {
        await updateKnob(knob.id, row.at, value, { signal: controller.signal });
        if (!alive) return;
        slot.replaceChildren(
          banner("ok", "Записано в черновик, клиент увидит после публикации раздела"),
          el("button", {
            type: "button",
            className: "linkish",
            text: "Опубликовать раздел",
            onClick: () => openSection(knob.section)
          })
        );
      } catch (err) {
        if (!alive || isAbort(err) || err.status === 401) return;
        slot.replaceChildren(errorBlock(problemLines(err.status, err.body)));
      } finally {
        if (alive) setWorking(false);
      }
    };
  }

  function rowEditor(knob, row, { hideKey = false } = {}) {
    const slot = el("div", { className: "status" });
    if (!row.applicable) {
      return el(
        "div",
        { className: "knob-row" },
        hideKey ? null : el("span", { className: "knob-key", text: row.label }),
        banner("warn", "В данных нет места, куда записать значение")
      );
    }
    const field = controlFor(knob, row.value);
    const button = el("button", {
      type: "button",
      className: "apply",
      text: "Применить",
      onClick: apply(knob, row, valueControl(knob, field), slot)
    });
    return el(
      "div",
      { className: hideKey ? "knob-row knob-row-single" : "knob-row" },
      hideKey ? null : el("span", { className: "knob-key", text: row.label }),
      field,
      button,
      slot
    );
  }

  function card(knob) {
    const described = describeKnobValues(knob);
    const bounds = boundsText(knob);
    const body = [
      el("h3", { text: knobTitle(knob) }),
      knob && knob.description ? el("p", { text: String(knob.description) }) : null,
      bounds ? el("p", { className: "muted", text: `Границы: ${bounds}` }) : null,
      el("p", { className: "muted", text: `Раздел: ${sectionLabel(knob && knob.section)}` })
    ];
    if (described.broken) {
      body.push(banner("warn", "В данных нет значения для этой ручки"));
    } else if (described.multiple) {
      body.push(el("div", { className: "knob-table" }, described.rows.map((row) => rowEditor(knob, row))));
    } else {
      body.push(rowEditor(knob, described.rows[0], { hideKey: true }));
    }
    return el("article", { className: "knob" }, body);
  }

  root.replaceChildren(loading());
  listKnobs({ signal: controller.signal })
    .then((list) => {
      if (!alive) return;
      const groups = groupKnobsByLayer(Array.isArray(list) ? list : []);
      const blocks = groups.map((group) =>
        el("section", null, el("h2", { text: group.title }), ...group.knobs.map((knob) => card(knob)))
      );
      root.replaceChildren(
        el("h1", { text: "Ручки" }),
        el("p", {
          className: "muted",
          text: "Значение попадает в черновик раздела. Клиент увидит его только после публикации."
        }),
        ...(blocks.length > 0 ? blocks : [el("p", { className: "muted", text: "Ручек пока нет" })])
      );
    })
    .catch((err) => {
      if (!alive || isAbort(err) || err.status === 401) return;
      root.replaceChildren(el("h1", { text: "Ручки" }), errorBlock(problemLines(err.status, err.body)));
    });

  return () => {
    alive = false;
    controller.abort();
  };
}

export { mountKnobs };
