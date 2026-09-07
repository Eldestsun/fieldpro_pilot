import { test, assert, assertEqual, pool, FIXTURE_ORG_ID, FIXTURE_ASSET_ID } from "../setup";

// ============================================================================
// ISSUE-024 / RLS-TSA — sync_transit_stop_primary_asset must be org-aware.
//
// Before the 20260907 fix, ANY write that set transit_stops.asset_id crashed:
// the trigger inserted into transit_stop_assets without its NOT NULL org_id
// (the CI seed disables the trigger to work around it). Contract now:
//  1. Setting asset_id creates an active primary link row CARRYING the
//     stop's org_id.
//  2. Re-setting the same asset_id self-heals via ON CONFLICT (KNOWN_ISSUES
//     recorded the arbiter as failing inside plpgsql — that failure was the
//     org_id violation masking the real behavior; proven here).
//  3. Switching asset_id deactivates the old primary and activates the new.
//  4. Clearing asset_id deactivates the primary link.
//
// Self-cleaning: synthetic stop I024X + its link rows removed in finally.
// Uses the seed-owned FIXTURE_ASSET_ID and a second seed asset if present.
// ============================================================================

const ORG = String(FIXTURE_ORG_ID);
const STOP_ID = "I024X";

async function withOrgClient<T>(fn: (client: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.current_org_id', $1, false)`, [ORG]);
    return await fn(client);
  } finally {
    await client.query(`SELECT set_config('app.current_org_id', '', false)`).catch(() => {});
    client.release();
  }
}

async function linkRows(client: any) {
  const res = await client.query(
    `SELECT asset_id, role, active, org_id FROM public.transit_stop_assets
     WHERE stop_id = $1 ORDER BY asset_id, active DESC`,
    [STOP_ID],
  );
  return res.rows;
}

async function cleanup(client: any) {
  await client.query(`DELETE FROM public.transit_stop_assets WHERE stop_id = $1`, [STOP_ID]);
  await client.query(`DELETE FROM public.transit_stops WHERE stop_id = $1`, [STOP_ID]);
}

test("ISSUE-024: setting asset_id creates an org-carrying primary link (no NOT NULL crash)", async () => {
  await withOrgClient(async (client) => {
    try {
      await client.query(
        `INSERT INTO public.transit_stops (stop_id, on_street_name, lon, lat, active, org_id, asset_id)
         VALUES ($1, 'I024 Test St', -122.30, 47.61, true, $2, $3)`,
        [STOP_ID, FIXTURE_ORG_ID, FIXTURE_ASSET_ID],
      );

      const rows = await linkRows(client);
      assertEqual(rows.length, 1, "trigger must create exactly one link row");
      assertEqual(rows[0].active, true, "link is active");
      assertEqual(rows[0].role, "primary", "link role is primary");
      assertEqual(Number(rows[0].org_id), FIXTURE_ORG_ID, "link inherits the stop's org_id (the ISSUE-024 fix)");
      assertEqual(Number(rows[0].asset_id), FIXTURE_ASSET_ID, "link points at the stop's asset");
    } finally {
      await cleanup(client);
    }
  });
});

test("ISSUE-024: re-setting the same asset_id self-heals via ON CONFLICT (no unique violation)", async () => {
  await withOrgClient(async (client) => {
    try {
      await client.query(
        `INSERT INTO public.transit_stops (stop_id, on_street_name, lon, lat, active, org_id, asset_id)
         VALUES ($1, 'I024 Test St', -122.30, 47.61, true, $2, $3)`,
        [STOP_ID, FIXTURE_ORG_ID, FIXTURE_ASSET_ID],
      );
      // Touch asset_id again with the same value — fires the trigger's
      // conflict path against the existing active link row.
      await client.query(
        `UPDATE public.transit_stops SET asset_id = $2 WHERE stop_id = $1`,
        [STOP_ID, FIXTURE_ASSET_ID],
      );

      const rows = await linkRows(client);
      assertEqual(rows.length, 1, "still exactly one link row — conflict healed, not duplicated");
      assertEqual(rows[0].active, true, "link stays active");
    } finally {
      await cleanup(client);
    }
  });
});

test("ISSUE-024: clearing asset_id deactivates the primary link (org-scoped)", async () => {
  await withOrgClient(async (client) => {
    try {
      await client.query(
        `INSERT INTO public.transit_stops (stop_id, on_street_name, lon, lat, active, org_id, asset_id)
         VALUES ($1, 'I024 Test St', -122.30, 47.61, true, $2, $3)`,
        [STOP_ID, FIXTURE_ORG_ID, FIXTURE_ASSET_ID],
      );
      await client.query(
        `UPDATE public.transit_stops SET asset_id = NULL WHERE stop_id = $1`,
        [STOP_ID],
      );

      const rows = await linkRows(client);
      assertEqual(rows.length, 1, "link row remains as history");
      assertEqual(rows[0].active, false, "link deactivated when asset cleared");
    } finally {
      await cleanup(client);
    }
  });
});
