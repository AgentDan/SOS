import test from "node:test";
import assert from "node:assert/strict";
import {
  actionLabel,
  dataVersionText,
  errorCountText,
  formatJournalDetail,
  formatLocalTime,
  healthLine,
  historyLabel,
  loginFailure,
  problemLines
} from "./messages.js";

test("error text uses Russian plural forms", () => {
  assert.equal(errorCountText(1), "1 ошибка");
  assert.equal(errorCountText(2), "2 ошибки");
  assert.equal(errorCountText(5), "5 ошибок");
  assert.equal(errorCountText(11), "11 ошибок");
  assert.equal(errorCountText(21), "21 ошибка");
});

test("health lines stay readable when the report has errors", () => {
  assert.deepEqual(healthLine("черновик", { ok: true, errors: [] }), {
    ok: true,
    text: "черновик: ок",
    errors: []
  });
  assert.deepEqual(healthLine("ручки", { ok: false, errors: ["a", "b"] }), {
    ok: false,
    text: "ручки: 2 ошибки",
    errors: ["a", "b"]
  });
  assert.equal(healthLine("опубликованное", null).ok, false);
  assert.equal(dataVersionText(7), "Версия данных: 7");
  assert.equal(dataVersionText(null), "Версия данных: нет");
});

test("login and server problems use fixed wording", () => {
  assert.equal(loginFailure(401), "Неверный токен");
  assert.equal(loginFailure(503), "Админка закрыта: на сервере не задан ADMIN_TOKEN");
  assert.equal(loginFailure(0), "Сервер не отвечает");
  assert.deepEqual(problemLines(422, { errors: ["low must be a number", "gains missing"] }), [
    "low must be a number",
    "gains missing"
  ]);
  assert.deepEqual(problemLines(422, { error: "Config director: snapshot for version 3 is missing" }), [
    "Для версии 3 нет сохранённого снимка"
  ]);
  assert.deepEqual(problemLines(500, { error: "boom" }), ["Не получилось выполнить запрос"]);
});

test("journal fields are shown in Russian without secrets", () => {
  assert.equal(actionLabel("draft"), "Правка черновика");
  assert.equal(actionLabel("publish"), "Публикация");
  assert.equal(actionLabel("rollback"), "Откат");
  assert.equal(actionLabel("knob"), "Ручка");
  assert.equal(
    formatJournalDetail({ id: "director-low", at: "low", from: 35, to: 40, draftVersion: 2 }),
    "ручка director-low, поле low, 35 → 40, черновик v2"
  );
  assert.equal(
    formatJournalDetail({ publishedVersion: 4, version: 2, description: "rollback to v2" }),
    "опубликовано v4, версия 2, Откат к версии 2"
  );
  assert.equal(formatJournalDetail({ token: "secret-value" }), "—");
  assert.equal(formatJournalDetail("Bearer admin-token"), "скрыто");
  assert.equal(historyLabel({ description: "Порог", rolledBackTo: 2 }), "Порог. Откат к версии 2");
  assert.equal(historyLabel({ description: "rollback to v2", rolledBackTo: 2 }), "Откат к версии 2");
});

test("formatLocalTime uses the local timezone", () => {
  const iso = "2026-10-06T18:35:48.275Z";
  const expected = new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "medium" }).format(new Date(iso));
  assert.equal(formatLocalTime(iso), expected);
  assert.equal(formatLocalTime("not-a-date"), "not-a-date");
});
