
import { Pool, PoolClient } from "pg";
import { deriveClientVisitId } from "../../domains/visit/visitService";

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
    clientOrPool: PoolClient | Pool | any,
    params: {
        routeRunStopId: number;
        userOid: string;
        s3Keys: string[];
        kind?: string;
    }
): Promise<void> {
    const { routeRunStopId, userOid, s3Keys, kind = "completion" } = params;

    if (s3Keys.length === 0) return;

    // Q-D (ISSUE-031 §3) — the evidence write path must be one transaction.
    // Across every key this function writes two canonical tables: core.evidence
    // and core.evidence_actor_audit (the no-grant identity sidecar). Run on
    // autocommit these are independent writes, so a mid-loop failure can leave
    // canonical evidence with no identity audit — or, worse, an identity audit
    // row whose evidence never landed. That orphan-identity state is the one
    // inconsistency a labor-safe-by-structure system can never ship. We wrap the
    // whole path so it is all-or-nothing.
    //
    // ISSUE-031 Stage 2 (2026-06-18): the public.stop_photos mirror INSERT (photo
    // data + created_by_oid) was clipped. Evidence data now lands ONLY in
    // core.evidence and the capture OID ONLY in the grant-walled
    // core.evidence_actor_audit sidecar — never again into the adapter column. The
    // OID was already dual-written to the sidecar before the clip (gate recon:
    // live-verified 9/9 match), so no capture attribution is lost.
    // listStopPhotosByRouteRunStop still reads the now-frozen public.stop_photos —
    // a scheduled Capability-Build repoint (and a labor-safety read-surface
    // improvement, since that reader currently serves the real OID).
    //
    // Transaction ownership: if handed a bare Pool (the production /photos route
    // path), we check out a dedicated connection and own BEGIN/COMMIT/ROLLBACK.
    // If handed a PoolClient, the caller owns the transaction (the convention in
    // cleanLogService) and we only run statements — joining the caller's atomic
    // unit rather than opening a nested one. A PoolClient is distinguished by its
    // `.release()` method, which a Pool does not have.
    const ownsTransaction = typeof (clientOrPool as any).release !== "function";
    const client: PoolClient = ownsTransaction
        ? await (clientOrPool as Pool).connect()
        : (clientOrPool as PoolClient);

    try {
        if (ownsTransaction) await client.query("BEGIN");

        const clientVisitId = deriveClientVisitId(routeRunStopId);

        for (const key of s3Keys) {
            // Canonical evidence write — captured-by identity goes to the no-grant
            // sidecar core.evidence_actor_audit (§3.2), never onto core.evidence.
            const evidenceRes = await client.query(
                `INSERT INTO core.evidence (org_id, visit_id, observation_id, kind, storage_key)
                 SELECT v.org_id, v.id, NULL, $1, $2
                 FROM core.visits v
                 WHERE v.client_visit_id = $3
                 LIMIT 1
                 RETURNING id, org_id`,
                [kind, key, clientVisitId]
            );

            if (evidenceRes.rowCount === 0) {
                console.warn(
                    `[createStopPhotos] No visit found for routeRunStopId=${routeRunStopId} — evidence row skipped for key=${key}`
                );
            } else {
                await client.query(
                    `INSERT INTO core.evidence_actor_audit (evidence_id, org_id, actor_ref)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (evidence_id) DO NOTHING`,
                    [evidenceRes.rows[0].id, evidenceRes.rows[0].org_id, userOid]
                );
            }
        }

        if (ownsTransaction) await client.query("COMMIT");
    } catch (err) {
        if (ownsTransaction) {
            try {
                await client.query("ROLLBACK");
            } catch {
                // best-effort rollback; the connection is released regardless
            }
        }
        throw err;
    } finally {
        if (ownsTransaction) client.release();
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
