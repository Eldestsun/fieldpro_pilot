# PR draft — Cleanup drain Phase 2: small contained fixes

**Branch:** `feat/cleanup-phase-2-small-fixes` → `main`
**Commit:** `0e69c20` (single commit, rebased onto `origin/main` `2b56969`)
**Suggested title:** `fix(cleanup): drain Phase 2 — ISSUE-019/020 fixed, 001 closed, 011 closed, 026 filed`

---

**SIGNIFICANCE**

Drains the entire Phase 2 row of the cleanup plan in one pass: it restores green
`build-frontend` and `dependency-audit` CI on every PR (the two checks 019 and 020
were failing), and clears two more entries from the open-issue ledger ahead of the
capability workstream. After this lands, only the structural Phase 3–5 issues and the
newly-filed pre-pilot item (ISSUE-026) remain open.

**WHAT LANDED**

- **ISSUE-019 (fix)** — `StopDetail.tsx:394`: the optimistic `PhotoDto` placeholder
  built a `number` id into a `string`-typed array, failing `tsc -b` (TS2345) on every
  PR. Fixed the value to a string. `PhotoDto.id: string` is correct end-to-end:
  `stop_photos.id` is `bigint`, which node-postgres serializes as a string. `tsc -b`
  clean.
- **ISSUE-020 (fix)** — bumped `vitest` `^2.1.0 → ^4.1.8` to clear critical advisory
  GHSA-5xrq-8626-4rwp. *Correction to the issue text:* `vitest` is a **frontend** dep,
  not backend (the backend runs `ts-node tests/run.ts`); CI audits both workspaces, so
  the frontend audit step was the failure. Major 2→4 jump landed cleanly — no cascade
  bump needed (`vite ^7`/`plugin-react ^5` already satisfy it), **27/27 frontend tests
  pass**, `pnpm audit --audit-level=high` clean.
- **ISSUE-001 (closed — not reproducible)** — the spot-check pending-count miscount is
  not present in current code. The R4 Sub-task D rewrite made the count derivation
  type-agnostic (status-based), which already clears spot-check completions like any
  terminal action. No production change; added a regression test
  (`frontend/src/offline/offlineQueue.test.ts`) to prevent recurrence. Verified by code
  reasoning + test (no live browser smoke test — agreed unnecessary for a dissolved
  cosmetic bug).
- **ISSUE-011 (closed — won't fix)** — dev-bypass Bearer-token enhancement not pursued
  (2026-06-06 founder decision); dev bypass stays the localStorage/cookie mechanism for
  development.
- **ISSUE-026 (filed)** — gate dev-bypass code paths behind `NODE_ENV` for production.
  Pre-pilot blocker; replaces ISSUE-011's tracking. Not implemented here (out of scope
  by timing).
- Ledger + plan updated: `KNOWN_ISSUES.md` (019/020 Fixed, 001/011 Closed, 026 Filed),
  `CLEANUP_DRAIN_PLAN.md` (Phase 2 ✅ complete), changelog
  `docs/changelog/bugfix/2026-06-06-cleanup-phase-2-small-fixes.md`.

**HONEST RESIDUAL**

- This dispatch is complete — all four Phase 2 issues are resolved. The one new open
  item it produces, **ISSUE-026** (production dev-bypass gating), is intended drain
  behavior: ISSUE-011's real residual concern, re-filed under correct scope as a
  pre-pilot item. Distinct from ISSUE-018.
- ISSUE-001 carries no code fix by design — it documents that upstream work (Sub-task D)
  already dissolved the bug, with a regression test as the guard. The ledger reflects
  this as "Closed (not reproducible)", not "Fixed".

🤖 Generated with [Claude Code](https://claude.com/claude-code)
