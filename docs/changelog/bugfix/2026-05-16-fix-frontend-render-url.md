# 2026-05-16 — Update frontend Render URL to actual deployed hostname

## What changed
- `frontend/.env.example`: updated commented `VITE_REDIRECT_URI` example from
  `https://baseline-frontend.onrender.com` to `https://baseline-frontend-9dad.onrender.com`
- `docs/ops/render-deploy.md`: updated the frontend verification URL in Step 4
  from the generic placeholder to `https://baseline-frontend-9dad.onrender.com`

## Why
- Render assigned `baseline-frontend-9dad.onrender.com` as the actual service URL.
  The codebase used generic placeholder URLs without the hash suffix. The runbook
  and .env.example example value were updated to match the real deployed URL.
- `msalConfig.ts` uses `window.location.origin` as the redirect URI fallback —
  no code change needed there.
- The backend URL hash is not yet confirmed; `render.yaml` BACKEND_URL retains
  its placeholder form pending verification in the Render dashboard.

## Files touched
- `frontend/.env.example`
- `docs/ops/render-deploy.md`
- `docs/changelog/2026-05-16-fix-frontend-render-url.md` (new)
