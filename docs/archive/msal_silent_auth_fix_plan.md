# MSAL Silent Auth Fix Plan (local dev → stable silent tokens)

Evidence reviewed
- [frontend/src/msalConfig.ts](/Users/adamyu/Desktop/Optimized_Life/baseline/fieldpro_pilot/frontend/src/msalConfig.ts)
- [frontend/src/auth/AuthContext.tsx](/Users/adamyu/Desktop/Optimized_Life/baseline/fieldpro_pilot/frontend/src/auth/AuthContext.tsx)
- [frontend/src/main.tsx](/Users/adamyu/Desktop/Optimized_Life/baseline/fieldpro_pilot/frontend/src/main.tsx)

Current behavior
- Interactive login uses `loginPopup` with scopes `openid profile email` + API scope.
- Silent refresh uses `acquireTokenSilent` with no explicit `redirectUri` override, so MSAL falls back to the app `redirectUri` (`http://localhost:5173` from msalConfig). That root URL is also registered for interactive auth.
- No dedicated silent callback page is configured; no `navigateToLoginRequestUrl` override is set (so it defaults to true).

Diagnosis
- Silent token requests are iframe-based to the root app URL. If the root page sends CSP, frames, or script redirects, Azure’s prompt=none iframe can be blocked, yielding the sandbox/top-navigation error even in a top-level tab.
- Using a lightweight, same-origin, static redirect page for silent auth avoids app boot logic and navigation restrictions.

Smallest safe fix plan
1) Add a dedicated silent callback page (static, same origin)
   - File: `frontend/public/auth-silent.html`
   - Content: minimal HTML that loads MSAL’s frame handler (no app bundle). Example skeleton:  
     ```html
     <!doctype html>
     <html>
     <head><meta charset="utf-8"><title>MSAL Silent Redirect</title></head>
     <body><script>/* empty: MSAL handles in hidden iframe */</script></body>
     </html>
     ```
   - Build output will emit this file unchanged and serve it at `http://localhost:5173/auth-silent.html`.

2) Update MSAL config to use silent-specific redirect
   - In `frontend/src/msalConfig.ts`, set:
     - `auth.redirectUri` stays as the interactive redirect (root or another page you prefer).
     - Add `auth.navigateToLoginRequestUrl: false` to prevent post-silent-iframe navigation to the original request URL on errors.
     - Use MSAL’s `redirectUri` per-request override for silent calls: `acquireTokenSilent({ ..., redirectUri: `${window.location.origin}/auth-silent.html` })`.

3) Update silent token call site
   - File: `frontend/src/auth/AuthContext.tsx`
   - In `getAccessToken`, pass `redirectUri: `${window.location.origin}/auth-silent.html`` inside `acquireTokenSilent`.

4) Azure App Registration changes
   - Add `http://localhost:5173/auth-silent.html` to the SPA redirect URIs list for the frontend application registration.
   - Ensure `http://localhost:5173` remains registered for interactive login (popup/redirect).

5) Optional hardening
   - If you prefer keeping root clean, also set `system: { allowRedirectInIframe: true }` only if required by your host environment; not needed when using a dedicated silent page.
   - Consider setting `cacheLocation: "localStorage"` already present; keep `storeAuthStateInCookie: false` unless you need IE/legacy support.

Exact edits (when implementing)
- Add file: `frontend/public/auth-silent.html` (minimal static HTML as above).
- Modify `frontend/src/msalConfig.ts`: add `navigateToLoginRequestUrl: false` under `auth` (or `system` per MSAL v2 signature: `auth.navigateToLoginRequestUrl`).
- Modify `frontend/src/auth/AuthContext.tsx`: in `acquireTokenSilent`, include `redirectUri: `${window.location.origin}/auth-silent.html``.

Outcome
- Silent auth will target a dedicated, allowed redirect URI that returns control to MSAL without loading the full app, avoiding sandbox/navigation conflicts and reducing chances of prompt=none failures in Chrome top-level tabs.
