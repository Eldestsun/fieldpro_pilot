# 2026-06-06 — Cleanup drain Phase 2: small contained fixes

Bundled dispatch closing the Phase 2 row of `planning/CLEANUP_DRAIN_PLAN.md`.
Two code fixes (ISSUE-019, ISSUE-020), one issue closed as not-reproducible with a
regression test (ISSUE-001), one formal won't-fix closure (ISSUE-011), one new
filing (ISSUE-026). Branch: `feat/cleanup-phase-2-small-fixes`, rebased onto
`origin/main` (Phase 1 is on `origin/main` via PR #4 merge `2b56969`).

## What changed

### ISSUE-019 — `PhotoDto` id type mismatch (frontend TS error, blocked `build-frontend`)
- `frontend/src/components/today-route/StopDetail.tsx:394` — the optimistic photo
  placeholder built `id: -(Date.now() + i)` (a `number`) into a `PhotoDto[]` whose
  `id` is `string`, failing `tsc -b` with TS2345.
- Chose to fix the **value**, not the type: `PhotoDto.id: string` is correct.
  `stop_photos.id` is a `bigint` column (`00000000_consolidated_schema.sql:987`),
  which node-postgres serializes as a JS `string`; the backend
  (`stopPhotosService.ts` `StopPhoto.id: string`) and the API contract
  (`routeRuns.ts` `PhotoDto.id: string`) are already string-typed end to end.
- Changed the literal to a non-colliding string id (`` `optimistic-${Date.now() + i}` ``)
  with an explanatory comment. The id is only used as a React `key` and in an
  `id !== id` filter (both type-agnostic) and is replaced by real DB data on next fetch.
- Verified: `tsc -b` exits 0; TS2345 at `StopDetail.tsx:394` is gone.

### ISSUE-020 — `vitest <4.1.0` critical advisory (GHSA-5xrq-8626-4rwp)
- **Correction:** the issue's "Area: backend" is wrong — the backend has no
  `vitest` (it runs `ts-node tests/run.ts`). `vitest` lives in `frontend/package.json`.
  The CI `dependency-audit` job audits **both** workspaces, so the frontend audit
  step is what failed.
- `frontend/package.json` — bumped `vitest` `^2.1.0 → ^4.1.8` (major 2→4 jump).
  `vite ^7` and `@vitejs/plugin-react ^5` already satisfy vitest 4's peer ranges,
  so no cascade bump was needed. `pnpm install` refreshed the lockfile to 4.1.8.
- Verified: full frontend suite **27/27 pass** (no matcher/fixture breakage);
  `pnpm audit --audit-level=high` reports "No known vulnerabilities found" (exit 0);
  GHSA-5xrq-8626-4rwp no longer appears.

### ISSUE-001 — Offline queue pending count after spot check (cosmetic)
- **Diverged from the dispatch's premise of a live bug.** The miscount is **not
  reproducible in the current code.** The R4 Sub-task D rewrite replaced the old
  queue-state derivation with a type-agnostic, status-based pending filter
  (`actions.filter(a => a.status === 'pending')`), computed identically in
  `OfflineSyncManager.tsx`, `useSyncStatus.ts`, and `getQueueSummary`. Because it
  keys on `status` not `type`, a `COMPLETE_STOP` carrying `spotCheck: true` clears
  from the count once `runReplay` marks it `done`, like any terminal action. No
  current path leaves a spot-check action permanently `pending` (only transient
  auth/network resets, which resolve on the next replay).
- No production code change was required. Added a regression test to lock it in:
  `frontend/src/offline/offlineQueue.test.ts` — asserts `totalPending` clears to
  zero after an offline spot-check stop (`START_STOP` + after-photo
  `UPLOAD_STOP_PHOTOS` + `COMPLETE_STOP{spotCheck:true}`) replays, and that the
  spot-check `COMPLETE_STOP` reaches `done`.
- Verified by code reasoning + the unit test (part of the 27/27 frontend pass).
  **Not** re-verified via a live browser smoke test in this dispatch.

### ISSUE-011 — Dev bypass Bearer token enhancement
- Formally closed **Won't fix** per the 2026-06-06 founder decision: the
  Bearer-token enhancement is not being pursued; dev bypass remains the
  localStorage/cookie mechanism for headless agent testing during development.
  No code change.

### ISSUE-026 — Dev bypass code paths must be gated for production (new filing)
- Filed in `docs/KNOWN_ISSUES.md`. Production deployment must gate the dev-bypass
  code paths behind a `NODE_ENV` check (or strip them from production builds).
  Pre-pilot blocker. Replaces ISSUE-011's tracking; distinct from ISSUE-018.
- **Not fixed in this dispatch** (out of scope by timing — a Phase 3/4 item).

## Why
- ISSUE-019: green `build-frontend` CI on every PR.
- ISSUE-020: clear a critical security advisory failing `dependency-audit`.
- ISSUE-001: close out the deferred cosmetic item; lock behavior with a test.
- ISSUE-011 / ISSUE-026: record the founder's dev-bypass decision and re-file the
  real residual concern (production gating) under a correctly-scoped issue.
- Drain the Phase 2 row so the open-issue ledger keeps shrinking ahead of capability work.

## Files touched
- `frontend/src/components/today-route/StopDetail.tsx` (ISSUE-019)
- `frontend/package.json` + `frontend/pnpm-lock.yaml` (ISSUE-020)
- `frontend/src/offline/offlineQueue.test.ts` (new — ISSUE-001 regression test)
- `docs/KNOWN_ISSUES.md` (019/020/001 → Fixed; 011 → Closed; 026 → Filed)
- `planning/CLEANUP_DRAIN_PLAN.md` (Phase 2 marked complete)
- `docs/changelog/bugfix/2026-06-06-cleanup-phase-2-small-fixes.md` (this file)

## Notes
- **Branch base:** the branch was initially cut from the local Phase-1 tip (`a219c23`)
  because the local `main` was stale. Once `origin` was fetched, Phase 1 was confirmed
  on `origin/main` via the PR #4 merge (`2b56969`), and this branch was rebased onto
  `origin/main` — yielding a single Phase 2 commit on linear history whose diff against
  `main` is Phase 2's changes only.
