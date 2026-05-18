# 2026-05-11 — Fix ISSUE-004: skip stop requires double-tap when hazard is selected

## What changed
- `handleSkipStop` now accepts `hazardTypes: string[]` as an explicit parameter instead of reading from `safetyState[stopId]`
- The "no hazard selected" validation guard evaluates the passed argument, not component state
- All call sites updated to pass the currently selected hazard value(s) at invocation time

## Why
- `onSetSafety` and `onSkipStop` were called synchronously in the same click handler; the React state update from `onSetSafety` had not committed by the time `handleSkipStop` read `safetyState[stopId].hazardTypes`, causing the validation to see stale empty state and abort on the first tap

## Files touched
- `frontend/src/hooks/useTodayRoute.ts` — added `hazardTypes` parameter; updated hazard validation guard and payload construction; updated internal call from `handleCompleteStop`
- `frontend/src/components/TodayRouteView.tsx` — threads `hazardTypes` through the `onSkipStop` prop callback
- `frontend/src/components/today-route/StopDetail.tsx` — updated `onSkipStop` prop type; both call sites now pass `localSafety.hazardTypes || []` / `safety?.hazardTypes || []`
