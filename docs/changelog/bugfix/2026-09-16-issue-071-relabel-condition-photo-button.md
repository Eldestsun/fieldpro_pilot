# 2026-09-16 — ISSUE-071: relabel mislabeled "Document Conditions" photo button

## What changed
- `StopDetail.tsx`: the stop-completion button labeled **"Document Conditions
  (Optional)"** — which actually triggers the hidden `#main-photo-upload` file
  input (the during-work condition photo) — is relabeled **"Add Condition Photo
  (Optional)"**. Behavior unchanged (same onClick, same file input wiring).
- `StopWizard.test.tsx`: the matcher that finds the button by name updated from
  `/Document Conditions/i` to `/Add Condition Photo/i`.

## Why
- "Document Conditions" reads like a notes / free-text control; a worker (or a
  pilot evaluator) reasonably expects a text field and instead gets the OS file
  picker. The only free-text note fields live inside the Report Safety / Report
  Infrastructure modals. The new label keeps the "document conditions" intent but
  makes the photo action unambiguous, and parallels the sibling completion button
  "Take After Photo". Found during the 2026-09-14/15 notes-capture UI test.

## Verification
- Copy-only change; no behavior, backend, schema, or migration impact.
- Frontend `tsc --noEmit` clean; frontend suite **119/119** — the StopWizard test
  now locates the button by its new name and asserts it disables during upload
  (render-proof of the new label).
- `StopDetail.tsx` is not in the frozen set (auth/offline); file-input wiring left
  intact per the card guardrail.

## Files touched
- `frontend/src/components/today-route/StopDetail.tsx`
- `frontend/src/components/today-route/__tests__/StopWizard.test.tsx`
- `docs/changelog/bugfix/2026-09-16-issue-071-relabel-condition-photo-button.md` (this entry)
