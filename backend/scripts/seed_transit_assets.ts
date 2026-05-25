/**
 * Tier 8 Change 2 — Transit Asset Seeder
 *
 * Seeds core.asset_types, core.observation_type_registry, and public.assets
 * for King County Metro's transit stop vertical.
 *
 * Idempotent — safe to run multiple times. All writes use ON CONFLICT DO UPDATE
 * so re-runs update metadata without touching IDs or relationships.
 *
 * Runs without withOrgContext() (migration-bypass mode: app.current_org_id
 * unset). This is intentional — the RLS bypass-when-unset pattern from Tier 7
 * applies here exactly as it does to migration scripts.
 *
 * Run:
 *   pnpm --filter backend exec ts-node scripts/seed_transit_assets.ts
 *
 * Prerequisites:
 *   - Migration 20260512_tier8_asset_abstraction.sql applied
 *   - KCM org exists in organizations table (slug = 'kcm')
 *   - transit_stops populated
 */

import { pool } from "../src/db";
import { PoolClient } from "pg";

// ---------------------------------------------------------------------------
// Observation type definitions — must match every key emitted by
// observationService.ts. Adding a type here is the Change 3 prerequisite.
// ---------------------------------------------------------------------------

interface ObsTypeRow {
  key: string;
  displayName: string;
  valueType: "state" | "numeric" | "boolean";
  validValues: unknown;
  isRequired: boolean;
  sortOrder: number;
  // Defaults to true. Set false to retire a type while preserving historical
  // observations that already reference it (canonical state layer §2: do not
  // hard-delete; absence of an active registry row means the type is retired,
  // not deleted).
  isActive?: boolean;
}

