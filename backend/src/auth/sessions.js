import { createHash, randomBytes } from "node:crypto";
import db from "../db/client.js";

const cookieName = "vinyl_session";
const lifetime = 7 * 24 * 60 * 60 * 1000;
const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.COOKIE_SECURE === "true" || (process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false"),
  path: "/",
};

function tokenHash(req) {
  const token = req.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  return token ? createHash("sha256").update(token).digest("hex") : null;
}

export function publicUser(user) {
  return { id: user.id, username: user.username, role: user.role, blocked: Boolean(user.blocked), created_at: user.created_at };
}

export function destroySession(req, res) {
  const hash = tokenHash(req);
  if (hash) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash);
  res.clearCookie(cookieName, cookieOptions);
}

export function createSession(req, res, userId) {
  destroySession(req, res);
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
  const token = randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .run(createHash("sha256").update(token).digest("hex"), userId, Date.now() + lifetime);
  res.cookie(cookieName, token, { ...cookieOptions, maxAge: lifetime });
}

export function requireAuth(req, res, next) {
  res.set("Cache-Control", "no-store");
  const hash = tokenHash(req);
  const user = hash && db.prepare(`SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?`).get(hash, Date.now());
  if (!user || user.blocked) {
    destroySession(req, res);
    return res.status(401).json({ message: "Войдите в аккаунт. Возможно, сессия истекла или аккаунт заблокирован." });
  }
  req.user = user;
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Доступно только администратору." });
  next();
}

export function collectionOwner(req, res, next) {
  const requested = req.query.user_id;
  if (requested !== undefined) {
    if (req.user.role !== "admin") return res.status(403).json({ message: "Нет доступа к чужой коллекции." });
    if (typeof requested !== "string" || !/^[1-9]\d*$/.test(requested) || !Number.isSafeInteger(Number(requested))) {
      return res.status(400).json({ message: "Некорректный пользователь." });
    }
    if (!db.prepare("SELECT id FROM users WHERE id = ?").get(Number(requested))) {
      return res.status(404).json({ message: "Пользователь не найден." });
    }
  }
  req.ownerId = requested === undefined ? req.user.id : Number(requested);
  next();
}

export function authRateLimit(req, res, next) {
  const now = Date.now();
  db.prepare("DELETE FROM auth_attempts WHERE resets_at <= ?").run(now);
  const key = req.ip;
  db.prepare(`INSERT INTO auth_attempts (key, attempts, resets_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET attempts = attempts + 1`).run(key, now + 15 * 60 * 1000);
  const attempt = db.prepare("SELECT * FROM auth_attempts WHERE key = ?").get(key);
  if (attempt.attempts > 30) {
    res.set("Retry-After", String(Math.ceil((attempt.resets_at - now) / 1000)));
    return res.status(429).json({ message: "Слишком много попыток. Повторите позже." });
  }
  next();
}
