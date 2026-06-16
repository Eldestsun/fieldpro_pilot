# PR draft — clean-logs Layer 3: repoint clean-logs reads to canonical

**Branch:** `feat/issue-031-p1-cleanlogs-read-repoint` → `main`
**Title:** `refactor(issue-031): clean-logs Layer 3 — repoint clean-logs reads to canonical`

---

**SIGNIFICANCE:** This is the read-side gate that unblocks clipping the
`clean_logs` write. Both clean-logs list endpoints now read the action data from
the identity-free canonical layer instead of `public.clean_logs`, so the legacy
table no longer has a live reader on these surfaces — the next card can clip its
write without breaking them.

**WHAT LANDED:**
- `GET /api/ops/clean-logs` and `GET /admin/clean-logs` repointed off
  `public.clean_logs` onto `core.visits` + `core.observations`:
  - the 5 action booleans are pivoted from `obs_kind='action'` rows over a FIXED
    five-key set (`COALESCE(bool_or(intervention='<key>'), false)`) so a not-done
    action emits an explicit `false` (absence ⇒ false), never null/missing;
  - `cleaned_at` ← `visits.ended_at`, `duration_minutes` ← visit wall-clock;
  - `route_run_stop_id` / `stop_id` / `run_date` / `route_pool_id` resolved
    canonically via `core.assignments` + `core.location_external_ids` (the
    CC-REPOINT join path) onto the surviving transit spine.
- New shared builder `cleanLogsCanonicalQuery.ts` (one definition for both
  endpoints; exports the pinned `CLEAN_ACTION_KEYS`).
- **`/admin/control-center/routes` `observed_minutes` repointed** off
  `public.clean_logs` onto `core.visits` (the residual this PR's earlier draft
  flagged, now closed in the same branch):
  - old `COALESCE(SUM(cl.duration_minutes), 0)` → route-level visit wall-clock
    `COALESCE(EXTRACT(EPOCH FROM SUM(v.ended_at - v.started_at)) / 60.0, 0)` over
    `v.outcome='completed' AND v.ended_at IS NOT NULL`;
  - canonical join path `route_runs → core.assignments (source_ref) → core.visits`
    (CC-REPOINT spine; aggregates at route_run level so no stop-level spine needed);
  - BEFORE/AFTER reconciled per-run (runs 25, 144): visit-count == clean_log-count,
    and applying the legacy `GREATEST(1, ceil(min))` per-stop rounding to the
    canonical timestamps reproduces the legacy totals **exactly** — so the small
    deltas (−1.686, −1.026) are the documented stored-vs-wall-clock rounding, not
    data loss. Proof in
    `docs/changelog/refactor/2026-06-15-issue-031-observed-minutes-read-repoint.md`.
- Tests: new named regression `cleanLogsCanonicalPivot.test.ts` (proves the pivot
  is lossless vs clean_logs incl. the false-by-absence keys); `cleanLogsIdentity.test.ts`
  updated to guard the canonical shape. **111 passed, 0 failed; tsc clean.**
- Verification (lossless, all 6 real visits; counts 6=6; no identity column in the
  new reads) is pasted in the changelog:
  `docs/changelog/refactor/2026-06-15-issue-031-cleanlogs-layer3-read-repoint.md`.

**HONEST RESIDUAL — clean_logs is NOT clip-ready after this PR:**
- `clean_logs` still has **one live reader**: `loadRouteRunById.ts:81` (the
  route-detail cleaning-action booleans). The remaining gate before the write can
  be clipped is **Step 5.1 (D4/D5, Phase 5)**.
- The `clean_logs` **write** (`cleanLogService.ts`) is intentionally untouched —
  that's the follow-on clip card.
- The canonical reads require a post-Tier-5 `assignment_id` on the visit (true for
  all current data: 0 null); pre-Tier-5 assignment-less visits would be invisible.
- `CLEAN_ACTION_KEYS` is duplicated against the write-side `if (ui.<key>)` branches
  in `observationService.ts` — cheap future unification, deferred to keep the write
  out of this card.
