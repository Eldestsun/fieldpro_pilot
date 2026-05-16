# BASELINE — Data Classification Document for Exports

> **Document type**: Security policy artifact
> **Sprint item**: S2-5
> **Status**: Active
> **Last updated**: 2026-05-14
> **Input to**: S2-1 (AU-2, AU-9), S2-7 (Data Use Limitation), S2-10 (TPRA Package)
> **Related**: `planning/security/ADMIN_ACCESS_POLICY.md` (audit_log classification — reference that document; the roster and use-limitation statement are not restated here)

---

## 1. Classification Framework

BASELINE uses four classification levels. Every data category in section 3 is assigned to exactly one level.

| Level | Definition |
|-------|-----------|
| **Public** | KCM-owned asset and operational data with no PII and no security sensitivity. Freely shareable within normal operational context. Exportable with standard access controls. |
| **Internal** | Operational data for use within KCM and authorized BASELINE roles. Not for public disclosure. No worker-identifying fields in the intelligence layer. |
| **Confidential** | Data that may contain incidental PII (e.g., photos that could capture members of the public) or that warrants restricted distribution beyond standard operational access. Access scoped to authorized roles with documented need. |
| **Restricted** | Data with security, compliance, or privacy significance. Access requires elevated role or IT provisioning. Access to Restricted data is itself logged and auditable. |

---

## 2. PII Assessment

BASELINE does not collect worker names, home addresses, personal phone numbers, or any consumer PII.

**Azure Entra Object IDs (OIDs)** are pseudonymous identifiers. An OID is not directly a name or address, but it is re-identifiable via the Azure Entra directory by an actor with directory read access. OIDs are therefore treated as pseudonymous personal data — not PII in the strict sense, but subject to access controls commensurate with that re-identification risk.

`captured_by_oid` on `core.visits` is the only OID stored at the visit level. It is KMS-encrypted at rest (S1-13) and held at a separate access tier. It is not surfaced in any operational UI. No operational dashboard a chief, superintendent, supervisor, or dispatcher can reach contains an OID or any other worker-identifying field.

**Field workers (route specialists)** interact with BASELINE under their Azure Entra identity for authentication purposes. That identity is not propagated into the intelligence or operational layers in a queryable, role-accessible form.

---

## 3. Data Inventory

### 3.1 Stop / Asset Records

| Field | Value |
|-------|-------|
| **Data category** | Stop / asset records |
| **Example fields** | `stop_id`, `stop_name`, `latitude`, `longitude`, `is_hotspot`, `compactor`, `has_trash`, asset metadata |
| **Table(s)** | `stops` |
| **Classification** | **Public** |
| **Who can access** | Admin, Lead, UL (read); Admin (write/export) |
| **Retention** | Duration of pilot; see S2-6 for formal retention schedule |
| **Export controls** | Exportable by Admin in CSV via SFTP nightly export (S1-6). No PII. No handling restrictions beyond normal operational data. Export event logged in `audit_log` if exported via Admin endpoint. |

Stop records are KCM-owned asset data. Worker identity does not appear in this table. This is the lowest-sensitivity data category in BASELINE.

---

### 3.2 Route Run Records

| Field | Value |
|-------|-------|
| **Data category** | Route run records |
| **Example fields** | `route_run_id`, `assignment_date`, `status`, `completion_flags`; `route_run_stop_id`, `stop_id`, `sequence`, `completed_at` |
| **Table(s)** | `route_runs`, `route_run_stops` |
| **Classification** | **Internal** |
| **Who can access** | Admin, Lead (read and export); UL (own active run only) |
| **Retention** | See S2-6 |
| **Export controls** | Exportable by Admin and Lead. Included in SFTP nightly export (S1-6). Contains route structure and completion state but no worker-identifying data in the intelligence layer. Export logged in `audit_log` when Admin initiates export-and-delete (S1-4). |

Route run records capture which stops were serviced, when, and in what sequence. They are scoped to the route, not to the worker. No worker OID, name, or identifier appears as a queryable column at this tier. Supervisory or dispatch review of route completion is a legitimate operational function that does not require worker identity and does not produce one.

---

### 3.3 Condition Observations and Effort History

| Field | Value |
|-------|-------|
| **Data category** | Checklist / condition observations and effort history |
| **Example fields** | `stop_id`, `visit_id`, `condition_score`, `service_evidence`, `observed_at`; `core.observations` fields including observation type, value, timestamp |
| **Table(s)** | `stop_effort_history`, `stop_condition_history`, `core.observations` |
| **Classification** | **Internal** |
| **Who can access** | Admin (read and export); Lead (dashboard read) |
| **Retention** | See S2-6 |
| **Export controls** | Exportable by Admin. Included in SFTP nightly export (S1-6) as canonical operational data. Read by Lead dashboard for route progress and condition review. |

