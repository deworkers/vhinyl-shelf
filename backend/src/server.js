import path from "node:path";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import morgan from "morgan";
import discogsRoutes from "./routes/discogs.js";
import recordsRoutes from "./routes/records.js";
import uploadsRoutes from "./routes/uploads.js";
import previewsRoutes from "./routes/previews.js";
import authRoutes from "./routes/auth.js";
import usersRoutes from "./routes/users.js";
import db from "./db/client.js";
import { requireAuth } from "./auth/sessions.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3001);

app.disable("x-powered-by");
app.set("trust proxy", Number(process.env.TRUST_PROXY || 0));
const allowedOrigins = process.env.APP_ORIGIN ? [process.env.APP_ORIGIN]
  : process.env.NODE_ENV === "production" ? [] : ["http://localhost:5173", "http://127.0.0.1:5173"];
app.use(cors({ origin: allowedOrigins, credentials: true, allowedHeaders: ["Content-Type", "X-Requested-With"] }));
app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.get("X-Requested-With") !== "VinylShelf") {
    return res.status(403).json({ message: "Отсутствует защитный заголовок запроса." });
  }
  if (req.body === undefined) req.body = {};
  next();
});
app.use(morgan("dev"));
app.use("/uploads", requireAuth, (req, res, next) => {
  const upload = db.prepare("SELECT user_id FROM uploads WHERE file_path = ?").get(`/uploads${req.path}`);
  if (!upload || (req.user.role !== "admin" && upload.user_id !== req.user.id)) {
    return res.status(404).json({ message: "Обложка не найдена." });
  }
  next();
}, express.static(path.resolve(process.cwd(), "uploads")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", requireAuth, usersRoutes);
app.use("/api/discogs", requireAuth, discogsRoutes);
app.use("/api/records", requireAuth, recordsRoutes);
app.use("/api/uploads", requireAuth, uploadsRoutes);
app.use("/api/previews", requireAuth, previewsRoutes);

app.use((err, _req, res, _next) => {
  if (err.status === 429 && err.rateLimit) {
    return res.status(429).json({
      message: "Discogs rate limit reached. Please retry in a minute.",
      rateLimit: err.rateLimit ?? null,
    });
  }
  return res.status(err.status || 500).json({
    message: err.message || "Internal server error",
    details: err.details || null,
  });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend API running at http://localhost:${port}`);
});
