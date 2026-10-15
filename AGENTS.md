# Vinyl Shelf — инструкции для агента

Персональное приложение для коллекции винила: поиск через Discogs, коллекция / «хочу купить», детали релиза, ручное добавление и загрузка обложек.

Подробная архитектура, схема БД и паттерны кода — в `CLAUDE.md`.

## Стек

- **Frontend:** Vue 3, Vite, Pinia, Vue Router
- **Backend:** Node.js 20+, Express
- **DB:** SQLite через `better-sqlite3`

## Быстрый старт

### Установка зависимостей

```bash
cd backend && npm install
cd ../frontend && npm install
```

### Переменные окружения

**Backend** (`backend/.env`):

```env
PORT=3001
DISCOGS_TOKEN=your_discogs_token
DISCOGS_USER_AGENT=VinylShelf/1.0 +http://localhost
```

**Frontend** (`frontend/.env`):

```env
VITE_API_BASE=http://localhost:3001/api
VITE_API_ORIGIN=http://localhost:3001
```

Образец для Docker — `.env.example` в корне.

### Dev-серверы

Нужны **два процесса** в разных терминалах:

```bash
cd backend && npm run dev    # http://localhost:3001
cd frontend && npm run dev   # http://localhost:5173
```

Проверка backend: `GET http://localhost:3001/api/health`

### Docker

```bash
docker compose up --build -d   # http://localhost:8080
docker compose down
```

## Правила работы

- Отвечай пользователю на **русском**.
- Делай **минимальный scope** — только то, что запрошено.
- **Не коммить** `.env`, секреты, `backend/data/`, `backend/uploads/`.
- **Не создавай git-коммиты** без явной просьбы пользователя.
- Следуй существующим соглашениям проекта (см. `CLAUDE.md`).
- Комментарии — только для неочевидной логики; код должен быть самодокументируемым.

## Проверка изменений

Отдельных `lint` / `test` / `check` скриптов нет.

После изменений:

- **backend:** сервер должен стартовать (`npm run dev` или `node src/server.js`)
- **frontend:** `npm run build` — проверка production-сборки

## Ключевые точки входа

| Область | Файл |
|---------|------|
| Express entry | `backend/src/server.js` |
| API routes | `backend/src/routes/` (records, discogs, uploads) |
| Discogs client | `backend/src/providers/discogsClient.js` |
| DB schema | `backend/src/db/schema.sql` |
| Pinia store (все API) | `frontend/src/stores/records.js` |
| Маршруты UI | `frontend/src/router/index.js` |
| Backlog | `TODO.md` |

## API (кратко)

- `GET /api/health`
- `GET /api/discogs/search`, `GET /api/discogs/releases/:id`
- `GET|POST /api/records`, `PATCH|DELETE /api/records/:id`
- `POST /api/uploads/cover`

## Discogs

- Без `DISCOGS_TOKEN` поиск не работает.
- Ответы Discogs кэшируются в `records.payload_json`.
- 429 rate-limit обрабатывается в `server.js`.

## Windows

Pi использует **bash** для tool `bash`. Нужен Git Bash (Git for Windows), Cygwin, MSYS2 или WSL. При проблемах — `shellPath` в `~/.pi/agent/settings.json`.

## Pi в этом проекте

- Настройки проекта: `.pi/settings.json`
- Сессии: `.pi/sessions/` (локально, в git не попадают)
- При первом запуске подтверди trust проекта (`/trust`), чтобы загрузились project settings
