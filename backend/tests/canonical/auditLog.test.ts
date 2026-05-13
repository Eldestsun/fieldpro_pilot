import { pool, test, assert, assertEqual } from "../setup";
import { writeAuditLog } from "../../src/middleware/auditLog";

const TEST_ORG_ID = "00000000-0000-0000-0000-000000000001";
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
    assertEqual(row.org_id, TEST_ORG_ID, "org_id matches");
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
