# 2026-05-13 — Tier 8 Change 4: tenant configuration API

## What changed
- Added `backend/src/domains/asset/assetService.ts` — service-layer CRUD for `core.asset_types`, `core.observation_type_registry`, and `public.assets` (org-scoped, RLS via `withOrgContext`).
- Added `backend/src/modules/admin/tenantRoutes.ts` with five admin-only endpoints under `/api/admin/tenant`:
  - `GET  /asset-types` — list asset types for org
  - `POST /asset-types` — create / upsert an asset type
  - `GET  /observation-types?asset_type_id=` — list observation types for an asset type
  - `POST /observation-types` — bulk upsert observation type registry rows
  - `POST /seed-assets` — multipart CSV upload that populates `public.assets` (org_id, asset_type_id, seed_key/external_id, display_name, lat, lon, attributes)
- Mounted tenant router in `backend/src/app.ts` at `/api/admin/tenant`.
- Org context resolved from `X-Org-Id` header (or `?org_id=` query param); all writes go through `withOrgContext` for RLS isolation.

## Why
- Onboarding agency two cannot require code changes. This API is the admin surface a new tenant uses to declare its asset types, configure observation types per type, and load its asset inventory.
- Keeping all writes in `assetService.ts` enforces the rule that route handlers never touch canonical write paths directly; `observationService.ts`, `visitService.ts`, and `riskMapService.ts` remain untouched by this change.

## Files touched
- `backend/src/domains/asset/assetService.ts` (new)
- `backend/src/modules/admin/tenantRoutes.ts` (new)
- `backend/src/app.ts`
- `docs/changelog/2026-05-13-tier-8-change-4-tenant-routes.md` (this file)
