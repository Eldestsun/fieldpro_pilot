import * as crypto from "crypto";
import { pool, test, assert, assertEqual } from "../setup";

// ── S1-4: Export-and-Delete token mechanics integration tests ─────────────
//
// These tests exercise the token table directly (hash storage, expiry,
// consumption, org_id cross-org guard). The actual /request and /execute
// HTTP endpoints require a running server with a valid Azure Entra token;
// that smoke-test is covered by code review of the route handler.
//
// A dedicated test org UUID is used throughout so these tests never touch
// the KCM org's canonical data.

const TEST_ORG_UUID = "00000000-0000-0000-0000-000000000042"; // test-only UUID
const TEST_ACTOR_OID = "test-export-delete-oid-s1-4";
const OTHER_ORG_UUID = "00000000-0000-0000-0000-000000000043"; // different org

function makeTokenPair(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

async function insertToken(
  opts: {
    hash: string;
    orgId?: string;
    expiresAt?: Date;
    consumedAt?: string | null;
  }
): Promise<bigint> {
  const expiresAt = opts.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const res = await pool.query(
    `INSERT INTO export_delete_tokens
       (token_hash, org_id, actor_oid, export_path, expires_at, consumed_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      opts.hash,
      opts.orgId ?? TEST_ORG_UUID,
      TEST_ACTOR_OID,
      "/tmp/test-export.json.gz",
      expiresAt,
      opts.consumedAt ?? null,
    ],
  );
  return BigInt(res.rows[0].id);
}

async function cleanupTokens(): Promise<void> {
  await pool.query(
    "DELETE FROM export_delete_tokens WHERE actor_oid = $1",
    [TEST_ACTOR_OID],
  );
}

// ── Token table structure ─────────────────────────────────────────────────

test("export_delete_tokens: table exists with required columns", async () => {
  const res = await pool.query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_name = 'export_delete_tokens'
     ORDER BY ordinal_position`,
  );
  const cols = res.rows.map((r) => r.column_name);
  for (const required of [
    "id", "token_hash", "org_id", "actor_oid",
    "export_path", "issued_at", "expires_at", "consumed_at",
  ]) {
    assert(cols.includes(required), `column '${required}' must exist`);
  }
  assert(!cols.includes("token_raw"), "raw token must NEVER be stored");
});

test("export_delete_tokens: token_hash is unique — duplicate hash rejected", async () => {
  const { hash } = makeTokenPair();
  try {
    await insertToken({ hash });
    let threw = false;
    try {
      await insertToken({ hash });
    } catch {
      threw = true;
    }
    assert(threw, "duplicate token_hash must be rejected by UNIQUE constraint");
  } finally {
    await cleanupTokens();
  }
});

// ── Token lookup by hash ──────────────────────────────────────────────────

test("export_delete_tokens: sha256 hash lookup returns correct row", async () => {
  const { raw, hash } = makeTokenPair();
  try {
    const tokenId = await insertToken({ hash });

    // Simulate what /execute does: hash the raw token, look up the row.
    const lookupHash = crypto.createHash("sha256").update(raw).digest("hex");
    const res = await pool.query(
      "SELECT id, org_id, expires_at, consumed_at FROM export_delete_tokens WHERE token_hash = $1",
      [lookupHash],
    );
    assertEqual(res.rowCount, 1, "lookup by hash must return exactly one row");
    assertEqual(BigInt(res.rows[0].id), tokenId, "returned id matches");
    assertEqual(res.rows[0].org_id, TEST_ORG_UUID, "org_id matches");
    assert(res.rows[0].consumed_at === null, "consumed_at is null on fresh token");
  } finally {
    await cleanupTokens();
  }
});

test("export_delete_tokens: unknown token hash returns no rows (404 signal)", async () => {
  const fakeHash = crypto.createHash("sha256").update("bogus-token").digest("hex");
  const res = await pool.query(
    "SELECT id FROM export_delete_tokens WHERE token_hash = $1",
    [fakeHash],
  );
  assertEqual(res.rowCount, 0, "unknown hash must return 0 rows");
});

// ── Expiry ────────────────────────────────────────────────────────────────

test("export_delete_tokens: expired token is detectable via expires_at < NOW()", async () => {
  const { hash } = makeTokenPair();
  const pastExpiry = new Date(Date.now() - 1000); // 1 second ago
  try {
    await insertToken({ hash, expiresAt: pastExpiry });
    const res = await pool.query(
      `SELECT id, expires_at < NOW() AS is_expired
       FROM export_delete_tokens
       WHERE token_hash = $1`,
      [hash],
    );
    assertEqual(res.rowCount, 1, "token row found");
    assert(res.rows[0].is_expired === true, "is_expired must be true for past expiry");
  } finally {
    await cleanupTokens();
  }
});

