# MSAL Local Auth Diagnostic — Sandbox navigation error

Problem statement  
Local login fails with browser console error: “Unsafe attempt to initiate navigation for frame with origin 'http://localhost:5173' … the frame attempting navigation of the top-level window is sandboxed, but the flag of 'allow-top-navigation' … is not set.”

What the app does now (evidence)
- MSAL is initialized with `PublicClientApplication(msalConfig)` in [frontend/src/main.tsx](/Users/adamyu/Documents/Projects/fieldpro_pilot/frontend/src/main.tsx).
- Config uses redirect-based defaults with popup login: `instance.loginPopup({ scopes })` in [frontend/src/auth/AuthContext.tsx](/Users/adamyu/Documents/Projects/fieldpro_pilot/frontend/src/auth/AuthContext.tsx).
- Tokens are fetched with `acquireTokenSilent` using the active account [frontend/src/auth/AuthContext.tsx](/Users/adamyu/Documents/Projects/fieldpro_pilot/frontend/src/auth/AuthContext.tsx).
- MSAL config values come from env: tenant/client IDs and `redirectUri` default to `http://localhost:5173` [frontend/src/msalConfig.ts](/Users/adamyu/Documents/Projects/fieldpro_pilot/frontend/src/msalConfig.ts).
- No `handleRedirectPromise` or redirect flow is wired; popup is the only interactive path.

Why the sandbox error appears
- The app is likely being opened inside a sandboxed iframe (e.g., IDE preview/webview). That iframe lacks `allow-top-navigation` / `allow-popups`. When MSAL opens the Azure login page, the IdP tries to navigate/top-redirect, which the sandbox blocks, producing the reported error. The code itself assumes a normal browser window and does not attempt to run inside a sandboxed frame.

Will a normal browser fix it?
- Yes. Running `npm run dev` (Vite) and opening `http://localhost:5173` in a standard browser tab should allow MSAL’s popup to navigate to Azure without sandbox restrictions.

Code/config hardening options (do not change yet)
- Add `system: { allowRedirectInIframe: true }` only if you intentionally need iframe embedding; otherwise keep it off and document “must open in full browser.”
- Force popup to open in parent by ensuring the host environment allows `window.open`; if running inside an iframe that cannot open popups, add guidance to open in external browser instead of IDE preview.
- Consider enabling `redirect` flow as a fallback (`loginRedirect`) plus `handleRedirectPromise` on app bootstrap if popups are blocked, but this will still fail inside a sandboxed iframe without the right `allow-*` flags.
- Document required allowed origins/redirect URIs and avoid committing localhost values to shared `.env`; use env per developer to prevent mismatched redirect URIs.

Conclusion
- Current flow: popup-based MSAL login + silent token acquisition.
- Root cause: sandboxed host frame blocks top-level navigation from the Azure login page.
- Recommended developer action: run the app in a regular browser (not IDE/webview). If iframe embedding is required, loosen the sandbox (`allow-top-navigation-by-user-activation` and `allow-popups`) or switch to a redirect flow and enable `allowRedirectInIframe`, understanding the security trade-offs.
