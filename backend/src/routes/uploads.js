import express from "express";
import path from "node:path";
import fs from "node:fs";
import multer from "multer";
import db from "../db/client.js";

const router = express.Router();
const uploadDir = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

const insertUploadStmt = db.prepare(`
  INSERT INTO uploads (record_id, file_path, mime_type)
  VALUES (@record_id, @file_path, @mime_type)
`);

router.post("/cover", upload.single("cover"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "File is required" });
  }

  const publicPath = `/uploads/${req.file.filename}`;
  insertUploadStmt.run({
    record_id: req.body.record_id ? Number(req.body.record_id) : null,
    file_path: publicPath,
    mime_type: req.file.mimetype,
  });

  return res.status(201).json({ cover_url: publicPath });
});

export default router;
