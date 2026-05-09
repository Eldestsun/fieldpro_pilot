# Session 2026-05-08 — TIER_3_CONTROL_CENTER 
# & R1 Auth Identity Cleanup

## TIER_3_CONTROL_CENTER 

### Tier 3 details
- Task: Mount AdminControlCenter in App.tsx
- Files touched: frontend/src/App.tsx only
- AdminControlCenter.tsx not modified
- No backend files touched
- No frozen files touched

### Done criteria verified:
- Control Center tab visible for Admin role users ✓
- All four sections (overview, routes, exceptions, 
  difficulty) load without console errors ✓
- Non-admin users cannot see the tab ✓
- Existing Admin Dashboard, Pools, Stops views unaffected ✓
- Chrome MCP smoke test passed ✓

### Notes captured for future polish pass:
- Change progress bar semantics from "completed" to "visited"
- Remove assignee from route status table
- Route status table data should persist even if route is 
  completed — nothing wipes from Control Center view until 
  end of day or manual clear

## R1 Auth Identity Cleanup

### Auth Identity Cleanup
- Replace all user_id = 123 and PILOT_DEV_UL_USER_ID = 123 stubs

### Agent behavior notes
- Touched correct files only ✓
- Did not touch frozen files ✓
- Caught incomplete fix — PILOT_DEV_UL_USER_ID was dead code, 
  real stub was req.body.user_id passthrough on line 327
- Patched correctly on follow-up prompt

### Done criteria verification
- [x] No user_id = 123 literal remains in routeRunStopRoutes.ts
  grep result: no hits ✓
- [x] No PILOT_DEV_UL_USER_ID = 123 remains in routeRunRoutes.ts
  grep result: no hits ✓
- [x] Both stubs replaced with LEGACY_TRANSIT_USER_ID = 0 + comment
- [x] user_id no longer injectable from req.body
- [x] assigned_user_oid correctly wired from req.body.ul_id — confirmed line 258
- [x] core.visits.captured_by_oid unaffected
- [x] git diff --name-only shows exactly 2 files

### What's verified and safe to build on
- R1 complete and verified
- Legacy user_id is now a server-controlled constant, not client data



# Current Session State — 2026-05-08

## Completed this session
- Tier 3 ✓ — Control Center mounted
- R1 ✓ — Auth identity stubs replaced
- Tier 6A ✓ — Migration runner, 43 files baselined; runner is forward-only from 2026-05-08
- Tier 6D ✓ — Hardcoded localhost removed from db.ts, .env.example written
- Tier 4A ✓ — Stops view lowercase, 7 backend files updated, Tier 2 unblocked
- Tier 4B ✓ — Surveillance tables dropped, workforce_equity_mv dropped, stop_effort_history and stop_condition_history created, R10 unblocked

### Next in queue
- Tier 1 — Canonical write paths (highest priority, unblocks Tier 2 + Tier 5 + R2 + R7)
- Tier 6B — Integration tests (run immediately after Tier 1)
- Tier 2 — Intelligence migration (after Tier 1 verified)
- R3 — Frontend router
- R4 — Offline UX
- R6 — Control Center live updates

### Future Scoped Items
- MV audit: cleanliness_risk_mv, safety_risk_mv, infrastructure_risk_mv, level3_compliance_mv, stop_status_mv all built on legacy transit tables with old uppercase column names. Audit and rebuild on canonical state after Tier 2.
- captured_by_oid pseudonymization: hash(oid + org_id + salt) at write time in visitService.ts. Scope as formal item before pilot agreement is signed.

### Session context notes
- LEGACY_TRANSIT_USER_ID = 0 is the pattern established for 
  legacy stubs going forward
- Control Center polish notes logged — address in R6 pass
- assigned_user_oid already correctly wired — confirmed

### Do not start next session without reading
- CLAUDE.md
- docs/session-log.md (this file)
- planning/TIER_6_INFRASTRUCTURE.md Sub-task A

## Session Boundary Note — 2026-05-08

### Session Boundary Note — RESOLVED 2026-05-08

Frozen file modifications were assessed and committed as the 
pre-refactor baseline snapshot. Changelog entry written at:
docs/changelog/2026-05-08-pre-refactor-baseline.md

Files committed:
- frontend/src/auth/AuthContext.tsx (token race fix, in-flight dedup)
- frontend/src/msalConfig.ts (navigateToLoginRequestUrl: false)
- frontend/src/offline/offlineQueue.ts (OTEM ExecutionMode, deterministic replay order)
- frontend/src/api/routeRuns.ts (spotCheck field)
- frontend/src/components/TodayRouteView.tsx
- frontend/src/components/today-route/StopDetail.tsx (wizard → single-screen + modal)
- frontend/src/hooks/useTodayRoute.ts (OTEM refactor)
- frontend/vite.config.ts (Docker dev server host)
- frontend/public/auth-silent.html (silent auth redirect)
- frontend/src/utils/offlineMode.ts

AuthContext and offlineQueue changes acknowledged as frozen file 
exceptions — changes predate the freeze and fix real production issues.

Blocker cleared. Tier 6A is unblocked.