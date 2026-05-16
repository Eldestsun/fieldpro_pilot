# BASELINE — TPRA Questionnaire Answers + Integration Options Matrix

**Document**: S2-10
**Version**: 1.0
**Date**: 2026-05-14
**Status**: Pending founder review and KCM IT contact population
**Hosting posture at time of writing**: Demo — Render or Fly.io. Pilot commitment: Azure commercial. Full contract path: Azure Government (FedRAMP-Moderate).
**Prepared for**: KCM IT security review and WA OCIO Technology and Privacy Risk Assessment (TPRA)

---

## How to Use This Document

This document answers the standard WA OCIO / KCM IT TPRA questionnaire categories. For each section, source document citations are provided so the evaluator can read the underlying policy and implementation evidence directly. Part 2 (§15) contains the Integration Options Matrix. Part 3 (§16) is the package checklist the evaluator and founder use to confirm the TPRA package is complete before submission.

Gaps are stated honestly. Every gap has a specific remediation reference and target sprint. A gap without a remediation path is a procurement blocker; a gap with a documented upgrade path is an accepted-risk finding.

---

# Part 1 — TPRA Questionnaire Answers

---

## 1. System Description and Purpose

**What is BASELINE?**

BASELINE is a Field Operations Intelligence System built to capture ground-truth operational data from field visits to King County Metro transit stops. It is a state layer, not a work-order system. All operational data captured in the field attaches to the asset — the bus shelter or transit stop — not to the worker servicing it.

The system coexists with KCM's Hexagon EAMS system. EAMS is the system of record for assets that generate telemetry. Bus shelters and field-condition assets do not generate telemetry — only a field worker's direct observation can assess their condition. BASELINE is the ground-truth collection layer that makes the EAMS investment perform better for this asset class. The pitch to KCM is not to replace EAMS; it is to provide the missing capability that makes the existing $17M investment work for field-condition assets.

**Who are the users?**

| Role | Description | Pilot headcount estimate |
|------|-------------|------------------------|
| **UL** (Unit Lead / field worker) | Route specialists who clean transit stops. Primary data-entry surface. | 5–15 workers on pilot routes |
| **Lead** | Supervisors who create and assign routes; monitor route progress. | 2–4 supervisors |
| **Admin** | System administrators with audit log access, configuration, and export. | 3 (Invaria founder, KCM BA team, KCM IT) |

**Vendor information**: BASELINE is developed and operated by Invaria, a business entity owned by the founder. Full product ownership disclosure was made to KCM organizational leadership early and directly. The founder holds a day-job position on the KCM Transit Facilities Division BA team; this role is performed on its own merits. The product enters organizational conversation only when someone asks whether a solution exists — disclosure first, product second.

**Source documents**: `PROJECT_CONTEXT.md`; `planning/security/ADMIN_ACCESS_POLICY.md`

---

## 2. Data Classification and Types Collected

BASELINE uses four classification levels: Public, Internal, Confidential, and Restricted.

| Data category | Classification | Tables | Notes |
|--------------|---------------|--------|-------|
| Stop / asset records | **Public** | `stops` | Stop location, asset metadata. No PII. |
| Route run records | **Internal** | `route_runs`, `route_run_stops` | Route structure, completion state. No worker identity in intelligence layer. |
| Condition observations / effort history | **Internal** | `stop_effort_history`, `stop_condition_history`, `core.observations` | No `user_id` column — schema-enforced labor safety guarantee. |
| Field photos | **Confidential** | `stop_photos`, `core.evidence` (S3 bucket) | May incidentally capture members of public. Signed URL access only; not in CSV exports. |
| Audit log | **Restricted** | `audit_log` | Admin-only. `actor_oid` (Azure Entra OID), action, timestamp. Minimum 1-year retention. |
| Visit-level worker OID | **Restricted** | `core.visits` (`captured_by_oid_ciphertext`) | KMS-encrypted (AES-256-GCM, S1-13). No application surface. IT-provisioned access only. |
| Authentication tokens | **Restricted** (ephemeral) | Not persisted | MSAL JWTs validated per-request; never stored by BASELINE. |

**PII assessment**: BASELINE does not collect worker names, home addresses, personal phone numbers, or consumer PII. Azure Entra Object IDs (OIDs) are pseudonymous identifiers — re-identifiable via the Azure Entra directory but not directly PII. OIDs are treated as pseudonymous personal data and handled accordingly. The `captured_by_oid` field is the only OID stored at the visit level; it is KMS-encrypted and has no application surface.

**Source document**: `docs/security/data-classification.md` (S2-5)

---

## 3. Authentication and Access Control

**Authentication mechanism**: All users authenticate via Microsoft Authentication Library (MSAL) with Azure Entra (formerly Azure Active Directory). There are no local username/password credentials, no shared accounts, and no anonymous access to data-bearing endpoints.

