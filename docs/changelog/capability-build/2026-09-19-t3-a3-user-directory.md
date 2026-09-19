# 2026-09-19 — T3-A3: read-only user directory (Admin)

## Founder rulings
1. **Option A — no deactivation concept in BASELINE.** Entra is the only
   switch; the directory is a read-only mirror of who has signed in. No write
   paths anywhere. ("Hide from pickers" stays a future card if ever needed.)
2. **Date-only last sign-in — the founder's conditional ruling resolved by
   recon.** Rule given: timestamp OK if the column captures only logins; off
   if it tracks activity. Fact found: `upsertIdentity` runs inside
   `requireAuth`, so `last_seen_at` refreshes on **every authenticated
   request** — it is an activity tracker. → date-only, test-enforced.
3. Role column labeled "Role at last sign-in" (login-time cache, not Entra truth).

## What changed
- `backend/src/modules/admin/adminRoutes.ts`: `GET /admin/users` —
  Admin-gated, org fail-closed, returns `display_name / email /
  role_at_last_sign_in / last_sign_in` (`to_char 'YYYY-MM-DD'` — node-pg
  serializes a bare `::date` as a full ISO timestamp, which broke the
  date-only contract in testing). **No OIDs**; seed rows excluded.
- `frontend`: `AdminUserDirectoryPanel` (new) + `/admin/users` route +
  "Users" nav link (Admin only); `fetchUserDirectory()` API fn. Subtitle:
  "Read-only — accounts are managed in Microsoft Entra."
- Identity-leak registry (`runtimeIdentityLeak.test.ts`): `/admin/users`
  classified `sanctioned` (Admin authorized, Dispatch proven refused) — the
  coverage meta-test caught the unclassified route on first run, exactly as
  designed.
- New `tests/canonical/userDirectory.test.ts`: shape + no-oid + no-raw-
  timestamp + date-only regex + seed exclusion; Dispatch 403.
- OpenAPI regenerated (53 paths).
- Spec: `planning/specs/T3-A3-user-directory-readonly.md`.

## Verification
Backend **233/233** (2 new + registry entry); frontend **122/122**;
`tsc --noEmit` clean both.

## Files touched
- `backend/src/modules/admin/adminRoutes.ts`
- `backend/tests/canonical/userDirectory.test.ts` (new)
- `backend/tests/canonical/runtimeIdentityLeak.test.ts`, `backend/tests/run.ts`
- `backend/openapi/openapi.json` / `openapi.yaml`
- `frontend/src/components/admin/AdminUserDirectoryPanel.tsx` (new)
- `frontend/src/api/routeRuns.ts`, `frontend/src/App.tsx`
- `planning/specs/T3-A3-user-directory-readonly.md` (new)
- `docs/changelog/capability-build/2026-09-19-t3-a3-user-directory.md` (this entry)
