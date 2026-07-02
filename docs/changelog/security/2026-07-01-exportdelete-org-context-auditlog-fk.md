# 2026-07-01 — Export-and-delete org context under fail-closed RLS + audit_log org FK + comment fix

**Type:** Security (procurement-critical flow repair + compliance-integrity FK) ·
**Branch:** `fix/pre-p2-closeout-exportdelete-auditfk-comment`
**Specs:** MT-2 card (fail-closed flip), ISSUE-013 card (fail-closed resolution pattern),
`docs/changelog/security/2026-05-13-s1-4-export-and-delete.md` (the S1-4 contract),
ISSUE-052 resolution (token org_id = intentional tenant-UUID text),
2026-07-01 audit_log recon (compliance surface, keep).

## Item A — export-and-delete works end-to-end under fail-closed RLS

**Problem.** MT-2 flipped RLS fail-closed; `exportDeleteRoutes.ts` set no org context, so
the KCM-contract export+hard-delete flow read 0 rows / failed WITH CHECK on every RLS
table it touches.

**Fix (`backend/src/modules/admin/exportDeleteRoutes.ts`).**
- **Fail-closed resolution at the top of all 3 handlers** (`/request`,
  `/export/:token_id`, `/execute`): tenant UUID → numeric `organizations.id` via
  `reqOrgId` → `resolveNumericOrgId` (the ISSUE-013 resolver). No match →
  `OrgResolutionError` → **403** (handler catches now honor `err.status`). No default
  org, ever. The old in-file `resolveOrgInt` helper — which still carried the fail-open
  `ORDER BY id LIMIT 1` fallback — was dead code and is **removed**.
- **Two-notion org context, per statement group** (the flow straddles both org notions in
  one connection): `export_delete_tokens`' RLS compares its **text tenant-UUID** org_id
  against `app.current_org_id`, while canonical tables + `audit_log` compare the
  **numeric** id. `setOrgCtx` flips the GUC on the checked-out client — tenant UUID for
  token statements (lookup, INSERT, consumed-UPDATE), resolved numeric id for the whole
  canonical delete sequence + audit insert. Context resets to `''` in every handler's
  `finally` (mirrors `withOrgContext`).
- The existing gated purge mechanism (`SET LOCAL app.export_delete_active` /
  `app.export_delete_org_id`) is **unchanged** — note it works only in combination with
  `app.current_org_id` (a DELETE with a WHERE also needs SELECT-policy visibility), which
  the handler sets.
- No RLS policy, grant, role, or token-column type touched.

**Tests (`backend/tests/canonical/exportDelete.test.ts`) — all 14 green; 11 modified.**
Baseline before the change: **3 passed, 11 failed** — every failure a bare
`pool.query` setup INSERT/read rejected by fail-closed RLS. Those 11 passed pre-MT-2
**only because RLS was fail-open**; their setup plumbing (not their assertions) was
updated to run with org context exactly as the fixed handlers do (`withCtx` /
`setAuditCtx` helpers: tenant-UUID context for token statements, numeric for audit_log).
The audit tests also create their `organizations` fixture row (org 44) since audit_log
now carries the org FK. Assertion semantics unchanged; several are now *stronger* (e.g.
append-only DELETE-block proven with org context present).

## Item B — audit_log org FK (053-followup on a keep table)

`backend/migrations/20260701_issue053c_audit_log_org_fk.sql` — adds
`audit_log_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE
RESTRICT` (core convention; org_id bigint since Phase 3 — type-clean). **RESTRICT is a
deliberate compliance-integrity choice:** an org row must not vanish while its audit
trail exists; the one legitimate purge path (S1-4 `/execute`) deletes audit rows
in-transaction before any org deletion, so RESTRICT never blocks it — this was
demonstrated live during verification (an org delete attempt with a surviving audit row
was refused by the FK; after the gated purge it succeeded). Guarded/idempotent; asserts
the FK exists and the 3-policy RLS set is untouched. Orphan pre-check: 0.

## Item C — stale comment

`backend/src/middleware/devAuthBypass.ts` header comment no longer claims
"audit_log.org_id is UUID type" (bigint since `20260518_rls_phase3`); now describes the
actual mechanism (sentinel tid; writeAuditLog resolves to numeric). Comment-only.

## Verification (full transcript in dispatch paste-back)

- **A2 fail-closed:** unresolvable tenant → `OrgResolutionError status=403`; zero tokens,
  zero bundles for that tenant; incomplete bypass headers → 401. Never org-1.
- **A3 end-to-end as `fieldpro` (non-super) under fail-closed RLS:** `/request` issued a
  token + wrote `export.data_export` and `export.delete_confirm` audit rows + bundle;
  `/export/:id` served the bundle (org-validated); `/execute` returned a deletion summary
  (canonical fixture rows + 6 audit rows purged via the gated path); replay → **409**.
- **A5 cross-org safety:** an org-2 probe (canonical row + audit row) **survived** the
  org-1 execute untouched; org-1 rows were fully removed. Scoping is by the resolved id
  in both SQL and RLS.
- **Shared:** clean room (fresh DB → full chain incl. 053c → exit 0; idempotent re-run
  0 applies); migration runner-recorded (no out-of-band psql); RLS census 37 unchanged;
  identity wall untouched (read-role attrs + zero identity grants re-verified); `tsc`
  clean.

## Files touched

- `backend/src/modules/admin/exportDeleteRoutes.ts`
- `backend/tests/canonical/exportDelete.test.ts`
- `backend/migrations/20260701_issue053c_audit_log_org_fk.sql` (new)
- `backend/src/middleware/devAuthBypass.ts` (comment only)
- `docs/changelog/security/2026-07-01-exportdelete-org-context-auditlog-fk.md` (this file)
