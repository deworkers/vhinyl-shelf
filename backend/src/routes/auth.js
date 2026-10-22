import express from "express";
import db from "../db/client.js";
import { hashPassword, verifyPassword, validUsername, validPassword } from "../auth/passwords.js";
import { authRateLimit, createSession, destroySession, publicUser, requireAuth } from "../auth/sessions.js";

const router = express.Router();
router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

router.post("/register", authRateLimit, async (req, res) => {
  const { username, password } = req.body;
  if (!validUsername(username) || !validPassword(password)) {
    return res.status(400).json({ message: "Логин: 3–40 латинских букв, цифр или _.-. Пароль: 12–128 символов." });
  }
  const hash = await hashPassword(password);
  try {
    const result = db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run(username, hash);
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
    createSession(req, res, user.id);
    return res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return res.status(409).json({ message: "Этот логин уже занят." });
    throw error;
  }
});

router.post("/login", authRateLimit, async (req, res) => {
  const { username, password } = req.body;
  if (!validUsername(username) || typeof password !== "string" || !password.length || password.length > 128) {
    return res.status(400).json({ message: "Укажите корректные логин и пароль." });
  }
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  const matches = await verifyPassword(password, user?.password_hash);
  // Re-read after hashing so a concurrent admin block/delete cannot issue a session.
  const current = user && db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
  if (!matches || !current || current.blocked || current.password_hash !== user.password_hash) {
    return res.status(401).json({ message: "Неверный логин, пароль или аккаунт заблокирован." });
  }
  createSession(req, res, current.id);
  return res.json({ user: publicUser(current) });
});

router.get("/me", requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));
router.post("/logout", (req, res) => { destroySession(req, res); res.status(204).send(); });

router.patch("/password", requireAuth, authRateLimit, async (req, res) => {
  const { current_password: currentPassword, password } = req.body;
  if (typeof currentPassword !== "string" || currentPassword.length > 128 || !validPassword(password)) {
    return res.status(400).json({ message: "Укажите текущий пароль и новый пароль длиной 12–128 символов." });
  }
  if (!await verifyPassword(currentPassword, req.user.password_hash)) {
    return res.status(400).json({ message: "Текущий пароль неверен." });
  }
  const hash = await hashPassword(password);
  const current = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (!current || current.blocked || current.password_hash !== req.user.password_hash) {
    return res.status(401).json({ message: "Сессия больше недействительна. Войдите заново." });
  }
  db.transaction(() => {
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, current.id);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(current.id);
    createSession(req, res, current.id);
  })();
  return res.status(204).send();
});

export default router;
