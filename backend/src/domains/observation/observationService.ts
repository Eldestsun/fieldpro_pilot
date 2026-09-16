import { PoolClient } from "pg";
import { withOrgContext } from "../../db";
import { loadRegistryRules, normalizeObservation } from "./observationNormalizer";
import { toNumericSeverity } from "../routeRunStop/hazardService";
import { encrypt as encryptOid } from "../../lib/oidCipher";

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

    // Optional free-text note captured in the Report Safety modal (ONE box per
    // submission). ISSUE-072: this now lands once in core.visit_notes at
    // (visit, category='safety') grain — NOT replicated into every safety
    // observation's payload. See emitVisitNotes below.
    hazard_notes?: string;

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

    // Full per-issue infrastructure detail. When present, one observation is
    // emitted per entry with its per-issue-type cause/component threaded into
    // core.observations.payload (these ARE per-observation structured attributes:
    // glass↔vandalism, lighting↔wear_and_tear, etc.). Falls back to the flat
    // infrastructureIssues type list when absent.
    // ISSUE-072: `notes` is the ONE free-text infra box, replicated across every
    // entry by the capture UI. It no longer lands in payload; it lands once in
    // core.visit_notes at (visit, category='infra') grain (see emitVisitNotes).
    // Kept on the type because the capture layer still carries it per-entry.
    infraIssueDetails?: Array<{
        issue_type: string;
        cause?: string;
        component?: string;
        notes?: string | null;
    }>;
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

    // ISSUE-072: observations and their visit-level free-text notes are written
    // on the SAME client so, when a transaction-bound client is passed (the
    // complete/skip paths run inside one BEGIN/COMMIT — ISSUE-051), notes commit
    // atomically with the observations they describe. Notes are written even if
    // no observation rows were produced (defensive; in practice a note always
    // accompanies a hazard/infra observation).
    const runWrite = async (writeClient: PoolClient) => {
        if (observations.length > 0) {
            await insertObservations(writeClient, { orgId, visitId, locationId, assetId, actorOid }, observations);
        }
        await insertVisitNotes(writeClient, { orgId, visitId }, uiPayload);
    };

    if (passedClient) {
        await runWrite(passedClient);
    } else {
        await withOrgContext(orgId, runWrite);
    }
}

// ISSUE-072: extract the per-category visit notes from the UI payload. Safety
// carries a single `hazard_notes`. Infra carries one free-text box that the
// capture UI replicates across every infraIssueDetails entry — so the distinct
// note is the first non-empty one. Each maps to one core.visit_notes row.
function extractVisitNotes(ui: StopUiPayload): Array<{ category: string; note: string }> {
    const rows: Array<{ category: string; note: string }> = [];

    const safety = ui.hazard_notes?.trim();
    if (safety) {
        rows.push({ category: "safety", note: safety });
    }

    const infra = ui.infraIssueDetails
        ?.map(i => i.notes?.trim())
        .find((n): n is string => !!n);
    if (infra) {
        rows.push({ category: "infra", note: infra });
    }

    return rows;
}

