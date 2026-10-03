# Архитектура deskOS

Главная цель: провести продажу и сделать клиента лояльным. Анкета, админка, 3D-сцена и AI — инструменты этой цели.

Слой продажи (возражения, бюджет, оформление, лояльность) и AI-слой добавляются рядом с текущим диалогом, без переписывания этапов 1–6.

## Дерево

```
deskOS/
├── README.md
├── docs/
│   └── ARCHITECTURE.md
├── mockups/                               макеты, код их не читает
├── backend/
│   ├── server.js                          старт: валидация конфигов, /api
│   ├── api/
│   │   ├── routes.js                      сборщик роутеров
│   │   ├── catalog.routes.js              GET /catalog
│   │   ├── dialog.routes.js               /dialog/next, answer, scene, profile
│   │   └── middleware/client-id.js
│   ├── config/load.js                     чтение storage/config с диска, без кэша
│   ├── validation/                        конверт и разделы конфигов
│   ├── dialog/                            детерминированный диалог (этапы 1–6)
│   │   ├── engine/
│   │   ├── answer-service.js
│   │   └── profile-store.js
│   ├── sales/                             этап 11, не в рантайме
│   ├── ai/                                этапы 7–8, не в рантайме
│   ├── scene/                             этап 8, команды сцены, не в рантайме
│   ├── orders/                            этап 9, не в рантайме
│   ├── sessions/                          этап 10, не в рантайме
│   └── analytics/                         воронка, не в рантайме
├── client/                                браузер, только через /api
│   └── admin/                             этап 12, не в рантайме
└── storage/
    ├── config/                            данные, которые правит админ
    ├── clients/                           профили, в .gitignore
    ├── orders/                            в .gitignore
    └── sessions/                          в .gitignore
```

Конфиги лежат в конверте `{section, draftVersion, publishedVersion, draft, history}`. Рантайм читает `.draft`. Ветки `published` нет.

Публичный API не меняется: `GET /api/catalog`, `GET /api/dialog/next`, `POST /api/dialog/answer`, `GET /api/dialog/scene`, `GET /api/dialog/profile`.

## Правила зависимостей

```
storage/config  →  backend/dialog, backend/sales  →  backend/api  →  client
                                 ↑
                           backend/ai   (только через словарь и проверку)
```

1. Данные не знают о коде. Всё, что правит админ, лежит в `storage/config/`, а не в `.js`.
2. `backend/dialog/**` и `backend/sales/**` не импортируют `backend/ai/**`.
3. `backend/ai/**` не импортирует `backend/api/**` и `client/**`.
4. `client/**` не импортирует `backend/**`. Общение только через `/api`.
5. Роуты разбирают запрос и отвечают. Бизнес-логика живёт в `backend/dialog/` и `backend/sales/`.
6. Ссылки между файлами данных идут по `id`. Ссылка на несуществующий `id` — ошибка валидатора.

## Карта этапов

| Этап | Смысл | Файлы |
| --- | --- | --- |
| 1–6 | Диалог, вывод потребностей, подбор SKU, план сцены, подтверждение | `backend/dialog/**`, `storage/config/questionnaire.json`, `storage/config/catalog.json`, `client/` кроме `admin/` |
| 7–8 | Словарь, разбор фразы, голос | `backend/ai/`, `storage/config/ai-rules.json`, `storage/config/consultant.json` |
| 8 | Команды сцены: add, remove, move, rotate, replace | `backend/scene/`, `storage/config/commands.json` |
| 9 | Лид: состав, цены, контакт | `backend/orders/`, `storage/orders/` |
| 10 | Сессии и возвращение клиента | `backend/sessions/`, `storage/sessions/` |
| 11 | Этапы сделки, возражения, бюджет, «почему это», лояльность | `backend/sales/`, `storage/config/sales.json`, `storage/config/director.json` |
| 12 | Боевая админка | `client/admin/` |
| — | Воронка, где уходят, исход возражений | `backend/analytics/` |

Папки этапов 7–12 и аналитики пока содержат только `README.md` и не подключены к рантайму. Контент (персоны, возражения, реплики) в скелетах конфигов не заполняется: он переедет из макета админки отдельной задачей.