**Labor safety structural guarantee — verifiable schema fact:**

The intelligence layer tables `stop_effort_history`, `stop_condition_history`, and `core.observations` contain no `user_id` column, no worker name, and no worker OID. These tables are keyed by `(stop_id, visit_id)` or equivalent asset-scoped identifiers. Worker identity was deliberately excluded from the schema of these tables.

A SQL query against `stop_effort_history`, `stop_condition_history`, or `core.observations` cannot produce a per-worker performance profile because worker identity is not present in the data model. This is a schema-enforced constraint, not an access-control-enforced one. Granting a new role read access to these tables would not expose worker identity, because the identity field does not exist in them.

An evaluator can verify this directly: connect to the BASELINE database and run `\d stop_effort_history`, `\d stop_condition_history`, and `\d core.observations`. No `user_id` column will appear. This guarantee is observable, not promised.

---

### 3.4 Field Photos

| Field | Value |
|-------|-------|
| **Data category** | Field photos |
| **Example fields** | Photo file (JPEG/PNG), `stop_id`, `captured_at`, `uploader_oid` (internal reference, not queryable via operational UI) |
| **Table(s) / Storage** | `stop_photos`, `core.evidence`; S3-compatible object storage bucket |
| **Classification** | **Confidential** |
| **Who can access** | Admin, Lead (via signed URL); UL (own uploads, via signed URL) |
| **Retention** | See S2-6; retained for the duration of the associated visit record |
| **Export controls** | **Not included in CSV exports.** Accessible only via time-limited signed URL issued to an authorized role. Photos are not bulk-exported via the SFTP nightly export (S1-6). Admin may initiate photo deletion via export-and-delete endpoint (S1-4); deletion event logged. |

Photos are classified Confidential because field photography at transit stops may incidentally capture members of the public. Photos are never returned as raw file data in API responses — only as signed, expiring URLs scoped to an authenticated session. File type and content validation is enforced on upload (S1-12) to prevent malicious file injection.

---

### 3.5 Audit Log

| Field | Value |
|-------|-------|
| **Data category** | Audit log |
| **Example fields** | `action`, `actor_oid`, `target_id`, `timestamp`, `detail` (JSON) |
| **Table(s)** | `audit_log` |
| **Classification** | **Restricted** |
| **Who can access** | Admin only (see `planning/security/ADMIN_ACCESS_POLICY.md` for the authoritative roster) |
| **Retention** | Minimum 1 year from date of entry; see S2-6 for the formal retention schedule and alignment with KCM's records retention schedule |
| **Export controls** | Exportable by Admin only via `GET /api/admin/audit-log` (S1-3, CSV). Export event is itself written to `audit_log` (meta-audit, S1-2). Export-and-delete via S1-4 requires confirmation token; deletion event logged. |

The audit log is classified Restricted. For the authoritative description of who holds Admin access, why, and the use-limitation statement governing audit log data, see `planning/security/ADMIN_ACCESS_POLICY.md`. That document is the source of truth for this classification — its roster and use-limitation language are not restated here to prevent policy drift.

The audit log records administrative actions, not field operational data. It does not contain stop-level visit records and does not produce a per-worker performance profile when queried. See `planning/security/ADMIN_ACCESS_POLICY.md` § "Why the Audit Log Cannot Be Misused for Worker Surveillance" for the architectural explanation.

---

### 3.6 `captured_by_oid` (Visit-Level Worker Identity)

| Field | Value |
|-------|-------|
| **Data category** | Visit-level worker OID |
| **Example fields** | `captured_by_oid` (Azure Entra OID, KMS-encrypted) |
| **Table(s)** | `core.visits` |
| **Classification** | **Restricted** |
| **Who can access** | No application role. Accessible only via direct DB access (IT-provisioned, logged) or Azure Entra elevated access (both produce a documented access trail). |
| **Retention** | Co-terminous with the parent `core.visits` record; see S2-6 |
| **Export controls** | **Not included in any export.** Not accessible via any API endpoint. Not surfaced in any operational UI. Encrypted at rest via KMS (S1-13). |

`captured_by_oid` is the Azure Entra OID of the field worker who recorded a visit. It exists at the visit level for security audit purposes only — specifically, to support incident investigation if an anomalous or contested visit record must be attributed.

