# 2026-05-10 — R4-C: Route data cache + stop draft store wiring

## What changed
- `useTodayRoute.ts` now imports and calls `saveTodayRouteCache` after every successful `fetchRoute`, persisting the route to localStorage
- `useTodayRoute.ts` `fetchRoute` falls back to `loadTodayRouteCache` on network failure — if a cached route exists, it is used as `routeRun` and no error is surfaced to the worker
- `fetchRoute` `useCallback` deps updated to include `tenantId` and `oid` so cache calls always use the correct identity
- `StopDetail.tsx` draft load effect now enforces a 24-hour freshness check — stale drafts are silently ignored and not restored
- `StopDetail.tsx` shows a "↩ Resume from where you left off" banner when a fresh draft is restored on mount
- Banner dismiss calls `clearStopDraft` so the worker starts clean if they explicitly dismiss
- `setShowResumeBanner(false)` added to the stop-change reset effect so the banner does not bleed across stop navigations
- `clearStopDraft` on stop read-only (completion/skip) already existed — preserved unchanged

## Why
- `todayRouteCache.ts` and `stopDraftStore.ts` existed but were never called — workers who went offline mid-shift saw an error screen with no route data
- Draft state (checklist, safety, infra) was lost if the app was closed and reopened before completing a stop
- 24h freshness guard prevents stale drafts from a prior shift from auto-populating the wrong stop state

## Files touched
- `frontend/src/hooks/useTodayRoute.ts` — cache import, save after fetch, load on network failure, deps update
- `frontend/src/components/today-route/StopDetail.tsx` — freshness check, resume banner, dismiss handler, banner reset on stop change
