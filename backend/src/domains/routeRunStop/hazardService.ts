// The single source of the hazard severity label->number scale. Exported so the
// canonical write path (observationService) carries the correct numeric magnitude
// into core.observations.norm_severity (CANON-NORM-2). The scale itself is
// pre-existing, not authored here.
//
// ISSUE-031 Stage 2 (2026-06-18): the public.hazards dual-write mirror that this
// module used to perform was clipped. Hazard submissions now write ONLY canonical
// (core.observations / core.visits / core.evidence + the grant-walled
// core.observation_actor_audit) via emitObservationsForStop. public.hazards is
// frozen (no longer receives new rows); its dormant readers and the table itself
// stay in place pending Capability Build (reader repoint) and Stage 3 (table drop).
export function toNumericSeverity(s: string | number | undefined | null): number {
    if (typeof s === "number") return s;
    if (s === "low") return 1;
    if (s === "medium") return 2;
    if (s === "high") return 3;
    return 1; // default
}
