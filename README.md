# Vinyl Shelf

Приложение для ведения личной коллекции винила:
- поиск релизов через Discogs;
- добавление в коллекцию или в список "хочу купить";
- детальная страница релиза с метаданными и треклистом;
- ручное добавление релизов и загрузка обложек.

Стек:
- Frontend: `Vue 3` + `Vite` + `Pinia` + `Vue Router`
- Backend: `Node.js` + `Express`
- DB: `SQLite` (`better-sqlite3`)

---

## Быстрый запуск (локально)

### 1) Требования
- Node.js `20+`
- npm

### 2) Установка зависимостей

В корне проекта:

```bash
cd backend
npm install

cd ../frontend
npm install
```

### 3) Настройка переменных окружения

#### Backend (`backend/.env`)

```env
PORT=3001
DISCOGS_TOKEN=your_discogs_token
DISCOGS_USER_AGENT=VinylShelf/1.0 +http://localhost
```

> Для `DISCOGS_USER_AGENT` используйте осмысленное значение в формате `AppName/Version +URL`.

#### Frontend (`frontend/.env`)

```env
VITE_API_BASE=http://localhost:3001/api
VITE_API_ORIGIN=http://localhost:3001
```

### 4) Запуск

Запустите **два процесса** в двух терминалах:

#### Терминал 1 — backend
```bash
cd backend
npm run dev
```

Backend будет доступен на `http://localhost:3001`.
Проверка health:
`http://localhost:3001/api/health`

#### Терминал 2 — frontend
```bash
cd frontend
npm run dev
```

Frontend будет доступен на `http://localhost:5173`.

---

## Запуск через Docker

### 1) Подготовьте переменные окружения в корне проекта

Создайте файл `.env` рядом с `docker-compose.yml`:

```env
DISCOGS_TOKEN=your_discogs_token
DISCOGS_USER_AGENT=VinylShelf/1.0 +http://localhost
```

### 2) Сборка и запуск

```bash
docker compose up --build -d
```

После запуска:
- приложение: `http://localhost:8080`
- backend health (через frontend/nginx): `http://localhost:8080/api/health`

### 3) Остановка

```bash
docker compose down
```

### 4) Где хранятся данные

В `docker-compose.yml` подключены named volumes:
- `backend-data` — база SQLite (`/app/data`)
- `backend-uploads` — загруженные обложки (`/app/uploads`)

То есть данные сохраняются между перезапусками контейнеров.

---

## Production-сборка frontend

```bash
cd frontend
npm run build
npm run preview
```

Готовая статика: `frontend/dist`.

---

## Структура проекта

```text
vhinyl/
  backend/
    src/
      routes/        # /api/discogs, /api/records, /api/uploads
      providers/     # Discogs-клиент
      db/            # SQLite schema + client
    data/            # файл БД vinyl.sqlite (создаётся автоматически)
    uploads/         # загруженные обложки
  frontend/
    src/
      views/
      components/
      stores/
```

---

## Полезные endpoints

- `GET /api/health`
- `GET /api/discogs/search`
- `GET /api/discogs/releases/:releaseId`
- `GET /api/records`
- `POST /api/records`
- `PATCH /api/records/:id`
- `DELETE /api/records/:id`
- `POST /api/uploads/cover`

