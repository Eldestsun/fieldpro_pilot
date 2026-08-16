> Audit produced against commit: ea829cb
> Audit date: 2026-06-11

# BASELINE Live Repo Audit — 2026-06-11

## 0. Purpose

This document is the single source of truth for building the BASELINE Notion Kanban.
It covers: all open issues, all unstarted/blocked capability items, all open security
sprint items, verified ISSUE-031 Q4/Q6 findings, live schema state, test status,
and migration status. It supersedes the planning index files wherever they conflict
with live state.

**Source-of-truth reads completed before this audit:**
- `docs/audit/2026-06-06-transit-adapter-complete-inventory.md` ✅ read
- `docs/audit/2026-06-07-adapter-boundary-reconciliation.md` ✅ read
- `planning/architecture/2026-06-07-issue-031-redesign-adr.md` ✅ read (the prompt cited it under `docs/audit/`; it actually lives in `planning/architecture/`)
- `docs/audit/2026-06-06-canonical-core-complete-inventory.md` — the ADR and the boundary-reconciliation both cite it as `CORE-INV`, a live-verified companion to the transit inventory. **[CORRECTED 2026-06-11]** This audit originally reported the file as "DOES NOT EXIST" because the audit branch was cut from history predating it and a `find` over the working tree returned nothing. **That was wrong.** The real 663-line file IS committed at `docs/audit/2026-06-06-canonical-core-complete-inventory.md` on branch `feat/issue-031-core-inventory` (commit `d4a6846`), since merged. It was simply absent from the working branch's tree, not missing from the repo. (A stray 0-byte placeholder by the same name briefly sat at `planning/architecture/`; ignore it — the real content is at the `docs/audit/` path above.) **Not a gap.**

> ⚠️ **Audit-induced state change (full disclosure):** Section 11 ran `npm run migrate` (operator-approved). The runner was **not** a pure no-op — it found and applied one genuinely-pending migration, `20260530_rls_harden_core_location_org_isolation.sql`. This is an idempotent RLS-policy harden (defense-in-depth, fail-closed). Schema-migration count went 61 → 62. Details in §11 and §13. All other sections are read-only.

---

## 1. Known Issues (open / deferred / open questions)

Source: `docs/KNOWN_ISSUES.md`. Listed = status is NOT "Fixed"/"Resolved". Quoted exactly as written.

