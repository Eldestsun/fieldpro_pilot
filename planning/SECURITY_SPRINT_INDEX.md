# BASELINE Security Hardening Sprint — Index

> Orchestration layer for the Security Hardening & Procurement Compliance track.
> Based on: `BASELINE_Security_Hardening_Plan.docx` + `BASELINE_Gap_Analysis.docx`
> Prerequisite: Refactor (Tiers 1–8) and Refinement (R1–R10) tracks complete or stable.
> Last updated: 2026-05-18

---

## What This Track Is

The Refactor and Refinement tracks made BASELINE functionally complete and production-grade.
This track makes it **procurement-compliant** — ready for KCM IT security review and TPRA submission.

Sprints 1 and 2 are agent-executable. Sprint 3 requires the founder for infrastructure decisions and manual validation.

---

## Pre-Sprint Requirement

> **Hosting-dependent S2 documents (S2-1, S2-2, S2-3, S2-4) have been written at demo posture.**
> Hosting-dependent sections are marked "Planned — pending S3-1" inline. These documents must be
> updated once the founder selects a hosting platform (S3-1). The hosting decision also determines
> which FedRAMP controls are inherited and what SLA claims are supportable.
>
> **S3-1 decided 2026-05-18.** Hosting strategy: Render for internal testing and field demos; Azure
> Enterprise for contracted pilot deployment. TPRA package commits to Azure Enterprise. S2-1
> through S2-4 hosting-dependent sections can now be finalized against the Azure Enterprise
> commitment.

---

## Sprint Map

| ID | Name | Type | Owner | Depends On | Status |
|----|------|------|-------|------------|--------|
| **Sprint 1 — Code Gaps** | | | | | |
| S1-1 | Audit Log Table + Append-Only Middleware | Code | Agent | None | 🟢 Done 2026-05-13 |
| S1-2 | Wire Audit Writes: Login, Assignment, Export, Admin Config | Code | Agent | S1-1 | 🟢 Done 2026-05-13 |
| S1-3 | GET /api/admin/audit-log — Date Filter + CSV Export | Code | Agent | S1-1 | 🟢 Done 2026-05-13 |
| S1-4 | Export-and-Delete Endpoint with Confirmation Token | Code | Agent | None | 🟢 Done 2026-05-13 |
| S1-5 | OpenAPI 3.0 Spec Generated from Existing Routes | Code | Agent | None | 🟢 Done 2026-05-13 |
| S1-6 | SFTP Export Writer — Nightly CSV/JSON Canonical Data | Code | Agent | None | 🟢 Done 2026-05-13 |
| S1-7 | EAM Bridge Route Log — Table + Populate Script | Code | Agent | None | 🟢 Done 2026-05-13 |
| S1-8 | axe-core Accessibility Audit — All 6 Surfaces | Audit | Agent | None | 🟢 Done 2026-05-14 |
| S1-9 | Remediate axe-core Findings (Contrast, ARIA, Focus Order) | Code | Agent | S1-8 | 🟢 Done 2026-05-14 |
| S1-10 | Dependency Vulnerability Scan (`pnpm audit`) | Code/Ops | Agent | None | 🟢 Done 2026-05-13 |
| S1-11 | Auth Token Claim Validation (aud, iss, exp, oid) | Code | Agent | None | 🟢 Done 2026-05-13 |
| S1-12 | File Upload Path Traversal & Validation Hardening | Code | Agent | None | 🟢 Done 2026-05-13 |
| S1-13 | KMS-Encrypted captured_by_oid on core.visits | Code | Agent | None | 🟢 Done 2026-05-13 |
| **Sprint 2 — Policy Documents** | | | | | |
| S2-1 | NIST SP 800-53 Control Mapping Document | Document | Agent | Hosting decision | 🟢 Done 2026-05-14 |
| S2-2 | WA OCIO 141.10 Alignment Statement | Document | Agent | Hosting decision | 🟢 Done 2026-05-14 |
| S2-3 | Incident Response Plan (24-hr Breach Notification) | Document | Agent | Hosting decision | 🟢 Done 2026-05-14 |
| S2-4 | Business Continuity Summary — Backup, HA, RTO/RPO, SLA | Document | Agent | Hosting decision | 🟢 Done 2026-05-14 |
| S2-5 | Data Classification Document for Exports | Document | Agent | None | 🟢 Done 2026-05-14 |
| S2-6 | Log Retention Policy (>= 1 Year) | Document | Agent | None | 🟢 Done 2026-05-14 |
| S2-7 | Data Use Limitation Policy (WA Public-Sector Privacy) | Document | Agent | None | 🟢 Done 2026-05-14 |
| S2-8 | ArcGIS Integration Roadmap Narrative (TPRA) | Document | Agent | None | 🟢 Done 2026-05-14 |
| S2-9 | WCAG 2.1 AA Conformance Statement | Document | Agent | S1-8 + S1-9 + S2-9-prereqs | 🟠 In review — prereqs 1+2 open; S3-4 pending |
| S2-10 | TPRA Questionnaire Answers + Integration Options Matrix | Document | Agent | All S2 docs | 🔴 Not started |
| **Sprint 3 — Founder Tasks & Final Validation** | | | | | |
| S3-1 | Select and Configure Hosting Platform | Infra | Founder | — blocks S2 | 🟢 Done 2026-05-18 — Render (testing/demos) + Azure Enterprise (pilot) |
| S3-2 | Configure Managed DB Backups + Multi-AZ | Infra | Founder | S3-1 | 🔴 Not started |
| S3-3 | Confirm 99.9% Uptime SLA from Hosting Provider | Infra | Founder | S3-1 | 🔴 Not started |
| S3-4 | VoiceOver / TalkBack Manual Test — UL Mobile Stop Flow | QA | Founder | S1-9 | 🔴 Not started |
| S3-5 | Review + Sign Off All S2 Policy Documents | Review | Founder | All S2 | 🔴 Not started |
| S3-6 | Coordinate KCM Azure Entra Test Account for SSO Validation | External | Founder | None | 🔴 Not started |
| S3-7 | Final TPRA Package Assembly and Submission | External | Founder | All S2 + S3-5 | 🔴 Not started |
| S3-8 | Rotate All Secrets Post-S1 | Ops | Founder | S1-10 | 🔴 Not started |
| S3-9 | GitHub Branch Protection on `main` | Ops | Founder | R8 done | 🔴 Not started |
| S3-10 | Container Registry Configuration (GHCR or ECR) | Ops | Founder | S3-1 | 🔴 Not started |
| S3-11 | Azure Entra Domain Verification for Production | External | Founder | S3-1 | 🔴 Not started — Render redirect URI mismatch identified (AADSTS50011); config task only |