**Token validation**: On every authenticated request, the backend validates the MSAL-issued JWT through a two-stage process:
1. `jwt.verify()` validates the token signature against the Azure Entra JWKS endpoint (cached 1 hour)
2. `assertClaims(payload)` (added in S1-11) validates `aud` (configured client ID), `iss` (v2.0 Entra endpoint only — v1.0 `sts.windows.net` issuers are rejected), `oid` (non-empty string), and `exp` (60-second clock tolerance)

Any claim validation failure returns HTTP 401 with the generic message `"invalid token"` — no internal claim detail is exposed to the caller. A `auth.login_failed` audit event is written on every failure.

**Access control model**: Role-based access control (RBAC) with three roles enforced at the API route layer by `requireAnyRole` middleware:
- Admin routes (`/api/admin/*`): `requireAnyRole(['Admin'])` — HTTP 403 for non-Admin callers
- Lead routes (`/api/routes/*`): `requireAnyRole(['Admin', 'Lead'])`
- UL routes (`/api/work/*`): `requireAnyRole(['Admin', 'Lead', 'UL'])`

**Labor safety enforcement**: Operational leadership — chiefs, superintendents, supervisors, dispatchers — hold Lead or UL roles. Neither role has access to the audit log, to `captured_by_oid`, or to any worker-keyed intelligence table. This is enforced at the route layer (HTTP 403), not solely by policy. No escalation path exists within BASELINE.

**Database-layer tenant isolation**: Row Level Security (RLS) on all canonical tables enforces `org_id` scoping via the `app.current_org_id` session variable. Cross-tenant data access is structurally impossible at the query layer regardless of application code. Verified by `backend/scripts/verify_rls.ts` (6 assertions) and `backend/scripts/verify_r11.ts` (6 assertions) against a live database.

**Source documents**: `docs/security/nist-800-53-control-mapping.md` (AC family); `planning/security/ADMIN_ACCESS_POLICY.md`; `backend/src/middleware/authz.ts`

---

## 4. Encryption (In Transit and At Rest)

### In Transit

All client-to-backend communication occurs over HTTPS with TLS terminated at the hosting provider's ingress. No HTTP-only data endpoints exist in the application. SFTP transport (nightly export, S1-6) uses key-based authentication with strict host-key checking — password-based SFTP auth is never attempted, and unknown hosts are refused.

**Gap at demo posture**: HTTP-to-HTTPS redirect is handled at the hosting provider's ingress layer; the application does not enforce a redirect if the ingress is misconfigured. This closes at Azure commercial pilot (Azure App Service HTTPS-only setting or Azure Front Door redirect).

### At Rest

**Application-layer encryption**: The `captured_by_oid` field on `core.visits` is encrypted with AES-256-GCM at the application layer (`backend/src/lib/oidCipher.ts`, S1-13), regardless of hosting-layer disk encryption status. Per-record DEK generated via `crypto.randomBytes(32)`; DEK wrapped with a KMS Key Encryption Key. Non-deterministic (random IV per record); GCM tag prevents ciphertext tampering. Every decrypt call writes a mandatory `admin.oid_decrypt` audit entry.

**KMS status**: At demo posture, `DevStaticKeyAdapter` is used (development environment only). The `AzureKeyVaultAdapter` code stub is implemented and requires only the vault URL and key name to activate — no code changes needed. Azure Key Vault provisioning is part of the pilot setup (S3-1).

**Disk-level encryption**: Not asserted at demo posture (Render/Fly.io). At Azure commercial pilot: Azure Database for PostgreSQL encrypts all data at rest with AES-256 by default (Microsoft-managed keys; customer-managed key option available). At Azure Government: same, with FedRAMP-Moderate SC-28 inheritance.

**SFTP export integrity**: SHA-256 checksum sidecar files are generated alongside every export bundle (JSON and CSV), allowing the receiving party to verify file integrity at the destination.

**Source documents**: `docs/security/nist-800-53-control-mapping.md` (SC-8, SC-13, SC-28); `docs/changelog/2026-05-13-s1-13-oid-encryption.md`

---

## 5. Audit Logging and Monitoring

**Audit log table**: The `audit_log` table was created in S1-1 (`backend/migrations/20260513_audit_log.sql`). It records all administrative and security-relevant actions with the following fields: `actor_oid` (Azure Entra OID — never a name or display name), `org_id`, `action`, `resource_type`, `resource_id`, `detail` (JSONB), `ip_address`, `occurred_at`.

**Events currently logged**:

