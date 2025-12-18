import "dotenv/config";
import { app } from "./app";

/** ── Server start ─────────────────────────────────────────────────────── */
const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});