const TRANSIT_STOP_OBSERVATION_TYPES: ObsTypeRow[] = [
  // ---- Cleaning conditions (arrival required) ----------------------------
  {
    key: "ground_condition",
    displayName: "Ground Condition",
    valueType: "state",
    validValues: ["dirty", "clean"],
    isRequired: true,
    sortOrder: 10,
  },
  {
    key: "shelter_condition",
    displayName: "Shelter Condition",
    valueType: "state",
    validValues: ["dirty", "clean"],
    isRequired: true,
    sortOrder: 20,
  },
  {
    key: "pad_condition",
    displayName: "Pad Condition",
    valueType: "state",
    validValues: ["dirty", "clean"],
    isRequired: true,
    sortOrder: 30,
  },
  {
    key: "trash_can_condition",
    displayName: "Trash Can Condition",
    valueType: "state",
    validValues: ["has_trash", "empty"],
    isRequired: false,
    sortOrder: 40,
  },
  // ---- Cleaning actions (kind=action — intervention recorded; never OK-judged)
  // Refined canonical state layer §3.3, §4.2: actions are an independent axis
  // from conditions. Existence of the row = the worker performed the act.
  // ---------------------------------------------------------------------------
  {
    key: "picked_up_litter",
    displayName: "Picked Up Litter",
    valueType: "boolean",
    validValues: null,
    isRequired: false,
    sortOrder: 45,
  },
  {
    key: "emptied_trash",
    displayName: "Emptied Trash",
    valueType: "boolean",
    validValues: null,
    isRequired: false,
    sortOrder: 46,
  },
  {
    key: "washed_shelter",
    displayName: "Washed Shelter",
    valueType: "boolean",
    validValues: null,
    isRequired: false,
    sortOrder: 47,
  },
  {
    key: "washed_pad",
    displayName: "Washed Pad",
    valueType: "boolean",
    validValues: null,
    isRequired: false,
    sortOrder: 48,
  },
  // ---- Utility observations -----------------------------------------------
  {
    key: "washed_can",
    displayName: "Washed Can",
    valueType: "boolean",
    validValues: null,
    isRequired: false,
    sortOrder: 50,
  },
  {
    key: "trash_volume",
    displayName: "Trash Volume",
    valueType: "numeric",
    validValues: { min: 0, max: 4 },
    isRequired: false,
    sortOrder: 60,
  },
  // ---- Stop-level positive anchor (kind=condition, scope=stop) ------------
  // Refined canonical state layer §3.5: worker asserts the asset, as a whole,
  // required no servicing. Anchors visit so component-level silence is safe to
  // read as benign (§4.4 absence-as-counted-signal). Distinct from cleaning
  // actions and from per-component conditions. Distinct from non-service: a
  // spot check IS a completed servicing visit.
  // ---------------------------------------------------------------------------
  {
    key: "spot_check",
    displayName: "Spot Check (no work needed)",
    valueType: "state",
    validValues: ["no_work_needed"],
    isRequired: false,
    sortOrder: 70,
  },
  // ---- Safety — RETIRED generic umbrellas (active=false) ------------------
  // Refined canonical state layer: a generic safety_concern_present row is
  // entailed by the specific hazard presence(s) the worker selected; a
  // stop_not_serviced_due_to_safety row is entailed by core.visits.outcome =
  // 'skipped' + reason_code = 'safety'. Both are duplicates that invite
  // double-counting. Historical rows are preserved; new writes are repointed
  // to the specific presences + visit outcome.
  // ---------------------------------------------------------------------------
  {
    key: "safety_concern_present",
    displayName: "Safety Concern Present (RETIRED — see specific *_present)",
    valueType: "boolean",
    validValues: null,
    isRequired: false,
    sortOrder: 100,
    isActive: false,
  },
  {
    key: "stop_not_serviced_due_to_safety",
    displayName: "Stop Not Serviced (RETIRED — see core.visits.outcome)",
    valueType: "boolean",
    validValues: null,
    isRequired: false,
    sortOrder: 110,
    isActive: false,
  },
  {
    key: "encampment_present",
    displayName: "Encampment Present",
    valueType: "boolean",
    validValues: null,
    isRequired: false,
    sortOrder: 120,
  },
  {
    key: "fire_present",
    displayName: "Fire Present",
    valueType: "boolean",
    validValues: null,
    isRequired: false,
    sortOrder: 130,
  },
  {
    key: "dangerous_activity_present",
    displayName: "Dangerous Activity Present",
    valueType: "boolean",
    validValues: null,
    isRequired: false,
    sortOrder: 140,
  },
  {
    key: "drug_use_present",
    displayName: "Drug Use Present",
    valueType: "boolean",
    validValues: null,
    isRequired: false,
    sortOrder: 150,
  },
  {
    key: "violence_present",
    displayName: "Violence Present",
    valueType: "boolean",
    validValues: null,
    isRequired: false,
    sortOrder: 160,
  },
  {
    key: "biohazard_present",
    displayName: "Biohazard Present",
    valueType: "boolean",
    validValues: null,
    isRequired: false,
    sortOrder: 170,
  },
  {
    key: "access_blocked",
    displayName: "Access Blocked",
    valueType: "boolean",
    validValues: null,
    isRequired: false,
    sortOrder: 180,
  },
  {
    key: "other_safety_concern_present",
    displayName: "Other Safety Concern",
    valueType: "boolean",
    validValues: null,
    isRequired: false,
    sortOrder: 190,
  },
  // ---- Infrastructure — umbrella + sub-types ------------------------------
  {
    key: "infrastructure_issue_present",
    displayName: "Infrastructure Issue Present",
    valueType: "boolean",
    validValues: null,
    isRequired: false,
    sortOrder: 200,
  },
  {
    key: "glass_damage_present",
    displayName: "Glass Damage Present",
    valueType: "boolean",
    validValues: null,
    isRequired: false,
    sortOrder: 210,
  },
  {
    key: "graffiti_present",
    displayName: "Graffiti Present",
    valueType: "boolean",
    validValues: null,
    isRequired: false,
    sortOrder: 220,
  },
  {
    key: "receptacle_damage_present",
    displayName: "Receptacle Damage Present",
    valueType: "boolean",
    validValues: null,
    isRequired: false,
    sortOrder: 230,
  },
  {
    key: "shelter_panel_damage_present",
    displayName: "Shelter Panel Damage Present",
    valueType: "boolean",
    validValues: null,
    isRequired: false,
    sortOrder: 240,
  },
  {
    key: "lighting_failure_present",
    displayName: "Lighting Failure Present",
    valueType: "boolean",
    validValues: null,
    isRequired: false,
    sortOrder: 250,
  },
  {
    key: "access_obstructed_by_landscape",
    displayName: "Access Obstructed by Landscape",
    valueType: "boolean",
    validValues: null,
    isRequired: false,
    sortOrder: 260,
  },
  {
    key: "structural_damage_present",
    displayName: "Structural Damage Present",
    valueType: "boolean",
    validValues: null,
    isRequired: false,
    sortOrder: 270,
  },
  {
    key: "other_infrastructure_issue_present",
    displayName: "Other Infrastructure Issue",
    valueType: "boolean",
    validValues: null,
    isRequired: false,
    sortOrder: 280,
  },
];

// ---------------------------------------------------------------------------
// Seeder steps
// ---------------------------------------------------------------------------

async function resolveKcmOrg(client: PoolClient): Promise<number> {
  const res = await client.query<{ id: number }>(
    `SELECT id FROM organizations WHERE slug = $1`,
    ["kcm"]
  );
  if (res.rows.length === 0) {
    throw new Error(
      "KCM org not found (slug = 'kcm'). Run the org seed or check your DB."
    );
  }
  return res.rows[0].id;
}

