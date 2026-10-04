# Сценарии

Файл `tests/scenarios/<name>.json` — ответы клиента и ожидание после прогона через движок. Id берутся из `data/questionnaire.json` и `data/catalog.json`.

## Формат

```json
{
  "name": "описание одной строкой",
  "steps": [
    { "questionId": "q_work_type", "optionId": "coding" }
  ],
  "expect": {
    "needs": [
      { "id": "desk_top_wide", "confidence": "medium" }
    ],
    "pendingConfirmations": ["desk_top_wide"],
    "skus": ["DESK-TOP-1800"],
    "rejectedNeeds": [],
    "status": "in_progress"
  }
}
```

- `steps` — ответы по порядку. `questionId` — id вопроса или `confirm_<needId>`.
- `expect.needs` — итоговый `profile.needs`: id и `confidence`.
- `expect.pendingConfirmations` — потребности с `confidence` не `high`, которых нет в `confirmedNeeds` и `rejectedNeeds`. Пустой массив значит, что таких нет.
- `expect.skus` — `resolvedSku` подобранных потребностей. Порядок не важен.
- `expect.rejectedNeeds` — id в `profile.rejectedNeeds`.
- `expect.status` — `profile.status`.
- Поле в `expect`, которого нет в файле, не проверяется. Указанный массив сверяется целиком: лишние id тоже ошибка.

## Пример

`programmer-wide-desk.json`: ответ «программирую» выводит `desk_top_wide` с уверенностью `medium`. Подбор даёт `DESK-TOP-1800`, потребность остаётся на подтверждении.

## Запуск

`npm run scenario` прогоняет все файлы. `npm run check` — тесты, проверка данных и сценарии одной командой.

## Файлы

- `programmer-wide-desk.json` — широкий стол уходит в подтверждение
- `client-rejected.json` — тот же путь, затем отказ `confirm_desk_top_wide` / `reject`
- `back-pain-chair.json` — `q_back_pain` / `yes` даёт `ergonomic_chair` с уверенностью `high` и артикул `CHAIR-460`
