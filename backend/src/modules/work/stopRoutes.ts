import { Router, Request, Response } from "express";
import { requireAuth, requireAnyRole } from "../../authz";
import { withOrgContext } from "../../db";
import { resolveNumericOrgId } from "../../middleware/resolveOrgId";

export const stopRoutes = Router();

/**
 * @openapi
 * /stops/{stop_id}/hotspot:
 *   patch:
 *     summary: Mark or unmark a stop as a hotspot
 *     description: Updates the is_hotspot flag on the stop. UL, Lead, and Admin can toggle this.
 *     tags: [Stops]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [UL, Lead, Admin]
 *     parameters:
 *       - in: path
 *         name: stop_id
 *         required: true
 *         schema: { type: string }
 *         description: Transit stop ID
 *         example: "12345"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [is_hotspot]
 *             properties:
 *               is_hotspot:
 *                 type: boolean
 *                 description: Whether this stop is a hotspot
 *           example:
 *             is_hotspot: true
 *     responses:
 *       200:
 *         description: Flag updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 stop_id: { type: string }
 *                 is_hotspot: { type: boolean }
 *             example:
 *               ok: true
 *               stop_id: "12345"
 *               is_hotspot: true
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
// PATCH /stops/:stop_id/hotspot
stopRoutes.patch(
    "/stops/:stop_id/hotspot",
    requireAuth,
    requireAnyRole(["Specialist", "Dispatch", "Admin"]),
    async (req: Request, res: Response) => {
        try {
            const { stop_id } = req.params;
            const { is_hotspot } = req.body;

            if (!stop_id || typeof stop_id !== "string") {
                return res.status(400).json({ error: "Invalid stop_id" });
            }

            if (typeof is_hotspot !== "boolean") {
                return res.status(400).json({ error: "is_hotspot must be a boolean" });
            }

            const query = `
                UPDATE public.transit_stops
                SET is_hotspot = $1
                WHERE stop_id = $2
            `;

            // MT-2: transit_stops is FORCE-RLS — set org context so the policy
            // scopes to the caller's org instead of (fail-closed) matching 0 rows.
            const numericOrgId = await resolveNumericOrgId(req);
            const result = await withOrgContext(numericOrgId, (client) =>
                client.query(query, [is_hotspot, stop_id]),
            );

            if (result.rowCount === 0) {
                return res.status(404).json({ error: "Stop not found" });
            }

            return res.json({ ok: true, stop_id, is_hotspot });
        } catch (err: any) {
            console.error("Error in PATCH /stops/:stop_id/hotspot:", err);
            return res
                .status(500)
                .json({ error: err.message || "Internal server error" });
        }
    }
);

/**
 * @openapi
 * /stops/{stop_id}/compactor:
 *   patch:
 *     summary: Set the compactor flag on a stop
 *     description: Marks whether a stop has a trash compactor. Lead and Admin only.
 *     tags: [Stops]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Lead, Admin]
 *     parameters:
 *       - in: path
 *         name: stop_id
 *         required: true
 *         schema: { type: string }
 *         description: Transit stop ID
 *         example: "12345"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [compactor]
 *             properties:
 *               compactor:
 *                 type: boolean
 *           example:
 *             compactor: true
 *     responses:
 *       200:
 *         description: Flag updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 stop_id: { type: string }
 *                 compactor: { type: boolean }
 *             example:
 *               ok: true
 *               stop_id: "12345"
 *               compactor: true
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
// PATCH /stops/:stop_id/compactor
stopRoutes.patch(
    "/stops/:stop_id/compactor",
    requireAuth,
    requireAnyRole(["Dispatch", "Admin"]),
    async (req: Request, res: Response) => {
        try {
            const { stop_id } = req.params;
            const { compactor } = req.body;

            if (!stop_id || typeof stop_id !== "string") {
                return res.status(400).json({ error: "Invalid stop_id" });
            }

            if (typeof compactor !== "boolean") {
                return res.status(400).json({ error: "compactor must be a boolean" });
            }

            const query = `
                UPDATE public.transit_stops
                SET compactor = $1
                WHERE stop_id = $2
            `;

            // MT-2: transit_stops is FORCE-RLS — set org context so the policy
            // scopes to the caller's org instead of (fail-closed) matching 0 rows.
            const numericOrgId = await resolveNumericOrgId(req);
            const result = await withOrgContext(numericOrgId, (client) =>
                client.query(query, [compactor, stop_id]),
            );

            if (result.rowCount === 0) {
                return res.status(404).json({ error: "Stop not found" });
            }

            return res.json({ ok: true, stop_id, compactor });
        } catch (err: any) {
            console.error("Error in PATCH /stops/:stop_id/compactor:", err);
            return res
                .status(500)
                .json({ error: err.message || "Internal server error" });
        }
    }
);

/**
 * @openapi
 * /stops/{stop_id}/has-trash:
 *   patch:
 *     summary: Set the has-trash flag on a stop
 *     description: Marks whether a stop has a trash receptacle. Lead and Admin only.
 *     tags: [Stops]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Lead, Admin]
 *     parameters:
 *       - in: path
 *         name: stop_id
 *         required: true
 *         schema: { type: string }
 *         description: Transit stop ID
 *         example: "12345"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [has_trash]
 *             properties:
 *               has_trash:
 *                 type: boolean
 *           example:
 *             has_trash: true
 *     responses:
 *       200:
 *         description: Flag updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 stop_id: { type: string }
 *                 has_trash: { type: boolean }
 *             example:
 *               ok: true
 *               stop_id: "12345"
 *               has_trash: true
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
// PATCH /stops/:stop_id/has-trash
stopRoutes.patch(
    "/stops/:stop_id/has-trash",
    requireAuth,
    requireAnyRole(["Dispatch", "Admin"]),
    async (req: Request, res: Response) => {
        try {
            const { stop_id } = req.params;
            const { has_trash } = req.body;

            if (!stop_id || typeof stop_id !== "string") {
                return res.status(400).json({ error: "Invalid stop_id" });
            }

            if (typeof has_trash !== "boolean") {
                return res.status(400).json({ error: "has_trash must be a boolean" });
            }

            const query = `
                UPDATE public.transit_stops
                SET has_trash = $1
                WHERE stop_id = $2
            `;

            // MT-2: transit_stops is FORCE-RLS — set org context so the policy
            // scopes to the caller's org instead of (fail-closed) matching 0 rows.
            const numericOrgId = await resolveNumericOrgId(req);
            const result = await withOrgContext(numericOrgId, (client) =>
                client.query(query, [has_trash, stop_id]),
            );

            if (result.rowCount === 0) {
                return res.status(404).json({ error: "Stop not found" });
            }

            return res.json({ ok: true, stop_id, has_trash });
        } catch (err: any) {
            console.error("Error in PATCH /stops/:stop_id/has-trash:", err);
            return res
                .status(500)
                .json({ error: err.message || "Internal server error" });
        }
    }
);

/**
 * @openapi
 * /stops/{stop_id}/history:
 *   get:
 *     summary: Per-stop condition/effort history over time
 *     description: >
 *       Chronological, visit-grouped history for one stop. Sources are the
 *       canonical layer (core.visits anchors + core.observations normalized
 *       columns) plus the de-identified intelligence tables
 *       (stop_effort_history, stop_condition_history). History attaches to the
 *       asset; the response carries no worker identity of any kind.
 *     tags: [Stops]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Dispatch, Admin]
 *     parameters:
 *       - in: path
 *         name: stop_id
 *         required: true
 *         schema: { type: string }
 *         description: Transit stop ID
 *         example: "31150"
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *         description: Max visit entries per page
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *     responses:
 *       200:
 *         description: Visit-grouped history, newest first. A stop with no
 *           visits returns an empty entries array — absence is a valid signal,
 *           never synthesized into rows.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
// GET /stops/:stop_id/history — SEAM-D D5a.
//
// Dedup rule (operator-ruled): all three sources FK the same core.visits row,
// so the entry unit is the VISIT; observations / effort / condition scores are
// facets of it. stop_effort_history.had_hazard / had_infra_issue are NOT
// returned — they are derived from the presence observations already in the
// response (the §2.1 umbrella anti-pattern, applied to a read surface).
// Intelligence reads normalized observation columns only — never payload.
stopRoutes.get(
    "/stops/:stop_id/history",
    requireAuth,
    requireAnyRole(["Dispatch", "Admin"]),
    async (req: Request, res: Response) => {
        try {
            const { stop_id } = req.params;
            if (!stop_id || typeof stop_id !== "string") {
                return res.status(400).json({ error: "Invalid stop_id" });
            }

            const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "20"), 10) || 20, 1), 100);
            const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);

            // PATTERN-001: every query below runs on this org-context client.
            // transit_stops, core.location_external_ids, core.asset_locations,
            // core.visits, core.observations, stop_effort_history and
            // stop_condition_history are all FORCE-RLS; a bare pool would
            // silently return zero rows. Org resolution fails closed (403).
            const numericOrgId = await resolveNumericOrgId(req);
            const payload = await withOrgContext(numericOrgId, async (client) => {
                // Stop must exist in the caller's org (RLS scopes the lookup).
                const stopRes = await client.query(
                    `SELECT stop_id FROM public.transit_stops WHERE stop_id = $1`,
                    [stop_id],
                );
                if (stopRes.rowCount === 0) return null;

                // One-hop translation to the canonical spine, BEFORE the
                // canonical query (ADAPTER_BOUNDARY §5): stop_id → location_id
                // via the external-id sidecar, then location → primary asset.
                const locRes = await client.query(
                    `SELECT location_id FROM core.location_external_ids
                     WHERE external_id = $1 AND source_system = 'metro_stop'`,
                    [stop_id],
                );
                const locationId: number | null = locRes.rows[0]?.location_id ?? null;

                let assetId: number | null = null;
                if (locationId != null) {
                    const assetRes = await client.query(
                        `SELECT asset_id FROM core.asset_locations
                         WHERE location_id = $1 AND active = TRUE AND role = 'primary'`,
                        [locationId],
                    );
                    assetId = assetRes.rows[0]?.asset_id ?? null;
                }

                if (locationId == null && assetId == null) {
                    // Stop exists but was never linked into the canonical spine:
                    // no visits can exist for it. Absence, not an error.
                    return { stop_id, total_visits: 0, limit, offset, entries: [] };
                }

                // Visit anchors, newest first. location_id is nullable on older
                // visits, so match either linkage.
                const visitFilter = `
                    (($1::bigint IS NOT NULL AND v.location_id = $1)
                     OR ($2::bigint IS NOT NULL AND v.primary_asset_id = $2))`;
                const countRes = await client.query(
                    `SELECT count(*)::int AS n FROM core.visits v WHERE ${visitFilter}`,
                    [locationId, assetId],
                );
                const totalVisits: number = countRes.rows[0].n;

                const visitsRes = await client.query(
                    `SELECT v.id, v.started_at, v.ended_at, v.outcome, v.reason_code
                     FROM core.visits v
                     WHERE ${visitFilter}
                     ORDER BY v.started_at DESC
                     LIMIT $3 OFFSET $4`,
                    [locationId, assetId, limit, offset],
                );
                const visitIds = visitsRes.rows.map((r: any) => r.id);

                const obsByVisit = new Map<string, any[]>();
                const effortByVisit = new Map<string, any>();
                const conditionByVisit = new Map<string, any>();

                if (visitIds.length > 0) {
                    // Canonical observations: normalized columns ONLY.
                    const obsRes = await client.query(
                        `SELECT visit_id, observation_type, obs_kind, norm_status,
                                norm_severity, intervention, observed_at
                         FROM core.observations
                         WHERE visit_id = ANY($1::bigint[])
                         ORDER BY observed_at ASC, id ASC`,
                        [visitIds],
                    );
                    for (const o of obsRes.rows) {
                        const k = String(o.visit_id);
                        if (!obsByVisit.has(k)) obsByVisit.set(k, []);
                        obsByVisit.get(k)!.push({
                            type: o.observation_type,
                            kind: o.obs_kind,
                            norm_status: o.norm_status,
                            norm_severity: o.norm_severity,
                            intervention: o.intervention,
                            observed_at: o.observed_at,
                        });
                    }

                    const effortRes = await client.query(
                        `SELECT visit_id, service_minutes, stop_type, trash_volume
                         FROM stop_effort_history
                         WHERE stop_id = $1 AND visit_id = ANY($2::bigint[])`,
                        [stop_id, visitIds],
                    );
                    for (const e of effortRes.rows) {
                        effortByVisit.set(String(e.visit_id), {
                            service_minutes: e.service_minutes,
                            stop_type: e.stop_type,
                            trash_volume: e.trash_volume != null ? Number(e.trash_volume) : null,
                        });
                    }

                    const condRes = await client.query(
                        `SELECT visit_id, cleanliness_score, safety_score, infra_score, scored_at
                         FROM stop_condition_history
                         WHERE stop_id = $1 AND visit_id = ANY($2::bigint[])`,
                        [stop_id, visitIds],
                    );
                    for (const c of condRes.rows) {
                        conditionByVisit.set(String(c.visit_id), {
                            cleanliness: c.cleanliness_score != null ? Number(c.cleanliness_score) : null,
                            safety: c.safety_score != null ? Number(c.safety_score) : null,
                            infra: c.infra_score != null ? Number(c.infra_score) : null,
                            scored_at: c.scored_at,
                        });
                    }
                }

                const entries = visitsRes.rows.map((v: any) => {
                    const k = String(v.id);
                    return {
                        visit_date: v.started_at
                            ? new Date(v.started_at).toISOString().slice(0, 10)
                            : null,
                        started_at: v.started_at,
                        ended_at: v.ended_at,
                        outcome: v.outcome,
                        reason_code: v.reason_code,
                        observations: obsByVisit.get(k) ?? [],
                        effort: effortByVisit.get(k) ?? null,
                        condition_scores: conditionByVisit.get(k) ?? null,
                    };
                });

                return { stop_id, total_visits: totalVisits, limit, offset, entries };
            });

            if (payload === null) {
                return res.status(404).json({ error: "Stop not found" });
            }
            return res.json(payload);
        } catch (err: any) {
            if (err?.status === 403) {
                return res.status(403).json({ error: err.message });
            }
            console.error("Error in GET /stops/:stop_id/history:", err);
            return res
                .status(500)
                .json({ error: err.message || "Internal server error" });
        }
    }
);
