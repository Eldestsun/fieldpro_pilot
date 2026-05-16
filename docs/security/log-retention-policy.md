# BASELINE — Log Retention Policy

**Document**: S2-6
**Version**: 1.0
**Date**: 2026-05-14
**Status**: Pending founder review
**Owner**: System Owner (Invaria / BASELINE project founder)
**Review cadence**: Annually, or upon any change to log infrastructure or applicable records schedule

---

## 1. Purpose and Scope

This policy defines the retention periods, storage mechanisms, access controls, and deletion procedures for all log and audit data produced by BASELINE. It applies to all environments in which BASELINE operates — including demo, pilot, and production — and to all parties with access to BASELINE systems.

The policy must be consistent with Washington State public records law (RCW 40.14), which governs retention schedules for public agency records. KCM's records retention officer should verify the applicable retention schedule category before pilot launch. BASELINE defaults to a **minimum of one year** for audit log data as a conservative floor pending that verification.

This policy applies to the following log categories:

- `audit_log` table (PostgreSQL, BASELINE-managed)
- Application logs (server stdout/stderr)
- Azure Entra sign-in logs (platform-managed)
- SFTP nightly export files (KCM-managed destination)

---

## 2. Log Categories and Retention Periods

### 2.1 `audit_log` Table

**Retention period**: Minimum **1 year** from the `occurred_at` timestamp of each entry.

**Scope**: The `audit_log` table was created in S1-1 (`backend/migrations/20260513_audit_log.sql`). It records all administrative and security-relevant actions taken in BASELINE. The table schema is:

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID / serial | Row identifier |
| `actor_oid` | text | Azure Entra OID of the acting user — never a name or display name |
| `org_id` | UUID | Azure Entra tenant ID (`tid` claim) |
| `action` | text | Action type (see below) |
| `resource_type` | text | Resource category affected |
| `resource_id` | text | Identifier of the specific resource |
| `detail` | JSONB | Structured supplemental context |
| `ip_address` | text | Request IP at time of action |
| `occurred_at` | timestamptz | Timestamp of the action |

**Action types currently wired** (as of S1-2):

| Action | Trigger point |
|--------|--------------|
| `auth.login` | Successful JWT validation in `authz.ts` |
| `auth.login_failed` | Failed `jwt.verify` call in `authz.ts` |
| `assignment.create` | `POST /api/route-runs` — new route assignment |
| `assignment.cancel` | `PATCH /api/route-runs/:id/assign` — null OID |
| `assignment.reassign` | `PATCH /api/route-runs/:id/assign` — OID change |
| `admin.config_change` | Pool create / update / delete in `adminRoutes.ts` |
| `admin.stop_edit` | Stop edit (single or bulk) in `adminRoutes.ts` |

**Pending wires** (no trigger point yet as of S1-2; tracked in ISSUE-010):

| Action | Status |
|--------|--------|
| `export.data_export` | S1-4 export endpoint not yet built |
| `admin.user_role_change` | No user-role-change endpoint yet |

**Rationale for 1-year minimum**: Security audit records for public-agency systems in Washington State are governed by the applicable General Schedule under RCW 40.14. The relevant category is likely GS 50-05-020 (Security Audit Records) or equivalent. KCM's records retention officer must confirm the specific schedule number before pilot launch. One year is the minimum pending that confirmation and is consistent with standard security audit record practice.

---

### 2.2 Application Logs (Server stdout/stderr)

**Retention period**: **90 days**

**Scope**: Standard server process output — HTTP request logs, startup messages, `console.error` output from failed audit writes, and other operational diagnostics. These logs contain no PII and no `actor_oid` values. They are used exclusively for operational troubleshooting and are not part of the compliance audit trail.

**Storage**: At demo posture, these logs are retained by the hosting provider (Render or Fly.io) per their platform defaults. At Azure commercial pilot, application logs are routed to Azure Monitor Log Analytics with a configurable retention window set to 90 days.

---

### 2.3 Azure Entra Sign-In Logs

**Retention period**: **Platform-controlled** — 30 days on the Azure Entra free tier; 90 days with Azure Entra P1 or P2 license.

**Scope**: Azure Entra sign-in logs record authentication events at the identity provider level. These logs are outside BASELINE's control — BASELINE does not write to, modify, or export Azure Entra logs. KCM IT administers the Azure Entra tenant and controls the license tier and retention configuration.

