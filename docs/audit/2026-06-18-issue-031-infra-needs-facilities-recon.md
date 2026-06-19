# ISSUE-031 — Infra `needs_facilities` Recon (pre-Stage-2-clip)

**Date:** 2026-06-18
**Type:** Recon / read-only audit (no schema, code, or clip changes)
**Scope:** Two go/no-go questions before the infra (`public.infrastructure_issues`)
Stage-2 dual-write clip proceeds, given the founder decision that
`needs_facilities` will be **DROPPED** (not homed to canonical).
**DB read as:** `postgres` superuser, `rolbypassrls = true`, `app.current_org_id`
unset — so every count below is the true cross-org total, **not** an RLS-filtered
view (verified: `current_user=postgres`, `bypassrls=true`, `org_ctx=null`).

**Founder rationale (restated):** every infra observation that exists is by
definition a crew-escalation — infra is only captured when a crew is needed;
route-spec-handleable issues are never captured at all. So `needs_facilities` is
always-true-when-row-exists = zero information. Work-group routing is derived from
infra-type via the org config table, not stored per-row.

---

## Q1 — Type distinguishability

> Can a reader identify "all infra observations" from `core.observations` alone,
> without touching `public.infrastructure_issues` or its `needs_facilities` column?

### obs_kind is NOT sufficient; observation_type IS

`core.observation_type_registry` classifies every type into one of four
`obs_kind`s. Infra types are all `obs_kind = 'presence'` — **but so are the safety
types.** `presence` is a shared namespace (safety + infra). Therefore `obs_kind`
alone cannot separate infra from safety; the discriminator is the
**`observation_type` value**.

The infra `presence` types form a **distinct, non-overlapping set** of
`observation_type` values. This exact 8-value set is codified identically in the
canonical readers `cleanLogService.ts` (`backend/src/domains/routeRunStop/cleanLogService.ts:218-227`)
and `riskMapService.ts` (`backend/src/intelligence/riskMapService.ts:204-210`), and
is the target of the dual-write mapper `mapInfraIssue()`
(`backend/src/domains/observation/observationService.ts:280-307`):

| # | Infra `observation_type` (canonical) | registry `obs_kind` | `is_active` |
|---|--------------------------------------|---------------------|-------------|
| 1 | `glass_damage_present`               | presence            | true |
| 2 | `graffiti_present`                   | presence            | true |
| 3 | `receptacle_damage_present`          | presence            | true |
| 4 | `shelter_panel_damage_present`       | presence            | true |
| 5 | `lighting_failure_present`           | presence            | true |
| 6 | `access_obstructed_by_landscape`     | presence            | true |
| 7 | `structural_damage_present`          | presence            | true |
| 8 | `other_infrastructure_issue_present` | presence            | true |

These are the **8 infra `*_present` types** referenced in prior audit docs —
confirmed to exist as distinct, active registry values. (Note: `access_obstructed_by_landscape`
carries no literal `_present` suffix but is one of the 8 infra presence types; the
other 7 do.)

The safety `presence` types are a disjoint set —
`encampment_present, fire_present, dangerous_activity_present, drug_use_present,
violence_present, biohazard_present, access_blocked, other_safety_concern_present`
(`cleanLogService.ts:201-210`). No value appears in both sets.

### Retired umbrella

`infrastructure_issue_present` (the generic umbrella) still exists in the registry
with `is_active = true`, **but is never emitted**: `mapInfraIssue()` always resolves
to one of the 8 specific types, and both readers were repointed off the umbrella
("Generic 'infrastructure_issue_present' was retired (canonical state layer §2.1,
2026-05-25)"). It is dead-but-present in the registry; it does not weaken
distinguishability. (Minor cleanup candidate — registry `is_active` flag lags the
code retirement — but out of scope here.)

### One deliberate cross-surface remap (not a loss)

The infra-modal **"Contaminated waste (biohazard)"** checkbox (`issue_type =
contaminated_waste`) is intentionally mapped to **`biohazard_present`** — a *safety*
presence type, not an infra type (`observationService.ts:290-297`). This is by
design: a biohazard is a safety fact regardless of which capture surface emitted it.
Consequence for a reader: a `contaminated_waste` capture is **not** retrievable via
the 8 infra types — it lives (correctly) under safety. This is correct canonical
modeling, not information loss, and it does not depend on `needs_facilities`.

