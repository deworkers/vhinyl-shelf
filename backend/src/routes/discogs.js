import express from "express";
import { discogsFetch } from "../providers/discogsClient.js";

const router = express.Router();

router.get("/search", async (req, res, next) => {
  try {
    const {
      q,
      release_title,
      artist,
      barcode,
      format = "Vinyl",
      page = "1",
      per_page = "12",
      type = "release",
    } = req.query;

    const normalizedBarcode =
      typeof barcode === "string" ? barcode.replace(/[\s-]/g, "") : barcode;
    if (
      barcode !== undefined &&
      (typeof normalizedBarcode !== "string" ||
        !/^(?:\d{8}|\d{12,13})$/.test(normalizedBarcode) ||
        /^0+$/.test(normalizedBarcode))
    ) {
      return res.status(400).json({
        message: "Введите штрихкод EAN/UPC: 8, 12 или 13 цифр.",
      });
    }

    const { data, rateLimit } = await discogsFetch("/database/search", {
      q,
      release_title,
      artist,
      barcode: normalizedBarcode,
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
