# Empirical Verification — Transit Adapter Layer Labor-Safety Properties

**Date:** 2026-06-06
**Type:** Read-only investigation (no code, schema, or DB changes; no commits)
**Branch at time of investigation:** `feat/issue-018-intelligence-reader-wiring`
**Context:** Paused ISSUE-018 Phase 1 to empirically test the founder's hypothesis that the
transit adapter layer is operationally inert. Method: live DB introspection
(`information_schema`, `pg_get_viewdef`) + migration/write-path code reading.

---

## Verdict: **HYPOTHESIS WRONG**

The transit adapter layer is **not operationally inert**. It is a complete, parallel,
*identified* record of work performed. An analyst with adapter-only access
(`public.*` + `core.v_*_transit`) and **no** canonical access (`core.observations`,
`core.visits`, `core.evidence`, canonical `core.assignments`) can reconstruct
**"Specialist X performed work W at time T on stop S"** — at pseudonym level from a
single table, and at **named-individual level** via a join chain that stays entirely
inside the adapter slice.

---

## The central question (restated)

> If a hypothetical analyst has full read access to the transit adapter layer
> (`public.clean_logs`, `public.transit_stops`, the transit-side assignment data,
> etc.) and the `core.v_*_transit` views, but NO access to the canonical layer — can
> that analyst reconstruct "Specialist X performed work W at time T on stop S"?

**Answer: Yes, at named-individual resolution.** Four independent reconstruction paths
exist, all within the adapter slice (detailed below).

---

## 1. Transit-adapter / operational tables enumerated (`public.*`)

Full `public.*` base-table list (28 tables). Classified by role in the transit slice:

**Work-attribution candidates (primary logs + run state):**
`clean_logs`, `hazards`, `infrastructure_issues`, `level3_logs`, `trash_volume_logs`,
`stop_photos`, `route_runs`, `route_run_stops`

**Derived history (de-identified):**
`stop_effort_history`, `stop_condition_history`, `stop_risk_snapshot`

**Reference / routing / scaffolding:**
`transit_stops`, `transit_stop_assets`, `stop_pool_memberships`, `route_pools`,
`stops_legacy`, `bases`, `asset_types`, `assets`, `asset_external_ids`, `organizations`

**Identity / audit / infra:**
`identity_directory` (OID→name resolver), `audit_log`, `export_delete_tokens`,
`eam_bridge_populate_state`, `eam_bridge_route_log`, `schema_migrations`

> **Note:** there is **no `public.assignments`** table. "Transit-side assignments" are
> the `core.v_assignments_transit` **view** over `route_runs` / `route_run_stops`.

---

## 2–4. Table-by-table column classification

Legend: 🔴 WORK-ATTRIBUTION · 🟡 ROUTING/ASSIGNMENT · ⚪ OPERATIONAL METADATA

### `public.clean_logs` — the smoking gun (full WHO/WHAT/WHEN/WHERE in one row)
| Column | Type | Class | Note |
|---|---|---|---|
| `id` | bigint | ⚪ | PK |
| `route_run_stop_id` | bigint | 🟡/⚪ | link to run-stop |
| `stop_id` | text | 🔴 | **WHERE** |
| `user_id` | bigint | 🔴 | **WHO** — worker who performed the cleaning |
| `cleaned_at` | timestamptz | 🔴 | **WHEN** |
| `duration_minutes` | int | 🔴 | effort / time-on-task |
| `picked_up_litter` | bool | 🔴 | **WHAT** — task performed |
| `emptied_trash` | bool | 🔴 | **WHAT** |
| `washed_shelter` | bool | 🔴 | **WHAT** |
| `washed_pad` | bool | 🔴 | **WHAT** |
| `washed_can` | bool | 🔴 | **WHAT** |
| `level` | smallint | 🔴 | service level |
| `notes` | text | 🔴 | free-text work detail |
| `photo_keys` | array | 🔴 | evidence references |
| `asset_id` | bigint | 🟡/⚪ | |
| `visit_id` | bigint | 🟡/⚪ | link to canonical |
| `org_id` | bigint | ⚪ | tenant |

