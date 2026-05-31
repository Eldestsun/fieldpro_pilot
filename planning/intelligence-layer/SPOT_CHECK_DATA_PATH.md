# Spot Check Data Path — Findings Memo

> **Type**: Investigation only. No code, schema, or migration changes.
> **Date**: 2026-05-24
> **Scope**: Trace every write produced by a Specialist completing a spot check,
> and assess whether the "verified clean" signal is canonical.
> **Source of truth used**: live code in `backend/src/domains/{observation,visit,routeRunStop}/`,
> live schema queried via `psql` (local DB is currently empty — 0 rows in every
> canonical and adapter table — so the answer is derived from code + DDL, not
> sample rows).

---

## TL;DR

**The hypothesis the founder asked me to test — "the spot check is recorded only
in the transit adapter, not in core.observations" — is FALSE.**

`emitSpotCheckObservation()` in `backend/src/domains/observation/observationService.ts:397-420`
writes a canonical row to `core.observations` on every spot check, with
`observation_type = 'spot_check'` and `payload = '{}'::jsonb`. The write is gated
on `spotCheck === true` in `cleanLogService.completeStop()`
(`backend/src/domains/routeRunStop/cleanLogService.ts:84-93`) and runs inside the
same transaction that creates the visit, the clean_log, and the evidence row.

So the canonical signal exists. The remaining gaps are governance and wiring,
not architectural absence:

1. `spot_check` is **not registered** in `core.observation_type_registry` (the
   table that drives arrival-state lookups). It is a free-form text value with
   no CHECK constraint, no registry entry, no sort order.
2. `core.evidence.observation_id` is hardcoded `NULL` on every photo insert
   (`stopPhotosService.ts:60`), so the spot-check photo is attached to the
   visit but **not linked** to the specific `spot_check` observation row.
3. The photo's `kind` defaults to `'completion'` for both a thorough clean and
   a spot check — there is no `'verification'` distinction at the evidence
   layer.
4. The companion `clean_logs` row written for a spot check has **all action
   booleans `FALSE`** with no `is_spot_check` flag. At the adapter layer alone,
   a spot-check row is indistinguishable from "completed but did nothing." The
   canonical truth lives only in `core.observations.observation_type =
   'spot_check'`.
5. `stop_effort_history.complexity_score` is **literally `NULL`** in the INSERT
   (`cleanLogService.ts:186`). ISSUE-008's root cause is a *separate*
   payload-heterogeneity problem (different observation types use different
   payload keys: `state`, `value`, `level`, `{}`), only partially related to
   the spot-check signal. Adding spot_check did not, and would not, fix
   ISSUE-008 by itself.

---

## Q1 — Write Path

**Endpoint**: `POST /api/route-run-stops/:route_run_stop_id/complete`
(`backend/src/modules/work/routeRunStopRoutes.ts:417-567`)

The route handler enforces `anyCleaningTask || isSpotCheck` and a photo
requirement (line 456-472), then opens a single transaction inside
`pool.connect()` with `app.current_org_id` set from
`resolveNumericOrgId(req)` (line 487-492). Inside that transaction:

