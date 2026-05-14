# 2026-05-14 — Frontend dev auth bypass (FRONTEND_DEV_AUTH_BYPASS)

## What changed
- Added `frontend/src/auth/devAuthBypass.ts` — three-gate bypass module that reads `localStorage.__dev_user__` and constructs a synthetic MSAL `AccountInfo` + pre-built `me` payload
- Modified `frontend/src/auth/AuthContext.tsx` — five surgical insertions: import, `useRef(getDevAuthBypass()).current`, lazy `me` state init, `account` override, `getAccessToken` early return
- Added `frontend/src/auth/devAuthBypass.test.ts` — 6 vitest unit tests covering all three gates plus valid/invalid payload cases
- Updated `frontend/.env.example` — added `VITE_DEV_AUTH_BYPASS=false` with warning comment
- Updated `docs/dev/dev-auth-bypass.md` — added Frontend bypass section with enable instructions, localStorage key format, Playwright snippet, and safety gate documentation

## Why
- S1-8 (axe-core accessibility audit) requires reaching authenticated surfaces in Playwright without a real Azure AD session
- The frontend React router blocks protected routes at the MSAL `isSignedIn` check before backend auth is relevant; `page.setExtraHTTPHeaders` alone cannot satisfy it
- Symmetrical to the backend `devAuthBypass.ts` middleware already in place

## Files touched
- `frontend/src/auth/devAuthBypass.ts` (new)
- `frontend/src/auth/devAuthBypass.test.ts` (new)
- `frontend/src/auth/AuthContext.tsx` (modified)
- `frontend/.env.example` (modified)
- `docs/dev/dev-auth-bypass.md` (modified)
