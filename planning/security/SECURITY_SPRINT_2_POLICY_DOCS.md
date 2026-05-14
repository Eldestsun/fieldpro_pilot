# S2 — Policy Documents

> **Goal**: Produce the nine security and compliance policy artifacts required for KCM IT security review and TPRA submission, plus the S2-10 synthesis package.
>
> **Status**: 🔴 Not started
> **Depends on**: S1 complete (all 13 tasks done 2026-05-14) + Hosting platform decision (S3-1, Founder task)
> **Blocks**: S2-10 (all S2 docs), S3-5 (founder sign-off), S3-7 (TPRA submission)

---

## Pre-Sprint Gate

> **S2-1 through S2-4 cannot be dispatched until the founder has selected a hosting platform.**
> The hosting decision determines which FedRAMP controls are inherited, what SLA claims are supportable,
> and what incident response and business continuity procedures are operationally accurate.
>
> **Hosting scale path:**
> - **Demo** (current): Render or Fly.io — no HA SLA, no managed DB, no FedRAMP inheritance
> - **Pilot** (target): Azure commercial — 99.9% SLA, Azure Database for PostgreSQL Flexible Server,
>   AES-256 encryption at rest, Azure Entra ID integration, Azure Monitor logging
> - **Full contract**: Azure Government — FedRAMP-Moderate inheritance, GovCloud data residency
>
> S2-5, S2-6, S2-7, S2-8 are hosting-independent and can be dispatched immediately.
> S2-9 depends on S1-9 completion (done 2026-05-14) and S2-9 prerequisites.
> See `planning/SECURITY_SPRINT_INDEX.md` § S2-9 Prerequisites for the three open items.

---

## S2-1 — NIST SP 800-53 Control Mapping Document

**Type**: Document
**Depends on**: Hosting decision (S3-1)
**Output file**: `docs/security/nist-800-53-control-mapping.md`
**Status**: 🔴 Not started

### Purpose

This document maps BASELINE's implemented security controls to the NIST SP 800-53 Rev 5 control catalog. KCM IT security staff and the TPRA evaluator will use it to determine which controls are fully satisfied, partially satisfied, or not applicable, and to identify residual gaps that require compensating controls or accepted risk. This is the primary technical evidence artifact for the TPRA security assessment.

### Content requirements

- **Cover table**: for each relevant control family, state Implemented / Partial / Not Applicable / Planned, with a one-line evidence pointer (code, config, or procedure)
- **Control families to cover** (minimum — include others if implemented):
  - **AC — Access Control**: role-based access (Admin/Lead/UL), `requireAnyRole` middleware, no privilege escalation path, Admin roster limited to three defined groups (see `planning/security/ADMIN_ACCESS_POLICY.md`)
  - **AU — Audit and Accountability**: `audit_log` table (append-only, Admin-gated), `actor_oid` logged on login, assignment, export, and config changes; audit log read is itself auditable; log retention >= 1 year per S2-6
  - **IA — Identification and Authentication**: Azure Entra MSAL authentication, JWT claim validation (`aud`, `iss`, `exp`, `oid` — S1-11), no local username/password
  - **SC — System and Communications Protection**: HTTPS enforced, file upload validation (S1-12), path traversal hardening, no plaintext secrets in source
  - **SI — System and Information Integrity**: dependency vulnerability scan (S1-10), no known high/critical CVEs as of 2026-05-14, file type validation on uploads
  - **IR — Incident Response**: reference S2-3 (Incident Response Plan); state that plan exists and is linked
  - **CP — Contingency Planning**: reference S2-4 (Business Continuity Summary); state RPO/RTO targets and backup schedule
  - **SA — System and Services Acquisition**: OpenAPI 3.0 spec published (S1-5), code reviewed by agent with security constraints
  - **PL — Planning**: this document, S2-7 (data use limitation), S2-6 (retention policy)
- **For each implemented control**: cite the specific code file, config, or process that evidences it (e.g., `backend/src/middleware/authz.ts` for AC-3)
- **For each partial or not-yet-met control**: state what is missing and reference the remediation plan (hosting decision, S3 tasks, or future sprint)
- **Labor safety note**: AC-2 (Account Management) must explicitly state that operational leadership (chiefs, superintendents, supervisors) hold Lead or UL roles with no access to audit log data or worker-keyed intelligence tables — this is enforced at the route layer, not just by policy
- **Hosting dependency inline notes**: controls that depend on the hosting platform (SC-28 encryption at rest, CP-9 backups, SI-12 log export to SIEM) must be marked "Planned — pending hosting decision (S3-1)" at demo posture and annotated with what changes at Azure commercial vs Azure Government

### Hosting context to apply

At **demo posture** (Render/Fly.io): SC-28 (encryption at rest) is platform-dependent and cannot be asserted — mark as Planned. CP-9 (backup procedures) requires documentation of the managed DB backup schedule — mark as Planned pending S3-2. No FedRAMP controls are inherited.

At **Azure commercial pilot**: SC-28 satisfied via Azure Database for PostgreSQL (AES-256 at rest by default), Azure Blob Storage (AES-256). CP-9 satisfied via Azure automated backups with configurable retention. Some NIST controls inherit from Azure's existing FedRAMP-Moderate authorization for commercial services.

At **Azure Government**: Full FedRAMP-Moderate inheritance applies. Controls marked Planned at demo will transition to Inherited (Azure) or Implemented (BASELINE-specific). Note upgrade path in each affected row.

### Done criteria

