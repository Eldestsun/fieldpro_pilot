# 2026-08-17 — E2E credential wiring: real-Entra logins agent-ready, out of tracked files

## What changed
- `frontend/playwright.config.ts`: loads gitignored `frontend/.env.local` into
  `process.env` (hand-rolled parser, no new dependency; real env wins) — so the
  saved `E2E_*` logins reach the specs without shell exports. This is what lets
  any agent session (including mobile-driven Prompt3 runs) launch e2e tests
  immediately after building.
- `frontend/e2e/lead-route-creation.spec.ts` / `ul-stop-completion.spec.ts`:
  credential keys renamed to the post-rename persona names
  (`E2E_DISPATCH_USER_*`, `E2E_SPEC_USER_*`); error messages now point at
  `frontend/.env.local`.
- `frontend/.env.example`: E2E section carries the three persona key names
  (SPEC / DISPATCH / ADMIN), values empty — the manifest documents, the
  gitignored file holds.

## Why
- Founder provisioned three real Entra test accounts for agent testing and
  initially placed them in `.env.example` (tracked); caught pre-commit, values
  relocated to gitignored `frontend/.env.local` per the CRED-ENVLOCAL pattern.
- Leak scan (all tracked files, exact-value match): password in ZERO tracked
  files. One pre-existing note: the dispatch account's email/UPN appears in
  `docs/audit/2026-06-20-issue-031-037-writepath-ui-verification.md` (June
  real-token decode) — identifier only, recorded here for awareness.

## Files touched
- frontend/playwright.config.ts
- frontend/e2e/lead-route-creation.spec.ts
- frontend/e2e/ul-stop-completion.spec.ts
- frontend/.env.example
- docs/changelog/ops/2026-08-17-e2e-credential-wiring.md (this file)