---

## Execution Order

```
S1-1 ──► S1-2 (audit writes depend on log table)
S1-1 ──► S1-3 (query endpoint depends on log table)
S1-4    (independent — export-and-delete)
S1-5    (independent — OpenAPI spec)
S1-6    (independent — SFTP export)
S1-7    (independent — EAM bridge table)
S1-8 ──► S1-9 (remediate after audit findings)
S1-13   (independent — KMS OID encryption; prod adapter needs S3-1 hosting decision)

Founder: Hosting decision
         │
         └──► S2-1, S2-2, S2-3, S2-4 (all require hosting context)
S2-5, S2-6, S2-7, S2-8  (independent of hosting)
S1-9 ──► S2-9-prereqs ──► S2-9 (conformance statement requires prereqs resolved)
All S2 ──► S2-10 (TPRA master doc)

S3-1 ──► S3-2, S3-3
S1-9 ──► S3-4
S2 complete ──► S3-5 ──► S3-7
```

---

## Post-Sprint-1 RLS Extension (2026-05-18)

Delivered as three additional phases after Tier 7 (8 core tables) shipped. Total RLS-protected tables raised from 8 to 29.

| Phase | Tables | Notes |
|-------|--------|-------|
| Phase 1 | 7 public tables with existing org_id | `assets`, `bases`, `eam_bridge_route_log`, `route_pools`, `route_runs`, `transit_stops`, `export_delete_tokens` |
| Phase 2 | 14 public tables — org_id added + RLS | `route_run_stops`, `stop_condition_history`, `stop_effort_history`, `stop_risk_snapshot`, `hazards`, `infrastructure_issues`, `clean_logs`, `level3_logs`, `trash_volume_logs`, `stop_photos`, `lead_route_overrides`, `stops_legacy`, `transit_stop_assets`, `asset_external_ids` |
| Phase 3 | Reconciliation + new tables | `audit_log.org_id` uuid→bigint, WITH CHECK on `core.asset_locations` + `core.location_external_ids`, `shift_type` added to `route_runs`, `stop_pool_memberships` junction table created |

