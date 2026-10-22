import express from "express";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
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
    const ext = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "image/avif": ".avif" }[file.mimetype];
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"].includes(file.mimetype)) {
      return cb(Object.assign(new Error("Допустимы JPG, PNG, WebP, GIF и AVIF."), { status: 400 }));
    }
    cb(null, true);
  },
});

const insertUploadStmt = db.prepare(`
  INSERT INTO uploads (user_id, record_id, file_path, mime_type)
  VALUES (@user_id, @record_id, @file_path, @mime_type)
`);

router.post("/cover", upload.single("cover"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "File is required" });
  }

  const reject = (status, message) => {
    fs.unlinkSync(req.file.path);
    return res.status(status).json({ message });
  };
  const user = db.prepare("SELECT blocked FROM users WHERE id = ?").get(req.user.id);
  if (!user || user.blocked) return reject(401, "Аккаунт недоступен.");
  let record = null;
  if (req.body.record_id) {
    if (!/^[1-9]\d*$/.test(req.body.record_id)) return reject(400, "Некорректная запись.");
    record = db.prepare("SELECT id, user_id FROM records WHERE id = ?").get(req.body.record_id);
    if (!record || (req.user.role !== "admin" && record.user_id !== req.user.id)) {
      return reject(404, "Запись не найдена.");
    }
  }

  const publicPath = `/uploads/${req.file.filename}`;
  insertUploadStmt.run({
    user_id: record?.user_id ?? req.user.id,
    record_id: record?.id ?? null,
    file_path: publicPath,
    mime_type: req.file.mimetype,
  });

  return res.status(201).json({ cover_url: publicPath });
});

export default router;
