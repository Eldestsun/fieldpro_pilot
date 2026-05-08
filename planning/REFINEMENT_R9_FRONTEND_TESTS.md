# R9 — Frontend Tests

> **Goal**: Add component tests for the UL stop wizard and offline queue UI, and E2E tests for the full UL stop completion and Lead route creation flows.
>
> **Status**: ⛔ Blocked by R5
> **Depends on**: R5 stable (no value in testing markup that's being rebuilt)
> **Blocks**: Nothing

---

## Test Stack

| Layer | Tool | Why |
|-------|------|-----|
| Component tests | Vitest + React Testing Library | Already compatible with Vite setup — no Jest config needed |
| E2E tests | Playwright | First-class React/Vite support, reliable mobile viewport simulation |

---

## Files to Touch

| File | Change |
|------|--------|
| `frontend/package.json` | Add `vitest`, `@testing-library/react`, `@testing-library/user-event`, `playwright` |
| `frontend/vite.config.ts` | Add Vitest config block |
| `frontend/src/components/today-route/__tests__/StopWizard.test.tsx` (new) | Stop wizard component tests |
| `frontend/src/components/ui/__tests__/OfflineStatusBar.test.tsx` (new) | Offline status bar tests |
| `frontend/src/components/today-route/__tests__/StopListItem.test.tsx` (new) | Stop list item status badge tests |
| `frontend/e2e/ul-stop-completion.spec.ts` (new) | E2E: UL completes a stop end to end |
| `frontend/e2e/lead-route-creation.spec.ts` (new) | E2E: Lead creates a route |
| `frontend/playwright.config.ts` (new) | Playwright configuration |

---

## Component Tests

### Stop Wizard — `StopWizard.test.tsx`

```typescript
describe('StopWizard', () => {
  it('renders checklist step first')
  it('advances to safety step after checklist is complete')
  it('requires photo before allowing completion')
  it('shows draft restoration banner if draft exists in IndexedDB')
  it('shows offline mode indicator when offline mode is active')
  it('disables submit button while upload is in progress')
  it('calls onComplete with correct payload on submission')
})
```

### Offline Status Bar — `OfflineStatusBar.test.tsx`

```typescript
describe('OfflineStatusBar', () => {
  it('is hidden when queue is empty and device is online')
  it('shows pending count when actions are queued')
  it('shows syncing indicator during replay')
  it('shows success message after clean replay, then auto-dismisses')
  it('shows conflict count and opens modal on tap')
  it('shows offline mode banner when manual offline mode is active')
})
```

### Stop List Item — `StopListItem.test.tsx`

```typescript
describe('StopListItem', () => {
  it('renders pending status badge for unstarted stop')
  it('renders in-progress badge for started stop')
  it('renders completed badge for done stop')
  it('renders skipped badge for skipped stop')
  it('shows queued indicator when stop has pending offline actions')
})
```

---

## E2E Tests

### UL Stop Completion Flow — `ul-stop-completion.spec.ts`

```typescript
test('UL worker can complete a stop end to end', async ({ page }) => {
  // 1. Sign in as UL role (use test account credentials from env)
  // 2. Navigate to /work
  // 3. Verify today's route loads with stops
  // 4. Click first stop
  // 5. Tap "Start Stop"
  // 6. Complete checklist step (all items checked)
  // 7. Complete safety step (no hazards)
  // 8. Upload a test photo
  // 9. Complete infra step (no issues)
  // 10. Submit
  // 11. Verify stop shows as "Done" in the list
  // 12. Verify core.visits row exists in DB with outcome = 'completed'
})

test('UL worker can skip a stop with hazard', async ({ page }) => {
  // Similar flow, choose "Skip" with a hazard type
  // Verify stop shows as "Skipped"
  // Verify core.visits row exists with outcome = 'skipped'
})
```

### Lead Route Creation Flow — `lead-route-creation.spec.ts`

```typescript
test('Lead can create a route', async ({ page }) => {
  // 1. Sign in as Lead
  // 2. Navigate to /routes
  // 3. Click "Create Route"
  // 4. Select a pool
  // 5. Select stops from the map/list
  // 6. Review and save
  // 7. Verify route appears in routes list
  // 8. Verify route_runs row exists in DB
})
```

---

## R9 Overall Done Definition

R9 is complete when ALL of the following are true, **and a changelog entry has been written**:

- [ ] `npm test` in `frontend/` runs Vitest and all component tests pass
- [ ] `npx playwright test` runs and all E2E tests pass against local dev stack
- [ ] Stop wizard tests cover the happy path and the offline/photo-required guard cases
- [ ] OfflineStatusBar tests cover all status states
- [ ] E2E tests cover UL stop completion and Lead route creation
- [ ] E2E tests verify DB state after each flow (canonical rows exist)
- [ ] Changelog entry written to `docs/changelog/YYYY-MM-DD-r9-frontend-tests.md`

---

## Agent Launch Block

```
Testing task. Read CLAUDE.md, then planning/REFINEMENT_R9_FRONTEND_TESTS.md.
Step 1: Add vitest and @testing-library/react to frontend/package.json.
  Add vitest config block to vite.config.ts.
Step 2: Write component tests for StopWizard, OfflineStatusBar, and StopListItem
  using the test cases defined in the file.
Step 3: Add Playwright. Write e2e/ul-stop-completion.spec.ts and
  e2e/lead-route-creation.spec.ts.
Test accounts and credentials come from environment variables — do not hardcode.
Do not change any component source files.
```