A single `SELECT` yields: *"worker 42 cleaned stop 31150 at 09:13, emptied trash + washed
shelter, 14 min."*

### `public.hazards`
🔴 `reported_by` (bigint, WHO) · `reported_at` (WHEN) · `stop_id` (WHERE) ·
`hazard_type`, `severity`, `notes`, `details` (jsonb), `photo_key` (WHAT observed).
🟡/⚪ `route_run_stop_id`, `asset_id`, `visit_id`, `org_id`, `id`.

### `public.infrastructure_issues`
🔴 `reported_by` (WHO) · `reported_at` (WHEN) · `stop_id` (WHERE) ·
`issue_type`, `severity`, `component`, `cause`, `needs_facilities`, `details`,
`photo_keys`, `photo_key` (WHAT observed).
🟡/⚪ `route_run_stop_id`, `asset_id`, `visit_id`, `org_id`, `id`.

### `public.level3_logs`
🔴 `user_id` (WHO) · `cleaned_at` (WHEN) · `stop_id` (WHERE) · `level`, `notes` (WHAT).
🟡/⚪ `route_run_stop_id`, `asset_id`, `visit_id`, `org_id`, `id`.

### `public.trash_volume_logs`
🔴 `logged_at` (WHEN) · `volume` (WHAT) · `stop_id` (WHERE). No direct worker column —
worker reachable via `route_run_stop_id` → run.
🟡/⚪ `route_run_stop_id`, `asset_id`, `visit_id`, `created_at`, `updated_at`, `org_id`, `id`.

### `public.stop_photos`
🔴 `created_by_oid` (**text — plaintext Entra OID**, WHO) · `captured_at` (WHEN) ·
`s3_key` (evidence) · stop via `route_run_stop_id`. `kind` (WHAT — completion/safety/etc.).
🟡/⚪ `asset_id`, `visit_id`, `org_id`, `id`.

### `public.route_runs`
🔴/🟡 `assigned_user_oid` (**plaintext OID**, WHO assigned) · `user_id` (bigint) ·
`created_by_oid` (plaintext OID). 🔴 `started_at`, `finished_at` (WHEN), `status`.
🟡 `run_date`, `route_pool_id`, `base_id`, `shift_type` (routing). ⚪ `id`, `org_id`,
`total_distance_m`, `total_duration_s`, `created_at`, `updated_at`.

### `public.route_run_stops`
🔴 `status`, `started_at`, `completed_at` (WHEN), `trash_volume` · `stop_id` (WHERE) ·
worker via parent `route_run`. 🟡 `sequence`, `planned_distance_m`, `planned_duration_s`,
`origin_type`. ⚪ `id`, `route_run_id`, `asset_id`, `hazard_id`, `infra_issue_id`,
`created_at`, `updated_at`, `org_id`.

### `public.transit_stops` — **clean** (reference/routing only) ✅ matches "inert" model
All columns are static stop reference: `stop_id`, district/bay/bearing codes, street names,
equipment flags, `lon`/`lat`, `is_hotspot`, `compactor`, `has_trash`, `pool_id`,
`priority_class`, `asset_id`, `org_id`. The only timestamp, `last_level3_at`, is a
denormalized last-service marker (WHEN a service happened — no WHO). **No per-visit
work-attribution.** This single table matches the founder's "inert scaffolding" model.

### Derived history — **de-identified** (no worker column) ✅ intended shape
- `stop_effort_history`: `stop_id`, `visit_id`, `run_date`, `service_minutes`, `stop_type`,
  `complexity_score`, `had_hazard`, `had_infra_issue`, `trash_volume`, `computed_at`,
  `org_id`. **No `user_id`/OID.**
