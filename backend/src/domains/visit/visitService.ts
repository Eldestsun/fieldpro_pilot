// backend/src/services/visitService.ts

import type { PoolClient } from "pg";
import { v5 as uuidv5 } from "uuid";

const ROUTE_RUN_STOP_NAMESPACE = "4c5e1b10-1f0a-4ce4-9a6b-3b9b6a0f8b9c"; // stable constant UUID

/**
 * Deterministically derives the client_visit_id for a route_run_stop.
 */
export function deriveClientVisitId(routeRunStopId: number): string {
  return uuidv5(`route-run-stop:${routeRunStopId}`, ROUTE_RUN_STOP_NAMESPACE);
}

type EnsureVisitParams = {
  routeRunStopId: number;
  actorOid: string;
  visitType: string; // e.g. "service"
  outcome?: string | null;
  clientVisitId?: string; // optional override
};

/**
 * Ensures a Visit exists for a given route_run_stop.
 * Safe to call multiple times — returns existing visit if found,
 * using deterministic client_visit_id for idempotency.
 */

/**
 * Resolves context for a given route_run_stop (idempotent read).
 */
export async function getVisitContext(client: PoolClient, routeRunStopId: number) {
  const ctx = await client.query(
    `
    SELECT
      a.org_id,
      rrs.asset_id AS primary_asset_id,
      loc.location_id
    FROM public.route_run_stops rrs
    JOIN public.assets a ON a.id = rrs.asset_id
    LEFT JOIN core.v_locations_transit loc ON loc.stop_id = rrs.stop_id
    WHERE rrs.id = $1
    `,
    [routeRunStopId]
  );

  if (!ctx.rows.length) {
    throw new Error(
      `getVisitContext: route_run_stop not found: ${routeRunStopId}`
    );
  }

  const { org_id, primary_asset_id, location_id } = ctx.rows[0];

  if (!org_id || !primary_asset_id) {
    throw new Error(
      `getVisitContext: missing org_id/primary_asset_id for route_run_stop ${routeRunStopId}`
    );
  }
  if (!location_id) {
    throw new Error(
      `getVisitContext: missing location_id for route_run_stop ${routeRunStopId} (stop_id mapping failed)`
    );
  }

  return { orgId: org_id, assetId: primary_asset_id, locationId: location_id };
}

/**
 * Ensures a Visit exists for a given route_run_stop.
 * Safe to call multiple times — returns existing visit if found,
 * using deterministic client_visit_id for idempotency.
 */
export async function ensureVisitForRouteRunStop(client: PoolClient, params: EnsureVisitParams): Promise<number> {
  const visitClientId =
    params.clientVisitId ??
    deriveClientVisitId(params.routeRunStopId);

  // 1) Idempotency: use unique client_visit_id
  const existing = await client.query(
    `SELECT id FROM core.visits WHERE client_visit_id = $1 LIMIT 1`,
    [visitClientId]
  );
  if (existing.rows.length) return existing.rows[0].id as number;

  // 2) Resolve org/location/asset context (no routing fields in visits)
  const { orgId, assetId, locationId } = await getVisitContext(client, params.routeRunStopId);

  // 3) Insert (idempotent + race-safe)
  const insert = await client.query(
    `
    INSERT INTO core.visits (
      org_id,
      location_id,
      primary_asset_id,
      actor_oid,
      visit_type,
      outcome,
      client_visit_id,
      started_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7, NOW())
    ON CONFLICT (client_visit_id) DO NOTHING
    RETURNING id
    `,
    [
      orgId,
      locationId,
      assetId,
      params.actorOid,
      params.visitType,
      params.outcome ?? null,
      visitClientId,
    ]
  );

  if (insert.rows.length) return insert.rows[0].id as number;


  // Concurrent insert: fetch the row that won the race
  const after = await client.query(
    `SELECT id FROM core.visits WHERE client_visit_id = $1 LIMIT 1`,
    [visitClientId]
  );
  if (!after.rows.length) {
    throw new Error(
      `ensureVisitForRouteRunStop: insert race but visit not found for client_visit_id=${visitClientId}`
    );
  }
  return after.rows[0].id as number;
}

/**
 * Closes an open visit associated with the route_run_stop.
 * Idempotent: safe to call even if already closed.
 */
export async function closeVisitForRouteRunStop(
  client: PoolClient,
  params: { routeRunStopId: number; outcome: string; reasonCode?: string; endedAt?: Date }
): Promise<number | null> {
  const visitClientId = deriveClientVisitId(params.routeRunStopId);

  const res = await client.query(
    `
    UPDATE core.visits
    SET ended_at    = COALESCE(ended_at, COALESCE($2, NOW())),
        outcome     = COALESCE(outcome, $3),
        reason_code = COALESCE(reason_code, $4)
    WHERE client_visit_id = $1
      AND ended_at IS NULL
    RETURNING id
    `,
    [visitClientId, params.endedAt ?? null, params.outcome, params.reasonCode ?? null]
  );

  if (res.rows.length) return res.rows[0].id;
  return null;
}