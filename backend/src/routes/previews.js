import express from "express";
import { findTrackPreview } from "../providers/itunesClient.js";

const router = express.Router();

router.get("/search", async (req, res) => {
  const { artist, title, album = "", duration = "", ignore_album = "false" } = req.query;
  if ([artist, title].some((value) => typeof value !== "string" || !value.trim() || value.length > 300)
    || typeof album !== "string" || album.length > 300) {
    return res.status(400).json({ message: "Укажите исполнителя и название песни (до 300 символов)." });
  }
  if (typeof duration !== "string" || duration.length > 10 ||
    (duration.trim() && !/^(?:\d{1,3}:[0-5]\d|\d{1,2}:[0-5]\d:[0-5]\d)$/.test(duration.trim()))) {
    return res.status(400).json({ message: "Укажите длительность в формате М:СС или Ч:ММ:СС." });
  }
  if (ignore_album !== "true" && ignore_album !== "false") {
    return res.status(400).json({ message: "Параметр ignore_album должен быть true или false." });
  }

  try {
    const preview = await findTrackPreview({
      artist: artist.trim(), title: title.trim(), album: album.trim(), duration: duration.trim(),
      ignoreAlbum: ignore_album === "true",
    });
    res.json({ preview });
  } catch (error) {
    if (error.retryAfter) res.set("Retry-After", String(error.retryAfter));
    res.status(error.status || 502).json({ message: error.message });
  }
});

export default router;
