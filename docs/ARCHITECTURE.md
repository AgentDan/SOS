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
                  knobs.json
tests/scenarios/  README.md
scripts/          validate.js  publish.js  migrate-catalog.js
docs/  mockups/  .cursor/rules/architecture.mdc
README.md  package.json  package-lock.json  .env.example  .gitignore
```

`backend/` и `client/` на два уровня:

```
backend/
  api/            routes.js  catalog.routes.js  data-version.routes.js
                  dialog.routes.js  admin.routes.js  middleware/
  pipeline/       orchestrator.js  context.js  persist.js  reads.js
  understanding/  check-answer.js
  profile/        profile-store.js  apply-facts.js  apply-confirmation.js
  scene/          scene-plan.js  README.md
  needs/          inference-engine.js  matching.js  derive-needs.js
  sales/  director/  voice/  ai/  orders/  sessions/  analytics/
  admin-api/      auth.js  sections.js  journal.js  knobs.js  health.js
  config/         load.js  publish.js  folder-sections.js
  production/     README.md
  validation/     index.js  knobs.js и проверки разделов
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

Данные, которые правит админ, лежат в `data/`. Раздел — файл `<name>.json` с конвертом `{section, draftVersion, publishedVersion, draft, published, history}` или папка: `_envelope.json` без `draft`, а черновик — файлы папки. Каталог — папка `data/catalog/` (`types.json`, `needs.json`, `sku/<артикул>.json`), одна версия на весь раздел. Рантайм читает опубликованный слой (`published`, а если его ещё нет — `draft`) с диска на каждый запрос, без кэша. Публикация копирует черновик в `published`, увеличивает `publishedVersion` и пишет в `history` снимок черновика (последние 20 записей). Откат берёт снимок версии, возвращает его в `draft` и `published` и снова увеличивает версию. Черновик пишет `writeDraft`: файл раздела или файлы папки, `draftVersion` увеличивается на 1, `published` не меняется. `GET /api/data-version` отдаёт `{dataVersion}` — сумму `publishedVersion` всех разделов. Профили пишет код в `runtime/clients/`. Журнал правок админки — `runtime/admin/journal.jsonl` (каталог в `.gitignore`, вручную не создаётся). Каталог рантайма переопределяется `DESKOS_RUNTIME_DIR`, каталог данных — `DESKOS_DATA_DIR`.

Было → стало: `storage/config/` → `data/`, `storage/clients/` → `runtime/clients/`.

Публичный API: `GET /api/catalog`, `GET /api/data-version`, `GET /api/dialog/next`, `POST /api/dialog/answer`, `GET /api/dialog/scene`, `GET /api/dialog/profile`. Формы этих ответов админка не меняет: клиент по-прежнему читает только `published`.

## Админ-API

Маршруты `/api/admin/*` собраны в `backend/api/admin.routes.js`, логика — в `backend/admin-api/`. Доступ один: заголовок `Authorization: Bearer <токен>`. Токен читается из `ADMIN_TOKEN` в окружении. Сравнение через `crypto.timingSafeEqual` (сначала SHA-256, чтобы длины не расходились). Нет заголовка или токен не совпал — `401 {error}`. Пустой или незаданный `ADMIN_TOKEN` закрывает админ-маршруты целиком: `503` с текстом, что токен не задан. Ролей нет, проверка в одном месте — `requireAdmin` в `backend/admin-api/auth.js`.

Перед записью черновика все разделы проходят `validateDialogData`. Ошибки — `422 {errors}`, на диск ничего не пишется. Если в теле передан `baseDraftVersion` и он не равен текущему `draftVersion`, ответ `409`. Неизвестный раздел — `404`. Тело не JSON или в нём нет `draft` — `400`.

Журнал пишется строкой JSON только после успешного действия: `{ts, action, section, detail}`. `action` — `draft`, `publish`, `rollback` или `knob`. Неудачные `401` и `422` в журнал не попадают. Токен в журнал не пишется.

Реестр ручек — обычный файл `data/knobs.json` (`{knobs: [...]}`), не конверт раздела. Ручка указывает слой, раздел и путь в черновике (`*` — все элементы массива). Значение остаётся в файле раздела. Проверка реестра — `validateKnobs` в `backend/validation/knobs.js`: уникальные id, существующий раздел, путь находит значение нужного типа внутри границ. Она вызывается из `scripts/validate.js`, при старте `server.js` и в `GET /api/admin/health`. `validateDialogData` реестр не проверяет. Новая ручка — одна запись в `data/knobs.json`.

`GET /api/admin/health` всегда отвечает телом `{draft, published, knobs, dataVersion}`: ошибка в данных ставит `ok: false` и список строк, сам маршрут не падает.

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

Подробное дерево с метками «Позже» владелец кладёт в `docs/sos-file-tree.html`. Пока этого файла нет, таблица собрана из шагов, названных в задаче на структуру. Папки ниже содержат README и не подключены к рантайму, кроме уже существующих файлов `scene/scene-plan.js` и админ-API шага 4.

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