Test suite: 99/99 passing. RLS verification: 26/26 checks passing.

---

## S2-9 Prerequisites

Three items were deferred out of S1-9 scope. S2-9 was written on 2026-05-14 with prerequisites 1 and 2
still open — the conformance statement documents them as known deviations with WCAG level assessments.
The statement is marked 🟠 In review until all three are resolved and S3-5 sign-off is complete.

| # | Item | Type | Owner | Status |
|---|------|------|-------|--------|
| 1 | **Modal focus management JS** — `useEffect`-based focus trap on 5 dialog components (ConfirmDialog, ImagePreviewModal, ConflictResolutionModal, Safety Modal, Infra Modal): move focus to first element on open, contain Tab, return focus on close. ARIA roles applied in S1-9; JS behavior deferred. Assessed as not a WCAG 2.1 AA failure in S2-9 (§6.1). | Code | Agent | 🔴 Open |
| 2 | **Photo remove button touch target** — 20×20px on photo strip overlay; below WCAG 2.5.5 AAA minimum. Not a Level AA violation. Documented in S2-9 §6.2. Requires product/design decision before closing. | Product decision | Founder | 🔴 Open |
| 3 | **VoiceOver / TalkBack manual run** — tracked as S3-4 (Founder task). Specific verification targets documented in S2-9 §6.3. | QA | Founder | 🔴 Open (S3-4) |

**Reference**: `docs/security/axe-audit-2026-05-14.md` § Part C; `docs/security/wcag-conformance-statement.md` § 6.

---

## TPRA-Ready Checklist

**Code**
- [x] audit_log table in production, all Admin actions writing to it
- [x] Export-and-delete endpoint functional and tested
- [x] OpenAPI 3.0 spec published and accessible
- [ ] SFTP export writer deployed and tested against staging
- [x] eam_bridge_route_log table populated on schedule
- [x] axe-core findings remediated — no WCAG AA violations in automated scan (S1-9 complete 2026-05-14)

**Documents**
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

**Infrastructure**
- [x] Hosting platform selected — Render (testing/demos) + Azure Enterprise (pilot deployment)
- [ ] Managed DB backups confirmed, schedule documented
- [ ] Multi-AZ or equivalent HA configured
- [ ] Staging environment accessible at a stable URL

**External**
- [ ] KCM Azure Entra test account obtained
- [ ] SSO integration validated against KCM tenant in staging
- [ ] VoiceOver / TalkBack manual accessibility test completed
- [ ] Founder has reviewed all policy documents

---

## Critical Labor Safety Constraint

> No security hardening task may introduce worker identity into the intelligence layer.
> The `audit_log` records `actor_oid` (Azure Entra OID) for security purposes at the security-tier access level.
> It must **not** be surfaced in operational dashboards, risk maps, or any view accessible to supervisors or dispatchers.

**Admin access roster and audit log use-limitation policy:**
See `planning/security/ADMIN_ACCESS_POLICY.md` for the authoritative statement of
who holds Admin role, why, and why the audit log cannot be misused for worker
surveillance. This document is the source of truth for S2-1, S2-5, and S2-7.

---

## Sprint Files

| Sprint | File |
|--------|------|
| Sprint 1 — Code Gaps | `planning/security/SECURITY_SPRINT_1_CODE_GAPS.md` |
| Sprint 2 — Policy Documents | `planning/security/SECURITY_SPRINT_2_POLICY_DOCS.md` |
| Sprint 3 — Founder Tasks | `planning/security/SECURITY_SPRINT_3_FOUNDER_TASKS.md` |

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| 🔴 Not started | No work begun |
| 🟡 In progress | Active development |
| 🟠 In review | Written, verification pending |
| 🟢 Done | All done-criteria verified |
| ⛔ Blocked | Hard dependency not yet met |