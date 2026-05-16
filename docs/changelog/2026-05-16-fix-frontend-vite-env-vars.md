# 2026-05-16 — Fix frontend VITE_ env vars baked into Docker build

## What changed
- `frontend/Dockerfile`: added `ARG` + `ENV` declarations for
  `VITE_API_APP_ID_URI`, `VITE_AZURE_TENANT_ID`, and `VITE_AZURE_CLIENT_ID`
  immediately before `pnpm run build`, so Vite sees them during compilation.
  Staging values are hardcoded as ARG defaults; any can be overridden with
  `--build-arg` at build time.
- `frontend/.env.example`: documented all required and optional `VITE_*`
  variables with descriptions. Previously only `VITE_ENABLE_OTEM` and
  `VITE_DEV_AUTH_BYPASS` were listed; the three Azure/MSAL vars were absent.

## Why
- The deployed frontend was sending `"undefined/access_as_user"` as the MSAL
  scope. `VITE_API_APP_ID_URI` (and the other two) are baked in at Vite build
  time via `import.meta.env.VITE_*`. They were never set in the Docker build
  environment, so Vite substituted `undefined`.
- Render does not support `buildArgs` in `render.yaml` for Docker services,
  so the values must be declared in the Dockerfile itself.

## Files touched
- `frontend/Dockerfile`
- `frontend/.env.example`
- `docs/changelog/2026-05-16-fix-frontend-vite-env-vars.md` (new)
