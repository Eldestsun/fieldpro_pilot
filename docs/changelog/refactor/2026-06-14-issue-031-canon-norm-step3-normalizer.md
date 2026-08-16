# 2026-06-14 — CANON-NORM Step 3: write-time normalizer + registry rules

ISSUE-031 / CANON-NORM — Finish the Canonical State Layer normalized observation
shape. Step 1 added the 5 normalized columns to `core.observations`; Step 2 extended
`core.observation_type_registry` to the §4.1 contract shape and populated `obs_kind`.
Step 3 (this change) populates the ok-rules and wires the generic §4.2 normalizer
into the observation INSERT path so newly written rows carry normalized columns.

## What changed

### Sub-task A — registry rules (`ok_rule` / `severity_map`)
- New migration `backend/migrations/20260614_canon_norm_step3_registry_rules.sql`
  derives the rules from the live seeder columns (`value_type` / `valid_values`):
  - **measurement** — `trash_volume` is the only graded type:
    `ok_rule = {"field":"level","lte":1}` (design §4.1/§7 `ok_max=1`, ok when
    `level <= 1`), `severity_map = {"field":"level"}` (norm_severity = level, 0..4).
  - **action / presence / state-condition** — `ok_rule` and `severity_map` stay
    NULL by design: actions carry no grade, presence existence is the signal, and
    state-typed condition rows (incl. `spot_check`, payload `{}`) are not graded in
    this step (their §3.5 `ok` anchor + refined payload shape is a tracked follow-up,
    §9 Q4). Leaving NULL keeps `norm_status` NULL rather than manufacturing a grade
    (additive discipline, §2 invariant #5).
- Applied live as the postgres superuser (registry is FORCE RLS). Rollback added
  under `migrations/rollback/`.

### Sub-task B — the §4.2 normalizer, wired into the write path
- New module `backend/src/domains/observation/observationNormalizer.ts`:
  - `loadRegistryRules(client, orgId, keys[])` — ONE batched registry query
    (`org_id` + `observation_key = ANY($keys)`), returns a `Map`. No per-observation
    N+1.
  - `normalizeObservation(rule, observationType, payload)` — pure §4.2 normalizer
    returning `{obs_kind, norm_status, norm_severity, intervention, type_id}`.
    Unknown `observation_type` → all-NULL fields + `console.warn`, never throws.
  - `evaluateOkRule` (supports `{field, lte|gte|eq}`) and `evaluateSeverityMap`
    (`{field}` → clamped smallint) — minimal, only the Sub-task A rule shapes.
  - `norm_status` graded only for `condition`/`measurement` WITH an `ok_rule`;
    `intervention` = the type key for `action` rows (design §3.3/§7 store the key
    verbatim; humanization is the §5.1 read projection's job).
- `observationService.ts` — both INSERT paths now normalize before writing and
  insert the 5 new columns:
  - `insertObservations` (cleaning/safety/infra batch) — batched lookup, normalize
    per row.
  - `emitSpotCheckObservation` — normalizes `spot_check` (→ `obs_kind=condition`,
    `type_id=61`, `norm_status` NULL).
- No identity columns touched (labor safety unchanged); never invoked at
  visit-start/arrival (no manufactured arrival state, §2 invariant #5).

## Why
- The normalized columns existed (Step 1) but nothing wrote them; the registry
  carried `obs_kind` but no rules (Step 2). Step 3 closes the write-time loop so
  intelligence can read `obs_kind`/`norm_status`/`norm_severity` instead of
  string-matching `observation_type`.
- Additive discipline: a registry miss must never block an observation write.

## Verification
- `tsc --noEmit` clean.
- Throwaway end-to-end script (run + removed): real `loadRegistryRules` +
  `normalizeObservation` against the live registry, then a 12-column INSERT +
  ROLLBACK as the app `fieldpro` role. Results:
  - `trash_volume {level:2}` → measurement / not_ok / sev 2 / type_id 6
  - `trash_volume {level:0}` → measurement / ok / sev 0
  - `picked_up_litter {}` → action / status NULL / intervention `picked_up_litter` / type_id 55
  - `biohazard_present {}` → presence / all NULL except kind + type_id 14
  - `spot_check {}` → condition / status NULL / type_id 61
  - `totally_unknown_type {}` → warning + all NULL, no throw
- Existing 18 `core.observations` rows remain NULL on the normalized columns
  (backfill is Step 6 — expected and correct).

## Honest residual
- **Backfill of the 18 historical rows** is Step 6 (§9 item 4) — not in scope here.
- **`spot_check` → `norm_status='ok'`** (design §3.5) is deferred: its payload is
  `{}` with no gradable field and the refined `{scope, result}` shape is §9 Q4.
- **Read seam / intelligence repoint** (`v_observation_normalized`, riskMapService)
  is a later step — consumers still read raw `observation_type` today.

## Files touched
- `backend/migrations/20260614_canon_norm_step3_registry_rules.sql` (new)
- `backend/migrations/rollback/20260614_canon_norm_step3_registry_rules_rollback.sql` (new)
- `backend/src/domains/observation/observationNormalizer.ts` (new)
- `backend/src/domains/observation/observationService.ts` (wired normalizer into both INSERT paths)
- `docs/changelog/2026-06-14-issue-031-canon-norm-step3-normalizer.md` (this file)