- [ ] All AC, AU, IA, SC, SI, IR, CP, SA, PL control families addressed in the table
- [ ] Each entry has: status, one-line evidence, and a file/config pointer where applicable
- [ ] Partial and not-met controls have explicit gap statements and remediation references
- [ ] Labor safety constraint documented under AC-2 and AC-3
- [ ] Hosting dependency noted inline for at least SC-28, CP-9, SI-12
- [ ] Document reviewed by founder before being marked complete
- [ ] Changelog entry written

---

## S2-2 — WA OCIO 141.10 Alignment Statement

**Type**: Document
**Depends on**: Hosting decision (S3-1)
**Output file**: `docs/security/wa-ocio-141-10-alignment.md`
**Status**: 🔴 Not started

### Purpose

Washington State OCIO Policy 141.10 establishes the minimum security requirements for all state agency information systems and technology vendors operating within Washington. This document demonstrates that BASELINE meets or has a documented plan to meet each 141.10 domain. The TPRA evaluator and KCM IT will check this document against the policy text. A gap without a mitigation statement is a procurement blocker.

### Content requirements

- **Policy version**: reference WA OCIO Policy 141.10 (current version — verify at ocio.wa.gov before writing; as of 2026 the operative version is 141.10 effective 2020-07-01, last reviewed 2023)
- **Section-by-section alignment table** covering the 141.10 security domains:
  - **1. Risk Management**: BASELINE's threat model (web app + DB + Azure Entra); risk acceptance by founder as system owner; annual review commitment
  - **2. Planning**: security policies (this sprint), architecture documentation (`planning/architecture/target_architecture.md`)
  - **3. Personnel Security**: Admin access limited to three defined groups (ADMIN_ACCESS_POLICY.md); role provisioning process; offboarding procedure (Admin role removal)
  - **4. Physical and Environmental**: hosted on cloud platform — physical security inherited from provider; no on-premises hardware
  - **5. Contingency Planning**: reference S2-4; state current RPO/RTO targets and backup approach
  - **6. Configuration Management**: infrastructure-as-code goal (Docker, environment variables); no hardcoded secrets; dependency audit (S1-10)
  - **7. Maintenance**: dependency vulnerability scan cadence (on each sprint); update policy
  - **8. System and Information Integrity**: file upload validation (S1-12), dependency scan (S1-10), no unpatched critical CVEs
  - **9. Identification and Authentication**: Azure Entra MSAL, JWT claim validation (S1-11), no shared accounts
  - **10. Access Control**: RBAC (Admin/Lead/UL), `requireAnyRole` middleware, principle of least privilege enforced at route layer, no Admin access for operational staff
  - **11. Audit and Accountability**: audit_log table (S1-1/S1-2), 1-year retention (S2-6), log review procedure
  - **12. Incident Response**: reference S2-3; 24-hour breach notification procedure
  - **13. System and Communications Protection**: HTTPS, no plaintext data in transit, CORS policy
  - **14. System and Services Acquisition**: OpenAPI spec (S1-5), code security review process
- **For each domain**: Aligned / Partial Alignment / Not Applicable, with a one-paragraph narrative
- **Gaps section**: list any domains where full alignment is not yet achieved; state the remediation plan and target sprint
- **Hosting dependency**: note that domains 4 (Physical), 5 (Contingency), and 13 (Communications) will strengthen when Azure commercial hosting is confirmed

### Hosting context to apply

At **demo posture**: Physical security (domain 4) is inherited from Render/Fly.io; state provider name and note that SOC 2 Type II reports are available on request. Contingency planning (domain 5) is partial — backup schedule and RTO targets depend on S3-2.

At **Azure commercial**: Domain 4 inherits from Microsoft's physical datacenter controls (ISO 27001 certified). Domain 13 strengthens with Azure DDoS Protection and Azure Front Door TLS termination.

At **Azure Government**: Full 141.10 alignment for cloud-hosted systems with FedRAMP-Moderate inheritance.

### Done criteria

- [ ] All 14 policy domains addressed
- [ ] Each domain has alignment status and supporting narrative
- [ ] Gap statements reference specific remediation (sprint item or hosting decision)
- [ ] Hosting upgrade path noted for domains 4, 5, and 13
- [ ] Document reviewed by founder
- [ ] Changelog entry written

---

## S2-3 — Incident Response Plan (24-hr Breach Notification)

**Type**: Document
**Depends on**: Hosting decision (S3-1)
**Output file**: `docs/security/incident-response-plan.md`
**Status**: 🔴 Not started

### Purpose

This document defines BASELINE's procedure for detecting, containing, notifying, and recovering from a security incident. The 24-hour breach notification requirement comes from Washington State's data breach notification law (RCW 19.255.010) and the TPRA contractual obligation to notify KCM IT of incidents affecting KCM data. KCM IT and the TPRA evaluator will verify that a credible procedure exists and that the notification chain reaches the correct organizational contacts within the required window.

### Content requirements

- **Scope**: what constitutes a reportable incident for BASELINE (unauthorized access to PII, audit_log exfiltration, credential compromise, data corruption affecting route records)
- **Severity classification**: P1 (active breach / confirmed unauthorized access), P2 (suspected breach / anomalous access patterns), P3 (vulnerability discovered, not yet exploited)
- **Detection sources**: Azure Entra sign-in logs (unusual login patterns), audit_log anomalies (unexpected admin actions), hosting platform alerts (if configured), dependency vulnerability scan findings (S1-10)
- **Response procedure by severity**:
  - P1: immediate steps (revoke credentials, isolate DB, take snapshot), internal notification (founder), KCM IT notification within 24 hours, preserve audit trail, begin post-mortem
  - P2: investigation steps, escalation criteria for P1 promotion, notification timeline (48 hours if P1 criteria not met within 4 hours)
  - P3: standard remediation sprint, no mandatory external notification unless exploited
