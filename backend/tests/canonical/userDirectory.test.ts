import type { AddressInfo } from "net";
import type { Server } from "http";
// Dev-bypass must be opted-in before app.ts is required.
process.env.DEV_AUTH_BYPASS = "true";

import { test, assert, assertEqual, pool, FIXTURE_ORG_ID } from "../setup";

// ============================================================================
// T3-A3 — read-only user directory (GET /admin/users).
//
// Founder rulings enforced here (2026-09-19):
//  - Admin-only (Dispatch → 403).
//  - Read-only mirror of identity_directory — no OID in the payload
//    (SEAM-C posture: names/emails suffice on management surfaces).
//  - last_sign_in is DATE-ONLY. last_seen_at refreshes on EVERY authenticated
//    request (requireAuth → upsertIdentity), so a precise timestamp would be
//    a worker-activity monitor, not a login log. A future switch back to a
//    full timestamp turns this suite red.
//  - Seed rows (oid LIKE 'seed-%') are excluded.
// ============================================================================

const ORG = String(FIXTURE_ORG_ID);

async function startServer(): Promise<{ server: Server; baseUrl: string }> {
  const appRef = require("../../src/app").app;
  const server: Server = await new Promise((resolve) => {
    const s = appRef.listen(0, "127.0.0.1", () => resolve(s));
  });
  return { server, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

async function seedDirectoryRow(oid: string, name: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.current_org_id', $1, false)`, [ORG]);
    await client.query(
      `INSERT INTO identity_directory (oid, org_id, display_name, email, last_seen_role, last_seen_at)
       VALUES ($1, $2, $3, $4, 'Specialist', NOW())
       ON CONFLICT (oid) DO UPDATE SET last_seen_at = NOW()`,
      [oid, ORG, name, `${oid}@example.test`],
    );
    await client.query(`SELECT set_config('app.current_org_id', '', false)`);
  } finally {
    client.release();
  }
}

async function removeDirectoryRow(oid: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.current_org_id', $1, false)`, [ORG]);
    await client.query(`DELETE FROM identity_directory WHERE oid = $1`, [oid]);
    await client.query(`SELECT set_config('app.current_org_id', '', false)`);
  } finally {
    client.release();
  }
}

test("T3-A3: /admin/users returns the directory — no OIDs, date-only last sign-in, seed rows excluded", async () => {
  const { server, baseUrl } = await startServer();
  const TEST_OID = "t3a3-directory-test-oid";
  try {
    await seedDirectoryRow(TEST_OID, "T3A3 Directory Probe");

    const res = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { "X-Dev-Persona": "admin" },
    });
    assertEqual(res.status, 200, "admin gets the directory");
    const body = await res.json();
    assert(Array.isArray(body.users), "users is an array");
    assert(body.users.length > 0, "directory is non-empty (probe row present)");

    const probe = body.users.find((u: any) => u.display_name === "T3A3 Directory Probe");
    assert(probe != null, "probe row is listed");

    for (const u of body.users) {
      assert(!("oid" in u), "no OID key in any directory row (SEAM-C posture)");
      assert(!("last_seen_at" in u), "raw last_seen_at is never surfaced");
      // Date-only contract: YYYY-MM-DD, no time component. last_seen_at
      // updates on every API call, so anything finer is activity tracking.
      assert(
        typeof u.last_sign_in === "string" && /^\d{4}-\d{2}-\d{2}/.test(u.last_sign_in) &&
        !/\d{2}:\d{2}:\d{2}/.test(u.last_sign_in),
        `last_sign_in is date-only (got: ${u.last_sign_in})`
      );
      assert(
        typeof (u.display_name ?? "") === "string" &&
        !String(u.display_name ?? "").startsWith("Seed "),
        "seed crew rows excluded from the directory"
      );
    }
  } finally {
    await removeDirectoryRow(TEST_OID);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("T3-A3: /admin/users is Admin-only — Dispatch refused (403)", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { "X-Dev-Persona": "dispatch" },
    });
    assertEqual(res.status, 403, "Dispatch is refused");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
