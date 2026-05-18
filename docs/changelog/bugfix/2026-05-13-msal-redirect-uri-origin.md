# 2026-05-13 — MSAL redirectUri falls back to window.location.origin

## What changed
- In `frontend/src/msalConfig.ts`, the fallback for `redirectUri` (used when `VITE_REDIRECT_URI` is unset) changed from the hardcoded `http://localhost:5173` to `window.location.origin`.

## Why
- The hardcoded localhost fallback broke MSAL sign-in flows in any environment whose origin was not exactly `http://localhost:5173` — preview hosts, alternate dev ports, and future deployment targets all hit `redirect_uri_mismatch` from Entra.
- Using `window.location.origin` makes the dev/preview path work without forcing every contributor and deploy environment to set `VITE_REDIRECT_URI` manually, while production deployments can still pin an explicit URI via the env var.

## Files touched
- `frontend/src/msalConfig.ts`
- `docs/changelog/2026-05-13-msal-redirect-uri-origin.md`
