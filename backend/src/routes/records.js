import express from "express";
import db from "../db/client.js";
import { resolveCoverUrl } from "../providers/discogsClient.js";

const router = express.Router();

const listStmt = db.prepare(`
  SELECT * FROM records
  WHERE (@status IS NULL OR status = @status)
  ORDER BY datetime(created_at) DESC
`);
const getByIdStmt = db.prepare("SELECT * FROM records WHERE id = ?");
const getByDiscogsIdStmt = db.prepare(
  "SELECT * FROM records WHERE discogs_release_id = ?"
);

const insertStmt = db.prepare(`
  INSERT INTO records (
    source, discogs_release_id, status, title, artist, year, label, format,
    cover_url, notes, payload_json, spotify_preview_url
  ) VALUES (
    @source, @discogs_release_id, @status, @title, @artist, @year, @label, @format,
    @cover_url, @notes, @payload_json, @spotify_preview_url
  )
`);

const updateStmt = db.prepare(`
  UPDATE records
  SET status = COALESCE(@status, status),
      notes = COALESCE(@notes, notes),
      cover_url = COALESCE(@cover_url, cover_url),
      updated_at = datetime('now')
  WHERE id = @id
`);
const deleteStmt = db.prepare("DELETE FROM records WHERE id = ?");

function mapDiscogsToRecord(payload, status) {
  const artist =
    payload?.artists?.map((item) => item.name).join(", ") ||
    payload?.title?.split(" - ")?.[0] ||
    "Unknown Artist";
  const label = payload?.labels?.[0]?.name || payload?.label?.[0] || null;
  const format = payload?.formats?.[0]?.name || payload?.format?.[0] || null;

  return {
    source: "discogs",
    discogs_release_id: payload.id,
    status,
    title: payload.title || "Untitled",
    artist,
    year: String(payload.year || payload.released || ""),
    label,
    format,
    cover_url: resolveCoverUrl(payload),
    notes: "",
    payload_json: JSON.stringify(payload),
    spotify_preview_url: null,
  };
}

router.get("/", (req, res) => {
  const status = req.query.status || null;
  const rows = listStmt.all({ status });
  res.json(rows);
});

router.get("/:id", (req, res) => {
  const row = getByIdStmt.get(req.params.id);
  if (!row) {
    return res.status(404).json({ message: "Record not found" });
  }
  return res.json(row);
});

router.post("/", (req, res) => {
  const { source, status, discogsPayload, manual } = req.body;

  if (!status || !["my_collection", "want_to_buy"].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  let recordToSave;
  if (source === "discogs") {
    if (!discogsPayload?.id) {
      return res.status(400).json({ message: "discogsPayload.id is required" });
    }
    const existing = getByDiscogsIdStmt.get(discogsPayload.id);
    if (existing) {
      return res.status(409).json({ message: "Release already added", record: existing });
    }
    recordToSave = mapDiscogsToRecord(discogsPayload, status);
  } else if (source === "manual") {
    if (!manual?.title || !manual?.artist) {
      return res.status(400).json({ message: "Manual title and artist are required" });
    }
    recordToSave = {
      source: "manual",
      discogs_release_id: null,
      status,
      title: manual.title,
      artist: manual.artist,
      year: manual.year || "",
      label: manual.label || "",
      format: manual.format || "Vinyl",
      cover_url: manual.cover_url || null,
      notes: manual.notes || "",
      payload_json: JSON.stringify({
        title: manual.title,
        artist: manual.artist,
        tracklist: manual.tracklist || [],
        notes: manual.description || "",
      }),
      spotify_preview_url: null,
    };
  } else {
    return res.status(400).json({ message: "Invalid source. Use discogs or manual" });
  }

  const result = insertStmt.run(recordToSave);
  const created = getByIdStmt.get(result.lastInsertRowid);
  return res.status(201).json(created);
});

router.patch("/:id", (req, res) => {
  const { status, notes, cover_url } = req.body;
  if (status && !["my_collection", "want_to_buy"].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }
  const result = updateStmt.run({
    id: req.params.id,
    status: status ?? null,
    notes: notes ?? null,
    cover_url: cover_url ?? null,
  });
  if (!result.changes) {
    return res.status(404).json({ message: "Record not found" });
  }
  return res.json(getByIdStmt.get(req.params.id));
});

router.delete("/:id", (req, res) => {
  const result = deleteStmt.run(req.params.id);
  if (!result.changes) {
    return res.status(404).json({ message: "Record not found" });
  }
  return res.status(204).send();
});

export default router;
