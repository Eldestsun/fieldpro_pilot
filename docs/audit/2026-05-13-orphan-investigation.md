# 2026-05-13 — Orphan Table Investigation (R11 Change 5)

> Investigation of four orphan-table candidates flagged by the 2026-05-13 schema audit.
> Each table evaluated against three checks: row count, incoming FKs, backend references.
> A table is SAFE TO DROP only if it has 0 rows AND no incoming FKs AND no backend references.

---

## Summary

| Table | Rows | Incoming FKs | Backend refs | Decision |
|-------|-----:|--------------|--------------|----------|
| `public.lead_route_overrides` | 0 | none | `routeOverrideService.ts` (SELECT/INSERT/DELETE) | **KEEP** |
| `public.route_run_audit` | 0 | none | none | **DROP** |
| `public.stops_legacy` | 14,916 | none | none | **KEEP** (has data) |
| `public.asset_types` | 1 | `public.assets.asset_type_id` | `assetService.ts`, `observationService.ts`, `tenantRoutes.ts` | **KEEP** |

Net result: one safe drop (`public.route_run_audit`). The remaining three are load-bearing in some way and must stay.

---

## `public.lead_route_overrides`

- **Row count**: 0
- **Incoming FKs**: none
- **Backend references**: `backend/src/domains/routeRun/routeOverrideService.ts` — live read/write paths at lines 31 (SELECT), 50 (INSERT), 76 (DELETE).
- **Decision**: **KEEP**

The table is empty today but is the active backing store for `routeOverrideService` (the FORCE_INCLUDE / FORCE_EXCLUDE / PRIORITY_BUMP overrides consumed by `getCandidateStopsForPoolWithRisk` in `routeRunService.ts`). Dropping it would break route planning the moment a Lead saves an override. The 0-row count just reflects that no overrides have been authored yet — not that the feature is dead.

---

## `public.route_run_audit`

- **Row count**: 0
- **Incoming FKs**: none
- **Backend references**: none (`grep -r "route_run_audit" backend/src/ --include="*.ts" -l` returns nothing)
- **Decision**: **DROP**

Audit spec called this out as having a UUID/bigint FK mismatch making it non-functional. Confirmed: empty, unreferenced, no constraints depend on it. Safe to drop.

---

## `public.stops_legacy`

- **Row count**: 14,916
- **Incoming FKs**: none
- **Backend references**: none
- **Decision**: **KEEP**

The table has 14,916 rows of historical stop data. Even though no backend code or FK touches it, dropping a populated table on a one-line investigation is the wrong call — the data may be needed for backfill verification, audit trail comparison against the post-Phase-5c `transit_stops` table, or simply as a rollback safety net. Re-evaluate only after `transit_stops` is confirmed stable in production and a deliberate decision is made to discard the legacy snapshot.

---

## `public.asset_types`

- **Row count**: 1
- **Incoming FKs**: `public.assets.asset_type_id REFERENCES public.asset_types(id)`
- **Backend references**: 
  - `backend/src/domains/asset/assetService.ts` — joins `public.asset_types pat ON pat.code = cat.type_key` to translate `core.asset_types.id` → `public.asset_types.id` for `public.assets.asset_type_id` (see lines 165–180, explicitly documented as the bridge pattern)
  - `backend/src/domains/observation/observationService.ts` — same bridge pattern at lines 130–142
  - `backend/src/modules/admin/tenantRoutes.ts` — references via `assetService.listAssetTypes`
- **Decision**: **KEEP**

`core.asset_types` does **not** fully replace `public.asset_types`. The current architecture deliberately keeps both: `core.asset_types` is the per-org canonical type registry, and `public.asset_types` is the legacy global type table that `public.assets.asset_type_id` still FKs to. `assetService.ts` explicitly bridges between them by joining on `type_key = code`. Until `public.assets.asset_type_id` is migrated to reference `core.asset_types` (a future tier), `public.asset_types` must remain.

---

## Action

Execute `DROP TABLE IF EXISTS public.route_run_audit;` directly (no migration file — R11 spec says drops happen inline once verified safe, and there are no consumers to coordinate with).

Verify migration runner still passes clean afterward.
