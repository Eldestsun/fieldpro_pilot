# S2 — Policy Docs

> **Goal**: Produce the security policy artifacts required for enterprise procurement conversations.
>
> **Status**: 🔴 Not started
> **Depends on**: S1 in progress (policies should reflect actual code posture)
> **Blocks**: Nothing

---

## Deliverables

| Artifact | Location | Purpose |
|----------|----------|---------|
| Data Handling Policy | `docs/security/data-handling-policy.md` | What data is collected, stored, retained, and deleted |
| Incident Response Runbook | `docs/security/incident-response.md` | Steps to take when a breach or anomaly is detected |
| Access Control Matrix | `docs/security/access-control-matrix.md` | Role × resource permission table (Admin, Lead, UL) |

---

## Done Definition

S2 is complete when ALL of the following are true, **and a changelog entry has been written**:

- [ ] Data handling policy covers data classes, retention windows, and deletion procedures
- [ ] Incident response runbook covers detection, containment, notification, and post-mortem
- [ ] Access control matrix maps every API endpoint to allowed roles
- [ ] All three documents reviewed by a founder
- [ ] Changelog entry written to `docs/changelog/YYYY-MM-DD-s2-policy-docs.md`
