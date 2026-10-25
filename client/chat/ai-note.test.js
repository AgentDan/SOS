import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import assert from "node:assert/strict";
import { AiNote, AiPilotToggle, readShowAi, writeShowAi } from "./ai-note.js";

const LINES = [
  [
    { understood: "dictionary", voice: "ai" },
    "фразу понял: словарь · реплика: AI"
  ],
  [
    { understood: "ai", voice: "template", voiceNote: "ai_off" },
    "фразу понял: AI · реплика: шаблон (AI выключен)"
  ],
  [
    { understood: "dictionary", voice: "template", voiceNote: "voice_off" },
    "фразу понял: словарь · реплика: шаблон (AI-голос выключен в правилах)"
  ],
  [
    { understood: "dictionary", voice: "template", voiceNote: "skip_code" },
    "фразу понял: словарь · реплика: шаблон (для этого ответа AI не нужен)"
  ],
  [
    { understood: "none", voice: "template", voiceNote: "failed" },
    "фразу понял: никто · реплика: шаблон (AI не ответил)"
  ],
  [
    { understood: "dictionary", voice: "template", voiceNote: "rejected:number_changed" },
    "фразу понял: словарь · реплика: шаблон (реплику AI отбраковал код (number_changed))"
  ],
  [
    { understood: "button", voice: "template", voiceNote: "skip_code" },
    "фразу понял: кнопка · реплика: шаблон (для этого ответа AI не нужен)"
  ]
];

function html(meta, show) {
  return renderToStaticMarkup(createElement(AiNote, { meta, show }));
}

function inputOf(tree) {
  const children = Array.isArray(tree?.props?.children) ? tree.props.children : [tree?.props?.children];
  return children.find((child) => child && child.type === "input");
}

function storageDescriptor() {
  try {
    return Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  } catch {
    return undefined;
  }
}

function restoreStorage(saved) {
  if (saved) Object.defineProperty(globalThis, "localStorage", saved);
  else delete globalThis.localStorage;
}

test("the note line follows meta and stays hidden without it", () => {
  for (const [meta, line] of LINES) {
    assert.equal(html(meta, true), `<p class="chat-ai-note">${line}</p>`);
    assert.equal(html(meta, false), "");
  }
  assert.equal(html(undefined, true), "");
  assert.equal(html(null, true), "");
  assert.equal(html({ understood: "magic", voice: "ai" }, true), "");
  assert.equal(html("dictionary", true), "");
});

test("the pilot checkbox is stored and defaults to on", () => {
  const saved = storageDescriptor();
  const store = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: {
      getItem(key) {
        return store.has(key) ? store.get(key) : null;
      },
      setItem(key, value) {
        store.set(key, String(value));
      }
    }
  });
  try {
    assert.equal(readShowAi(), true);
    const onHtml = renderToStaticMarkup(createElement(AiPilotToggle, { on: readShowAi(), onChange() {} }));
    assert.match(onHtml, /Показывать, как работает AI/);
    assert.match(onHtml, /checked/);

    let seen;
    const tree = AiPilotToggle({
      on: true,
      onChange(next) {
        seen = next;
      }
    });
    inputOf(tree).props.onChange({ target: { checked: false } });
    assert.equal(seen, false);
    assert.equal(readShowAi(), false);
    const offHtml = renderToStaticMarkup(createElement(AiPilotToggle, { on: readShowAi(), onChange() {} }));
    assert.equal(offHtml.includes("checked"), false);
    assert.match(offHtml, /Показывать, как работает AI/);

    inputOf(AiPilotToggle({ on: false, onChange() {} })).props.onChange({ target: { checked: true } });
    assert.equal(readShowAi(), true);
  } finally {
    restoreStorage(saved);
  }
});

test("a missing localStorage does not throw and leaves the note available", () => {
  const saved = storageDescriptor();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("blocked");
    }
  });
  try {
    assert.equal(readShowAi(), true);
    assert.doesNotThrow(() => writeShowAi(false));
    const line = html({ understood: "dictionary", voice: "ai" }, readShowAi());
    assert.match(line, /фразу понял: словарь · реплика: AI/);
    const tree = AiPilotToggle({ on: readShowAi(), onChange() {} });
    assert.doesNotThrow(() => inputOf(tree).props.onChange({ target: { checked: false } }));
    const toggle = renderToStaticMarkup(createElement(AiPilotToggle, { on: true, onChange() {} }));
    assert.match(toggle, /Показывать, как работает AI/);
  } finally {
    restoreStorage(saved);
  }
});
