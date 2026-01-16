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

    skipForSafety?: boolean;

    // Cleaning
    picked_up_litter?: boolean;
    emptied_trash?: boolean;
    washed_shelter?: boolean;
    washed_pad?: boolean;

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
};

// PUBLIC API
export async function emitObservationsForStop(params: {
    phase: "arrival" | "submit";
    visitId: number;
    orgId: number;
    assetId: number;
    locationId: number;
    actorOid: string;
    uiPayload?: StopUiPayload;
}): Promise<void> {
    const { phase, visitId, orgId, assetId, locationId, actorOid, uiPayload } = params;

    let observations: ObservationInsert[] = [];

    if (phase === "arrival") {
        observations = arrivalObservations();
    } else if (phase === "submit" && uiPayload) {
        observations = submitObservations(uiPayload);
    }

    if (observations.length > 0) {
        const client = await pool.connect();
        try {
            await insertObservations(client, { orgId, visitId, locationId, assetId, actorOid }, observations);
        } finally {
            client.release();
        }
    }
}

// ARRIVAL PHASE LOGIC
function arrivalObservations(): ObservationInsert[] {
    return [
        { observation_type: "ground_condition", payload: { state: "dirty" } },
        { observation_type: "trash_can_condition", payload: { state: "has_trash" } },
        { observation_type: "shelter_condition", payload: { state: "dirty" } },
        { observation_type: "pad_condition", payload: { state: "dirty" } }
    ];
}

// SUBMIT PHASE LOGIC
function submitObservations(ui: StopUiPayload): ObservationInsert[] {
    const obs: ObservationInsert[] = [];

    // Safety
    if (ui.safetyConcern) {
        obs.push({ observation_type: "safety_concern_present", payload: {} });

        ui.safetyHazards?.forEach(h => {
            obs.push({
                observation_type: mapSafetyHazard(h),
                payload: {}
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
        created_by_oid
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      `,
            [
                context.orgId,
                context.visitId,
                context.locationId,
                context.assetId,
                o.observation_type,
                o.payload,
                context.actorOid
            ]
        );
    }
}

export async function emitSpotCheckObservation(params: {
    pool: any;
    visitId: number;
    orgId: number;
    locationId: number;
    assetId: number;
    actorOid: string;
}) {
    const { pool, visitId, orgId, locationId, assetId, actorOid } = params;
    await pool.query(
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