| ID | One-line description | Status (verbatim) |
|----|----------------------|-------------------|
| ISSUE-006 | Offline queue memoryCache may not flush to localStorage before tab crash | **Deferred** |
| ISSUE-008 | complexity_score not computed in stop_effort_history | *(no Status line; body: "Priority: post-pilot — complexity_score is not consumed by any current surface.")* |
| ISSUE-010 | S1-2: two trigger points have no hookable code yet (`export.data_export`, `admin.user_role_change` audit writes) | **Deferred** |
| ISSUE-013 | `resolveNumericOrgId` fails open to lowest-id org when caller org is indeterminate | **Deferred — safe in single-org, must fail closed before any multi-org deployment** |
| ISSUE-014 | `schema_migrations` drifted from disk state; phase 2/3 reconciled, full set not re-runnable | **Reconciled (phase 2/3 stamped 2026-05-21); follow-up deferred** |
| ISSUE-015 | Stopless `route_run` returns 404 on `/lead/route-runs/:id` — legitimate state or orphan data? | **Open question (not a fix request)** |
| ISSUE-016 | Risk-map infra numerator semantics changed by umbrella retirement — defines "problem stop," needs intelligence-layer decision | **Open question (not a fix request) — owned by the intelligence workstream** |
| ISSUE-017 | Silent enum-key coercion in safety / infra hazard mapping — re-introduces the umbrella anti-pattern through a different door | **Open finding (not a fix request) — surfaced during the §9 verification pass** |
| ISSUE-018 | Intelligence reads not yet routed through the `intelligence_reader` role — sidecar boundary not yet binding on the running app | **Open — follow-on to the 2026-06-01 sidecar-extraction migration** |
| ISSUE-024 | `sync_transit_stop_primary_asset` trigger inserts into `transit_stop_assets` without NOT NULL `org_id` | **Open — latent production defect, discovered during cleanup Phase 1** |
| ISSUE-025 | CI `test-backend` runs as a superuser, bypassing RLS; RLS-enforcement tests cannot pass | **Open — CI infrastructure / architecture, discovered during cleanup Phase 1** |
| ISSUE-026 | Dev bypass code paths must be gated for production deployment | **Open — filed 2026-06-06 (cleanup Phase 2; replaces ISSUE-011's tracking)** |
| PATTERN-001 | RLS silent empty-result when org context missing (systemic trap, not a single bug) | *(no Status line — "Type: Recurring gotcha — not a single bug, a systemic trap")* |

**Severity / target notes carried from the file:**
- ISSUE-006: severity medium. Target: "Pre-scale hardening (before multi-agency rollout)".
- ISSUE-013: severity medium (latent). Target: "Pre-multi-org hardening (must close before the second tenant is provisioned)".
- ISSUE-014: severity medium (latent). Target: "Pre-pilot deploy hardening". **Directly relevant to §11 below** — the just-applied migration is exactly the drift pattern this issue warns about.
- ISSUE-018: severity medium (latent). Target: "Intelligence-layer workstream".
- ISSUE-024: severity medium. Target: "dedicated trigger-fix dispatch".
- ISSUE-025: severity medium. Target: "ISSUE-018's app-connection wiring dispatch (Phase 3 of the cleanup drain plan)".
- ISSUE-026: severity **HIGH** (pre-pilot blocker). Target: "Pre-pilot."

**Closed but not literally labeled "Fixed"/"Resolved" (noted for completeness, excluded from open work):**
- ISSUE-001 — "Closed (not reproducible in current code as of R4 Sub-task D rewrite; regression test added…). 2026-06-06."
- ISSUE-011 — "Closed — Won't fix (2026-06-06 founder decision)." Tracking replaced by ISSUE-026.

**Issues confirmed Fixed/Resolved (excluded):** 002, 003, 004, 005, 007, 009, 012, 019, 020, 021, 022, 023.

---

## 2. Capability Build — Not Started / Deferred

Source: `planning/capability-build/CAPABILITY_BUILD_INDEX.md`. Every item with status 🔴 or ⛔ (i.e. **all** of them — no capability item has begun).

| ID | Capability (verbatim) | Status (verbatim) | Spec file? |
|----|-----------------------|-------------------|-----------|
| T1-A5 | Audit log viewer UI | 🔴 Not started | ✅ `specs/T1-A5-audit-log-viewer.md` |
| T1-CC | Control Center relocation (Admin → Dispatch) | 🔴 Not started | ✅ `specs/T1-CC-control-center-relocation.md` |
| T1-A6 | Export-and-delete UI | 🔴 Not started | ✅ `specs/T1-A6-export-and-delete-ui.md` |
| T1-D4 | Reassign UI on live route runs | 🔴 Not started | ✅ `specs/T1-D4-reassign-ui.md` |
| T2-D5 | Stop-level history view | 🔴 Not started | ✅ `specs/T2-D5-stop-history-view.md` |
| T2-A2 | Retire stop button | 🔴 Not started | ✅ `specs/T2-A2-retire-stop-button.md` |
| T2-A7 | System health page | 🔴 Not started | ✅ `specs/T2-A7-system-health-page.md` |
| T3-D3 | Ad-hoc route creation | 🔴 Not started | ✅ `specs/T3-D3-adhoc-route-creation.md` |
| T3-A3 | User directory (read-only) | 🔴 Not started | ✅ `specs/T3-A3-user-directory-readonly.md` |
| A-4 | Route templates / schedules | ⛔ Deferred post-pilot | ❌ no spec (Tier 4 — "no spec" by design) |
| D-4-add | Add/remove live stops on running runs | ⛔ Deferred post-pilot | ❌ no spec (Tier 4 — "no spec" by design) |

**Spec/index reconciliation:** 9 spec files exist in `planning/capability-build/specs/`; all 9 correspond 1:1 to a 🔴 Not-started index row. No orphan specs, no missing specs for non-deferred items. The two ⛔ items intentionally have no spec.

**Founder To-Dos recorded in the index (out of code, pre-deploy):**
- F-1: "Identify Admin accounts that need Dispatch role in Entra and assign before T1-CC ships." Blocks T1-CC deploy.
- F-2: "Close ISSUE-010 with a pointer to `T3-A3-user-directory-readonly.md` once T3-A3 is dispatched or shipped." Issue tracker hygiene.

---

## 3. Security Sprint — Not Started / In Review

Source: `planning/SECURITY_SPRINT_INDEX.md`. Every item with status 🔴 or 🟠. (Sprint 1 fully 🟢 Done; Sprint 2 mostly 🟢 except the two below.)

| ID | Name (verbatim) | Status (verbatim) |
|----|-----------------|-------------------|
| S2-9 | WCAG 2.1 AA Conformance Statement | 🟠 In review — prereqs 1+2 open; S3-4 pending |
| S2-10 | TPRA Questionnaire Answers + Integration Options Matrix | 🔴 Not started |
| S3-2 | Configure Managed DB Backups + Multi-AZ | 🔴 Not started |
| S3-3 | Confirm 99.9% Uptime SLA from Hosting Provider | 🔴 Not started |
| S3-4 | VoiceOver / TalkBack Manual Test — UL Mobile Stop Flow | 🔴 Not started |
| S3-5 | Review + Sign Off All S2 Policy Documents | 🔴 Not started |
| S3-6 | Coordinate KCM Azure Entra Test Account for SSO Validation | 🔴 Not started |
| S3-7 | Final TPRA Package Assembly and Submission | 🔴 Not started |
| S3-8 | Rotate All Secrets Post-S1 | 🔴 Not started |
| S3-9 | GitHub Branch Protection on `main` | 🔴 Not started |
| S3-10 | Container Registry Configuration (GHCR or ECR) | 🔴 Not started |
| S3-11 | Azure Entra Domain Verification for Production | 🔴 Not started — Render redirect URI mismatch identified (AADSTS50011); config task only |

### S2-9 Prerequisites (the three open sub-items, verbatim)

| # | Item | Type | Owner | Status |
|---|------|------|-------|--------|
| 1 | **Modal focus management JS** — `useEffect`-based focus trap on 5 dialog components (ConfirmDialog, ImagePreviewModal, ConflictResolutionModal, Safety Modal, Infra Modal)… Assessed as not a WCAG 2.1 AA failure in S2-9 (§6.1). | Code | Agent | 🔴 Open |
| 2 | **Photo remove button touch target** — 20×20px on photo strip overlay; below WCAG 2.5.5 AAA minimum. Not a Level AA violation. Documented in S2-9 §6.2. Requires product/design decision before closing. | Product decision | Founder | 🔴 Open |
| 3 | **VoiceOver / TalkBack manual run** — tracked as S3-4 (Founder task). Specific verification targets documented in S2-9 §6.3. | QA | Founder | 🔴 Open (S3-4) |

### TPRA-Ready Checklist — unchecked items (`[ ]`)

**Code**
- [ ] SFTP export writer deployed and tested against staging

**Documents** (all 10 unchecked)
- [ ] NIST SP 800-53 control mapping — written 2026-05-14; pending S3-1 update + S3-5 sign-off
- [ ] WA OCIO 141.10 alignment statement — written 2026-05-14; pending S3-1 update + S3-5 sign-off
- [ ] Incident Response Plan — written 2026-05-14; pending S3-1 update + S3-5 sign-off
- [ ] Business Continuity summary — written 2026-05-14; pending S3-2 update + S3-5 sign-off
- [ ] Data classification document — written 2026-05-14; pending S3-5 sign-off
- [ ] Log retention policy — written 2026-05-14; pending S3-5 sign-off
- [ ] Data use limitation policy — written 2026-05-14; pending S3-5 sign-off
- [ ] ArcGIS integration roadmap — written 2026-05-14; pending S3-5 sign-off
- [ ] WCAG 2.1 AA Conformance Statement — written 2026-05-14; S2-9 prereqs 1+2 open; pending S3-4 + S3-5
- [ ] TPRA questionnaire answers + integration options matrix — not started (S2-10)

**Infrastructure** (1 of 4 checked)
- [ ] Managed DB backups confirmed, schedule documented
- [ ] Multi-AZ or equivalent HA configured
- [ ] Staging environment accessible at a stable URL
- (✅ checked: Hosting platform selected — Render (testing/demos) + Azure Enterprise (pilot deployment))

**External** (all 4 unchecked)
- [ ] KCM Azure Entra test account obtained
- [ ] SSO integration validated against KCM tenant in staging
- [ ] VoiceOver / TalkBack manual accessibility test completed
- [ ] Founder has reviewed all policy documents

---

## 4. Refactor Index — Incomplete Items

Source: `planning/REFACTOR_INDEX.md`.

**All 8 tiers are 🟢 Done.** Explicitly: Tier 1 (Canonical Completeness) 🟢, Tier 2 (Intelligence Migration) 🟢, Tier 3 (Reconnect Control Center) 🟢, Tier 4 (Schema Cleanup) 🟢, Tier 5 (Assignment Layer) 🟢, Tier 6 (Infrastructure) 🟢, Tier 7 (Row Level Security & Tenant Isolation) 🟢, Tier 8 (Asset Type Abstraction) 🟢.

**No incomplete refactor tiers.**

---

## 5. Refinement Index — Incomplete Items

Source: `planning/REFINEMENT_INDEX.md`.

| ID | Name (verbatim) | Status (verbatim) |
|----|-----------------|-------------------|
| R7 | Historical Backfill Framework (Scale Asset) | 🔴 Not started — low priority, post-pilot |

All other items (R1–R6, R8, R9, R10) are 🟢 Done. **R7 is the only incomplete refinement item.**

---

## 6. ISSUE-031 Gate Verification (Q4 and Q6)

### Q4 — `transit_stop_assets` write mechanism

**Method results:**

- **(a/b) `grep -r "transit_stop_assets" backend/src --include="*.ts"`** → only **one** file: `backend/src/intelligence/riskMapService.ts`. Every reference is a **read** (a `JOIN transit_stop_assets tsa` inside the risk-rebuild SQL) or a comment:
  - `riskMapService.ts:50` — comment: `asset_id (canonical) → transit_stop_assets (one-hop adapter lookup) → stop_id`
  - `riskMapService.ts:74` — comment: `core.visits → transit_stop_assets (asset_id translation) → stop_id.`
  - `riskMapService.ts:80, :95, :113, :140, :296` — `JOIN transit_stop_assets tsa …` (reads)
  - `riskMapService.ts:282` — comment: `route_run_stop_id is not yet on core.visits (Tier 5), so we use the transit_stop_assets …`
  - One additional TS reference outside `backend/src`: `backend/scripts/verify_rls.ts:242–243` — uses the table only as a **read-only RLS test target** (`expectAny: true/false`), not a writer.
- **(c) migrations** referencing the table: `legacy_20251226_core_mapping_views.sql`, `legacy_20251222_phase5c_escape_hatch.sql`, `20260530_sidecar_extraction_a_additive.sql`, `legacy_20251226_core_backfill_coreAsset_locations_from_transit_stop_assets.sql`, `00000000_consolidated_schema.sql`, `20260518_rls_phase2_add_orgid.sql`, `legacy_schema_dump.sql`. The actual `INSERT INTO … transit_stop_assets` statements live in:
  - `legacy_20251222_phase5c_escape_hatch.sql:30`
  - `00000000_consolidated_schema.sql:191` — **inside the trigger function `sync_transit_stop_primary_asset()`** (`INSERT … ON CONFLICT (stop_id, asset_id, role) WHERE active = true DO UPDATE …`). This is the same trigger carrying the **ISSUE-024** latent NOT-NULL-`org_id` defect.
  - `legacy_schema_dump.sql:186` (historical dump)
- **(d) scripts:** `backend/scripts/verify_rls.ts` only (read-only RLS test, above). **No seeder/loader writer.**
- **(e) `SELECT count(*)`** → **14,916 rows**
- **(f) `min/max/count`** → `min_id=1, max_id=14916, count=14916` (dense, contiguous — consistent with a one-shot bulk seed/migration backfill, no runtime gaps)

**Q4 VERDICT:** **No TypeScript application writer exists.** All 14,916 rows are **seed/migration/trigger-only**. The sole write paths are (1) the DB trigger `sync_transit_stop_primary_asset()` (fires on `transit_stops.asset_id` INSERT/UPDATE — currently no runtime path inserts `transit_stops`, so latent; this trigger is the ISSUE-024 defect site) and (2) legacy/consolidated migration seed. This confirms the prior-session expectation: the asset-linking layer is written by trigger + migration, not by app code — so demoting `transit_stop_assets` to an ingestion-time seed (ADR Q-A/Q-B) requires **no TypeScript writer migration**, only the trigger and the seed path. The open gate from §12 (Q4) is now **CLOSED — confirmed seed/migration/trigger-only.**

### Q6 — `mcp_readonly` grants

Live results (postgres MCP, 2026-06-11):

- **(b) `has_table_privilege('mcp_readonly','core.visit_actor_audit','SELECT')`** → **true**
- **(c) `has_table_privilege('mcp_readonly','core.observation_actor_audit','SELECT')`** → **true**
- **`core.evidence_actor_audit`** → **true**;  **`core.assignment_actor_audit`** → **true**
- **(d) `has_table_privilege('mcp_readonly','public.identity_directory','SELECT')`** → **true**
- **(a) full grant list** confirms `mcp_readonly` holds SELECT on **all four `*_actor_audit` sidecars**, `public.identity_directory`, every `public.*` work-attribution log (`clean_logs`, `hazards`, `infrastructure_issues`, `level3_logs`, `stop_photos`, `trash_volume_logs`), `route_runs` (which carries `assigned_user_oid`/`created_by_oid`), and the whole canonical surface.

**Contrast (control):** `intelligence_reader` has SELECT on **none** of the four sidecars and **not** on `identity_directory` (all four `has_table_privilege` checks → **false**). The no-grant labor-safety boundary is correct for `intelligence_reader` and **violated by `mcp_readonly`.**

**Q6 VERDICT:** **Labor-safety exposure CONFIRMED.** `mcp_readonly` is a **LOGIN** role (`rolcanlogin=true`) that can read every identity sidecar plus `identity_directory` — i.e. it can resolve any plaintext/encrypted actor reference to a named, emailed worker, and can join work-attribution logs to individuals. This is exactly the exposure ADR **Q-G** settles ("`mcp_readonly` **revoked to canonical-only**… No exemption"). The revocation has **not** yet been applied. The open gate from §12 (Q6) is now **CLOSED as a finding — exposure is real and unremediated.**

---

## 7. Code TODOs / FIXMEs / Stubs

Scan over `backend/src/` and `frontend/src/` (node_modules excluded).

**(a) TODO**
- `backend/src/lib/oidCipher.ts:143` — ` * TODO (S3-1 — hosting decision):`

**(b) FIXME** — none.

**(c) HACK** — none.

**(d) ISSUE-0 (ISSUE-0XX references in code)**
- `frontend/src/components/today-route/StopDetail.tsx:388` — `// optimistic placeholders use a non-colliding string id (ISSUE-019).`
- `frontend/src/offline/offlineQueue.test.ts:11` — `// ISSUE-001 regression guard.`
- `frontend/src/offline/offlineQueue.test.ts:47` — `describe('offlineQueue — ISSUE-001 pending count clears after spot check', () => {`

**(e) @deprecated**
- `frontend/src/components/ui/OpsButton.tsx:14` — `/** @deprecated Use className instead. Kept for backward compat. */`

**(f) "not yet implemented" (case-insensitive)** — none.

**(g) `\bstub\b` (whole word, comment lines only)**
- `backend/src/lib/oidCipher.ts:39` — `*   NODE_ENV === 'production'  → AzureKeyVaultAdapter  ← STUB (see below)`
- `backend/src/lib/oidCipher.ts:138` — `// ── AzureKeyVaultAdapter (stub) ──────────────────────────────────────────────`
- `backend/src/lib/oidCipher.ts:146` — `*   3. Replace stub methods with real SDK calls:`

**Reading of the scan:** the codebase is exceptionally clean of loose markers. The only substantive code TODO/stub cluster is `oidCipher.ts` — the **AzureKeyVaultAdapter is a stub** pending the production hosting decision (S3-1, now decided as Azure Enterprise). This ties to ADR **Q-E** (uniform sidecar encryption) and to S1-13. The `ISSUE-0` hits are all benign back-references (regression-test labels and an explanatory comment), not open defects. `@deprecated` is a single retained-for-compat prop on `OpsButton`.

---

## 8. Planning Directory Gaps

**(a) Planning `.md` filenames containing TODO/WIP/draft/stub (case-insensitive):** **none.**

**(b) `planning/capability-build/specs/` vs index status:** 9 spec files, all mapping to 🔴 Not-started index rows (see §2 table). No spec corresponds to a 🟡 or 🟢 entry (nothing has progressed). The two ⛔-deferred items (A-4, D-4-add) correctly have no spec.

**(c) ISSUE-031 migration-sequence artifact:** **MISSING.**
- `ls docs/audit/ | grep -i "031\|migration-sequence\|migration_sequence"` → no match. A repo-wide `find` for `migration.sequence` / `031.*sequence` also returns nothing.
- The ADR (§9 scope frame, §8) explicitly states the migration sequence "is a **separate artifact** written against this one," and §7 lists DQ-1…DQ-5 as the questions that artifact needs answered first. **That artifact does not yet exist.** ISSUE-031 cannot move from design to execution until it is written (and DQ-1…DQ-5 are answered by the founder).

---

## 9. Schema State (live DB)

DB reachable. All queries run via postgres MCP on 2026-06-11 (then 2026-06-12 UTC for the post-migrate confirm).

### (a) Non-system schemas
`core`, `public` (plus ephemeral `pg_temp_*` / `pg_toast_temp_*` session schemas).
**No `admin` schema and no `transit` schema exist** — both are ADR *target* namespaces not yet created (ADR §6 lists `admin` as "NEW schema (does not exist today)"; `transit` is the proposed adapter namespace under open question DQ-1).

### (b) Tables in core / public / admin / transit

**`core.*` (25 relations incl. views returned by `information_schema.tables`):** `asset_locations`, `asset_types`, `assignment_actor_audit`, `assignments`, `evidence`, `evidence_actor_audit`, `location_external_ids`, `locations`, `observation_actor_audit`, `observation_type_registry`, `observations`, `visit_actor_audit`, `visits` — plus the 12 `core.v_*` views (`v_asset_locations_transit`, `v_assets`, `v_assignments_transit`, `v_clean_logs_transit`, `v_hazards_transit`, `v_infra_transit`, `v_level3_logs_transit`, `v_locations`, `v_locations_transit`, `v_stop_location_map`, `v_stop_photos_transit`, `v_trash_volume_logs_transit`).

> The four `*_actor_audit` sidecars are present and isolated; the six `core.v_*_transit` log views named in ADR CANON-1 for eviction are **all still in `core`** (see §9c, §12 Q2).

**`public.*` base tables + views (34):** `asset_external_ids`, `asset_types`, `assets`, `audit_log`, `bases`, `clean_logs`, `eam_bridge_populate_state`, `eam_bridge_route_log`, `export_delete_tokens`, `export_pool_daily_summary_v1`*, `export_route_run_origin_mix_v1`*, `export_stop_status_v1`*, `hazards`, `identity_directory`, `infrastructure_issues`, `lead_route_overrides`, `level3_logs`, `organizations`, `route_pools`, `route_run_stops`, `route_runs`, `schema_migrations`, `stop_assets_v1`*, `stop_condition_history`, `stop_effort_history`, `stop_photos`, `stop_pool_memberships`, `stop_risk_snapshot`, `stops`*, `stops_legacy`, `transit_stop_assets`, `transit_stop_assets_v1`*, `transit_stops`, `trash_volume_logs`. (`*` = view; see 9c.)

**`admin.*`:** none (schema absent). **`transit.*`:** none (schema absent).

### (c) Views in core / public

**`core` (12 views):** `v_asset_locations_transit`, `v_assets`, `v_assignments_transit`, `v_clean_logs_transit`, `v_hazards_transit`, `v_infra_transit`, `v_level3_logs_transit`, `v_locations`, `v_locations_transit`, `v_stop_location_map`, `v_stop_photos_transit`, `v_trash_volume_logs_transit`.
**`public` (6 views):** `export_pool_daily_summary_v1`, `export_route_run_origin_mix_v1`, `export_stop_status_v1`, `stop_assets_v1`, `stops`, `transit_stop_assets_v1`.

### (d) Roles (name, can-login)

| rolname | rolcanlogin |
|---------|-------------|
| audit_reader | **false** (NOLOGIN — unwired; ISSUE-028 / ADR Q-F) |
| fieldpro | true (app role) |
| intelligence_reader | **false** (NOLOGIN — not yet wired into app pool; ISSUE-018) |
| mcp_readonly | **true** (LOGIN — the Q6 exposure surface) |

### (e) Grants to intelligence_reader / audit_reader / mcp_readonly

Full grant matrix captured. Key facts:

- **`intelligence_reader`** (canonical-only, correct): SELECT on `core.asset_locations`, `core.asset_types`, `core.assignments`, `core.evidence`, `core.location_external_ids`, `core.locations`, `core.observation_type_registry`, `core.observations`, `core.visits`, all 12 `core.v_*` views, and `public.stop_effort_history`, `public.stop_risk_snapshot`, `public.stops`, `public.transit_stop_assets`. **No grant on any `*_actor_audit` sidecar; no grant on `identity_directory`.** ✅ boundary intact.
- **`audit_reader`** (sidecar/audit surface, NOLOGIN): SELECT on `core.assignment_actor_audit`, `core.assignments`, `core.evidence`, `core.evidence_actor_audit`, `core.observation_actor_audit`, `core.observations`, `core.visit_actor_audit`, `core.visits`. (Holds the sidecar grant by design — but role is NOLOGIN/unwired, ISSUE-028.)
- **`mcp_readonly`** (LOGIN): SELECT on **all four sidecars** + `public.identity_directory` + every `public.*` work-attribution log + `route_runs` + the canonical surface. ❌ **Q6 exposure** (see §6).

### (f) Row counts (live)

| Relation | Rows |
|----------|------|
| core.visits | 9 |
| core.observations | 18 |
| core.assignments | 12 |
| core.evidence | 9 |
| core.asset_locations | 14,916 |
| core.locations | 14,916 |
| transit_stop_assets | 14,916 |
| clean_logs | 6 |
| hazards | 2 |
| infrastructure_issues | 2 |
| stop_photos | 9 |
| trash_volume_logs | 4 |
| level3_logs | 0 |

Counts match the ADR/inventory snapshots (assignments 12, observations 18, visits 9, evidence 9; spine tables fully seeded at 14,916; `level3_logs` empty/dead). No drift.

---

## 10. Test Suite Status

Command: `cd backend && npm test` (runner: `ts-node tests/run.ts`).

- **Total: 105 — Passing: 105 — Failing: 0.**
- Final line: `105 passed, 0 failed (105 total)`.
- **No failing tests.**

Notes: the suite includes the canonical integration tests (visits/observations/evidence/assignments), the OID-cipher integration test, RLS fail-closed tests (`loadRouteRunById` cross-tenant → null), and dev-bypass tests. The "DEV AUTH BYPASS IS ACTIVE" banners in output are expected test-harness warnings, not failures. (The six RLS-enforcement reds described in ISSUE-025 are a **CI-only** superuser artifact; locally `fieldpro` is non-superuser so all 105 pass — consistent with ISSUE-025's own description.)

---

## 11. Migration Status

Command: `cd backend && npm run migrate` (operator-approved; run with local creds `PGUSER=fieldpro PGDATABASE=fieldpro_db`).

**The run was NOT a no-op.** One pending migration was applied:

```
  skip  00000000_consolidated_schema.sql
  skip  20260518_rls_phase1_public_tables.sql
  skip  20260518_rls_phase2_add_orgid.sql
  skip  20260518_rls_phase3_structural_fixes.sql
  skip  20260519_role_rename_backfill.sql
  skip  20260525_role_rename_last_seen_role_check.sql
  apply 20260530_rls_harden_core_location_org_isolation.sql      ← APPLIED THIS RUN
  skip  20260530_sidecar_extraction_a_additive.sql
  skip  20260530_sidecar_extraction_b_drop.sql
  skip  legacy_*  (all legacy_ files skipped — consolidated schema present)
Migration run complete.
```

- **`schema_migrations` count: 61 → 62.** New row stamped at `2026-06-12T02:55:05Z` (UTC) for `20260530_rls_harden_core_location_org_isolation.sql`.
- **What the applied migration does (read of the file):** drops and re-creates the `org_isolation` RLS policy on `core.asset_locations` and `core.location_external_ids`, converting them from the **unguarded** `current_setting(...)::bigint` form to the **guarded** `COALESCE/NULLIF` fail-closed form used by every other org_isolation policy. It ends with a `DO $$ … RAISE EXCEPTION` assertion that **zero** unguarded org_isolation policies remain. It is idempotent (`DROP POLICY IF EXISTS` + `CREATE POLICY`) and changes no data — pure policy-shape harden / defense-in-depth. Per the file's own header, the primary fix already shipped in app code (`startRouteRunStopInternal` now runs inside `withOrgContext`); this migration is the DB-side backstop that makes an empty org context fail **closed** instead of raising `invalid input syntax for type bigint: ""`.
- **Why it was pending:** the file existed on disk (dated 2026-05-30) but had never been stamped into `schema_migrations` — the **exact ISSUE-014 drift pattern** (a migration applied/authored out-of-band of the runner ledger). This audit's migrate run reconciled it.
- **Honesty flag:** this is the one place the audit changed live DB state. It is low-risk (idempotent, no data change, tightens rather than loosens tenant isolation, and it aligns the last two unguarded policies with the rest of the DB). Recorded here and in §13. **No other migrations are pending** — a second `npm run migrate` would now be a pure skip/no-op.

---

## 12. Pre-Verified Findings (carried forward from prior session)

*Verbatim paste of the pre-verified context block supplied with the dispatch — not re-investigated, not reformatted.*

ISSUE-031 open question status (from prior calibration):
 Q1 — route_run_audit: PHANTOM. Does not exist in any schema or code.
      ADAPTER_BOUNDARY.md is wrong on this. Doc correction only, no migration step.
      ADAPTER_BOUNDARY.md is now untreated reference — the two inventories are canonical.
 Q2 — Six core.v_*_transit log views:
      v_clean_logs_transit — LIVE read by Control Center /overview and /difficulty.
        Never selects user_id or reported_by.
      v_hazards_transit — LIVE read by Control Center /overview.
        Never selects reported_by.
      v_infra_transit, v_level3_logs_transit, v_stop_photos_transit,
      v_trash_volume_logs_transit — read by NOTHING. Pure dead liability.
      All six are SELECT-granted to intelligence_reader (ISSUE-030 exposure).
 Q3 — Intelligence reads canonical only.
      rebuildStopRiskSnapshot() reads only core.observations + core.visits. CLEAN.
      rebuildStopRiskSnapshotLegacy() is dead code, no caller, annotated
      "Delete once verified" at riskMapService.ts:317-324.
      Live identity exposure that matters: GET /admin/clean-logs and
      GET /api/ops/clean-logs do SELECT cl.* surfacing user_id directly.
      These endpoints are on surfaces being replaced under capability build.
 Q4 — NOT YET VERIFIED. Write mechanism for transit_stop_assets (14,916 rows,
      no TypeScript writer found). Still open gate on classifying asset-linking layer.
 Q6 — NOT YET VERIFIED. mcp_readonly sidecar grant exposure. Still open.

ADR settled decisions (from 2026-06-07-issue-031-redesign-adr.md):
 Q-A/B: Canonical spine becomes load-bearing. transit_stops/transit_stop_assets
        demoted to ingestion source. core.asset_locations becomes live read path.
 Q-C:   Run-visit linkage stays string translation via assignments.source_ref.
        Must be hardened: index (source_system, source_ref), validated at write,
        1:1 regression test.
 Q-D:   Evidence write path becomes one transaction (atomicity bug — fix required).
 Q-E:   Uniform sidecar encryption across all four sidecars (sequenced separate).
 Q-F:   Export channel moves onto audit_reader (depends ISSUE-028).
 Q-G:   mcp_readonly revoked to canonical-only.
 CANON-1: core contains zero vertical-specific names. Six v_*_transit views
          evicted from core schema into adapter namespace.

ADR open design questions (founder must answer before migration sequence is written):
 DQ-1: Adapter namespace — dedicated schema (transit.*) vs. stay in public?
 DQ-2: RLS fail-open to fail-closed — fold into ISSUE-031 or separate issue?
 DQ-3: Canonical spine write-back mechanism when transit_stops geometry changes.
 DQ-4: Clip vs MV-4 timing — same pass or clip-first/promote-fast-follow?
 DQ-5: Issue boundary confirmation — what is inside ISSUE-031 vs adjacent issues.

**Update from THIS audit on the two open gates (Q4, Q6):** both are now verified live —
- **Q4 CLOSED:** no TypeScript writer; `transit_stop_assets` is seed/migration/trigger-only (trigger = ISSUE-024 site). See §6.
- **Q6 CLOSED (as confirmed finding):** `mcp_readonly` (LOGIN) reads all four sidecars + `identity_directory` → labor-safety exposure real and unremediated; ADR Q-G revocation not yet applied. See §6.

---

## 13. Gaps vs. Index Files

### Items present in live code / DB that are NOT in any planning index file

1. **`mcp_readonly` sidecar + `identity_directory` exposure (Q6).** Live, confirmed (§6/§9e). The grant exposure is named in the ADR (Q-G) and the §12 carry-forward, but there is **no KNOWN_ISSUES entry and no security-sprint item** tracking the revocation as actionable work. The §12 block references "ISSUE-030 exposure" for the `intelligence_reader` view grants, but no `ISSUE-030` text appears in `docs/KNOWN_ISSUES.md` (file ends at ISSUE-026). **→ needs a tracked issue (proposed: the Q-G revocation + the ISSUE-030 view-grant exposure).**
2. **ISSUE-028 referenced but absent from KNOWN_ISSUES.** ADR Q-F and §9d (`audit_reader` NOLOGIN/unwired) both depend on "ISSUE-028," and §12 references "ISSUE-030," but `docs/KNOWN_ISSUES.md` contains **neither ISSUE-027, ISSUE-028, ISSUE-029, ISSUE-030, nor ISSUE-031**. The transit inventory header (line 22) cites "ISSUE-018, 027–031" as if they exist. **→ KNOWN_ISSUES.md is missing entries 027–031 entirely** even though they are actively referenced across the ADR, the inventories, and CLAUDE.md. This is the single largest index gap.
3. **`20260530_rls_harden_core_location_org_isolation.sql` was an unstamped pending migration.** Not noted as pending anywhere; surfaced and applied by this audit's migrate run (§11). Fresh instance of the ISSUE-014 drift pattern.
4. **`core.v_*_transit` views still in `core`.** CANON-1 settles their eviction (SETTLED in ADR §3), but no index/issue tracks the eviction as a work item with an ID — it lives only in the ADR. (Same for the spine-inversion repoint Q-A/Q-B, the Q-C linkage hardening, the Q-D evidence-atomicity fix, and the Q-E uniform encryption — all **SETTLED decisions with no tracked issue ID or index row**.)
5. **`oidCipher.ts` AzureKeyVaultAdapter stub (§7g).** Production KMS adapter is a stub; relates to ADR Q-E and S1-13 but has no open-issue entry of its own.
6. **The `core.asset_locations` "fully populated but zero live readers" state** (14,916 rows; live code reads `transit_stop_assets` instead) — a known reconciliation finding (boundary-recon F-2), but not surfaced in any index as a migration task.

### Items in planning index files that appear fully resolved in live code / DB

1. **Refactor Tiers 1–8 — all 🟢 Done and consistent with live DB** (sidecars present, RLS forced, asset abstraction tables present, `stop_pool_memberships` present). No regression.
2. **Refinement R1–R6, R8–R10 — 🟢 Done**, consistent with live state (sidecar extraction completed the R1 identity direction; `stop_effort_history`/`stop_condition_history` exist per R10).
3. **Security Sprint 1 (S1-1…S1-13) — all 🟢 Done**, consistent with live (`audit_log` present with 28k+ rows historically, `eam_bridge_route_log` present, OID encryption path live and tested).
4. **ISSUE-001, 002, 003, 004, 005, 007, 009, 012, 019, 020, 021, 022, 023 — Fixed/Closed**, and the live test suite (105/105) + clean code scan corroborate (e.g. ISSUE-019 `PhotoDto` id fix visible at `StopDetail.tsx:388`; ISSUE-001 regression guard present in `offlineQueue.test.ts`).
5. **ADAPTER_BOUNDARY.md `route_run_audit` (Q1) — phantom**, confirmed: no such relation in §9b. Doc is wrong; the two inventories are canonical (per §12).

### ISSUE-031 migration sequence artifact

**MISSING.** (See §8c.) ISSUE-031 has: **both** inventories (the transit-adapter inventory, and the canonical-core inventory — `CORE-INV` — which **does exist**, committed at `docs/audit/` on `feat/issue-031-core-inventory` @ `d4a6846`, since merged; see the §0 correction), an ADR with settled decisions and five open founder design questions (DQ-1…DQ-5), and a boundary-reconciliation. It does **not** yet have the migration-sequence artifact the ADR §8 says must come next. **ISSUE-031 is blocked on (a) founder answers to DQ-1…DQ-5 and (b) authoring that sequence artifact** before any execution dispatch.

### Cross-cutting note for the Kanban

The richest seam of untracked-but-real work is the **ISSUE-031 settled-decision set** (Q-A…Q-G, CANON-1, MT-1…MT-4, MV-1…MV-4) — these are design-settled in the ADR but carry **no issue IDs and no index rows**, so they will not appear on any board built only from the index files. They should be lifted into the Kanban directly from the ADR, alongside the **missing KNOWN_ISSUES entries 027–031** (gap #2 above), which the rest of the documentation already treats as existing.

---

*End of audit. Read-only except the operator-approved §11 migrate run, which applied one idempotent pending RLS-harden migration (disclosed in §0, §11, §13). No code edits, no git commits, no other schema changes. Produced against commit `ea829cb`.*