| Action | Trigger |
|--------|---------|
| `auth.login` | Successful JWT validation |
| `auth.login_failed` | Failed JWT verification or claim assertion |
| `assignment.create` | New route run created |
| `assignment.cancel` | Route assignment nulled |
| `assignment.reassign` | Route assignment OID changed |
| `admin.config_change` | Pool created, updated, or deleted |
| `admin.stop_edit` | Stop record edited (single or bulk) |
| `export.data_export` | Export bundle generated |
| `export.delete_confirm` | Export-and-delete confirmation token issued |
| `export.delete_execute` | Hard delete executed |
| `admin.oid_decrypt` | `captured_by_oid` decrypted (every call) |
| `upload.rejected` | File upload rejected (MIME mismatch or size exceeded) |

**Two event types pending** (no trigger point yet): `admin.user_role_change` (no role-change endpoint; ISSUE-010) and `audit_log_read` (reading the audit log should itself be auditable — documented in Admin Access Policy as a follow-up to S1-3).

**Append-only design**: `FORCE ROW LEVEL SECURITY` on `audit_log` with SELECT and INSERT policies only. No UPDATE or DELETE policy exists — these operations silently affect 0 rows for all roles including the table owner in normal operation. The only permitted delete path (S1-4 export-and-delete) requires an Admin role, a cryptographically secure confirmation token, and a session variable set locally within a single transaction.

**Audit log query endpoint**: `GET /api/admin/audit-log` (Admin only) — date range filtering, action-type filtering, JSON and RFC 4180 CSV output, paginated with true COUNT(*). CSV export for compliance review.

**Retention**: Minimum 1 year from `occurred_at`. See `docs/security/log-retention-policy.md` (S2-6).

**Monitoring at demo posture**: Manual — Admin reviews audit log weekly; Azure Entra sign-in logs reviewed monthly. No automated alerting or SIEM at demo posture. At Azure commercial: Azure Monitor alerts on DB connection spikes and error rate increases; Azure Security Center continuous assessment; Azure Entra Identity Protection automated risk detection. At Azure Government: Azure Sentinel SIEM.

**Source documents**: `docs/security/nist-800-53-control-mapping.md` (AU family); `docs/security/log-retention-policy.md` (S2-6); `planning/security/ADMIN_ACCESS_POLICY.md`

---

## 6. Incident Response Capability

An Incident Response Plan is in place (`docs/security/incident-response-plan.md`, S2-3).

**Severity classification**:
- **P1 — Active Breach**: Confirmed unauthorized access, credential compromise, active exfiltration, or destructive attack. Contain within 1 hour; notify KCM IT within 24 hours.
- **P2 — Suspected Breach**: Anomalous access patterns not yet confirmed. Investigate within 4 hours; notify KCM IT within 48 hours if P1 criteria are not met.
- **P3 — Vulnerability Discovered, Not Exploited**: Remediate within next sprint; no mandatory external notification unless exploited.

**P1 notification procedure**: The 24-hour KCM IT notification requirement is established per the TPRA contractual obligation. Washington State RCW 19.255.010 requires breach notification within 72 hours for affected Washington residents. The notification content template and contact list structure are in S2-3; the KCM IT security contact role field is populated at pilot onboarding.

**Detection sources (current)**: `audit_log` anomaly detection (via S1-3 query endpoint); Azure Entra sign-in logs; CI dependency vulnerability scan.

**Evidence preservation**: S2-3 specifies that all audit evidence must be preserved before any remediation action. The `audit_log` append-only design guarantees the evidence base cannot be destroyed by application-layer actions before export.

**Gap at demo posture**: No automated alerting or SIEM. Manual log review is the compensating control.

**Source document**: `docs/security/incident-response-plan.md` (S2-3)

---

## 7. Business Continuity and Backup

**Current availability posture (demo)**: No formal SLA claimed at demo posture. Render and Fly.io do not provide contractually guaranteed uptime SLAs on the deployment tier in use. BASELINE does not overstate this.

**Compensating control — offline mode**: The BASELINE field worker (UL) surface has an offline queue (`offlineQueue.ts`). Field workers continue recording stop completions during a backend outage; data syncs when connectivity restores. A backend outage during an active shift does not prevent data capture.

**Backup at demo posture** (Render / Fly.io):
- PostgreSQL: automated daily snapshots, 7-day retention by default
- Photos (S3 bucket): backup schedule to be verified and configured at S3-2
- Environment configuration: stored in hosting provider secrets store; must be documented in a separate secure credentials record before pilot launch

**RPO / RTO at demo posture**:

| Failure scenario | RPO | Estimated RTO |
|-----------------|-----|---------------|
| DB failure | Up to 24 hours | 2–4 hours |
| App server failure | Zero (no DB data affected; offline queue preserves field data) | < 15 minutes auto-restart; < 30 minutes manual redeploy |
| Total environment loss | Up to 24 hours (DB) + TBD (photos) | 4–8 hours |