- `stop_condition_history`: `stop_id`, `visit_id`, `scored_at`, `cleanliness_score`,
  `safety_score`, `infra_score`, `asset_id`, `org_id`. **No `user_id`/OID.**
- `stop_risk_snapshot`: de-identified aggregate (risk scores per stop).

Worker identity in these is reachable only by joining `visit_id` into the canonical
layer (out of adapter-only scope). These prove the de-identified pattern was applied to
the *derived* tables but **not** to the *primary log* tables above.

### `public.identity_directory` — the de-anonymizer (lives in `public.*`)
`oid` (text), `display_name` (text), `email` (text), `last_seen_role`, `last_seen_at`,
`org_id`. Turns any plaintext OID in the adapter into a **named, emailed individual**.

> FK check: `clean_logs.user_id`, `route_runs.user_id`, `hazards.reported_by`,
> `infrastructure_issues.reported_by`, `level3_logs.user_id` have **no declared FK
> constraints** — they are opaque bigints. This does not protect identity: the plaintext
> **OID** columns (`route_runs.assigned_user_oid`, `stop_photos.created_by_oid`) resolve
> directly through `identity_directory`, and the bigint `user_id` is tied to a name via
> the run → OID → directory chain (path 2 below).

---

## 5. Write-path verification — work-completion writes to the adapter

Confirmed `INSERT` targets in backend write code (`grep` of `backend/src/**/*.ts`):

| Adapter table | Written by | Carries identity? |
|---|---|---|
| `clean_logs` | `cleanLogService.completeStop` | **yes — `user_id`, `cleaned_at`, task bools, duration** |
| `hazards` | `hazardService` (skip/safety path) | **yes — `reported_by`, `reported_at`** |
| `infrastructure_issues` | `infrastructureIssueService` | **yes — `reported_by`** |
| `trash_volume_logs` | `cleanLogService.completeStop` | time + volume (worker via run) |
| `stop_photos` | `stopPhotosService.createStopPhotos` | **yes — `created_by_oid` (plaintext OID)** |
| `route_runs` / `route_run_stops` | `routeRunService` | **yes — `assigned_user_oid`, status, `completed_at`** |

The stop-completion transaction writes the **same work-completion data to both** the
adapter (`clean_logs`, etc.) and the canonical layer (`core.observations`/`visits` +
no-grant sidecars). `stopPhotosService.createStopPhotos` is explicit about the dual
write: the transit `stop_photos` INSERT is labeled *"Existing transit write (additive
discipline — do not remove)"* sitting beside the canonical `core.evidence` write.

**Implication:** the 2026-06-01 sidecar extraction de-identified the **canonical** copy
of worker identity; the **adapter** copy retained plaintext worker identity by design
(additive discipline preserved the legacy transit writes). The labor-safety work done so
far protects the canonical layer, not the adapter layer.

---

## 6. View definitions — the adapters expose identity + work together

(`pg_get_viewdef`, current DB.)

**`core.v_clean_logs_transit`** — passthrough of the full work record **including identity**:
```
SELECT cl.id, cl.route_run_stop_id, cl.stop_id,
       cl.user_id,                      -- worker identity, exposed
       cl.cleaned_at, cl.duration_minutes,
       cl.picked_up_litter, cl.emptied_trash,
       cl.washed_shelter, cl.washed_pad, cl.washed_can,   -- tasks performed
       cl.level, cl.notes, cl.photo_keys, cl.asset_id,
       slm.location_id,
       COALESCE(a.org_id, rr.org_id, slm.org_id) AS org_id_resolved
FROM clean_logs cl
  LEFT JOIN assets a ON a.id = cl.asset_id
  LEFT JOIN route_run_stops rrs ON rrs.id = cl.route_run_stop_id
  LEFT JOIN route_runs rr ON rr.id = rrs.route_run_id
  LEFT JOIN core.v_stop_location_map slm ON slm.stop_id = cl.stop_id;
```

