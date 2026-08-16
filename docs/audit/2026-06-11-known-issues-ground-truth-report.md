# KNOWN_ISSUES Ground-Truth Report — 2026-06-11

> Read-only snapshot. Branch: `chore/known-issues-027-031-backfill` (HEAD `1b0e1e5`).
> The 027–031 backfill landed as **direct commits on this branch (`85267dc`), not via a PR merge** —
> the PAT lacks `pull_requests: write`, so no PR was opened/merged. If you expected a merge commit on
> `main`, it isn't there yet. KNOWN_ISSUES reads correct here because this is the branch's working tree.

---

## 1 + 2. Complete ISSUE list (file order — ID — title — Status verbatim)

| ID | Title | Status (verbatim) |
|----|-------|-------------------|
| ISSUE-001 | Offline queue pending count miscounts after spot check | Closed (not reproducible in current code as of R4 Sub-task D rewrite; regression test added to prevent recurrence). 2026-06-06. |
| ISSUE-002 | Control Center progress bar counts completed-only, should count visited | Fixed 2026-05-12 |
| ISSUE-003 | Control Center surfaces raw database identifiers instead of stop names | Fixed 2026-05-12 (fully closed) |
| ISSUE-004 | Skip stop: "No hazard selected" fires on first attempt despite hazard being selected | Fixed 2026-05-11 |
| ISSUE-005 | baseline:after-replay fires on empty replays, causing fetchRoute loop | Fixed 2026-05-11 |
| ISSUE-006 | Offline queue memoryCache may not flush to localStorage before tab crash | Deferred |
| ISSUE-007 | Hazard severity not captured in canonical observations | Fixed 2026-05-12 |
| ISSUE-010 | S1-2: two trigger points have no hookable code yet | Deferred |
| ISSUE-009 | Four canonical test files are red: stop_id → location_id mapping broken in fixture | Fixed 2026-06-05 |
| ISSUE-008 | complexity_score not computed in stop_effort_history | *(no Status line — body begins "stop_effort_history.complexity_score is always NULL…")* |
| ISSUE-011 | Dev bypass Bearer token enhancement (deferred) | Closed — Won't fix (2026-06-06 founder decision) |
| PATTERN-001 | RLS silent empty-result when org context missing | *(no Status line — "Type: Recurring gotcha — not a single bug, a systemic trap")* |
| ISSUE-012 | GET /api/users returns empty list in local dev; assignment dropdown blank | Fixed 2026-05-18 |
| ISSUE-013 | `resolveNumericOrgId` fails open to lowest-id org when caller org is indeterminate | Deferred — safe in single-org, must fail closed before any multi-org deployment |
| ISSUE-014 | `schema_migrations` drifted from disk state; phase 2/3 reconciled, full set not re-runnable | Reconciled (phase 2/3 stamped 2026-05-21); follow-up deferred |
| ISSUE-015 | Stopless `route_run` returns 404 on `/lead/route-runs/:id` — legitimate state or orphan data? | Open question (not a fix request) |
| ISSUE-016 | Risk-map infra numerator semantics changed by umbrella retirement — defines "problem stop," needs intelligence-layer decision | Open question (not a fix request) — owned by the intelligence workstream |
| ISSUE-017 | Silent enum-key coercion in safety / infra hazard mapping — re-introduces the umbrella anti-pattern through a different door | Open finding (not a fix request) — surfaced during the §9 verification pass |
| ISSUE-018 | Intelligence reads not yet routed through the `intelligence_reader` role — sidecar boundary not yet binding on the running app | Open — follow-on to the 2026-06-01 sidecar-extraction migration |
| ISSUE-019 | Frontend TS error: `StopDetail.tsx` `PhotoDto` id type mismatch fails `build-frontend` on every PR | Fixed 2026-06-06 (cleanup Phase 2) |
| ISSUE-020 | Dependency: `vitest <4.1.0` critical advisory (GHSA-5xrq-8626-4rwp) fails `dependency-audit` | Fixed 2026-06-06 (cleanup Phase 2) |
| ISSUE-021 | CI config: missing `AZURE_TENANT_ID` / `AZURE_API_AUDIENCE` hard-throws at import, preventing ALL backend test execution | Fixed 2026-06-05 — `AZURE_TENANT_ID` and `AZURE_API_AUDIENCE` added to repo secrets (Fix shape (a)) for the `test-backend` job |
| ISSUE-022 | CI test database missing `TEST_POOL` seed row, causes all integration tests to fail | Fixed 2026-06-05 — seed step added to CI (`test-backend`) + `backend/tests/fixtures/seed.sql` |
| ISSUE-023 | Five canonical tests reference identity columns dropped by the sidecar extraction | Filed and Fixed 2026-06-05 |
| ISSUE-024 | `sync_transit_stop_primary_asset` trigger inserts into `transit_stop_assets` without NOT NULL `org_id` | Open — latent production defect, discovered during cleanup Phase 1 |
| ISSUE-025 | CI `test-backend` runs as a superuser, bypassing RLS; RLS-enforcement tests cannot pass | Open — CI infrastructure / architecture, discovered during cleanup Phase 1 |
| ISSUE-026 | Dev bypass code paths must be gated for production deployment | Open — filed 2026-06-06 (cleanup Phase 2; replaces ISSUE-011's tracking) |
| **ISSUE-027** | Azure Key Vault credential loading / `AzureKeyVaultAdapter` is a stub | Open — filed 2026-06-11 (KNOWN_ISSUES 027–031 backfill; referenced across the codebase but never tracked) |
| **ISSUE-028** | `audit_reader` role is NOLOGIN / unwired; export channel still reads sidecars as `fieldpro` | Open — filed 2026-06-11 (KNOWN_ISSUES 027–031 backfill) |
| **ISSUE-029** | PostgreSQL 14 blocks PG15+ `security_invoker` views and the PostGIS geometry path | Open — deferred post-pilot |
| **ISSUE-030** | Six `core.v_*_transit` log views are SELECT-granted to `intelligence_reader` (labor-safety surface widening) | Open — filed 2026-06-11 (KNOWN_ISSUES 027–031 backfill) |
| **ISSUE-031** | Complete the v0001 → canonical migration / clip work-attribution (umbrella issue) | Open — design-settled in the ADR; blocked on founder answers to DQ-1..DQ-5 and on authoring the migration-sequence artifact |

**Order note:** the file is not strictly numeric — it runs 001–007, then **010, 009, 008, 011, PATTERN-001**, then 012 onward in order. That ordering predates the backfill; 027–031 were appended cleanly at the end. 32 headers total (31 ISSUE + 1 PATTERN-001).

**Open / actionable (not Fixed/Closed):** 006, 008, 010, 013, 014, 015, 016, 017, 018, 024, 025, 026, 027, 028, 029, 030, 031, PATTERN-001.
**Fixed/Closed:** 001, 002, 003, 004, 005, 007, 009, 011, 012, 019, 020, 021, 022, 023.

---

## 2. Confirmation: ISSUE-027–031 exist

All five present. Title + Status for each:

- **ISSUE-027 — Azure Key Vault credential loading / `AzureKeyVaultAdapter` is a stub**
  Status: `Open — filed 2026-06-11 (KNOWN_ISSUES 027–031 backfill; referenced across the codebase but never tracked)`
- **ISSUE-028 — `audit_reader` role is NOLOGIN / unwired; export channel still reads sidecars as `fieldpro`**
  Status: `Open — filed 2026-06-11 (KNOWN_ISSUES 027–031 backfill)`
- **ISSUE-029 — PostgreSQL 14 blocks PG15+ `security_invoker` views and the PostGIS geometry path**
  Status: `Open — deferred post-pilot`
- **ISSUE-030 — Six `core.v_*_transit` log views are SELECT-granted to `intelligence_reader` (labor-safety surface widening)**
  Status: `Open — filed 2026-06-11 (KNOWN_ISSUES 027–031 backfill)`
- **ISSUE-031 — Complete the v0001 → canonical migration / clip work-attribution (umbrella issue)**
  Status: `Open — design-settled in the ADR; blocked on founder answers to DQ-1..DQ-5 and on authoring the migration-sequence artifact`

---

## 3. `planning/intelligence-layer/` contents

```
ARRIVAL_PHASE_DATA_PATH.md
INTELLIGENCE_LAYER_DESIGN_QUESTIONS.md
SPOT_CHECK_DATA_PATH.md
```

---

## 4. The three named files — exist + first heading line

- `planning/intelligence-layer/INTELLIGENCE_LAYER_DESIGN_QUESTIONS.md` — **PRESENT** — `# Intelligence Layer — Design Questions & Founding Spec`
- `planning/intelligence-layer/SPOT_CHECK_DATA_PATH.md` — **PRESENT** — `# Spot Check Data Path — Findings Memo`
- `planning/intelligence-layer/ARRIVAL_PHASE_DATA_PATH.md` — **PRESENT** — `# Arrival Phase Data Path — Findings Memo`

---

## 5. canonical-core inventory on disk

**Absent** at the named path with content. `planning/architecture/2026-06-06-canonical-core-complete-inventory.md` exists but is **0 bytes** (empty placeholder). The real 663-line file is **not** in this branch's working tree at `docs/audit/` — it lives on `feat/issue-031-core-inventory` (commit `d4a6846`). If you "just added it," it did not land on this branch / this path with content — worth re-checking where your copy went.

---

## 6. `git log --oneline -8`

```
1b0e1e5 docs(issue-031): correct CORE-INV "missing" claim in audit + ISSUE-031
f4c633e docs(issue-031): snapshot working-tree artifacts — live audit, ADR, boundary updates
85267dc docs(issue-031): backfill KNOWN_ISSUES ISSUE-027..031
ea829cb docs(issue-031): ADAPTER_BOUNDARY.md reconciliation audit findings
9aafc8c Merge pull request #6 from Eldestsun/feat/issue-031-adapter-inventory
e15dc04 docs(issue-031): transit adapter complete pre-design inventory
ec041f8 Merge pull request #5 from Eldestsun/feat/cleanup-phase-2-small-fixes
0e69c20 fix(cleanup): Phase 2 small contained fixes — ISSUE-019/020/001, close 011, file 026
```

**Flags:**
1. The "tracker-hygiene merge" is **not a merge** — the backfill is commit `85267dc` directly on `chore/known-issues-027-031-backfill` (HEAD `1b0e1e5`), never PR-merged (token can't open PRs). KNOWN_ISSUES looks right because you're reading this branch's tree, not `main`.
2. Item 5: the canonical-core file you expected is **0 bytes** at the `planning/architecture/` path. Re-check where your copy actually landed.
