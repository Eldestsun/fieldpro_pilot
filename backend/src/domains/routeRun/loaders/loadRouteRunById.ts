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
      s."STOP_ID",
      s."STOP_ID"            AS stop_number,
      s."TRF_DISTRICT_CODE",
      s."BAY_CODE",
      s."BEARING_CODE",
      s."ON_STREET_NAME",
      s."INTERSECTION_LOC",
      s."HASTUS_CROSS_STREET_NAME",
      s."NUM_SHELTERS",
      s.is_hotspot,
      s.compactor,
      s.has_trash,
      s.lon,
      s.lat,
      s.notes
    FROM route_runs rr
    LEFT JOIN route_pools rp ON rp.id = rr.route_pool_id
    LEFT JOIN identity_directory id_dir ON id_dir.oid = rr.assigned_user_oid
    LEFT JOIN identity_directory creator ON creator.oid = rr.created_by_oid
    JOIN route_run_stops rrs ON rrs.route_run_id = rr.id
    JOIN stops s ON s."STOP_ID" = rrs.stop_id
    WHERE rr.id = $1
    ORDER BY rrs.sequence;
  `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
        return null;
    }

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
            stop_id: r.STOP_ID,
            asset_id: r.asset_id,
            stopNumber: r.stop_number,
            sequence: r.sequence,
            status: r.stop_status,
            completed_at: r.completed_at,
            planned_distance_m: r.planned_distance_m,
            planned_duration_s: r.planned_duration_s,
            trash_volume: r.trash_volume,
            location: { lon: r.lon, lat: r.lat },
            on_street_name: r.ON_STREET_NAME,
            cross_street: r.HASTUS_CROSS_STREET_NAME,
            intersection_loc: r.INTERSECTION_LOC,
            bearing_code: r.BEARING_CODE,
            trf_district_code: r.TRF_DISTRICT_CODE,
            bay_code: r.BAY_CODE,
            num_shelters: r.NUM_SHELTERS,
            is_hotspot: r.is_hotspot,
            compactor: r.compactor,
            has_trash: r.has_trash,
            notes: r.notes,
        })),
    };
}