**`core.v_hazards_transit`** — exposes `h.reported_by`, `h.reported_at`, `h.hazard_type`,
`h.severity`, `h.notes`, `h.details`, `h.photo_key` (who reported what hazard when).

**`core.v_assignments_transit`** — exposes `rrs.status`, `sequence`, `created_at`,
`location_id`, and `source_route_run_id` (→ `route_runs.assigned_user_oid`).

**View ownership / privilege facts (current DB):**
- DB is **PostgreSQL 14.18** — `security_invoker` views require PG15+ (not available here).
- The `core.v_*_transit` views are owned by **`fieldpro`**, `security_invoker` unset
  (run as owner).
- **`intelligence_reader` already holds `SELECT` on all `core.v_*_transit` views**,
  including `v_clean_logs_transit` (which exposes `user_id`) and `v_hazards_transit`
  (which exposes `reported_by`). So the role ISSUE-018 is provisioning as the "labor-safe"
  intelligence role can currently read worker-attributed work data through these views.
  *(Stated as a fact; remediation is out of scope for this investigation.)*

---

## Reconstruction paths (the proof)

All four stay entirely within the adapter slice (`public.*` + `core.v_*_transit`):

1. **Pseudonymous, one table.**
   `SELECT user_id, stop_id, cleaned_at, picked_up_litter, emptied_trash, washed_shelter,
   washed_pad, washed_can, duration_minutes FROM public.clean_logs`
   → worker-pseudonym + work + time + place.

2. **Named, via the OID deanonymizer.**
   `clean_logs.route_run_stop_id → route_run_stops.route_run_id → route_runs.assigned_user_oid
   → identity_directory.oid → display_name, email`
   → ties the pseudonymous `user_id` to a real name + email. *"Jane Doe (jane@kcm) cleaned
   stop 31150 at T."*

3. **Named, direct (photos).**
   `stop_photos.created_by_oid → identity_directory` (single join, plaintext OID)
   → *"Jane Doe captured the completion photo at T."*

4. **Observations.**
   `hazards.reported_by` / `infrastructure_issues.reported_by` + `reported_at` + `stop_id`
   + type → who reported what condition when.

---

## Where the hypothesis holds vs. fails

- **Holds for:** `transit_stops` (pure reference), and the *derived* history tables
  `stop_effort_history` / `stop_condition_history` / `stop_risk_snapshot` (no worker column).
- **Fails for:** the *primary log* tables — `clean_logs`, `hazards`,
  `infrastructure_issues`, `level3_logs`, `stop_photos`, `route_runs` / `route_run_stops`
  — each actively written with worker identity (`user_id` / `reported_by` / plaintext OID)
  plus work + timestamp + stop, with the `identity_directory` OID→name resolver in the
  same adapter slice.

---

## Conclusion

**HYPOTHESIS WRONG.** The canonical-layer credential isolation (the ISSUE-018 / sidecar
line of work) is a real guarantee *for the canonical layer*, but it is **not** the
system-wide labor-safety guarantee. The transit adapter layer is a full, identified,
independently-queryable record of work performed — reconstructable to the named individual
without any canonical access.

Per the dispatch constraints, this document reports findings only. The ISSUE-018 reframe
and any follow-on issue filings are a separate step.

---

### Method / reproducibility
- DB introspected live via the `postgres` MCP (read-only): `information_schema.columns`,
  `information_schema.table_constraints` + `key_column_usage` + `constraint_column_usage`,
  `pg_roles`, `pg_class`/`pg_namespace`, `pg_get_viewdef`.
- Write paths confirmed by `grep` of `backend/src/**/*.ts` for `INSERT INTO <table>` and
  by reading `cleanLogService.ts`, `stopPhotosService.ts`, `riskMapService.ts`,
  `adminRoutes.ts`.
- No rows were modified; no DDL was issued; nothing was committed.
