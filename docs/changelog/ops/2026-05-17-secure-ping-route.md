# 2026-05-17 — Verify /api/secure/ping endpoint and MSAL silent-renewal path

## What changed
- No code changes required — this is a verification entry.
- Confirmed that `GET /api/secure/ping` exists in `backend/src/routes/healthRoutes.ts` (line 117), is behind `requireAuth`, returns `{ ok: true, user, roles }`, and does no DB work.
- Confirmed that `healthRoutes` is mounted at `/api` in `backend/src/app.ts` (line 40), making the full path `/api/secure/ping` reachable.
- Confirmed that `frontend/public/auth-silent.html` is correctly a minimal MSAL silent-renewal redirect target — it carries no JavaScript and must not call the ping endpoint. MSAL processes the `prompt=none` iframe response itself.
- Confirmed that the actual ping call originates from `AuthContext.tsx:91` using the relative path `/api/secure/ping`, which is proxied to `http://localhost:4000` by Vite in dev and to `http://backend:4000` by nginx in production.

## Why
- Bug report described 185+ `GET /api/secure/ping` 404s per login session and suspected a missing backend route. Investigation showed the route has been present since the initial commit.
- The retry loop is a side effect of the frozen `AuthContext.tsx` retry pattern: if ping returns non-ok (because the backend is unreachable during a cold start), `setMe(null)` re-triggers the effect. The cold-start 502 mitigation (nginx timeout increases, commit `b72091d`) is the structural fix for the upstream condition.
- `auth-silent.html` does not need JavaScript; adding MSAL or a ping call there would be incorrect and could interfere with the `prompt=none` iframe handshake.

## Files touched
- `docs/changelog/2026-05-17-secure-ping-route.md` (this file)
