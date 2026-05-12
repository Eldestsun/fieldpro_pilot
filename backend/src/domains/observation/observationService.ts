import { PoolClient } from "pg";
import { pool } from "../../db";

// Raw UI payload from UL
export type StopUiPayload = {
    // Safety
    safetyConcern?: boolean;
    safetyHazards?: (
        | "encampment"
        | "fire"
        | "dangerous_activity"
        | "active_drug_use" // New FE key
        | "drug_use"
        | "violence"
        | "biohazard"
        | "traffic" // New FE key
        | "access_blocked"
        | "other"
    )[];

    // Optional severity for hazards reported in this visit. Written into
    // core.observations.severity on every hazard-type observation emitted
    // from this payload. Consumed by riskMapService hazard scoring.
    hazard_severity?: string | number;

    skipForSafety?: boolean;

    // Cleaning
    picked_up_litter?: boolean;
    emptied_trash?: boolean;
    washed_shelter?: boolean;
    washed_pad?: boolean;
    washed_can?: boolean;

    trash_volume?: 0 | 1 | 2 | 3 | 4;

    // Infrastructure
    infrastructurePresent?: boolean;
    infrastructureIssues?: (
        | "glass_damage"
        | "glass_broken" // New FE key
        | "graffiti"
        | "graffiti_excessive" // New FE key
        | "receptacle_damage"
        | "receptacle_damaged" // New FE key
        | "shelter_panel_damage"
        | "panel_damaged" // New FE key
        | "lighting_failure"
        | "lighting_out" // New FE key
        | "landscape_obstruction"
        | "landscaping_blocking" // New FE key
        | "structural_damage"
        | "structure_damaged" // New FE key
        | "other"
        | "other_infra_issue" // New FE key
    )[];
};

export type ObservationInsert = {
    observation_type: string;
    payload: Record<string, any>;
    severity?: string | null;
};

// PUBLIC API
export async function emitObservationsForStop(params: {
    phase: "arrival" | "submit";
    visitId: number;
    orgId: number;
    assetId: number;
    locationId: number;
    actorOid: string;
    stopId?: string;
    uiPayload?: StopUiPayload;
    client?: PoolClient;
}): Promise<void> {
    const { phase, visitId, orgId, assetId, locationId, actorOid, stopId, uiPayload, client: passedClient } = params;

    let observations: ObservationInsert[] = [];

    if (phase === "arrival") {
        if (stopId) {
            if (passedClient) {
                observations = await arrivalObservations(stopId, passedClient);
            } else {
                const lookupClient = await pool.connect();
                try {
                    observations = await arrivalObservations(stopId, lookupClient);
                } finally {
                    lookupClient.release();
                }
            }
        } else {
            observations = arrivalObservationDefaults();
        }
    } else if (phase === "submit" && uiPayload) {
        observations = submitObservations(uiPayload);
    }

    if (observations.length > 0) {
        if (passedClient) {
            await insertObservations(passedClient, { orgId, visitId, locationId, assetId, actorOid }, observations);
        } else {
            const ownClient = await pool.connect();
            try {
                await insertObservations(ownClient, { orgId, visitId, locationId, assetId, actorOid }, observations);
            } finally {
                ownClient.release();
            }
        }
    }
}

// ARRIVAL PHASE LOGIC

const ARRIVAL_OBSERVATION_TYPES = [
    "ground_condition",
    "trash_can_condition",
    "shelter_condition",
    "pad_condition",
] as const;

// Hardcoded pessimistic defaults — used when stopId is unavailable or no prior visit exists
function arrivalObservationDefaults(): ObservationInsert[] {
    return [
        { observation_type: "ground_condition", payload: { state: "dirty" } },
        { observation_type: "trash_can_condition", payload: { state: "has_trash" } },
        { observation_type: "shelter_condition", payload: { state: "dirty" } },
        { observation_type: "pad_condition", payload: { state: "dirty" } },
    ];
}

