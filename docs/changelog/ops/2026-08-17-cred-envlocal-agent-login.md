# 2026-08-17 — CRED-ENVLOCAL: agent test-login env pattern + verified personas

## What changed
- `backend/.env.example`: new **Agent test login** section — the agent tests the
  app through the dev-auth-bypass path (agent/terminal only; founder stays on
  real Entra per `CLAUDE.md § Dev Auth Bypass`), with four documented persona
  keys (`AGENT_TEST_{SPECIALIST,DISPATCH,ADMIN}_OID`, `AGENT_TEST_ORG_ID`) as
  the single source for API tests and browser automation. Bypass identities are
  synthetic strings, not secrets; they function only under the bypass gates.
- `frontend/.env.example`: documented the **real-Entra E2E** keys
  (`E2E_BASE_URL`, `E2E_{LEAD,UL}_USER_{EMAIL,PASSWORD}`) read by the two
  MSAL-flow e2e specs — commented out, values FOUNDER-FILLED ONLY in gitignored
  env, never committed or pasted into chat.
- Local (gitignored, not committed): persona values populated in
  `backend/.env`; `frontend/.env.local` already carried `VITE_DEV_AUTH_BYPASS`.

## Why
- Founder ruling on the CRED-ENVLOCAL dispatch (2026-08-17): establish the
  agent login so app functionality can be tested ahead of shadow testing.
  Phase-0 recon (2026-08) had found the ignore rules and example manifests
  already largely in place; the missing pieces were the standardized personas,
  the tracked key manifest, and a live proof.
- GUARD-DEVBYPASS context honored: the bypass is env-gated (FAIL-OPEN verdict),
  which is acceptable for local dev only — its hardening card is sequenced
  before shadow go-live (gated on SHADOW-ENV).

## Verification (live, 2026-08-17)
- Backend dev server (`NODE_ENV=development`, bypass banner emitted) +
  Vite frontend (`ready in 419ms`; `/` 200; `/api/health` through proxy 200).
- All three personas authenticate: `/api/secure/ping` → **200** with correct
  roles (`Specialist`, `Dispatch`, `Admin`).
- Role guards bind on bypass identities: `/api/ops/route-runs` → **403** as
  Specialist, **200** as Dispatch. Anonymous (no headers) → **401**.

## Files touched
- backend/.env.example
- frontend/.env.example
- docs/changelog/ops/2026-08-17-cred-envlocal-agent-login.md (this file)
