# 2026-05-08 — Pre-Refactor Baseline Snapshot

## What changed
- AuthContext.tsx: token race condition fix, in-flight 
  deduplication, graceful degradation in useAuth()
- msalConfig.ts: navigateToLoginRequestUrl: false — 
  prevents redirect loop on login
- offlineQueue.ts: OTEM ExecutionMode type added, 
  deterministic replay ordering 
  (UPLOAD_STOP_PHOTOS → START_STOP → SKIP → COMPLETE)
- StopDetail.tsx: wizard eliminated, single-screen + 
  modal pattern, after-photo gate, spot check flow, 
  draft load guard, state leak fix between stops
- useTodayRoute.ts: OTEM refactor — deterministic 
  offline/online action handling, spotCheck payload, 
  wizard state removed
- api/routeRuns.ts: spotCheck field added to 
  ChecklistState and CompleteStopPayload
- vite.config.ts: Docker dev server host access
- auth-silent.html: silent auth redirect target

## Why
These changes were built before the refactor track started
and represent real feature work. Committing as named baseline
before Tier 1 begins. AuthContext and offlineQueue changes
are acknowledged frozen file exceptions — the changes predate
the freeze and fix real production issues.

## Files touched
- frontend/src/auth/AuthContext.tsx
- frontend/src/msalConfig.ts
- frontend/src/offline/offlineQueue.ts
- frontend/src/api/routeRuns.ts
- frontend/src/components/TodayRouteView.tsx
- frontend/src/components/today-route/StopDetail.tsx
- frontend/src/hooks/useTodayRoute.ts
- frontend/vite.config.ts
- frontend/public/auth-silent.html
- frontend/src/utils/offlineMode.ts