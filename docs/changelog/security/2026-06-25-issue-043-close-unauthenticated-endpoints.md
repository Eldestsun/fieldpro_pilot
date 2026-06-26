# ISSUE-043 — Close the 4 unauthenticated endpoints (delete-or-gate)

**Date:** 2026-06-25
**Type:** Security / labor-safety (worker-identity non-surfacing) + endpoint authorization
**Issue:** ISSUE-043 (P1.5-Guarantee-Activation, Blocker). Source: `docs/audit/2026-06-24-enterprise-saas-readiness-audit.md` § Punch A3
**Branch:** `security/issue-043-close-unauth-endpoints` (off `origin/main` @ 15d29bb)

## Problem

The enterprise-SaaS readiness audit compiled the 63-route table and found **four
unauthenticated endpoints**, two of them materially dangerous:

1. `GET /route-runs/:id` — **no `requireAuth`**, and `resolveNumericOrgId` falls back to
   org #1 for anonymous callers. It returned `assigned_user.{oid,display_name,role}` +
   `created_by.{oid,display_name}` (`loadRouteRunById.ts`) — a direct worker-identity leak
   on an open endpoint. A correctly-gated twin (`GET /lead/route-runs/:id`, Dispatch/Admin)
   already existed and did the same job.
2. `POST /dev/generate-route-run` — no auth, **no env gate, writes the live DB**, and
   `devRoutes` was mounted unconditionally (`app.ts`).
3. `POST /routes/plan` — compute endpoint, no auth.
4. `POST /route-runs/preview` — compute endpoint, no auth.

Nothing is deployed and no real worker identities exist, so this was a reproducible
**defect on dev**, not a live leak — removed from the foundation before P2 surfaces build
on top of it.

## Phase 0 — caller recon (decided delete-vs-gate per endpoint)

Grepped every caller across frontend, backend, tests, and scripts (full path, path
fragment, and the `apiFetch` URL-assembly wrapper):

| Endpoint | Callers found | Verdict |
|----------|---------------|---------|
| `GET /route-runs/:id` (ungated) | **none** — UI's only detail call is `getLeadRouteRunById` → `/api/lead/route-runs/:id` (the gated twin). No test/script/UI path. | **DELETE** |
| `POST /dev/generate-route-run` | none (docs only) | **ENV-GATE the devRoutes mount** |
| `POST /routes/plan` | none (no `planRoute` usage in frontend) | **GATE** |
| `POST /route-runs/preview` | `previewRouteRun` (`routeRuns.ts`) → `useCreateRoute` — **already sends `Authorization: Bearer`** | **GATE** |

No endpoint's caller picture was ambiguous; no STOP condition triggered.

## Change

- **`routeRunRoutes.ts`**
  - **Deleted** the ungated `GET /route-runs/:id` route (handler + `@openapi` block),
    replaced with a tombstone comment documenting the removal and pointing at the twin.
  - **Gated** `POST /routes/plan` with `requireAuth, requireAnyRole(["Dispatch","Admin"])`.
  - **Gated** `POST /route-runs/preview` with `requireAuth, requireAnyRole(["Dispatch","Admin"])`
    (matches the `POST /route-runs` creation posture it supports).
  - Updated the two compute endpoints' `@openapi` blocks: `security: [AzureAD]` +
    `x-required-roles: [Dispatch, Admin]`.
  - **RIDER (naming breadcrumb):** added a comment on the surviving twin
    (`GET /lead/route-runs/:id`) documenting that `lead` is historical (predates the
    Lead→Dispatch rename), is an identifier not a description, is auth-required and
    Dispatch/Admin-gated, and is now the sole route-run detail endpoint. Not renamed —
    the frontend calls `/api/lead/route-runs/:id`; names are identifiers.
- **`app.ts`** — mount `devRoutes` only when `NODE_ENV !== 'production'`, mirroring the
  dev-auth-bypass gate directly above it. In production the dev routes (incl. the
  live-DB-write `generate-route-run`) are unmounted and unreachable.

No frontend changes: the UI already called the gated twin and an authed `preview`.

## Verification (pasted statuses; dev server `NODE_ENV=development DEV_AUTH_BYPASS=true` :4099, prod-mode `NODE_ENV=production` :4098)

**Anonymous — all four rejected, zero identity in any body:**

| Endpoint | Anon status |
|----------|-------------|
| `GET /route-runs/25` (deleted) | **401** (`{"error":"missing bearer token"}`) |
| `GET /lead/route-runs/25` (twin) | **401** |
| `POST /routes/plan` | **401** |
| `POST /route-runs/preview` | **401** |

`grep oid` across all four anon bodies → **no `oid` substring**. The deleted path returns
401 because no `GET /route-runs/:id` is registered anywhere now; the request falls through
to the pre-existing `exportDeleteRoutes.use(requireAuth, requireAdmin)` blanket guard — so
the bare path serves no route-run data at all.

**Authenticated — surviving twin `GET /lead/route-runs/25`, role contrast:**

| Role | Status | Identity resolves? |
|------|--------|--------------------|
| Specialist | **403** `{"error":"forbidden"}` | no |
| Dispatch | **200** | yes — `assigned_user.{oid,display_name,role}` + `created_by` present |
| Admin | **200** | yes |

Identity resolves only for callers that pass the Dispatch/Admin gate; it is unreachable
anonymously and forbidden to Specialist.

**Compute endpoints — anon vs authed:**

| Endpoint | Anon | Dispatch |
|----------|------|----------|
| `POST /routes/plan` | 401 | **200** (`{"ok":true,"distance_m":869.7,...}`) |
| `POST /route-runs/preview` | 401 | **200** (`{"ok":true,"total_stops":25,...}`) |

**devRoutes prod-mount guard (same anon request, two envs):**

| Env | `POST /dev/generate-route-run` |
|-----|-------------------------------|
| DEV (mounted) | **400** — handler runs, app-level `Route pool 'NONEXISTENT_POOL' not found` |
| PROD (unmounted) | **401** — falls through to the admin catch-all; the live-DB-write handler is never entered |

`tsc --noEmit` → exit 0.

## ISSUE-044 pairing

This dispatch is 043 only. The endpoints are left in a clean, testable state so the
companion runtime identity-leak regression test (ISSUE-044, Backlog) can assert against
them: anon → no populated `oid`; gated twin → Admin/Dispatch only.

## Files touched

- `backend/src/modules/routes/routeRunRoutes.ts`
- `backend/src/app.ts`
- `docs/changelog/security/2026-06-25-issue-043-close-unauthenticated-endpoints.md` (this file)
