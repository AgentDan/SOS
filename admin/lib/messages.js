const ACTIONS = {
  draft: "Правка черновика",
  publish: "Публикация",
  rollback: "Откат",
  knob: "Ручка"
};

const SECRET_KEY = /token|authorization|password|secret/i;

function errorCountText(count) {
  const n = Math.abs(Number(count)) || 0;
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 > 10 && mod100 < 20) return `${n} ошибок`;
  if (mod10 === 1) return `${n} ошибка`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} ошибки`;
  return `${n} ошибок`;
}

function healthLine(title, report) {
  const errors = Array.isArray(report?.errors) ? report.errors.map((item) => String(item)) : [];
  if (report && report.ok === true) return { ok: true, text: `${title}: ок`, errors: [] };
  const countText = errors.length > 0 ? errorCountText(errors.length) : "есть ошибки";
  return { ok: false, text: `${title}: ${countText}`, errors };
}

function dataVersionText(value) {
  return typeof value === "number" && Number.isFinite(value) ? `Версия данных: ${value}` : "Версия данных: нет";
}

function errorsFromBody(body) {
  if (!body || typeof body !== "object") return [];
  if (Array.isArray(body.errors) && body.errors.length > 0) return body.errors.map((item) => String(item));
  if (typeof body.error === "string" && body.error.length > 0) return [body.error];
  return [];
}

function explainFailure(line) {
  const text = String(line);
  const snapshot = /snapshot for version (\d+)/.exec(text);
  if (snapshot) return `Для версии ${snapshot[1]} нет сохранённого снимка`;
  if (text.includes("version must be an integer")) return "Номер версии указан неверно";
  if (text === "unknown section") return "Такого раздела нет";
  if (text === "unknown knob") return "Такой ручки нет";
  if (text === "unauthorized") return "Неверный токен";
  return text;
}

function failureText(status) {
  if (status === 0) return "Сервер не отвечает";
  if (status === 401) return "Неверный токен";
  if (status === 503) return "Админка закрыта: на сервере не задан ADMIN_TOKEN";
  if (status === 404) return "Не найдено";
  if (status === 400) return "Сервер не принял запрос";
  return "Не получилось выполнить запрос";
}

function loginFailure(status) {
  if (status === 401) return "Неверный токен";
  if (status === 503) return "Админка закрыта: на сервере не задан ADMIN_TOKEN";
  if (status === 0) return "Сервер не отвечает";
  return "Не удалось войти";
}

function problemLines(status, body) {
  if (body && Array.isArray(body.errors) && body.errors.length > 0) {
    return body.errors.map((item) => explainFailure(item));
  }
  if (body && typeof body.error === "string" && body.error.length > 0) {
    const explained = explainFailure(body.error);
    if (explained !== body.error) return [explained];
  }
  return [failureText(status)];
}

function actionLabel(action) {
  if (typeof action === "string" && ACTIONS[action]) return ACTIONS[action];
  if (typeof action === "string" && action.length > 0) return action;
  return "Действие";
}

function historyDescription(description) {
  const text = typeof description === "string" ? description : "";
  const rollback = /^rollback to v(\d+)$/.exec(text);
  if (rollback) return `Откат к версии ${rollback[1]}`;
  return text;
}

function historyLabel(entry) {
  if (!entry || typeof entry !== "object") return "—";
  const main = historyDescription(entry.description);
  const systemRollback = /^rollback to v\d+$/.test(String(entry.description ?? ""));
  if (entry.rolledBackTo != null && !systemRollback) {
    const extra = `Откат к версии ${entry.rolledBackTo}`;
    return main ? `${main}. ${extra}` : extra;
  }
  return main || "—";
}

function formatLocalTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso ?? "");
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "medium" }).format(date);
}

function safeText(value) {
  let text;
  if (typeof value === "string") text = value;
  else if (typeof value === "number" || typeof value === "boolean") text = String(value);
  else if (value == null) text = "пусто";
  else {
    try {
      text = JSON.stringify(value);
    } catch {
      text = "…";
    }
  }
  if (/bearer\s+\S+/i.test(text)) return "скрыто";
  return text;
}

function formatJournalDetail(detail) {
  if (detail == null || detail === "") return "—";
  if (typeof detail !== "object" || Array.isArray(detail)) return safeText(detail);
  const parts = [];
  if (Object.hasOwn(detail, "id")) parts.push(`ручка ${safeText(detail.id)}`);
  if (Object.hasOwn(detail, "at")) parts.push(`поле ${safeText(detail.at)}`);
  if (Object.hasOwn(detail, "from") || Object.hasOwn(detail, "to")) {
    parts.push(`${safeText(detail.from)} → ${safeText(detail.to)}`);
  }
  if (Object.hasOwn(detail, "draftVersion")) parts.push(`черновик v${safeText(detail.draftVersion)}`);
  if (Object.hasOwn(detail, "publishedVersion")) parts.push(`опубликовано v${safeText(detail.publishedVersion)}`);
  if (Object.hasOwn(detail, "version")) parts.push(`версия ${safeText(detail.version)}`);
  if (Object.hasOwn(detail, "description") && detail.description !== "") {
    parts.push(safeText(historyDescription(detail.description)));
  }
  if (parts.length > 0) return parts.join(", ");
  const extra = [];
  for (const [key, value] of Object.entries(detail)) {
    if (SECRET_KEY.test(key) || key === "snapshot") continue;
    extra.push(`${key}: ${safeText(value)}`);
  }
  return extra.length > 0 ? extra.join(", ") : "—";
}

export {
  errorCountText,
  healthLine,
  dataVersionText,
  errorsFromBody,
  explainFailure,
  failureText,
  loginFailure,
  problemLines,
  actionLabel,
  historyDescription,
  historyLabel,
  formatLocalTime,
  formatJournalDetail
};
