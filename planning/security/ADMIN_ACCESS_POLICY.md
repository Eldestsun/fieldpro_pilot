# Admin Access Policy

> **Document type**: Committed policy artifact
> **Status**: Active
> **Last updated**: 2026-05-13
> **Input to**: S2-1 (NIST AU-2, AU-9), S2-5 (Data Classification), S2-7 (Data Use Limitation)

---

## Purpose

This document defines who holds the Admin role in BASELINE, the rationale for each
holder, and how that roster intersects with the audit log surface and the labor-safety
architecture. It is the source of truth for the Sprint 2 control-mapping and
data-classification documents. Wherever a Sprint 2 policy artifact must describe
who can reach audit log data, it should reference this document rather than restate
the roster. This prevents the policy layer from drifting away from the access
configuration that the code actually enforces.

---

## The Admin Roster

### 1. Invaria Founder

- **Role**: Product owner and system administrator.
- **Rationale**: Disclosed product ownership to KCM organizational leadership
  directly and early. Operates under full organizational transparency — this is
  not a hidden access relationship.
- **Operational necessity**: Someone must administer the system. No administrative
  function (user provisioning, pool configuration, stop record edits) is possible
  without at least one Admin account. The founder holds the minimum necessary
  administrative access to keep the system operational during the pilot period.

### 2. KCM Business Analyst Team

- **Role**: The founder's day-job team at King County Metro Transit Facilities
  Division.
- **Rationale**: The team already operates under standing data-access governance.
  Access requests within this team are logged, justified, and the request trail
  is retained per the team's existing standards. Adding audit log access does not
  introduce new data governance obligations — it falls inside a governance regime
  that already exists and is already functioning.
- **Operational necessity**: The BA team is the operational owner of BASELINE
  within KCM. Investigating anomalies (unexpected auth failures, unusual
  assignment patterns) is a normal operational function that requires audit access.

### 3. KCM IT

- **Role**: System administration access.
- **Rationale**: KCM IT is the technical steward of all applications that run
  on KCM infrastructure. Admin access is standard for IT-administered systems.
- **Operational necessity**: Governed by KCIT access controls, which are the
  same controls that govern every other enterprise application. No special
  treatment is required or appropriate.

---

## Who Is NOT Admin

Operational leadership — chiefs, superintendents, supervisors, and dispatchers —
hold **UL** or **Lead** roles. They cannot reach the audit log surface under any
condition. This is enforced at the route layer:

```
GET /api/admin/audit-log
Authorization: requireAnyRole(['Admin'])
```

A user without Admin role receives HTTP 403. There is no escalation path within
BASELINE. Gaining audit log access requires a role change that goes through the
same provisioning process as all other role changes in the system.

---

## Why the Audit Log Cannot Be Misused for Worker Surveillance

**The audit log records admin actions, not field operational data.** It contains
no stop-level or visit-level operational records. A query against `audit_log`
returns records of things administrators did — authenticated, assigned routes,
changed configuration — not records of what field workers did at stops.

**Worker OID references appear only in records of admin actions against
assignments.** When an administrator reassigns or cancels a route assignment,
the audit record captures who was previously assigned and who is now assigned.
This describes an admin action (the reassignment), not a worker action (stopping
at a location). The OID appears as metadata on an administrative event, not as
a field performance datum.

**Reconstructing a worker's stop history through the audit log is not
architecturally possible.** Stop-level history lives in `stop_effort_history`
and `stop_condition_history`. These tables contain no worker identity column by
design — Tier 4 schema cleanup removed it. There is no join path from the audit
log to stop-level history that produces a per-worker stop performance record.

**Operational leadership has no Admin access and therefore cannot reach this
data through BASELINE at all.** A superintendent who wanted to investigate a
worker's stop history cannot do so through BASELINE by design. The application
offers no surface for this regardless of the user's organizational authority.

**BASELINE is not, and does not become, the surveillance surface.** If an
organizational actor wanted to correlate a worker to a route, the path of least
resistance is EAMS, which already records work-order assignments with worker
identifiers. BASELINE coexists with EAMS and does not add to the surveillance
exposure already present in the organization's existing systems.

---

## Use Limitation

Audit log data is collected exclusively for security-investigation purposes:
detecting unauthorized access, investigating anomalies, and satisfying compliance
audit requirements. It is not used for:

- Worker performance assessment or scoring
- Scheduling or route planning decisions
- Operational analytics or reporting
- Any non-security purpose

This aligns with the Washington State public-sector use-limitation principle and
is enforceable because:

1. The only roles with audit log access (Admin roster above) have documented
   organizational standards that prohibit non-security use of system logs.
2. The data model does not support performance analytics — worker-keyed stop
   history does not exist in the intelligence layer by schema design, not just
   by policy.

---

## Meta-Audit

Audit log **read operations** are themselves auditable. The `admin.audit_log_read`
action (tracked as a Sprint 1 follow-up item) will write an entry to `audit_log`
every time an Admin user queries the endpoint. Any review of audit data leaves
its own footprint in the same log.

This means a union or compliance challenge can be answered with a complete trail
of who accessed the audit log, when, and with what filters. The access trail is
not just a deterrent — it is the evidence base for demonstrating appropriate use
or detecting inappropriate use after the fact.

---

## Forward References

| Sprint 2 Document | Relevant section | What to cite from this document |
|-------------------|------------------|---------------------------------|
| S2-1 NIST SP 800-53 Control Mapping | AU-2 (Audit Events), AU-9 (Protection of Audit Information) | Admin roster as the access list for AU-9; use-limitation statement for AU-2 event justification |
| S2-5 Data Classification | `audit_log.detail` classification | Classify as Restricted — Admin tier; cite this roster as the access list |
| S2-7 Data Use Limitation Policy | Audit log use scope | Cite this document as the controlling policy; reproduce the use-limitation bullet list |
