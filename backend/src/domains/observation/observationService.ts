import { PoolClient } from "pg";
import { withOrgContext } from "../../db";

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
//
// Submit-phase only. The historical "arrival" phase emitted manufactured
// *_condition rows at stop-start with no specialist input; it was investigated
// 2026-05-25 (planning/intelligence-layer/ARRIVAL_PHASE_DATA_PATH.md), found to
// be both manufactured state (canonical state layer §2 invariant #5) and
// unreachable from any production call site, and removed in the same dated
// changelog. "Met standard" is now entailed structurally by absence of a
// not_ok row anchored to a visit/spot-check (§4.4).
export async function emitObservationsForStop(params: {
    phase: "submit";
    visitId: number;
    orgId: number;
    assetId: number;
    locationId: number;
    actorOid: string;
    uiPayload?: StopUiPayload;
    client?: PoolClient;
}): Promise<void> {
    const { visitId, orgId, assetId, locationId, actorOid, uiPayload, client: passedClient } = params;

    if (!uiPayload) {
        return;
    }

    const observations = submitObservations(uiPayload);
    if (observations.length === 0) {
        return;
    }

    if (passedClient) {
        await insertObservations(passedClient, { orgId, visitId, locationId, assetId, actorOid }, observations);
    } else {
        await withOrgContext(orgId, (ownClient) =>
            insertObservations(ownClient, { orgId, visitId, locationId, assetId, actorOid }, observations)
        );
    }
}

// SUBMIT PHASE LOGIC
function submitObservations(ui: StopUiPayload): ObservationInsert[] {
    const obs: ObservationInsert[] = [];

    // Safety — danger is captured as the SPECIFIC presence observation(s) the
    // worker selected. The umbrella generic `safety_concern_present` was
    // retired (canonical state layer §1 dual-retirement, 2026-05-25) because
    // it is entailed by the specific presences and invites double-counting.
    // `stop_not_serviced_due_to_safety` was retired for the same reason: it
    // is entailed by `core.visits.outcome = 'skipped'` + `reason_code = 'safety'`
    // which is written elsewhere on the skip path.
    // Specific presences are written REGARDLESS of whether the stop was
    // skipped — serviced-anyway hazards still count.
    const hazardSeverity = ui.hazard_severity != null ? String(ui.hazard_severity) : null;
    if (ui.safetyConcern) {
        ui.safetyHazards?.forEach(h => {
            obs.push({
                observation_type: mapSafetyHazard(h),
                payload: {},
                severity: hazardSeverity,
            });
        });
    }

    // Cleaning actions (kind=action). One standalone row per performed cleaning,
    // identified by the registry type key (which IS the component+act pairing —
    // washed_pad ↔ pad, washed_shelter ↔ shelter, picked_up_litter ↔ ground,
    // emptied_trash ↔ trash_can, washed_can ↔ trash receptacle).
    //
    // No manufactured arrival condition is written: the prior pattern wrote a
    // synthetic state='dirty' row before each clean, asserting an arrival state
    // nobody observed. That's the welded-transition / dirty-default defect the
    // refined canonical state layer forbids (§2 invariants #5, #6 and §2.1).
    // Absence of a not_ok condition row, anchored by a visit/spot-check, IS the
    // record that the component met standard at time of service (§4.4).
    if (ui.picked_up_litter) {
        obs.push({ observation_type: "picked_up_litter", payload: {} });
    }

    if (ui.emptied_trash) {
        obs.push({ observation_type: "emptied_trash", payload: {} });
    }

    if (ui.washed_shelter) {
        obs.push({ observation_type: "washed_shelter", payload: {} });
    }

    if (ui.washed_pad) {
        obs.push({ observation_type: "washed_pad", payload: {} });
    }

    if (ui.washed_can) {
        obs.push({ observation_type: "washed_can", payload: {} });
    }

    // Trash volume
    if (ui.trash_volume !== undefined) {
        obs.push({
            observation_type: "trash_volume",
            payload: { level: ui.trash_volume }
        });
    }

    // Infrastructure — the generic 'infrastructure_issue_present' umbrella was
    // retired (canonical state layer §2.1, 2026-05-25) for the same reason as
    // 'safety_concern_present': it is entailed by the OR over the 8 specific
    // infra *_present types and invites double-counting. Only the specific
    // presences are written.
    if (ui.infrastructurePresent) {
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
        // The infra-modal "Contaminated waste (biohazard)" checkbox is the same
        // fact as the safety hazard biohazard_present — feces, urine, needles,
        // other infectious material. It's a SAFETY presence regardless of which
        // capture surface emitted it. Hazard presence is decoupled from skip:
        // a worker who finds a biohazard, cleans it, and continues still
        // records biohazard_present with NO skip. (Canonical state layer
        // 2026-05-25 cleanup; design doc §2.1.)
        contaminated_waste: "biohazard_present",
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
        // Worker identity is NOT written to core.observations — it goes to the
        // no-grant sidecar core.observation_actor_audit (§3.2 structural boundary).
        const res = await client.query(
            `
      INSERT INTO core.observations (
        org_id,
        visit_id,
        location_id,
        asset_id,
        observation_type,
        payload,
        severity
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id
      `,
            [
                context.orgId,
                context.visitId,
                context.locationId,
                context.assetId,
                o.observation_type,
                o.payload,
                o.severity ?? null
            ]
        );
        await client.query(
            `
      INSERT INTO core.observation_actor_audit (observation_id, org_id, actor_ref)
      VALUES ($1, $2, $3)
      ON CONFLICT (observation_id) DO NOTHING
      `,
            [res.rows[0].id, context.orgId, context.actorOid]
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
    // Worker identity goes to the no-grant sidecar, never on core.observations (§3.2).
    const res = await client.query(
        `
    INSERT INTO core.observations (
      org_id,
      visit_id,
      location_id,
      asset_id,
      observation_type,
      payload
    ) VALUES ($1, $2, $3, $4, 'spot_check', '{}'::jsonb)
    RETURNING id
    `,
        [orgId, visitId, locationId, assetId]
    );
    await client.query(
        `
    INSERT INTO core.observation_actor_audit (observation_id, org_id, actor_ref)
    VALUES ($1, $2, $3)
    ON CONFLICT (observation_id) DO NOTHING
    `,
        [res.rows[0].id, orgId, actorOid]
    );
}
