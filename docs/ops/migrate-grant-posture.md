# Runbook — landing the reconciled schema + grant posture (ISSUE-038 / ISSUE-039)

Focused note on how to run `npm run migrate` now that ISSUE-038 (migration-ledger reconcile)
and ISSUE-039 (version-controlled `mcp_readonly` grant posture) give a clean migrate path.
This is **not** a full deploy manual — only what 038+039 changed about running migrate.

Full proof record: ISSUE-038 card · ISSUE-039 card
(`https://app.notion.com/p/38567f841a52815c939af424d4673d6f`,
`https://app.notion.com/p/38667f841a528155994fe94f5f29e24f`) and changelog
`docs/changelog/security/2026-06-22-issue-039-mcp-readonly-grant-provision.md`.

## 1. Which role runs migrate — by scenario

`20260611_mcp_readonly_canonical_grant_provision.sql` provisions the `mcp_readonly` role and
applies its grant set. `CREATE ROLE` and `GRANT` require authority the app role does not have.

- **Fresh provision (empty DB — new environment, e.g. Azure):** run `npm run migrate` as a role
  with **CREATE ROLE + GRANT authority** (a superuser, or the object owner with `CREATEROLE`).
  The app role `fieldpro` **cannot** create the role or grant on objects it does not own — running
  a fresh provision as `fieldpro` yields **structure without grants** (and the build aborts at
  `20260612`'s grant guard, or lands a role with the wrong/empty posture). Do not do this.
  - `mcp_readonly` is created `NOLOGIN`; its LOGIN attribute + password are environment-bootstrap
    secrets, applied separately (`ALTER ROLE mcp_readonly LOGIN PASSWORD …`), never in a migration.
- **Already-populated environment (role + grants already present):** running `npm run migrate` as
  the app role `fieldpro` is fine — the grant migration is **idempotent and a no-op when the
  posture already matches** (the `CREATE ROLE` guard skips; re-`GRANT`s on `fieldpro`-owned objects
  succeed as no-ops). If a populated environment is somehow missing grants, run as the admin role
  so the grants can actually be (re)applied.

## 2. Per-environment verification — NOT optional

`migrate` exit 0 is **not** acceptance: a role-authority issue can let migrate pass while silently
skipping grants. After exit 0, confirm the posture landed (this is DONE-CRITERION B from ISSUE-039):

```sql
-- A) the canonical-only set is exactly 30 objects
SELECT count(*) FROM information_schema.role_table_grants
WHERE grantee = 'mcp_readonly' AND privilege_type = 'SELECT';   -- expect 30

-- B) the canonical read is present (what 20260612's guard depends on)
SELECT has_table_privilege('mcp_readonly','core.observations','SELECT');   -- expect t

-- C) identity wall intact — zero identity objects reachable
SELECT count(*) AS identity_leaked FROM (VALUES
  ('core.visit_actor_audit'),('core.observation_actor_audit'),
  ('core.evidence_actor_audit'),('core.assignment_actor_audit'),
  ('public.identity_directory'),('public.route_runs'),('public.lead_route_overrides'),
  ('public.clean_logs'),('public.hazards'),('public.infrastructure_issues'),
  ('public.level3_logs'),('public.stop_photos'),('public.trash_volume_logs')
) t(obj)
WHERE to_regclass(obj) IS NOT NULL
  AND has_table_privilege('mcp_readonly', obj, 'SELECT');   -- expect 0
```

Or eyeball the grant set with `\dp` filtered to `mcp_readonly`. Acceptance = count 30, `core.observations`
present, identity_leaked 0. (The two D3-residual transit views `core.v_clean_logs_transit` /
`core.v_hazards_transit` are intentionally absent from the 30 in a fresh build; an already-populated
environment may still hold them until card D3 evicts the views — that is expected, not a failure.)

## 3. Ordering — 039 is stacked on 038

`20260611` (ISSUE-039) relies on ISSUE-038's `00000001_reconcile_issue038_record_canon_drift.sql`
and the recording-aware `backend/src/scripts/migrate.ts` logic to produce a clean chain. On `main`
post-merge this is automatic (both are present and lexically ordered). For any **lagging environment**
brought up later: it must pick up 038's reconcile migration + migrate.ts before the 039 grant
migration runs, or the chain will not be clean. Running `npm run migrate` from current `main` against
that environment applies them in the correct order automatically — do not cherry-pick 039 ahead of 038.
