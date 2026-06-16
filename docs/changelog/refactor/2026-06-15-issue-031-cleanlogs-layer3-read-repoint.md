# 2026-06-15 — ISSUE-031 P1 clean-logs Layer 3: repoint clean-logs reads to canonical

## What changed
Repointed the two clean-logs list endpoints off `public.clean_logs` onto the
identity-free canonical layer. This is the read-side gate that lets the
`clean_logs` write be clipped next (the write is **not** touched here).

- **`GET /api/ops/clean-logs`** and **`GET /admin/clean-logs`** — both list
  handlers no longer read `public.clean_logs`. They now drive off `core.visits`
  (a completed, ended visit = a clean event) and resolve the row exactly as the
  CC-REPOINT card established:
  - the **5 action booleans** ← `core.observations` action rows, pivoted per visit
    with `COALESCE(bool_or(o.intervention = '<key>'), false)` over the FIXED
    five-key set (absence ⇒ explicit `false`, never null/missing);
  - **cleaned_at** ← `core.visits.ended_at`;
  - **duration_minutes** ← visit wall-clock `GREATEST(1, CEIL((ended_at - started_at)/60))`;
  - **stop_id** ← `core.location_external_ids` (`source_system='metro_stop'`),
    **route_run_stop_id / run_date / route_pool_id** via `core.assignments`
    (`visit.assignment_id` → `route_runs` → `route_run_stops`), and
    **on_street_name / pool_id** from the surviving `public.stops`.
- New shared module **`backend/src/domains/observation/cleanLogsCanonicalQuery.ts`**:
  the single definition both endpoints call (`buildCleanLogsCanonicalQueries`),
  exporting the pinned **`CLEAN_ACTION_KEYS`** constant. The pivot iterates this
  fixed set — it does **not** map only the rows that happen to be present — so a
  not-done action still emits an explicit `false`.
- **Shape:** `id` is now the canonical **visit id** (was `clean_logs.id`); used by
  the consumers only as a row key. `duration_minutes` is now surfaced (sourced from
  canonical wall-clock — it may differ slightly from the old worker-entered
  `clean_logs.duration_minutes`, the same shift CC-REPOINT documented). Filters
  (`stop_id`, `run_date`, `pool_id`), pagination, and the `{ clean_logs, total }`
  envelope are unchanged.
- Tests:
  - **`cleanLogsCanonicalPivot.test.ts`** (new, named regression) — drives the live
    write path (`completeStop`, which still dual-writes clean_logs + canonical),
    then asserts the canonical pivot reproduces the clean_logs 5-boolean set
    EXACTLY for the same visit, **including the two `false`-by-absence keys**, with
    matching row count and an identity-free returned shape.
  - **`cleanLogsIdentity.test.ts`** (updated) — was anchored on `FROM clean_logs cl`;
    now a static guard that both handlers read no `clean_logs` / `cl.` alias and
    delegate to the shared canonical builder, and that the builder is identity-free.

## Why
- ISSUE-031 P1, clean-logs Layer 3. The endpoints historically read
  `public.clean_logs`, the transit-adapter table that carries worker identity
  (`user_id`) and is slated to be dropped (migration sequence P6). Reading the
  canonical entity tables makes the reads identity-free **by construction** and
  independent of the clean_logs write, which is the prerequisite for clipping that
  write. Gated by the data-home audit
  (`docs/audit/2026-06-14-cleanlog-action-data-home.md`), which proved the action
  data already lives as canonical `obs_kind='action'` rows keyed in `intervention`.

## Verification (paste-back)

**Lossless before/after (all 6 real visits; booleans = litter/trash/shelter/pad/can):**

| visit | before (clean_logs) | after (canonical pivot) | match |
|-------|---------------------|--------------------------|-------|
| 89 | 1/1/0/0/0 | 1/1/0/0/0 | ✓ |
| 90 | 1/1/0/0/0 | 1/1/0/0/0 | ✓ |
| 91 | 0/0/0/0/0 | 0/0/0/0/0 | ✓ |
| 93 | 1/1/0/0/0 | 1/1/0/0/0 | ✓ |
| 94 | 0/0/0/0/0 | 0/0/0/0/0 | ✓ |
| 95 | 1/1/0/0/0 | 1/1/0/0/0 | ✓ |

All 5 booleans match per visit **including the false ones** (`washed_shelter/pad/can`
are false on every row via absence; visits 91 & 94 are all-false). `route_run_stop_id`
and `stop_id` reproduce exactly. **Row count: before 6 = after 6.**

**Grep — no identity column in the new reads:**
`grep -nE 'user_id|worker_id|employee_id|reported_by|actor_ref' cleanLogsCanonicalQuery.ts`
and the two handlers → only hits are a prose comment naming `user_id` and the
`actor_oid` audit-middleware calls on **other** admin POST handlers; the
`/admin/clean-logs` and `/ops/clean-logs` reads name no identity column. No
`FROM/JOIN clean_logs` and no `cl.` alias remain in either handler.

**Tests:** `npm test` → **111 passed, 0 failed**. `tsc --noEmit` → clean.

## Honest residual
- **Out of scope (separate cards):** the clean_logs **write** in
  `cleanLogService.ts` is untouched (the follow-on clip card). The Control Center
  `/admin/control-center/routes` handler still `LEFT JOIN public.clean_logs cl` for
  `observed_minutes` — a different reader-site CC-REPOINT also left for its own
  repoint.
- **Assignment dependency:** the canonical read requires a visit to have a
  canonical `assignment_id` (post-Tier-5). All current completed visits have one
  (verified: 0 null); a hypothetical pre-Tier-5 visit without an assignment would
  be invisible to the list. Noted, not a regression for live data.
- **`CLEAN_ACTION_KEYS` duplication:** the same five keys are still hardcoded as
  `if (ui.<key>)` write branches in `observationService.ts`. Unifying read + write
  onto the one constant is a cheap future cleanup, deferred to avoid touching the
  write on this card.

## Files touched
- `backend/src/domains/observation/cleanLogsCanonicalQuery.ts` (new)
- `backend/src/modules/ops/opsRoutes.ts`
- `backend/src/modules/admin/adminRoutes.ts`
- `backend/tests/canonical/cleanLogsCanonicalPivot.test.ts` (new)
- `backend/tests/canonical/cleanLogsIdentity.test.ts`
- `backend/tests/run.ts`
- `docs/changelog/refactor/2026-06-15-issue-031-cleanlogs-layer3-read-repoint.md` (new)
