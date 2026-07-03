import { pool, test, assert, assertEqual } from "../setup";
import { writeAuditLog } from "../../src/middleware/auditLog";
import { withOrgContext } from "../../src/db";
import * as http from "http";

const TEST_ORG_ID = 1; // bigint org_id (Phase 3: audit_log.org_id uuid → bigint)
const TEST_ACTOR_OID = "test-audit-oid-s1-1";

// MT-2 (ISSUE-057 seed repair): audit_log is fail-closed — a bare connection
// reads 0 rows, so every verification read below runs with org context set,
// exactly as the app does. The append-only assertions get STRONGER for it:
// with context set, a blocked UPDATE/DELETE proves the absence of an
// UPDATE/DELETE policy (true append-only), not merely row invisibility.
async function auditCtx(client: import("pg").PoolClient, orgId: number): Promise<void> {
  await client.query(`SELECT set_config('app.current_org_id', $1, false)`, [String(orgId)]);
}

async function releaseWithReset(client: import("pg").PoolClient): Promise<void> {
  try {
    await client.query(`SELECT set_config('app.current_org_id', '', false)`);
  } catch { /* best-effort */ }
  client.release();
}

test("audit_log: writeAuditLog inserts a row readable by the app role", async () => {
  const client = await pool.connect();
  try {
    await auditCtx(client, TEST_ORG_ID);
    await writeAuditLog({
      actor_oid: TEST_ACTOR_OID,
      org_id: TEST_ORG_ID,
      action: "auth.login",
      resource_type: "route",
      resource_id: "test-resource-1",
      detail: { test: true },
      ip_address: "127.0.0.1",
    });

    const res = await client.query(
      `SELECT id, actor_oid, org_id, action, resource_type, resource_id, detail, ip_address
       FROM audit_log
       WHERE actor_oid = $1 AND action = 'auth.login'
       ORDER BY occurred_at DESC LIMIT 1`,
      [TEST_ACTOR_OID]
    );

    assertEqual(res.rowCount, 1, "exactly one audit_log row inserted");
    const row = res.rows[0];
    assertEqual(row.actor_oid, TEST_ACTOR_OID, "actor_oid matches");
    assertEqual(Number(row.org_id), TEST_ORG_ID, "org_id matches");
    assertEqual(row.action, "auth.login", "action matches");
    assertEqual(row.resource_type, "route", "resource_type matches");
    assertEqual(row.resource_id, "test-resource-1", "resource_id matches");
    assert(row.detail?.test === true, "detail JSONB readable");
    assertEqual(row.ip_address, "127.0.0.1", "ip_address matches");
  } finally {
    await releaseWithReset(client);
  }
});

// PostgreSQL RLS with FORCE ROW LEVEL SECURITY silently filters rows for
// commands that have no matching policy — UPDATE and DELETE affect 0 rows
// rather than throwing a permission error. This is the correct append-only
// enforcement: the row survives and is verifiably unchanged.
test("audit_log: UPDATE is blocked by RLS — row survives unchanged", async () => {
  const client = await pool.connect();
  try {
    await auditCtx(client, TEST_ORG_ID);
    await writeAuditLog({
      actor_oid: TEST_ACTOR_OID,
      org_id: TEST_ORG_ID,
      action: "admin.config_change",
      detail: { key: "update_blocked_marker" },
    });

    const updateRes = await client.query(
      `UPDATE audit_log SET action = 'tampered'
       WHERE actor_oid = $1 AND action = 'admin.config_change'`,
      [TEST_ACTOR_OID]
    );
    assertEqual(updateRes.rowCount, 0, "UPDATE must affect 0 rows (blocked by RLS)");

    // Verify the original row is still intact.
    const checkRes = await client.query(
      `SELECT action FROM audit_log
       WHERE actor_oid = $1 AND action = 'admin.config_change'
       ORDER BY occurred_at DESC LIMIT 1`,
      [TEST_ACTOR_OID]
    );
    assert(checkRes.rowCount! > 0, "original row still exists after blocked UPDATE");
    assertEqual(checkRes.rows[0].action, "admin.config_change", "action value is unchanged");
  } finally {
    await releaseWithReset(client);
  }
});