**Pilot posture (Azure commercial)**: Azure Database for PostgreSQL Flexible Server — 99.99% availability SLA with zone-redundant standby. Automated backups, 1–35 day configurable retention, point-in-time recovery (PITR, minimum 5-minute granularity). DB zone failover: < 60 seconds automatic. DB restore from backup: < 4 hours. Composite application SLA (App Service + DB): approximately 99.94%.

**Maintenance window**: Weekday mornings, 04:00–06:00 Pacific, prior to route specialist shift start. 24-hour advance notice for planned maintenance. Emergency maintenance (security patches, P1 response): apply immediately; notify KCM BA team contact within 2 hours of completion.

**Source document**: `docs/security/business-continuity.md` (S2-4)

---

## 8. Accessibility Compliance

**Standard claimed**: WCAG 2.1 Level AA — automated scan conformance across all six application surfaces as of 2026-05-14.

**Audit methodology**:
- **Automated**: `@axe-core/playwright` v4.11.3 run against all six authenticated surfaces in their operational state, with fixture data (route_run 712, 3 stops) for UL surfaces
- **Manual**: focus trap assessment, focus order review, touch target measurement, viewport reflow at 320px, color-only state review (conducted 2026-05-14 alongside S1-9 remediation)
- **Screen reader testing**: pending — VoiceOver / TalkBack manual run is Founder task S3-4, scheduled before pilot launch

**Post-remediation result**: 7 violations found across two scan rounds (4 in S1-8, 3 in UL re-audit after fixture seeding). All 7 resolved. **0 automated violations remain** across all six surfaces as of 2026-05-14.

**Six surfaces audited**:
1. Login / Auth Flow (`/`) — Unauthenticated
2. UL Stop List (`/work`, with fixture data) — UL role
3. UL Stop Detail / Wizard (`/work`, stop opened) — UL role
4. Lead Routes Dashboard (`/routes`) — Lead role
5. Admin Panel (`/admin/pools`) — Admin role
6. Control Center (`/admin/control-center`) — Admin role

**Known items not constituting AA failures**:
- Modal focus management (useEffect focus traps): ARIA roles and labels applied to all 5 dialogs; programmatic focus containment not yet implemented. Not a WCAG 2.1 AA failure (WCAG 2.4.3 does not mandate programmatic focus traps; it prohibits focus traps that block exit). Will be implemented before pilot launch.
- Photo remove button touch target (20×20px): WCAG 2.5.5 is Level AAA — not an AA requirement.

**Statement status**: Automated conformance confirmed. Full statement requires S3-4 (VoiceOver/TalkBack run) and S3-5 (founder sign-off) before finalization.

**WAC 388-823 applicability**: Not yet formally determined. KCM IT should verify whether this regulation applies to BASELINE based on how the system is classified within KCM's technology inventory.

**Source document**: `docs/security/wcag-conformance-statement.md` (S2-9); `docs/security/axe-audit-2026-05-14.md`

---

## 9. Third-Party Integrations and Data Sharing

BASELINE shares data with external systems in three ways, all described in full in §15 (Integration Options Matrix):

1. **SFTP export** (nightly, current): canonical operational data sent to a KCM-controlled SFTP destination. No audit log, no photos, no worker identity (`captured_by_oid`). Key-based auth, strict host-key checking, SHA-256 checksums.

2. **Azure Entra SSO** (current): BASELINE validates MSAL-issued JWTs from KCM's Azure Entra tenant. No operational data flows from BASELINE to Azure Entra. One-directional: inbound authentication tokens only.

3. **KMS for `captured_by_oid` encryption** (current): `captured_by_oid` is encrypted/decrypted via KMS. KMS receives ciphertext only — no operational BASELINE data or visit records are sent to KMS.

4. **ArcGIS** (roadmap only, not current): No ArcGIS integration exists today. Option B (SFTP extension) is recommended — see §15.4 and `docs/security/arcgis-integration-roadmap.md` (S2-8). No worker identity would appear in any ArcGIS-bound data.

**No other third-party data sharing exists.** No analytics third parties, no advertising networks, no data brokers.

**Source documents**: `docs/security/data-classification.md` (S2-5) §6; `docs/security/data-use-limitation-policy.md` (S2-7) §5; `docs/security/arcgis-integration-roadmap.md` (S2-8)

---

## 10. Privacy and Data Use Limitations

**Stated purposes of data collection** (enumerated in `docs/security/data-use-limitation-policy.md`, S2-7):
1. Asset condition monitoring — stop cleanliness scores, defect observations
2. Route completion tracking — which stops were serviced, when
3. Security audit trail — admin actions, role changes, data exports
4. EAM data enrichment — condition and effort data exported to Hexagon EAMS via SFTP
5. ArcGIS integration — roadmap only; no current data flow