- **Notification chain**: name the KCM IT security contact role (do not include personal names — leave as "[KCM IT Security Contact — to be populated at pilot onboarding]"); founder as first responder; WA AGO notification for breaches affecting >500 residents (RCW 19.255.010)
- **Evidence preservation**: audit_log export before any remediation; screenshot of anomalous entries; Azure Entra sign-in log export
- **Recovery steps**: credential rotation, DB access review, dependency re-scan, re-audit after incident closure
- **Post-mortem template**: 5-section structure — Timeline, Root Cause, Impact, Remediation, Prevention
- **Contact list template** (fields only — not pre-filled): KCM IT Security, KCM Legal, WA AGO notification channel, founder contact
- **Review cadence**: plan reviewed annually or after any P1 incident

### Hosting context to apply

At **demo posture** (Render/Fly.io): detection sources are limited to audit_log and Azure Entra logs; no cloud-native SIEM. State this limitation and document manual log export procedure as compensating control.

At **Azure commercial**: Add Azure Monitor alerts and Azure Security Center as detection sources. Automated alerting can be configured for anomalous sign-in patterns. Update notification procedure to reference Azure alert runbook.

At **Azure Government**: Azure Sentinel SIEM available. FedRAMP-Moderate IR control inheritance applies. Notification chain may need to include additional WA State reporting channels.

### Done criteria

- [ ] All severity levels defined with clear promotion criteria
- [ ] Detection sources enumerated for current hosting posture
- [ ] 24-hour P1 notification procedure is specific (steps, not principles)
- [ ] KCM IT notification chain documented (roles, not personal names)
- [ ] WA RCW 19.255.010 notification requirement referenced
- [ ] Evidence preservation steps written
- [ ] Post-mortem template included
- [ ] Hosting upgrade path noted for detection sources
- [ ] Document reviewed by founder
- [ ] Changelog entry written

---

## S2-4 — Business Continuity Summary — Backup, HA, RTO/RPO, SLA

**Type**: Document
**Depends on**: Hosting decision (S3-1), S3-2 (managed DB backup config)
**Output file**: `docs/security/business-continuity.md`
**Status**: 🔴 Not started

### Purpose

This document summarizes BASELINE's approach to availability, data durability, and recovery from failure. KCM IT will use it to determine whether BASELINE meets the availability expectations for a production field-operations tool — route specialists depend on it during active shifts. The TPRA evaluator uses it to confirm that the system has a credible backup and recovery posture, and that the claimed SLA is supportable by the hosting platform.

### Content requirements