// Looks up the most recent observation of each arrival type at this stop.
//
// Path B (1 adapter hop — tolerated as a vertical identifier translation):
//   core.observations.asset_id → transit_stop_assets.asset_id WHERE stop_id = $1
// core.observations.asset_id is fully populated (100% of rows). transit_stop_assets
// translates the transit stop_id to a canonical asset_id at the boundary — one hop,
// not embedded adapter logic.
//
// Path F (fully canonical) activates in Tier 8: asset_id will be passed directly by
// the caller, and transit_stop_assets is no longer referenced at all.
//
// Do NOT use clean_logs as the bridge (Path A — 3 adapter hops, deprecated by Tier 2).
// See planning/architecture/ADAPTER_BOUNDARY.md for the full join map.
//
// Falls back to dirty defaults for any type with no prior history.
async function arrivalObservations(
    stopId: string,
    client: PoolClient
): Promise<ObservationInsert[]> {
    const result = await client.query<{ observation_type: string; payload: Record<string, any> }>(
        `
        SELECT DISTINCT ON (o.observation_type)
            o.observation_type,
            o.payload
        FROM core.observations o
        JOIN transit_stop_assets tsa
          ON tsa.asset_id = o.asset_id
         AND tsa.active = TRUE
         AND tsa.role = 'primary'
        WHERE tsa.stop_id = $1
          AND o.observation_type = ANY($2)
        ORDER BY o.observation_type, o.observed_at DESC
        `,
        [stopId, ARRIVAL_OBSERVATION_TYPES]
    );

    const priorState = new Map(result.rows.map(r => [r.observation_type, r.payload]));

    return ARRIVAL_OBSERVATION_TYPES.map(type => ({
        observation_type: type,
        payload: priorState.get(type) ?? arrivalDefault(type),
    }));
}

function arrivalDefault(type: typeof ARRIVAL_OBSERVATION_TYPES[number]): Record<string, any> {
    if (type === "trash_can_condition") return { state: "has_trash" };
    return { state: "dirty" };
}

// SUBMIT PHASE LOGIC
function submitObservations(ui: StopUiPayload): ObservationInsert[] {
    const obs: ObservationInsert[] = [];

    // Safety
    const hazardSeverity = ui.hazard_severity != null ? String(ui.hazard_severity) : null;
    if (ui.safetyConcern) {
        obs.push({ observation_type: "safety_concern_present", payload: {}, severity: hazardSeverity });

        ui.safetyHazards?.forEach(h => {
            obs.push({
                observation_type: mapSafetyHazard(h),
                payload: {},
                severity: hazardSeverity,
            });
        });
    }

    if (ui.skipForSafety) {
        obs.push({
            observation_type: "stop_not_serviced_due_to_safety",
            payload: {}
        });
    }

    // Cleaning (Paired: Dirty -> Clean)
    // Cleaning (Paired: Dirty -> Clean)
    if (ui.picked_up_litter) {
        obs.push({ observation_type: "ground_condition", payload: { state: "dirty" } });
        obs.push({ observation_type: "ground_condition", payload: { state: "clean" } });
    }

    if (ui.emptied_trash) {
        obs.push({ observation_type: "trash_can_condition", payload: { state: "has_trash" } });
        obs.push({ observation_type: "trash_can_condition", payload: { state: "empty" } });
    }

    if (ui.washed_shelter) {
        obs.push({ observation_type: "shelter_condition", payload: { state: "dirty" } });
        obs.push({ observation_type: "shelter_condition", payload: { state: "clean" } });
    }

    if (ui.washed_pad) {
        obs.push({ observation_type: "pad_condition", payload: { state: "dirty" } });
        obs.push({ observation_type: "pad_condition", payload: { state: "clean" } });
    }

    if (typeof ui.washed_can === 'boolean') {
        obs.push({ observation_type: "washed_can", payload: { value: ui.washed_can } });
    }

    // Trash volume
    if (ui.trash_volume !== undefined) {
        obs.push({
            observation_type: "trash_volume",
            payload: { level: ui.trash_volume }
        });
    }

    // Infrastructure
    if (ui.infrastructurePresent) {
        obs.push({
            observation_type: "infrastructure_issue_present",
            payload: {}
        });

        ui.infrastructureIssues?.forEach(i => {
            obs.push({
                observation_type: mapInfraIssue(i),
                payload: {}
            });
        });
    }

    return obs;
}

