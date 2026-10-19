# Vinyl Shelf

Приложение для ведения личной коллекции винила:
- поиск релизов через Discogs;
- добавление в коллекцию или в список "хочу купить";
- детальная страница релиза с метаданными и треклистом;
- прослушивание превью песен из iTunes рядом с треклистом;
- ручное добавление релизов и загрузка обложек.

Стек:
- Frontend: `Vue 3` + `Vite` + `Pinia` + `Vue Router`
- Backend: `Node.js` + `Express`
- DB: `SQLite` (`better-sqlite3`)

---

## Быстрый запуск (локально)

### 1) Требования
- Node.js `24` (версия для CI и Docker также закреплена на `24`)
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
VITE_API_BASE=/api
VITE_API_ORIGIN=
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

Для проверки с телефона в той же локальной сети откройте
`http://<локальный-IP-компьютера>:5173`. Vite принимает подключения из сети
и проксирует `/api` и `/uploads` в backend. Адрес API `/api` и пустой
`VITE_API_ORIGIN` позволяют обращаться к серверу по адресу открытого сайта.

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

## GitHub Actions и автодеплой

Pull request в `main` запускает тесты, сборку frontend и проверку Docker-контейнеров.
Push в `main` после успешных проверок публикует образы в GitHub Container Registry
и обновляет приложение на VPS через SSH. SQLite и обложки сохраняются в томах.

Однократная настройка сервера, Secrets, HTTPS и возврат предыдущей версии описаны
в [DEPLOYMENT.md](DEPLOYMENT.md). Для frontend и backend доступна команда `npm test`.

---

## Поиск по штрихкоду

В поиске в шапке или на странице поиска нажмите значок штрихкода справа в поле ввода. Можно
отсканировать EAN/UPC камерой, выбрать фотографию или ввести цифры вручную.
Штрихкод также можно вставить прямо в обычное поле поиска.

Камера требует разрешения браузера и HTTPS; на `localhost` и `127.0.0.1`
допускается HTTP. При открытии с телефона по локальному IP через HTTP используйте
фото или ручной ввод. Изображения распознаются в браузере, на сервер передаётся
только код.

Поиск использует существующий `DISCOGS_TOKEN` и запрос
`GET /api/discogs/search?barcode=602567988724`. Один код может соответствовать
нескольким изданиям: выберите нужное в результатах. Если совпадений нет,
попробуйте поиск по названию или ручное добавление.

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
- `GET /api/previews/search?artist=Pink%20Floyd&title=Money&album=The%20Dark%20Side%20of%20the%20Moon`
- `GET /api/records`
- `POST /api/records`
- `PATCH /api/records/:id`
- `DELETE /api/records/:id`
- `POST /api/uploads/cover`

### Превью песен

Поиск через iTunes Search API не требует токена. На странице релиза нажмите ▶
рядом с песней: одновременно воспроизводится только одно превью. Поиск выполняется
по исполнителю и названию, приоритет получает указанный альбом. Цифровое издание
может отличаться от винилового. Для сборников используется исполнитель конкретного
трека, если он указан в Discogs. Для кириллических запросов сначала проверяется
каталог RU, при отсутствии подходящего превью — US. Имена исполнителей сравниваются
с учётом кириллицы и вариантов транслитерации.
Для релизов с описанием формата `Compilation` или `Unofficial Release` название
альбома не участвует в выборе превью: используется исполнитель и название песни.
Повторяющиеся записи одного исполнителя (например, `Linkin Park, Linkin Park`)
объединяются перед поиском.

Для сокращённых названий (например, «Скованные» → «Скованные одной цепью»)
требуются совпадение альбома, близкая длительность и единственный подходящий вариант
полного названия. Каверы других исполнителей и отличающиеся live/remix-версии
не подставляются.
Для сборников совпадение альбома не требуется и при сокращённом названии;
проверки длительности и однозначности сохраняются.

`GET /api/previews/search` принимает обязательные `artist`, `title` и необязательный
`album` (строки до 300 символов), а также необязательный `duration` в формате `М:СС`
или `Ч:ММ:СС` для сопоставления сокращённых названий.
Для сборников передаётся `ignore_album=true` (по умолчанию `false`). Этот параметр
отключает проверку и приоритет альбома, включая сопоставление сокращённых названий.
Ответ: `{ "preview": null }`, если подходящего
превью нет, или `{ "preview": { "trackId": 123, "title": "Money", "artist": "Pink Floyd",
"album": "The Dark Side of the Moon", "previewUrl": "https://audio-ssl.itunes.apple.com/...",
"trackViewUrl": "https://music.apple.com/..." } }`.
Ошибки: `400` — некорректный запрос, `429` с `Retry-After` — лимит запросов,
`502` — ошибка iTunes, `504` — превышено время ожидания (8 секунд).

Для запросов без кириллицы используется каталог US. Метаданные найденных превью
хранятся в памяти backend один час, отсутствующих — одну минуту (до 200 записей);
аудиофайлы не сохраняются. Новых запросов к iTunes — не более 20 в минуту на процесс,
включая запросы в обе витрины. У найденных треков показаны ссылка на магазин и атрибуция
в соответствии с [условиями iTunes Search API](https://performance-partners.apple.com/search-api).
Значок магазина взят с [официальной страницы Apple](https://www.apple.com/ca/itunes/link/).

Для локальной проверки через Postman Simulation:

```bash
postman simulation run postman/simulations/previews.sim.yaml --port 4900 --no-history
```

В отдельном терминале, перед запуском backend (PowerShell):

```powershell
$env:ITUNES_API_BASE='http://127.0.0.1:4900/itunes'
```

Без `ITUNES_API_BASE` backend обращается к `https://itunes.apple.com`.
Локальный mock основан на полях ответа из документации Apple; реальные обложки
и аудио для него не загружаются.
Mock содержит русские треки, включая сокращённое название Nautilus Pompilius.
Для проверки перехода RU → US сценарий Агутина намеренно возвращает пустой RU-результат.

