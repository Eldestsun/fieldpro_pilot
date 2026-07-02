import fs from "fs";
import path from "path";
import { Client } from "pg";

// Relative to dist/scripts/ at runtime, or src/scripts/ via ts-node
const MIGRATIONS_DIR = path.resolve(__dirname, "../../migrations");

// When this file is applied, all legacy_* migrations are skipped automatically.
const CONSOLIDATED_SCHEMA = "00000000_consolidated_schema.sql";

const CREATE_TRACKING_TABLE = `
  CREATE TABLE IF NOT EXISTS public.schema_migrations (
    filename   text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  );
`;

// ISSUE-041 (deploy-wiring): migrations/DDL run as the PROVISIONER role
// (fieldpro_admin — BYPASSRLS, member of fieldpro), NOT as the runtime app role.
// The app's pool (backend/src/db.ts) keeps connecting as the non-super `fieldpro`
// so RLS enforces on the app path. We read PGADMIN_*/PGADMIN_DATABASE_URL when set
// and fall back to the PG*/DATABASE_URL the app uses — so environments that have
// not provisioned a separate admin role (e.g. CI, which already runs migrations as
// a privileged role) are completely unchanged.
function buildClientConfig() {
  const adminUrl = process.env.PGADMIN_DATABASE_URL || process.env.DATABASE_URL;
  if (adminUrl) {
    return { connectionString: adminUrl };
  }
  return {
    host: process.env.PGHOST || "localhost",
    port: parseInt(process.env.PGPORT || "5432", 10),
    user: process.env.PGADMIN_USER || process.env.PGUSER,
    password: process.env.PGADMIN_PASSWORD || process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
  };
}

async function getApplied(client: Client): Promise<Set<string>> {
  const result = await client.query<{ filename: string }>(
    "SELECT filename FROM public.schema_migrations"
  );
  return new Set(result.rows.map((r) => r.filename));
}

async function main() {
  const client = new Client(buildClientConfig());
  await client.connect();

  try {
    // NI-3: expose the dev-only mcp_readonly login secret to SQL migrations as a
    // session GUC (plain-SQL migrations cannot read process.env). Parameterized,
    // so the secret never appears in SQL text. Absent env var → empty GUC → the
    // env-gated LOGIN migration takes its NOLOGIN (prod) path. See
    // migrations/20260701_ni3_mcp_readonly_login_env_gated.sql for the gate.
    await client.query(
      "SELECT set_config('app.mcp_readonly_password', $1, false)",
      [process.env.MCP_READONLY_PASSWORD || ""]
    );

    await client.query(CREATE_TRACKING_TABLE);

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const applied = await getApplied(client);

    // Build an augmented set that also covers renamed files.
    // If the DB has "20251130_base_schema.sql" recorded (old pre-rename name),
    // treat "legacy_20251130_base_schema.sql" as already applied so we never
    // try to re-run migration content that the DB already has.
    const effectivelyApplied = new Set(applied);
    for (const f of applied) {
      effectivelyApplied.add(`legacy_${f}`);
    }

    // Consolidated is applied if: (a) explicitly recorded, or (b) the DB has
    // pre-rename entries that map to legacy_ files — meaning the old per-file
    // sequence ran and the DB already has the schema those files produced.
    const hasPreRenameEntries = files.some(
      (f) => f.startsWith("legacy_") && applied.has(f.slice("legacy_".length))
    );
    let consolidatedApplied =
      applied.has(CONSOLIDATED_SCHEMA) || hasPreRenameEntries;

    for (const filename of files) {
      if (effectivelyApplied.has(filename)) {
        console.log(`  skip  ${filename}`);
        continue;
      }

      // On fresh deployments, skip all legacy migrations once the
      // consolidated schema has been applied — they are already captured in it.
      if (consolidatedApplied && filename.startsWith("legacy_")) {
        console.log(`  skip  ${filename} (legacy)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf8");

      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          "INSERT INTO public.schema_migrations (filename) VALUES ($1)",
          [filename]
        );
        await client.query("COMMIT");
        console.log(`  apply ${filename}`);

        if (filename === CONSOLIDATED_SCHEMA) {
          consolidatedApplied = true;
        }

        // ISSUE-038: a migration can record OTHER migrations as applied. The
        // reconcile migration 00000001_reconcile_issue038_record_canon_drift.sql
        // inserts the 11 hand-applied ISSUE-031 canon files into schema_migrations
        // (gated on each one's already-present effect) so the runner SKIPS them
        // instead of re-running. Re-running them as the app role `fieldpro` would
        // either error on object ownership (CREATE SCHEMA / view / grant owned by
        // postgres) or, worse, re-materialize stop_status_mv to ZERO rows under
        // RLS. The applied-set is snapshotted once before the loop, so refresh it
        // after each apply to honor rows a migration recorded; otherwise the loop
        // re-runs an already-applied migration and collides. Cheap — only runs
        // after an actual apply, of which there are few per run.
        for (const recorded of await getApplied(client)) {
          effectivelyApplied.add(recorded);
          effectivelyApplied.add(`legacy_${recorded}`);
        }
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`  FAIL  ${filename}`);
        console.error(err instanceof Error ? err.message : err);
        process.exit(1);
      }
    }

    console.log("Migration run complete.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
