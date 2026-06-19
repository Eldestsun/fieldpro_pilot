# ISSUE-031 — Final Adversarial Verification (read-only pass)

**Date:** 2026-06-19 (file slug retains the dispatch-specified `2026-06-18` name)
**Auditor:** Claude Code (independent verification — did NOT trust prior agents' self-reports; re-proved every claim with live grep, live SQL, live PR/board reads)
**Scope:** ISSUE-031 Stage-2 write-clips (5 living tables) + capstone legacy-function deletion.
**Mode:** READ-ONLY. No code, schema, or Notion edits performed. This findings doc is the only artifact written.

---

## HEADER VERDICT — **COMPLETE (code/data/labor-safety verified); ONE merge outstanding**

All five Stage-2 write-clips are **implemented, merged to `main` (PRs #41–#45), and verified correct** against code, live DB, and the test suite. The capstone (delete dead `rebuildStopRiskSnapshotLegacy`) is **implemented and verified** but its **PR #46 is OPEN, not yet merged** — so on `main` the dead function still physically exists. This is the single item between current state and a fully-merged ISSUE-031.

There are **no correctness failures.** Everything that should have happened, happened correctly; everything out-of-scope correctly did *not* happen. The only "incomplete" element is the human merge step of capstone PR #46, which is the intended workflow (agents draft, human merges).

| Check | Verdict |
|---|---|
| 1 — Write paths clipped (canonical intact) | **PASS** |
| 2 — Tables still exist (Stage-3 not run) | **PASS** |
| 3 — Write-path behavior (0 adapter delta) | **PASS** (via test-harness proof; live-INSERT sim not feasible — see note) |
| 4 — Labor safety wall | **PASS — wall INTACT** |
| 5 — Capstone (dead fn deleted, live untouched) | **PASS** (on capstone branch; not yet on `main` — PR #46 open) |
| 6 — Build/test health | **PASS** (tsc clean; 119/119 tests) |
| 7 — Git state | **PASS** (5 merged; capstone pushed + PR #46 open — contradicts "not pushed" report) |
| 8 — Notion board accuracy | **ACCURATE with minor staleness** (see list) |

---

## Branch topology (established first — prior reports were ambiguous here)

- `main` = `origin/main` = **`7f3acd9`** (in sync, 0/0). Contains **all five clips** via PR merges #41–#45.
- Capstone commit **`1b3c602`** is **pushed** (`origin/feat/issue-031-capstone-delete-legacy-riskmap` == local) and has **OPEN PR #46** — but is **NOT** an ancestor of `main`.
- The capstone branch was cut from `11a6b4f` (pre-infra-merge), so the capstone *branch* is missing the infra clip. **The authoritative production state is `main`**, which has the infra clip. CHECK 1/2/3/4/6 were run on `main`; CHECK 5 on the capstone branch.

---

## CHECK 1 — Write paths clipped (canonical intact) — **PASS**

Live grep on `main` for any `INSERT/UPDATE INTO public.<table>` across `backend/src` + `Scripts`:

```
hazards               → (zero adapter write paths)
trash_volume_logs     → (zero adapter write paths)
clean_logs            → (zero adapter write paths)
stop_photos           → (zero adapter write paths)
infrastructure_issues → (zero adapter write paths)
```

`createInfrastructureIssuesForRouteRunStop` (the old infra mirror-INSERT) **deleted on `main`** — `grep → NONE`. (NOTE: it still appears on the *capstone branch* because that branch predates the infra merge — an artifact of branch topology, not a surviving write. On `main` it is gone.)

**Canonical writes confirmed present** in the same completion path (`backend/src/domains/routeRunStop/cleanLogService.ts::completeStop` → `observationService.ts::emitObservationsForStop` → `insertObservations`):

- `core.observations` INSERT — `observationService.ts:333`
- `core.observation_actor_audit` INSERT (identity → sidecar) — `observationService.ts:367`
- `core.visits` INSERT — `visitService.ts:117`; `core.visit_actor_audit` — `visitService.ts:164`
- `core.evidence` INSERT — `stopPhotosService.ts:67`; `core.evidence_actor_audit` — `stopPhotosService.ts:82`

**Special cases all confirmed:**
- **clean_logs absence=false:** only `if (ui.<bool>)` truthy actions push an observation row (`observationService.ts:175–193`); FALSE → no row; the completed visit is the false-vs-unrecorded anchor. `cleanLogId = visitId` (no mirror). ✔
- **stop_photos:** `core.evidence` write **and** `core.evidence_actor_audit` OID write **both remain** (`stopPhotosService.ts:67,82`), wrapped in one transaction. ✔
- **hazards severity → norm_severity:** `hazard_severity` numeric threaded to `payload.severity` (`observationService.ts:149–160`); normalizer carries it to `norm_severity` via the §4.2 registry rule (`insertObservations:327,360`). No manufactured magnitude when severity absent. ✔
- **infrastructure_issues — all 8 `*_present` types emit:** `mapInfraIssue` (`observationService.ts:280–307`) yields exactly the 8 disjoint types (`glass_damage_present, graffiti_present, receptacle_damage_present, shelter_panel_damage_present, lighting_failure_present, access_obstructed_by_landscape, structural_damage_present, other_infrastructure_issue_present`). ✔

---

## CHECK 2 — Tables still exist (Stage-3 NOT run) — **PASS**

Live `fieldpro_db`:

```
clean_logs            exists=true
hazards               exists=true
infrastructure_issues exists=true
stop_photos           exists=true
trash_volume_logs     exists=true
level3_logs           exists=false   ← correctly dropped (migration 20260613_p1_2)
```

`infrastructure_issues.needs_facilities`: **`is_nullable=NO`, `column_default='true'`, `data_type=boolean`** — present and untouched (decision to drop is Stage-3, not yet executed). ✔

---

## CHECK 3 — Write-path behavior (0 adapter delta) — **PASS (via test harness)**

**Live ROLLBACK-wrapped INSERT simulation is NOT feasible through the available tool:** the MCP `postgres` connection reports `transaction_read_only = on` (as `postgres` user) and rejects writes. A pure-SQL re-implementation of `completeStop` would prove nothing about the app code.

**Fallback proof (stronger than a hand-built sim):** the merged integration test `backend/tests/canonical/infraIssuesWriteClip.test.ts` drives the **real** `completeStop()` with all 8 infra types and asserts:
- `SELECT count(*) FROM public.infrastructure_issues` **before == after** → "completeStop must write ZERO public.infrastructure_issues rows (Stage-2 clip)";
- all 8 `*_present` types emitted to `core.observations`.

It passes (see CHECK 6). `cleanLogsCanonicalPivot.test.ts` likewise asserts "clean_logs is no longer written" while the 5 booleans match canonical actions (incl. false-by-absence). These exercise the live write path end-to-end and confirm **0 adapter-row delta + canonical rows written** — the exact property CHECK 3 sought. Combined with CHECK 1's static proof (no adapter INSERT exists in the path), the behavior is established.

---

## CHECK 4 — Labor safety — **PASS — wall INTACT**

**Grant wall (live `information_schema.role_table_grants`):** on all four sidecars (`observation_actor_audit`, `evidence_actor_audit`, `visit_actor_audit`, `assignment_actor_audit`) the only grantees are `audit_reader` (SELECT), `fieldpro`, `postgres`. **`intelligence_reader` and `mcp_readonly` have ZERO grants** (both roles exist; query returned empty). ✔

**No identity columns on core surfaces:** `core.observations / core.visits / core.evidence` have **no** column matching `oid/actor/created_by/user/worker/reported_by`. ✔

**No real OID on any intelligence-readable view:** view-definition sweep for `created_by_oid / actor_ref / actor_oid` → empty. Two intelligence-readable views *do* expose identity-named columns — `core.v_hazards_transit.reported_by` and `core.v_clean_logs_transit.user_id` — but both are **constant `0`** (live `SELECT DISTINCT` → `{0}`), i.e. zero-information legacy columns, **not** real worker identity. Not a breach.

**Constant-0 confirmation (live):**
```
hazards.reported_by                = {0}   (2 rows)
infrastructure_issues.reported_by  = {0}   (2 rows)
clean_logs.user_id                 = {0}   (7 rows)
```

**ISSUE-036 is the ONLY live-OID-on-read-path:** `listStopPhotosByRouteRunStop` (`stopPhotosService.ts:130`, served via `ulRoutes.ts:298,368`) SELECTs `created_by_oid` from frozen `public.stop_photos`. `intelligence_reader`/`mcp_readonly` have **no grant** on `public.stop_photos`, so this is an app-API exposure, not an intelligence-surface one. Sweep for other live-OID read paths found only:
- `routeRunService.ts` / `loadRouteRunById.ts` `created_by_oid` = **route-run CREATOR** (Lead/Admin enterprise OID joined to `identity_directory`), not field-worker labor attribution — a different actor class, pre-existing, not a worker-tracking surface.
- `sftpExport.ts` / `exportDeleteRoutes.ts` SELECT `s.actor_ref` from the sidecars — these are **admin/DSAR compliance export** paths (run as `fieldpro`/superuser), legitimately reading the walled sidecar; **not** intelligence surfaces.

Verdict: the single worker-OID-serving live read path is ISSUE-036, exactly as claimed. Wall intact.

---

## CHECK 5 — Capstone (dead fn deleted, live untouched) — **PASS** (capstone branch; not on `main`)

On `feat/issue-031-capstone-delete-legacy-riskmap` (`1b3c602`):
- `rebuildStopRiskSnapshotLegacy` — **zero references** in `backend/src` / `frontend/src` (`.ts/.tsx`). (Remaining hits are only docs/changelogs/migration-SQL — historical, expected.)
- `rebuildStopRiskSnapshot` (live, no `-Legacy`) **intact** at `riskMapService.ts:36`; callers intact: `riskMapJob.ts:14`, `adminRoutes.ts:950`; test intact: `riskMapSeverity.test.ts:91,108`.
- No orphaned imports: `Pool` import still used by the live function. **tsc clean (exit 0)** on the capstone branch.

**Caveat (not a failure):** on **`main`** the dead function **still exists** (`riskMapService.ts:386`) because capstone PR #46 is not merged. The deletion is verified-correct but not yet in production.

---

## CHECK 6 — Build / test health — **PASS**

- **`main`:** `tsc --noEmit` exit 0, zero output. `npm test` → **119 passed, 0 failed (119 total)**, exit 0.
- **Capstone branch:** `tsc --noEmit` exit 0.
- The three sequence-added tests exist, are registered in `tests/run.ts`, and pass:
  - `infraIssuesWriteClip.test.ts` — "writes 0 infrastructure_issues rows; all 8 infra `*_present` observations still emit" ✔ (8-infra-types-emit)
  - `hazardSeverityCarry.test.ts` — registered `run.ts:7` ✔ (hazard-severity-carry)
  - `cleanLogsCanonicalPivot.test.ts` — "5 booleans match … incl. false-by-absence … clean_logs is no longer written" ✔ (absence=false / clean_logs)

---

## CHECK 7 — Git state — **PASS** (with one reconciliation vs prior report)

| Branch | local | origin | merged to main |
|---|---|---|---|
| hazards-stage2 | ae37112 | ae37112 | YES (PR #41) |
| trash-volume-stage2 | 014056d | 014056d | YES (PR #42) |
| clean-logs-stage2 | 100a3e1 | 100a3e1 | YES (PR #43) |
| stop-photos-stage2 | 62cf129 | 62cf129 | YES (PR #44) |
| infra-issues-stage2 | 6b21c08 | 6b21c08 | YES (PR #45) |
| capstone-delete-legacy-riskmap | 1b3c602 | 1b3c602 | **NO — PR #46 OPEN** |

- PR merge times: #41 (06-18), #42 (06-18), #43 (06-18), #44 (06-19), #45 (06-19 07:16). **#46 capstone — `merged_at: null`, state `open`.**
- **No amend-after-push divergence:** every branch's local tip == origin tip; merged tips appear verbatim on `main`. No history rewrite detected.

---

## CHECK 8 — Notion board accuracy — **ACCURATE (minor staleness + a hygiene issue)**

| Card | Status | Verdict |
|---|---|---|
| ISSUE-031 "Clip six work-attribution tables…" | **Review** | Substantively ACCURATE — authoritative 2026-06-19 current-state block lists all 5 clips + capstone done; carries the infra_issue_id-never-written correction. One stale line (below). |
| ISSUE-034 needs_facilities founder decision | **Won't Do** | ✔ CONFIRMED — needs_facilities DROPPED, infra clip unblocked. |
| ISSUE-035 populateEamBridge punch-list | Backlog / P2 | ✔ Carries the **corrected** framing: rebuild **entire** `is_exception` from canonical EXISTS (both terms); `infra_issue_id` never written; "NOT restoring one adapter column." No stale "infra still counts" framing. |
| ISSUE-036 listStopPhotos OID pilot-gate | Backlog / P2 (High) | ✔ EXISTS, accurately describes the live-API OID exposure as a pilot hard-gate. |
| Registry-cleanup `infrastructure_issue_present` | filed (P2) | ✔ EXISTS. DB-corroborated: `is_active=true` but never emitted by `mapInfraIssue` (orphan is real). |

**Board issues to fix (not edited in this pass):**
1. **ISSUE-031 card stale line:** body says *"Capstone — DONE, PR pending: … PR not yet opened by Adam."* — **stale.** Capstone PR **#46 IS open** (and the branch is pushed). Update to "PR #46 open, awaiting merge."
2. **Duplicate trackers / scattered cards:** two databases exist — "BASELINE Work Tracker" (collection `51c4c465`) and "BASELINE Work Tracker (1)" (collection `b5667f84`). ISSUE-031/034/035 cards live under the first; **ISSUE-036 lives under the duplicate "(1)" tracker.** Cards are split across two boards — a dispatch-hygiene risk (pick-protocol could miss cards). Recommend consolidating to one tracker.

---

## DISCREPANCIES vs prior agent reports

1. **"Capstone (1b3c602) was NOT pushed" — NOW FALSE.** It is pushed (`origin` == local) and PR **#46 is open**. The dispatch brief and the ISSUE-031 card both still say "not pushed / PR not yet opened." Reality has moved on; only the *merge* remains.
2. **Capstone branch ≠ clean superset of main.** It was cut before the infra merge, so the capstone *branch* lacks the infra clip (its copy of `infrastructureIssueService.ts` still has the mirror INSERT). This is harmless (the eventual PR-merge of #46 into current `main` keeps main's infra clip), but anyone auditing the capstone branch in isolation will see a stale infra file. The infra clip **is** on `main`.
3. **`infra_issue_id` never written — CONFIRMED** (live: `0/12` route_run_stops rows set). Corrects the earlier hazards-changelog assumption that infra "still writes infra_issue_id." ✔
4. **Minor imprecision in the `is_exception` framing:** ISSUE-035 says `hazard_id` "has been NULL since the hazards clip" and `is_exception` "evaluates as permanently false." Live: `hazard_id` is non-null on **2/12** rows (pre-clip legacy residue). So for those 2 rows the stale reader still evaluates `is_exception = true`. The clip correctly stops *new* writes; the point (rebuild from canonical EXISTS) stands, but "permanently false" is true only for post-clip rows, not the 2 legacy ones. Cosmetic; does not affect ISSUE-031 correctness.

---

## REMAINING / DEFERRED (correctly out of scope — absence is intentional, not a gap)

- **Stage-3 physical table DROPs** — all five tables intentionally **still exist** (frozen). Tracked on the ISSUE-031 card as Capability-Build-deferred (readers must retire first). ✔ Not done = correct.
- **Reader repoints (ISSUE-035)** — `populateEamBridge.ts:58` is_exception, `loadRouteRunById.ts:81` clean booleans, `adminRoutes.ts:1286` daily-summary — all consolidated, Backlog/P2. Deferred by the 2026-06-14 sequencing correction (readers are a SURFACE/Capability-Build property, not P1). ✔
- **ISSUE-036 labor-safety pilot-gate** — `listStopPhotosByRouteRunStop` OID repoint — filed, elevated, on the pre-pilot hard-gate checklist. ✔ Correctly tracked, not done.
- **Registry cleanup** — orphaned `infrastructure_issue_present` (`is_active=true`) — filed P2. ✔
- **Capstone merge (PR #46)** — the one open code item to fully land ISSUE-031. Human merge step per the git workflow.

---

## Ambiguities (reported, not guessed)

- **CHECK 3 live-INSERT simulation** could not be run as literally specified (MCP postgres is read-only). Proven instead by the merged integration tests that drive the real write path. Marked PASS on that basis, with the limitation stated rather than hidden.
- **Overall "COMPLETE" vs "INCOMPLETE"** is a definitional call: all *code/data/safety* work is done and verified; one *merge* (PR #46) is outstanding. Graded COMPLETE-pending-merge rather than INCOMPLETE, because nothing is broken or missing — only a human merge remains.

---
---

# ADDENDUM — Independent SECOND-PASS re-verification (2026-06-19, separate auditor)

> Additive only (no edits to the report above). A second independent adversarial pass was run
> per the dispatch, re-proving every claim live and explicitly NOT trusting the report above.
> **Headline: the report above is now substantively CONFIRMED, and its one open item is CLOSED.**
> Two divergences are reconciled below — both resolve in the report's favor or are corrections.

## ⏩ Moving target: `main` advanced DURING verification — capstone is now MERGED

This pass started at `origin/main @ 7f3acd9` and finished at `origin/main @ c094877`. The delta:
```
c094877 Merge pull request #46 from Eldestsun/feat/issue-031-capstone-delete-legacy-riskmap
1b3c602 refactor(issue-031): capstone — delete dead rebuildStopRiskSnapshotLegacy
```
**PR #46 (capstone) is now MERGED into `main`.** Re-proven on `c094877`:
- `grep rebuildStopRiskSnapshotLegacy backend/src` → **0 hits** (the dead function is gone from `main`).
- `git merge-base --is-ancestor origin/feat/issue-031-capstone-delete-legacy-riskmap origin/main` → **true (merged)**.
- Live twin `rebuildStopRiskSnapshot` intact with callers (`riskMapJob.ts:14`, `adminRoutes.ts:950`, `riskMapSeverity.test.ts`).

**Consequence:** the report's sole "outstanding" item — "capstone PR #46 open" — is **CLOSED**.
All six ISSUE-031 branches (5 clips + capstone) are now in `main`. **ISSUE-031 is FULLY MERGED.**

## ✅ Re-confirmed on current `main` (c094877), independently

- **CHECK 1** — zero live adapter write paths for all five tables; canonical writes intact (`emitObservationsForStop` → `INSERT INTO core.observations` + `core.observation_actor_audit`; `stopPhotosService` → `core.evidence` + `core.evidence_actor_audit`). All 8 infra `*_present` types emit via `mapInfraIssue`; clean_logs absence=false; hazard severity → `norm_severity`; trash → `payload.level`. **PASS.**
- **CHECK 2** — five tables exist; `to_regclass('public.level3_logs') = false`; `needs_facilities` boolean NOT NULL DEFAULT true, untouched. **PASS.**
- **CHECK 4 (strengthened)** — used the definitive `has_table_privilege` (covers PUBLIC/membership/ownership), not just `role_table_grants`: `intelligence_reader` and `mcp_readonly` → `can_select = false` on **all four** sidecars (8/8). No identity columns on `core.observations`/`core.visits` at all. Constant-0 confirmed: `clean_logs.user_id`, `hazards.reported_by`, `infrastructure_issues.reported_by` all `{0}`. **Wall INTACT.**
- **CHECK 6** — `tsc --noEmit` exit 0; suite **119 passed, 0 failed**; the 8-types test is real and passing: `✓ infra write-clip: completeStop writes 0 infrastructure_issues rows; all 8 infra *_present observations still emit canonically` (`backend/tests/canonical/infraIssuesWriteClip.test.ts`, 20 test files). **PASS.**

## 🔧 Corrections / reconciliations to the report above

1. **My first-pass scratch numbers were a STALE SNAPSHOT, now superseded.** At `7f3acd9` I transiently
   measured **118/118** and `infraIssuesWriteClip.test.ts` ABSENT. That commit predated the infra-test
   commit; on current `main` (`c094877`) it is **119/119** with the infra test present. **The report
   above (119/119, infra test exists) is CORRECT.** Recording the 118 reading only so the moving target
   is visible, not as a live discrepancy.
2. **CHECK 8 correction — ISSUE-036 IS on the authoritative board.** The report says ISSUE-036 "lives
   under the duplicate (1) tracker." Live fetch shows the authoritative ISSUE-036 card
   (`38367f84-…-813b`, Owner=Founder-Decision, Status=Backlog, Priority=High) is parented to
   **`collection://51c4c465-…` = "BASELINE Work Tracker" (the authoritative board)**. The duplicate board
   merely holds a *second* stale copy. So the pilot-gate is NOT missing from the real board.
3. **Board duplication — precise identity (confirms the report's "two databases" flag):**
   - Authoritative: `collection://51c4c465-1c45-499d-95fb-255167de3650` "BASELINE Work Tracker" (db `0d42108e…`) — **accurate**: ISSUE-031 (Review), ISSUE-034 (Won't Do), ISSUE-035 (Backlog, *corrected* is_exception framing), ISSUE-036 (Backlog/High), registry-cleanup card all present and correct.
   - **STALE DUPLICATE: `collection://b5667f84-1a52-82d6-a339-07983e90f79f` "BASELINE Work Tracker (1)" (db `38467f84…`)** — a shadow copy frozen at 2026-06-19T01:56, carrying the **superseded** ISSUE-035 framing ("infra still counts, held on ISSUE-034"). A dispatch agent reading this board would get contradicted, stale guidance.
   - **Board-hygiene action (founder, not done this pass): DELETE the duplicate "BASELINE Work Tracker (1)" database.** The authoritative board needs no card edits except the now-doubly-stale ISSUE-031 line "PR not yet opened by Adam" (PR #46 is now merged).

## FINAL (second-pass) VERDICT — ISSUE-031: **COMPLETE & FULLY MERGED**

All five Stage-2 write-clips + the capstone are in `main @ c094877`; canonical sole-write-target
verified; labor-safety wall structurally intact (grants 8/8 false); tsc clean; 119/119 green. No
correctness failures. Correctly-deferred (tracked, intentionally not done): Stage-3 physical table
DROPs, ISSUE-035 reader repoints, **ISSUE-036 stop_photos OID pilot-gate (hard gate before pilot)**,
`needs_facilities` physical column drop (ISSUE-034 Won't-Do decision made), and the
`infrastructure_issue_present` registry retirement. One non-code action remains: **delete the
duplicate Notion database "BASELINE Work Tracker (1)"** to remove the stale, contradictory shadow board.
