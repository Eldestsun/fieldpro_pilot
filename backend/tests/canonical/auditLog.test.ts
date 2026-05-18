import { pool, test, assert, assertEqual } from "../setup";
import { writeAuditLog } from "../../src/middleware/auditLog";
import { withOrgContext } from "../../src/db";

const TEST_ORG_ID = 1; // bigint org_id (Phase 3: audit_log.org_id uuid → bigint)
const TEST_ACTOR_OID = "test-audit-oid-s1-1";

test("audit_log: writeAuditLog inserts a row readable by the app role", async () => {
  const client = await pool.connect();
  try {
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
    client.release();
  }
});

// PostgreSQL RLS with FORCE ROW LEVEL SECURITY silently filters rows for
// commands that have no matching policy — UPDATE and DELETE affect 0 rows
// rather than throwing a permission error. This is the correct append-only
// enforcement: the row survives and is verifiably unchanged.
test("audit_log: UPDATE is blocked by RLS — row survives unchanged", async () => {
  const client = await pool.connect();
  try {
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
    client.release();
  }
});

test("audit_log: DELETE is blocked by RLS — row survives", async () => {
  const client = await pool.connect();
  try {
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
    client.release();
  }
});

// ── S1-3 query logic tests ────────────────────────────────────────────────

const S13_ORG_ID = 99; // bigint org_id for S1-3 isolation tests
const S13_ACTOR = "test-s13-query-oid";

test("audit_log query: S1-3 date range and org filtering returns correct entries", async () => {
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

test("audit_log query: S1-3 action filter narrows results", async () => {
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