| # | Function | Table written | Spot-check-specific? | Source |
|---|----------|---------------|----------------------|--------|
| 1 | `createHazardForRouteRunStop` (only if safety object present) | `hazards` + `route_run_stops.hazard_id` | no | routeRunStopRoutes.ts:495-511 |
| 2 | `ensureVisitForRouteRunStop` (idempotent — visit was likely created at stop-start) | `core.visits` (INSERT or no-op) | no | cleanLogService.ts:76-80 |
| 3 | `getVisitContext` (read-only — resolves orgId / locationId / assetId for the visit) | — | no | cleanLogService.ts:82 |
| 4 | **`emitSpotCheckObservation`** | **`core.observations` (1 row, `observation_type='spot_check'`, `payload='{}'`)** | **YES — gated on `spotCheck === true`** | **cleanLogService.ts:84-93 → observationService.ts:397-420** |
| 5 | `INSERT INTO clean_logs` | `clean_logs` (1 row, **all action booleans = FALSE** for a spot check) | no — same write path, just with FALSE values | cleanLogService.ts:97-109 |
| 6 | `createInfrastructureIssuesForRouteRunStop` (only if infraIssues present) | `infrastructure_issues` | no | cleanLogService.ts:112-120 |
| 7 | `INSERT INTO trash_volume_logs` (only if trashVolume passed — won't fire on spot check; the FE clears trashVolume when spot check is toggled on) | `trash_volume_logs` | no | cleanLogService.ts:122-132 |
| 8 | `UPDATE route_run_stops SET status='done', completed_at=NOW()` | `route_run_stops` | no — same `'done'` status | cleanLogService.ts:134-137 |
| 9 | `closeVisitForRouteRunStop` (sets `ended_at`, `outcome='completed'`, `reason_code=NULL`) | `core.visits` | no — same `'completed'` outcome | cleanLogService.ts:139-142 |
| 10 | `emitObservationsForStop(phase='submit', uiPayload)` — `submitObservations()` returns **`[]`** for a pure spot check because every cleaning boolean is `false`, `safetyConcern` is false, `infrastructurePresent` is false. No observations are emitted. | (none) | YES — effectively a no-op for spot check | cleanLogService.ts:159-168 → observationService.ts:222-296 |
| 11 | `INSERT INTO stop_effort_history` (subquery against `core.observations` for hazard/infra/trash flags; `complexity_score` is the literal `NULL`) | `stop_effort_history` | no — same write, all flags FALSE, `complexity_score=NULL`, `service_minutes` derived from `v.ended_at - v.started_at` | cleanLogService.ts:170-204 |
| 12 | `checkAndCompleteRouteRun` (may flip the parent `route_run.status` to `done`) | `route_runs` | no | cleanLogService.ts:206 |

Separately, **before** the complete-stop call, the photo upload flow has
already written the photo via `createStopPhotos()`
(`backend/src/domains/routeRunStop/stopPhotosService.ts:15-73`), which does
*both*:
- `INSERT INTO stop_photos (… visit_id, asset_id, s3_key, kind, …)` — adapter
- `INSERT INTO core.evidence (org_id, visit_id, observation_id=NULL, kind, storage_key, captured_by_oid)` — canonical

So the spot check produces, in canonical-layer terms:
- exactly **one** `core.visits` row (`outcome='completed'`, `ended_at` set)
- exactly **one** `core.observations` row (`observation_type='spot_check'`, `payload='{}'`, `severity=NULL`)
- one or more `core.evidence` rows (`kind='completion'`, `observation_id=NULL`,
  linked to the visit by `visit_id`)

And in adapter-layer terms: one `clean_logs` row with all booleans FALSE, one
or more `stop_photos` rows, one `stop_effort_history` row with all flags FALSE
and `complexity_score=NULL`, and `route_run_stops.status='done'`.

---

## Q2 — Canonical Distinguishability

Can you tell these three apart from `core.visits + core.observations` ALONE
(no adapter join)?

| Case | `core.visits.outcome` | `core.visits.ended_at` | `core.observations` rows for this `visit_id` | Distinguishable from canonical alone? |
|------|------------------------|-------------------------|----------------------------------------------|----------------------------------------|
| (a) Remediated (thorough clean) | `'completed'` | set | Paired (dirty, clean) rows for each cleaning action chosen: `ground_condition`, `trash_can_condition`, `shelter_condition`, `pad_condition`, `washed_can`, plus `trash_volume` and any safety/infra observations | **Yes** — has at least one `observation_type` with `payload->>'state' = 'clean'` (or `washed_can` with `payload->>'value' = 'true'`) |
| (b) Spot-checked and verified clean | `'completed'` | set | **Exactly one** row with `observation_type='spot_check'`, `payload='{}'` (plus optional infra/safety if the worker added them, though the FE flow disables cleaning tasks when spot check is toggled on) | **Yes** — presence of an `observation_type='spot_check'` row is the canonical marker |
| (c) Never visited / skipped | (c1) Skipped: `outcome='skipped'`, `reason_code` set, `ended_at` set. Has `safety_concern_present` + hazard observations + `stop_not_serviced_due_to_safety` (`observationService.ts:239-244`). (c2) Never started: **no `core.visits` row at all** — the visit is created lazily at stop-start (`ensureVisitForRouteRunStop`), so a pending `route_run_stops` row has no canonical footprint. | varies | varies | **Skipped: yes** — `outcome='skipped'` is canonical. **Never-started: partially** — you can infer absence by joining to `core.assignments` (which is empty today — Tier 5 gap), or you must reach into `route_run_stops` (adapter). Today, canonical alone CANNOT tell "this stop existed in a plan but no one visited it" from "this stop wasn't planned." |

**The founder's specific worry — "spot check looks identical to a thorough
clean that emitted no observation" — does not exist in practice.** The complete
endpoint requires `anyCleaningTask || isSpotCheck` (routeRunStopRoutes.ts:470),
and `submitObservations()` always emits paired observations for any cleaning
task that was checked. So a `core.visits` row with `outcome='completed'` and
zero non-`spot_check` observations is *always* a spot check.

**The collision that DOES exist is at the adapter layer**, not canonical: in
`clean_logs`, a spot-check row and a "completed without any cleaning action"
row are byte-identical (all booleans FALSE, no `is_spot_check` column). Any
intelligence query that reads `clean_logs` to count "spot checks" would
mis-count. The canonical query against `core.observations.observation_type =
'spot_check'` is correct.

**The gap that remains is (c2)**: a planned-but-never-visited stop has no
canonical footprint at all until Tier 5 writes `core.assignments` rows
(currently 0/17 visits have `assignment_id` populated — ADAPTER_BOUNDARY §1).
That's a Tier 5 problem, not a spot-check problem.

---

## Q3 — ISSUE-008 Linkage

**Short answer: related, but not the same root cause. Adding a canonical
"verified clean" type would not, by itself, fix ISSUE-008.**

`stop_effort_history.complexity_score` is `NULL` because the INSERT subquery in
`cleanLogService.ts:186` is the literal token `NULL,`. There is no attempt to
compute it. ISSUE-008's stated intent was "a count of non-clean observations,"
and the issue notes the obstacle: "payload key varies by observation type with
no consistent 'value'/'clean' field across types."

Confirmed from `observationService.submitObservations()` (lines 222-296):

| Observation type | Payload shape | Has a "clean" predicate? |
|------------------|---------------|--------------------------|
| `ground_condition`, `shelter_condition`, `pad_condition` | `{ state: 'dirty' | 'clean' }` | `payload->>'state' = 'clean'` |
| `trash_can_condition` | `{ state: 'has_trash' | 'empty' }` | `payload->>'state' = 'empty'` (different vocabulary) |
| `washed_can` | `{ value: boolean }` | `payload->>'value' = 'true'` (different key entirely) |
| `trash_volume` | `{ level: 0|1|2|3|4 }` | n/a — measurement, not state |
| `safety_concern_present`, `*_present`, infra `*_present` | `{}` | n/a — presence-only |
| `spot_check` | `{}` | n/a — presence-only (implicitly "clean") |

So adding `spot_check` did not introduce a uniform "clean" predicate. ISSUE-008
is fundamentally that the *cleaning* condition types have three different
payload shapes. A canonical fix for ISSUE-008 would need *either*:
- a registry-enforced canonical payload schema with a shared `{ state, value }`
  contract that every cleaning type adheres to, plus a migration to rewrite
  existing payloads, or
- a derived view (`core.v_observation_normalized` or similar) that flattens
  per-type payloads into a uniform `(observation_type, was_clean bool)` shape
  the intelligence layer can `COUNT(*) FILTER (WHERE NOT was_clean)` against.

The spot-check observation is, in a sense, the cleanest example of "presence-as-signal" — its existence means "verified clean, nothing to remediate." But it
does not retroactively give the heterogeneous cleaning types a uniform clean
field. The two problems share a family resemblance (both are about reading
silence and verification from `core.observations`) but the fixes are distinct.

---

## Q4 — Evidence Linkage

**Photos write to `core.evidence` (canonical) with `visit_id` populated.** Both
the photo upload flow (`createStopPhotos`) and the spot-check write flow run
inside transactions that have a valid `visit_id`, so:

- `core.evidence.visit_id` — **always populated** ✅ (FK to `core.visits`)
- `core.evidence.observation_id` — **always NULL** ❌ (hardcoded `NULL` literal
  in `stopPhotosService.ts:60`)
- `core.evidence.kind` — defaults to `'completion'` for both thorough cleans
  and spot checks (no `'verification'` or `'spot_check'` variant)
- `core.evidence.captured_by_oid` — populated (real Entra OID, R1)

So "verified clean" *does* have photographic backing at the canonical layer
(via `visit_id`), but the backing is **scoped to the visit, not to the specific
`spot_check` observation**. To answer "show me the photo that proves this
spot_check observation," you have to join `core.observations o` to
`core.evidence e ON e.visit_id = o.visit_id AND e.observation_id IS NULL` and
infer — there is no FK shortcut. This matches the ADAPTER_BOUNDARY §1 note:
"`observation_id` — Never written — no code links evidence to a specific
observation."

That's a small wiring gap, not an architectural one. The columns and FK exist;
nothing populates them.

---

## Also-Report Items

### Skipped-vs-spot-check collision

**Not a collision.** A spot check writes `outcome='completed'` with
`reason_code=NULL`. A skip writes `outcome='skipped'` with `reason_code` set
(usually the first hazard type — `routeRunStopRoutes.ts:254`). They are
distinguishable in `core.visits` alone.

The collision that the founder was worried about — "spot check looks like a
thorough clean that emitted no observation" — also does not exist (see Q2).
The complete-stop endpoint requires either a cleaning task or a spot check,
and a thorough clean always emits paired observations, so any completed visit
with zero non-`spot_check` observations is a spot check.

### `emitObservationsForStop()` partial activation

ADAPTER_BOUNDARY §7 notes that `emitObservationsForStop()` falls back to
pessimistic dirty defaults when `stopId` is not threaded through, because
`arrivalObservations()` cannot reach `transit_stop_assets` without it
(Path B). **Spot checks are not affected by this gap.** Spot checks call
`emitObservationsForStop()` with `phase='submit'`, not `phase='arrival'`, and
`submitObservations()` ignores `stopId` entirely. The arrival-phase fallback
is irrelevant to the spot-check flow.

### `spot_check` is not in the registry

`core.observation_type_registry` lists 25 active types for `org_id=1,
asset_type_id=1` (the seeded transit stop type). `spot_check` is not among
them. There is no CHECK constraint on `core.observations.observation_type`, so
the insert succeeds anyway. But `arrivalObservations()` will never seed
"verified clean" as a prior state, and any future registry-driven UI surface
will not know `spot_check` exists. Worth flagging.

### Local DB has zero data

`organizations` has 1 row (KCM, id=1, tenant_uuid populated). Every operational
table — `core.visits`, `core.observations`, `core.evidence`, `clean_logs`,
`stop_photos`, `route_run_stops` — is empty. No spot-check rows could be
inspected. This memo is grounded in code + DDL, not row samples. If the
Specialist demo flow has been exercised against any other environment, the
spot-check assertions above can be confirmed there with a query like:

```sql
SET app.current_org_id = '1';
SELECT v.id, v.outcome, v.reason_code,
       o.observation_type, o.payload,
       (SELECT count(*) FROM core.evidence e
          WHERE e.visit_id = v.id) AS evidence_rows
FROM core.visits v
LEFT JOIN core.observations o ON o.visit_id = v.id
WHERE o.observation_type = 'spot_check'
ORDER BY v.started_at DESC
LIMIT 20;
```

---

## Recommendation

**The canonical "verified clean" type already exists** — it's
`observation_type='spot_check'` written by `emitSpotCheckObservation`. The
spot-check signal is at the canonical layer today and intelligence queries can
read it without contaminating themselves with adapter joins. The architectural
question the founder posed is settled in the right direction.

What's NOT settled, in priority order:

1. **(low, governance)** Register `spot_check` in
   `core.observation_type_registry` so the type is documented, the registry is
   complete, and any future driver of the type-registry knows about it. Sort
   order in the 70-90 band (between `trash_volume` and the safety block) would
   slot it cleanly. No code change beyond a seed migration.

2. **(low, evidence linkage)** Wire `core.evidence.observation_id` so the
   spot-check photo links to the spot-check observation, not just the visit.
   This is a one-line refactor in `createStopPhotos` (pass an
   `observationId` parameter) plus a small change in the spot-check write path
   to capture the returned observation id and forward it to the photo write.
   Useful for "show me proof" surfaces; not blocking anything today.

3. **(medium, semantic)** Consider an `evidence.kind = 'verification'` variant
   for spot-check photos. Cosmetic in the data, but if any intelligence query
   ever wants to count "verified-clean photos vs remediation photos" without
   joining back to observations, this is the cheap path.

4. **(separate problem) ISSUE-008 is NOT solved by spot check.** Adding a
   canonical "verified clean" type does not normalize the heterogeneous
   payload shapes of the cleaning observation types. ISSUE-008 needs either a
   registry-enforced payload schema with a shared "was_clean" field, or a
   normalized derived view. Either is a larger piece of work and should be
   planned independently — likely in the same intelligence-layer pass that
   re-derives `complexity_score`. The right move is to keep the two
   investigations separate and design ISSUE-008's fix against the normalized
   payload contract, not against spot_check.

**Do not pursue option (a) from the dispatch prompt** (add a canonical
"verified_clean"/"condition" observation type) — it's already done as
`spot_check`, and conflating it with the ISSUE-008 payload-shape fix would mix
two different concerns. The right next move on the intelligence-layer side is
to design the normalized condition payload contract that ISSUE-008 needs,
treating `spot_check` as one of the inputs it already has rather than the fix.
