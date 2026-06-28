import "dotenv/config";
import { app } from "./app";
import { assertCipherOperational } from "./lib/oidCipher";

/** ── Server start ─────────────────────────────────────────────────────── */
const PORT = Number(process.env.PORT) || 4000;

async function start(): Promise<void> {
  // ISSUE-045 (Option 2 — fail-closed boot): in production, refuse to start if the
  // OID-at-rest cipher adapter cannot wrap/unwrap a DEK (the Azure Key Vault path
  // is a throwing stub until Azure standup). Encrypted-identity-at-rest must never
  // be silently off. No-op outside production.
  try {
    await assertCipherOperational();
  } catch (err) {
    console.error(`[FATAL] ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`);
  });
}

void start();