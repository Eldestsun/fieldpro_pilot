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
            "STOP_ID" ILIKE $${idx} OR 
            "ON_STREET_NAME" ILIKE $${idx} OR 
            "INTERSECTION_LOC" ILIKE $${idx}
        )`);
        values.push(`%${q}%`);
        idx++;
    }

    if (pool_id) {
        conditions.push(`pool_id = $${idx++}`);
        values.push(pool_id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countQuery = `SELECT COUNT(*) FROM stops ${whereClause}`;
    const countResult = await pool.query(countQuery, values);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataQuery = `
        SELECT 
            "STOP_ID" as stop_id,
            pool_id,
            is_hotspot,
            compactor,
            has_trash,
            "ON_STREET_NAME" as on_street_name,
            "INTERSECTION_LOC" as intersection_loc,
            "TRF_DISTRICT_CODE" as trf_district_code,
            last_level3_at,
            notes
        FROM stops
        ${whereClause}
        ORDER BY "STOP_ID" ASC
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
            UPDATE stops
            SET ${fields.join(", ")}
            WHERE "STOP_ID" = $${idx}
            RETURNING 
                "STOP_ID" as stop_id,
                pool_id,
                is_hotspot,
                compactor,
                has_trash,
                "ON_STREET_NAME" as on_street_name,
                "INTERSECTION_LOC" as intersection_loc,
                "TRF_DISTRICT_CODE" as trf_district_code,
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
                `UPDATE stops SET pool_id = $1 WHERE "STOP_ID" = ANY($2::text[])`,
                [data.pool_id, stopIds]
            );
            totalUpdated = Math.max(totalUpdated, res.rowCount || 0);
        }

        if (data.is_hotspot !== undefined) {
            const res = await client.query(
                `UPDATE stops SET is_hotspot = $1 WHERE "STOP_ID" = ANY($2::text[])`,
                [data.is_hotspot, stopIds]
            );
            totalUpdated = Math.max(totalUpdated, res.rowCount || 0);
        }

        if (data.compactor !== undefined) {
            const res = await client.query(
                `UPDATE stops SET compactor = $1 WHERE "STOP_ID" = ANY($2::text[])`,
                [data.compactor, stopIds]
            );
            totalUpdated = Math.max(totalUpdated, res.rowCount || 0);
        }

        if (data.has_trash !== undefined) {
            const res = await client.query(
                `UPDATE stops SET has_trash = $1 WHERE "STOP_ID" = ANY($2::text[])`,
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