test("audit_log: DELETE is blocked by RLS — row survives", async () => {
  const client = await pool.connect();
  try {
    await auditCtx(client, TEST_ORG_ID);
    await writeAuditLog({
      actor_oid: TEST_ACTOR_OID,
      org_id: TEST_ORG_ID,
      action: "export.data_export",
      detail: { key: "delete_blocked_marker" },
    });

    // Confirm the row exists before attempting delete.
    const beforeRes = await client.query(
      `SELECT id FROM audit_log
       WHERE actor_oid = $1 AND action = 'export.data_export'
       ORDER BY occurred_at DESC LIMIT 1`,
      [TEST_ACTOR_OID]
    );
    assert(beforeRes.rowCount! > 0, "row exists before DELETE attempt");
    const rowId = beforeRes.rows[0].id;

    const deleteRes = await client.query(
      `DELETE FROM audit_log WHERE id = $1`,
      [rowId]
    );
    assertEqual(deleteRes.rowCount, 0, "DELETE must affect 0 rows (blocked by RLS)");

    // Verify the row is still present.
    const afterRes = await client.query(
      `SELECT id FROM audit_log WHERE id = $1`,
      [rowId]
    );
    assertEqual(afterRes.rowCount, 1, "row still exists after blocked DELETE");
  } finally {
    await releaseWithReset(client);
  }
});

// ── S1-3 query logic tests ────────────────────────────────────────────────

const S13_ORG_ID = 99; // bigint org_id for S1-3 isolation tests
const S13_ACTOR = "test-s13-query-oid";

// ISSUE-057 (bucket A): audit_log now carries an FK to organizations(id)
// (ISSUE-053c) — the S1-3 isolation orgs must exist as real rows before audit
// rows can reference them. Idempotent; organizations has no RLS.
async function ensureS13Orgs(): Promise<void> {
  await pool.query(
    `INSERT INTO organizations (id, name, slug) VALUES
       (99, 's1-3-test-org-99', 's1-3-test-org-99'),
       (98, 's1-3-test-org-98', 's1-3-test-org-98')
     ON CONFLICT (id) DO NOTHING`,
  );
}

