import { PoolClient } from "pg";

export interface InfraIssueInput {
    issue_type: string;
    photo_key?: string;
    component?: string;
    cause?: string;
    notes?: string | null;
}

export async function createInfrastructureIssuesForRouteRunStop(
    client: PoolClient,
    params: {
        routeRunStopId: number | string;
        stopId: number;
        assetId?: string | null;
        reportedBy: number;
        issues: InfraIssueInput[];
    }
) {
    if (!params.issues || params.issues.length === 0) {
        return [];
    }

    let assetId = params.assetId;

    // Derive assetId if missing
    if (!assetId) {
        const lookupRes = await client.query(
            `SELECT asset_id FROM route_run_stops WHERE id = $1`,
            [params.routeRunStopId]
        );
        if (lookupRes.rows.length > 0) {
            assetId = lookupRes.rows[0].asset_id;
        }
    }

    const insertedRows = [];

    for (const issue of params.issues) {
        const result = await client.query(
            `
            INSERT INTO public.infrastructure_issues (
                route_run_stop_id,
                stop_id,
                asset_id,
                reported_by,
                issue_type,
                photo_key,
                component,
                cause,
                notes,
                details,
                needs_facilities,
                reported_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
            RETURNING *
            `,
            [
                params.routeRunStopId,
                params.stopId,
                assetId || null,
                params.reportedBy,
                issue.issue_type,
                issue.photo_key || null,
                issue.component ?? null,
                issue.cause ?? 'unknown',
                issue.notes ?? null,
                JSON.stringify({ source: 'ul_flow' }),
                true,
            ]
        );
        insertedRows.push(result.rows[0]);
    }

    return insertedRows;
}
