import fs from "fs";
import path from "path";
import { Client } from "pg";
import { pool, runAll } from "./setup";

async function ensureFixtureSeed(): Promise<void> {
  // 1. Probe (as the suite role, org context set + reset like every test).
  const probe = await pool.connect();
  let present: boolean;
  try {
    await probe.query(`SELECT set_config('app.current_org_id', '1', false)`);
    const r = await probe.query(`
      SELECT EXISTS (SELECT 1 FROM public.route_pools   WHERE id = 'TEST_POOL')
         AND EXISTS (SELECT 1 FROM public.assets        WHERE id = 2)
         AND EXISTS (SELECT 1 FROM public.transit_stops
                     WHERE stop_id = '31150' AND pool_id IS NOT NULL AND has_trash)
         AND EXISTS (SELECT 1 FROM core.location_external_ids
                     WHERE source_system = 'metro_stop' AND external_id = '31150')
         AND EXISTS (SELECT 1 FROM core.asset_locations
                     WHERE asset_id = 2 AND location_id = 1 AND role = 'primary' AND active)
         AS ok`);
    present = r.rows[0].ok === true;
  } finally {
    try {
      await probe.query(`SELECT set_config('app.current_org_id', '', false)`);
    } catch { /* best-effort reset */ }
    probe.release();
  }
  if (present) return;

  // 2. Seed on an admin connection (trigger toggle needs table ownership).
  const adminUrl = process.env.PGADMIN_DATABASE_URL;
  const adminUser = process.env.PGADMIN_USER ?? "fieldpro_admin";
  const adminPassword =
    process.env.PGADMIN_PASSWORD ?? process.env.FIELDPRO_ADMIN_PASSWORD;
  if (!adminUrl && !adminPassword) {
    console.error(
      "tests: fixture graph (TEST_POOL / stop 31150 / asset 2) is missing and no admin\n" +
      "credentials are available to seed it. Seed once with:\n" +
      "  psql <admin-connection> -v ON_ERROR_STOP=1 -f tests/fixtures/seed.sql\n" +
      "or set PGADMIN_DATABASE_URL / PGADMIN_USER+PGADMIN_PASSWORD (or\n" +
      "FIELDPRO_ADMIN_PASSWORD) so the runner can seed it itself.",
    );
    process.exit(1);
  }
  const admin = new Client(
    adminUrl
      ? { connectionString: adminUrl }
      : {
          host: process.env.PGHOST ?? "localhost",
          port: Number(process.env.PGPORT ?? 5432),
          user: adminUser,
          password: adminPassword,
          database: process.env.PGDATABASE ?? "fieldpro_db",
        },
  );
  await admin.connect();
  try {
    const seedSql = fs.readFileSync(
      path.resolve(__dirname, "fixtures/seed.sql"),
      "utf8",
    );
    await admin.query(seedSql);
    console.log("tests: fixture graph was missing — applied tests/fixtures/seed.sql (admin connection)\n");
  } finally {
    await admin.end();
  }
}

// Importing each test file registers its tests into the shared registry in setup.ts.
import "./canonical/visits.test";
import "./canonical/observations.test";
import "./canonical/presenceSeverityReceiver.test";
import "./canonical/hazardSeverityCarry.test";
import "./canonical/riskMapSeverity.test";
import "./canonical/evidence.test";
import "./canonical/assignments.test";
import "./canonical/auditLog.test";
import "./canonical/authClaims.test";
import "./canonical/eamBridge.test";
import "./canonical/uploadValidation.test";
import "./canonical/oidCipher.test";
import "./canonical/exportDelete.test";
import "./canonical/sftpExport.test";
import "./canonical/devAuthBypass.test";
import "./canonical/loadRouteRunById.test";
import "./canonical/roleRenamePhase1Audit.test";
import "./canonical/cleanLogsIdentity.test";
import "./canonical/cleanLogsCanonicalPivot.test";
import "./canonical/infraIssuesWriteClip.test";
import "./canonical/runtimeIdentityLeak.test";
import "./canonical/orgFailClosed.test";
import "./canonical/resourceRoutesOrgFailClosed.test";
import "./canonical/opsRouteRunsExceptions.test";
import "./canonical/ccExceptionsCanonical.test";
import "./canonical/loadRouteRunCanonicalBooleans.test";
import "./canonical/seamCUserIdDropped.test";
import "./canonical/loadRouteRunOidTrim.test";
import "./canonical/presenceTaxonomy.test";
import "./canonical/controlCenterRelocation.test";
import "./canonical/stopHistory.test";

(async () => {
  console.log("canonical integration tests — real local DB, no mocking\n");

  // Fixture-dependency seed (CI/local parity). CI applies
  // tests/fixtures/seed.sql as its own elevated job step; local runs had no
  // equivalent, so on a fresh/rebuilt dev DB createRouteRunFixture FK-failed
  // (route_run_stops_asset_id_fkey — asset 2 / stop 31150 absent) and, before
  // the acquireRouteRunFixture guard existed, each failure leaked a pooled
  // client until the pool (10) was exhausted and the suite hung.
  //
  // The seed CANNOT simply run on the suite pool: it must toggle
  // trg_sync_transit_stop_primary_asset (ISSUE-024), which requires table
  // ownership the deliberately-unprivileged test role does not have. So:
  //   1. PROBE for the fixture graph — present (CI, or an already-seeded local
  //      DB) → skip.
  //   2. Missing → apply seed.sql on an ADMIN connection from the same env
  //      convention migrate.ts uses (PGADMIN_DATABASE_URL / PGADMIN_USER+
  //      PGADMIN_PASSWORD, falling back to fieldpro_admin +
  //      FIELDPRO_ADMIN_PASSWORD from backend/.env).
  //   3. No admin credentials → fail FAST with the one-line fix, never a
  //      cascade of FK failures.
  await ensureFixtureSeed();

  const code = await runAll();
  await pool.end();
  process.exit(code);
})().catch(async (err) => {
  console.error("test runner crashed:", err);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
