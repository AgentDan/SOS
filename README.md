# deskOS

Конфигуратор рабочего места. Главная цель: провести продажу и сделать клиента лояльным.

## Запуск

```bash
npm install
npm test
npm run validate
npm run dev
```

Клиент: http://localhost:5173/  
Сервер: http://localhost:3000

`npm test` гоняет тесты бэкенда. `npm run validate` проверяет данные диалога и печатает OK.

## Структура

`backend/` — ход диалога по блокам пайплайна и HTTP API. `client/` — сцена, чат и запросы к API. `data/` — конфиги, которые читаются с диска на каждый запрос. `admin/`, `tests/scenarios/` и часть папок бэкенда пока только с README.

Подробнее: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
