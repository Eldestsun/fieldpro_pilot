import { Router, Request, Response, NextFunction } from "express";
import { requireAuth, requireAnyRole } from "../../authz";
import { pool, withOrgContext } from "../../db";
import { resolveNumericOrgId } from "../../middleware/resolveOrgId";
import { SAFETY_PRESENCE_TYPES, INFRA_PRESENCE_TYPES } from "../../domains/observation/presenceTaxonomy";

// SEAM-B B1a — Control Center relocated from Admin-only (/admin/control-center) to
// Dispatch-visible (/ops/control-center). The four handlers below are BYTE-IDENTICAL
// to their prior form in adminRoutes.ts (mechanical extraction); the only change from
// that block is the guard, widened from requireAdmin to requireOps (Dispatch+Admin),
// mirroring opsRoutes. The @openapi / console.error path+role annotations are updated
// separately in B1b. The internal router var stays `ccRouter` so the moved handler
// registration lines are byte-identical; it is exported as controlCenterRoutes.
const requireOps = (req: Request, res: Response, next: NextFunction) => {
  requireAnyRole(["Dispatch", "Admin"])(req as any, res, next);
};

// ISSUE-031/CC-REPOINT (DQ A3): the 8 pinned safety *_present observation types.
// Canonical hazard reads filter to exactly these. Distinct from the infrastructure
// *_present set — do not conflate. Includes other_safety_concern_present.
// (Moved byte-identical from adminRoutes.ts in the SEAM-B extraction.)
const SAFETY_HAZARD_OBSERVATION_TYPES = [
  'encampment_present',
  'fire_present',
  'dangerous_activity_present',
  'drug_use_present',
  'violence_present',
  'biohazard_present',
  'access_blocked_present',
  'other_safety_concern_present',
] as const;

const ccRouter = Router();
ccRouter.use(requireAuth, requireOps);