- **Availability target**: state the claimed uptime SLA (must be derived from the actual hosting platform's SLA — do not claim 99.9% if the platform does not guarantee it)
- **Current posture at demo (Render/Fly.io)**: no HA SLA, single-instance DB, backups dependent on provider defaults — document accurately; do not overstate
- **Backup procedure**:
  - Frequency and retention window (e.g., daily automated backups, 7-day retention minimum, 30-day for audit log data)
  - What is backed up: PostgreSQL DB (all tables including audit_log), environment configuration (secrets excluded — stored in secrets manager or equivalent), uploaded photo store (S3-compatible)
  - Restore procedure: step-by-step instructions a technical operator can follow to restore from backup to a clean instance
  - Backup verification: how and how often backups are tested
- **RTO (Recovery Time Objective)**: target time to restore full service from a confirmed outage. State separately for: DB failure, app server failure, total environment loss
- **RPO (Recovery Point Objective)**: maximum acceptable data loss. Must align with backup frequency (e.g., daily backup → max 24-hour RPO)
- **High availability**:
  - At demo: none — single instance; note as a gap and state the hosting upgrade path
  - At Azure commercial: Azure Database for PostgreSQL Flexible Server with zone-redundant standby; app server with auto-restart and health checks
- **Offline mode continuity**: note that the BASELINE mobile UL surface has an offline queue (`offlineQueue.ts`) — field workers can continue recording stops during a backend outage; data syncs when connectivity restores. This reduces the operational impact of a backend failure during a shift.
- **Maintenance window policy**: how and when planned maintenance is communicated to users; target low-usage window (early morning, pre-shift)
- **SLA gap acknowledgment**: if the current posture does not meet a specific KCM IT SLA requirement, state it explicitly and reference the hosting upgrade path (S3-1 → S3-2 → S3-3)

### Hosting context to apply

At **demo posture**: write honestly — no formal SLA, no HA, backup posture depends on provider defaults. Compensating control: offline mode reduces field impact of outages.

At **Azure commercial**: Azure Database for PostgreSQL Flexible Server provides 99.99% availability SLA with zone-redundant standby. Azure App Service provides 99.95% SLA. Composite SLA for the application tier: ~99.94%. Automated backups with 1-35 day configurable retention. RTO < 4 hours for DB restore from backup; < 1 hour for zone failover.

At **Azure Government**: Same infrastructure capabilities as Azure commercial; FedRAMP-Moderate CP controls inherited.

### Done criteria

- [ ] Current (demo) posture documented accurately — no overstatement
- [ ] RTO and RPO targets defined for all three failure scenarios
- [ ] Backup procedure is specific enough for a technical operator to execute
- [ ] Restore procedure is step-by-step
- [ ] Offline mode continuity noted as a mitigating factor
- [ ] Hosting upgrade path (Azure commercial) documented with improved SLA figures
- [ ] Maintenance window policy stated
- [ ] Document reviewed by founder
- [ ] Changelog entry written

---

## S2-5 — Data Classification Document for Exports

**Type**: Document
**Depends on**: None (hosting-independent)
**Output file**: `docs/security/data-classification.md`
**Status**: 🔴 Not started

### Purpose

This document classifies every category of data that BASELINE collects, stores, exports, or transmits, and specifies the handling requirements for each class. KCM IT uses it to determine whether BASELINE's data handling practices are compatible with KCM's data governance policies. It is also the foundation for the data use limitation policy (S2-7) and the NIST control mapping (S2-1, AU-2 and AU-9). See `planning/security/ADMIN_ACCESS_POLICY.md` for the authoritative classification of audit_log data — reference that document rather than restating its content.

### Content requirements

- **Classification framework**: define the classification levels used (e.g., Public, Internal, Confidential, Restricted) with a one-line definition of each
- **Data inventory table**: for every data category in BASELINE, specify:
  - Data category name
  - Example fields
  - Classification level
  - Where stored (table, S3 bucket, log, etc.)
  - Who can access (role)
  - Retention period (reference S2-6)
  - Export controls (who can export, what format, what audit event fires)
- **Data categories to cover** (minimum):
  - **Stop / asset records** (`stops` table): stop location, asset metadata — Public (KCM-owned asset data, no PII). Exportable by Admin; no PII, no handling restrictions beyond normal operational data.
  - **Route run records** (`route_runs`, `route_run_stops`): assignment dates, status, sequence, completion flags — Internal. Exportable by Admin and Lead; contains route structure but no worker-identifying data in the intelligence layer.
  - **Checklist / condition observations** (`stop_effort_history`, `stop_condition_history`, `core.observations`): stop condition scores, service evidence — Internal. No worker identity column. Exportable by Admin; read by Lead dashboard.
  - **Photos** (`stop_photos`, `core.evidence`): field photos attached to stops — Confidential (may contain incidental images of members of the public). Stored in S3-compatible bucket; not included in CSV exports; accessible via signed URL to authorized roles only.
  - **Audit log** (`audit_log`): admin action records including `actor_oid` — **Restricted**. Access limited to Admin role (see `planning/security/ADMIN_ACCESS_POLICY.md`). Exportable by Admin only via S1-3 endpoint; export event itself is audited. Retained >= 1 year per S2-6.
  - **`captured_by_oid`** (on `core.visits`): Azure Entra OID of the field worker who recorded the visit — **Restricted**. KMS-encrypted at rest (S1-13). Accessible only through direct DB access (IT-provisioned, logged) or Azure Entra (requires elevated access trail). Never surfaced in any operational UI.
  - **Authentication tokens**: MSAL JWT tokens — ephemeral, not persisted by BASELINE. Session-scoped, validated at each request.
- **PII assessment**: explicitly state that BASELINE does not collect worker names, addresses, or contact information. Azure Entra OIDs are pseudonymous identifiers — not directly PII but re-identifiable via the Azure Entra directory. Document this distinction.
- **Export formats and controls**:
  - CSV export via `/api/admin/audit-log` — Admin only, audit event fires on each export (S1-3)
  - SFTP nightly export (S1-6) — Admin-configured destination, canonical data only, no audit_log in the SFTP export
  - Export-and-delete endpoint (S1-4) — confirmation token required, irrevocable, audit event fires
- **Data residency**: state where data is stored (current: US region of hosting provider; pilot: Azure commercial, US regions; full contract: Azure Government, US Government regions)
- **Labor safety note**: the intelligence layer (`stop_effort_history`, `stop_condition_history`, `core.observations`) contains no `user_id` or worker-identifying column by schema design. A query against these tables cannot produce a per-worker performance profile. State this as a verifiable architectural fact with the specific table and column evidence.

### Done criteria

- [ ] All data categories inventoried (minimum 7 categories above, plus any additional tables discovered in schema)
- [ ] Classification level assigned to each category
- [ ] Access control for each category mapped to BASELINE role (Admin/Lead/UL)
- [ ] Export controls stated for each exportable category
- [ ] PII assessment written — OID pseudonymity distinction explicit
- [ ] Labor safety structural guarantee stated as verifiable schema fact
- [ ] `planning/security/ADMIN_ACCESS_POLICY.md` referenced for audit_log classification — do not restate its content
- [ ] Data residency stated for all three hosting postures
- [ ] Document reviewed by founder
- [ ] Changelog entry written

---

## S2-6 — Log Retention Policy (≥ 1 Year)

**Type**: Document
**Depends on**: None (hosting-independent)
**Output file**: `docs/security/log-retention-policy.md`
**Status**: 🔴 Not started

### Purpose

This document defines BASELINE's retention periods for all log and audit data, the storage mechanism for retained logs, the access controls during retention, and the deletion procedure at end of retention. KCM IT and the TPRA evaluator check this document to confirm that audit trail data will be available for the duration of any compliance investigation and that log data is not retained indefinitely beyond its stated purpose. Washington State public records law (RCW 40.14) governs retention schedules for public agency records — this policy must be consistent with KCM's records retention schedule for the applicable record category.

### Content requirements

- **Log categories and retention periods**:
  - `audit_log` table: minimum 1 year from date of entry; align with KCM's records retention schedule for security audit records (verify category with KCM IT — likely GS 50-05-020 or equivalent)
  - Application logs (server stdout/stderr): 90 days (operational troubleshooting only; no PII)
  - Azure Entra sign-in logs: per Microsoft's default (30 days on free tier; 90 days with P1/P2 license); note this is platform-controlled
  - SFTP export files: retention at the KCM-controlled SFTP destination is outside BASELINE's control; state that BASELINE does not dictate downstream retention
- **Storage mechanism**:
  - Current demo posture: audit_log retained in the primary PostgreSQL DB; no separate log archive
  - Pilot posture: audit_log retained in PostgreSQL with automated daily backups; consider archival export to S3-compatible cold storage for records older than 90 days
- **Access during retention**: audit_log read access is Admin-only (see S2-5, S2-1); access is itself auditable (audit_log_read action)
- **Deletion at end of retention**: manual Admin action via export-and-delete endpoint (S1-4); confirmation token required; deletion event recorded (note: deletion of an audit_log entry requires special handling — the deletion itself must be auditable, which creates a bootstrapping challenge; document how this is resolved, e.g., write a "purge" event before deletion, or retain purge metadata separately)
- **Legal hold**: if KCM IT issues a legal hold on records, all automated deletion is suspended for affected records; procedure for receiving and implementing a hold
- **Records schedule alignment**: state that KCM records retention officer should verify the applicable retention schedule category before pilot launch; BASELINE defaults to 1 year as a conservative minimum pending that verification
- **Review cadence**: policy reviewed annually

### Done criteria

- [ ] Retention period stated for each log category
- [ ] Storage mechanism described for current and pilot posture
- [ ] Access controls during retention stated
- [ ] Deletion procedure is specific (including confirmation token requirement from S1-4)
- [ ] Audit-log deletion bootstrapping problem addressed
- [ ] Legal hold procedure documented
- [ ] KCM records schedule alignment noted with instruction to verify before pilot launch
- [ ] Document reviewed by founder
- [ ] Changelog entry written

---

## S2-7 — Data Use Limitation Policy (WA Public-Sector Privacy)

**Type**: Document
**Depends on**: None (hosting-independent)
**Output file**: `docs/security/data-use-limitation-policy.md`
**Status**: 🔴 Not started

### Purpose

This document states the purposes for which BASELINE data may and may not be used, and demonstrates that the application's architecture enforces those limitations structurally — not merely by policy declaration. The primary audience is KCM Legal, KCM IT, and the TPRA evaluator. The union or its legal representative may also review this document. The labor safety framing in this document must draw from `planning/security/ADMIN_ACCESS_POLICY.md` — the structural guarantee and use-limitation language in that file is the policy basis for this document. Do not introduce new framing; reproduce and formalize what that document already states.

### Content requirements

- **Stated purposes of data collection**: enumerate every purpose for which BASELINE collects and processes data:
  - Asset condition monitoring (stop cleanliness scores, defect observations)
  - Route completion tracking (which stops were serviced, when)
  - Security audit trail (admin actions, role changes, data exports)
  - EAM data enrichment (condition and effort data exported to Hexagon EAMS via SFTP)
  - ArcGIS integration (future — roadmap only; no current data flow)
- **Prohibited uses** — data must not be used for:
  - Per-worker performance assessment, scoring, or ranking
  - Worker scheduling decisions based on individual stop-level data
  - Disciplinary proceedings based on BASELINE data alone
  - Any comparison surface that identifies or implies individual worker performance
  - Sale, licensing, or sharing of data with any party other than KCM and its authorized agents
- **Structural enforcement of the labor safety guarantee** (this section is the core of the document — write it as a verifiable architectural statement, not a policy promise):
  - The intelligence layer tables (`stop_effort_history`, `stop_condition_history`, `core.observations`) contain no `user_id`, no worker name, no worker OID. State the specific columns that exist and the columns that were deliberately excluded.
  - A SQL query against these tables cannot produce a per-worker performance profile because worker identity is not present in the data model. This is schema-enforced, not access-control-enforced.
  - `captured_by_oid` exists on `core.visits` for security audit purposes only. It is KMS-encrypted (S1-13). It is held at a separate access tier. Reaching it requires direct DB access (IT-provisioned, logged) or Azure Entra elevated access — both produce a more visible and auditable trail than reading the intelligence layer. This transforms misuse from "I noticed a pattern" to "I conducted targeted surveillance with a documented access trail."
  - Operational leadership (chiefs, superintendents, supervisors) hold Lead or UL roles. Neither role has access to `captured_by_oid` or the audit_log. The application offers no surface through which operational leadership can profile an individual worker — regardless of organizational authority.
  - Cite `planning/security/ADMIN_ACCESS_POLICY.md` as the source of the Admin access roster and the use-limitation statement for audit_log data.
- **EAMS coexistence statement**: BASELINE does not add to the surveillance exposure that already exists in EAMS (which records work-order assignments with worker identifiers). BASELINE's intelligence layer is structurally less identifiable than the EAMS work-order model.
- **Data sharing and third parties**: data is shared only with the KCM-controlled SFTP destination (nightly export, S1-6) and the Azure Entra identity provider (authentication only). No analytics third parties. No advertising networks. No data brokers.
- **Access to this policy**: link to `planning/security/ADMIN_ACCESS_POLICY.md` for the authoritative Admin access roster statement; do not restate the roster in this document.
- **Enforcement mechanism**: this policy is enforced by (a) the schema design described above, (b) route-layer access controls in the backend, and (c) this document as a commitment to KCM. State all three.
- **Review cadence**: policy reviewed annually and before any schema change to the intelligence layer

### Done criteria

- [ ] All stated purposes enumerated
- [ ] Prohibited uses list is explicit and auditor-facing
- [ ] Structural labor safety guarantee stated as verifiable schema fact — specific table names and column names cited
- [ ] `captured_by_oid` access model explained (KMS-encrypted, separate tier, access trail is the deterrent)
- [ ] `planning/security/ADMIN_ACCESS_POLICY.md` referenced for Admin roster — not restated
- [ ] EAMS coexistence statement included
- [ ] Third-party data sharing stated (SFTP only)
- [ ] All three enforcement mechanisms named (schema, route-layer, this policy)
- [ ] Document reviewed by founder
- [ ] Changelog entry written

---

## S2-8 — ArcGIS Integration Roadmap Narrative (TPRA)

**Type**: Document
**Depends on**: None (hosting-independent)
**Output file**: `docs/security/arcgis-integration-roadmap.md`
**Status**: 🔴 Not started

### Purpose

King County Metro uses Esri ArcGIS extensively for asset mapping, geospatial analysis, and field operations visualization. The TPRA evaluator and KCM IT will ask how BASELINE integrates with or complements the ArcGIS investment. This document provides an honest roadmap narrative: what integration exists today, what the near-term integration path looks like, and what data BASELINE would provide to an ArcGIS layer. It is a roadmap document, not a commitment — it should be accurate about current state and specific about the integration model without overpromising.

### Content requirements

- **Current state**: ArcGIS is not yet integrated. BASELINE's current data coexistence model is with Hexagon EAMS via SFTP export (S1-6, S1-7). Stop locations in BASELINE are stored as `(lat, lon)` on the `stops` table — geospatially ready but not yet served to an ArcGIS feature layer.
- **Integration model** (roadmap):
  - **Option A — ArcGIS Feature Layer via REST API**: expose a read-only `/api/stops/geojson` or `/api/stops/feature-service` endpoint that returns stop condition data in GeoJSON or Esri Feature Service format; ArcGIS Online or ArcGIS Enterprise consumes it as a live feature layer
  - **Option B — SFTP → ArcGIS Data Pipeline**: extend the existing nightly SFTP export (S1-6) to include a GeoJSON or CSV-with-coordinates file; KCM GIS team ingests it into ArcGIS via their existing ETL pipeline
  - **Option C — Direct Esri SDK Integration**: embed ArcGIS Maps SDK for JavaScript in the BASELINE Control Center dashboard to render stop condition data on an Esri basemap — replaces the current SVG/canvas risk map
- **Recommended near-term path**: Option B (SFTP extension) is the lowest-friction path — no new authentication integration, reuses existing SFTP infrastructure (S1-6), KCM GIS team controls the ingestion. State this recommendation and the rationale.
- **Data BASELINE would contribute to ArcGIS**:
  - Stop location (lat/lon from `stops` table)
  - Current condition score (from `stop_condition_history`)
  - Last service date (from `stop_effort_history`)
  - Active hazard flags (`is_hotspot`, `compactor`, `has_trash`)
  - Route completion status (from `route_runs`)
- **Security considerations for integration**:
  - Option A: requires BASELINE API to be accessible to KCM's ArcGIS instance — network policy and auth scope TBD
  - Option B: inherits S1-6 SFTP security posture; no new attack surface
  - Option C: frontend-only; no backend change; Esri SDK loaded from Esri CDN (supply chain consideration)
- **Labor safety constraint**: no worker identity data is included in any ArcGIS integration. Stop condition data is keyed by `(stop_id, date)`. No OID, no route_run assignment identity, no worker name appears in any data exported to ArcGIS.
- **Dependencies**: ArcGIS integration is not in the current pilot scope; it requires a KCM GIS team point of contact and a decision on integration option. This document is a readiness artifact for that conversation.

### Done criteria

- [ ] Current state (no ArcGIS integration yet) stated accurately
- [ ] Three integration options described with trade-offs
- [ ] Near-term recommended path stated with rationale
- [ ] Data inventory for the integration is specific (field names)
- [ ] Security considerations per option included
- [ ] Labor safety constraint stated (no worker identity in ArcGIS data)
- [ ] Dependencies and next steps identified
- [ ] Document reviewed by founder
- [ ] Changelog entry written

---

## S2-9 — WCAG 2.1 AA Conformance Statement

**Type**: Document
**Depends on**: S1-8 (done 2026-05-14), S1-9 (done 2026-05-14), S2-9 prerequisites (see `planning/SECURITY_SPRINT_INDEX.md` § S2-9 Prerequisites)
**Output file**: `docs/security/wcag-conformance-statement.md`
**Status**: 🔴 Not started

### Purpose

This document is BASELINE's formal WCAG 2.1 AA conformance statement, suitable for inclusion in the TPRA package and for disclosure to KCM IT's accessibility evaluator. King County Metro has union obligations and may have Washington State accessibility compliance requirements (WAC 388-823) depending on how the system is classified. The statement must be accurate — it must reference the actual audit results and disclose known deviations rather than assert blanket conformance.

### Content requirements

Before writing this document, verify the three S2-9 prerequisites are resolved:
1. Modal focus management JS (useEffect-based focus traps on 5 dialog components) — tracked in sprint index
2. Photo remove button touch target decision (product/design call) — tracked in sprint index
3. VoiceOver / TalkBack manual run (S3-4, Founder task)

**Document structure**:
- **Conformance level claimed**: WCAG 2.1 Level AA — with known exceptions listed (do not claim full conformance if exceptions exist)
- **Audit methodology**:
  - Automated: `@axe-core/playwright` v4, run against all 6 authenticated application surfaces on 2026-05-14
  - Manual: Part C manual checks performed 2026-05-14 (focus trap, focus order, touch targets, viewport reflow at 320px, color-only state, VoiceOver spot-check)
  - Reference: `docs/security/axe-audit-2026-05-14.md` for full audit report
- **Surfaces audited** (enumerate all 6):
  - Login / Auth flow (`/`) — unauthenticated
  - UL Stop List (`/work`) — UL role, with fixture data (route_run 712, 3 stops)
  - UL Stop Detail / Wizard (`/work`, stop opened) — UL role
  - Lead Routes Dashboard (`/routes`) — Lead role
  - Admin Panel (`/admin/pools`) — Admin role
  - Control Center (`/admin/control-center`) — Admin role
- **Post-remediation findings** (from S1-8 + S1-9 changelogs):
  - Total violations found: 7 across all surfaces (4 in S1-8 initial scan, 3 new in UL re-audit with fixture data)
  - Total violations resolved: 7 — 0 remaining automated violations as of 2026-05-14
  - Specific S1-8 fixes: Login version badge contrast (#94a3b8 → #64748b, 4.6:1); Control Center 5× text-gray-300 → text-gray-500; DataTable + OpsTable tabIndex={0} on scroll wrappers
  - Specific S1-9 UL fixes: StopList invalid list structure (div wrapper between ul and li removed); StopListItem skipped badge contrast (text-gray-500 → text-gray-600, 5.7:1); RouteHeader sync status text-green-600 → text-green-800, text-amber-600 → text-amber-800
  - Specific S1-9 Part C fixes: role/aria-modal/aria-labelledby on 5 modal dialogs; aria-pressed on trash volume buttons; min-h-[44px] on Back to Route button
- **Known deviations / exceptions** (enumerate honestly):
  - Modal focus management: ARIA roles and labels applied to all 5 dialogs; useEffect-based focus containment (Tab key trap, focus-on-open, return-focus-on-close) not yet implemented — tracked as S2-9 prerequisite 1. If this is not resolved before dispatching this document, classify as a known deviation with remediation plan.
  - Photo remove button: 20×20px touch target on photo strip overlay — below WCAG 2.5.5 minimum (44×44px). Note: WCAG 2.5.5 is Level AAA; WCAG 2.1 AA does not mandate a minimum target size. If WCAG 2.5.5 is not in scope, this is not an AA deviation. State clearly which standard is being claimed and whether AAA is aspirational or mandatory.
  - VoiceOver / TalkBack: manual screen reader testing completed (S3-4); document findings from the actual test run when S3-4 is complete
- **Testing tools and versions**: `@axe-core/playwright` (version from package.json at time of audit), Playwright (version), Node.js (version); macOS VoiceOver (version) for manual screen reader check
- **Statement date**: date when the document is finalized and signed off by founder
- **Next review date**: before each significant release or at minimum annually

### Done criteria

- [ ] All three S2-9 prerequisites resolved before dispatch (verify status in sprint index)
- [ ] All 6 surfaces listed with audit methodology
- [ ] Post-remediation finding counts accurate (reference S1-8 and S1-9 changelogs)
- [ ] Known deviations stated honestly — no false conformance claim
- [ ] VoiceOver findings from actual S3-4 run incorporated
- [ ] Tool versions stated
- [ ] Statement date and next review date included
- [ ] Document reviewed and signed off by founder (S3-5)
- [ ] Changelog entry written

---

## S2-10 — TPRA Questionnaire Answers + Integration Options Matrix

**Type**: Document
**Depends on**: All S2 docs (S2-1 through S2-9)
**Output file**: `docs/security/tpra-package.md`
**Status**: 🔴 Not started

### Purpose

S2-10 is the synthesis document that assembles the full TPRA submission package. The TPRA (Technology and Privacy Risk Assessment) is the WA OCIO / KCM IT formal procurement security review. This document provides the questionnaire answers that the evaluator expects to see, drawing from all prior S2 documents as sources. It also contains the Integration Options Matrix that KCM IT needs to understand how BASELINE connects to existing infrastructure. The agent writing this document should have all S2-1 through S2-9 documents available to draw from — it does not originate new content, it synthesizes.

### Content requirements

**Part 1 — TPRA Questionnaire Answers**

Provide answers to each of the following sections, which reflect the standard WA OCIO TPRA questionnaire categories. For each answer, cite the source document.

- **1. System Overview**
  - What is the system and what does it do? (2–3 paragraph summary; reference PROJECT_CONTEXT.md for the framing)
  - Who are the users and what roles exist? (Admin, Lead, UL — with headcount estimate for pilot)
  - What data does the system collect? (reference S2-5)
  - Is PII collected? If yes, what categories? (reference S2-5 PII assessment)

- **2. Data Classification and Handling**
  - Data classification levels used (reference S2-5)
  - Retention periods for each data category (reference S2-6)
  - Data use limitation — what is the data used for and what is prohibited (reference S2-7)
  - Export and sharing controls (reference S2-5 export controls section)

- **3. Security Controls**
  - Authentication mechanism (Azure Entra MSAL, JWT claim validation — S1-11)
  - Authorization model (RBAC — reference S2-1 AC controls)
  - Audit logging (reference S2-1 AU controls, S1-1/S1-2)
  - Vulnerability management (S1-10 dependency scan, S1-12 file upload hardening)
  - NIST SP 800-53 alignment (reference S2-1)
  - WA OCIO 141.10 alignment (reference S2-2)

- **4. Privacy**
  - Worker privacy protections — structural guarantee (reference S2-7; state the schema fact)
  - PII inventory (reference S2-5)
  - Data subject rights: BASELINE does not collect consumer PII — KCM employee data is handled under the employment relationship and existing HR policies, not a consumer privacy framework; state this distinction
  - Data use limitation certification (reference S2-7)

- **5. Incident Response**
  - Incident response plan: exists — reference S2-3
  - Breach notification timeline: 24 hours for P1 (reference S2-3)
  - Contact for incident notification: [KCM IT Security Contact — to be populated at pilot onboarding]

- **6. Availability and Business Continuity**
  - Uptime SLA (reference S2-4 — state current posture honestly)
  - RTO/RPO (reference S2-4)
  - Backup procedure (reference S2-4)
  - Disaster recovery (reference S2-4)

- **7. Accessibility**
  - Accessibility standard: WCAG 2.1 AA (automated) + manual partial (reference S2-9)
  - Audit date: 2026-05-14
  - Remaining deviations: list from S2-9 known deviations section

- **8. Third-Party Integrations**
  - Current integrations (draw from Integration Options Matrix below)
  - Data shared with each integration
  - Security posture of each integration

- **9. Vendor Information**
  - System owner: Invaria (founder's business entity) — disclose product ownership per the established transparency policy
  - Hosting provider: [to be confirmed at S3-1]
  - Support and incident contact: [founder contact — do not include personal phone/email in committed doc; populate at pilot onboarding]

**Part 2 — Integration Options Matrix**

Produce a table with the following columns: Integration, Current State, Data Flow Direction, Data Shared, Security Mechanism, Roadmap Status.

Rows to cover (minimum):

| Integration | Description |
|-------------|-------------|
| **Hexagon EAMS** | Current coexistence — BASELINE captures field condition data; EAMS is the work-order and asset system of record. SFTP nightly export (S1-6, S1-7) sends canonical route and condition data to KCM-controlled SFTP destination. BASELINE receives no data from EAMS (read from EAMS not yet implemented). Data shared: stop completion records, condition observations, route run summaries — no worker identity. |
| **SFTP Export** | Nightly CSV/JSON export of canonical data (S1-6). Direction: BASELINE → KCM SFTP. Security: SFTP with key-based auth. No PII in export payload. |
| **Azure Entra SSO** | Authentication only (current). Direction: KCM Azure Entra → BASELINE (token issuance). BASELINE validates `aud`, `iss`, `exp`, `oid` claims (S1-11). No data flows from BASELINE to Azure Entra. |
| **ArcGIS** | Not yet integrated (roadmap). Near-term option: SFTP extension to include GeoJSON stop condition file, ingested by KCM GIS team (reference S2-8 Option B). No worker identity in any ArcGIS-bound data. |
| **KMS (AWS KMS or Azure Key Vault)** | `captured_by_oid` on `core.visits` is KMS-encrypted (S1-13). KMS is the only external system with access to OID-level field worker identity at the visit level. Access requires DB-level key access — separately logged and IT-provisioned. |

**Part 3 — TPRA Package Checklist**

Include a checklist that the founder and KCM IT evaluator can use to confirm the package is complete before submission:

- [ ] S2-1 NIST SP 800-53 control mapping — committed to `docs/security/`
- [ ] S2-2 WA OCIO 141.10 alignment statement — committed
- [ ] S2-3 Incident response plan — committed
- [ ] S2-4 Business continuity summary — committed
- [ ] S2-5 Data classification document — committed
- [ ] S2-6 Log retention policy — committed
- [ ] S2-7 Data use limitation policy — committed
- [ ] S2-8 ArcGIS integration roadmap — committed
- [ ] S2-9 WCAG 2.1 AA conformance statement — committed and signed off
- [ ] S2-10 this document — committed
- [ ] All documents reviewed and signed off by founder (S3-5)
- [ ] KCM IT contact populated in incident response and vendor information sections
- [ ] Hosting platform confirmed and hosting-dependent sections updated (S3-1)

### Done criteria

- [ ] All 9 TPRA questionnaire sections answered with source document citations
- [ ] Integration Options Matrix covers all 5 integration rows
- [ ] Part 3 package checklist complete — no unchecked items
- [ ] Hosting-dependent answers updated to reflect confirmed hosting platform
- [ ] Document reviewed and signed off by founder (S3-5)
- [ ] Changelog entry written

---

## Sprint 2 Done Definition

S2 is complete when ALL of the following are true and a changelog entry has been written:

- [ ] S2-1 through S2-9 documents written and committed to `docs/security/`
- [ ] S2-10 TPRA package complete and committed
- [ ] All S2-9 prerequisites resolved (see `planning/SECURITY_SPRINT_INDEX.md` § S2-9 Prerequisites)
- [ ] All documents reviewed and signed off by founder (S3-5)
- [ ] KCM IT incident response and vendor contact fields populated
- [ ] Hosting platform confirmed (S3-1) and hosting-dependent sections updated in S2-1, S2-2, S2-3, S2-4
- [ ] Changelog entry written to `docs/changelog/YYYY-MM-DD-s2-complete.md`

---

## Sprint 2 Dispatch Format

Every S2 document task should be dispatched as a separate agent session. Use this format:

```
Documentation task. Read CLAUDE.md, then PROJECT_CONTEXT.md.

Task: [S2-N title]

[Paste the full S2-N section from this file as the task spec — Purpose,
Content requirements, Hosting context (if applicable), Done criteria.]

Hosting posture: [Demo / Azure commercial / Azure Government — specify which
is current at time of dispatch; default to "Demo (Render/Fly.io, no HA SLA)"
until S3-1 is complete.]

Source documents to read before writing:
- planning/security/ADMIN_ACCESS_POLICY.md (for S2-1, S2-5, S2-7)
- docs/security/axe-audit-2026-05-14.md (for S2-9)
- All prior S2 documents in docs/security/ (for S2-10)

Labor safety constraint: The data use limitation policy (S2-7) must document
the structural worker privacy guarantee as a verifiable architectural fact.
No security hardening document may describe worker identity exposure beyond
what planning/security/ADMIN_ACCESS_POLICY.md already documents.

This is a documentation task. No code or schema changes.

Write changelog entry to docs/changelog/YYYY-MM-DD-[slug].md before marking done.
Follow git conventions in CLAUDE.md § Git Commit Convention.
```
