# 2026-07-01 — ISSUE-052 (Branch B: intentional text) + ISSUE-053 org FKs (Stage-3-aware) + .gitignore check

**Type:** Security / multi-tenant hardening · **Branch:** `chore/pre-p2-slate-052-053-gitignore`
**Specs:** ISSUE-052 card (`38d67f84-…3a26`), ISSUE-053 card (`38d67f84-…733f`), MT-2 card,
`docs/audit/2026-06-27-multi-tenant-readiness-recon.md` §C. Amended same-day per the Stage-3
exclusion dispatch (drop-listed tables must not receive FKs).

## What changed

1. **ISSUE-052 → Branch B (INTENTIONAL), no structural change.**
   Recon proved `export_delete_tokens.org_id` deliberately holds the **Azure Entra tenant
   UUID**, not the numeric `organizations.id`: the only writer
   (`exportDeleteRoutes.ts:193`) inserts `tenantUuid` from `reqTenantUuid(req)`; the
   original DDL (`legacy_20260513_s1_4…:46`) comments it "Azure tenant UUID
   (req.user.tid)"; readers (`:265`, `:332`) string-compare it to the caller's tenant UUID
   for cross-org checks. Live data: table empty. Per the strict 052 bar (any non-numeric
   writer → intentional) → Branch B.
   `20260701_issue052_document_export_delete_tokens_org_id.sql` attaches a
   `COMMENT ON COLUMN` recording what it holds, why it is text, that MT-2's TEXT predicate
   is correct, and that neither a bigint migration nor an org FK may be applied.
   MT-2's predicate on this table untouched (verified before/after — text form, no cast).

2. **ISSUE-053 → org FKs on the 9 surviving tables.**
   `20260701_issue053_org_fk_public_tables.sql` adds
   `<table>_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organizations(id)
   ON DELETE RESTRICT` (exact core convention) to: `asset_external_ids`,
   `lead_route_overrides`, `route_run_stops`, `stop_condition_history`,
   `stop_effort_history`, `stop_pool_memberships`, `stop_risk_snapshot`, `stops_legacy`,
   `transit_stop_assets`. Guarded/idempotent; orphan-gated (all targets verified 0 orphans
   pre-authoring; ADD CONSTRAINT re-validates loudly everywhere else).
   **Excluded** — `export_delete_tokens` (by the 052 decision, not oversight);
   `clean_logs`, `hazards`, `infrastructure_issues`, `stop_photos` (**Stage-3
   permanent-drop list**, per the Stage-3 card "physically DROP the 5 frozen adapter
   tables" — empty + frozen, an FK guards no writes and adds a drop-ordering dependency;
   the fifth, `trash_volume_logs`, is already dropped by `20260620_issue037…`).

3. **`20260701_issue053b_drop_stage3_org_fks.sql`** — reconciliation: the pre-trim 053 ran
   on live dev and had FK'd the 4 Stage-3 tables; this paired migration drops exactly
   those 4 constraints (`IF EXISTS`; no-op on fresh builds, where the trimmed 053 never
   creates them). Both paths converge on: org FKs on the 9 survivors only.

4. **.gitignore negation — already done on `main`** (PR #69, `9f22796`):
   `.gitignore:28 !docs/changelog/data/` after the `data/` rule; `git check-ignore` on the
   existing `docs/changelog/data/2026-06-28-seed-live-only-config.md` exits 1 (not
   ignored). No change made on this branch — not duplicated.

## Why

- The adapter/intelligence layer now carries the same "every tenant-scoped row provably
  belongs to a real tenant" guarantee as `core.*` — integrity to match the RLS isolation.
- The 052 decision is attached to the column itself so no future migration author "fixes"
  the text type and breaks the export-and-delete flow.
- FKs on tables scheduled for physical DROP are dead weight and a drop-ordering hazard —
  the Stage-3 exclusion keeps ISSUE-037 unblocked.

## Residuals (reported, deliberately not folded in)

- **`public.audit_log`** also has `org_id` + forced RLS + no org FK, but sits outside the
  053 card's named 14 — left for PM to file/decide (its delete path has its own
  export-delete mechanism).
- **Latent finding (founder-file candidate):** post-MT-2 fail-closed, the
  `export_delete_tokens` RLS policy compares its tenant-UUID `org_id` against
  `app.current_org_id`, which the app sets to the numeric org id (`'1'`) — and
  `exportDeleteRoutes.ts` queries the table without org context at all. The
  export-and-delete token INSERT/reads therefore likely return 0 rows / fail WITH CHECK
  under FORCE RLS today. Pre-existing (MT-2 × S1-4 interaction), not introduced or
  altered by this task.

## Verification (full transcript in the dispatch paste-back)

- Clean room (fresh `postgres:14` + bootstrap → full chain): exit 0; all three migrations
  applied + recorded; **9** survivor FKs present, **0** FKs on the drop-listed 4;
  idempotent re-run → 0 applies.
- Live dev: applied via the runner, all three recorded; 9 survivor FKs (`ON DELETE
  RESTRICT`), 0 drop-listed FKs; `export_delete_tokens.org_id` still `text`, comment
  attached, policy qual unchanged (text form).
- RLS policy census **37 before = 37 after** (no policy touched).
- Identity wall untouched: no grant/role/identity object in any migration;
  `mcp_readonly`/`intelligence_reader` identity grants still **0**.

## Files touched

- `backend/migrations/20260701_issue052_document_export_delete_tokens_org_id.sql` (new)
- `backend/migrations/20260701_issue053_org_fk_public_tables.sql` (new)
- `backend/migrations/20260701_issue053b_drop_stage3_org_fks.sql` (new)
- `docs/changelog/security/2026-07-01-issue052-053-org-scope-hardening.md` (this file)
