# Security Sprint Index

> Orchestration layer for the security hardening track.
> Runs after Tier 7 (RLS) is complete. Each sprint has its own handoff file.
> Last updated: 2026-05-12

---

## Sprint Map

| ID | Name | Depends On | Status |
|----|------|-----------|--------|
| S1 | Code Gaps | Tier 7 done | 🔴 Not started |
| S2 | Policy Docs | S1 in progress | 🔴 Not started |
| S3 | Founder Tasks | S1 in progress | 🔴 Not started |

---

## Sprint Summaries

### S1 — Code Gaps
**File**: `planning/security/SECURITY_SPRINT_1_CODE_GAPS.md`

Identify and close application-layer security gaps: input validation, secrets management, dependency audit, and auth hardening. Audit against OWASP Top 10 for the current API surface.

---

### S2 — Policy Docs
**File**: `planning/security/SECURITY_SPRINT_2_POLICY_DOCS.md`

Write the security policy artifacts required for enterprise procurement: data handling policy, incident response runbook, and access control matrix.

---

### S3 — Founder Tasks
**File**: `planning/security/SECURITY_SPRINT_3_FOUNDER_TASKS.md`

Founder-owned security tasks that require external accounts or credentials: domain verification, certificate management, secrets rotation, and vendor security questionnaires.

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| 🔴 Not started | No work begun |
| 🟡 In progress | Active development |
| 🟠 In review | Verification pending |
| 🟢 Done | All done-criteria verified |
| ⛔ Blocked | Hard dependency not yet met |
