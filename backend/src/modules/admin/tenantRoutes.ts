import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { requireAuth, requireAnyRole } from "../../authz";
import * as assetService from "../../domains/asset/assetService";
import type {
    AssetSeedRow,
    ObservationTypeInput,
    ValueType,
} from "../../domains/asset/assetService";

// Tier 8 Change 4 — Tenant Configuration API
//
// Admin-only endpoints for tenant onboarding. Lets a new agency define its
// asset types, configure observation types per asset type, and seed its
// asset inventory from a CSV upload — without code changes.
//
// All canonical writes go through assetService.ts. This module never queries
// core.observations / core.visits / public.assets directly.

export const tenantRoutes = Router();

const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    requireAnyRole(["Admin"])(req as any, res, next);
};

tenantRoutes.use(requireAuth, requireAdmin);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB cap on inventory uploads
});

// ── Org Resolution ────────────────────────────────────────────────────────

// Admin endpoints operate on a specific tenant. Org is supplied per-request
// via the X-Org-Id header (or ?org_id= query param). This sits in front of
// every handler so RLS context is always correct downstream.
function resolveOrgId(req: Request): number | null {
    const raw =
        (req.header("x-org-id") as string | undefined) ??
        (req.query.org_id as string | undefined);
    if (!raw) return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
}

function requireOrg(req: Request, res: Response): number | null {
    const orgId = resolveOrgId(req);
    if (orgId == null) {
        res.status(400).json({
            error: "Missing or invalid org_id (supply via X-Org-Id header or ?org_id= query param)",
        });
        return null;
    }
    return orgId;
}

