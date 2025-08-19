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