// MAPPING HELPERS

function normalizeSafetyKey(k: string): string {
    const key = k.toLowerCase();
    if (key === "active_drug_use") return "drug_use";
    if (key === "traffic") return "access_blocked";
    return key;
}

function normalizeInfraKey(k: string): string {
    const key = k.toLowerCase();
    if (key === "glass_broken") return "glass_damage";
    if (key === "graffiti_excessive") return "graffiti";
    if (key === "receptacle_damaged") return "receptacle_damage";
    if (key === "panel_damaged") return "shelter_panel_damage";
    if (key === "lighting_out") return "lighting_failure";
    if (key === "landscaping_blocking") return "landscape_obstruction";
    if (key === "structure_damaged") return "structural_damage";
    if (key === "other_infra_issue") return "other";
    return key;
}

function mapSafetyHazard(h: string) {
    const norm = normalizeSafetyKey(h);
    const map: Record<string, string> = {
        encampment: "encampment_present",
        fire: "fire_present",
        dangerous_activity: "dangerous_activity_present",
        drug_use: "drug_use_present",
        violence: "violence_present",
        biohazard: "biohazard_present",
        access_blocked: "access_blocked",
        other: "other_safety_concern_present"
    };

    const mapped = map[norm];
    if (!mapped) {
        console.warn("Unmapped safety hazard key", { key: h, normalized: norm });
        return "other_safety_concern_present";
    }
    return mapped;
}

function mapInfraIssue(i: string) {
    const norm = normalizeInfraKey(i);
    const map: Record<string, string> = {
        glass_damage: "glass_damage_present",
        graffiti: "graffiti_present",
        receptacle_damage: "receptacle_damage_present",
        shelter_panel_damage: "shelter_panel_damage_present",
        lighting_failure: "lighting_failure_present",
        landscape_obstruction: "access_obstructed_by_landscape",
        structural_damage: "structural_damage_present",
        other: "other_infrastructure_issue_present"
    };

    const mapped = map[norm];
    if (!mapped) {
        console.warn("Unmapped infra issue key", { key: i, normalized: norm });
        return "other_infrastructure_issue_present";
    }
    return mapped;
}

// FINAL INSERT
async function insertObservations(
    client: PoolClient,
    context: { orgId: number; visitId: number; locationId: number; assetId: number; actorOid: string },
    observations: ObservationInsert[]
) {
    for (const o of observations) {
        await client.query(
            `
      INSERT INTO core.observations (
        org_id,
        visit_id,
        location_id,
        asset_id,
        observation_type,
        payload,
        severity,
        created_by_oid
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `,
            [
                context.orgId,
                context.visitId,
                context.locationId,
                context.assetId,
                o.observation_type,
                o.payload,
                o.severity ?? null,
                context.actorOid
            ]
        );
    }
}

export async function emitSpotCheckObservation(params: {
    client: PoolClient;
    visitId: number;
    orgId: number;
    locationId: number;
    assetId: number;
    actorOid: string;
}) {
    const { client, visitId, orgId, locationId, assetId, actorOid } = params;
    await client.query(
        `
    INSERT INTO core.observations (
      org_id,
      visit_id,
      location_id,
      asset_id,
      observation_type,
      payload,
      created_by_oid
    ) VALUES ($1, $2, $3, $4, 'spot_check', '{}'::jsonb, $5)
    `,
        [orgId, visitId, locationId, assetId, actorOid]
    );
}
