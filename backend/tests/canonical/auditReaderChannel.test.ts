import "dotenv/config";
import {
  pool,
  test,
  assert,
  assertEqual,
  FIXTURE_ACTOR_OID,
  FIXTURE_ORG_ID,
  acquireRouteRunFixture,
  releaseFixture,
} from "../setup";
import { getAuditPool, withAuditOrgContext } from "../../src/db";
import { ensureVisitForRouteRunStop } from "../../src/domains/visit/visitService";

// ISSUE-028 / ISSUE-031 Q-F — the audit/export identity channel
//
// Contract pinned here:
//   • audit_reader holds SELECT on the four core.*_actor_audit sidecars + the
//     four canonical base tables — and NOTHING gives the diagnostic roles
//     (intelligence_reader, mcp_readonly) any sidecar privilege.
//   • The channel is NOBYPASSRLS: org isolation binds on audit reads
//     (PATTERN-001 — no org context ⇒ zero rows, silently; withAuditOrgContext
//     is the only sanctioned entry).
//   • withAuditOrgContext actually connects as audit_reader (not the app role).
//   • Fail-closed plumbing: missing orgId throws.

const SIDECARS = [
  "core.visit_actor_audit",
  "core.observation_actor_audit",
  "core.evidence_actor_audit",
  "core.assignment_actor_audit",
];
const CANONICAL_BASES = ["core.visits", "core.observations", "core.evidence", "core.assignments"];

test("ISSUE-028: audit_reader grant posture — SELECT on sidecars + canonical bases, NOBYPASSRLS", async () => {
  for (const t of [...SIDECARS, ...CANONICAL_BASES]) {
    const r = await pool.query(`SELECT has_table_privilege('audit_reader', $1, 'SELECT') AS ok`, [t]);
    assert(r.rows[0].ok === true, `audit_reader must hold SELECT on ${t}`);
  }
  const role = await pool.query(
    `SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'audit_reader'`,
  );
  assertEqual(role.rowCount, 1, "audit_reader role exists");
  assert(role.rows[0].rolbypassrls === false, "audit_reader must be NOBYPASSRLS — org isolation binds on the audit channel");
  assert(role.rows[0].rolsuper === false, "audit_reader must not be superuser");
});

test("ISSUE-028: labor-safety wall — diagnostic roles hold ZERO privilege on every sidecar", async () => {
  for (const role of ["intelligence_reader", "mcp_readonly"]) {
    const exists = await pool.query(`SELECT 1 FROM pg_roles WHERE rolname = $1`, [role]);
    if (exists.rowCount === 0) continue; // role absent on this cluster ⇒ trivially no privilege
    for (const t of SIDECARS) {
      const r = await pool.query(
        `SELECT has_table_privilege($1, $2, 'SELECT,INSERT,UPDATE,DELETE') AS any_priv`,
        [role, t],
      );
      assert(r.rows[0].any_priv === false, `${role} must hold NO privilege on ${t}`);
    }
  }
});

test("Q-F: withAuditOrgContext connects as audit_reader and reads sidecars under org context", async () => {
  const { client, f } = await acquireRouteRunFixture();
  try {
    // Seed one identity row through the real write path (as the app role).
    await ensureVisitForRouteRunStop(client, {
      routeRunStopId: f.routeRunStopId,
      actorOid: FIXTURE_ACTOR_OID,
      visitType: "service",
    });

    const { who, rows } = await withAuditOrgContext(FIXTURE_ORG_ID, async (audit) => {
      const whoRes = await audit.query(`SELECT current_user AS who`);
      const auditRows = await audit.query(
        `SELECT COUNT(*)::int AS n FROM core.visit_actor_audit`,
      );
      return { who: whoRes.rows[0].who, rows: auditRows.rows[0].n };
    });

    assertEqual(who, "audit_reader", "audit channel must connect as audit_reader, never the app role");
    assert(rows >= 1, `org-scoped audit read must see the seeded sidecar row (got ${rows})`);

    // PATTERN-001 binding: the SAME read with NO org context returns zero rows —
    // RLS is enforced on this channel, not bypassed.
    const bare = await getAuditPool().connect();
    try {
      const r = await bare.query(`SELECT COUNT(*)::int AS n FROM core.visit_actor_audit`);
      assertEqual(
        r.rows[0].n, 0,
        "audit_reader without org context must see ZERO sidecar rows (FORCE RLS binds — NOBYPASSRLS)",
      );
    } finally {
      bare.release();
    }
  } finally {
    await releaseFixture(client, f);
  }
});

test("Q-F: withAuditOrgContext fails closed on missing orgId", async () => {
  let threw = false;
  try {
    await withAuditOrgContext("", async () => null);
  } catch (err: any) {
    threw = true;
    assert(/orgId is required/.test(String(err?.message)), "error names the missing orgId");
  }
  assert(threw, "withAuditOrgContext must throw on empty orgId, never default");
});
