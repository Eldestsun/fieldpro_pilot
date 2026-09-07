# 2026-09-06 — S2-9-pre1: modal focus management (focus trap on all dialog components)

## What changed
- New shared hook `frontend/src/hooks/useFocusTrap.ts`: on open, saves the
  opener and moves focus to the dialog's first focusable element (or the
  container, `tabindex=-1`); contains Tab/Shift+Tab within the dialog
  (SC 2.4.3 Focus Order); Escape invokes the dialog's close handler
  (SC 2.1.2 No Keyboard Trap); on close/unmount, focus returns to the opener.
  Keydown is bound in the capture phase so the trap wins over inner handlers.
  Deliberately no `offsetParent` visibility filter — it is null for elements
  inside `position:fixed` overlays (all our dialogs) and always null in jsdom;
  the selector excludes disabled controls and the `hidden` attribute is
  honored instead.
- Applied to **all seven** dialog instances — the card's "5 dialog components"
  had drifted; two dialogs shipped after it was written:
  1. `ui/ConfirmDialog.tsx` (Escape = cancel)
  2. `ui/ConflictResolutionModal.tsx`
  3. `common/ImagePreviewModal.tsx`
  4. `today-route/StopDetail.tsx` — Safety modal
  5. `today-route/StopDetail.tsx` — Infra modal
  6. `StopHistoryDrawer.tsx` (post-card: SEAM-D D5b)
  7. `RouteCreatePanel.tsx` (post-card: route-create dialog)
- 6 hook tests (`hooks/__tests__/useFocusTrap.test.tsx`): initial focus,
  Tab wrap, Shift+Tab wrap, Escape → onClose, focus restore on close,
  empty-dialog container focus. Frontend suite 111/111, tsc clean.

## Why
- S2-9 (WCAG 2.1 AA Conformance Statement, TPRA document) is held in review on
  its prerequisites; this was prereq 1 and the only agent-owned one. The
  conformance statement's §6.1 deviation note can now be closed out. Remaining
  S2-9 gates: prereq 2 (photo-remove touch target — founder product decision)
  and S3-4 (VoiceOver/TalkBack manual run — founder QA).

## Files touched
- `frontend/src/hooks/useFocusTrap.ts` (new)
- `frontend/src/hooks/__tests__/useFocusTrap.test.tsx` (new)
- `frontend/src/components/ui/ConfirmDialog.tsx`
- `frontend/src/components/ui/ConflictResolutionModal.tsx`
- `frontend/src/components/common/ImagePreviewModal.tsx`
- `frontend/src/components/today-route/StopDetail.tsx` (2 modals)
- `frontend/src/components/StopHistoryDrawer.tsx`
- `frontend/src/components/RouteCreatePanel.tsx`
- `planning/SECURITY_SPRINT_INDEX.md` (prereq 1 → Done; S2-9 row note)
- `docs/changelog/security/2026-09-06-s2-9-pre1-modal-focus-traps.md` (this entry)

## Smoke test
Live in the founder's real-Entra session (`/routes` → Create Route dialog):
dialog open → focus moved inside (first focusable, the "From Pool" tab);
Escape → dialog closed AND focus restored to the "+ Create Route" opener.
All four assertions returned true. No DB writes involved.
