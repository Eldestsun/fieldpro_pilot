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

Day 2–4 — Core Data & Routing (Stops, Route Pools, OSRM Trip Planning)

Date: 2025-11-24 to 2025-11-25
Owner: Adam Tupuola

Goals
	•	Import and normalize transit stop data into Postgres.
	•	Define schema for core operational tables:
	•	stops
	•	route_pools
	•	clean_logs
	•	route_runs
	•	route_run_stops
	•	Integrate OSRM for optimized stop ordering and drive-time estimation.
	•	Expose backend APIs to:
	•	Preview optimized routes.
	•	Persist assigned “route runs” for field crews.
	•	Load a user’s “today’s route” in a single API call.

⸻

Actions Performed

Data & Schema

Stops Table

Created a generalized stops table using generic, agency-neutral fields:
	•	stop_id (TEXT PK)
	•	street_name
	•	cross_street
	•	intersection_location
	•	bearing
	•	district_code (route pool mapping)
	•	number_of_shelters
	•	lon / lat
	•	is_hotspot
	•	has_compactor
	•	has_trash_receptacle
	•	notes (TEXT)
	•	metadata (JSONB for agency-specific fields)

A CSV cleaning script:
	•	reads a raw export from an agency’s GIS / stop inventory system
	•	filters inactive or unsupported stops
	•	emits a normalized stops.cleaned.csv
	•	loads data via \copy

All agency-specific attributes are stored under metadata rather than top-level columns.

⸻

Route Pools

Created route_pools as a flexible grouping system for stops:
	•	id (TEXT PK)
	•	label (TEXT)
	•	district_code (TEXT)
	•	active (BOOLEAN DEFAULT true)
	•	default_max_minutes (INT, nullable)
	•	created_at / updated_at

Seeded with a minimal set of pools derived from imported stop data.
This is a placeholder; real pool definitions can be created later (districts, beats, zones, etc.).

Added:
	•	stops.pool_id column
	•	Foreign key from stops.pool_id → route_pools.id
	•	Index on stops(pool_id)

⸻

Clean Logs & Route Runs

clean_logs

Stores per-stop cleaning actions:
	•	id BIGSERIAL PK
	•	route_run_stop_id (FK)
	•	stop_id (FK)
	•	user_id (numeric placeholder)
	•	cleaned_at (default now)
	•	duration_minutes
	•	litter_picked
	•	trash_emptied
	•	shelter_washed
	•	pad_washed

route_runs

Represents a generated or assigned route:
	•	id BIGSERIAL PK
	•	user_id
	•	route_pool_id (FK)
	•	base_id (FK)
	•	run_date (TIMESTAMPTZ)
	•	status (planned, in_progress, completed)
	•	total_distance_m
	•	total_duration_s
	•	created_at / updated_at

route_run_stops

Represents ordered stops within a run:
	•	id BIGSERIAL PK
	•	route_run_id (FK)
	•	stop_id (FK)
	•	sequence (INT)
	•	planned_distance_m
	•	planned_duration_s
	•	created_at / updated_at

⸻

Bases (Facility/Yard Locations)

Created a generic bases table:
	•	id TEXT PK
	•	name TEXT
	•	lat DOUBLE PRECISION
	•	lon DOUBLE PRECISION

Seeded with two example bases representing two service yards in the region.

⸻

OSRM Routing Integration

Configured OSRM inside Docker:
	•	Host: http://localhost:5005
	•	Container: http://fieldpro_osrm:5000

Verified functionality by calling /trip/v1/driving with real stop coordinates.

Implemented osrmClient.ts:

planRouteWithOsrm(stops)
	•	Builds OSRM trip request
	•	Forces start at first stop, no round-trip
	•	Returns:
	•	distance_m (total)
	•	duration_s (drive time only)
	•	ordered_stops (OSRM-optimized)
	•	legs[] (per-hop distances/times)

⸻

Backend APIs Implemented

POST /api/routes/plan
	•	Playground endpoint
	•	Input: { stop_ids: string[] }
	•	Returns optimized route without storing anything.

POST /api/route-runs/preview
	•	Same as above
	•	Framed for previewing future runs
	•	No database writes.

POST /api/route-runs

Creates a real, persistent user route.

Steps:
	1.	Validate input
	2.	Look up stop coordinates
	3.	Run OSRM optimization
	4.	Insert:
	•	1 row into route_runs
	•	N rows into route_run_stops (ordered)
	5.	Return full OSRM details + database IDs

Helper: loadRouteRunById(id)

Returns:
	•	route metadata
	•	ordered stops with:
	•	location
	•	street_name / cross_street
	•	intersection info
	•	bearing
	•	number_of_shelters
	•	hotspot/compactor/trash flags
	•	metadata

GET /api/route-runs/:id

Returns full expanded route.

GET /api/ul/todays-run

Temporary development mode:
	•	Auth bypassed for rapid iteration
	•	Accepts user_id
	•	Returns latest run for current date

⸻

Frontend Integration (Early Preview)

Basic “Today’s Route” screen:
	•	Calls /api/ul/todays-run?user_id=123
	•	Renders:
	•	Total number of stops
	•	Drive distance (meters → miles)
	•	Drive time
	•	List of stops with:
	•	stop_id
	•	street_name
	•	cross_street
	•	intersection_location
	•	bearing
	•	coordinates

⸻

Defaults & Interpretation Notes
	•	OSRM duration is drive time only.
Cleaning/dwell time will be added in post-pilot enhancements.
	•	First stop always has NULL planned distance/time because no preceding hop exists.

⸻

Compliance & Audit Notes
	•	Environment is local-only (no external access).
	•	No real employees or PII; user_id uses numeric placeholders.
	•	Schemas documented in build log for audit trail.

⸻

Deviations vs 24-Day Plan
	•	Nightly distance matrix + OR-Tools deferred (OSRM is sufficient for pilot).
	•	Route pools seeded only from available district/group data; refinements later.
	•	Auth temporarily disabled for UL endpoints during development (tracked in deviations log).