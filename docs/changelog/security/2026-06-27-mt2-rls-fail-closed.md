# MT-2 (ISSUE-031/MT-2) — flip org-scoped RLS from fail-open to fail-closed

**Date:** 2026-06-27 · **Type:** Security hardening (multi-tenant, database layer) · **Branch:** `security/mt2-rls-fail-closed`
**Depends on / pairs with:** ISSUE-041a (app connects as non-super `fieldpro`, merged PR #62 — makes fail-closed runtime-provable) and ISSUE-013 (application-layer fail-closed resolution, merged PR #63). Gate confirmed: app connection = `fieldpro | rolsuper=f | rolbypassrls=f`.

## Problem

Every org-scoped RLS policy carried a pass-all first branch — `COALESCE(current_setting('app.current_org_id', true), '') = '' OR org_id = …` — so an **unset/empty** org context matched **ALL rows**. Tenant isolation *and* the worker-identity wall evaporated exactly when context was missing (the failure mode you most need contained). The `20260530` harden migration even mis-documented this guarded form as "fail CLOSED" when it is fail-open.

## Phase 0 — authoritative target set (enumerated live, by qual shape not policy name)

**36 policies** carry the pass-all branch: **34 `org_isolation`** (13 `core.*` + 21 `public.*`) **+ `audit_log_select` + `audit_log_insert`**. Driving off `policyname='org_isolation'` alone misses `audit_log` (org-scoped under per-command names). `audit_log_delete` already fail-closed (separate `app.export_delete_active` mechanism) — left alone. `export_delete_tokens.org_id` is **TEXT** → needs the text predicate (no `::bigint`).

**Delta vs the card's "37 + audit_log" estimate:** the live count is **34** org_isolation (not 37 — the "37" was a `pg_state.sql` line-occurrence count inflated by `WITH CHECK` duplicates), plus the 2 `audit_log` policies = **36 total**. Fewer, not more; full qual-based set used.

**5 bare `pool.query()` sites on FORCE-RLS tables** (would flip to silent-zero-rows): `stopRoutes.ts:87,182,277` (UPDATE `transit_stops`), `ulRoutes.ts:124` (SELECT `route_runs`), `auditLog.ts:31` (INSERT `audit_log`). (`auditLog.ts:23` reads `organizations` — **not** an RLS table, so unaffected; it carries a residual ISSUE-013-class fallback — see "new issues".)

## Change

1. **`backend/migrations/20260627_mt2_rls_fail_closed.sql`** (new) — one idempotent migration (DROP POLICY IF EXISTS + CREATE) flipping all 36 policies. Surviving predicate `org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint` yields **ZERO rows on unset/empty context**; `export_delete_tokens` uses the text form (no cast). PERMISSIVE / `TO public` preserved. Migrations run as `fieldpro_admin` (BYPASSRLS) so the DDL isn't self-filtered.
2. **Bare-read fixes** (so nothing silently empties under fail-closed): `stopRoutes.ts` (×3) and `ulRoutes.ts` now resolve org and wrap in `withOrgContext`; `auditLog.ts` wraps the `audit_log` INSERT in `withOrgContext(numericOrgId)` (the fail-closed WITH CHECK rejects an unscoped insert).
3. **`20260530_rls_harden_core_location_org_isolation.sql`** — corrected the misleading "fail CLOSED (empty result)" comment (the guarded form was fail-OPEN; MT-2 is the real fail-closed flip).
4. **`pg_state.sql`** — policy lines transformed to fail-closed (37→0 pass-all branches; **only** CREATE POLICY lines changed, 0 others).

**Scope:** `*_actor_audit` sidecars + `identity_directory` are **included** in the policy flip (their tenant-isolation policy goes fail-closed — strictly more protective; the card/recon list them). No sidecar structure, columns, grants, or the no-grant wall touched.

## Proof (fresh throwaway container — full clean-room migrate incl. MT-2; app role `fieldpro` non-super)

1. **UNSET context → ZERO rows** on `core.locations`, `public.bases`, `audit_log`, and `export_delete_tokens` (text) — pre-MT-2 each returned all rows.
2. **SET context scopes correctly:** `='1'` → only org-1 rows; `='2'` → only org-2, across core/public/text tables.
3. **Two-org probe** on the formerly-bare paths (`transit_stops`, `route_runs`, `audit_log`): ctx=1 → org-1 only, ctx=2 → org-2 only, unset → nothing.
4. **Formerly-bare handler SQL** under set context returns scoped data, not zero/all: `transit_stops` UPDATE ctx=1 → own-org 1 row / cross-org 0 rows; `route_runs` lookup finds the org-1 run; `audit_log` INSERT succeeds under context and is **rejected when unset** (fail-closed WITH CHECK).
5. **Idempotent + clean-room:** fresh DB → migrate exit 0 applies MT-2; re-run → **0 applies, exit 0**. `tsc` clean.
6. **`pg_state.sql` / clean-room dump:** grep for the pass-all branch → **0 hits**; 34 `org_isolation` + 2 `audit_log` in fail-closed form.

## Important deployment note — live-dev ownership reconcile blocks the live apply

MT-2 applies cleanly on a **fresh build** (the deploy gate — proven on scratch, where `fieldpro_admin` owns all objects). It **cannot** apply to the current **live dev DB**: its tables are owned by `fieldpro` (35) / `postgres` (4), not `fieldpro_admin`, so the runner (as `fieldpro_admin`) hits `must be owner of relation assignment_actor_audit`. This is the **deferred "live-dev split ownership reconcile"** already flagged in `docs/audit/2026-06-23-role-provisioning-fix.md`. MT-2 lands on the live DB once that reconcile runs or the DB is rebuilt clean-room. The live DB remains fail-open until then (single-org pilot — safe, per DQ-2). No data harmed; the runner did record 4 previously-unrecorded migrations on live (drift correction) — `mcp_readonly` grant wall verified intact (zero identity-table grants).
