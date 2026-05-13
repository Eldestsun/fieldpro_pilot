import { Pool, PoolClient } from "pg";

export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Pool({
      host:     process.env.PGHOST     ?? "localhost",
      port:     Number(process.env.PGPORT ?? 5432),
      user:     process.env.PGUSER     ?? "fieldpro",
      password: process.env.PGPASSWORD ?? "fieldpro_pass",
      database: process.env.PGDATABASE ?? "fieldpro_db",
    });

// Tier 7 — Row Level Security wrapper.
// Sets app.current_org_id for the lifetime of the checkout so policies on
// core.* tables filter every query by tenant. The variable is cleared on
// release so a pooled connection cannot leak org context into the next
// request that forgets to call this wrapper.
export async function withOrgContext<T>(
  orgId: number | string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  if (orgId === null || orgId === undefined || orgId === "") {
    throw new Error("withOrgContext: orgId is required");
  }
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.current_org_id', $1, false)`, [
      String(orgId),
    ]);
    return await fn(client);
  } finally {
    try {
      await client.query(`SELECT set_config('app.current_org_id', '', false)`);
    } catch {
      // best-effort reset; release will still return client to pool
    }
    client.release();
  }
}
