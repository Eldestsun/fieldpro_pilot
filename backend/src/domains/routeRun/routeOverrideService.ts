
import { PoolClient } from "pg";
import { v4 as uuidv4 } from "uuid";

export interface RouteOverride {
    id: string;
    pool_id: string;
    stop_id: string;
    override_type: "FORCE_INCLUDE" | "FORCE_EXCLUDE" | "PRIORITY_BUMP";
    value: number | null;
    created_by: string;
    created_at: Date;
}

export interface AddOverridePayload {
    pool_id: string;
    stop_id: string;
    override_type: "FORCE_INCLUDE" | "FORCE_EXCLUDE" | "PRIORITY_BUMP";
    value?: number;
}

/**
 * Get all overrides for a specific pool
 */
export async function getOverridesByPool(
    poolId: string,
    client: PoolClient | any
): Promise<RouteOverride[]> {
    const query = `
    SELECT id, pool_id, stop_id, override_type, value, created_by, created_at
    FROM lead_route_overrides
    WHERE pool_id = $1
  `;
    const result = await client.query(query, [poolId]);
    return result.rows;
}

/**
 * Add a new override. userOid MUST come from auth token.
 */
export async function addOverride(
    payload: AddOverridePayload,
    userOid: string,
    client: PoolClient | any
): Promise<RouteOverride> {
    const { pool_id, stop_id, override_type, value } = payload;
    const id = uuidv4();

    const query = `
    INSERT INTO lead_route_overrides (
      id, pool_id, stop_id, override_type, value, created_by
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;

    const result = await client.query(query, [
        id,
        pool_id,
        stop_id,
        override_type,
        value ?? null,
        userOid,
    ]);

    return result.rows[0];
}

/**
 * Delete an override by ID. Idempotent.
 */
export async function deleteOverride(
    id: string,
    client: PoolClient | any
): Promise<void> {
    const query = `DELETE FROM lead_route_overrides WHERE id = $1`;
    await client.query(query, [id]);
}
