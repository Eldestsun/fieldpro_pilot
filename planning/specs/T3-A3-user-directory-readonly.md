# T3-A3 — Read-only user directory (Admin)

**Status:** founder-ruled 2026-09-19, built same day.
**Card:** T3-A3 (BASELINE Work Tracker). **Branch:** `feat/t3-a3-user-directory`.

## Founder rulings

1. **No deactivation concept in BASELINE (Option A).** Entra is the only
   switch — a disabled Entra account cannot sign in or acquire tokens.
   The directory is a pure read-only mirror of `identity_directory`
   (who has signed into BASELINE); BASELINE never manages identity.
   A "hide from pickers" flag remains a future card if a departed worker
   ever actually clutters the reassign dropdown.
2. **Last sign-in is DATE-ONLY — conditional ruling resolved by code recon.**
   The founder's rule: full timestamp is fine if `last_seen_at` captures only
   logins; date-only if it tracks all activity. Recon: `upsertIdentity` is
   called from `requireAuth` — `last_seen_at` refreshes on **every
   authenticated API request** (starting stops, uploading photos, completing
   work). It is an activity tracker, not a login log → **date-only**, enforced
   by test.
3. **Role labeled "Role at last sign-in"** — `last_seen_role` is a login-time
   cache, not Entra truth; the UI must not imply otherwise.

## Surface

- `GET /api/admin/users` (Admin-gated router): `display_name`, `email`,
  `role_at_last_sign_in`, `last_sign_in` (`to_char … 'YYYY-MM-DD'`).
  **No OIDs in the payload** (SEAM-C posture). Seed rows (`oid LIKE 'seed-%'`)
  excluded. Org fail-closed via `resolveNumericOrgId` + `withOrgContext`
  (identity_directory is FORCE RLS).
- Frontend: `/admin/users` route + "Users" nav link (Admin only);
  `AdminUserDirectoryPanel` — name / email / role badge / date, subtitle
  states "Read-only — accounts are managed in Microsoft Entra." Zero write paths.

## Labor safety

Classified `sanctioned` in the runtime identity-leak registry (names/emails
ARE the surface — admin account-hygiene need), Admin-gated, Dispatch refused.
Date-only last sign-in keeps the surface from becoming a movement monitor;
`userDirectory.test.ts` turns red if a timestamp ever reappears, and the
registry's coverage meta-test prevents the route from being widened un-vetted.

## Tests

`tests/canonical/userDirectory.test.ts`: 200 + shape for Admin (probe row
listed; **no `oid` key; no raw `last_seen_at`; date-only regex**; seed rows
absent); Dispatch → 403. Plus the identity-leak registry entry (gate proven
against the under-privileged role).