### Dependence on `public.infrastructure_issues` / `needs_facilities`

**None.** Identifying an observation as infra depends solely on its
`observation_type` value in `core.observations`. Neither reader, nor the registry,
nor the type taxonomy references `public.infrastructure_issues` or its
`needs_facilities` column to make the infra/not-infra determination.

### Live cross-check

The 2 real `infrastructure_issues` rows map cleanly to distinct infra canonical
types, and both are **already mirrored** in `core.observations` (visit_id 95):

| infra_issues.issue_type | → canonical observation_type | present in core? |
|-------------------------|------------------------------|------------------|
| `graffiti_excessive`    | `graffiti_present`           | yes (1 row)      |
| `panel_damaged`         | `shelter_panel_damage_present` | yes (1 row)    |

### Q1 VERDICT — **PASS**

Infra observations are **type-distinguishable from canonical alone.** The 8 infra
`presence` `observation_type` values form a distinct set, disjoint from safety, and
codified identically across both readers and the dual-write mapper. Nothing about
the infra determination depends on `public.infrastructure_issues` or
`needs_facilities`. (Caveat, not a failure: `obs_kind` alone is insufficient —
`observation_type` is the discriminator — and `contaminated_waste` is deliberately
homed to safety `biohazard_present`.)

---

## Q2 — `needs_facilities` value distribution

> Live read of `public.infrastructure_issues.needs_facilities` across all rows.

### Distribution (all orgs, RLS-bypassed)

| `needs_facilities` | row count |
|--------------------|-----------|
| `true`             | 2         |
| `false`            | 0         |
| `NULL`             | 0         |
| **total**          | **2**     |

### `false` rows

**None exist.** The query for any row where `needs_facilities IS DISTINCT FROM true`
returned the empty set. The pre-decision "track small graffiti, no crew escalation"
test residue the brief anticipated is **not present in the database** — there is
nothing to assess as test data, because no `false` (or `NULL`) row was ever left
behind (or it has already been cleaned). The column is **uniformly `true`**.

### Structural confirmation of zero-information

- **Column definition:** `boolean NOT NULL DEFAULT true`.
- **Write path:** `infrastructureIssueService.ts:80` hardcodes the literal `true`
  on every insert — there is no code path that ever writes `false`.

So `needs_facilities` is structurally and empirically always-true-when-row-exists.
It carries **zero bits** of information. This matches the founder rationale exactly.

### Q2 VERDICT — **PASS**

`needs_facilities` is uniformly `true` (2/2 rows), `NOT NULL DEFAULT true`, and
hardcoded `true` at the only write site. Zero `false` rows, zero `NULL` rows, zero
information. Dropping it loses nothing.

---

## Overall verdict — **LOSSLESS-TO-CLIP with `needs_facilities` DROPPED**

Both questions pass:

- **Q1 PASS** — infra observations are identifiable from `core.observations` alone
  via the 8 distinct infra `presence` `observation_type` values; no dependence on
  `public.infrastructure_issues` or `needs_facilities`.
- **Q2 PASS** — `needs_facilities` is uniformly `true` (NOT NULL DEFAULT true,
  hardcoded at the write site), zero `false`/`NULL` rows, zero information.

The infra Stage-2 dual-write clip may proceed with `needs_facilities` **dropped**
(not homed to canonical). No information is lost by the drop, and infra-type
identity survives entirely in `core.observations`.

### Out-of-scope notes for follow-up (not blockers)

- Registry `is_active = true` on the retired `infrastructure_issue_present` umbrella
  lags the code retirement — candidate for a flag flip.
- This recon covered only `needs_facilities` distinguishability + value, per brief.
  A full column-by-column losslessness pass of `public.infrastructure_issues` (other
  columns: `component`, `cause`, `details`, `photo_key`, etc.) is the separate
  Stage-2 clip-design task, not this recon.
