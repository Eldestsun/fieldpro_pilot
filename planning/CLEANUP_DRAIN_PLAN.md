# Cleanup Drain Plan — Pre-Capability

## Purpose

Drain all open issues in `docs/KNOWN_ISSUES.md` before the capability
workstream begins. Two valid endings for each issue: fixed (`Fixed
YYYY-MM-DD`), or formally closed with a documented deferral rationale
(`Deferred to vX.X` — one-paragraph reasoning). The repo's open issue
log ends this phase empty.

`docs/KNOWN_ISSUES.md` remains the source of truth on each individual
issue's WHAT / SEVERITY / FIX-SHAPE. This file owns the SEQUENCING and
PHASE structure — the cleanup workstream dispatches against it the way
capability work dispatches against the capability build index.

## Why drain before capability

The KCM technical review will read the issue log. An empty/closed log
paired with a deferred-with-rationale archive reads as architectural
thinking; an open log of latent issues reads as unfinished foundation.
The pilot pitch ("this is real, it's structural, it's defensible")
depends on the foundation being visibly done.

## Phase 1 — CI / test infrastructure (gate dispatch, must be first) — ✅ COMPLETE 2026-06-05

The safety net for everything downstream. Backend integration tests
must run on CI before any subsequent fix can be safely landed — without
that net, fixing deferred items late is unverified.

| Issue | Action | Effort | Status |
|-------|--------|--------|--------|
| ISSUE-022 | Add seed step to `ci.yml`'s test-backend job after migrations (Option A from the issue's triage). Seed TEST_POOL and any other minimal fixture rows. | half day to day | ✅ Fixed 2026-06-05 |
| ISSUE-009 | Fix fixture stop_id → location_id mapping broken after R11. Pair with 022 since both touch test infrastructure. | (in same dispatch) | ✅ Fixed 2026-06-05 (same seed) |

Single paired dispatch. Phase 1 ships in ~1 dispatch.

**Completion note (2026-06-05).** The Phase 1 gate criterion — *backend
integration tests run on CI* — is met: the suite now executes end-to-end
with no fixture-setup crash (ISSUE-022/009 fixed via
`backend/tests/fixtures/seed.sql` + a CI seed step). The dispatch also
folded in **ISSUE-023** (5 canonical tests referencing sidecar-dropped
identity columns — filed and fixed same dispatch), since stale-test fixes
are the same *shape* of work as the seed work.

Two findings surfaced that are a different *kind* of work and were filed
for their proper dispatches rather than folded in:
- **ISSUE-024** — latent `sync_transit_stop_primary_asset` trigger defect
  (omits NOT NULL `org_id`); seed works around it, trigger still needs a
  dedicated fix.
- **ISSUE-025** — CI's `test-backend` connects as a superuser, bypassing
  RLS, so six RLS-enforcement tests stay red on CI. Its resolution is
  bound to **ISSUE-018**'s app-connection-role wiring (Phase 3) and
  should be decided there.

**Full-green CI awaits ISSUE-024 and ISSUE-025.** The gate goal (suite
executes; failures are categorized and tracked, not fixture crashes) is
satisfied now; "every check green" follows once 024 and 025 land in
their dispatches.

## Phase 2 — Small contained fixes (parallelizable, low risk) — ✅ COMPLETE 2026-06-06

Once CI runs tests, these can land quickly with the safety net active.

