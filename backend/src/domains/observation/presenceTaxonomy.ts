import {
  SAFETY_HAZARD_TYPE_MAP,
  INFRA_ISSUE_TYPE_MAP,
} from "./observationService";

// Presence-observation taxonomy — the canonical safety-hazard vs infrastructure-issue
// split, DERIVED from the write-path maps so it cannot drift from what actually gets
// written.
//
// WHY (ISSUE-058 / SEAM-C): hazards and infra issues both land in core.observations as
// `obs_kind = 'presence'` rows — there is NO schema-level discriminator. The only
// authoritative split is the write-path mappers (observationService.ts
// mapSafetyHazard / mapInfraIssue). Rather than copy their output lists (which would
// silently drift and make the CC exceptions count miss or mis-attribute reports), these
// sets are computed from `SAFETY_HAZARD_TYPE_MAP` / `INFRA_ISSUE_TYPE_MAP` — the single
// source. A drift-guard test (presenceTaxonomy.test.ts) pins the resulting membership so
// any mapper change is a visible, reviewed change.
//
// The safety/infra boundary handles the documented cross-map for free: the infra map's
// "contaminated waste" entry maps to the SAFETY type `biohazard_present`, so subtracting
// the safety set from the infra values attributes contaminated-waste reports to HAZARDS,
// never infrastructure.

const uniq = (xs: string[]): string[] => Array.from(new Set(xs));

/** Safety-hazard presence types — every distinct output of mapSafetyHazard. */
export const SAFETY_PRESENCE_TYPES: readonly string[] = uniq(
  Object.values(SAFETY_HAZARD_TYPE_MAP),
);

const SAFETY_SET = new Set(SAFETY_PRESENCE_TYPES);

/** Infrastructure-issue presence types — mapInfraIssue outputs MINUS any that are
 *  already safety types (i.e. contaminated_waste → biohazard_present is excluded and
 *  counts under hazards). */
export const INFRA_PRESENCE_TYPES: readonly string[] = uniq(
  Object.values(INFRA_ISSUE_TYPE_MAP),
).filter((t) => !SAFETY_SET.has(t));
