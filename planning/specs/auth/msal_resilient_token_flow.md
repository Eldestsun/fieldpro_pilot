# MSAL Resilient Token Flow — Implementation Note

Changes implemented
- Skip premature silent token calls when no account is present; guard added in `useTodayRoute` so fetches wait for an account.
- Added inflight token deduplication and interaction-required fallback:
  - `getAccessToken` now reuses a single in-flight promise per account.
  - Silent acquire uses `auth-silent.html`; on interaction-required errors, it falls back to `acquireTokenPopup` with the same scopes and sets the active account.
- `navigateToLoginRequestUrl` already set to false in `msalConfig` (unchanged for this step).

Key files touched
- `frontend/src/auth/AuthContext.tsx`
- `frontend/src/hooks/useTodayRoute.ts`
- (Reference) `frontend/src/msalConfig.ts`

Testing suggestions
- Start app at `http://localhost:5173`, sign in via popup, then force token refresh (network offline/online or wait for expiry) and confirm silent+popup fallback succeeds without sandbox/navigation errors.
- Verify `useTodayRoute` no longer errors before login and that API calls succeed post-login.