**Prohibited uses** — data must not be used for:
- Per-worker performance assessment, scoring, or ranking
- Worker scheduling decisions based on individual stop-level data
- Disciplinary proceedings based on BASELINE data alone
- Any comparison surface that identifies or implies individual worker performance
- Sale, licensing, or sharing of data with any party other than KCM and its authorized agents
- Surveillance of individual worker location or movement

**The structural worker privacy guarantee — a verifiable schema fact**:

The intelligence layer tables — `stop_effort_history`, `stop_condition_history`, and `core.observations` — contain no `user_id` column, no worker name, and no worker OID. These tables are keyed by asset-scoped identifiers (`stop_id`, `visit_id`). Worker identity was deliberately excluded from the schema of these tables during Tier 4 schema cleanup.

A SQL query against these tables cannot produce a per-worker performance profile because worker identity is not present in the data model. This is a schema-enforced constraint, not an access-control-enforced one. Granting a new database role read access to these tables would not expose worker identity, because the identity column does not exist in them.

**Verifiable by any evaluator**:
```sql
\d stop_effort_history
\d stop_condition_history
\d core.observations
```

No `user_id` column will appear. The guarantee is observable, not promised.

**`captured_by_oid` access model**: Exists on `core.visits` for security audit purposes only. KMS-encrypted at rest. No application surface — no API endpoint returns it, no operational dashboard displays it. Accessible only via direct DB access (IT-provisioned, logged at infrastructure level) or Azure Entra elevated access. Both paths produce a documented access trail, transforming any misuse from an ambient observation into a documentable targeted surveillance action.

**Three enforcement mechanisms** (each independent):
1. Schema design — no worker identity column in intelligence tables
2. Route-layer access controls — `requireAnyRole(['Admin'])` on all Admin-gated routes
3. This policy document as a formal commitment to KCM — any schema change introducing worker identity to the intelligence layer breaches this commitment and requires KCM disclosure before deployment

**EAMS coexistence**: EAMS work orders carry explicit worker identity at the record level. BASELINE's intelligence layer carries no worker identity. BASELINE does not add to the surveillance exposure already present in the organization's existing systems — it creates a structurally less identifiable layer by design.

**Source documents**: `docs/security/data-use-limitation-policy.md` (S2-7); `planning/security/ADMIN_ACCESS_POLICY.md`

---

## 11. Hosting Environment and Data Residency

**Current posture (demo)**: Render or Fly.io. US region. No FedRAMP inheritance. No formal SLA. No asserted disk-level encryption. Physical security: SOC 2 Type II from provider (not independently verified by BASELINE).

**Pilot commitment (Azure commercial)**: Azure commercial (US regions — East US / West US). Azure Database for PostgreSQL Flexible Server. AES-256 encryption at rest by default. 99.99% availability SLA with zone-redundant standby. FedRAMP-Moderate authorized for commercial services. ISO 27001 physical datacenter security.

**Full contract path (Azure Government)**: Azure Government regions (USGov Virginia / USGov Iowa). FedRAMP-Moderate inheritance — full government data residency requirements met. US Government cloud governance.

**Data residency**: For all postures, BASELINE does not replicate data to non-US regions and does not share data with analytics third parties. Audit log data and canonical operational data remain within the hosting region.

**Hosting decision**: S3-1 (Founder task) is the formal hosting platform selection. Hosting-dependent sections in S2-1, S2-2, S2-3, and S2-4 will be updated once S3-1 is complete.

**Source documents**: `docs/security/wa-ocio-141-10-alignment.md` (S2-2) §§4, 5, 13; `docs/security/business-continuity.md` (S2-4) §8; `docs/security/data-classification.md` (S2-5) §5

---

## 12. Vulnerability Management

**Dependency audit (completed 2026-05-13, S1-10)**:
- Pre-remediation state: 1 CRITICAL + 13 HIGH in backend; 13 HIGH in frontend
- Post-remediation state: **0 HIGH / 0 CRITICAL in both workspaces** as of 2026-05-14

**CI gate**: `.github/workflows/ci.yml` runs `pnpm audit --audit-level=high` in both workspaces on every push. Any HIGH or CRITICAL advisory fails the build, preventing regression.

**Accepted residuals** (documented with rationale, not classified as findings requiring remediation):
- `diff` via `ts-node>diff` — LOW severity, dev-only dependency, DoS path unreachable in BASELINE production usage
- `vite` via `vitest>vite` — MODERATE severity, dev-only, not in production build

**Update policy**: HIGH and CRITICAL advisories are remediated before the next sprint closes. MODERATE and LOW dev-only findings are tracked and addressed in a planned upgrade cycle.

