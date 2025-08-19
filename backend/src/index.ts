import express from "express";
import cors from "cors";

const app = express();

// only allow your Vite dev server during local dev (least-privilege CORS)
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());

// ✅ keep the /api path so frontend can call /api/* via proxy
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "fieldpro-backend" });
});

// use 5000 to match our docs and proxy examples
const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
