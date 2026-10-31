import { createElement } from "react";

const SHOW_AI_KEY = "sos-show-ai";

const WHO = {
  dictionary: "словарь",
  ai: "AI",
  button: "кнопка",
  none: "никто"
};

function noteText(note) {
  if (note === "ai_off") return "AI выключен";
  if (note === "voice_off") return "AI-голос выключен в правилах";
  if (note === "skip_code") return "для этого ответа AI не нужен";
  if (note === "failed") return "AI не ответил";
  if (typeof note === "string" && note.startsWith("rejected:")) {
    const reason = note.slice("rejected:".length);
    if (reason) return `реплику AI отбраковал код (${reason})`;
  }
  return "";
}

function formatAiNote(meta) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const who = WHO[meta.understood];
  if (!who) return null;
  if (meta.voice === "ai") return `фразу понял: ${who} · реплика: AI`;
  if (meta.voice !== "template") return null;
  const why = noteText(meta.voiceNote);
  const how = why ? `шаблон (${why})` : "шаблон";
  return `фразу понял: ${who} · реплика: ${how}`;
}

function readShowAi() {
  try {
    const value = localStorage.getItem(SHOW_AI_KEY);
    if (value === null) return true;
    return value !== "0";
  } catch {
    return true;
  }
}

function writeShowAi(on) {
  try {
    localStorage.setItem(SHOW_AI_KEY, on ? "1" : "0");
  } catch {
    // хранилище может быть недоступно
  }
}

function AiNote({ meta, show }) {
  if (show !== true) return null;
  const text = formatAiNote(meta);
  if (!text) return null;
  return createElement("p", { className: "chat-ai-note" }, text);
}

function AiPilotToggle({ on, onChange }) {
  return createElement(
    "label",
    { className: "ai-pilot" },
    createElement("input", {
      type: "checkbox",
      checked: on === true,
      onChange(event) {
        const next = event?.target?.checked === true;
        writeShowAi(next);
        if (typeof onChange === "function") onChange(next);
      }
    }),
    "Показывать, как работает AI"
  );
}

export { AiNote, AiPilotToggle, readShowAi, writeShowAi };
