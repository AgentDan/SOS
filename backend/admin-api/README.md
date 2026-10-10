# API админки

Правка черновика, публикация, откат, журнал и реестр ручек. Маршруты в `backend/api/admin.routes.js`, логика здесь. Клиентский API не меняется: он читает только опубликованный слой.

Доступ: `Authorization: Bearer <ADMIN_TOKEN>`. Токен задаётся в окружении. Если `ADMIN_TOKEN` пустой или не задан, все маршруты ниже отвечают `503`. Нет заголовка или токен не совпал — `401 {error:"unauthorized"}`. Сравнение constant-time (`crypto.timingSafeEqual`). Ролей нет: одна проверка в `auth.js`.

Перед записью черновика вызывается `validateDialogData` по всем разделам. Ошибка валидатора — `422 {errors:[...]}`, файлы не меняются. Журнал (`runtime/admin/journal.jsonl`, каталог `DESKOS_RUNTIME_DIR` или `runtime/`) получает строку только после успешного действия.

## Маршруты

Все пути относительно `/api/admin` и закрыты токеном.

| Метод | Путь | Успех |
| --- | --- | --- |
| GET | `/sections` | список `{name, draftVersion, publishedVersion, hasUnpublishedChanges}` |
| GET | `/sections/:name` | `{name, draftVersion, publishedVersion, draft, published, history}` |
| PUT | `/sections/:name/draft` | тело `{draft, baseDraftVersion?}`. Ответ `{draftVersion}`. Конфликт версии — `409` |
| POST | `/sections/:name/publish` | тело `{description}`. Ответ `{publishedVersion, date}` |
| POST | `/sections/:name/rollback` | тело `{version}`. Нет снимка или версия не число — `422` |
| GET | `/sections/:name/history` | история без `snapshot`: `version`, `date`, `description`, `rolledBackTo` |
| GET | `/health` | `{draft:{ok,errors}, published:{ok,errors}, knobs:{ok,errors}, dataVersion}` |
| GET | `/journal?limit=50` | последние строки `{ts, action, section, detail}` |
| GET | `/knobs` | ручки из `data/knobs.json`, у каждой `values: [{at, value, key?}]` |
| PUT | `/knobs/:id` | тело `{at, value}`. Пишет в черновик раздела, публикации нет. Ответ `{draftVersion, id, at, value}` |

`key` в значении ручки — артикул, если путь прошёл через товар каталога.

Неизвестный раздел или ручка — `404`. Тело не JSON или нет обязательного поля — `400`.

## Ручки

Реестр — `data/knobs.json`, не конверт. Поля: `id`, `layer` (`dialog`, `product`, `acquisition`, `production`), `section`, `path`, `label`, `type` (`number`, `string`, `boolean`, `enum`), для числа `min`/`max`, для списка `options`, `description`. Путь считается по собранному черновику. `*` означает каждый элемент.

Проверка — `backend/validation/knobs.js` (`npm run validate` и старт сервера). Новая ручка добавляется записью в реестр, без нового кода.
