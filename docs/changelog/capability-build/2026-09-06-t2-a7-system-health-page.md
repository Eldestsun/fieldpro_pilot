# 2026-09-06 — T2-A7: System health page (Admin) — new /admin/health endpoint + governance UI

## What changed
- **Backend**: new `GET /api/admin/health` in `adminRoutes.ts` (Admin-gated by
  parent middleware, fail-closed org resolution, all reads under
  `withOrgContext`). Returns counts + integration recency:
  `users.by_role` / `active_last_30d`, `stops` active/retired/total (T2-A2's
  retirement flag feeds straight in), `pools`, `route_runs_yesterday` (dynamic
  status→count map), `visits_yesterday` (core.visits), `eam_bridge`
  last_log_at/logs_7d, `audit_log` 24h/7d counts, and `recent_issues`.
- **Spec departures (2026-05-19 spec vs live code, recorded per the
  build-to-live-behavior ruling):**
  1. `open_issues` from `hazards`/`infrastructure_issues` NOT built — those are
     write-clipped frozen adapter tables (ISSUE-031/037); counting them would
     be permanently stale. Canonical replacement: `recent_issues.
     not_ok_presence_7d` — presence-kind observations with `norm_status='not_ok'`
     in the last 7 days, read from the normalized columns only (never payload,
     per the CANONICAL_STATE_LAYER hard rule). Canonical has no open/closed
     lifecycle, so "recent" is the honest framing.
  2. `eam_bridge.last_successful_export_at`/`recent_failures_7d` NOT built —
     the live `eam_bridge_route_log` has no `status`/`exported_at` columns
     (spec predates the table's real shape). Built to the live schema:
     `last_log_at` (MAX(logged_at)) + `logs_7d`.
  3. `route_runs_yesterday` is a dynamic status map, not the spec's hardcoded
     four keys — live statuses are planned/in_progress/finished, not
     completed/cancelled.
- **Frontend**: `getSystemHealth` + `SystemHealth` type in `api/routeRuns.ts`;
  new `AdminSystemHealthPanel.tsx` (8 OpsCard sections of key:value counts,
  refresh-on-mount + manual Refresh, deliberately no auto-poll — live ops is
  the Dispatch CC); route `/admin/system-health` + "System Health" Admin nav
  (desktop + mobile).
- **Tests**: 3 backend (`adminHealth.test.ts`: shape, labor-safety grep — no
  oid/display_name/email in the body, 403/401 gating) + `/admin/health`
  registered as a `clean` surface in the runtime identity-leak endpoint
  registry (its tripwire caught the unclassified route on first run — the
  mechanism working as designed). 4 component tests. Backend 209/209,
  frontend 115/115, tsc clean.

## Why
- The 4-counter dashboard is too thin for the "operational credibility" demo
  story and TPRA walkthroughs. This is the governance counterpart to the
  Dispatch Control Center: volumes, integration recency, and audit activity,
  strictly counts — no individuals (spec Labor Safety Constraint, enforced by
  test).

## Files touched
- `backend/src/modules/admin/adminRoutes.ts`
- `backend/tests/canonical/adminHealth.test.ts` (new) + `backend/tests/run.ts`
- `backend/tests/canonical/runtimeIdentityLeak.test.ts` (surface registered)
- `frontend/src/api/routeRuns.ts`
- `frontend/src/components/admin/AdminSystemHealthPanel.tsx` (new)
- `frontend/src/components/admin/__tests__/AdminSystemHealthPanel.test.tsx` (new)
- `frontend/src/App.tsx` (route + nav)
- `docs/changelog/capability-build/2026-09-06-t2-a7-system-health-page.md` (this entry)

## Smoke test
`GET /api/admin/health` as the org-1 admin bypass persona against live dev
data: full shape returned (1621 active stops, role buckets Specialist/Dispatch,
audit 24h/7d counts, EAM never-logged handled as null → "Never" in UI). No DB
writes (read-only endpoint, no audit action — consistent with /admin/dashboard).
Known limitation (same as T2-A2): founder's Entra account is Dispatch/Lead, so
the admin page visual pass is covered by component tests; a full visual
click-through awaits an Admin-role Entra login.
