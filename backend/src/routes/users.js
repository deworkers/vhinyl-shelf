import express from "express";
import db from "../db/client.js";
import { requireAdmin } from "../auth/sessions.js";
import { deleteUploadFiles } from "../files/cleanup.js";

const router = express.Router();
router.use(requireAdmin);

router.get("/", (_req, res) => {
  const users = db.prepare(`SELECT users.id, username, role, blocked, users.created_at, COUNT(records.id) AS record_count
    FROM users LEFT JOIN records ON records.user_id = users.id GROUP BY users.id ORDER BY users.id`).all();
  res.json(users.map((user) => ({ ...user, blocked: Boolean(user.blocked) })));
});

router.param("id", (req, res, next, id) => {
  const user = /^\d+$/.test(id) && db.prepare("SELECT id, role FROM users WHERE id = ?").get(id);
  if (!user) return res.status(404).json({ message: "Пользователь не найден." });
  req.targetUser = user;
  next();
});

router.patch("/:id", (req, res) => {
  if (req.targetUser.role === "admin") return res.status(403).json({ message: "Нельзя заблокировать администратора." });
  if (typeof req.body.blocked !== "boolean" || Object.keys(req.body).some((key) => key !== "blocked")) {
    return res.status(400).json({ message: "Укажите blocked: true или false." });
  }
  db.transaction(() => {
    db.prepare("UPDATE users SET blocked = ? WHERE id = ?").run(Number(req.body.blocked), req.targetUser.id);
    if (req.body.blocked) db.prepare("DELETE FROM sessions WHERE user_id = ?").run(req.targetUser.id);
  })();
  return res.status(204).send();
});

router.delete("/:id/collection", (req, res) => {
  const uploads = db.prepare("SELECT file_path FROM uploads WHERE user_id = ?").all(req.targetUser.id);
  db.transaction(() => {
    db.prepare("DELETE FROM records WHERE user_id = ?").run(req.targetUser.id);
    db.prepare("DELETE FROM uploads WHERE user_id = ?").run(req.targetUser.id);
  })();
  deleteUploadFiles(uploads);
  return res.status(204).send();
});

router.delete("/:id", (req, res) => {
  if (req.targetUser.role === "admin") return res.status(403).json({ message: "Нельзя удалить администратора." });
  const uploads = db.prepare("SELECT file_path FROM uploads WHERE user_id = ?").all(req.targetUser.id);
  db.prepare("DELETE FROM users WHERE id = ?").run(req.targetUser.id);
  deleteUploadFiles(uploads);
  return res.status(204).send();
});

export default router;
