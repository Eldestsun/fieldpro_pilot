import { pool } from "../db";
import { PoolClient } from "pg";

export interface RoutePool {
    id: string;
    label: string;
    trf_district?: string;
    active: boolean;
    default_max_minutes?: number;
    created_at: Date;
    updated_at: Date;
}

/**
 * All functions accept an optional PoolClient. When provided the caller has
 * already set app.current_org_id via withOrgContext(), so the RLS policy on
 * route_pools will filter results to the active tenant. When omitted the
 * query runs unscoped through the pool (COALESCE bypass — all rows visible).
 */

export async function getAllPools(client?: PoolClient): Promise<RoutePool[]> {
    const query = `
        SELECT id, label, trf_district, active, default_max_minutes, created_at, updated_at
        FROM route_pools
        ORDER BY id ASC
    `;
    const result = client ? await client.query(query) : await pool.query(query);
    return result.rows;
}

export async function createPool(
    data: {
        id: string;
        label: string;
        trf_district?: string;
        default_max_minutes?: number;
    },
    orgId: number,
    client?: PoolClient,
): Promise<RoutePool> {
    const query = `
        INSERT INTO route_pools (id, label, trf_district, active, default_max_minutes, org_id)
        VALUES ($1, $2, $3, true, $4, $5)
        RETURNING *
    `;
    const params = [data.id, data.label, data.trf_district || null, data.default_max_minutes || null, orgId];
    const result = client ? await client.query(query, params) : await pool.query(query, params);
    return result.rows[0];
}

export async function updatePool(
    id: string,
    data: {
        label?: string;
        trf_district?: string;
        active?: boolean;
        default_max_minutes?: number;
    },
    client?: PoolClient,
): Promise<RoutePool | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.label !== undefined) {
        fields.push(`label = $${idx++}`);
        values.push(data.label);
    }
    if (data.trf_district !== undefined) {
        fields.push(`trf_district = $${idx++}`);
        values.push(data.trf_district);
    }
    if (data.active !== undefined) {
        fields.push(`active = $${idx++}`);
        values.push(data.active);
    }
    if (data.default_max_minutes !== undefined) {
        fields.push(`default_max_minutes = $${idx++}`);
        values.push(data.default_max_minutes);
    }

    if (fields.length === 0) return null;

    values.push(id);
    const query = `
        UPDATE route_pools
        SET ${fields.join(", ")}, updated_at = NOW()
        WHERE id = $${idx}
        RETURNING *
    `;

    const result = client ? await client.query(query, values) : await pool.query(query, values);
    return result.rows[0] || null;
}

export async function softDeletePool(id: string, client?: PoolClient): Promise<RoutePool | null> {
    const query = `
        UPDATE route_pools
        SET active = false, updated_at = NOW()
        WHERE id = $1
        RETURNING *
    `;
    const result = client ? await client.query(query, [id]) : await pool.query(query, [id]);
    return result.rows[0] || null;
}
