
import { PoolClient } from "pg";
import { ensureVisitForRouteRunStop } from "../../domains/visit/visitService";

export interface StopPhoto {
    id: string;
    route_run_stop_id: string;
    s3_key: string;
    kind: string;
    captured_at: Date;
    created_by_oid: string;
    url: string;
}

export async function createStopPhotos(
    client: PoolClient | any,
    params: {
        routeRunStopId: number;
        userOid: string;
        s3Keys: string[];
        kind?: string;
    }
): Promise<void> {
    const { routeRunStopId, userOid, s3Keys, kind = "completion" } = params;

    if (s3Keys.length === 0) return;

    // 1. Fetch asset_id (needed for consistency)
    const lookupRes = await client.query(
        `SELECT asset_id FROM route_run_stops WHERE id = $1`,
        [routeRunStopId]
    );
    let assetId = null;
    if (lookupRes.rows.length > 0) {
        assetId = lookupRes.rows[0].asset_id;
    }

    // 2. Ensure visit exists
    const visitId = await ensureVisitForRouteRunStop(client, {
        routeRunStopId: Number(routeRunStopId),
        actorOid: userOid,
        visitType: "service",
    });

    const query = `
    INSERT INTO stop_photos (
      visit_id, route_run_stop_id, asset_id, s3_key, kind, created_by_oid, captured_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
  `;

    for (const key of s3Keys) {
        await client.query(query, [visitId, routeRunStopId, assetId, key, kind, userOid]);
    }
}

import { getPresignedReadUrl } from "../../s3Client";

export async function countStopPhotosByRouteRunStop(
    client: PoolClient | any,
    routeRunStopId: number,
    kind?: string
): Promise<number> {
    let query = `SELECT COUNT(*) as count FROM stop_photos WHERE route_run_stop_id = $1`;
    const params: any[] = [routeRunStopId];

    if (kind) {
        query += ` AND kind = $2`;
        params.push(kind);
    }

    const res = await client.query(query, params);
    return parseInt(res.rows[0].count, 10);
}

export async function listStopPhotosByRouteRunStop(
    client: PoolClient | any,
    routeRunStopId: number,
    kind?: string
): Promise<StopPhoto[]> {
    let query = `
    SELECT id, route_run_stop_id, s3_key, kind, captured_at, created_by_oid
    FROM stop_photos
    WHERE route_run_stop_id = $1
  `;
    const params: any[] = [routeRunStopId];

    if (kind) {
        query += ` AND kind = $2`;
        params.push(kind);
    }

    query += ` ORDER BY captured_at ASC, id ASC`;

    const res = await client.query(query, params);

    // Map to include signed URLs
    const photos: StopPhoto[] = await Promise.all(
        res.rows.map(async (row: any) => {
            let url = "";
            if (row.s3_key) {
                try {
                    url = await getPresignedReadUrl(row.s3_key);
                } catch (err) {
                    console.error(`Failed to sign URL for key ${row.s3_key}`, err);
                }
            }
            return {
                ...row,
                url,
            };
        })
    );

    return photos;
}
