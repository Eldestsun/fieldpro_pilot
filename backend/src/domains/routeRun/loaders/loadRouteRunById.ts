import { withOrgContext } from "../../../db";

/**
 * Load full route run by ID, scoped to the caller's org.
 *
 * Both the outer `route_runs` row and the JOIN-resolved `identity_directory`
 * rows are evaluated under the caller's `app.current_org_id`, so cross-tenant
 * reads are fail-closed: requesting a route_run that does not belong to
 * `orgId` returns `null`, not the foreign row.
 *
 * The two queries that previously ran on a bare pool connection — and
 * therefore returned NULL `assigned_user_name` / `created_by_name` for every
 * route_run because the strict identity_directory RLS policy filtered the
 * JOIN — now both run inside `withOrgContext`, which also fixes that latent
 * display-name bug.
 */
export async function loadRouteRunById(id: number | string, orgId: number | string) {
    const query = `
    SELECT
      rr.id                  AS route_run_id,
      rr.route_pool_id,
      rr.base_id,
      rr.run_date,
      rr.status,
      rr.started_at,
      rr.finished_at,
      rr.total_distance_m,
      rr.total_duration_s,
      rr.created_at          AS route_run_created_at,
      rr.updated_at          AS route_run_updated_at,
      rr.assigned_user_oid,
      id_dir.display_name    AS assigned_user_name,
      id_dir.last_seen_role  AS assigned_user_role,
      rr.created_by_oid,
      creator.display_name   AS created_by_name,
      rp.label               AS route_pool_label,
      rrs.id                 AS route_run_stop_id,
      rrs.sequence,
      rrs.status             AS stop_status,
      rrs.completed_at,
      rrs.planned_distance_m,
      rrs.planned_duration_s,
      rrs.created_at         AS route_run_stop_created_at,
      rrs.updated_at         AS route_run_stop_updated_at,
      rrs.trash_volume,
      COALESCE(rrs.asset_id, s.asset_id) AS asset_id,
      s.stop_id,
      s.stop_id              AS stop_number,
      s.trf_district_code,
      s.bay_code,
      s.bearing_code,
      s.on_street_name,
      s.intersection_loc,
      s.hastus_cross_street_name,
      s.num_shelters,
      s.is_hotspot,
      s.compactor,
      s.has_trash,
      s.lon,
      s.lat,
      s.notes,
      COALESCE(cl.picked_up_litter, false) AS picked_up_litter,
      COALESCE(cl.emptied_trash, false)    AS emptied_trash,
      COALESCE(cl.washed_shelter, false)   AS washed_shelter,
      COALESCE(cl.washed_pad, false)       AS washed_pad,
      COALESCE(cl.washed_can, false)       AS washed_can
    FROM route_runs rr
    LEFT JOIN route_pools rp ON rp.id = rr.route_pool_id
    -- CONTROLLED EXCEPTION — identity_directory JOIN
    -- This is the only permitted JOIN to identity_directory in the codebase.
    -- Purpose: route detail view shows the Lead who assigned the route and
    -- the UL it was assigned to — operational necessity for route management.
    -- Constraint: this display name MUST NOT flow into any intelligence surface
    -- (risk maps, condition history, effort history, Control Center dashboards).
    -- Any new JOIN to identity_directory requires explicit review. See R11 spec.
    LEFT JOIN identity_directory id_dir ON id_dir.oid = rr.assigned_user_oid
    LEFT JOIN identity_directory creator ON creator.oid = rr.created_by_oid
    JOIN route_run_stops rrs ON rrs.route_run_id = rr.id
    JOIN stops s ON s.stop_id = rrs.stop_id
    -- SEAM-C: the 5 cleaning booleans derive from canonical action observations, not
    -- the clipped public.clean_logs adapter. Per stop, resolve its visit(s) via the
    -- canonical spine (visit → assignment.source_ref = route_run, visit.location →
    -- stop_id through core.location_external_ids) and pivot obs_kind='action' rows.
    -- Absence ⇒ false (COALESCE above) — no manufactured state. Not filtered on
    -- v.outcome so an in-progress stop reflects actions as they are recorded.
    LEFT JOIN LATERAL (
      -- keys off o.intervention (the stable action identifier, = the type key for
      -- action rows) to match buildCleanLogsCanonicalQueries, the canonical pivot.
      SELECT
        BOOL_OR(o.intervention = 'picked_up_litter') AS picked_up_litter,
        BOOL_OR(o.intervention = 'emptied_trash')    AS emptied_trash,
        BOOL_OR(o.intervention = 'washed_shelter')   AS washed_shelter,
        BOOL_OR(o.intervention = 'washed_pad')       AS washed_pad,
        BOOL_OR(o.intervention = 'washed_can')       AS washed_can
      FROM core.visits v
      JOIN core.assignments a
        ON a.id = v.assignment_id
        AND a.source_system = 'route_runs'
        AND a.source_ref = rr.id::text
      JOIN core.location_external_ids lei
        ON lei.location_id = v.location_id
        AND lei.source_system = 'metro_stop'
        AND lei.external_id = rrs.stop_id
      LEFT JOIN core.observations o
        ON o.visit_id = v.id
        AND o.obs_kind = 'action'
    ) cl ON true
    WHERE rr.id = $1
    ORDER BY rrs.sequence;
  `;

    // Fetch observation-based events
    const eventsQuery = `
      SELECT
        sp.route_run_stop_id,
        o.observation_type,
        o.observed_at,
        array_agg(sp.s3_key)
          FILTER (WHERE sp.s3_key IS NOT NULL) AS photo_keys
      FROM public.route_run_stops rrs
      JOIN public.stop_photos sp ON sp.route_run_stop_id = rrs.id
      JOIN core.visits v ON v.id = sp.visit_id
      JOIN core.observations o ON o.visit_id = v.id
      WHERE rrs.route_run_id = $1
        AND o.observation_type = 'spot_check'
      GROUP BY
        sp.route_run_stop_id,
        o.observation_type,
        o.observed_at
    `;

    // Both queries run inside withOrgContext so RLS filters route_runs and
    // the identity_directory JOIN by the caller's org. Parallelism is dropped:
    // the two queries share one pool connection (one org-context session),
    // which is the simpler and safer way to keep both reads on the same set
    // of session GUCs.
    const [runRes, eventsRes] = await withOrgContext(orgId, async (client) => {
        const a = await client.query(query, [id]);
        const b = await client.query(eventsQuery, [id]);
        return [a, b] as const;
    });

    if (runRes.rows.length === 0) {
        return null;
    }

    // Map events by stop ID
    const eventsByStop: Record<number, any[]> = {};
    eventsRes.rows.forEach((row: any) => {
        if (!eventsByStop[row.route_run_stop_id]) {
            eventsByStop[row.route_run_stop_id] = [];
        }
        eventsByStop[row.route_run_stop_id].push({
            type: row.observation_type,
            occurredAt: row.observed_at,
            photoKeys: row.photo_keys || []
        });
    });

    const result = runRes;

    const first = result.rows[0];
    return {
        id: first.route_run_id,
        // SEAM-A A4: the dead user_id sentinel (LEGACY_TRANSIT_USER_ID = 0) is dropped
        // from the detail payload — zero frontend consumers (A4-rider proof).
        // SEAM-C item 4 (founder-ruled 2026-07-08): the R11 controlled exception
        // surfaces the assigned worker's NAME/ROLE (operational reassignment need) —
        // never the raw OID. The identity_directory JOIN stays (it sources the names);
        // only the oid is trimmed from the payload. Presence is still gated on whether
        // an assigned/creating user exists.
        assigned_user: first.assigned_user_oid ? {
            display_name: first.assigned_user_name,
            role: first.assigned_user_role
        } : undefined,
        created_by: first.created_by_oid ? {
            display_name: first.created_by_name
        } : undefined,
        route_pool_id: first.route_pool_id,
        route_pool_label: first.route_pool_label,
        base_id: first.base_id,
        run_date: first.run_date,
        status: first.status,
        started_at: first.started_at,
        finished_at: first.finished_at,
        total_distance_m: first.total_distance_m,
        total_duration_s: first.total_duration_s,
        created_at: first.route_run_created_at,
        updated_at: first.route_run_updated_at,
        stops: result.rows.map((r: any) => ({
            route_run_stop_id: r.route_run_stop_id,
            stop_id: r.stop_id,
            asset_id: r.asset_id,
            stopNumber: r.stop_number,
            sequence: r.sequence,
            status: r.stop_status,
            completed_at: r.completed_at,
            planned_distance_m: r.planned_distance_m,
            planned_duration_s: r.planned_duration_s,
            trash_volume: r.trash_volume,
            location: { lon: r.lon, lat: r.lat },
            on_street_name: r.on_street_name,
            cross_street: r.hastus_cross_street_name,
            intersection_loc: r.intersection_loc,
            bearing_code: r.bearing_code,
            trf_district_code: r.trf_district_code,
            bay_code: r.bay_code,
            num_shelters: r.num_shelters,
            is_hotspot: r.is_hotspot,
            compactor: r.compactor,
            has_trash: r.has_trash,
            notes: r.notes,
            // Cleaning data
            picked_up_litter: r.picked_up_litter,
            emptied_trash: r.emptied_trash,
            washed_shelter: r.washed_shelter,
            washed_pad: r.washed_pad,
            washed_can: r.washed_can,
            events: eventsByStop[r.route_run_stop_id] || [], // Attach events
        })),
    };
}
