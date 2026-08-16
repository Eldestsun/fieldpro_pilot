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
  return runWithOrgContext(client, orgId, fn);
}

async function runWithOrgContext<T>(
  client: PoolClient,
  orgId: number | string | bigint,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
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

// ── Q-F (ISSUE-031) / ISSUE-028 — the audit/export identity channel ──────────
// Worker-identity reads for the export channel (exportDeleteRoutes, sftpExport)
// go through a dedicated pool connecting as `audit_reader` — the grant-scoped
// role whose posture is owned by 20260816_issue028_audit_reader_grant_provision.
// FAIL-CLOSED: if the channel is unconfigured (no AUDIT_READER_PASSWORD /
// AUDIT_READER_DATABASE_URL), building the pool THROWS. There is deliberately
// no fallback to the app pool — a silent fieldpro fallback would nullify the
// grant boundary this channel exists to make runtime-binding.
// Credential is environment-owned (dev: backend/.env; CI: throwaway per-run
// password in the workflow, precedent = fieldpro_test) — never in git.
let auditPool: Pool | null = null;

export function getAuditPool(): Pool {
  if (auditPool) return auditPool;

  const explicitUrl = process.env.AUDIT_READER_DATABASE_URL;
  if (explicitUrl) {
    auditPool = new Pool({ connectionString: explicitUrl });
    return auditPool;
  }

  const password = process.env.AUDIT_READER_PASSWORD;
  if (!password) {
    throw new Error(
      "[audit channel] AUDIT_READER_PASSWORD (or AUDIT_READER_DATABASE_URL) is not set. " +
      "The export channel reads worker identity ONLY as audit_reader (ISSUE-028/Q-F) " +
      "and never falls back to the app role. Set the credential (see backend/.env.example)."
    );
  }

  if (process.env.DATABASE_URL) {
    // Same server/database as the app pool; only the identity of the connection
    // changes. URL parse keeps host/port/db/query in lockstep with DATABASE_URL.
    const u = new URL(process.env.DATABASE_URL);
    u.username = "audit_reader";
    u.password = password;
    auditPool = new Pool({ connectionString: u.toString() });
    return auditPool;
  }

  auditPool = new Pool({
    host:     process.env.PGHOST     ?? "localhost",
    port:     Number(process.env.PGPORT ?? 5432),
    user:     "audit_reader",
    password,
    database: process.env.PGDATABASE ?? "fieldpro_db",
  });
  return auditPool;
}

// Org-scoped checkout on the audit channel. The sidecars are FORCE RLS
// (PATTERN-001): without app.current_org_id an audit_reader read silently
// returns zero rows, so this wrapper is the ONLY sanctioned way to read them.
export async function withAuditOrgContext<T>(
  orgId: number | string | bigint,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  if (orgId === null || orgId === undefined || orgId === "") {
    throw new Error("withAuditOrgContext: orgId is required");
  }
  const client = await getAuditPool().connect();
  return runWithOrgContext(client, orgId, fn);
}
