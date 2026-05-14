# BASELINE Security Hardening Sprint — Index

> Orchestration layer for the Security Hardening & Procurement Compliance track.
> Based on: `BASELINE_Security_Hardening_Plan.docx` + `BASELINE_Gap_Analysis.docx`
> Prerequisite: Refactor (Tiers 1–8) and Refinement (R1–R10) tracks complete or stable.
> Last updated: 2026-05-13

---

## What This Track Is

The Refactor and Refinement tracks made BASELINE functionally complete and production-grade.
This track makes it **procurement-compliant** — ready for KCM IT security review and TPRA submission.

Sprints 1 and 2 are agent-executable. Sprint 3 requires the founder for infrastructure decisions and manual validation.

---

## Pre-Sprint Requirement

> **Sprint 2 cannot begin until the hosting platform decision is made.**
> Azure Government, AWS GovCloud, or standard managed hosting must be selected by the founder.
> This decision determines FedRAMP inheritance claims and directly affects all policy documents.

---

## Sprint Map

| ID | Name | Type | Owner | Depends On | Status |
|----|------|------|-------|------------|--------|
| **Sprint 1 — Code Gaps** | | | | | |
| S1-1 | Audit Log Table + Append-Only Middleware | Code | Agent | None | 🟢 Done 2026-05-13 |
| S1-2 | Wire Audit Writes: Login, Assignment, Export, Admin Config | Code | Agent | S1-1 | 🟢 Done 2026-05-13 |
| S1-3 | GET /api/admin/audit-log — Date Filter + CSV Export | Code | Agent | S1-1 | 🟢 Done 2026-05-13 |
| S1-4 | Export-and-Delete Endpoint with Confirmation Token | Code | Agent | None | 🔴 Not started |
| S1-5 | OpenAPI 3.0 Spec Generated from Existing Routes | Code | Agent | None | 🔴 Not started |
| S1-6 | SFTP Export Writer — Nightly CSV/JSON Canonical Data | Code | Agent | None | 🔴 Not started |
| S1-7 | EAM Bridge Route Log — Table + Populate Script | Code | Agent | None | 🔴 Not started |
| S1-8 | axe-core Accessibility Audit — All 6 Surfaces | Audit | Agent | None | 🔴 Not started |
| S1-9 | Remediate axe-core Findings (Contrast, ARIA, Focus Order) | Code | Agent | S1-8 | 🔴 Not started |
| S1-10 | Dependency Vulnerability Scan (`pnpm audit`) | Code/Ops | Agent | None | 🟢 Done 2026-05-13 |
| S1-11 | Auth Token Claim Validation (aud, iss, exp, oid) | Code | Agent | None | 🟢 Done 2026-05-13 |
| S1-12 | File Upload Path Traversal & Validation Hardening | Code | Agent | None | 🟢 Done 2026-05-13 |
| S1-13 | KMS-Encrypted captured_by_oid on core.visits | Code | Agent | None | 🔴 Not started |
| **Sprint 2 — Policy Documents** | | | | | |
| S2-1 | NIST SP 800-53 Control Mapping Document | Document | Agent | Hosting decision | 🔴 Not started |
| S2-2 | WA OCIO 141.10 Alignment Statement | Document | Agent | Hosting decision | 🔴 Not started |
| S2-3 | Incident Response Plan (24-hr Breach Notification) | Document | Agent | Hosting decision | 🔴 Not started |
| S2-4 | Business Continuity Summary — Backup, HA, RTO/RPO, SLA | Document | Agent | Hosting decision | 🔴 Not started |
| S2-5 | Data Classification Document for Exports | Document | Agent | None | 🔴 Not started |
| S2-6 | Log Retention Policy (>= 1 Year) | Document | Agent | None | 🔴 Not started |
| S2-7 | Data Use Limitation Policy (WA Public-Sector Privacy) | Document | Agent | None | 🔴 Not started |
| S2-8 | ArcGIS Integration Roadmap Narrative (TPRA) | Document | Agent | None | 🔴 Not started |
| S2-9 | WCAG 2.1 AA Conformance Statement | Document | Agent | S1-8 + S1-9 | 🔴 Not started |
| S2-10 | TPRA Questionnaire Answers + Integration Options Matrix | Document | Agent | All S2 docs | 🔴 Not started |
| **Sprint 3 — Founder Tasks & Final Validation** | | | | | |
| S3-1 | Select and Configure Hosting Platform | Infra | Founder | — blocks S2 | 🔴 Not started |
| S3-2 | Configure Managed DB Backups + Multi-AZ | Infra | Founder | S3-1 | 🔴 Not started |
| S3-3 | Confirm 99.9% Uptime SLA from Hosting Provider | Infra | Founder | S3-1 | 🔴 Not started |
| S3-4 | VoiceOver / TalkBack Manual Test — UL Mobile Stop Flow | QA | Founder | S1-9 | 🔴 Not started |
| S3-5 | Review + Sign Off All S2 Policy Documents | Review | Founder | All S2 | 🔴 Not started |
| S3-6 | Coordinate KCM Azure Entra Test Account for SSO Validation | External | Founder | None | 🔴 Not started |
| S3-7 | Final TPRA Package Assembly and Submission | External | Founder | All S2 + S3-5 | 🔴 Not started |
| S3-8 | Rotate All Secrets Post-S1 | Ops | Founder | S1-10 | 🔴 Not started |
| S3-9 | GitHub Branch Protection on `main` | Ops | Founder | R8 done | 🔴 Not started |
| S3-10 | Container Registry Configuration (GHCR or ECR) | Ops | Founder | S3-1 | 🔴 Not started |
| S3-11 | Azure Entra Domain Verification for Production | External | Founder | S3-1 | 🔴 Not started |

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
S1-9 ──► S2-9 (conformance statement requires remediation done)
All S2 ──► S2-10 (TPRA master doc)

S3-1 ──► S3-2, S3-3
S1-9 ──► S3-4
S2 complete ──► S3-5 ──► S3-7
```

---

## TPRA-Ready Checklist

**Code**
- [ ] audit_log table in production, all Admin actions writing to it
- [ ] Export-and-delete endpoint functional and tested
- [ ] OpenAPI 3.0 spec published and accessible
- [ ] SFTP export writer deployed and tested against staging
- [ ] eam_bridge_route_log table populated on schedule
- [ ] axe-core findings remediated — no WCAG AA violations in automated scan

**Documents**
- [ ] NIST SP 800-53 control mapping — reviewed and signed off
- [ ] WA OCIO 141.10 alignment statement — reviewed and signed off
- [ ] Incident Response Plan — reviewed and signed off
- [ ] Business Continuity summary — reviewed and signed off
- [ ] Data classification document — reviewed and signed off
- [ ] Log retention policy — reviewed and signed off
- [ ] WCAG 2.1 AA Conformance Statement — reviewed and signed off
- [ ] TPRA questionnaire answers + integration options matrix — complete

**Infrastructure**
- [ ] Hosting platform selected and configured
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