This field is KMS-encrypted at rest (S1-13). Decrypting it requires the KMS key, which is IT-provisioned and access-logged separately from the application. The only paths to this data are direct database access with an IT-provisioned credential (logged) or Azure Entra elevated access (produces an even more visible organizational trail). Both paths transform any misuse from an ambient pattern observation into a documentable targeted surveillance action with a retained access trail.

Operational leadership — chiefs, superintendents, supervisors, and dispatchers — hold UL or Lead roles. Neither role has any access path to `captured_by_oid` through BASELINE. There is no escalation path within the application.

The intelligence layer tables (`stop_effort_history`, `stop_condition_history`, `core.observations`) do not reference `captured_by_oid` and cannot be joined to it in a way that produces a per-worker stop performance record via a standard application query.

---

### 3.7 Authentication Tokens

| Field | Value |
|-------|-------|
| **Data category** | MSAL JWT authentication tokens |
| **Example fields** | `aud`, `iss`, `exp`, `oid` claims (validated on each request) |
| **Storage** | Ephemeral — not persisted by BASELINE |
| **Classification** | **Restricted** (ephemeral) |
| **Who can access** | Runtime validation only; never stored or logged by BASELINE |
| **Retention** | Session-scoped; expire per Azure Entra token policy (not BASELINE-controlled) |
| **Export controls** | Not exportable; not persisted |

BASELINE validates `aud`, `iss`, `exp`, and `oid` JWT claims on each authenticated request (S1-11). Tokens are not stored in the database, not written to logs, and not returned in API responses. Token lifecycle is governed entirely by Azure Entra policy, not by BASELINE retention rules.

---

## 4. Export Formats and Controls Summary

| Export mechanism | Authorized role | Data included | Audit event |
|-----------------|----------------|--------------|-------------|
| `GET /api/admin/audit-log` (CSV) | Admin only | `audit_log` records | `admin.audit_log_read` logged to `audit_log` |
| SFTP nightly export (S1-6) | Admin-configured destination | Canonical operational data: stops, route runs, condition observations — **no audit_log, no photos, no OIDs** | Export initiation logged |
| Export-and-delete endpoint (S1-4) | Admin only | Any Admin-accessible category; confirmation token required; irrevocable | `admin.data_export_delete` logged; deletion irreversible |

No export mechanism includes `captured_by_oid`. No export mechanism includes photo files as raw data. No export mechanism produces a per-worker performance record, because worker identity does not exist as a queryable column in the exported data categories.

---

## 5. Data Residency

| Hosting posture | Data location |
|----------------|--------------|
| **Demo (Render/Fly.io)** | US region of the hosting provider. Specific datacenter determined by provider configuration at deployment time. |
| **Pilot (Azure commercial)** | Azure US regions (East US / West US). Azure Database for PostgreSQL Flexible Server and Azure Blob Storage both default to the selected Azure region. Data does not leave US regions under standard configuration. |
| **Full contract (Azure Government)** | Azure Government regions (USGov Virginia / USGov Iowa). FedRAMP-Moderate data residency requirements met. Data subject to US Government cloud governance. |

For all postures, BASELINE does not replicate data to non-US regions and does not share data with analytics third parties, advertising networks, or data brokers.

---

## 6. Third-Party Data Sharing

Data is shared with external systems only as follows:

1. **KCM-controlled SFTP destination** (nightly export, S1-6): canonical operational data only; no audit_log, no photos, no OIDs. The SFTP destination is KCM-owned and governed by KCM's own data handling policies.
2. **Azure Entra** (authentication only): BASELINE validates tokens issued by Azure Entra; it does not send operational data to Azure Entra. The identity provider relationship is one-way — inbound authentication tokens only.
3. **KMS** (key management): `captured_by_oid` is encrypted and decrypted via KMS (S1-13). KMS receives the ciphertext for decryption operations; it does not receive or store the plaintext OID or any associated visit record data.

No other third-party data sharing exists. ArcGIS integration is roadmap-only (see S2-8) and is not a current data flow.

---

## 7. Document Review and Maintenance

This document is reviewed:
- Before any schema change to the intelligence layer (`stop_effort_history`, `stop_condition_history`, `core.observations`, `core.visits`)
- Before any new export endpoint or export format is introduced
- Annually as part of the security policy review cycle

The labor safety structural guarantee in section 3.3 must be re-verified against the live schema after any Tier 4 or later schema migration. The guarantee is stated as a verifiable fact — it must remain accurate.
