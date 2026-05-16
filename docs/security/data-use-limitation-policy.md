# BASELINE — Data Use Limitation Policy (WA Public-Sector Privacy)

> **Document type**: Security policy artifact
> **Sprint item**: S2-7
> **Status**: Active
> **Last updated**: 2026-05-14
> **Input to**: S2-10 (TPRA Package — Privacy section)
> **Controlling policy for audit_log access**: `planning/security/ADMIN_ACCESS_POLICY.md`
> **Related**: `docs/security/data-classification.md` (S2-5)

---

## Purpose

This document states the purposes for which BASELINE data may and may not be used, and demonstrates that the application's architecture enforces those limitations structurally — not merely by policy declaration. The primary audience is KCM Legal, KCM IT, and the TPRA evaluator. The union or its legal representative may also review this document.

The labor safety framing in this document draws directly from `planning/security/ADMIN_ACCESS_POLICY.md`. The structural guarantee and use-limitation language in that file is the policy basis for the sections below. No new framing is introduced here; the policy formalizes and extends what that document already establishes.

---

## 1. Stated Purposes of Data Collection

BASELINE collects and processes data for the following enumerated purposes only. Any use not listed here is a prohibited use (section 2).

### 1.1 Asset Condition Monitoring

BASELINE captures the physical condition of transit stops and related field assets — cleanliness scores, observed defects, service evidence. This data is keyed to the asset (stop) and the visit, not to the worker. The purpose is to build an accurate, longitudinal record of asset condition so that maintenance resources can be directed to highest-need assets.

### 1.2 Route Completion Tracking

BASELINE tracks which stops were serviced, when, and in what sequence on a given route run. This data supports operational awareness at the dispatch and supervisory level — specifically, whether a route has been completed and whether any stops were skipped or flagged. Worker identity does not appear in the intelligence layer.

### 1.3 Security Audit Trail

BASELINE maintains an `audit_log` table that records administrative actions: authentications, route assignments, configuration changes, and data exports. This log exists exclusively for security-investigation purposes — detecting unauthorized access, investigating anomalies, and satisfying compliance audit requirements. See `planning/security/ADMIN_ACCESS_POLICY.md` for the authoritative use-limitation statement governing audit log data. That document's use-limitation list is incorporated by reference into this policy.

### 1.4 EAM Data Enrichment

BASELINE exports canonical route and condition data to KCM's Hexagon EAMS system via nightly SFTP transfer (S1-6, S1-7). The purpose is to enrich the EAMS asset record with field-condition intelligence that EAMS does not otherwise capture — stop cleanliness scores, defect observations, and route completion state. No worker identity data is included in this export.

### 1.5 ArcGIS Integration (Roadmap Only)

A future roadmap item contemplates exporting stop-location and condition data to KCM's ArcGIS environment for geospatial visualization (see S2-8). This integration does not exist today and is not a current data flow. When implemented, it will follow the same labor safety constraint as all other exports: no worker identity in any ArcGIS-bound data.

---

## 2. Prohibited Uses

Data collected and stored in BASELINE must not be used for any of the following purposes, regardless of the organizational role or authority of the actor requesting the use:

1. **Per-worker performance assessment, scoring, or ranking** — no use of BASELINE data to produce a metric, score, or rank that reflects the performance of an individual field worker.

2. **Worker scheduling decisions based on individual stop-level data** — route assignments are an operational function; they may not be informed by individual stop-level output data extracted from BASELINE's intelligence layer.

3. **Disciplinary proceedings based on BASELINE data alone** — BASELINE data may not be used as primary or sole evidence in a disciplinary action against a field worker.

4. **Any comparison surface that identifies or implies individual worker performance** — dashboards, exports, or queries that compare named or identifiable workers against each other, or that rank workers by stop output, are prohibited.

5. **Sale, licensing, or sharing of data with any party other than KCM and its authorized agents** — data may not be sold, licensed, or shared with any external party not listed in section 4 of this document.

6. **Surveillance of individual worker location or movement** — BASELINE does not collect GPS location data for field workers. No feature may be introduced that tracks worker location.

These prohibitions apply to all roles — including Admin. Holding the Admin role enables administrative access to audit log data for security investigation purposes only (see `planning/security/ADMIN_ACCESS_POLICY.md`); it does not authorize any of the prohibited uses above.

---

## 3. Structural Enforcement of the Labor Safety Guarantee