| Issue | Action | Effort | Status |
|-------|--------|--------|--------|
| ISSUE-019 | `StopDetail.tsx:394` PhotoDto id type fix (one file). | 30 min | ✅ Fixed 2026-06-06 |
| ISSUE-020 | Bump vitest `>=4.1.0`; verify no test breakage. | 1 hr | ✅ Fixed 2026-06-06 |
| ISSUE-001 | OfflineSyncManager terminal-action pending-count cosmetic fix. | 1 hr | ✅ Closed 2026-06-06 (not reproducible; regression test added) |
| ISSUE-011 | Bearer token: decision (re-implement vs. formally close). | 15 min decision | ✅ Closed (won't fix) 2026-06-06 |

Phase 2 ships in ~1 day across 2-3 small dispatches (some parallel).

**Completion note (2026-06-06).** All four Phase 2 issues are resolved in one bundled dispatch (branch `feat/cleanup-phase-2-small-fixes`):

- **ISSUE-019** — fixed the optimistic `PhotoDto` literal to a `string` id (the type is correct: `stop_photos.id` is `bigint`, serialized as string by node-postgres). `tsc -b` clean.
- **ISSUE-020** — **the issue mislabeled the area as backend**; `vitest` actually lives in `frontend/` (the backend has no vitest). Bumped frontend `vitest` `^2.1.0 → ^4.1.8` (major 2→4 jump, no cascade bump needed); `pnpm audit --audit-level=high` now clean; 27/27 frontend tests pass.
- **ISSUE-001** — **diverged from the dispatch's premise of a live bug**: the spot-check pending-count miscount is **not reproducible in the current code**. The R4 Sub-task D rewrite made the count derivation type-agnostic (status-based), which inherently clears spot-check completions. Verified by code reasoning + a new regression test (`frontend/src/offline/offlineQueue.test.ts`); no production code change was required. Closed as resolved-by-Sub-task-D rather than a new fix.
- **ISSUE-011** — formally closed Won't-fix per the 2026-06-06 founder decision (dev bypass repositioned as development-only). Its production-hardening concern is re-filed as **ISSUE-026** (gate dev-bypass code paths behind `NODE_ENV` for production) — a pre-pilot item by timing, **not** fixed in this dispatch.

The open-issue ledger after Phase 2: 019/020 Fixed, 001 Closed (not reproducible in current code — dissolved by the R4 Sub-task D rewrite; regression test added), 011 Closed (won't fix); net new open item ISSUE-026 (pre-pilot). Phases 3–5 carry the remaining open issues (018, 013, 014, 006, 015, 016, 017, 008, 010, 024, 025, 026).

## Phase 3 — Structural correctness (the real work)

Sequential — these touch real code paths and benefit from individual
focus.

**Restructured 2026-06-06 following the empirical adapter-layer audit
(`docs/audit/2026-06-06-adapter-layer-information-content-audit.md`).** ISSUE-018's
Phase 0 + that audit showed the v0001 dual-write scaffolding (the transit adapter
layer) is **not operationally inert** — it carries a full parallel *identified* record
of work performed, reconstructable to the named individual without any canonical
access. The v0001 → canonical migration that was always planned but never finished must
be **completed (the scaffolding removed)** before `intelligence_reader` credential
isolation delivers the *system-wide* labor-safety guarantee. **ISSUE-031 completes the
canonical migration that makes the architectural pitch true, and is now the head of
Phase 3.** ISSUE-018 is paused beneath it; ISSUE-028/029/030 (the other Phase 0
findings) depend on ISSUE-031 landing first.

| Issue | Action | Effort | Status |
|-------|--------|--------|--------|
| **ISSUE-031** | **Complete canonical migration — remove work-attribution tables/columns from the transit adapter layer (clip v0001 dual-write scaffolding).** Read-path discovery → UI surface verification → migration sequence → drop tables → view cleanup. | 3-4 weeks, multi-dispatch | **Head — Open** |
| ISSUE-018 | Route intelligence reads through `intelligence_reader` role. **Paused** — blocked until ISSUE-031 makes the adapter genuinely inert; resumes after, likely restarted from a clean `main`. | 1-2 days (post-031) | Paused 2026-06-06 |
| ISSUE-028 | `audit_reader` unwired; sidecar-reading audit/export paths run as `fieldpro` (blocks the 018 lockdown step). **Depends on ISSUE-031; revisit scope after canonical migration completes.** | TBD post-031 | Open |
| ISSUE-029 | PG14 view-owner privilege bridge (intelligence reads execute as `fieldpro` through non-`security_invoker` views). **Depends on ISSUE-031; revisit scope after canonical migration completes** (views likely collapse post-clip). | TBD post-031 | Open |
| ISSUE-030 | Transit-view identity exposure (`v_clean_logs_transit.user_id`) + inconsistent connection/org-context patterns. **Depends on ISSUE-031; revisit scope after canonical migration completes.** | TBD post-031 | Open |
| ISSUE-013 | `resolveNumericOrgId` fail-closed (currently fail-open to lowest-id org). Threads through auth resolution; small but careful. | half day | Open |
| ISSUE-014 | Add `IF NOT EXISTS` guards across migration set + CI replay gate. Makes migration set re-runnable end-to-end. | 1-2 days | Open |
| ISSUE-006 | Offline queue beforeunload flush or IndexedDB migration. Operational reliability for field use. | half day to day | Open |

> **ISSUE-027** (Azure Key Vault credential loading) is a post-Azure follow-on to
> ISSUE-018's resume; tracked under Phase 3's role-wiring work but not blocking until the
> Azure migration begins.

Phase 3 timeline reset: dominated by ISSUE-031 (3-4 weeks, multi-dispatch); 013/014/006
remain ~1 week of independent work that can run alongside.

> **Full Phase 0 context** (the four D-decisions, the PG14 constraint, the connection-pattern
> inventory, the `audit_reader` discovery): `planning/architecture/2026-06-06-issue-018-phase-0-context.md`.

## Phase 4 — Design decisions + their implementations

Mixed — some need conversation, some need code, some need both.

| Issue | Action | Effort |
|-------|--------|--------|
| ISSUE-015 | Decide: legitimate empty state or orphan cleanup? Then implement (LEFT JOIN + UI handling, OR constraint + cleanup migration). | conversation + half day |
| ISSUE-016 | Decide risk-map infra numerator semantics (count-of-visits vs. count-of-problems). Owned by intelligence workstream framing — the decision must be made before intelligence work begins; the implementation IS part of intelligence work. May not be a separate dispatch — may just be "document the decision as a constraint." | conversation only |
| ISSUE-017 | Registry-aware write validation that rejects/quarantines unknown enum keys instead of silently coercing to `other_*_present`. Implementation work. | day or two |

Phase 4 ships in ~3 days mixed.

## Phase 5 — Cleanup leftovers (formal closure with deferral)

These are post-pilot-by-design — implementing them now would cross into
the workstream the cleanup is making space for. Formal closure with
deferral rationale is the right move.

| Issue | Action | Effort |
|-------|--------|--------|
| ISSUE-008 | Formally close as `Deferred to v1.1`, dependency on intelligence workstream (complexity_score requires canonical condition observation type, which is intelligence work). | 30 min |
| ISSUE-010 | Formally close as `Deferred` until S1-2 audit trigger endpoints (`export.data_export`, `admin.user_role_change`) are implemented as features. | 30 min |

Phase 5 ships in ~half day.

## Total Scope

- ~5 phases, ~10-12 individual dispatches
- 2-2.5 weeks of focused dispatching
- Leaves 7.5-8 weeks for capability + intelligence + reporting + polish
  + shadow operation
- Tight but real runway

## Sequencing rules

- Phase 1 must complete before Phase 2 starts (CI safety net gates everything)
- Phase 2 items can run in parallel (touch different files)
- Phase 3 runs sequentially (each item touches real code paths)
- Phase 4 conversations can happen alongside Phase 2/3 dispatches (founder
  + this planning chat); implementations sequential after decisions
- Phase 5 lands last as the final formal-closure pass

## Reference

- Source of truth on each issue: `docs/KNOWN_ISSUES.md`
- Issue triage and open-list snapshot: `docs/OPEN_ISSUES_OVERVIEW.md`
- Founder's framing: "polished demo with no structural failures hidden
  in the repo" (2026-06-05 planning session)

## Phase completion criteria

Each phase is complete when every issue in its row is either:

- Marked `Fixed YYYY-MM-DD` in `docs/KNOWN_ISSUES.md` with reference to commit/PR
- Marked `Deferred to vX.X` with one-paragraph rationale in `docs/KNOWN_ISSUES.md`

The drain phase as a whole is complete when `docs/KNOWN_ISSUES.md` has
zero issues in "Open" status.
