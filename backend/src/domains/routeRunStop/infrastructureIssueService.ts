// ISSUE-031 Stage 2 (2026-06-18): the public.infrastructure_issues dual-write
// mirror that this module used to perform was clipped — the LAST of the five
// living-table clips (hazards, trash_volume_logs, clean_logs, stop_photos already
// done). Infra-issue submissions now write ONLY canonical: the 8 specific infra
// *_present observation types (glass_damage_present, graffiti_present,
// receptacle_damage_present, shelter_panel_damage_present, lighting_failure_present,
// access_obstructed_by_landscape, structural_damage_present,
// other_infrastructure_issue_present) → core.observations, plus core.visits, emitted
// by emitObservationsForStop() in completeStop(). public.infrastructure_issues is
// frozen (no longer receives new rows); its readers and the table itself stay in
// place pending Capability Build (reader repoint, ISSUE-035) and Stage 3 (table drop).
//
// Field mapping at clip (ISSUE-034 founder decision, recon-confirmed):
//   - issue_type → the 8 disjoint infra *_present observation_type values (canonical
//     home; already the live type-discriminator for infra in core.observations).
//   - cause / component / notes → observation payload (additive, ISSUE-031 Step 5).
//   - needs_facilities → DROPPED, NOT carried to canonical. It was NOT NULL DEFAULT
//     true and hardcoded true at the one write site (2/2 rows true) — always-true-
//     when-row-exists = zero information. Work-group routing derives from infra-type
//     via org config, not from this column. (ISSUE-034 closed Won't-Do.)
//   - reported_by → constant 0 (LEGACY_TRANSIT_USER_ID); carried no worker identity.
//     Identity-clip is a formality (live: 0/2 rows non-zero).
//   - infra severity is NULL in canonical — INTENTIONAL (KCM does not grade infra
//     magnitude; the column is numeric-typed but unused).
//
// route_run_stops.infra_issue_id (FK → public.infrastructure_issues, ON DELETE SET
// NULL) was never written by any code path (live: 0/N rows set), so this clip nulls
// nothing. populateEamBridge's is_exception read of that pointer is a scheduled
// repoint for ISSUE-035, not a loss here.

// Per-issue input shape from the stop-completion UI flow. Retained (the mirror-write
// function is gone) because completeStop() and the observation emitter type their
// infra payload against it.
export interface InfraIssueInput {
    issue_type: string;
    photo_key?: string;
    component?: string;
    cause?: string;
    notes?: string | null;
}
