// Presence-observation taxonomy — the canonical safety-hazard vs infrastructure-issue
// split, pinned here as the single shared constant.
//
// WHY THIS EXISTS (ISSUE-058 / SEAM-C): hazards and infrastructure issues both land
// in core.observations as `obs_kind = 'presence'` rows — there is NO schema-level
// discriminator between "safety hazard" and "infrastructure issue". The only
// authoritative split is the write-path mappers in `observationService.ts`
// (`mapSafetyHazard` / `mapInfraIssue`), which decide which `observation_type` a
// field report becomes. These two sets are the exact output ranges of those mappers.
//
// KEEP IN SYNC with `observationService.ts` mapSafetyHazard/mapInfraIssue and the
// `presence` rows in `core.observation_type_registry`. They are NOT data-driven off
// whatever rows exist — the sets are fixed so a read-side count is deterministic and
// matches what the write path produces. (Same discipline as CLEAN_ACTION_KEYS.)
//
// TAXONOMY NOTE (visible on the Admin CC surface): the infra-capture "contaminated
// waste" checkbox writes `biohazard_present` — a SAFETY presence — per
// observationService.ts mapInfraIssue. So contaminated-waste reports count under
// HAZARDS, not infrastructure. This is deliberate (a biohazard is a safety fact
// regardless of the capture surface) and is why `biohazard_present` lives in the
// SAFETY set below, never the infra set.

/** Safety-hazard presence types — the output range of `mapSafetyHazard`. */
export const SAFETY_PRESENCE_TYPES = [
  "encampment_present",
  "fire_present",
  "dangerous_activity_present",
  "drug_use_present",
  "violence_present",
  "biohazard_present",
  "access_blocked",
  "other_safety_concern_present",
] as const;

/** Infrastructure-issue presence types — the output range of `mapInfraIssue`
 *  (minus `contaminated_waste`, which maps to the SAFETY `biohazard_present`). */
export const INFRA_PRESENCE_TYPES = [
  "glass_damage_present",
  "graffiti_present",
  "receptacle_damage_present",
  "shelter_panel_damage_present",
  "lighting_failure_present",
  "access_obstructed_by_landscape",
  "structural_damage_present",
  "other_infrastructure_issue_present",
] as const;
