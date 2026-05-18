# 2026-04-04 — MSAL resilient token flow and silent callback

## Summary
- Stabilized MSAL token acquisition by using silent-first with popup fallback and deduping concurrent requests.
- Added a dedicated silent redirect page for prompt=none flows.
- Prevented crashes when AuthContext is missing by returning a safe fallback.

## Changes
- Added `frontend/public/auth-silent.html` for silent iframe responses.
- Updated `frontend/src/auth/AuthContext.tsx` to:
  - Deduplicate in-flight `acquireToken` calls per account.
  - Fall back to `acquireTokenPopup` on interaction-required errors.
  - Guard against missing AuthProvider to avoid runtime throw.
- Updated `frontend/src/hooks/useTodayRoute.ts` to avoid token fetch before an account exists.
- Confirmed `navigateToLoginRequestUrl` is disabled in `frontend/src/msalConfig.ts` to prevent unwanted navigation.

## Notes
- Azure App Registration must include `http://localhost:5173/auth-silent.html` as a SPA redirect URI (interactive `http://localhost:5173` remains).
- Tests not run; recommended manual check: sign in via popup, force token refresh, verify silent flow succeeds without sandbox errors, and `/api/secure/ping` works post-refresh.
