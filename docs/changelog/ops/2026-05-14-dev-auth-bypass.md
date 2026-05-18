# 2026-05-14 — DEV_TOKEN_INJECTION: dev-only auth bypass middleware

## What changed
- Added `backend/src/middleware/devAuthBypass.ts` — `createDevAuthBypass()` factory with three safety gates
- Mounted bypass in `backend/src/app.ts` before route handlers, guarded by `NODE_ENV !== 'production'`
- Added `'auth.dev_bypass'` to `AUDIT_KNOWN_ACTIONS` in `auditActions.ts`
- Documented `DEV_AUTH_BYPASS` in `backend/.env.example` with prominent production warning
- Added `backend/tests/canonical/devAuthBypass.test.ts` — 10 tests covering all gates and behaviours
- Added `docs/dev/dev-auth-bypass.md` — usage guide for curl, Playwright, and the axe audit script

## Why
- S1-8 (axe audit), S1-3, and S1-4 all require calling auth-gated endpoints locally without a full Entra OAuth flow
- The abandoned MSAL localStorage injection approach was fragile and auditor-indefensible
- The bypass must leave zero ambiguity about whether it can reach production (it cannot)

## Files touched
- `backend/src/middleware/devAuthBypass.ts` (new)
- `backend/src/app.ts`
- `backend/src/middleware/auditActions.ts`
- `backend/.env.example`
- `backend/tests/canonical/devAuthBypass.test.ts` (new)
- `backend/tests/run.ts`
- `docs/dev/dev-auth-bypass.md` (new)
- `docs/changelog/2026-05-14-dev-auth-bypass.md` (this file)
