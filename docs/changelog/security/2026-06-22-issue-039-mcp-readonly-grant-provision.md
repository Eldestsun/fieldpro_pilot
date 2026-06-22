# ISSUE-039 — Version-control mcp_readonly's canonical-only grant posture

**Date:** 2026-06-22
**Type:** Security / labor-safety grant wall + clean-build deploy gate
**Issue:** ISSUE-039 (second clean-room-rebuild blocker; same drift class as ISSUE-038, one layer down — grants, not DDL)
**Branch:** `chore/issue-039-mcp-readonly-canonical-grant` (stacked on `chore/issue-038-migration-ledger-reconcile`)

## Problem

`mcp_readonly`'s read grants were applied out-of-band (direct `psql`) and never
version-controlled, so `00000000_consolidated_schema.sql` reproduces none of them. On the
first-ever clean-room rebuild the chain died at `20260612_mcp_readonly_revoke_canonical_only.sql`,
whose step-6 regression guard `RAISE`s unless `mcp_readonly` already holds `SELECT` on
`core.observations`. That guard is correct — it caught a missing upstream grant. The fix is
upstream provisioning, never weakening the guard. Beyond the build blocker: the `mcp_readonly`
grant boundary **is** the structural labor-safety guarantee, and it lived only in a hand-mutated
dev DB — unreproducible and unprovable from version control.

## Change

- **New migration `20260611_mcp_readonly_canonical_grant_provision.sql`** (sorts before
  `20260612`; founder §4 seam decision — a dedicated, runner-owned, idempotent grant migration;
  `00000000_consolidated` left untouched as a pure structural baseline):
  - `pg_roles` DO-block guard creates `mcp_readonly` (NOLOGIN) only if absent — fresh-build-safe
    on a cluster that has neither role nor grants. LOGIN attribute + password remain
    environment-bootstrap-owned (secret, out of version control).
  - Grants `SELECT` on the **29-object intended canonical-only set** (13 `core` + 16 `public`),
    derived from design (`20260612` §WHAT IS KEPT; `CANONICAL_STATE_LAYER_DESIGN.md` §3.2), not
    from a live snapshot. Every object verified identity-free by column scan.
  - Two self-verifying assertions: inclusion (all 29 granted) and a labor-safety identity-wall
    check (the 13 hard identity objects must NOT be granted).
- **`20260617_canon_norm_3_grant_normalized_view_select.sql`** — one-line addition granting
  `mcp_readonly` `SELECT` on `core.v_observation_normalized`. That view is part of the intended
  set but is created at `20260614`, after the `20260611` migration, so its grant lives in the
  object's own grant migration (each grant lives where its object exists). Identity-free.
- **`CLAUDE.md`** — extended the ISSUE-038 Migration Recording Discipline rule to explicitly
  cover GRANTs and role provisioning, not just DDL.

## Scope boundary (kept separate per founder decision)

The two residual identity-named transit views (`core.v_clean_logs_transit` [user_id],
`core.v_hazards_transit` [reported_by]) are **excluded** from `mcp_readonly`'s set and are **not**
asserted-absent by this migration. Their live eviction is owned by card **D3** (ISSUE-031/D3);
live/dev legitimately still hold those grants until D3 lands. (An early cut of the migration
over-reached by asserting their absence, which would have failed every already-populated
`npm run migrate`; the DONE-CRITERION D proof caught it and the assertion was narrowed to the
identity wall only.)

## Verification (clean build run as `postgres`; dev run as `fieldpro`)

- **A — clean build:** empty DB → `npm run migrate` → **exit 0**. `20260611` applies, then
  `20260612` step-6 assertion **passes** (grant present before it runs). Full chain to `20260620`.
- **B — intended set:** fresh build `mcp_readonly` holds exactly **30** SELECT objects (14 core
  incl. `v_observation_normalized` + 16 public). `core.observations`=true; both transit
  views=false; 13 identity objects leaked=**0**.
- **C — idempotent:** second `npm run migrate` → **exit 0, 0 applies** (role guard + grants are
  no-ops).
- **D — dev unregressed:** `20260611` run as `fieldpro` against the populated dev DB (rolled back,
  ledger untouched pre-merge) → **exit 0, 0 errors**. The grants already exist in dev, the role
  guard skips creation — a clean no-op, not a collision. Actual dev/live landing is post-merge via
  the runner.

## Follow-up filed

`Sibling-role grant drift recon — intelligence_reader + audit_reader` (RECON-ONLY card): both
hold `SELECT` on `core.observations` in live, granted out-of-band; confirm whether clean-build
reproduces those or whether they are the same drift class as ISSUE-039.
