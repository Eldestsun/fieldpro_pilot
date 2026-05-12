# 2026-05-11 — Fix ISSUE-004 Part 2: AND guard + skip confirmation dialog

## What changed

### Part 1 — AND guard on skip validation
- `handleSkipStop` in `useTodayRoute.ts`: consolidated the sequential photo and hazard checks into explicit named booleans (`hasHazards`, `hasPhoto`). Both must be true for the skip to proceed — the OR ambiguity in the prior nested photo check (`safetyPhotoKey || hasQueued`) is now computed upfront as a single clear condition.
- Validation is now also enforced in `StopDetail.tsx`'s skip button click handler using `localSafety` (always-fresh local state, no async-stale risk). The `handleSkipStop` guards remain as defense-in-depth.
- Replaced the silent `disabled` attribute on the Skip button with an explicit validation path: clicking the button with missing conditions shows a specific inline error rather than silently doing nothing.
- Inline error messages:
  - No hazard selected (or "other" without notes): `"Select a hazard type to skip this stop"`
  - No photo: `"Add a photo before skipping"`
- Error clears on re-tap and when the safety panel is reopened.

### Part 2 — Skip confirmation dialog
- The skip button now opens a confirmation dialog (using the existing `ConfirmDialog` component) instead of submitting immediately.
- Dialog title: "Skip this stop?" / body: "This stop will be recorded as skipped due to a safety hazard. This cannot be undone." / actions: Cancel | Skip Stop (danger variant).
- `onSetSafety` is called at dialog-open time (after validation passes) so that `safetyState` is committed before `handleSkipStop` reads it on confirm — eliminates the stale `safetyPhotoKey` read that caused the secondary double-tap issue.
- Replaced the dead raw-div `showSkipModal` block with `ConfirmDialog`.

## Why
- Testing revealed that the prior skip validation could pass with only one of the two required conditions met (hazard OR photo) depending on React state commit timing.
- Workers could skip a stop without documented photo evidence, violating the skip contract.
- A confirmation step is required before an irreversible action (skip = permanent safety record).

## Files touched
- `frontend/src/hooks/useTodayRoute.ts` — AND guard consolidation in `handleSkipStop`
- `frontend/src/components/today-route/StopDetail.tsx` — skip button validation, inline error display, `ConfirmDialog` wiring, `ConfirmDialog` import, `skipError` state