**File upload hardening (S1-12)**: Magic byte detection (JPEG/PNG/WebP/HEIC signature matching), MIME type whitelist, 25 MB size cap, server-generated UUID-based S3 storage keys (client filenames never used in object paths). Audit trail on rejection (`upload.rejected` action, reason logged, filename never logged).

**Input validation**: Parameterized queries throughout (`node-postgres` `$1/$2` placeholder style — no string-concatenated SQL). ISO date format and range validation on audit query endpoint. JWT claim validation post-`jwt.verify` for `aud`, `iss`, `oid`.

**Source documents**: `docs/security/nist-800-53-control-mapping.md` (SI-2, SI-3, SI-10); `docs/security/dependency-audit-2026-05-13.md`; `docs/changelog/2026-05-13-s1-10-dependency-audit.md`; `docs/changelog/2026-05-13-s1-12-upload-hardening.md`

---

## 13. NIST SP 800-53 and WA OCIO 141.10 Alignment Summary

| Framework | Coverage | Full alignment | Partial / Planned | Source document |
|-----------|---------|---------------|------------------|----------------|
| NIST SP 800-53 Rev 5 | AC, AU, IA, SC, SI, CP, IR, SA, PL — 41 controls | 28 Implemented | 7 Partial, 4 Planned, 1 N/A | `docs/security/nist-800-53-control-mapping.md` (S2-1) |
| WA OCIO Policy 141.10 | All 14 domains | 8 Aligned | 6 Partial Alignment | `docs/security/wa-ocio-141-10-alignment.md` (S2-2) |

Key open items across both frameworks (all have documented remediation paths):
- **SC-28 / 141.10 Domain 4**: Disk encryption not asserted at demo → Implemented at Azure commercial (S3-1)
- **CP-9 / 141.10 Domain 5**: No formal backup schedule → Azure automated PITR at pilot (S3-1/S3-2)
- **IR-1 / 141.10 Domain 12**: Incident Response Plan complete (S2-3)
- **AC-17 / 141.10 Domain 13**: Application-layer HTTPS redirect not enforced → Azure App Service at pilot (S3-1)
- **AU-2**: Two event types not yet wired (`user_role_change`, `audit_log_read`) → Sprint 3 / pre-pilot

---

## 14. Vendor and System Owner Information