/**
 * @openapi
 * /admin/tenant/asset-types:
 *   get:
 *     summary: List asset types for a tenant
 *     description: Returns all asset types configured for the specified org. Org is supplied via X-Org-Id header or ?org_id= query param.
 *     tags: [Tenant]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Admin]
 *     parameters:
 *       - in: header
 *         name: X-Org-Id
 *         schema: { type: integer }
 *         description: Org ID (alternative to ?org_id=)
 *         example: 1
 *       - in: query
 *         name: org_id
 *         schema: { type: integer }
 *         description: Org ID (alternative to X-Org-Id header)
 *         example: 1
 *     responses:
 *       200:
 *         description: List of asset types
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 asset_types:
 *                   type: array
 *                   items: { type: object }
 *             example:
 *               asset_types:
 *                 - id: 1
 *                   type_key: transit_stop
 *                   display_name: "Transit Stop"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
// ── 1. GET /asset-types ──────────────────────────────────────────────────

tenantRoutes.get("/asset-types", async (req: Request, res: Response) => {
    try {
        const orgId = requireOrg(req, res);
        if (orgId == null) return;
        const asset_types = await assetService.listAssetTypes(orgId);
        res.json({ asset_types });
    } catch (err: any) {
        console.error("GET /api/admin/tenant/asset-types failed:", err);
        res.status(500).json({ error: err.message ?? "Internal error" });
    }
});

/**
 * @openapi
 * /admin/tenant/asset-types:
 *   post:
 *     summary: Create an asset type for a tenant
 *     description: Registers a new asset type for the org. Used during tenant onboarding.
 *     tags: [Tenant]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Admin]
 *     parameters:
 *       - in: header
 *         name: X-Org-Id
 *         schema: { type: integer }
 *         description: Org ID
 *         example: 1
 *       - in: query
 *         name: org_id
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type_key, display_name]
 *             properties:
 *               type_key:
 *                 type: string
 *                 description: Unique slug for this asset type
 *                 example: transit_stop
 *               display_name:
 *                 type: string
 *                 example: "Transit Stop"
 *               description:
 *                 type: string
 *           example:
 *             type_key: transit_stop
 *             display_name: "Transit Stop"
 *             description: "Bus shelter or transit stop"
 *     responses:
 *       201:
 *         description: Asset type created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 asset_type: { type: object }
 *             example:
 *               asset_type: { id: 1, type_key: transit_stop, display_name: "Transit Stop" }
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
// ── 2. POST /asset-types ─────────────────────────────────────────────────

tenantRoutes.post("/asset-types", async (req: Request, res: Response) => {
    try {
        const orgId = requireOrg(req, res);
        if (orgId == null) return;

        const { type_key, display_name, description } = req.body ?? {};
        if (typeof type_key !== "string" || !type_key.trim()) {
            return res.status(400).json({ error: "type_key is required" });
        }
        if (typeof display_name !== "string" || !display_name.trim()) {
            return res.status(400).json({ error: "display_name is required" });
        }

        const asset_type = await assetService.createAssetType({
            orgId,
            typeKey: type_key.trim(),
            displayName: display_name.trim(),
            description: typeof description === "string" ? description : null,
        });
        res.status(201).json({ asset_type });
    } catch (err: any) {
        console.error("POST /api/admin/tenant/asset-types failed:", err);
        res.status(500).json({ error: err.message ?? "Internal error" });
    }
});

/**
 * @openapi
 * /admin/tenant/observation-types:
 *   get:
 *     summary: List observation types for an asset type
 *     description: Returns all observation types configured for a given asset type within the org.
 *     tags: [Tenant]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Admin]
 *     parameters:
 *       - in: header
 *         name: X-Org-Id
 *         schema: { type: integer }
 *         example: 1
 *       - in: query
 *         name: org_id
 *         schema: { type: integer }
 *       - in: query
 *         name: asset_type_id
 *         required: true
 *         schema: { type: integer }
 *         description: Asset type ID to list observation types for
 *         example: 1
 *     responses:
 *       200:
 *         description: List of observation types
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 observation_types:
 *                   type: array
 *                   items: { type: object }
 *             example:
 *               observation_types:
 *                 - id: 1
 *                   observation_key: cleanliness
 *                   display_name: "Cleanliness"
 *                   value_type: state
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
// ── 3. GET /observation-types?asset_type_id= ─────────────────────────────

tenantRoutes.get("/observation-types", async (req: Request, res: Response) => {
    try {
        const orgId = requireOrg(req, res);
        if (orgId == null) return;

        const assetTypeId = Number(req.query.asset_type_id);
        if (!Number.isFinite(assetTypeId) || assetTypeId <= 0) {
            return res.status(400).json({ error: "asset_type_id query param required" });
        }

        const observation_types = await assetService.listObservationTypes(orgId, assetTypeId);
        res.json({ observation_types });
    } catch (err: any) {
        console.error("GET /api/admin/tenant/observation-types failed:", err);
        res.status(500).json({ error: err.message ?? "Internal error" });
    }
});

/**
 * @openapi
 * /admin/tenant/observation-types:
 *   post:
 *     summary: Upsert observation types for an asset type
 *     description: Creates or updates observation type definitions for a given asset type. Used during tenant onboarding.
 *     tags: [Tenant]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Admin]
 *     parameters:
 *       - in: header
 *         name: X-Org-Id
 *         schema: { type: integer }
 *         example: 1
 *       - in: query
 *         name: org_id
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [asset_type_id, types]
 *             properties:
 *               asset_type_id:
 *                 type: integer
 *                 example: 1
 *               types:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [observation_key, display_name, value_type]
 *                   properties:
 *                     observation_key: { type: string }
 *                     display_name: { type: string }
 *                     value_type:
 *                       type: string
 *                       enum: [state, numeric, boolean]
 *                     valid_values: { type: array, items: { type: string } }
 *                     is_required: { type: boolean }
 *                     sort_order: { type: integer }
 *           example:
 *             asset_type_id: 1
 *             types:
 *               - observation_key: cleanliness
 *                 display_name: "Cleanliness"
 *                 value_type: state
 *                 valid_values: [clean, dirty, hazardous]
 *                 is_required: true
 *                 sort_order: 1
 *     responses:
 *       200:
 *         description: Observation types upserted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 upserted:
 *                   type: array
 *                   items: { type: object }
 *             example:
 *               upserted: [{ id: 1, observation_key: cleanliness }]
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
// ── 4. POST /observation-types ───────────────────────────────────────────
// Body: { asset_type_id: number, types: ObservationTypeInput[] }

const VALUE_TYPES: ReadonlySet<ValueType> = new Set(["state", "numeric", "boolean"]);

tenantRoutes.post("/observation-types", async (req: Request, res: Response) => {
    try {
        const orgId = requireOrg(req, res);
        if (orgId == null) return;

        const { asset_type_id, types } = req.body ?? {};
        if (!Number.isFinite(Number(asset_type_id)) || Number(asset_type_id) <= 0) {
            return res.status(400).json({ error: "asset_type_id is required" });
        }
        if (!Array.isArray(types) || types.length === 0) {
            return res.status(400).json({ error: "types must be a non-empty array" });
        }

        const validated: ObservationTypeInput[] = [];
        for (const [i, t] of types.entries()) {
            if (
                !t ||
                typeof t.observation_key !== "string" ||
                !t.observation_key.trim() ||
                typeof t.display_name !== "string" ||
                !t.display_name.trim() ||
                typeof t.value_type !== "string" ||
                !VALUE_TYPES.has(t.value_type as ValueType)
            ) {
                return res.status(400).json({
                    error: `types[${i}] is invalid — observation_key, display_name, and value_type ('state' | 'numeric' | 'boolean') are required`,
                });
            }
            validated.push({
                observation_key: t.observation_key.trim(),
                display_name: t.display_name.trim(),
                value_type: t.value_type as ValueType,
                valid_values: t.valid_values ?? null,
                is_required: Boolean(t.is_required),
                sort_order: Number.isFinite(Number(t.sort_order)) ? Number(t.sort_order) : 0,
            });
        }

        const upserted = await assetService.upsertObservationTypes({
            orgId,
            assetTypeId: Number(asset_type_id),
            types: validated,
        });
        res.json({ upserted });
    } catch (err: any) {
        console.error("POST /api/admin/tenant/observation-types failed:", err);
        res.status(500).json({ error: err.message ?? "Internal error" });
    }
});

/**
 * @openapi
 * /admin/tenant/seed-assets:
 *   post:
 *     summary: Seed asset inventory from a CSV upload
 *     description: >
 *       Accepts a multipart CSV file with required columns: external_id, display_name, lat, lon.
 *       Additional columns become entries in the asset attributes JSON.
 *       Used for bulk onboarding of asset inventories (e.g., importing stop data from a GIS export).
 *     tags: [Tenant]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Admin]
 *     parameters:
 *       - in: header
 *         name: X-Org-Id
 *         schema: { type: integer }
 *         example: 1
 *       - in: query
 *         name: org_id
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, asset_type_id]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: CSV file with columns external_id, display_name, lat, lon, and optional extras
 *               asset_type_id:
 *                 type: integer
 *                 description: Asset type to assign to all seeded assets
 *                 example: 1
 *     responses:
 *       200:
 *         description: Assets seeded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 rows_received: { type: integer }
 *                 inserted: { type: integer }
 *                 updated: { type: integer }
 *             example:
 *               rows_received: 450
 *               inserted: 420
 *               updated: 30
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
// ── 5. POST /seed-assets ─────────────────────────────────────────────────
// multipart/form-data:
//   file:           CSV with header row including external_id, display_name, lat, lon, *
//   asset_type_id:  numeric (form field)
// Columns beyond external_id/display_name/lat/lon become entries in attributes JSON.

const RESERVED_CSV_COLS = new Set(["external_id", "display_name", "lat", "lon"]);

tenantRoutes.post(
    "/seed-assets",
    upload.single("file"),
    async (req: Request, res: Response) => {
        try {
            const orgId = requireOrg(req, res);
            if (orgId == null) return;

            const assetTypeId = Number(req.body?.asset_type_id);
            if (!Number.isFinite(assetTypeId) || assetTypeId <= 0) {
                return res.status(400).json({ error: "asset_type_id form field required" });
            }
            if (!req.file?.buffer) {
                return res.status(400).json({ error: "CSV file is required (multipart field 'file')" });
            }

            let rows: AssetSeedRow[];
            try {
                rows = parseAssetCsv(req.file.buffer.toString("utf8"));
            } catch (e: any) {
                return res.status(400).json({ error: `CSV parse error: ${e.message}` });
            }

            if (rows.length === 0) {
                return res.status(400).json({ error: "CSV contained no data rows" });
            }

            const result = await assetService.seedAssets({
                orgId,
                assetTypeId,
                rows,
            });
            res.json({ ...result, rows_received: rows.length });
        } catch (err: any) {
            console.error("POST /api/admin/tenant/seed-assets failed:", err);
            res.status(500).json({ error: err.message ?? "Internal error" });
        }
    }
);

// ── CSV helpers ───────────────────────────────────────────────────────────

// Minimal RFC 4180-ish CSV parser. Handles quoted fields with embedded commas,
// newlines, and "" escaping. Sufficient for admin-supplied inventory exports;
// not intended to be a general-purpose CSV library.
function parseCsv(input: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let inQuotes = false;
    let i = 0;

    while (i < input.length) {
        const ch = input[i];

        if (inQuotes) {
            if (ch === '"') {
                if (input[i + 1] === '"') {
                    cell += '"';
                    i += 2;
                    continue;
                }
                inQuotes = false;
                i++;
                continue;
            }
            cell += ch;
            i++;
            continue;
        }

        if (ch === '"') {
            inQuotes = true;
            i++;
            continue;
        }
        if (ch === ",") {
            row.push(cell);
            cell = "";
            i++;
            continue;
        }
        if (ch === "\r") {
            i++;
            continue;
        }
        if (ch === "\n") {
            row.push(cell);
            rows.push(row);
            row = [];
            cell = "";
            i++;
            continue;
        }
        cell += ch;
        i++;
    }

    // flush trailing cell/row (file may not end with newline)
    if (cell.length > 0 || row.length > 0) {
        row.push(cell);
        rows.push(row);
    }
    return rows;
}

function parseAssetCsv(text: string): AssetSeedRow[] {
    const grid = parseCsv(text).filter(r => r.some(c => c.trim().length > 0));
    if (grid.length < 2) return [];

    const header = grid[0].map(h => h.trim());
    const required = ["external_id", "display_name", "lat", "lon"];
    for (const col of required) {
        if (!header.includes(col)) {
            throw new Error(`missing required column '${col}'`);
        }
    }

    const idx: Record<string, number> = {};
    header.forEach((h, i) => { idx[h] = i; });

    const out: AssetSeedRow[] = [];
    for (let r = 1; r < grid.length; r++) {
        const row = grid[r];
        const external_id = (row[idx.external_id] ?? "").trim();
        const display_name = (row[idx.display_name] ?? "").trim();
        if (!external_id) {
            throw new Error(`row ${r + 1}: external_id is empty`);
        }
        if (!display_name) {
            throw new Error(`row ${r + 1}: display_name is empty`);
        }

        const lat = parseNumericCell(row[idx.lat]);
        const lon = parseNumericCell(row[idx.lon]);

        const attributes: Record<string, unknown> = {};
        for (const h of header) {
            if (RESERVED_CSV_COLS.has(h)) continue;
            const raw = (row[idx[h]] ?? "").trim();
            if (raw === "") continue;
            attributes[h] = coerceCellValue(raw);
        }

        out.push({ external_id, display_name, lat, lon, attributes });
    }
    return out;
}

function parseNumericCell(raw: string | undefined): number | null {
    if (raw == null) return null;
    const trimmed = raw.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
}

function coerceCellValue(raw: string): unknown {
    const low = raw.toLowerCase();
    if (low === "true") return true;
    if (low === "false") return false;
    const n = Number(raw);
    if (raw !== "" && Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(raw)) return n;
    // JSON literal passthrough — lets admins ship structured cells if they want.
    if ((raw.startsWith("{") && raw.endsWith("}")) || (raw.startsWith("[") && raw.endsWith("]"))) {
        try {
            return JSON.parse(raw);
        } catch {
            return raw;
        }
    }
    return raw;
}
