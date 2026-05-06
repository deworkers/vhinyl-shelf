CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL CHECK(source IN ('discogs', 'manual')),
  discogs_release_id INTEGER UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('my_collection', 'want_to_buy')),
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  year TEXT,
  label TEXT,
  format TEXT,
  cover_url TEXT,
  notes TEXT DEFAULT '',
  payload_json TEXT,
  spotify_preview_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_id INTEGER,
  file_path TEXT NOT NULL,
  mime_type TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(record_id) REFERENCES records(id) ON DELETE CASCADE
);
