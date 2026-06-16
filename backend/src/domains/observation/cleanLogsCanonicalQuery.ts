// backend/src/domains/observation/cleanLogsCanonicalQuery.ts
//
// ISSUE-031 P1 — clean-logs Layer 3 read repoint.
//
// Single source of the canonical SELECT that backs both
// GET /admin/clean-logs and GET /api/ops/clean-logs. Both endpoints were
// historically `FROM public.clean_logs` (the transit adapter table, which carries
// the worker-identity column `user_id` and is slated to be dropped — migration
// sequence P6). This module repoints those reads onto the canonical layer:
//
//   - the 5 cleaning-action booleans  ← core.observations action rows
//   - cleaned_at                       ← core.visits.ended_at
//   - duration_minutes                 ← core.visits (ended_at - started_at)
//
// keeping the surviving transit-execution spine (route_run_stops / route_runs /
// public.stops) for the route/stop metadata, reached canonically from the visit
// (assignment → route_run, location_external_ids → stop) — the same join path the
// CC-REPOINT card established (2026-06-13). No clean_logs read remains, so the
// reads are independent of the clean_logs write that the follow-on clip card removes.
//
// THE PIVOT (the one correctness requirement):
// Action booleans are stored as ABSENCE = false — one observation row per TRUE
// action, no row for a not-done action. The pivot MUST therefore emit an explicit
// boolean for each of the five KNOWN keys per visit, by iterating the FIXED key set
// below (NOT by mapping only the rows that happen to be present, which would lose
// the explicit `false` for not-done actions):
//
//     COALESCE(bool_or(o.intervention = '<key>'), false) AS <key>
//
// row exists for (visit, key) ⇒ true; no row ⇒ false (explicit, not null/missing).

/**
 * The FIXED five cleaning-action keys, pinned here as the single shared constant
 * both clean-logs endpoints iterate. Order is the historical clean_logs column
 * order so the projected SELECT list reads identically to the legacy one.
 *
 * These mirror the five `if (ui.<key>)` write branches in
 * `observationService.ts` (the action observation writer) and the five
 * `action` rows in `core.observation_type_registry`. They are NOT data-driven
 * off whatever rows exist — the set is fixed so a not-done action still yields an
 * explicit `false`.
 */
export const CLEAN_ACTION_KEYS = [
  "picked_up_litter",
  "emptied_trash",
  "washed_shelter",
  "washed_pad",
  "washed_can",
] as const;

export type CleanLogsFilters = {
  stop_id?: string;
  run_date?: string;
  pool_id?: string;
  pageSize: number;
  offset: number;
};

export type CleanLogsCanonicalQueries = {
  query: string;
  countQuery: string;
  queryValues: any[];
  countValues: any[];
};

// Per-key explicit-boolean projection. Keys come from the trusted constant above
// (never user input), so inlining them as SQL literals carries no injection risk.
const ACTION_BOOLEAN_PROJECTION = CLEAN_ACTION_KEYS.map(
  (key) => `COALESCE(bool_or(o.intervention = '${key}'), false) AS ${key}`,
).join(",\n                ");

// Columns the GROUP BY must carry verbatim (every non-aggregated SELECT column).
const GROUP_BY_COLUMNS = `v.id, rrs.id, lei.external_id, v.ended_at, v.started_at,
                     s.on_street_name, s.pool_id, rr.run_date, rr.route_pool_id`;

// The canonical FROM/JOIN spine, shared by the main and count queries.
//
//   core.visits v                  — the clean event (completed visit = clean event)
//   core.assignments a             — visit.assignment_id → route_run (source_ref)
//   route_runs rr                  — run_date, route_pool_id  (SURVIVES the clip)
//   core.location_external_ids lei — visit.location_id → metro stop_id (canonical spine)
//   route_run_stops rrs            — (route_run, stop_id) ⇒ route_run_stop_id (SURVIVES)
//   public.stops s                 — on_street_name, pool_id
//   core.observations o            — the action rows being pivoted (LEFT: absence ⇒ false)
function fromAndJoins(): string {
  return `
            FROM core.visits v
            JOIN core.assignments a
              ON a.id = v.assignment_id
              AND a.source_system = 'route_runs'
            JOIN route_runs rr
              ON rr.id = a.source_ref::bigint
            JOIN core.location_external_ids lei
              ON lei.location_id = v.location_id
              AND lei.source_system = 'metro_stop'
            JOIN route_run_stops rrs
              ON rrs.route_run_id = rr.id
              AND rrs.stop_id = lei.external_id
            LEFT JOIN public.stops s
              ON s.stop_id = lei.external_id
            LEFT JOIN core.observations o
              ON o.visit_id = v.id
              AND o.obs_kind = 'action'`;
}

/**
 * Build the main list query and matching count query for the clean-logs endpoints.
 *
 * The two endpoints (admin + ops) are byte-for-byte identical reads; this builder
 * is their single definition. Filters preserve the legacy semantics exactly:
 *   - stop_id  → the canonical metro stop_id (lei.external_id)
 *   - run_date → route_runs.run_date
 *   - pool_id  → public.stops.pool_id
 *
 * The count query wraps the grouped main query so `total` is exactly the number
 * of rows the (unpaginated) main query returns — one per qualifying visit.
 */
export function buildCleanLogsCanonicalQueries(
  filters: CleanLogsFilters,
): CleanLogsCanonicalQueries {
  const conditions: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (filters.stop_id) {
    conditions.push(`lei.external_id = $${idx++}`);
    values.push(filters.stop_id);
  }
  if (filters.run_date) {
    conditions.push(`rr.run_date = $${idx++}`);
    values.push(filters.run_date);
  }
  if (filters.pool_id) {
    conditions.push(`s.pool_id = $${idx++}`);
    values.push(filters.pool_id);
  }

  // A completed, ended visit IS a clean event (the CC-REPOINT canonical definition).
  const whereParts = ["v.outcome = 'completed'", "v.ended_at IS NOT NULL", ...conditions];
  const whereClause = `WHERE ${whereParts.join(" AND ")}`;

  // duration_minutes mirrors the legacy clean_logs write (GREATEST(1, ceil(min)));
  // its value is visit wall-clock and may differ slightly from the worker-entered
  // clean_logs.duration_minutes (same shift CC-REPOINT documented). cleaned_at is
  // the canonical visit end. id is the canonical visit id (was clean_logs.id).
  const query = `
            SELECT
                v.id AS id,
                rrs.id AS route_run_stop_id,
                lei.external_id AS stop_id,
                v.ended_at AS cleaned_at,
                GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v.ended_at - v.started_at)) / 60.0))::int AS duration_minutes,
                ${ACTION_BOOLEAN_PROJECTION},
                s.on_street_name, s.pool_id,
                rr.run_date, rr.route_pool_id
            ${fromAndJoins()}
            ${whereClause}
            GROUP BY ${GROUP_BY_COLUMNS}
            ORDER BY v.ended_at DESC, v.id DESC
            LIMIT $${idx++} OFFSET $${idx++}
        `;

  const countQuery = `
            SELECT COUNT(*) AS total FROM (
              SELECT v.id
              ${fromAndJoins()}
              ${whereClause}
              GROUP BY ${GROUP_BY_COLUMNS}
            ) sub
        `;

  const queryValues = [...values, filters.pageSize, filters.offset];
  const countValues = [...values];

  return { query, countQuery, queryValues, countValues };
}