test("export_delete_tokens: active token is not expired", async () => {
  const { hash } = makeTokenPair();
  try {
    await insertToken({ hash }); // default: 7 days in the future
    const res = await pool.query(
      `SELECT id, expires_at < NOW() AS is_expired
       FROM export_delete_tokens
       WHERE token_hash = $1`,
      [hash],
    );
    assertEqual(res.rowCount, 1, "token row found");
    assert(res.rows[0].is_expired === false, "is_expired must be false for future expiry");
  } finally {
    await cleanupTokens();
  }
});

// ── Consumption (replay protection) ──────────────────────────────────────

test("export_delete_tokens: consumed token is detectable via consumed_at IS NOT NULL", async () => {
  const { hash } = makeTokenPair();
  try {
    const tokenId = await insertToken({ hash });

    // Mark as consumed.
    await pool.query(
      "UPDATE export_delete_tokens SET consumed_at = NOW() WHERE id = $1",
      [tokenId],
    );

    const res = await pool.query(
      "SELECT consumed_at FROM export_delete_tokens WHERE id = $1",
      [tokenId],
    );
    assert(res.rows[0].consumed_at !== null, "consumed_at must be set after consumption");
  } finally {
    await cleanupTokens();
  }
});

// ── Org_id cross-org guard ─────────────────────────────────────────────────

test("export_delete_tokens: token org_id mismatch is detectable (403 signal)", async () => {
  const { hash } = makeTokenPair();
  try {
    // Token belongs to TEST_ORG_UUID but requester claims OTHER_ORG_UUID.
    await insertToken({ hash, orgId: TEST_ORG_UUID });

    const res = await pool.query(
      "SELECT org_id FROM export_delete_tokens WHERE token_hash = $1",
      [hash],
    );
    assertEqual(res.rowCount, 1, "token found");

    const tokenOrgId: string = res.rows[0].org_id;
    const requesterOrgId = OTHER_ORG_UUID;

    assert(
      tokenOrgId !== requesterOrgId,
      "org_id mismatch must be detectable — token org != requester org",
    );
  } finally {
    await cleanupTokens();
  }
});

test("export_delete_tokens: token org_id match succeeds (same org)", async () => {
  const { hash } = makeTokenPair();
  try {
    await insertToken({ hash, orgId: TEST_ORG_UUID });

    const res = await pool.query(
      "SELECT org_id FROM export_delete_tokens WHERE token_hash = $1",
      [hash],
    );
    const tokenOrgId: string = res.rows[0].org_id;
    assertEqual(tokenOrgId, TEST_ORG_UUID, "org_id matches when same org");
  } finally {
    await cleanupTokens();
  }
});

// ── Audit log delete policy (S1-4 migration) ─────────────────────────────
//
// Verify that the audit_log_delete RLS policy allows DELETE only when
// app.export_delete_active = 'true' and app.export_delete_org_id matches.

const AUDIT_DELETE_TEST_ORG = "00000000-0000-0000-0000-000000000044";
const AUDIT_DELETE_TEST_OID = "test-audit-delete-oid-s1-4";

test("audit_log_delete policy: DELETE is blocked without export_delete_active flag", async () => {
  const client = await pool.connect();
  try {
    // Insert a test audit row.
    await client.query(
      `INSERT INTO audit_log (actor_oid, org_id, action) VALUES ($1, $2::uuid, $3)`,
      [AUDIT_DELETE_TEST_OID, AUDIT_DELETE_TEST_ORG, "export.data_export"],
    );

    // Without setting app.export_delete_active, DELETE must affect 0 rows.
    const delRes = await client.query(
      "DELETE FROM audit_log WHERE actor_oid = $1",
      [AUDIT_DELETE_TEST_OID],
    );
    assertEqual(
      delRes.rowCount,
      0,
      "DELETE without export_delete_active must be blocked by RLS (0 rows deleted)",
    );

    // Row must still exist.
    const check = await client.query(
      "SELECT id FROM audit_log WHERE actor_oid = $1 ORDER BY id DESC LIMIT 1",
      [AUDIT_DELETE_TEST_OID],
    );
    assert(check.rowCount! > 0, "audit row survives without the flag");
  } finally {
    client.release();
  }
});