/**
 * @openapi
 * /ops/control-center/overview:
 *   get:
 *     summary: Control center — today's operational overview
 *     description: >
 *       Aggregate clean events, total clean minutes, and hazards reported for today,
 *       read from the identity-free canonical layer (core.visits + core.observations).
 *       Per ISSUE-031 DQ A2 the high-severity hazard count is not surfaced — canonical
 *       severity is a sparse text column; the high-severity cut is restored in the MV-4/DQ-4
 *       intelligence pass.
 *     tags: [Ops]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Dispatch, Admin]
 *     responses:
 *       200:
 *         description: Today's overview metrics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 clean_events: { type: integer }
 *                 total_clean_minutes: { type: number }
 *                 hazards_reported: { type: integer }
 *             example:
 *               clean_events: 38
 *               total_clean_minutes: 462.5
 *               hazards_reported: 4
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
// 0. Overview / Today at a Glance (Panel 1 - Authoritative)
ccRouter.get("/overview", async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    // PATTERN-001: this handler read core.visits / core.observations on a bare
    // connection — under fail-closed RLS (MT-2) every metric silently zeroed.
    // Resolve the caller's org (fail-closed, ISSUE-013) and set context, same
    // as the sibling /exceptions and /difficulty handlers.
    const numericOrgId = await resolveNumericOrgId(req);
    await client.query(`SELECT set_config('app.current_org_id', $1, false)`, [String(numericOrgId)]);
    // ISSUE-031/CC-REPOINT: canonical reads — clean events/minutes from core.visits
    // (completed visit = clean event; duration = ended_at - started_at), hazards from
    // core.observations filtered to the 8 pinned safety *_present types (observed_at).
    // No identity columns. High-severity hazard cut dropped per DQ A2.
    const query = `
            WITH today AS (
              SELECT current_date AS service_date
            ),

            clean_metrics AS (
              SELECT
                COUNT(*) AS clean_events,
                COALESCE(SUM(EXTRACT(EPOCH FROM (v.ended_at - v.started_at)) / 60.0), 0) AS total_clean_minutes
              FROM core.visits v
              JOIN today t
                ON v.ended_at::date = t.service_date
              WHERE v.outcome = 'completed'
                AND v.ended_at IS NOT NULL
            ),

            hazard_metrics AS (
              SELECT
                COUNT(*) AS hazards_reported
              FROM core.observations o
              JOIN today t
                ON o.observed_at::date = t.service_date
              WHERE o.observation_type = ANY($1::text[])
            )

            SELECT
              c.clean_events,
              c.total_clean_minutes,
              h.hazards_reported
            FROM clean_metrics c
            CROSS JOIN hazard_metrics h;
        `;

    const result = await client.query(query, [SAFETY_HAZARD_OBSERVATION_TYPES]);
    // Return row 0 as JSON, or default zeros if something goes strictly wrong (though aggregate always returns 1 row)
    const row = result.rows[0] || {
      clean_events: 0,
      total_clean_minutes: 0,
      hazards_reported: 0
    };

    res.json({
      clean_events: parseInt(row.clean_events, 10),
      total_clean_minutes: parseFloat(row.total_clean_minutes),
      hazards_reported: parseInt(row.hazards_reported, 10)
    });
  } catch (err: any) {
    console.error("Error in /api/ops/control-center/overview:", err);
    res.status(500).json({ error: "Failed to fetch overview metrics" });
  } finally {
    client.release();
  }
});



/**
 * @openapi
 * /ops/control-center/routes:
 *   get:
 *     summary: Control center — active route status table
 *     description: Per-route stop counts, resolved counts, emergency additions, and skip flags for planned and in-progress runs today.
 *     tags: [Ops]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Dispatch, Admin]
 *     responses:
 *       200:
 *         description: Array of active route status rows
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   route_run_id: { type: integer }
 *                   pool_id: { type: string }
 *                   planned_stops: { type: integer }
 *                   emergency_stops: { type: integer }
 *                   resolved_stops: { type: integer }
 *                   skipped_stops: { type: integer }
 *                   total_known_stops: { type: integer }
 *                   observed_minutes: { type: number }
 *                   has_emergency_additions: { type: boolean }
 *                   high_skip_count: { type: boolean }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
// 2. Route Status Table (Panel 2 - Authoritative)
ccRouter.get("/routes", async (req: Request, res: Response) => {
  try {
    const query = `
WITH route_base AS (
  SELECT
    rr.id            AS route_run_id,
    rr.route_pool_id AS pool_id,
    rr.status        AS route_status,
    rr.run_date,
    rr.started_at,
    rr.finished_at
  FROM public.route_runs rr
  WHERE rr.status IN ('planned', 'in_progress')
),

stop_counts AS (
  SELECT
    rrs.route_run_id,
    COUNT(*) FILTER (
      WHERE rrs.origin_type IS DISTINCT FROM 'emergency'
    ) AS planned_stops,
    COUNT(*) FILTER (
      WHERE rrs.origin_type = 'emergency'
    ) AS emergency_stops,
    COUNT(*) FILTER (
      WHERE rrs.status IN ('done', 'skipped')
    ) AS resolved_stops,
    COUNT(*) FILTER (
      WHERE rrs.status = 'skipped'
    ) AS skipped_stops
  FROM public.route_run_stops rrs
  JOIN route_base rb
    ON rb.route_run_id = rrs.route_run_id
  GROUP BY rrs.route_run_id
),

observed_minutes AS (
  -- ISSUE-031 P1 — standalone reader repoint (CC-Repoint pattern).
  -- Observed minutes is the wall-clock duration of the route's completed visits,
  -- read from canonical core.visits instead of the soon-to-be-clipped
  -- public.clean_logs. A completed, ended core.visit IS the clean event (the
  -- CC-Repoint canonical definition). The join path mirrors CC-Repoint:
  --   route_run → core.assignments (source_ref) → core.visits
  -- Aggregated at the route_run level, so the stop-level spine that the clean-logs
  -- list builder carries (location_external_ids / stops / route_run_stops) is not
  -- needed here — one assignment maps to one route_run, and every visit under it
  -- belongs to that run. Value is raw visit wall-clock; it differs from the legacy
  -- SUM(clean_logs.duration_minutes) only by the documented stored-vs-wall-clock
  -- delta (the legacy write stored GREATEST(1, ceil(min)) per stop). No
  -- worker-identity column is introduced.
  SELECT
    rb.route_run_id,
    COALESCE(EXTRACT(EPOCH FROM SUM(v.ended_at - v.started_at)) / 60.0, 0)
      AS observed_minutes
  FROM route_base rb
  LEFT JOIN core.assignments a
    ON a.source_system = 'route_runs'
    AND a.source_ref::bigint = rb.route_run_id
  LEFT JOIN core.visits v
    ON v.assignment_id = a.id
    AND v.outcome = 'completed'
    AND v.ended_at IS NOT NULL
  GROUP BY rb.route_run_id
),

deviation_flags AS (
  SELECT
    rrs.route_run_id,
    BOOL_OR(rrs.origin_type = 'emergency') AS has_emergency_additions,
    COUNT(*) FILTER (WHERE rrs.status = 'skipped') >= 3 AS high_skip_count
  FROM public.route_run_stops rrs
  JOIN route_base rb
    ON rb.route_run_id = rrs.route_run_id
  GROUP BY rrs.route_run_id
)

SELECT
  rb.route_run_id,
  rb.pool_id,

  COALESCE(sc.planned_stops, 0)     AS planned_stops,
  COALESCE(sc.emergency_stops, 0)   AS emergency_stops,
  COALESCE(sc.resolved_stops, 0)    AS resolved_stops,
  COALESCE(sc.skipped_stops, 0)     AS skipped_stops,

  (COALESCE(sc.planned_stops, 0) + COALESCE(sc.emergency_stops, 0))
    AS total_known_stops,

  COALESCE(om.observed_minutes, 0)  AS observed_minutes,

  COALESCE(df.has_emergency_additions, false) AS has_emergency_additions,
  COALESCE(df.high_skip_count, false)         AS high_skip_count

FROM route_base rb
LEFT JOIN stop_counts sc
  ON sc.route_run_id = rb.route_run_id
LEFT JOIN observed_minutes om
  ON om.route_run_id = rb.route_run_id
LEFT JOIN deviation_flags df
  ON df.route_run_id = rb.route_run_id

ORDER BY rb.route_run_id;
        `;
    const numericOrgId = await resolveNumericOrgId(req);
    const result = await withOrgContext(numericOrgId, (client) =>
      client.query(query),
    );
    console.log("[ControlCenter:Routes] rows =", result.rows);
    res.json(result.rows);
  } catch (err: any) {
    console.error("Error in /api/ops/control-center/routes:", err);
    res.status(500).json({ error: "Failed to fetch route status" });
  }
});

/**
 * @openapi
 * /ops/control-center/exceptions:
 *   get:
 *     summary: Control center — today's exception summary
 *     description: Skips by reason, total hazards, total infrastructure issues, and emergency/ad-hoc stop count for today.
 *     tags: [Ops]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Dispatch, Admin]
 *     responses:
 *       200:
 *         description: Exception summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 skips_by_reason:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       reason: { type: string }
 *                       count: { type: integer }
 *                 total_hazards: { type: integer }
 *                 total_infra_issues: { type: integer }
 *                 emergency_count: { type: integer }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
// 3. Exceptions (Strict Guardrails - Phase B)
ccRouter.get("/exceptions", async (req: Request, res: Response) => {
  const numericOrgId = await resolveNumericOrgId(req);
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.current_org_id', $1, false)`, [String(numericOrgId)]);
    const queries = {
      // 1. Skips by Reason
      skips: `
                WITH skipped AS (
                  SELECT
                    rrs.id,
                    COALESCE(
                      NULLIF(h.details->>'hazard_types', ''),
                      h.hazard_type,
                      'unspecified'
                    ) AS reason
                  FROM public.route_run_stops rrs
                  LEFT JOIN public.hazards h
                    ON h.id = rrs.hazard_id
                  WHERE
                    rrs.status = 'skipped'
                    AND rrs.updated_at::date = CURRENT_DATE
                )
                SELECT
                  reason,
                  COUNT(*)::int AS count
                FROM skipped
                GROUP BY reason
                ORDER BY count DESC;
            `,
      // 2. Total Hazards Today (SEAM-C: canonical repoint off clipped public.hazards).
      // Safety-hazard reports are core.observations presence rows whose type is in the
      // SAFETY set (presenceTaxonomy.ts). Each presence row IS one report — count = today's
      // reports, matching the legacy `reported_at >= CURRENT_DATE` semantics. RLS-scoped by
      // the org context set on this client above.
      hazards: `
                SELECT COUNT(*)::int AS total_hazards
                FROM core.observations o
                WHERE o.obs_kind = 'presence'
                  AND o.observation_type = ANY($1::text[])
                  AND o.observed_at >= CURRENT_DATE;
            `,
      // 3. Infrastructure Issues Today (SEAM-C: canonical repoint off clipped
      // public.infrastructure_issues). INFRA presence set. NB: contaminated-waste reports
      // write biohazard_present (a SAFETY type) per the write-path taxonomy, so they count
      // under hazards, not here — see presenceTaxonomy.ts.
      infra: `
                SELECT COUNT(*)::int AS total_infra_issues
                FROM core.observations o
                WHERE o.obs_kind = 'presence'
                  AND o.observation_type = ANY($1::text[])
                  AND o.observed_at >= CURRENT_DATE;
            `,
      // 4. Emergency / Ad-Hoc Stops Today
      emergency: `
                SELECT COUNT(*)::int AS emergency_count
                FROM public.route_run_stops
                WHERE
                  origin_type IN ('emergency', 'ul_ad_hoc')
                  AND created_at::date = CURRENT_DATE;
            `
    };

    const [skipsRes, hazardsRes, infraRes, emergencyRes] = await Promise.all([
      client.query(queries.skips),
      client.query(queries.hazards, [SAFETY_PRESENCE_TYPES as unknown as string[]]),
      client.query(queries.infra, [INFRA_PRESENCE_TYPES as unknown as string[]]),
      client.query(queries.emergency)
    ]);

    res.json({
      skips_by_reason: skipsRes.rows,
      total_hazards: parseInt(hazardsRes.rows[0]?.total_hazards || '0', 10),
      total_infra_issues: parseInt(infraRes.rows[0]?.total_infra_issues || '0', 10),
      emergency_count: parseInt(emergencyRes.rows[0]?.emergency_count || '0', 10)
    });

  } catch (err: any) {
    console.error("Error in /api/ops/control-center/exceptions:", err);
    res.status(500).json({ error: "Failed to fetch exceptions" });
  } finally {
    try { await client.query(`SELECT set_config('app.current_org_id', '', false)`); } catch { /* best-effort reset */ }
    client.release();
  }
});

