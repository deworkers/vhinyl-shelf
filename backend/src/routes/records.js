import express from "express";
import db from "../db/client.js";
import { resolveCoverUrl } from "../providers/discogsClient.js";
import { collectionOwner } from "../auth/sessions.js";
import { deleteUploadFiles } from "../files/cleanup.js";

const router = express.Router();

const listStmt = db.prepare(`
  SELECT * FROM records
  WHERE user_id = @user_id AND (@status IS NULL OR status = @status)
  ORDER BY datetime(created_at) DESC
`);
const getByIdStmt = db.prepare("SELECT * FROM records WHERE id = ?");
const getByDiscogsIdStmt = db.prepare(
  "SELECT * FROM records WHERE user_id = ? AND discogs_release_id = ?"
);

const insertStmt = db.prepare(`
  INSERT INTO records (
    user_id, source, discogs_release_id, status, title, artist, year, label, format,
    cover_url, notes, payload_json, spotify_preview_url
  ) VALUES (
    @user_id, @source, @discogs_release_id, @status, @title, @artist, @year, @label, @format,
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

router.get("/", collectionOwner, (req, res) => {
  const status = req.query.status || null;
  if (status !== null && !["my_collection", "want_to_buy"].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }
  const rows = listStmt.all({ status, user_id: req.ownerId });
  res.json(rows);
});

router.param("id", (req, res, next, id) => {
  const row = /^\d+$/.test(id) && getByIdStmt.get(id);
  if (!row || (req.user.role !== "admin" && row.user_id !== req.user.id)) {
    return res.status(404).json({ message: "Record not found" });
  }
  req.record = row;
  next();
});

router.get("/:id", (req, res) => res.json(req.record));

router.post("/", collectionOwner, (req, res) => {
  const { source, status, discogsPayload, manual } = req.body;

  if (!status || !["my_collection", "want_to_buy"].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  let recordToSave;
  if (source === "discogs") {
    if (!Number.isSafeInteger(discogsPayload?.id) || discogsPayload.id <= 0) {
      return res.status(400).json({ message: "discogsPayload.id is required" });
    }
    const existing = getByDiscogsIdStmt.get(req.ownerId, discogsPayload.id);
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

  const result = insertStmt.run({ ...recordToSave, user_id: req.ownerId });
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
  const uploads = db.prepare("SELECT file_path FROM uploads WHERE record_id = ?").all(req.params.id);
  const result = deleteStmt.run(req.params.id);
  if (!result.changes) {
    return res.status(404).json({ message: "Record not found" });
  }
  deleteUploadFiles(uploads);
  return res.status(204).send();
});

export default router;
