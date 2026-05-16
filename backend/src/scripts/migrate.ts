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

function buildClientConfig() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }
  return {
    host: process.env.PGHOST || "localhost",
    port: parseInt(process.env.PGPORT || "5432", 10),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
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
    await client.query(CREATE_TRACKING_TABLE);

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const applied = await getApplied(client);
    let consolidatedApplied = applied.has(CONSOLIDATED_SCHEMA);

    for (const filename of files) {
      if (applied.has(filename)) {
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
