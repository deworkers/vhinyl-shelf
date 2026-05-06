import path from "node:path";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import morgan from "morgan";
import discogsRoutes from "./routes/discogs.js";
import recordsRoutes from "./routes/records.js";
import uploadsRoutes from "./routes/uploads.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3001);

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/discogs", discogsRoutes);
app.use("/api/records", recordsRoutes);
app.use("/api/uploads", uploadsRoutes);

app.use((err, _req, res, _next) => {
  if (err.status === 429) {
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
