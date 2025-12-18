import { PoolClient } from "pg";

export async function createHazardForRouteRunStop(
    client: PoolClient,
    params: {
        routeRunStopId: number | string;
        userId: number;
        hazardTypes: string[];
        severity?: number;
        notes?: string;
        photoKey?: string; // Singular column for primary photo
        photoKeys?: string[]; // Kept for backward compatibility or extra photos in details
        source?: string;
    }
) {
    const { routeRunStopId, userId, hazardTypes, severity, notes, photoKey, photoKeys } = params;

    // 1. Look up stop_id from route_run_stops
    const lookupQuery = `
        SELECT stop_id 
        FROM route_run_stops 
        WHERE id = $1
    `;
    const lookupRes = await client.query(lookupQuery, [routeRunStopId]);

    if (lookupRes.rows.length === 0) {
        throw new Error(`Route run stop ${routeRunStopId} not found`);
    }

    const stopId = lookupRes.rows[0].stop_id;

    // Determine primary hazard type (old string column)
    let hazardType = "other";
    if (hazardTypes.length === 1) {
        hazardType = hazardTypes[0];
    } else if (hazardTypes.length > 1) {
        hazardType = "multiple";
    }

    // 2. Insert hazard
    const insertQuery = `
        INSERT INTO hazards (
            stop_id,
            route_run_stop_id,
            reported_by,
            hazard_type,
            photo_key,
            severity,
            notes,
            details,
            reported_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        RETURNING *
    `;

    const details = {
        hazard_types: hazardTypes,
        ...(photoKeys && photoKeys.length > 0 ? { photo_keys: photoKeys } : {}),
        source: params.source || "ul_safety_flow",
    };

    const insertRes = await client.query(insertQuery, [
        stopId,
        routeRunStopId,
        userId,
        hazardType,
        photoKey || null,
        severity || 1, // Default severity
        notes || null, // Store UL notes in notes column
        details,
    ]);

    return insertRes.rows[0];
}
