import { pool } from "../db";
import { PoolClient } from "pg";

export interface Stop {
    stop_id: string;
    pool_id: string | null;
    is_hotspot: boolean;
    compactor: boolean;
    has_trash: boolean;
    active: boolean;
    on_street_name: string;
    intersection_loc: string;
    trf_district_code: string;
    last_level3_at: Date | null;
    notes: string | null;
    bearing_code: string | null;
    hastus_cross_street_name: string | null;
    lon: number | null;
    lat: number | null;
}

/**
 * All functions accept an optional PoolClient. When provided the caller has
 * already set app.current_org_id via withOrgContext(), so the RLS policies
 * on transit_stops and route_pools filter to the active tenant. When omitted
 * the query runs unscoped (COALESCE bypass — all rows visible).
 */

export async function listStops(params: {
    page: number;
    pageSize: number;
    q?: string;
    pool_id?: string;
    /** T2-A2: retired stops (active = false) are hidden unless explicitly requested. */
    include_retired?: boolean;
}, client?: PoolClient): Promise<{ items: Stop[]; total: number }> {
    const { page, pageSize, q, pool_id, include_retired } = params;
    const offset = (page - 1) * pageSize;
    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (!include_retired) {
        conditions.push(`active = true`);
    }

    if (q) {
        conditions.push(`(
            stop_id ILIKE $${idx} OR
            on_street_name ILIKE $${idx} OR
            intersection_loc ILIKE $${idx}
        )`);
        values.push(`%${q}%`);
        idx++;
    }

    if (pool_id) {
        conditions.push(`stop_id IN (SELECT stop_id FROM public.stop_pool_memberships WHERE pool_id = $${idx++} AND active = true)`);
        values.push(pool_id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countQuery = `SELECT COUNT(*) FROM public.transit_stops ${whereClause}`;
    const countResult = client
        ? await client.query(countQuery, values)
        : await pool.query(countQuery, values);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataQuery = `
        SELECT
            stop_id,
            pool_id,
            is_hotspot,
            compactor,
            has_trash,
            active,
            on_street_name,
            intersection_loc,
            trf_district_code,
            bearing_code,
            hastus_cross_street_name,
            lon,
            lat,
            last_level3_at,
            notes
        FROM public.transit_stops
        ${whereClause}
        ORDER BY stop_id ASC
        LIMIT $${idx++} OFFSET $${idx++}
    `;
    values.push(pageSize, offset);

    const dataResult = client
        ? await client.query(dataQuery, values)
        : await pool.query(dataQuery, values);

    return {
        items: dataResult.rows,
        total,
    };
}

export async function updateStop(
    stopId: string,
    data: {
        pool_id?: string | null;
        notes?: string | null;
        // T2-A2: retire/reactivate. Also the row-level flag toggles — these were
        // advertised in the OpenAPI schema and PATCHed by AdminStopsPanel's
        // per-row toggles, but silently unhandled here (fields.length === 0 →
        // null → 404). Fixed alongside `active` since it is the same block.
        active?: boolean;
        is_hotspot?: boolean;
        compactor?: boolean;
        has_trash?: boolean;
    },
    client?: PoolClient,
): Promise<Stop | null> {
    const ownClient = client ?? await pool.connect();
    const release = client ? () => {} : () => ownClient.release();
    const ownTx = !client && data.pool_id !== undefined;
    try {
        if (ownTx) await ownClient.query("BEGIN");

        // Validate pool_id if provided
        if (data.pool_id) {
            const poolCheck = await ownClient.query("SELECT 1 FROM route_pools WHERE id = $1", [
                data.pool_id,
            ]);
            if (poolCheck.rowCount === 0) {
                throw new Error(`Pool '${data.pool_id}' does not exist`);
            }
        }

        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (data.pool_id !== undefined) {
            // DEPRECATED: transit_stops.pool_id is a cache column. Use stop_pool_memberships.
            fields.push(`pool_id = $${idx++}`);
            values.push(data.pool_id);
        }
        if (data.notes !== undefined) {
            fields.push(`notes = $${idx++}`);
            values.push(data.notes);
        }
        for (const flag of ["active", "is_hotspot", "compactor", "has_trash"] as const) {
            if (data[flag] !== undefined) {
                fields.push(`${flag} = $${idx++}`);
                values.push(data[flag]);
            }
        }

        if (fields.length === 0) {
            if (ownTx) await ownClient.query("ROLLBACK");
            return null;
        }

        values.push(stopId);
        const query = `
            UPDATE public.transit_stops
            SET ${fields.join(", ")}
            WHERE stop_id = $${idx}
            RETURNING
                stop_id,
                pool_id,
                is_hotspot,
                compactor,
                has_trash,
                active,
                on_street_name,
                intersection_loc,
                trf_district_code,
                bearing_code,
                hastus_cross_street_name,
                lon,
                lat,
                last_level3_at,
                notes
        `;

        const result = await ownClient.query(query, values);

        // Dual write: keep stop_pool_memberships in sync with transit_stops.pool_id
        if (data.pool_id !== undefined) {
            if (data.pool_id === null) {
                await ownClient.query(
                    `UPDATE public.stop_pool_memberships SET active = false WHERE stop_id = $1`,
                    [stopId],
                );
            } else {
                await ownClient.query(`
                    INSERT INTO public.stop_pool_memberships (stop_id, pool_id, org_id)
                    SELECT $1, $2, org_id FROM public.transit_stops WHERE stop_id = $1
                    ON CONFLICT (stop_id, pool_id) DO UPDATE SET active = true
                `, [stopId, data.pool_id]);
                await ownClient.query(
                    `UPDATE public.stop_pool_memberships SET active = false
                     WHERE stop_id = $1 AND pool_id != $2`,
                    [stopId, data.pool_id],
                );
            }
        }

        if (ownTx) await ownClient.query("COMMIT");
        return result.rows[0] || null;
    } catch (err) {
        if (ownTx) await ownClient.query("ROLLBACK");
        throw err;
    } finally {
        release();
    }
}

export async function bulkUpdateStops(
    stopIds: string[],
    data: {
        pool_id?: string | null;
        is_hotspot?: boolean;
        compactor?: boolean;
        has_trash?: boolean;
    },
    client?: PoolClient,
): Promise<{ updated_count: number }> {
    if (stopIds.length === 0) return { updated_count: 0 };

    const ownClient = client ?? await pool.connect();
    const release = client ? () => {} : () => ownClient.release();
    try {
        if (!client) await ownClient.query("BEGIN");

        // Validate pool_id if provided
        if (data.pool_id) {
            const poolCheck = await ownClient.query("SELECT 1 FROM route_pools WHERE id = $1", [
                data.pool_id,
            ]);
            if (poolCheck.rowCount === 0) {
                throw new Error(`Pool '${data.pool_id}' does not exist`);
            }
        }

        let totalUpdated = 0;

        if (data.pool_id !== undefined) {
            // DEPRECATED: transit_stops.pool_id is a cache column. Use stop_pool_memberships.
            const res = await ownClient.query(
                `UPDATE public.transit_stops SET pool_id = $1 WHERE stop_id = ANY($2::text[])`,
                [data.pool_id, stopIds]
            );
            totalUpdated = Math.max(totalUpdated, res.rowCount || 0);

            // Dual write: keep stop_pool_memberships in sync
            if (data.pool_id === null) {
                await ownClient.query(
                    `UPDATE public.stop_pool_memberships SET active = false WHERE stop_id = ANY($1::text[])`,
                    [stopIds],
                );
            } else {
                await ownClient.query(`
                    INSERT INTO public.stop_pool_memberships (stop_id, pool_id, org_id)
                    SELECT ts.stop_id, $1, ts.org_id FROM public.transit_stops ts
                    WHERE ts.stop_id = ANY($2::text[])
                    ON CONFLICT (stop_id, pool_id) DO UPDATE SET active = true
                `, [data.pool_id, stopIds]);
                await ownClient.query(
                    `UPDATE public.stop_pool_memberships SET active = false
                     WHERE stop_id = ANY($1::text[]) AND pool_id != $2`,
                    [stopIds, data.pool_id],
                );
            }
        }

        if (data.is_hotspot !== undefined) {
            const res = await ownClient.query(
                `UPDATE public.transit_stops SET is_hotspot = $1 WHERE stop_id = ANY($2::text[])`,
                [data.is_hotspot, stopIds]
            );
            totalUpdated = Math.max(totalUpdated, res.rowCount || 0);
        }

        if (data.compactor !== undefined) {
            const res = await ownClient.query(
                `UPDATE public.transit_stops SET compactor = $1 WHERE stop_id = ANY($2::text[])`,
                [data.compactor, stopIds]
            );
            totalUpdated = Math.max(totalUpdated, res.rowCount || 0);
        }

        if (data.has_trash !== undefined) {
            const res = await ownClient.query(
                `UPDATE public.transit_stops SET has_trash = $1 WHERE stop_id = ANY($2::text[])`,
                [data.has_trash, stopIds]
            );
            totalUpdated = Math.max(totalUpdated, res.rowCount || 0);
        }

        if (!client) await ownClient.query("COMMIT");
        return { updated_count: totalUpdated };
    } catch (err) {
        if (!client) await ownClient.query("ROLLBACK");
        throw err;
    } finally {
        release();
    }
}
