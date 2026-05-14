/**
 * backfillOidEncryption.ts
 *
 * Backfill script for S1-13.
 *
 * Reads all core.visits rows where actor_oid is non-null and
 * captured_by_oid_ciphertext is still null, encrypts each OID
 * using the oidCipher module, and writes both ciphertext columns.
 *
 * Run once after the 20260513_s1_13_oid_encryption.sql migration:
 *   PGPASSWORD=fieldpro_pass \
 *   DEV_OID_KEY=<your-key> \
 *   pnpm ts-node scripts/backfillOidEncryption.ts
 *
 * Safe to re-run: rows with captured_by_oid_ciphertext already set
 * are skipped. Processes in batches of 500 to limit transaction size.
 */

import "dotenv/config";
import { Pool } from "pg";
import { encrypt } from "../src/lib/oidCipher";

const BATCH_SIZE = 500;

function buildPool(): Pool {
  return process.env.DATABASE_URL
    ? new Pool({ connectionString: process.env.DATABASE_URL })
    : new Pool({
        host:     process.env.PGHOST     ?? "localhost",
        port:     Number(process.env.PGPORT ?? 5432),
        user:     process.env.PGUSER     ?? "fieldpro",
        password: process.env.PGPASSWORD ?? "fieldpro_pass",
        database: process.env.PGDATABASE ?? "fieldpro_db",
      });
}

async function main(): Promise<void> {
  const pool = buildPool();
  let totalUpdated = 0;

  console.log("S1-13 OID encryption backfill starting…");

  try {
    while (true) {
      const client = await pool.connect();
      let batchCount = 0;

      try {
        await client.query("BEGIN");

        const rows = await client.query<{ id: number; actor_oid: string }>(
          `SELECT id, actor_oid
           FROM core.visits
           WHERE actor_oid IS NOT NULL
             AND captured_by_oid_ciphertext IS NULL
           LIMIT $1
           FOR UPDATE SKIP LOCKED`,
          [BATCH_SIZE],
        );

        if (rows.rowCount === 0) {
          await client.query("ROLLBACK");
          break;
        }

        for (const row of rows.rows) {
          const { ciphertext, keyId } = await encrypt(row.actor_oid, "backfill");
          await client.query(
            `UPDATE core.visits
             SET captured_by_oid_ciphertext = $1,
                 captured_by_oid_key_id     = $2
             WHERE id = $3`,
            [ciphertext, keyId, row.id],
          );
          batchCount++;
        }

        await client.query("COMMIT");
        totalUpdated += batchCount;
        console.log(`  batch committed: ${batchCount} rows (total so far: ${totalUpdated})`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }

  console.log(`Backfill complete. ${totalUpdated} rows encrypted.`);
}

main().catch((err) => {
  console.error("Backfill failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
