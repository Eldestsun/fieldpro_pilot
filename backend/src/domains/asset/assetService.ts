import { PoolClient } from "pg";
import { withOrgContext } from "../../db";

// CRUD for the per-tenant asset abstraction layer:
//   core.asset_types               — what kinds of assets exist per org
//   core.observation_type_registry — what observations are valid per asset type
//   public.assets                  — the canonical asset rows themselves
//
// Routes call into this service so that tenant-onboarding paths never touch
// observationService.ts / visitService.ts / riskMapService.ts directly.

export type ValueType = "state" | "numeric" | "boolean";

export interface AssetType {
    id: number;
    org_id: number;
    type_key: string;
    display_name: string;
    description: string | null;
    is_active: boolean;
    created_at: string;
}

export interface ObservationTypeRow {
    id: number;
    org_id: number;
    asset_type_id: number;
    observation_key: string;
    display_name: string;
    value_type: ValueType;
    valid_values: unknown;
    is_required: boolean;
    sort_order: number;
    is_active: boolean;
}

export interface ObservationTypeInput {
    observation_key: string;
    display_name: string;
    value_type: ValueType;
    valid_values?: unknown;
    is_required?: boolean;
    sort_order?: number;
}

export interface AssetSeedRow {
    external_id: string;
    display_name: string;
    lat: number | null;
    lon: number | null;
    attributes: Record<string, unknown>;
}

// ── Asset Types ────────────────────────────────────────────────────────────

export async function listAssetTypes(orgId: number): Promise<AssetType[]> {
    return withOrgContext(orgId, async (client: PoolClient) => {
        const res = await client.query<AssetType>(
            `SELECT id, org_id, type_key, display_name, description, is_active, created_at
             FROM core.asset_types
             WHERE org_id = $1
             ORDER BY display_name`,
            [orgId]
        );
        return res.rows;
    });
}

export async function createAssetType(input: {
    orgId: number;
    typeKey: string;
    displayName: string;
    description?: string | null;
}): Promise<AssetType> {
    return withOrgContext(input.orgId, async (client: PoolClient) => {
        const res = await client.query<AssetType>(
            `INSERT INTO core.asset_types (org_id, type_key, display_name, description)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (org_id, type_key) DO UPDATE SET
               display_name = EXCLUDED.display_name,
               description  = EXCLUDED.description,
               is_active    = true
             RETURNING id, org_id, type_key, display_name, description, is_active, created_at`,
            [input.orgId, input.typeKey, input.displayName, input.description ?? null]
        );
        return res.rows[0];
    });
}

// ── Observation Types ─────────────────────────────────────────────────────

export async function listObservationTypes(
    orgId: number,
    assetTypeId: number
): Promise<ObservationTypeRow[]> {
    return withOrgContext(orgId, async (client: PoolClient) => {
        const res = await client.query<ObservationTypeRow>(
            `SELECT id, org_id, asset_type_id, observation_key, display_name,
                    value_type, valid_values, is_required, sort_order, is_active
             FROM core.observation_type_registry
             WHERE org_id = $1 AND asset_type_id = $2
             ORDER BY sort_order, observation_key`,
            [orgId, assetTypeId]
        );
        return res.rows;
    });
}

export async function upsertObservationTypes(input: {
    orgId: number;
    assetTypeId: number;
    types: ObservationTypeInput[];
}): Promise<number> {
    return withOrgContext(input.orgId, async (client: PoolClient) => {
        // Verify the asset type belongs to this org before writing children.
        const own = await client.query<{ id: number }>(
            `SELECT id FROM core.asset_types WHERE id = $1 AND org_id = $2`,
            [input.assetTypeId, input.orgId]
        );
        if (own.rows.length === 0) {
            throw new Error(
                `asset_type_id ${input.assetTypeId} not found for org ${input.orgId}`
            );
        }

        let upserted = 0;
        for (const t of input.types) {
            await client.query(
                `INSERT INTO core.observation_type_registry
                   (org_id, asset_type_id, observation_key, display_name,
                    value_type, valid_values, is_required, sort_order)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 ON CONFLICT (org_id, asset_type_id, observation_key) DO UPDATE SET
                   display_name = EXCLUDED.display_name,
                   value_type   = EXCLUDED.value_type,
                   valid_values = EXCLUDED.valid_values,
                   is_required  = EXCLUDED.is_required,
                   sort_order   = EXCLUDED.sort_order,
                   is_active    = true`,
                [
                    input.orgId,
                    input.assetTypeId,
                    t.observation_key,
                    t.display_name,
                    t.value_type,
                    t.valid_values != null ? JSON.stringify(t.valid_values) : null,
                    t.is_required ?? false,
                    t.sort_order ?? 0,
                ]
            );
            upserted++;
        }
        return upserted;
    });
}

// ── Asset Inventory Seeding ───────────────────────────────────────────────

export async function seedAssets(input: {
    orgId: number;
    assetTypeId: number;
    rows: AssetSeedRow[];
}): Promise<{ upserted: number }> {
    return withOrgContext(input.orgId, async (client: PoolClient) => {
        // Translate core.asset_types.id → public.asset_types.id via shared type_key.
        // public.assets.asset_type_id references public.asset_types (the global
        // code table), so we bridge through it.
        const typeRes = await client.query<{ public_asset_type_id: number }>(
            `SELECT pat.id AS public_asset_type_id
             FROM core.asset_types cat
             JOIN public.asset_types pat ON pat.code = cat.type_key
             WHERE cat.id = $1 AND cat.org_id = $2
             LIMIT 1`,
            [input.assetTypeId, input.orgId]
        );

        if (typeRes.rows.length === 0) {
            throw new Error(
                `asset_type_id ${input.assetTypeId} has no matching public.asset_types row ` +
                `(register the type_key in public.asset_types first)`
            );
        }
        const publicAssetTypeId = typeRes.rows[0].public_asset_type_id;

        let upserted = 0;
        await client.query("BEGIN");
        try {
            for (const r of input.rows) {
                await client.query(
                    `INSERT INTO public.assets
                       (org_id, asset_type_id, seed_key, external_id,
                        display_name, lat, lon, attributes, active, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, now())
                     ON CONFLICT (org_id, asset_type_id, seed_key) DO UPDATE SET
                       external_id  = EXCLUDED.external_id,
                       display_name = EXCLUDED.display_name,
                       lat          = EXCLUDED.lat,
                       lon          = EXCLUDED.lon,
                       attributes   = EXCLUDED.attributes,
                       updated_at   = EXCLUDED.updated_at`,
                    [
                        input.orgId,
                        publicAssetTypeId,
                        r.external_id,
                        r.external_id,
                        r.display_name,
                        r.lat,
                        r.lon,
                        JSON.stringify(r.attributes ?? {}),
                    ]
                );
                upserted++;
            }
            await client.query("COMMIT");
        } catch (e) {
            await client.query("ROLLBACK");
            throw e;
        }
        return { upserted };
    });
}
