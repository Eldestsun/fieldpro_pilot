# ISSUE-031/D3 — Evict the two residual identity-named transit views

**Date:** 2026-06-24
**Type:** Refactor (P1 state migration — closes the ISSUE-031 view-eviction tail)
**Issue:** ISSUE-031/D3
**Migration:** `backend/migrations/20260623_issue031_d3_evict_residual_transit_views.sql`

## What changed
`DROP VIEW IF EXISTS core.v_clean_logs_transit` and `core.v_hazards_transit` (idempotent), with a post-drop assertion that both are gone.

These two views survived `20260613_p1_drop_dead_transit_views` (which dropped the other four dead `core.v_*_transit` views) only because the Control Center handlers in `adminRoutes.ts` still read them. The P1 in-place CC repoint (ISSUE-031/CC-REPOINT, `ba660c3`, merged) moved `/overview` + `/difficulty` off these views onto `core.observations` / `core.visits`. With that landed, the views have zero readers and the eviction — the final structural step of the work-attribution migration — can run.

## Why (labor-safety, not just cleanup)
Each view projects a worker column (`v_clean_logs_transit.user_id`, `v_hazards_transit.reported_by`) and carried a standing read-role SELECT grant. They leaked no real identity only because the base columns are neutralized to constant-0 — a data coincidence, not a structural guarantee. Dropping the views removes both the columns and the standing grants in one step, so the exposure cannot reopen if those base columns ever repopulate.

## Verification
- **Zero readers:** repo grep of `backend/src` + `frontend/src` (excl. migrations) → 0 hits for either view.
- **Zero DB dependents:** `pg_depend` / `pg_rewrite` scan → no view/MV/rule depends on either, so a plain `DROP VIEW` (RESTRICT, the default) is safe — no CASCADE.
- **Rolled-back dev run** (as `fieldpro`, owner): both views dropped, assertion passed, exit 0, then ROLLBACK (dev untouched pre-merge).
- **Gate-proven GREEN (2026-06-24):** applied on the same fresh empty-DB clean build as `20260624` — full chain `npm run migrate` → exit 0 (26 applied); both views dropped; assertion passed; `mcp_readonly` ends at its 30-object canonical-only set with both views absent and identity-leak 0; idempotent re-run = 0 applies.

## Notes
Independent of the role-provisioning migration `20260624` (no inter-dependency; lexically `20260623` < `20260624`). `core.v_observation_normalized` and the four actor-audit sidecars are untouched.
