import { pool } from "../../../db";

/**
 * Load full route run by ID
 */
export async function loadRouteRunById(id: number | string) {
    const query = `
    SELECT
      rr.id                  AS route_run_id,
      rr.user_id,
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
      cl.picked_up_litter,
      cl.emptied_trash,
      cl.washed_shelter,
      cl.washed_pad,
      cl.washed_can
    FROM route_runs rr
    LEFT JOIN route_pools rp ON rp.id = rr.route_pool_id
    LEFT JOIN identity_directory id_dir ON id_dir.oid = rr.assigned_user_oid
    LEFT JOIN identity_directory creator ON creator.oid = rr.created_by_oid
    JOIN route_run_stops rrs ON rrs.route_run_id = rr.id
    JOIN stops s ON s.stop_id = rrs.stop_id
    LEFT JOIN clean_logs cl ON cl.route_run_stop_id = rrs.id
    WHERE rr.id = $1
    ORDER BY rrs.sequence;
  `;

    // Fetch observation-based events
    const eventsQuery = `
      SELECT
        sp.route_run_stop_id,
        o.observation_type,
        o.created_at AS observed_at,
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
        o.created_at
    `;

    // Execute queries in parallel
    const [runRes, eventsRes] = await Promise.all([
        pool.query(query, [id]),
        pool.query(eventsQuery, [id])
    ]);

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
        user_id: first.user_id,
        assigned_user: first.assigned_user_oid ? {
            oid: first.assigned_user_oid,
            display_name: first.assigned_user_name,
            role: first.assigned_user_role
        } : undefined,
        created_by: first.created_by_oid ? {
            oid: first.created_by_oid,
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
