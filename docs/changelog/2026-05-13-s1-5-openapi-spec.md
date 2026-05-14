# 2026-05-13 — S1-5 OpenAPI 3.0 Specification

## What changed
- Created `backend/src/middleware/auditActions.ts` — standalone export of `AUDIT_KNOWN_ACTIONS` (14 known actions) with no imports, safe to import from the generator without triggering the DB connection
- Created `backend/src/openapi/generate.ts` — swagger-jsdoc-based spec generator that: (1) validates the generated spec against OpenAPI 3.0.3 JSON schema, (2) checks that every registered route handler has a corresponding @openapi JSDoc block (exits 1 on gap), (3) cross-checks `x-audit-action` values against `AUDIT_KNOWN_ACTIONS`, (4) emits `backend/openapi/openapi.json` and `backend/openapi/openapi.yaml`
- Created `backend/src/openapi/specRouter.ts` — Express router serving `GET /api/openapi.json` from the committed spec file with `Cache-Control: public, max-age=300`
- Added `@openapi` JSDoc annotations to all 12 route files: `healthRoutes.ts`, `ulRoutes.ts`, `routeRunRoutes.ts`, `routeRunStopRoutes.ts`, `uploadRoutes.ts`, `devRoutes.ts`, `adminRoutes.ts` (including ccRouter control-center sub-router), `stopRoutes.ts`, `resourceRoutes.ts`, `opsRoutes.ts`, `routeOverrideRoutes.ts`, `tenantRoutes.ts`
- `adminRoutes.ts`: replaced inline `AUDIT_KNOWN_ACTIONS` declaration with `import { AUDIT_KNOWN_ACTIONS } from "../../middleware/auditActions"`
- Committed `backend/openapi/openapi.json` and `backend/openapi/openapi.yaml` — 53 paths documented
- Added `"openapi:generate": "ts-node src/openapi/generate.ts"` to `backend/package.json` scripts
- Mounted `specRouter` in `backend/src/app.ts`

## Why
- S1-5 security sprint requirement: document every API surface with its RBAC role, request/response shapes, and applicable audit action
- Coverage enforcement prevents silent spec drift when new routes are added without documentation
- Audit action cross-check ties the spec to the implementation-level action catalogue
- Public `GET /api/openapi.json` endpoint supports future Swagger UI, contract testing, and client SDK generation

## Files touched
- `backend/src/middleware/auditActions.ts` (created)
- `backend/src/openapi/generate.ts` (created)
- `backend/src/openapi/specRouter.ts` (created)
- `backend/openapi/openapi.json` (generated + committed)
- `backend/openapi/openapi.yaml` (generated + committed)
- `backend/src/routes/healthRoutes.ts`
- `backend/src/modules/work/ulRoutes.ts`
- `backend/src/modules/routes/routeRunRoutes.ts`
- `backend/src/modules/work/routeRunStopRoutes.ts`
- `backend/src/modules/work/uploadRoutes.ts`
- `backend/src/routes/devRoutes.ts`
- `backend/src/modules/admin/adminRoutes.ts`
- `backend/src/modules/work/stopRoutes.ts`
- `backend/src/modules/admin/resourceRoutes.ts`
- `backend/src/modules/ops/opsRoutes.ts`
- `backend/src/modules/routeOverrides/routeOverrideRoutes.ts`
- `backend/src/modules/admin/tenantRoutes.ts`
- `backend/src/app.ts`
- `backend/package.json`
