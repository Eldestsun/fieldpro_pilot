# Open Issues Overview — FieldPro / BASELINE

_Snapshot generated 2026-06-05 from `docs/KNOWN_ISSUES.md`. 15 open issues + 1 standing pattern. Fixed/closed entries (002, 003, 004, 005, 007, 012, 021) excluded._

---

## 🔴 Active CI / build blockers — highest priority (surfaced 2026-06-04/05)

| ID | Severity | Summary |
|----|----------|---------|
| **ISSUE-022** | HIGH | CI test DB missing `TEST_POOL` seed row → every `canonical/` integration test fails. Surfaced once 021's fix restored test execution. Backend changes still land without integration coverage. |
| **ISSUE-019** | medium | `StopDetail.tsx:394` `PhotoDto.id` number-vs-string `TS2345` fails `build-frontend` on every PR. Pre-existing on `main`. One-file frontend fix. |
| **ISSUE-020** | moderate | `vitest <4.1.0` critical advisory (GHSA-5xrq-8626-4rwp) fails `dependency-audit`. Advisory-DB drift; needs a version bump — re-running CI won't clear it. |

> **ISSUE-021** (the `authz.ts` env-throw that blocked *all* backend tests) was **fixed 2026-06-05** — but closing it exposed 022. Together these mean backend integration CI is still effectively non-green.

---

## 🟠 Multi-tenant / security / ops hardening (latent, pre-scale)

| ID | Severity | Summary |
|----|----------|---------|
| **ISSUE-013** | medium | `resolveNumericOrgId` fails open to lowest-id org when caller org is indeterminate. Safe in single-org KCM; cross-tenant defect the moment a 2nd org is added. Must fail closed. |
| **ISSUE-018** | medium | Intelligence reads not yet routed through the no-grant `intelligence_reader` role — sidecar boundary exists at DB level but app connects as `fieldpro`, so it's not yet binding in-app. Follow-on to the 2026-06-01 sidecar extraction. |
| **ISSUE-006** | medium | Offline queue `memoryCache` may not flush to `localStorage` before tab crash → queued stop data lost. Needs `beforeunload` flush or IndexedDB. |
| **ISSUE-014** | medium | `schema_migrations` drift reconciled, but full migration set is not re-runnable end-to-end (non-idempotent DDL). Follow-up (IF NOT EXISTS guards + CI replay gate) deferred. |
| **ISSUE-011** | low | Dev-bypass Bearer token enhancement reverted; re-implement only if remote agent tooling moves to Bearer auth. |

---

## 🟡 State-layer / intelligence design decisions (open questions, not fix requests)

| ID | Severity | Summary |
|----|----------|---------|
| **ISSUE-016** | unknown | Risk-map infra numerator semantics shifted (count-of-visits → count-of-problems) by umbrella retirement. Defines what a "problem stop" *is* — owned by intelligence workstream. |
| **ISSUE-017** | low / latent | Silent enum-key coercion in `mapSafetyHazard`/`mapInfraIssue` → unknown keys become generic `other_*_present`, re-opening the umbrella anti-pattern. Fold into registry-aware write validation (§9 item 3). |
| **ISSUE-015** | unknown | Stopless `route_run` 404s on `/lead/route-runs/:id` — legitimate empty-state (LEFT JOIN + UI) or orphan data (constraint + cleanup)? Product decision for the Lead. |
| **ISSUE-008** | post-pilot | `stop_effort_history.complexity_score` always NULL — needs a canonical "condition" observation type with consistent payload. Not consumed by any current surface. |

---

## 🟢 Lower-priority / coverage

| ID | Severity | Summary |
|----|----------|---------|
| **ISSUE-009** | medium | Four canonical test files red — fixture `stop_id → location_id` mapping broken after R11 (`FIXTURE_STOP_ID="31150"` no longer resolves via `core.v_locations_transit`). |
| **ISSUE-001** | low | Offline queue pending count miscounts after spot check (cosmetic; data writes correctly). Tied to `OfflineSyncManager` terminal-action handling. |
| **ISSUE-010** | low | S1-2 audit wiring: `export.data_export` + `admin.user_role_change` audit writes have no trigger point yet (endpoints not built). |

---

## Standing pattern (not a single bug)

- **PATTERN-001** — RLS silent empty-result when `app.current_org_id` is unset. Root of ISSUE-005/012/013/014 and the role-rename backfill. Every RLS-table access must go through `withOrgContext`.

---

### Quick read

The three CI blockers (**022 / 019 / 020**) are the only items actively breaking every PR right now and are the natural next dispatch. Everything else is latent or a deferred design call.
