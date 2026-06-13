import * as fs from "fs";
import * as path from "path";
import { pool, test, assert, FIXTURE_STOP_ID, FIXTURE_ORG_ID } from "../setup";

/**
 * P1 SAFETY regression (ISSUE-031): worker-attribution identity (clean_logs.user_id)
 * must never be serialized by the clean-logs list endpoints.
 *
 * Both GET /admin/clean-logs and GET /api/ops/clean-logs historically ran
 * `SELECT cl.*` on public.clean_logs and returned the rows verbatim, leaking
 * cl.user_id into the response payload. This suite asserts — at the source level
 * AND at runtime against a seeded row — that the selected shape contains no
 * worker-identity column.
 *
 * If a future edit reintroduces `cl.*` or selects an identity column, these
 * tests fail.
 */

// The only worker-identity column on public.clean_logs. If the schema ever
// grows another, add it here and to the endpoint column lists.
const IDENTITY_COLUMNS = ["user_id"];

// Columns the consumer (LeadCompletedRouteDetail + OpsCleanLog type) actually
// reads — must survive the rewrite or the UI breaks.
const REQUIRED_COLUMNS = [
  "id",
  "stop_id",
  "route_run_stop_id",
  "cleaned_at",
  "picked_up_litter",
  "washed_shelter",
  "washed_pad",
  // join columns
  "on_street_name",
  "run_date",
  "route_pool_id",
];

type Endpoint = { label: string; file: string; routeMarker: string };

const ENDPOINTS: Endpoint[] = [
  {
    label: "/admin/clean-logs",
    file: path.resolve(__dirname, "../../src/modules/admin/adminRoutes.ts"),
    routeMarker: 'adminRoutes.get("/admin/clean-logs"',
  },
  {
    label: "/ops/clean-logs",
    file: path.resolve(__dirname, "../../src/modules/ops/opsRoutes.ts"),
    routeMarker: 'opsRoutes.get("/ops/clean-logs"',
  },
];

/**
 * Extract the SELECT list of the main (non-count) clean-logs query from the
 * handler source. The main query is the only one with an ORDER BY, so we anchor
 * on it to avoid matching the COUNT(*) query.
 */
function extractSelectList(ep: Endpoint): string {
  const src = fs.readFileSync(ep.file, "utf8");
  const start = src.indexOf(ep.routeMarker);
  assert(start !== -1, `${ep.label}: route handler not found in ${ep.file}`);
  const region = src.slice(start);
  const m = region.match(/SELECT\s+([\s\S]*?)\s+FROM clean_logs cl[\s\S]*?ORDER BY/);
  assert(!!m, `${ep.label}: could not locate main clean_logs SELECT…ORDER BY block`);
  return m![1];
}

for (const ep of ENDPOINTS) {
  // ── Static guard: the source SELECT list must not be a wildcard and must not
  //    name an identity column.
  test(`clean-logs identity: ${ep.label} source SELECT omits cl.* and identity`, async () => {
    const list = extractSelectList(ep);
    assert(!/\bcl\.\*/.test(list), `${ep.label}: SELECT still uses cl.* (leaks every column incl. user_id)`);
    for (const col of IDENTITY_COLUMNS) {
      assert(
        !new RegExp(`\\b${col}\\b`).test(list),
        `${ep.label}: SELECT list names identity column "${col}"`
      );
    }
  });

  // ── Runtime guard: run the ACTUAL parsed SELECT list against a seeded row that
  //    has a user_id, and prove the returned shape carries no identity field.
  test(`clean-logs identity: ${ep.label} response shape has no identity field`, async () => {
    const list = extractSelectList(ep);
    const client = await pool.connect();
    let seededId: number | null = null;
    try {
      // clean_logs is FORCE RLS — set org context before writing/reading.
      await client.query(`SELECT set_config('app.current_org_id', $1, false)`, [String(FIXTURE_ORG_ID)]);

      const ins = await client.query(
        `INSERT INTO clean_logs (stop_id, org_id, user_id, picked_up_litter, washed_shelter, washed_pad)
         VALUES ($1, $2, $3, true, true, false)
         RETURNING id`,
        [FIXTURE_STOP_ID, FIXTURE_ORG_ID, 999999]
      );
      seededId = Number(ins.rows[0].id);

      const query = `
        SELECT ${list}
        FROM clean_logs cl
        LEFT JOIN route_run_stops rrs ON cl.route_run_stop_id = rrs.id
        LEFT JOIN route_runs rr ON rrs.route_run_id = rr.id
        LEFT JOIN stops s ON cl.stop_id = s.stop_id
        WHERE cl.id = $1
      `;
      const res = await client.query(query, [seededId]);
      assert(res.rowCount === 1, `${ep.label}: seeded row not returned`);

      const keys = Object.keys(res.rows[0]);
      for (const col of IDENTITY_COLUMNS) {
        assert(!keys.includes(col), `${ep.label}: response shape leaks identity column "${col}" (keys: ${keys.join(", ")})`);
      }
      for (const col of REQUIRED_COLUMNS) {
        assert(keys.includes(col), `${ep.label}: response shape missing required column "${col}" (keys: ${keys.join(", ")})`);
      }
    } finally {
      if (seededId !== null) {
        await client.query(`DELETE FROM clean_logs WHERE id = $1`, [seededId]);
      }
      await client.query(`SELECT set_config('app.current_org_id', '', false)`);
      client.release();
    }
  });
}
