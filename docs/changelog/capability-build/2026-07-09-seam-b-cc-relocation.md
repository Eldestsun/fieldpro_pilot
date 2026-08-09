# 2026-07-09 — SEAM-B: Control Center relocation to Dispatch

**Branch:** `feat/seam-b-cc-relocation` · **Type:** Feature (capability build)
**Gate:** SEAM-A on origin/main (PR #83, merge `a140f0c`) · **Source:** SEAM-B dispatch (operator-authored)
**Commits:** 92d1f22 (B1a), fe31ca4 (B1b), 6977c5b (B2), eac33bc (B3)

The Control Center relocates from Admin-only `/admin/control-center` to Dispatch-visible
`/ops/control-center`, guarded `["Dispatch","Admin"]` — the established admin→ops widening
pattern, mirroring the dashboard/pools/stops split. Dispatch gains the operational
dashboards; Admin access is retained. `authz.ts` was **not** touched (the guard reuses the
existing `requireAnyRole` allow-list). Backend handlers moved **byte-identical** — only the
mount point and guard changed. Time renders as location/route intelligence throughout,
never per-worker; no identity in any of the four payloads (proven, see B3).

**Inventory correction:** DISCOVERY-D0 listed three CC handlers; there are **four**. The
`/difficulty` handler existed and is carried in the relocation. Its RIDER cleared before any
move: `/difficulty` reads only canonical (`core.*`) + `public.stops` labels — no clipped
adapter table, no identity, time grouped by location/pool (never per-worker).

## B1a — byte-identical backend extraction (92d1f22)

`ccRouter` (all four handlers: `/overview`, `/routes`, `/exceptions`, `/difficulty`) extracted
from `backend/src/modules/admin/adminRoutes.ts` into a new
`backend/src/modules/admin/controlCenterRoutes.ts`, mounted in `app.ts` at
`/api/ops/control-center`. The **only** changed line inside the moved block is the guard:
`ccRouter.use(requireAuth, requireAdmin)` → `requireAuth, requireOps` where
`requireOps = requireAnyRole(["Dispatch","Admin"])`. Proven byte-identical by `diff` of the
original vs extracted handler bodies (the guard line was the sole delta).

Also moved with the handlers: the local `SAFETY_HAZARD_OBSERVATION_TYPES` const (used by
`/overview`), which lived just above the block in `adminRoutes.ts`. The now-unused
`presenceTaxonomy` import and the `requireAdmin`-mount left `adminRoutes.ts`; `requireAdmin`
itself stays (other handlers use it). The old `/api/admin/control-center` mount is **removed**
(404, not served) — the frontend handles muscle-memory via redirect (B2).

New tests: `controlCenterRelocation.test.ts` — all four endpoints: Dispatch→200, Admin→200,
Specialist→403, anon→401; plus the old `/api/admin/control-center` mount is retired (404).
`ccExceptionsCanonical.test.ts` and the `runtimeIdentityLeak` CC probes repointed to the new
path. Registered in `tests/run.ts`.

## B1b — annotation retruth (fe31ca4)

Annotation-only pass over `controlCenterRoutes.ts` (no logic change; the B1a diff stayed a
pure move by keeping annotations for a separate commit): `@openapi` paths
`/admin/control-center/*` → `/ops/control-center/*`, `x-required-roles: [Admin]` →
`[Dispatch, Admin]`, `@openapi tags: [Admin]` → `[Ops]`, and the `console.error` log-path
strings `/api/admin/...` → `/api/ops/...`. The one historical `/admin/control-center` mention
(the relocation header comment) is kept by design — it documents the old path.

## B2 — frontend relocation (6977c5b)

- New route `/ops/control-center` guarded `RequireRole ["Dispatch","Admin"]` → `<AdminControlCenter />`
  (component name retained; **no scope prop** — a single surface for both audiences, unlike the
  scope-split dashboard/pools/stops).
- Old `/admin/control-center` retires with a `<Navigate to="/ops/control-center" replace />`
  redirect so bookmarks / muscle-memory land on the live route.
- The **"Control Center" nav link moved into the Dispatch section** (desktop + mobile); the
  Admin link repointed to `/ops/control-center`. Both audiences now navigate to the same path.
- `AdminControlCenter`'s four hardcoded fetches repointed `/api/admin/...` → `/api/ops/...`.
- New `App.controlCenter.test.tsx`: guard render (Dispatch+Admin allow, Specialist bounce),
  the retired-path redirect (Admin + Dispatch), and nav-per-role (link Dispatch-visible,
  pointing at `/ops/control-center`, never shown to a Specialist). Frontend suite 37 → 45.

## B3 — audience-widening labor-safety re-scan (eac33bc)

A surface moving Admin-only → Dispatch-visible re-runs the full labor-safety scan. The
runtime identity-leak gate's four CC entries changed `authorized: Admin → Dispatch` (the
clean probe now scans each payload **as the newly-added lower-privilege audience**), plus
`underPriv: Specialist` to pin the floor beneath the widened guard. The clean-endpoint test
was enhanced to **enforce `underPriv` when declared** — an under-privileged role must be
blocked (401/403) and must never carry identity. Previously `underPriv` was consulted only by
sanctioned endpoints; a clean surface that widened its guard now proves its floor too, rather
than carrying a dead field ("an allow-list that wasn't shown to block the wrong caller is not
a gate").

**Deep-scan record (verbatim, fetched as Dispatch, all four payloads — 0 identity hits by the
automated `scanIdentity` detector):**

- `/overview` → `{ clean_events, total_clean_minutes, hazards_reported }` — scalar aggregate counts.
- `/routes` → array of `{ route_run_id, pool_id, planned_stops, emergency_stops, resolved_stops,
  skipped_stops, total_known_stops, observed_minutes, has_emergency_additions, high_skip_count }`
  — keyed by **route_run / pool**; `observed_minutes` is route/location time, not per-worker.
- `/exceptions` → `{ skips_by_reason[], total_hazards, total_infra_issues, emergency_count }`.
- `/difficulty` → `{ heavy_stops[], heavy_routes[], hotspot_areas[] }` — location-difficulty groupings.

Every field is structural / aggregate, keyed by route_run / pool / location. No `oid`, no
`*_oid`, no `user_id`, no worker name or role anywhere. Time renders as location-difficulty
intelligence, never per-worker attribution.

## Verification

- Backend suite **171 passed / 0 failed** (169 baseline + 2 SEAM-B relocation tests).
- Frontend suite **45 passed** (37 baseline + 8 SEAM-B route/redirect/nav tests).
- `tsc --noEmit` clean, backend and frontend.
- Dev-bypass smoke (automated): `controlCenterRelocation.test.ts` + the `runtimeIdentityLeak`
  CC probes exercise Dispatch / Admin / Specialist / anon via `X-Dev-User-*` headers.
- Red-demos (both on a clean committed tree): reverting the backend guard to `requireAdmin`
  flips the Dispatch→200 assertion to fail (170/1); narrowing the frontend route guard to
  Admin-only breaks the Dispatch render + redirect tests (2 fail). Both restored to green.

## Honest residual

- **Real-token founder QA (F-1) pending.** The Entra `Dispatch` role assignment is a
  Founder-Infra task; the operator-assisted real-token smoke against a live Dispatch account
  is not yet run. All automated coverage uses the dev-bypass; the real MSAL/Entra path is
  unverified in this branch.
- Pre-existing `/routes` handler carries a leftover `console.error("[ControlCenter:Routes]
  rows =", …)` debug dump (prints route/pool rows — **no** worker identity — to stderr).
  Preserved byte-identical by the move; out of SEAM-B scope. Worth a follow-up cleanup card.
- Pre-existing `/overview` taxonomy drift: `SAFETY_HAZARD_OBSERVATION_TYPES` uses
  `'access_blocked_present'` while the write path / `presenceTaxonomy` emits `'access_blocked'`.
  Unchanged by SEAM-B (byte-identical move); flagged for a follow-up.
- Open sibling work unaffected by this change: SEAM-C-R1 and SEAM-A-R1 remain open; D-5 / D-3
  unbuilt.