test("audit_log_delete policy: DELETE succeeds with export_delete_active + correct org_id", async () => {
  const client = await pool.connect();
  try {
    // Insert a test audit row to delete.
    await client.query(
      `INSERT INTO audit_log (actor_oid, org_id, action) VALUES ($1, $2::uuid, $3)`,
      [AUDIT_DELETE_TEST_OID, AUDIT_DELETE_TEST_ORG, "export.delete_execute"],
    );

    // Must be inside a transaction for SET LOCAL to take effect.
    await client.query("BEGIN");
    await client.query(
      "SELECT set_config('app.export_delete_active', 'true', true)",
    );
    await client.query(
      "SELECT set_config('app.export_delete_org_id', $1, true)",
      [AUDIT_DELETE_TEST_ORG],
    );

    const delRes = await client.query(
      "DELETE FROM audit_log WHERE actor_oid = $1 AND org_id = $2::uuid",
      [AUDIT_DELETE_TEST_OID, AUDIT_DELETE_TEST_ORG],
    );
    await client.query("COMMIT");

    assert(
      (delRes.rowCount ?? 0) > 0,
      "DELETE with export_delete_active must succeed (rows affected > 0)",
    );

    // Row must be gone.
    const check = await client.query(
      "SELECT id FROM audit_log WHERE actor_oid = $1",
      [AUDIT_DELETE_TEST_OID],
    );
    assertEqual(
      check.rowCount,
      0,
      "audit row is gone after policy-unlocked DELETE",
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
});

test("audit_log_delete policy: SET LOCAL resets after COMMIT — subsequent DELETE blocked", async () => {
  const client = await pool.connect();
  try {
    // Insert a new test row.
    await client.query(
      `INSERT INTO audit_log (actor_oid, org_id, action) VALUES ($1, $2::uuid, $3)`,
      [AUDIT_DELETE_TEST_OID, AUDIT_DELETE_TEST_ORG, "auth.login"],
    );

    // First transaction: set flag and delete.
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.export_delete_active', 'true', true)");
    await client.query(
      "SELECT set_config('app.export_delete_org_id', $1, true)",
      [AUDIT_DELETE_TEST_ORG],
    );
    const del1 = await client.query(
      "DELETE FROM audit_log WHERE actor_oid = $1 AND org_id = $2::uuid",
      [AUDIT_DELETE_TEST_OID, AUDIT_DELETE_TEST_ORG],
    );
    await client.query("COMMIT");
    assert((del1.rowCount ?? 0) > 0, "first delete succeeded");

    // Second attempt without setting flag: must be blocked.
    await client.query(
      `INSERT INTO audit_log (actor_oid, org_id, action) VALUES ($1, $2::uuid, $3)`,
      [AUDIT_DELETE_TEST_OID, AUDIT_DELETE_TEST_ORG, "auth.login"],
    );

    const del2 = await client.query(
      "DELETE FROM audit_log WHERE actor_oid = $1",
      [AUDIT_DELETE_TEST_OID],
    );
    assertEqual(
      del2.rowCount,
      0,
      "DELETE is blocked after COMMIT resets SET LOCAL — flag does not persist",
    );

    // Clean up residual row (use the flag again).
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.export_delete_active', 'true', true)");
    await client.query("SELECT set_config('app.export_delete_org_id', $1, true)", [AUDIT_DELETE_TEST_ORG]);
    await client.query("DELETE FROM audit_log WHERE actor_oid = $1 AND org_id = $2::uuid", [AUDIT_DELETE_TEST_OID, AUDIT_DELETE_TEST_ORG]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
});

test("audit_log_delete policy: wrong org_id in session — DELETE blocked even with flag", async () => {
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO audit_log (actor_oid, org_id, action) VALUES ($1, $2::uuid, $3)`,
      [AUDIT_DELETE_TEST_OID, AUDIT_DELETE_TEST_ORG, "admin.config_change"],
    );

    // Set the flag but with a DIFFERENT org_id than the row's org_id.
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.export_delete_active', 'true', true)");
    await client.query(
      "SELECT set_config('app.export_delete_org_id', $1, true)",
      [OTHER_ORG_UUID], // wrong org
    );

    const delRes = await client.query(
      "DELETE FROM audit_log WHERE actor_oid = $1",
      [AUDIT_DELETE_TEST_OID],
    );
    await client.query("COMMIT");

    assertEqual(
      delRes.rowCount,
      0,
      "DELETE with wrong org_id in session must be blocked (0 rows deleted)",
    );

    // Verify row survived.
    const check = await client.query(
      "SELECT id FROM audit_log WHERE actor_oid = $1",
      [AUDIT_DELETE_TEST_OID],
    );
    assert(check.rowCount! > 0, "row survived cross-org delete attempt");

    // Clean up.
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.export_delete_active', 'true', true)");
    await client.query("SELECT set_config('app.export_delete_org_id', $1, true)", [AUDIT_DELETE_TEST_ORG]);
    await client.query("DELETE FROM audit_log WHERE actor_oid = $1 AND org_id = $2::uuid", [AUDIT_DELETE_TEST_OID, AUDIT_DELETE_TEST_ORG]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
});

// ── organizations.tenant_uuid column ─────────────────────────────────────

test("organizations: tenant_uuid column exists (added by S1-4 migration)", async () => {
  const res = await pool.query<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_name = 'organizations' AND column_name = 'tenant_uuid'`,
  );
  assertEqual(res.rowCount, 1, "organizations.tenant_uuid column must exist");
});