async function upsertAssetType(
  client: PoolClient,
  orgId: number
): Promise<number> {
  const res = await client.query<{ id: number }>(
    `INSERT INTO core.asset_types (org_id, type_key, display_name, description)
     VALUES ($1, 'transit_stop', 'Transit Stop',
             'KCM transit bus stops — seeded from transit_stops via seed_transit_assets.ts')
     ON CONFLICT (org_id, type_key) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       description  = EXCLUDED.description,
       is_active    = true
     RETURNING id`,
    [orgId]
  );
  return res.rows[0].id;
}

async function upsertObservationTypes(
  client: PoolClient,
  orgId: number,
  assetTypeId: number
): Promise<number> {
  let upserted = 0;
  for (const t of TRANSIT_STOP_OBSERVATION_TYPES) {
    const isActive = t.isActive !== false;
    await client.query(
      `INSERT INTO core.observation_type_registry
         (org_id, asset_type_id, observation_key, display_name,
          value_type, valid_values, is_required, sort_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (org_id, asset_type_id, observation_key) DO UPDATE SET
         display_name  = EXCLUDED.display_name,
         value_type    = EXCLUDED.value_type,
         valid_values  = EXCLUDED.valid_values,
         is_required   = EXCLUDED.is_required,
         sort_order    = EXCLUDED.sort_order,
         is_active     = EXCLUDED.is_active`,
      [
        orgId,
        assetTypeId,
        t.key,
        t.displayName,
        t.valueType,
        t.validValues !== null ? JSON.stringify(t.validValues) : null,
        t.isRequired,
        t.sortOrder,
        isActive,
      ]
    );
    upserted++;
  }
  return upserted;
}

async function upsertAssets(
  client: PoolClient,
  orgId: number
): Promise<number> {
  // public.asset_types.code = 'transit_stop' (global code table) is the FK
  // that public.assets.asset_type_id references. All 14,916 rows already
  // exist with seed_key = stop_id. This upsert backfills external_id and
  // populates attributes from transit_stops metadata.
  const res = await client.query<{ count: string }>(
    `WITH upserted AS (
       INSERT INTO public.assets
         (org_id, asset_type_id, seed_key, external_id,
          display_name, lat, lon, attributes, active, updated_at)
       SELECT
         ts.org_id,
         pat.id,
         ts.stop_id,
         ts.stop_id,
         ts.on_street_name,
         ts.lat,
         ts.lon,
         jsonb_build_object(
           'is_hotspot',            ts.is_hotspot,
           'compactor',             ts.compactor,
           'has_trash',             ts.has_trash,
           'pool_id',               ts.pool_id,
           'priority_class',        ts.priority_class,
           'num_shelters',          COALESCE(ts.num_shelters, 0),
           'notes',                 ts.notes,
           'stop_status',           ts.stop_status,
           'trf_district_code',     ts.trf_district_code,
           'bay_code',              ts.bay_code,
           'bearing_code',          ts.bearing_code,
           'kcm_managed_equipment', ts.kcm_managed_equipment,
           'route_list',            ts.route_list
         ),
         true,
         now()
       FROM transit_stops ts
       JOIN public.asset_types pat ON pat.code = 'transit_stop'
       WHERE ts.org_id = $1
       ON CONFLICT (org_id, asset_type_id, seed_key) DO UPDATE SET
         external_id  = EXCLUDED.external_id,
         display_name = EXCLUDED.display_name,
         lat          = EXCLUDED.lat,
         lon          = EXCLUDED.lon,
         attributes   = EXCLUDED.attributes,
         updated_at   = EXCLUDED.updated_at
       RETURNING id
     )
     SELECT COUNT(*)::text AS count FROM upserted`,
    [orgId]
  );
  return parseInt(res.rows[0].count, 10);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async () => {
  console.log("Tier 8 — Transit asset seeder");
  console.log("  target org: kcm");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const orgId = await resolveKcmOrg(client);
    console.log(`  org_id: ${orgId}`);

    const coreAssetTypeId = await upsertAssetType(client, orgId);
    console.log(`  core.asset_types id: ${coreAssetTypeId} (transit_stop)`);

    const obsCount = await upsertObservationTypes(client, orgId, coreAssetTypeId);
    console.log(`  core.observation_type_registry: ${obsCount} types upserted`);

    const assetCount = await upsertAssets(client, orgId);
    console.log(`  public.assets: ${assetCount} rows upserted (external_id + attributes)`);

    await client.query("COMMIT");
    console.log("\nSeed complete.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seed failed — rolled back.");
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
