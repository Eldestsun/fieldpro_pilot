import { pool } from "../db";

export interface Stop {
    stop_id: string;
    pool_id: string | null;
    is_hotspot: boolean;
    compactor: boolean;
    has_trash: boolean;
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

export async function listStops(params: {
    page: number;
    pageSize: number;
    q?: string;
    pool_id?: string;
}): Promise<{ items: Stop[]; total: number }> {
    const { page, pageSize, q, pool_id } = params;
    const offset = (page - 1) * pageSize;
    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

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
        conditions.push(`pool_id = $${idx++}`);
        values.push(pool_id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countQuery = `SELECT COUNT(*) FROM public.transit_stops ${whereClause}`;
    const countResult = await pool.query(countQuery, values);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataQuery = `
        SELECT 
            stop_id,
            pool_id,
            is_hotspot,
            compactor,
            has_trash,
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

    const dataResult = await pool.query(dataQuery, values);

    return {
        items: dataResult.rows,
        total,
    };
}

export async function updateStop(
    stopId: string,
    data: { pool_id?: string | null; notes?: string | null }
): Promise<Stop | null> {
    const client = await pool.connect();
    try {
        // Validate pool_id if provided
        if (data.pool_id) {
            const poolCheck = await client.query("SELECT 1 FROM route_pools WHERE id = $1", [
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
            fields.push(`pool_id = $${idx++}`);
            values.push(data.pool_id);
        }
        if (data.notes !== undefined) {
            fields.push(`notes = $${idx++}`);
            values.push(data.notes);
        }

        if (fields.length === 0) return null;

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

        const result = await client.query(query, values);
        return result.rows[0] || null;
    } finally {
        client.release();
    }
}

export async function bulkUpdateStops(
    stopIds: string[],
    data: {
        pool_id?: string | null;
        is_hotspot?: boolean;
        compactor?: boolean;
        has_trash?: boolean;
    }
): Promise<{ updated_count: number }> {
    if (stopIds.length === 0) return { updated_count: 0 };

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // Validate pool_id if provided
        if (data.pool_id) {
            const poolCheck = await client.query("SELECT 1 FROM route_pools WHERE id = $1", [
                data.pool_id,
            ]);
            if (poolCheck.rowCount === 0) {
                throw new Error(`Pool '${data.pool_id}' does not exist`);
            }
        }

        let totalUpdated = 0;

        // Execute separate updates for each field to avoid complex dynamic SQL for bulk ops
        // This is safer and cleaner than building a massive CASE statement or dynamic string

        if (data.pool_id !== undefined) {
            const res = await client.query(
                `UPDATE public.transit_stops SET pool_id = $1 WHERE stop_id = ANY($2::text[])`,
                [data.pool_id, stopIds]
            );
            totalUpdated = Math.max(totalUpdated, res.rowCount || 0);
        }

        if (data.is_hotspot !== undefined) {
            const res = await client.query(
                `UPDATE public.transit_stops SET is_hotspot = $1 WHERE stop_id = ANY($2::text[])`,
                [data.is_hotspot, stopIds]
            );
            totalUpdated = Math.max(totalUpdated, res.rowCount || 0);
        }

        if (data.compactor !== undefined) {
            const res = await client.query(
                `UPDATE public.transit_stops SET compactor = $1 WHERE stop_id = ANY($2::text[])`,
                [data.compactor, stopIds]
            );
            totalUpdated = Math.max(totalUpdated, res.rowCount || 0);
        }

        if (data.has_trash !== undefined) {
            const res = await client.query(
                `UPDATE public.transit_stops SET has_trash = $1 WHERE stop_id = ANY($2::text[])`,
                [data.has_trash, stopIds]
            );
            totalUpdated = Math.max(totalUpdated, res.rowCount || 0);
        }

        await client.query("COMMIT");
        return { updated_count: totalUpdated };
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }
}