This section is the architectural core of this policy. The prohibited uses in section 2 are not enforced by policy declaration alone. They are enforced by the schema design of BASELINE's intelligence layer, which makes the most dangerous prohibited uses impossible to execute through any standard application query — regardless of the actor's role or intent.

### 3.1 What the Intelligence Layer Contains

The intelligence layer tables are:
- `stop_effort_history`
- `stop_condition_history`
- `core.observations`

These tables record asset condition and service evidence keyed to stops and visits. The specific columns that exist in these tables are asset-scoped identifiers (`stop_id`, `visit_id`), condition and effort values, and timestamps.

**The specific columns that were deliberately excluded** are: `user_id`, worker name, worker OID, and any other worker-identifying field. These columns were excluded by design during Tier 4 schema cleanup. They have never been added back.

An evaluator can verify this directly:

```sql
\d stop_effort_history
\d stop_condition_history
\d core.observations
```

No `user_id` column will appear in any of these tables. The labor safety guarantee is a schema fact, not a policy promise. It is visible to any reviewer with direct database access and does not require trust in any policy document to verify.

### 3.2 Why This Makes Per-Worker Profiling Impossible via Standard Queries

A SQL query against `stop_effort_history`, `stop_condition_history`, or `core.observations` cannot produce a per-worker performance profile because worker identity is not present in the data model. There is no column to filter on, no column to group by, and no join key to a worker-identity table available through the application's query surface.

This constraint is schema-enforced, not access-control-enforced. Adding a new database role with read access to these tables would not expose worker identity, because the field does not exist to read. The prohibition is structurally embedded in the data model rather than enforced solely at the access-control layer.

### 3.3 The `captured_by_oid` Field

`captured_by_oid` exists on `core.visits` for security audit purposes only — specifically, to support incident investigation if an anomalous or contested visit record must be attributed to a specific actor.

This field has all of the following access restrictions applied simultaneously:

- **KMS-encrypted at rest** (S1-13): decrypting the value requires a KMS key that is IT-provisioned and separately access-logged.
- **No application surface**: no API endpoint returns `captured_by_oid`. No operational dashboard displays it. No export includes it.
- **Separate access tier**: reaching this field requires direct database access with an IT-provisioned credential (logged at the infrastructure level) or Azure Entra elevated access — both produce a more visible and auditable organizational trail than any action taken through the BASELINE application.

The design intent is that any attempt to misuse `captured_by_oid` for worker surveillance transforms from an ambient pattern observation ("I noticed something") into a documentable targeted surveillance action with a retained access trail. The access trail is not just a deterrent — it is the evidence base that makes inappropriate use detectable and attributable after the fact.

The intelligence layer tables (`stop_effort_history`, `stop_condition_history`, `core.observations`) do not reference `captured_by_oid` and cannot be joined to it in a way that produces a per-worker stop performance record via a standard application query. The encryption, the access tier, and the absence of a join path in the intelligence layer are three independent barriers, each of which alone would prevent the misuse.

### 3.4 What Operational Leadership Can and Cannot Do

Chiefs, superintendents, supervisors, and dispatchers hold **UL** or **Lead** roles in BASELINE. Neither role has access to:

- `captured_by_oid` (no application surface; separate access tier as described above)
- The `audit_log` table (route enforces `requireAnyRole(['Admin'])`; HTTP 403 for any non-Admin attempt)
- Any worker-identifying field in the intelligence layer (no such field exists in the schema)

The application offers no surface through which operational leadership can profile an individual field worker — regardless of that person's organizational authority. A chief who wanted to investigate a specific worker's stop history cannot do so through BASELINE by design.

This is not a gap in the current implementation to be addressed later. It is an intentional and permanent architectural property of the system.

### 3.5 Summary of the Structural Guarantee

| Claim | How enforced | Verifiable by |
|-------|-------------|--------------|
| Intelligence tables contain no worker identity | Schema design — no `user_id` column present | Any reviewer: `\d stop_effort_history` |
| Per-worker profiling impossible via standard query | No worker-identifying column to filter or join on | Schema inspection |
| `captured_by_oid` not reachable via application | No API endpoint returns it; KMS-encrypted | Code review + API audit |
| `captured_by_oid` access produces an audit trail | IT-provisioned DB access + Azure Entra both log access | Infrastructure log review |
| Operational leadership cannot reach audit log | Route-layer `requireAnyRole(['Admin'])` | Code review: `backend/src/middleware/authz.ts` |

