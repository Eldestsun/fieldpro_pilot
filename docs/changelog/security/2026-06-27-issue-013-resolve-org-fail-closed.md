# ISSUE-013 — `resolveNumericOrgId` fails closed; org-1 tenant mapping made reproducible

**Date:** 2026-06-27 · **Type:** Security hardening (multi-tenant) · **Branch:** `fix/issue-013-resolve-org-id-fail-closed`
**Depends on:** ISSUE-041a deploy-wiring (merged, PR #62) — the app connects as non-super `fieldpro`, so RLS is runtime-enforced and the fail-closed behavior is provable. Gate confirmed: app connection = `fieldpro | rolsuper=f | rolbypassrls=f`.

## Problem

`resolveNumericOrgId` (`backend/src/middleware/resolveOrgId.ts`) resolved an unmatched/anonymous caller to the **lowest-id org** via `… UNION ALL SELECT id FROM organizations ORDER BY id LIMIT 1` + a `?? 1` literal. Real Entra JWTs carry no `org_id` (the early return fires for dev-bypass only), so every real-Entra request was one unmatched `tid` away from being **silently scoped to org 1**. The day a second org exists without a matching `tenant_uuid`, an org-2 user silently reads/writes org-1 data — fail-open cross-tenant exposure (and a worker-identity isolation break).

A second, latent half: **nothing creates the org-1 row.** The consolidated schema only `CREATE`s the `organizations` table; `20260518_rls_phase3` step 4's `UPDATE … WHERE id = 1` no-ops on a clean-room build because the row doesn't exist yet. Org 1 lived in **dev data only**. So simply failing closed would have denied *every* login on a fresh build.

## Change (application-layer half only — `resolveOrgId.ts` + one seed migration)

1. **`backend/src/middleware/resolveOrgId.ts`** — rewritten to **fail closed**:
   - Dropped the `UNION ALL … ORDER BY id LIMIT 1` fallback and the `?? 1` literal.
   - Resolves org **only** from a positive signal: dev-bypass `user.org_id` (the line-16 early return, kept), or a `tenant_uuid` that actually matches `req.user.tid`.
   - On no `tid`, or no matching org row, **throws `OrgResolutionError` (new, `status = 403`)** — the request fails visibly, never defaults to an org. (`organizations` has no RLS, so the bare lookup is correct without org context — verified.)
2. **`backend/migrations/20260627_issue013_seed_org1_tenant_uuid.sql`** (new) — idempotent upsert of org 1 (`id, name, slug, tenant_uuid`) so the tenant mapping is reproducible from version control, recorded via the migration runner (no out-of-band psql). Per the recon it does **not** add UNIQUE/index/NOT NULL to `tenant_uuid` (already partial-unique + indexed; must stay nullable). Keeps the IDENTITY sequence ahead of the seeded `id=1`.
   - **Tenant GUID note (in the migration):** `66d756aa-…` is the **dev/current Entra tenant** (founder's own), occupying the org-1 slot; the org is labeled "KCM" aspirationally — it is **not** a real KCM tenant. Persisted verbatim from the live dev row (not invented); swap at pilot standup (KCM cutover).

No RLS policy touched (that is MT-2). No call sites touched (scope: `resolveOrgId.ts` + the migration). 13 callers already `await resolveNumericOrgId(req)` inside try/catch, so the throw surfaces as a visible error rather than a silent org-1 scope.

## Proof (fresh throwaway container — 041a init bootstrap + full migrate incl. the new seed; app role `fieldpro` non-super)

1. **Unmatched caller denied, not org-1:** real-Entra `tid` matching no row → **throws `OrgResolutionError` status=403** (`no organization provisioned for tenant …`); no `tid` → 403 (`request carries no tenant id`). Never returns org 1.
2. **Matched caller resolves correctly:** `tid = org-1 tenant_uuid` → `1`; `tid = org-2 tenant_uuid` → `2`.
3. **Dev-bypass unchanged:** `user.org_id=1` → `1`, `=2` → `2` (line-16 early return).
4. **Two-org probe (as non-super `fieldpro`):** org-2 caller resolves `2`, `withOrgContext(2)` on `bases` → only the org-2 row; org-1 caller resolves `1` → only the org-1 row. No cross-resolution.
5. **Idempotent + clean-room:** fresh DB → `migrate` exit 0 applies `20260627_…` and org-1 `tenant_uuid` is populated by migrations (not dev data); re-run → **0 applies, exit 0**; re-applying the seed SQL directly → `INSERT 0 0` (0 rows). `tsc --noEmit` exit 0.

## Notes

- Live dev cluster untouched (all proofs ran on a throwaway container on port 5440).
- Interacts with **MT-2** (RLS fail-open on unset context) — the database-layer half, intentionally unchanged here. With 013 fail-closed, a wrong-org *resolution* can no longer happen; MT-2 still hardens the unset-context path.