/**
 * @openapi
 * /ops/control-center/difficulty:
 *   get:
 *     summary: Control center — today's difficulty indicators
 *     description: Heavy stops by location, routes with high difficulty density, and hotspot area concentration. Observational intelligence — no per-worker metrics.
 *     tags: [Ops]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Dispatch, Admin]
 *     responses:
 *       200:
 *         description: Difficulty indicators
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 heavy_stops:
 *                   type: array
 *                   items: { type: object }
 *                 heavy_routes:
 *                   type: array
 *                   items: { type: object }
 *                 hotspot_areas:
 *                   type: array
 *                   items: { type: object }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
// 4. Difficulty Indicators (Observational Intelligence - Phase B)
ccRouter.get("/difficulty", async (req: Request, res: Response) => {
  const numericOrgId = await resolveNumericOrgId(req);
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.current_org_id', $1, false)`, [String(numericOrgId)]);
    const queries = {
      // ISSUE-031/CC-REPOINT: canonical reads. Clean events/minutes from core.visits
      // (completed visit = clean event; duration = ended_at - started_at). Location label
      // and stop_id from the canonical spine (core.locations + core.location_external_ids).
      // Route/pool grouping from core.assignments via the visit.assignment_id link.
      // No identity columns anywhere in these reads.

      // A. Heavy Stops (Location Difficulty)
      heavyStops: `
                WITH today AS (
                  SELECT CURRENT_DATE AS service_date
                ),
                cleaned AS (
                  SELECT
                    v.location_id,
                    AVG(EXTRACT(EPOCH FROM (v.ended_at - v.started_at)) / 60.0) AS avg_minutes
                  FROM core.visits v
                  JOIN today t
                    ON v.ended_at::date = t.service_date
                  WHERE v.outcome = 'completed'
                    AND v.ended_at IS NOT NULL
                  GROUP BY v.location_id
                ),
                baseline AS (
                  SELECT
                    PERCENTILE_CONT(0.5)
                      WITHIN GROUP (ORDER BY avg_minutes) AS median_minutes
                  FROM cleaned
                )
                SELECT
                  c.location_id,
                  loc.label,
                  lei.external_id AS stop_id,
                  s.on_street_name,
                  s.intersection_loc,
                  CASE
                    WHEN c.avg_minutes >= b.median_minutes * 1.5 THEN 'very_heavy'
                    WHEN c.avg_minutes >= b.median_minutes * 1.2 THEN 'heavy'
                    ELSE 'normal'
                  END AS difficulty_band
                FROM cleaned c
                CROSS JOIN baseline b
                JOIN core.locations loc
                  ON loc.id = c.location_id
                  AND loc.location_type = 'transit_stop'
                JOIN core.location_external_ids lei
                  ON lei.location_id = loc.id
                  AND lei.source_system = 'metro_stop'
                LEFT JOIN public.stops s
                  ON s.stop_id = lei.external_id
                WHERE c.avg_minutes >= b.median_minutes * 1.2
                LIMIT 25;
            `,
      // B. Routes with High Difficulty Density
      heavyRoutes: `
                WITH today AS (
                  SELECT CURRENT_DATE AS service_date
                ),
                route_work AS (
                  SELECT
                    asg.source_ref      AS route_id,
                    asg.assignment_type AS pool_label,
                    SUM(EXTRACT(EPOCH FROM (v.ended_at - v.started_at)) / 60.0) AS total_minutes,
                    COUNT(*) AS stop_count
                  FROM core.visits v
                  JOIN core.assignments asg
                    ON asg.id = v.assignment_id
                  JOIN today t
                    ON v.ended_at::date = t.service_date
                  WHERE v.outcome = 'completed'
                    AND v.ended_at IS NOT NULL
                  GROUP BY
                    asg.source_ref,
                    asg.assignment_type
                ),
                density AS (
                  SELECT
                    route_id,
                    pool_label,
                    total_minutes / NULLIF(stop_count, 0) AS minutes_per_stop
                  FROM route_work
                )
                SELECT
                  route_id,
                  pool_label,
                  CASE
                    WHEN minutes_per_stop >= 18 THEN 'high'
                    WHEN minutes_per_stop >= 14 THEN 'elevated'
                    ELSE 'normal'
                  END AS difficulty_density_band
                FROM density
                WHERE minutes_per_stop >= 14;
            `,
      // C. Hotspot Concentration
      hotspots: `
                WITH heavy_stops AS (
                  SELECT
                    v.location_id
                  FROM core.visits v
                  WHERE v.outcome = 'completed'
                    AND v.ended_at IS NOT NULL
                    AND v.ended_at::date = CURRENT_DATE
                  GROUP BY v.location_id
                  HAVING AVG(EXTRACT(EPOCH FROM (v.ended_at - v.started_at)) / 60.0) >= 15
                )
                SELECT
                  asg.assignment_type      AS pool_label,
                  COUNT(*)::int            AS heavy_stop_count
                FROM heavy_stops hs
                JOIN core.assignments asg
                  ON asg.location_id = hs.location_id
                GROUP BY asg.assignment_type
                ORDER BY heavy_stop_count DESC;
            `
    };

    const [heavyStopsRes, heavyRoutesRes, hotspotsRes] = await Promise.all([
      client.query(queries.heavyStops),
      client.query(queries.heavyRoutes),
      client.query(queries.hotspots)
    ]);

    res.json({
      heavy_stops: heavyStopsRes.rows,
      heavy_routes: heavyRoutesRes.rows,
      hotspot_areas: hotspotsRes.rows
    });
  } catch (err: any) {
    console.error("Error in /api/ops/control-center/difficulty:", err);
    res.status(500).json({ error: "Failed to fetch difficulty indicators" });
  } finally {
    try { await client.query(`SELECT set_config('app.current_org_id', '', false)`); } catch { /* best-effort reset */ }
    client.release();
  }
});

export const controlCenterRoutes = ccRouter;