| Field | Value |
|-------|-------|
| System name | BASELINE — Field Operations Intelligence System |
| Vendor / operator | Invaria (founder's business entity) |
| Product ownership disclosure | Disclosed to KCM organizational leadership — see `PROJECT_CONTEXT.md` for the transparency policy |
| Hosting provider | [To be confirmed at S3-1] |
| Support and incident contact | [Founder — populate at pilot onboarding; do not commit personal contact details to this document] |
| KCM IT Security Contact | [To be populated at pilot onboarding] |
| KCM Legal Contact | [To be populated at pilot onboarding] |

---

# Part 2 — Integration Options Matrix

---

## 15. Integration Options Matrix

### 15.1 EAMS / Hexagon Bridge

| Field | Detail |
|-------|--------|
| **Integration** | EAMS / Hexagon Enterprise Asset Management System |
| **Current state** | Active — `eam_bridge_route_log` table populated by `backend/src/scripts/populateEamBridge.ts` |
| **Data flow direction** | BASELINE → EAMS (one-directional; BASELINE receives no data from EAMS currently) |
| **Data exchanged** | `eam_bridge_route_log` rows: `org_id`, `route_run_id`, `completed_at`, `stop_count`, `exception_count`, `canonical_summary` (JSONB — per-stop status, route_pool_id, run_date) |
| **Worker identity in payload** | **None.** `eam_bridge_route_log` has no `actor_oid`, `captured_by_oid`, `user_id`, or `assigned_user_oid` column. Enforced by schema; verified by a dedicated CI test on every build. |
| **Security mechanism** | Table is write-only from BASELINE; read-only from EAMS. Schema change to this table requires coordination with KCM IT / Hexagon team before deployment. |
| **Included in SFTP export** | Yes — included in the nightly SFTP bundle (S1-6) |
| **KCM IT action required** | Schema coordination before any future column changes to `eam_bridge_route_log` |
| **Roadmap status** | Current. EAMS read integration (BASELINE consuming EAMS data) is not yet implemented. |

**Source documents**: `docs/changelog/2026-05-13-s1-7-eam-bridge-route-log.md`

---

### 15.2 SFTP Nightly Export

| Field | Detail |
|-------|--------|
| **Integration** | KCM-controlled SFTP destination — nightly canonical data snapshot |
| **Current state** | Built (S1-6); SFTP upload enabled by `SFTP_ENABLED=true` env var (default false; upload not yet active in demo). Local file generation and audit write are active in all environments. |
| **Data flow direction** | BASELINE → KCM SFTP (one-directional) |
| **Data exchanged** | All canonical tables: `core.organizations`, `core.locations`, `core.assignments`, `core.visits` (including ciphertext columns), `core.observations`, `core.evidence` (metadata only), `stop_effort_history`, `stop_condition_history`, `eam_bridge_route_log`. Two formats per org: full JSON bundle (`.json.gz`) and per-table CSV archive (`.tar.gz`). |
| **Explicitly excluded** | `audit_log` — audit data leaves only via S1-3/S1-4. Photos — not bulk-exported. |
| **Worker identity in payload** | `core.visits` includes `captured_by_oid_ciphertext` (encrypted ciphertext, not plaintext OID). All other tables in the payload contain no worker identity. |
| **Security mechanism** | Key-based auth (`SFTP_PRIVATE_KEY_PATH` required; no password auth). Strict host-key checking (`SFTP_KNOWN_HOSTS_PATH` required; TOFU disabled; unknown host = connection refused). SHA-256 sidecar files for both output formats. Local staging files deleted after successful upload. `export.data_export` audit entry written per org on every run. |
| **KCM IT action required** | Provision SFTP server; generate and provide host public key and client key pair; confirm destination path. Enable `SFTP_ENABLED=true` in production environment. |
| **Roadmap status** | Current (infrastructure complete); SFTP upload activation pending S3-1 hosting decision and KCM SFTP provisioning. |

**Source documents**: `docs/changelog/2026-05-13-s1-6-sftp-export-writer.md`; `docs/security/data-classification.md` (S2-5) §4

---

### 15.3 Azure Entra SSO

| Field | Detail |
|-------|--------|
| **Integration** | KCM Azure Entra tenant — single sign-on and identity |
| **Current state** | Active — all user authentication is brokered through Azure Entra |
| **Data flow direction** | Azure Entra → BASELINE (inbound JWT tokens only) — one-directional |
| **Data exchanged** | MSAL-issued JWTs containing `aud`, `iss`, `exp`, `oid`, `tid` claims. BASELINE validates and extracts claims; no operational data flows from BASELINE to Azure Entra. |
| **Security mechanism** | JWKS-based signature validation (1-hour cache). Post-verify claim assertion: `aud` (client ID), `iss` (v2.0 endpoint only; v1.0 rejected), `oid` (non-empty string), `exp` (60-second clock tolerance). Failed validation triggers `auth.login_failed` audit entry and HTTP 401. |
| **No data sent to Azure Entra** | BASELINE does not transmit visit records, audit data, or operational data to Azure Entra. |
| **Role assignment** | Azure Entra group membership determines BASELINE role (Admin / Lead / UL). Role assignment changes require an Admin provisioning action in BASELINE. |
| **KCM IT action required** | Maintain Azure Entra tenant and application registration. Provision user accounts and group memberships per the ADMIN_ACCESS_POLICY.md Admin roster at pilot launch. |
| **Roadmap status** | Current. No changes planned. |

**Source documents**: `docs/changelog/2026-05-13-s1-11-token-claim-validation.md`; `backend/src/authz.ts`

---

### 15.4 ArcGIS (Roadmap)

| Field | Detail |
|-------|--------|
| **Integration** | KCM ArcGIS Online or ArcGIS Enterprise — geospatial visualization |
| **Current state** | **Not integrated.** No ArcGIS integration exists today. This is a roadmap item. |
| **Recommended near-term path** | **Option B — SFTP extension**: extend the nightly SFTP export (S1-6) to include a GeoJSON `FeatureCollection` file alongside the existing JSON/CSV bundles. KCM GIS team ingests via existing ETL pipeline. Reuses existing SFTP infrastructure with no new attack surface. |
| **Data that BASELINE would contribute** | Stop location (`stops.lat`, `stops.lon`), current condition score (`stop_condition_history`), last service date (`stop_effort_history`), hazard flags (`is_hotspot`, `compactor`, `has_trash`), route completion status (`route_runs`), exception count (`eam_bridge_route_log.exception_count`) |
| **Worker identity in payload** | **None.** All ArcGIS-bound data is stop-keyed and date-keyed. No OID, no worker name, no `assigned_user_oid` in any ArcGIS integration option. Schema-enforced. |
| **Security mechanism** | Option B inherits S1-6 SFTP security posture (key-based auth, host-key checking, SHA-256). No new authentication surface. |
| **KCM IT action required** | Identify KCM GIS team point of contact; select integration option (A, B, or C); for Option B, confirm SFTP destination can receive GeoJSON alongside existing files. |
| **Roadmap status** | Not started. Prerequisite: KCM GIS team engagement. Option B can be implemented in one sprint once the KCM GIS point of contact is identified. |

**Source document**: `docs/security/arcgis-integration-roadmap.md` (S2-8)

---

# Part 3 — TPRA Package Checklist

---

## 16. Package Checklist

Use this checklist to confirm the TPRA package is complete before submission to the TPRA evaluator.

### 16.1 Policy Documents

- [x] **S2-1** — NIST SP 800-53 Rev 5 Control Mapping — `docs/security/nist-800-53-control-mapping.md`
- [x] **S2-2** — WA OCIO 141.10 Alignment Statement — `docs/security/wa-ocio-141-10-alignment.md`
- [x] **S2-3** — Incident Response Plan — `docs/security/incident-response-plan.md`
- [x] **S2-4** — Business Continuity Summary — `docs/security/business-continuity.md`
- [x] **S2-5** — Data Classification Document — `docs/security/data-classification.md`
- [x] **S2-6** — Log Retention Policy — `docs/security/log-retention-policy.md`
- [x] **S2-7** — Data Use Limitation Policy — `docs/security/data-use-limitation-policy.md`
- [x] **S2-8** — ArcGIS Integration Roadmap — `docs/security/arcgis-integration-roadmap.md`
- [x] **S2-9** — WCAG 2.1 AA Conformance Statement — `docs/security/wcag-conformance-statement.md`
- [x] **S2-10** — TPRA Questionnaire + Integration Matrix — this document

### 16.2 Founder Sign-Off (S3-5)

- [ ] All policy documents reviewed by founder
- [ ] WCAG conformance statement signed off (requires S3-4 VoiceOver run first)
- [ ] This questionnaire reviewed and approved before submission

### 16.3 KCM IT Contact Population

- [ ] KCM IT Security Contact populated in `docs/security/incident-response-plan.md` §9 (Contacts)
- [ ] KCM Legal Contact populated in `docs/security/incident-response-plan.md` §9
- [ ] Founder contact information populated in a separate internal contacts reference (do not commit personal details to this document)
- [ ] Vendor information fields in §14 of this document populated with final values

### 16.4 Hosting-Dependent Sections (Pending S3-1)

- [ ] Hosting platform confirmed (S3-1 — Founder task)
- [ ] S2-1 (NIST mapping): SC-28, CP-9, SC-12 sections updated to reflect confirmed platform
- [ ] S2-2 (WA OCIO 141.10): Domains 4, 5, 13 updated to reflect confirmed platform
- [ ] S2-3 (Incident Response): §4 Detection Sources updated with Azure Monitor / Sentinel alert runbook
- [ ] S2-4 (Business Continuity): Sections 2, 3, 4, 5, 8 updated with confirmed platform SLA and backup configuration
- [ ] §14 Vendor Information in this document: Hosting provider field populated

### 16.5 Pre-Pilot Operational Items (Not TPRA Blockers, but Required Before Pilot Launch)

- [ ] S3-4 (VoiceOver / TalkBack run) complete — required before S2-9 is finalized
- [ ] Azure Key Vault provisioned and `AzureKeyVaultAdapter` connected (S3-1)
- [ ] SFTP export enabled (`SFTP_ENABLED=true`) after KCM SFTP destination is provisioned
- [ ] Photo storage backup configured (S3-2)
- [ ] Offboarding runbook written (pre-pilot)
- [ ] Formal risk register document produced (pre-pilot)
- [ ] Audit log review procedure documented in operational runbook (pre-pilot)
- [ ] `admin.user_role_change` and `audit_log_read` event types wired (Sprint 3, ISSUE-010)

---

## 17. Document History

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-05-14 | Initial TPRA package — S2-10. All S2-1 through S2-9 documents complete. Demo hosting posture. |

---

## 18. References

| Document | Path |
|----------|------|
| S2-1 NIST Control Mapping | `docs/security/nist-800-53-control-mapping.md` |
| S2-2 WA OCIO 141.10 Alignment | `docs/security/wa-ocio-141-10-alignment.md` |
| S2-3 Incident Response Plan | `docs/security/incident-response-plan.md` |
| S2-4 Business Continuity Summary | `docs/security/business-continuity.md` |
| S2-5 Data Classification | `docs/security/data-classification.md` |
| S2-6 Log Retention Policy | `docs/security/log-retention-policy.md` |
| S2-7 Data Use Limitation Policy | `docs/security/data-use-limitation-policy.md` |
| S2-8 ArcGIS Integration Roadmap | `docs/security/arcgis-integration-roadmap.md` |
| S2-9 WCAG 2.1 AA Conformance | `docs/security/wcag-conformance-statement.md` |
| Admin Access Policy | `planning/security/ADMIN_ACCESS_POLICY.md` |
| Dependency Audit Report | `docs/security/dependency-audit-2026-05-13.md` |
| Axe Accessibility Audit | `docs/security/axe-audit-2026-05-14.md` |
| Project Context | `PROJECT_CONTEXT.md` |
