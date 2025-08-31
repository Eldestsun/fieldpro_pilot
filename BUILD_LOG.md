# 📝 FieldPro Pilot — Build Log

## Day 0 — Foundation Online

**Date:** 2025-08-19
**Owner:** Adam Tupuola

### Goals

* Bring up local infra (Postgres, MinIO, OSRM).
* Stand up minimal Express TS API with health check.
* Run Vite React app and verify frontend → backend call via proxy.
* Establish stable dev port map.

### Actions Performed

* Started Docker services:

  * **Postgres** (5432:5432)
  * **MinIO** (9000:9000, 9001:9001)
  * **OSRM** built from `seattle.osm.pbf` (host **5005** → container 5000; `platform: linux/amd64` on Apple Silicon)
* Built OSRM dataset:

  * Ran `osrm-extract`, `osrm-partition`, `osrm-customize` on `seattle.osm.pbf`.
* Created backend (Express + TypeScript) with **`GET /api/health`**.
* Resolved port 5000 conflict (macOS Control Center) by running API on **4000**.
* Configured Vite dev proxy (`/api` → `http://localhost:4000`) and added test UI to fetch health JSON.

### Verification Evidence

* **OSRM** route test (returns `"code":"Ok"`):

  ```bash
  curl "http://localhost:5005/route/v1/driving/-122.3355,47.6080;-122.3035,47.5490?overview=false"
  ```
* **Backend** health:

  ```bash
  curl http://localhost:4000/api/health
  # → {"ok":true,"service":"fieldpro-backend"}
  ```
* **Frontend**: App at `http://localhost:5173` displays backend JSON:

  ```
  {"ok":true,"service":"fieldpro-backend"}
  ```

### Final Port Map (Dev)

* **API**: 4000
* **OSRM**: 5005 (host) → 5000 (container)
* **Postgres**: 5432
* **MinIO**: 9001 (console), 9000 (S3 API)

### Compliance & Evidence Notes

* Repo private; `.env` not committed (least-privilege).
* Local-only services; no public exposure.
* Build log established for audit trail (AC/AU controls).

### Risks / Blockers

* macOS Control Center auto-binds 5000 (API intentionally on 4000).
* OSRM must be rebuilt if the PBF region changes.

## Day 1 – AuthN/AuthZ baseline (Azure Entra + RBAC)

**Scope:** Pilot Build Plan Day-1 (Auth wiring for SPA + API)

### What we implemented
- **Frontend**
  - MSAL v2 config (`frontend/src/msalConfig.ts`) using tenant + SPA client ID.
  - `AuthProvider` (MSAL wrapper) and updated `App.tsx`:
    - Sign-in / Sign-out (popup)
    - Health probe via `/api/health`
    - Token acquisition + call to `/api/secure/ping` (identity echo)
    - Admin-only test button calling `/api/admin/secret`
- **Backend**
  - JWT validation via **JWKS** (`authz.ts`) against Entra v2 issuer.
  - Accepted audiences: `<API client id>` and `api://<API client id>`.
  - **Local request typing** (`AuthedRequest`) for `req.user`/`req.roles`.
  - Role extraction from `roles` claim (App Roles) and optional `groups` → role mapping.
  - Routes:
    - `GET /api/health`
    - `GET /api/secure/ping` (auth required; returns claims + roles)
    - `GET /api/me` (alias of the above)
    - `GET /api/admin/secret` (auth + `Admin` role)
- **Entra ID (Dev tenant)**
  - App registrations:
    - **FieldPro API Dev** (exposed API, scope `access_as_user`, App Roles: `Admin`, `Lead`, `UL`)
    - **FieldPro SPA Dev** (redirect URI `http://localhost:5173`)
  - User assigned **Admin** app role for testing.

### Environment
- `frontend/.env.local`
  - `VITE_AZURE_TENANT_ID=<tenant>`
  - `VITE_AZURE_CLIENT_ID=<SPA client id>`
  - `VITE_REDIRECT_URI=http://localhost:5173`
  - `VITE_API_APP_ID_URI=api://<API client id>`
- `backend/.env`
  - `AZURE_TENANT_ID=<tenant>`
  - `AZURE_API_AUDIENCE=<API client id>`  # GUID only
  - `APP_ROLE_ADMIN=Admin`, `APP_ROLE_LEAD=Lead`, `APP_ROLE_UL=UL`

### Verification (local)
1. **Backend**: `pnpm dev` → `curl http://localhost:4000/api/health` → `{"ok":true,"service":"fieldpro-backend"}`
2. **Frontend**: `pnpm dev` → `http://localhost:5173`
3. Click **Sign in with Microsoft** → consent → **Refresh identity**  
   Expect JSON with `iss`, `aud`, `roles: ["Admin"]`.
4. Click **Call /api/admin/secret** → `200` with `{"secret":"admins only", ...}`.

### Compliance notes (pilot gates)
- **AC/IA**: SSO via Entra ID; bearer tokens validated with issuer & audience; App Roles enforce least-privilege.
- **AU**: Minimal authz audit lines; no tokens logged.
- **CM**: Secrets kept in `.env` (ignored by git); audience/issuer pinned.
- **WCAG 2.1 AA**: Basic UI; no blockers introduced.  
- **TLS/at-rest**: Local dev; production deploy will enforce TLS 1.2+ and AES-256 at rest (per checklist).

### Known follow-ups
- Map real County groups → roles (if groups are used).
- Add protected API surfaces for actual Pilot features (Day 2+).