---

## 4. EAMS Coexistence Statement

BASELINE coexists with Hexagon EAMS. It does not compete with EAMS and does not duplicate EAMS's work-order model.

EAMS records work-order assignments with worker identifiers. This is a pre-existing surveillance exposure within the organization's existing systems. BASELINE does not add to this exposure.

BASELINE's intelligence layer is structurally less identifiable than the EAMS work-order model. An evaluator comparing the two systems will find that EAMS work orders carry explicit worker identity at the record level, while BASELINE's `stop_effort_history` and `stop_condition_history` carry no worker identity at all. BASELINE's canonical layer (`core.visits`) carries `captured_by_oid` only as a security audit field, at a separately access-controlled tier, with KMS encryption.

If an organizational actor wished to correlate a worker to a route, the path of least resistance is EAMS, not BASELINE. BASELINE does not create a new surveillance vector — it creates a less identifiable one at the intelligence layer, by design.

---

## 5. Data Sharing and Third Parties

BASELINE shares data with external systems only as follows:

1. **KCM-controlled SFTP destination** (nightly export, S1-6): canonical operational data only. No `audit_log` records. No photos. No `captured_by_oid`. The destination is KCM-owned; downstream retention is governed by KCM's own data handling policies, not by this document.

2. **Azure Entra** (authentication only): BASELINE validates tokens issued by Azure Entra. It does not send operational data, visit records, or audit data to Azure Entra. The data flow is one-directional: inbound authentication tokens only.

3. **KMS** (key management for `captured_by_oid`): the KMS service encrypts and decrypts `captured_by_oid` on `core.visits`. KMS receives the ciphertext for encryption and decryption operations; it does not receive or store visit record data or any other operational BASELINE data.

**No other third-party data sharing exists.** BASELINE does not share data with analytics third parties, advertising networks, data brokers, or any party outside the three listed above. ArcGIS integration is roadmap-only (S2-8) and is not a current data flow.

---

## 6. Access to This Policy and the Admin Access Roster

The authoritative Admin access roster — who holds the Admin role, why, and under what governance — is documented in `planning/security/ADMIN_ACCESS_POLICY.md`. That document also contains the use-limitation statement for audit log data that governs the Admin role's access to `audit_log`.

This policy does not restate the roster. Separation of the roster into a dedicated committed document prevents the policy layer from drifting away from the access configuration that the code actually enforces. When the roster changes, `planning/security/ADMIN_ACCESS_POLICY.md` is updated; this policy document automatically inherits the change by reference.

---

## 7. Enforcement Mechanisms

This policy is enforced by three independent mechanisms, each of which provides a distinct layer of protection:

**1. Schema design.**
The intelligence layer tables contain no worker-identifying columns. This is the primary enforcement mechanism. It does not require any access control to be correctly configured, any policy to be respected, or any trust in organizational behavior. It is enforced by the database schema.

**2. Route-layer access controls in the backend.**
`backend/src/middleware/authz.ts` enforces role-based access on every API route. Admin-only routes return HTTP 403 to any non-Admin request. There is no privilege escalation path within the application. This protects the audit log and Admin-only export endpoints from access by roles that operational leadership holds.

**3. This policy as a commitment to KCM.**
This document constitutes a formal commitment by the system operator (Invaria) to KCM that the enumerated prohibited uses will not be implemented, enabled, or facilitated in any future version of BASELINE. Any schema change to the intelligence layer that introduces a worker-identifying column would breach this commitment and require formal disclosure to KCM before deployment.

The three mechanisms are independent. Compromising any one of them does not eliminate the protection provided by the other two. The schema constraint (1) does not depend on access controls (2) being correctly configured. The policy commitment (3) creates organizational accountability that persists even if a future implementation decision degrades (1) or (2).

---

## 8. Review Cadence

This policy is reviewed:
- **Before any schema change to the intelligence layer** (`stop_effort_history`, `stop_condition_history`, `core.observations`, `core.visits`) — changes to these tables may affect the accuracy of section 3 and must be verified before the change is deployed.
- **Annually** as part of the security policy review cycle.
- **Before any new export endpoint or integration** is introduced — new data flows must be assessed against the prohibited uses in section 2 and the data sharing list in section 5.

Changes to the Admin access roster are managed in `planning/security/ADMIN_ACCESS_POLICY.md` and do not require a revision to this document unless the change affects the scope of permitted uses.
