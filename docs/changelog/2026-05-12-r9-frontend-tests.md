# 2026-05-12 — R9: Frontend test infrastructure and component tests

## What changed
- Added `vitest`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom` as devDependencies
- Added `@playwright/test` as a devDependency
- Added `"test": "vitest"` script to `frontend/package.json`
- Added vitest config block to `frontend/vite.config.ts` (jsdom environment, setupFiles)
- Created `frontend/src/test-setup.ts` with jest-dom matchers and jsdom API stubs
- Added `frontend/playwright.config.ts` with Chromium/mobile viewport config
- Created `frontend/e2e/fixtures/test-photo.jpg` (minimal PNG for upload flows)
- Wrote 7 component tests for `StopDetail` in `StopWizard.test.tsx`
- Wrote 6 component tests for `OfflineStatusBar` in `OfflineStatusBar.test.tsx`
- Wrote 5 component tests for `StopListItem` in `StopListItem.test.tsx`
- Wrote 2 E2E tests in `e2e/ul-stop-completion.spec.ts` (complete + skip flows)
- Wrote 1 E2E test in `e2e/lead-route-creation.spec.ts` (route creation flow)

## Why
- R9 done-criteria: component tests cover happy path and offline/photo-required guard cases
- E2E tests target the two primary workflows (UL stop completion, Lead route creation)
- All test credentials come from environment variables — no hardcoded values

## Files touched
- `frontend/package.json`
- `frontend/vite.config.ts`
- `frontend/src/test-setup.ts` (new)
- `frontend/playwright.config.ts` (new)
- `frontend/e2e/fixtures/test-photo.jpg` (new)
- `frontend/e2e/ul-stop-completion.spec.ts` (new)
- `frontend/e2e/lead-route-creation.spec.ts` (new)
- `frontend/src/components/today-route/__tests__/StopWizard.test.tsx` (new)
- `frontend/src/components/ui/__tests__/OfflineStatusBar.test.tsx` (new)
- `frontend/src/components/today-route/__tests__/StopListItem.test.tsx` (new)
- `docs/changelog/2026-05-12-r9-frontend-tests.md` (this file)
