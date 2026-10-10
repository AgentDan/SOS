# Архитектура deskOS

Главная цель: провести продажу и сделать клиента лояльным. Анкета, сцена, голос и админка — инструменты этой цели. Папки сервера повторяют блоки хода: понимание фразы, профиль и сцена, вывод и подбор, продажа, режиссёр, голос, ответ. Клиент разделён по частям ответа сервера.

## Дерево

```
backend/          api/  pipeline/  understanding/  profile/  scene/  needs/
                  sales/  director/  voice/  ai/  orders/  sessions/
                  analytics/  admin-api/  config/  validation/  production/
                  server.js  architecture.test.js
client/           api/  session/  chat/  summary/  order/  scene/  styles/  public/
                  index.html  main.js  vite.config.js
admin/            README.md
data/             questionnaire.json  catalog/  consultant.json
                  director.json  sales.json  commands.json  ai-rules.json
tests/scenarios/  README.md
scripts/          validate.js  publish.js  migrate-catalog.js
docs/  mockups/  .cursor/rules/architecture.mdc
README.md  package.json  package-lock.json  .env.example  .gitignore
```

`backend/` и `client/` на два уровня:

```
backend/
  api/            routes.js  catalog.routes.js  data-version.routes.js
                  dialog.routes.js  middleware/
  pipeline/       orchestrator.js  context.js  persist.js  reads.js
  understanding/  check-answer.js
  profile/        profile-store.js  apply-facts.js  apply-confirmation.js
  scene/          scene-plan.js  README.md
  needs/          inference-engine.js  matching.js  derive-needs.js
  sales/  director/  voice/  ai/  orders/  sessions/  analytics/  admin-api/
  config/         load.js  publish.js  folder-sections.js
  production/     README.md
  validation/     index.js и проверки разделов
  server.js  architecture.test.js
client/
  api/            dialog-api.js  catalog-api.js
  session/        client-id.js
  chat/           question-buttons.js
  summary/  order/
  scene/          renderer/  physics/  interaction/
                  meshes.js  floor.js  place-products.js  sync-scene.js
  styles/         app.css
  public/         models/
  index.html  main.js  vite.config.js
```

Данные, которые правит админ, лежат в `data/`. Раздел — файл `<name>.json` с конвертом `{section, draftVersion, publishedVersion, draft, published, history}` или папка: `_envelope.json` без `draft`, а черновик — файлы папки. Каталог — папка `data/catalog/` (`types.json`, `needs.json`, `sku/<артикул>.json`), одна версия на весь раздел. Рантайм читает опубликованный слой (`published`, а если его ещё нет — `draft`) с диска на каждый запрос, без кэша. Публикация копирует черновик в `published`, увеличивает `publishedVersion` и пишет в `history` снимок черновика (последние 20 записей). Откат берёт снимок версии, возвращает его в `draft` и `published` и снова увеличивает версию. `GET /api/data-version` отдаёт `{dataVersion}` — сумму `publishedVersion` всех разделов. Профили пишет код в `runtime/clients/` (каталог в `.gitignore`, вручную не создаётся).

Было → стало: `storage/config/` → `data/`, `storage/clients/` → `runtime/clients/`.

Публичный API: `GET /api/catalog`, `GET /api/data-version`, `GET /api/dialog/next`, `POST /api/dialog/answer`, `GET /api/dialog/scene`, `GET /api/dialog/profile`.

## Правила зависимостей

1. `backend/api/**` импортирует только `pipeline`, `orders`, `sessions`, `admin-api`, `config` и свои файлы.
2. Блоки `understanding`, `profile`, `scene`, `needs`, `sales`, `director`, `voice` не импортируют друг друга и не импортируют `api`, `pipeline`, `config`, `orders`, `sessions`, `analytics`, `admin-api`. Только свои файлы, `node:*` и сторонние пакеты.
3. К `backend/ai/**` обращаются только `understanding` и `voice`. Сам `ai` не импортирует `api`, `pipeline`, блоки, `client`, `admin`.
4. `backend/pipeline/**` может импортировать блоки и `config`, но не `api`.
5. `client/**` не импортирует `backend/**` и `admin/**`. `admin/**` не импортирует `backend/**` и `client/**`.
6. Части клиента `chat`, `summary`, `order`, `scene` не импортируют друг друга. Общее разрешено только из `client/api/` и `client/session/`.
7. `fetch(` в клиенте только внутри `client/api/`.
8. Тесты подчиняются тем же правилам. Исключение: тест может читать `data/` через `node:fs`.

Новых зависимостей не добавлять. Проверка этих правил — `backend/architecture.test.js`.

## Шаг roadmap → папки

Подробное дерево с метками «Позже» владелец кладёт в `docs/sos-file-tree.html`. Пока этого файла нет, таблица собрана из шагов, названных в задаче на структуру. Папки ниже содержат README и не подключены к рантайму, кроме уже существующих файлов `scene/scene-plan.js`.

| Шаг | Папки |
| --- | --- |
| 2 | `tests/scenarios/` |
| 4 | `backend/admin-api/` |
| 5 | `admin/` — каркас |
| 6, 14 | `client/summary/` |
| 7 | `client/order/` |
| 10 | `admin/` — анкета |
| 13 | `admin/` — каталог |
| 14 | `backend/sales/` — `budget.js`, `why-this.js` |
| 15, 31 | `backend/voice/` |
| 16 | `admin/` — консультант |
| 18 | `admin/` — режиссёр |
| 20 | `backend/scene/` — команды клиента и итоговая сцена |
| 21 | `admin/` — команды |
| 22 | `backend/sales/` — `objections.js`, `signals.js`, `stages.js` |
| 23 | `admin/` — продажа |
| 25 | `admin/` — песочница и воронка |
| 32 | `admin/` — AI |

`backend/ai/`, `backend/orders/`, `backend/sessions/`, `backend/analytics/` в утверждённом дереве содержат только README. Номера их шагов здесь не выдуманы.