test("audit_log query: S1-3 date range and org filtering returns correct entries", async () => {
  await ensureS13Orgs();
  // Insert entries for the test org and one for a different org to confirm isolation.
  await writeAuditLog({ actor_oid: S13_ACTOR, org_id: S13_ORG_ID, action: "auth.login",       ip_address: "10.0.0.1" });
  await writeAuditLog({ actor_oid: S13_ACTOR, org_id: S13_ORG_ID, action: "admin.stop_edit",  ip_address: "10.0.0.2" });
  await writeAuditLog({ actor_oid: S13_ACTOR, org_id: 98, action: "auth.login", ip_address: "10.0.0.3" });

  const fromDate = new Date(Date.now() - 60 * 1000); // 1 minute ago
  const toDate   = new Date(Date.now() + 60 * 1000); // 1 minute from now

  const entries = await withOrgContext(S13_ORG_ID, async (client) => {
    const result = await client.query(
      `SELECT id, actor_oid, action, resource_type, resource_id, detail, ip_address, occurred_at
       FROM audit_log
       WHERE org_id = $1 AND occurred_at >= $2 AND occurred_at <= $3
       ORDER BY occurred_at DESC`,
      [S13_ORG_ID, fromDate.toISOString(), toDate.toISOString()],
    );
    return result.rows;
  });

  assert(entries.length >= 2, `expected at least 2 rows for test org, got ${entries.length}`);
  assert(
    entries.every((r: any) => r.actor_oid === S13_ACTOR),
    "all returned rows belong to S13_ACTOR",
  );
  // Cross-org row must not appear.
  assert(
    entries.every((r: any) => r.ip_address !== "10.0.0.3"),
    "cross-org entry must not appear in results",
  );
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("audit_log query: S1-3 action filter narrows results", async () => {
  await ensureS13Orgs();
  const fromDate = new Date(Date.now() - 60 * 1000);
  const toDate   = new Date(Date.now() + 60 * 1000);

  const entries = await withOrgContext(S13_ORG_ID, async (client) => {
    const result = await client.query(
      `SELECT id, actor_oid, action, ip_address, occurred_at
       FROM audit_log
       WHERE org_id = $1 AND occurred_at >= $2 AND occurred_at <= $3 AND action = $4
       ORDER BY occurred_at DESC`,
      [S13_ORG_ID, fromDate.toISOString(), toDate.toISOString(), "admin.stop_edit"],
    );
    return result.rows;
  });

  assert(entries.length >= 1, "action filter must return at least the seeded stop_edit row");
  assert(
    entries.every((r: any) => r.action === "admin.stop_edit"),
    "action filter: all rows match the requested action",
  );
});

// ── admin.audit_log_read meta-trigger shape tests ─────────────────────────────

const META_ORG_ID = 1;

test("audit_log meta-trigger: JSON read writes entry with correct shape", async () => {
  const actor = `meta-trigger-json-${Date.now()}`;
  await writeAuditLog({
    actor_oid: actor,
    org_id: META_ORG_ID,
    action: "admin.audit_log_read",
    resource_type: "audit_log",
    detail: {
      query_from: "2026-04-01T00:00:00.000Z",
      query_to: "2026-05-01T00:00:00.000Z",
      action_filter: null,
      format: "json",
      result_count: 42,
    },
  });

  const res = await withOrgContext(META_ORG_ID, (client) =>
    client.query(
      `SELECT action, resource_type, resource_id, detail
       FROM audit_log WHERE actor_oid = $1 ORDER BY occurred_at DESC LIMIT 1`,
      [actor],
    ),
  );
  assertEqual(res.rowCount, 1, "exactly one row written");
  const row = res.rows[0];
  assertEqual(row.action, "admin.audit_log_read", "action matches");
  assertEqual(row.resource_type, "audit_log", "resource_type is audit_log");
  assertEqual(row.resource_id, null, "resource_id is null");
  assertEqual(row.detail?.format, "json", "detail.format is json");
  assertEqual(row.detail?.result_count, 42, "detail.result_count matches");
  assert("query_from" in row.detail, "detail has query_from key");
  assert("query_to" in row.detail, "detail has query_to key");
  assert("action_filter" in row.detail, "detail has action_filter key");
  assertEqual(row.detail?.action_filter, null, "detail.action_filter is null when no filter");
});

test("audit_log meta-trigger: CSV read writes entry with correct shape", async () => {
  const actor = `meta-trigger-csv-${Date.now()}`;
  await writeAuditLog({
    actor_oid: actor,
    org_id: META_ORG_ID,
    action: "admin.audit_log_read",
    resource_type: "audit_log",
    detail: {
      query_from: "2026-04-01T00:00:00.000Z",
      query_to: "2026-05-01T00:00:00.000Z",
      action_filter: "auth.login",
      format: "csv",
      result_count: 7,
    },
  });

  const res = await withOrgContext(META_ORG_ID, (client) =>
    client.query(
      `SELECT action, resource_type, resource_id, detail
       FROM audit_log WHERE actor_oid = $1 ORDER BY occurred_at DESC LIMIT 1`,
      [actor],
    ),
  );
  assertEqual(res.rowCount, 1, "exactly one row written");
  const row = res.rows[0];
  assertEqual(row.action, "admin.audit_log_read", "action matches");
  assertEqual(row.resource_type, "audit_log", "resource_type is audit_log");
  assertEqual(row.resource_id, null, "resource_id is null");
  assertEqual(row.detail?.format, "csv", "detail.format is csv");
  assertEqual(row.detail?.result_count, 7, "detail.result_count matches");
  assertEqual(row.detail?.action_filter, "auth.login", "detail.action_filter preserved when set");
});

test("audit_log meta-trigger: failed request (invalid date) does not write entry", async () => {
  const { app } = await import("../../src/app");
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as any).port;

  const marker = `audit-read-fail-${Date.now()}`;

  // Request with invalid 'from' date — handler returns 400 before auditWrite is called.
  await new Promise<void>((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/admin/audit-log?from=not-a-date",
        headers: {
          "x-dev-user-oid": marker,
          "x-dev-user-roles": "Admin",
          "x-dev-user-org-id": "1",
        },
      },
      (res) => {
        res.resume();
        res.on("end", resolve);
      },
    );
    req.on("error", reject);
    req.end();
  });

  // Allow time for any fire-and-forget write to land (proves none was fired).
  await sleep(300);

  const check = await withOrgContext(META_ORG_ID, (client) =>
    client.query(
      `SELECT COUNT(*)::int AS ct FROM audit_log
       WHERE actor_oid = $1 AND action = 'admin.audit_log_read'`,
      [marker],
    ),
  );
  assertEqual(check.rows[0].ct, 0, "no audit_log_read entry written for a failed request");

  await new Promise<void>((resolve) => server.close(resolve));
});