**Note for KCM IT**: If compliance requirements demand audit log availability beyond 30 days at the identity provider level, an Azure Entra P1 license is required for the tenant serving BASELINE users, or Azure Monitor integration for sign-in log export should be configured.

---

### 2.4 SFTP Export Files

**Retention period**: **Outside BASELINE's control.**

BASELINE's nightly SFTP export (S1-6) writes canonical route and condition data to a KCM-controlled SFTP destination. Once written, retention of those files is governed by KCM's data retention policies for the SFTP destination, not by this policy. BASELINE does not dictate downstream retention periods for exported files.

**Note**: The SFTP export payload contains no `audit_log` data and no worker identity. It contains stop completion records, condition observations, and route run summaries — classified as Internal per the Data Classification Document (S2-5).

---

## 3. Storage Mechanism

### 3.1 Current Posture (Demo — Render / Fly.io)

The `audit_log` table resides in the primary PostgreSQL database. There is no separate log archive at demo posture.

Append-only integrity is enforced at the database layer via `FORCE ROW LEVEL SECURITY`. Row-level security policies permit `SELECT` and `INSERT` only. The absence of `UPDATE` and `DELETE` policies causes those operations to silently affect 0 rows for all roles, including the table owner, at the application layer. This means no application-layer code path — including an Admin user — can modify or delete audit log entries through the normal API surface.

**Gap at demo posture**: The primary database is a single-instance deployment with no separate backup schedule documented beyond provider defaults. This gap is acknowledged in the Business Continuity Summary (S2-4). Compensating control: the append-only RLS design prevents in-place tampering; the risk is data loss in the event of unrecoverable DB failure, not data falsification.

### 3.2 Pilot Posture (Azure Commercial)

At Azure commercial pilot:

- The `audit_log` table is retained in Azure Database for PostgreSQL Flexible Server with automated daily backups and configurable retention (target: 30-day backup retention minimum, aligned with the 1-year audit log retention requirement — full-year coverage is achieved through the combination of live DB + backup history).
- For entries older than 90 days, consider archival export to Azure Blob Storage (cool or archive tier) via a scheduled export job. This reduces primary DB storage cost for long-lived log data while maintaining the 1-year retention requirement. Archival implementation is a pilot-phase operational task; it is not yet built.
- Azure Monitor Log Analytics receives application logs with a 90-day retention window.

---

## 4. Access Controls During Retention

Access to `audit_log` data during the retention period is restricted to the **Admin role** only.

- The audit log read endpoint (`GET /api/admin/audit-log`, S1-3) requires `requireAnyRole('admin')` middleware.
- The audit log export endpoint (`GET /api/admin/audit-log/export`, S1-3) requires Admin role and emits an `audit_log_read` action — reading the audit log is itself auditable.
- No Lead or UL role has any API surface that exposes `audit_log` rows.
- Operational leadership (chiefs, superintendents, supervisors) hold Lead or UL roles. They have no access to audit log data regardless of organizational authority.

For the authoritative statement of who holds Admin role and the use-limitation commitment for audit log data, see `planning/security/ADMIN_ACCESS_POLICY.md`.

---

## 5. Deletion at End of Retention

### 5.1 Standard Deletion Procedure

Deletion of `audit_log` entries at the end of the 1-year retention window is performed via the **export-and-delete endpoint** (S1-4) with the following steps:

1. An Admin user initiates export of the records to be purged via the export-and-delete endpoint.
2. The endpoint requires a **confirmation token** (issued as part of the export request, valid for a single use) before deletion proceeds. This prevents accidental or automated deletion.
3. The deletion is **irrevocable** — confirm the export is complete and verified before submitting the confirmation token.
4. A `export.data_export` audit event fires on each successful export operation.

> **Status as of S1-2**: The export-and-delete endpoint (S1-4) is not yet built. The `export.data_export` audit write is also not yet wired (tracked in ISSUE-010). Until S1-4 ships, no application-layer deletion path exists. Retention compliance at demo posture is maintained by accumulation — entries are retained until the endpoint is available.

### 5.2 Audit-Log Deletion Bootstrapping

Deleting audit log entries creates a bootstrapping problem: the deletion of an audit record is itself a security-relevant action that should be audited — but if the audit log is the only audit store, deleting from it destroys its own evidence.

BASELINE resolves this as follows:

