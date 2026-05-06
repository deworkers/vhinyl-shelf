import express from "express";
import { discogsFetch } from "../providers/discogsClient.js";

const router = express.Router();

router.get("/search", async (req, res, next) => {
  try {
    const {
      q,
      release_title,
      artist,
      format = "Vinyl",
      page = "1",
      per_page = "12",
      type = "release",
    } = req.query;

    const { data, rateLimit } = await discogsFetch("/database/search", {
      q,
      release_title,
      artist,
      format,
      page,
      per_page,
      type,
    });

    res.json({ ...data, rateLimit });
  } catch (error) {
    next(error);
  }
});

router.get("/releases/:releaseId", async (req, res, next) => {
  try {
    const { releaseId } = req.params;
    const { data, rateLimit } = await discogsFetch(`/releases/${releaseId}`);
    res.json({ ...data, rateLimit });
  } catch (error) {
    next(error);
  }
});

export default router;
