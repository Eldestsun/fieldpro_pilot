# 2026-09-14 — SEAM-A-R1: retire dead /lead namespace cruft

## What changed
- **`GET /lead/todays-runs` removed** (`routeRunRoutes.ts`, handler + @openapi
  block). Dead-to-frontend since SEAM-A: `LeadRoutesPanel` consumes
  `/ops/route-runs`; the fetch fn and type had zero call sites.
- **`fetchLeadTodaysRuns` + `LeadRouteRunSummary` removed**
  (`frontend/src/api/routeRuns.ts`) — zero consumers.
- **`GET /lead/hub` removed** (handler + @openapi block). Ruling per the card's
  "decide /lead/hub's fate": it was a role-scope placeholder returning a static
  `{ok, scope:"Lead"}` with no consumers anywhere in the repo; `/api/secure/ping`
  already serves the authenticated-smoke role. Retired rather than kept.
- **Double-mounted `GET /lead/route-runs/:id` deduped** — the two registrations
  were byte-identical (same guards, same handler); Express only ever dispatched
  to the first. The load-bearing NAMING/ISSUE-043/SEAM-C documentation from the
  removed duplicate was merged onto the surviving mount.
- Tests updated: `seamCUserIdDropped.test.ts` now covers `/ops/route-runs` only
  (the surviving run-list surface); `runtimeIdentityLeak.test.ts` drops the
  retired route's probe entry and the `/lead/hub` exemption.
- OpenAPI regenerated (`openapi.json`/`openapi.yaml`, 50 paths — both retired
  paths gone).

## Consumer sweep (the card's required proof)
Repo-wide grep (ts/tsx/md/sh/json, excluding node_modules/changelog/archive):
the only live references were the definitions themselves, the two tests
(updated), and the generated OpenAPI (regenerated). Remaining mentions are
historical planning docs (`DISPATCH_ADMIN_CAPABILITY_AUDIT.md`, the T3-D3 spec)
and a stale curl allowlist entry in `.claude/settings.local.json` — history and
local config, not consumers. No Specialist-surface dependency: the route was
Dispatch/Admin-gated and nothing on the Specialist path referenced it.

## Why
- DISCOVERY-D0 / SEAM-A Phase 0 findings: dead endpoint, dead client code, a
  duplicate mount that could silently drift from its twin, and a placeholder
  route — deletion-class cruft in the historical `/lead` namespace. Fewer
  surfaces to audit for the labor-safety and identity-leak scans.

## Verification
- Backend `tsc --noEmit` clean; frontend `tsc --noEmit` clean.
- Backend suite **215/215** (one probe test correctly retired with its route);
  frontend suite **119/119**.

## Files touched
- `backend/src/modules/routes/routeRunRoutes.ts`
- `frontend/src/api/routeRuns.ts`
- `backend/tests/canonical/seamCUserIdDropped.test.ts`
- `backend/tests/canonical/runtimeIdentityLeak.test.ts`
- `backend/openapi/openapi.json`, `backend/openapi/openapi.yaml` (regenerated)
- `docs/changelog/bugfix/2026-09-14-seam-a-r1-retire-dead-lead-routes.md` (this entry)