1. **Before any deletion**, an Admin initiates a full export of the records to be purged. The export event (`export.data_export`) is written to the audit log, timestamped before the records are removed.
2. The exported records are stored at a **KCM-controlled SFTP or archive destination** before the deletion confirmation token is submitted. This creates an out-of-band audit record that survives the DB-level deletion.
3. A **`audit.purge` action** is written to the `audit_log` table immediately before the deletion executes, recording: the `actor_oid` of the Admin initiating the purge, the `org_id`, the date range of records being purged, and the row count. This purge metadata entry is itself subject to the 1-year retention window.
4. The deletion is then executed at the application layer. Because RLS blocks `DELETE` for all application roles, physical deletion requires a **direct DB-level operation** by an IT-provisioned database administrator. This access is separately logged (via Azure Entra elevated access trail or direct DB access log) and produces a more visible audit trail than the application-layer API.

> **Implementation note**: The `audit.purge` event type and the IT-provisioned DB deletion procedure are operational procedures, not yet implemented in code. They must be documented in the operational runbook before pilot launch and implemented as part of the S1-4 delivery or a subsequent sprint.

---

## 6. Legal Hold Procedure

If KCM IT issues a legal hold on records in the `audit_log` or any other BASELINE data store:

1. **All automated or scheduled deletion** is immediately suspended for records within the scope of the hold.
2. The legal hold notification (written, from KCM Legal or KCM IT) is retained by the system owner (founder) and referenced in any subsequent operational decisions affecting the held records.
3. The scope of the hold (date range, record categories, resource types) is documented and applied by the system owner.
4. Records subject to the hold are not exported-and-deleted until the hold is formally lifted in writing by KCM Legal.
5. If the hold extends beyond the standard 1-year retention period, records are retained until the hold is lifted, regardless of the standard deletion schedule.

**KCM IT point of contact for legal holds**: `[KCM IT Security Contact — to be populated at pilot onboarding]`

---

## 7. Washington State Records Schedule Alignment

BASELINE defaults to a **1-year minimum** retention period for `audit_log` data. This is a conservative floor, not a confirmed schedule.

Before pilot launch, the KCM records retention officer should:

1. Confirm the applicable General Schedule category under RCW 40.14 for security audit log records. The likely category is **GS 50-05-020** (Security Audit Records) or an equivalent category in the State's current General Records Retention Schedule. As of 2026, the WA State Archives General Schedule is maintained by the Washington State Archives at digitalarchives.wa.gov.
2. Confirm whether the `audit_log` table constitutes a public record under RCW 42.56 (Public Records Act). Given that it records administrative actions on a system operated for KCM (a public agency), it likely does.
3. Advise whether the 1-year minimum is sufficient or whether a longer period (e.g., 3 years, 6 years) applies to the specific action categories captured.

BASELINE will adopt the confirmed schedule once provided. Until that confirmation, 1 year remains the operational minimum and all deletion procedures respect that floor.

---

## 8. Review Cadence

This policy is reviewed:

- **Annually** — no less than once every 12 months from the date of this document.
- **On any material change** to the log infrastructure, hosting platform, or applicable retention schedule.
- **After any P1 security incident** (as defined in the Incident Response Plan, S2-3) that involves the audit log.

Policy updates are committed to `docs/security/log-retention-policy.md` with a corresponding changelog entry.

---

## 9. Document History

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-05-14 | Initial policy — S2-6. Reflects audit_log table (S1-1) and audit writes (S1-2). |

---

## 10. References

| Document | Path |
|----------|------|
| S1-1 changelog (audit_log table) | `docs/changelog/2026-05-13-s1-1-audit-log-table.md` |
| S1-2 changelog (wire audit writes) | `docs/changelog/2026-05-13-s1-2-wire-audit-writes.md` |
| Admin Access Policy | `planning/security/ADMIN_ACCESS_POLICY.md` |
| Data Classification Document | `docs/security/data-classification.md` (S2-5) |
| Business Continuity Summary | `docs/security/business-continuity.md` (S2-4) |
| Incident Response Plan | `docs/security/incident-response-plan.md` (S2-3) |
| NIST SP 800-53 Control Mapping | `docs/security/nist-800-53-control-mapping.md` (S2-1) |
| RCW 40.14 (Records Retention) | Washington State Legislature |
| RCW 42.56 (Public Records Act) | Washington State Legislature |
