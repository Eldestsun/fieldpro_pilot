# 2026-05-08 — Diagnostic session: Vite dedup, pool routing audit

## Summary
- Ran a full infrastructure and routing diagnostic against the running dev environment.
- Killed a stale duplicate Vite process that had been left over from an earlier session.
- Investigated a reported `/api/work/pools` 404 — confirmed it was a false-alarm test against a non-existent URL; the real frontend endpoints are correctly wired.
- Documented a pre-existing pools endpoint inconsistency (active-filter mismatch) for follow-up.

---

## Infrastructure health snapshot (as of 2026-05-08)

All services confirmed running:

| Service  | Transport        | Status |
|----------|------------------|--------|
| Postgres | Docker :5432     | Up     |
| MinIO    | Docker :9000/9001| Up     |
| OSRM     | Docker :5005     | Up     |
| Backend  | Node :4000       | Up — `GET /api/health` → `{"ok":true}` |
| Frontend | Vite :5173       | Up — HTTP 200 |

DB row counts (fieldpro_db):

| Table                   | Rows   |
|-------------------------|--------|
| core.locations          | 14,916 |
| core.observations       | 31     |
| core.visits             | 2      |
| core.evidence           | 0      |
| public.route_runs       | 1      |
| public.route_run_stops  | 4      |
| public.transit_stops    | 14,916 |
| public.assets           | 14,916 |

`core.evidence` being empty is expected — no photos uploaded yet.

---

## Fix: duplicate Vite process

Two Vite instances were running simultaneously (PIDs 48136/48159 started 11:44 PM, PID 52765 started 11:53 PM).

**Cause:** An earlier dev session was not cleanly shut down before a new `pnpm dev` was started.

**Action:** Killed the older Vite process and its npm parent (PIDs 48136, 48159). The newer instance (52765) was left running.

**Prevention:** Always stop the frontend dev server (`Ctrl-C`) before restarting. Consider adding a `predev` script to `frontend/package.json` that kills any process already on port 5173.

---

## Investigation: `/api/work/pools` false alarm

**Reported:** `GET /api/work/pools` returned 404 during diagnostic.

**Finding:** `/api/work/pools` is not a real route and is not called by the frontend. The test URL was incorrect. The actual endpoints are:

| Endpoint                          | File                                    | Roles        | Purpose                          |
|-----------------------------------|-----------------------------------------|--------------|----------------------------------|
| `GET /api/pools`                  | `modules/admin/resourceRoutes.ts`       | Lead, Admin  | Active-pools dropdown (frontend) |
| `GET /api/admin/pools`            | `modules/admin/adminRoutes.ts`          | Admin        | Admin CRUD read                  |
| `POST /api/admin/pools`           | `modules/admin/adminRoutes.ts`          | Admin        | Create pool                      |
| `PATCH /api/admin/pools/:id`      | `modules/admin/adminRoutes.ts`          | Admin        | Update pool                      |
| `DELETE /api/admin/pools/:id`     | `modules/admin/adminRoutes.ts`          | Admin        | Disable pool                     |
| `GET /api/ops/pools`              | `modules/ops/opsRoutes.ts`              | (ops open)   | Ops read-only view               |

All six return **401** without a valid token — not 404. Routing is correctly wired.

**Frontend callers:**
- `fetchPools()` → `GET /api/pools` — used by `AdminStopsPanel.tsx` and `useCreateRoute.ts` for pool dropdowns.
- `getAdminPools()` / `getOpsPools()` → `GET /api/admin/pools` or `/api/ops/pools` — used by `AdminPoolsPanel.tsx` via `getPoolsScoped()`.
- `createAdminPool` / `updateAdminPool` / `disableAdminPool` → `POST/PATCH/DELETE /api/admin/pools`.

**No fix required.**

---

## Known issue (pre-existing, not introduced today): pools active-filter mismatch

`GET /api/pools` (resourceRoutes) queries directly with `WHERE active = true`, returning only active pools.

`GET /api/admin/pools` and `GET /api/ops/pools` both delegate to `poolService.getAllPools()`, which likely returns all pools including inactive ones.

**Risk:** If an admin deactivates a pool, it disappears from stop/route-creation dropdowns (`/api/pools`) but remains visible in the Admin Pools Panel and Ops view (`/api/admin/pools`, `/api/ops/pools`). This is consistent within each view but may cause confusion.

**Recommended fix:** Standardize all three GET endpoints on `poolService.getAllPools()` and let each caller pass an `active` filter param, or explicitly document the intent of each endpoint in code. Not urgent — defer until pool management is actively used in the pilot.
