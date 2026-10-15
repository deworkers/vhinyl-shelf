# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Vinyl Shelf — a personal vinyl record collection app. Search releases via Discogs API, add them to your collection or "want to buy" list, view release details with metadata and tracklists, manually add records and upload covers.

**Stack:** Vue 3 + Vite + Pinia + Vue Router (frontend) / Node.js + Express (backend) / SQLite via better-sqlite3

## Commands

### Backend
```bash
cd backend && npm install          # install dependencies
npm run dev                        # start dev server with nodemon (port 3001)
npm start                          # production start
```

### Frontend
```bash
cd frontend && npm install         # install dependencies
npm run dev                        # start Vite dev server (port 5173)
npm run build                      # production build to dist/
npm run preview                    # preview production build locally
```

### Docker
```bash
docker compose up --build -d       # build and run both services
docker compose down                # stop and clean up
```

Requires a `.env` file in the project root with `DISCOGS_TOKEN` and optionally `DISCOGS_USER_AGENT`.

## Architecture

### Backend (`backend/`)

```
backend/
  src/
    server.js          — Express app entry: middleware, routes, error handler
    db/
      client.js        — SQLite connection, WAL mode, loads schema.sql at startup
      schema.sql       — tables: records, uploads
    routes/
      records.js       — CRUD for user's collection (GET/POST/PATCH/DELETE /api/records)
      discogs.js       — Discogs API proxy (search, release details)
      uploads.js       — cover image upload via multer
    providers/
      discogsClient.js — Discogs API client (fetch wrapper, rate-limit headers, cover URL resolution)
  data/                — SQLite DB file (vinyl.sqlite), created at runtime
  uploads/             — stored cover images
```

Key patterns:
- `better-sqlite3` prepared statements with named parameters for all queries.
- Discogs API responses are cached in `payload_json` text column on records to avoid refetching.
- Error handler in `server.js` special-cases 429 rate-limit responses from Discogs.

### Frontend (`frontend/`)

```
frontend/src/
  App.vue              — Shell with sticky topbar (brand, inline search), <router-view>
  main.js              — Entry: creates app, registers Pinia + router
  router/index.js      — 3 routes: /, /search, /release/:id
  stores/records.js    — Pinia store: fetch records, search Discogs, add/update/delete releases, upload covers
  views/
    HomeView.vue       — Collection grid with status filter tabs
    SearchView.vue     — Discogs search results grid + pagination
    ReleaseView.vue    — Detail page for a single record
  components/
    HelloWorld.vue     — Starter component (unused)
    VinylGrid.vue      — Reusable grid of record cards
    AddRecordModal.vue — Modal to add from Discogs search or manually
```

Key patterns:
- All API calls go through the Pinia `useRecordsStore`. The store handles fetch directly (no axios/computed client).
- Frontend proxies `/api` through Vite dev server via `VITE_API_BASE` env var. In production, nginx serves static files and reverse-proxies `/api` to backend.

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `DISCOGS_TOKEN` | backend/.env or root .env (Docker) | Discogs API auth token |
| `DISCOGS_USER_AGENT` | backend/.env or root .env | Discogs User-Agent header |
| `PORT` | backend/.env | Backend listen port (default 3001) |
| `VITE_API_BASE` | frontend/.env or Docker build arg | Base URL for API calls |
| `VITE_API_ORIGIN` | frontend/.env or Docker build arg | API origin for redirects |

## Database schema

**records**: id, source (discogs/manual), discogs_release_id (unique), status (my_collection/want_to_buy), title, artist, year, label, format, cover_url, notes, payload_json (full Discogs response), spotify_preview_url, created_at, updated_at

**uploads**: id, record_id (FK), file_path, mime_type, created_at

## Pending work (from TODO.md)

- Sorting and filtering collection (ORDER BY field + direction, UI control)
- Collection stats page
- Artist page (/artist/:id) with biography and discography
- Dark theme support
- Barcode scanning via camera
