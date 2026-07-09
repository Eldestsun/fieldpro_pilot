import { test, assert, assertEqual } from "../setup";
import {
  SAFETY_HAZARD_TYPE_MAP,
  INFRA_ISSUE_TYPE_MAP,
} from "../../src/domains/observation/observationService";
import {
  SAFETY_PRESENCE_TYPES,
  INFRA_PRESENCE_TYPES,
} from "../../src/domains/observation/presenceTaxonomy";

// ============================================================================
// SEAM-C drift guard — presenceTaxonomy is DERIVED from the write-path maps, so the
// CC /exceptions classification cannot drift from what the write path emits. This
// test proves the single-source link AND pins the current membership: if a mapper
// gains/loses/renames a presence type, the derived set changes and this test flips
// red, forcing a conscious review (and a matching CC-count decision).
// ============================================================================

const sorted = (xs: readonly string[]) => [...xs].sort();

test("presenceTaxonomy: SAFETY set is exactly the distinct mapSafetyHazard outputs", () => {
  const expected = sorted(Array.from(new Set(Object.values(SAFETY_HAZARD_TYPE_MAP))));
  assertEqual(
    JSON.stringify(sorted(SAFETY_PRESENCE_TYPES)),
    JSON.stringify(expected),
    "SAFETY_PRESENCE_TYPES must equal the distinct safety-map values (single source)",
  );
});

test("presenceTaxonomy: INFRA set is the distinct mapInfraIssue outputs MINUS any safety type", () => {
  const safetySet = new Set(Object.values(SAFETY_HAZARD_TYPE_MAP));
  const expected = sorted(
    Array.from(new Set(Object.values(INFRA_ISSUE_TYPE_MAP))).filter((t) => !safetySet.has(t)),
  );
  assertEqual(
    JSON.stringify(sorted(INFRA_PRESENCE_TYPES)),
    JSON.stringify(expected),
    "INFRA_PRESENCE_TYPES must equal infra-map values minus safety types (single source)",
  );
});

test("presenceTaxonomy: the two sets are disjoint and cover the cross-map correctly", () => {
  const inBoth = SAFETY_PRESENCE_TYPES.filter((t) => INFRA_PRESENCE_TYPES.includes(t));
  assertEqual(JSON.stringify(inBoth), "[]", "SAFETY and INFRA sets must be disjoint");
  // Documented cross-map: contaminated-waste → biohazard_present is SAFETY, never infra.
  assert(SAFETY_PRESENCE_TYPES.includes("biohazard_present"), "biohazard_present is a SAFETY type");
  assert(!INFRA_PRESENCE_TYPES.includes("biohazard_present"), "biohazard_present must NOT be in the infra set (contaminated-waste counts as hazard)");
});

test("presenceTaxonomy: pinned membership (a mapper change must break this on purpose)", () => {
  assertEqual(
    JSON.stringify(sorted(SAFETY_PRESENCE_TYPES)),
    JSON.stringify([
      "access_blocked",
      "biohazard_present",
      "dangerous_activity_present",
      "drug_use_present",
      "encampment_present",
      "fire_present",
      "other_safety_concern_present",
      "violence_present",
    ]),
    "pinned SAFETY membership",
  );
  assertEqual(
    JSON.stringify(sorted(INFRA_PRESENCE_TYPES)),
    JSON.stringify([
      "access_obstructed_by_landscape",
      "glass_damage_present",
      "graffiti_present",
      "lighting_failure_present",
      "other_infrastructure_issue_present",
      "receptacle_damage_present",
      "shelter_panel_damage_present",
      "structural_damage_present",
    ]),
    "pinned INFRA membership",
  );
});