async function insertVisitNotes(
    client: PoolClient,
    ctx: { orgId: number; visitId: number },
    ui: StopUiPayload
) {
    const notes = extractVisitNotes(ui);
    for (const { category, note } of notes) {
        // ON CONFLICT keeps the write idempotent under offline replay / a stop
        // completed twice: the note is updated in place at its (visit, category)
        // grain rather than erroring or duplicating.
        await client.query(
            `
      INSERT INTO core.visit_notes (visit_id, org_id, category, note)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (visit_id, category)
        DO UPDATE SET note = EXCLUDED.note, recorded_at = now()
      `,
            [ctx.visitId, ctx.orgId, category, note]
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
    // Severity lands in TWO places, both additive:
    //   - legacy `severity` text column (unchanged) — e.g. "high"
    //   - payload.severity as a NUMBER — the §4.2 normalizer reads this via the
    //     presence severity_map {"field":"severity"} (CANON-NORM-1) and carries it
    //     into core.observations.norm_severity (CANON-NORM-2). It is the SAME numeric
    //     value the hazards adapter stores in public.hazards.severity, via the shared
    //     toNumericSeverity scale — a mechanical passthrough of what the adapter
    //     already records, NOT an authored magnitude.
    // When the worker reported NO severity, nothing is threaded into payload and
    // norm_severity stays NULL: canonical does not manufacture a magnitude (§4.4 /
    // invariant #5). It deliberately does not replicate the adapter's synthetic
    // default-of-1 (toNumericSeverity(undefined)=1) — that default is an adapter
    // artifact, not a worker-asserted fact.
    const hazardSeverity = ui.hazard_severity != null ? String(ui.hazard_severity) : null;
    const hazardSeverityNum = ui.hazard_severity != null ? toNumericSeverity(ui.hazard_severity) : null;
    if (ui.safetyConcern) {
        ui.safetyHazards?.forEach(h => {
            obs.push({
                observation_type: mapSafetyHazard(h),
                payload: {
                    // ISSUE-072: free-text note no longer replicated here; it lands
                    // once in core.visit_notes (category='safety'). Only the numeric
                    // severity (a per-observation magnitude the §4.2 normalizer reads)
                    // stays in payload.
                    ...(hazardSeverityNum != null && { severity: hazardSeverityNum }),
                },
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
        if (ui.infraIssueDetails && ui.infraIssueDetails.length > 0) {
            // Preferred path: one observation per detailed issue, with
            // per-issue-type cause/component threaded into payload (ISSUE-031
            // Step 5). The free-text note lands in core.visit_notes, not here
            // (ISSUE-072). Infra has no severity at the source — none is invented.
            ui.infraIssueDetails.forEach(issue => {
                obs.push({
                    observation_type: mapInfraIssue(issue.issue_type),
                    payload: {
                        // cause/component are per-issue-type structured attributes and
                        // stay on the observation. ISSUE-072: the free-text note does
                        // NOT — it lands once in core.visit_notes (category='infra').
                        ...(issue.cause && { cause: issue.cause }),
                        ...(issue.component && { component: issue.component }),
                    }
                });
            });
        } else {
            // Fallback: flat type-name list (no per-issue detail available).
            ui.infrastructureIssues?.forEach(i => {
                obs.push({
                    observation_type: mapInfraIssue(i),
                    payload: {}
                });
            });
        }
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

// Write-path presence maps: normalized UI key → observation_type. Exported (SEAM-C)
// as the SINGLE SOURCE of the presence taxonomy — `presenceTaxonomy.ts` derives the
// SAFETY/INFRA count sets from these values, so the CC-read classification cannot
// drift from what this write path actually emits. A drift-guard test pins the
// derived membership (presenceTaxonomy.test.ts).
export const SAFETY_HAZARD_TYPE_MAP: Record<string, string> = {
    encampment: "encampment_present",
    fire: "fire_present",
    dangerous_activity: "dangerous_activity_present",
    drug_use: "drug_use_present",
    violence: "violence_present",
    biohazard: "biohazard_present",
    access_blocked: "access_blocked",
    other: "other_safety_concern_present",
};

export const INFRA_ISSUE_TYPE_MAP: Record<string, string> = {
    glass_damage: "glass_damage_present",
    graffiti: "graffiti_present",
    receptacle_damage: "receptacle_damage_present",
    shelter_panel_damage: "shelter_panel_damage_present",
    lighting_failure: "lighting_failure_present",
    landscape_obstruction: "access_obstructed_by_landscape",
    structural_damage: "structural_damage_present",
    // The infra-modal "Contaminated waste (biohazard)" checkbox is the same fact as
    // the safety hazard biohazard_present — feces, urine, needles, other infectious
    // material. It's a SAFETY presence regardless of which capture surface emitted
    // it, so presenceTaxonomy attributes it to hazards, not infra. Hazard presence
    // is decoupled from skip. (Canonical state layer 2026-05-25 cleanup; design §2.1.)
    contaminated_waste: "biohazard_present",
    other: "other_infrastructure_issue_present",
};

function mapSafetyHazard(h: string) {
    const norm = normalizeSafetyKey(h);
    const mapped = SAFETY_HAZARD_TYPE_MAP[norm];
    if (!mapped) {
        console.warn("Unmapped safety hazard key", { key: h, normalized: norm });
        return "other_safety_concern_present";
    }
    return mapped;
}

function mapInfraIssue(i: string) {
    const norm = normalizeInfraKey(i);
    const mapped = INFRA_ISSUE_TYPE_MAP[norm];
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
    // Write-time normalization (§4.2). One registry query for the whole batch
    // (no per-observation N+1), then normalize each row before its INSERT.
    const rules = await loadRegistryRules(
        client,
        context.orgId,
        observations.map(o => o.observation_type)
    );

    // ISSUE-058: encrypt the actor OID once for the whole batch (same actor for
    // every observation in this call). The sentinel 'encrypted' goes to actor_ref;
    // the real OID lives only in actor_ref_ciphertext.
    const { ciphertext: oidCiphertext, keyId: oidKeyId } =
        await encryptOid(context.actorOid, "observation_create");

    for (const o of observations) {
        // Derive the normalized columns from the registry rule. A missing rule
        // yields all-NULL normalized fields and a warning — never blocks the write
        // (additive discipline, ISSUE-031). Intelligence reads these, never payload.
        const norm = normalizeObservation(rules.get(o.observation_type), o.observation_type, o.payload);

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
        severity,
        obs_kind,
        norm_status,
        norm_severity,
        intervention,
        type_id
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING id
      `,
            [
                context.orgId,
                context.visitId,
                context.locationId,
                context.assetId,
                o.observation_type,
                o.payload,
                o.severity ?? null,
                norm.obs_kind,
                norm.norm_status,
                norm.norm_severity,
                norm.intervention,
                norm.type_id
            ]
        );
        // ISSUE-058: actor_ref holds the non-identifying sentinel; the OID lives
        // only in actor_ref_ciphertext. Never write an identifying value here.
        await client.query(
            `
      INSERT INTO core.observation_actor_audit
        (observation_id, org_id, actor_ref, actor_ref_ciphertext, actor_ref_key_id)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (observation_id) DO NOTHING
      `,
            [res.rows[0].id, context.orgId, 'encrypted', oidCiphertext, oidKeyId]
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

    // Normalize the spot_check through the same §4.2 path. ISSUE-066 closed the
    // §9 Q4 residual: the payload now carries the §3.5 target shape and the
    // registry ok_rule ({field:'result', eq:'no_work_needed'}) grades it 'ok' —
    // the stop-level positive anchor that makes component-level silence readable
    // as benign (§4.4).
    const spotPayload = { scope: "stop", result: "no_work_needed" };
    const spotRules = await loadRegistryRules(client, orgId, ["spot_check"]);
    const spotNorm = normalizeObservation(spotRules.get("spot_check"), "spot_check", spotPayload);

    // Worker identity goes to the no-grant sidecar, never on core.observations (§3.2).
    const res = await client.query(
        `
    INSERT INTO core.observations (
      org_id,
      visit_id,
      location_id,
      asset_id,
      observation_type,
      payload,
      obs_kind,
      norm_status,
      norm_severity,
      intervention,
      type_id
    ) VALUES ($1, $2, $3, $4, 'spot_check', $5, $6, $7, $8, $9, $10)
    RETURNING id
    `,
        [
            orgId,
            visitId,
            locationId,
            assetId,
            spotPayload,
            spotNorm.obs_kind,
            spotNorm.norm_status,
            spotNorm.norm_severity,
            spotNorm.intervention,
            spotNorm.type_id
        ]
    );
    // ISSUE-058: actor_ref holds the non-identifying sentinel; the OID lives only
    // in actor_ref_ciphertext. Never write an identifying value here.
    const { ciphertext: oidCiphertext, keyId: oidKeyId } =
        await encryptOid(actorOid, "observation_spotcheck");
    await client.query(
        `
    INSERT INTO core.observation_actor_audit
      (observation_id, org_id, actor_ref, actor_ref_ciphertext, actor_ref_key_id)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (observation_id) DO NOTHING
    `,
        [res.rows[0].id, orgId, 'encrypted', oidCiphertext, oidKeyId]
    );
}
