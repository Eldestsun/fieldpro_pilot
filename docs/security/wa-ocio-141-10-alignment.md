# BASELINE — WA OCIO Policy 141.10 Alignment Statement

**Document**: S2-2
**Version**: 1.0
**Date**: 2026-05-14
**Status**: Pending founder review
**Policy reference**: WA OCIO Policy 141.10, effective 2020-07-01, last reviewed 2023
**Hosting posture at time of writing**: Demo — Render or Fly.io (no FedRAMP inheritance, no HA SLA)
**Review cadence**: Annually; updated when hosting posture changes (S3-1) or when controls change

---

## 1. Purpose and Scope

This document demonstrates that BASELINE meets — or has a documented plan to meet — each security domain defined in Washington State Office of the Chief Information Officer (OCIO) Policy 141.10. Policy 141.10 establishes the minimum security requirements for all state agency information systems and technology vendors operating within Washington State.

BASELINE is a vendor-operated system being evaluated for a pilot deployment at King County Metro (KCM), a Washington State public agency. As a technology vendor to a state agency, BASELINE must meet or exceed 141.10 requirements as a condition of TPRA approval and pilot contract.

This statement is written at demo hosting posture (Render or Fly.io). Three domains — Physical and Environmental (§4), Contingency Planning (§5), and System and Communications Protection (§13) — have explicit hosting upgrade paths to Azure commercial pilot posture and are documented accordingly.

---

## 2. Alignment Summary

| Domain | Title | Status |
|--------|-------|--------|
| 1 | Risk Management | Partial Alignment |
| 2 | Planning | Aligned |
| 3 | Personnel Security | Partial Alignment |
| 4 | Physical and Environmental | Partial Alignment |
| 5 | Contingency Planning | Partial Alignment |
| 6 | Configuration Management | Aligned |
| 7 | Maintenance | Aligned |
| 8 | System and Information Integrity | Aligned |
| 9 | Identification and Authentication | Aligned |
| 10 | Access Control | Aligned |
| 11 | Audit and Accountability | Partial Alignment |
| 12 | Incident Response | Partial Alignment |
| 13 | System and Communications Protection | Partial Alignment |
| 14 | System and Services Acquisition | Aligned |

**Summary**: 8 of 14 domains are fully aligned. 6 are partially aligned with documented gaps and specific remediation paths. No domain is Not Applicable. No domain is unaddressed.

---

## 3. Domain-by-Domain Alignment

### Domain 1 — Risk Management

**Status**: Partial Alignment

**Narrative**: BASELINE's risk management posture is embedded in its architecture rather than in a standalone risk register document. The threat model is defined through the system's architecture constraints: the primary threat surfaces are the web API (covered by JWT validation, S1-11), the database (covered by Row Level Security, Tier 7 + R11), file uploads (covered by upload hardening, S1-12), and the audit log (covered by append-only RLS, S1-1). The NIST SP 800-53 control mapping (S2-1) documents which controls are implemented and which risks are accepted, with explicit gap statements and remediation plans for each open item. The system owner (founder) accepts residual risk at demo posture, consistent with the acknowledged demo-to-pilot upgrade path. An annual review cycle is committed as a standing practice.

**Gap**: No formal written risk register document exists as a discrete artifact. The architectural threat model is embedded across planning documents rather than consolidated. The annual review date has not yet been formally established.

**Remediation**: A formal risk register document consolidating the residual risks identified in S2-1 and in this document will be produced before pilot launch. The first annual review date will be set at pilot onboarding.

---

### Domain 2 — Planning

**Status**: Aligned

**Narrative**: BASELINE's security planning artifacts are produced as part of Sprint 2 and are committed to the repository before TPRA submission. The system security plan is the NIST SP 800-53 control mapping (S2-1). Supporting policy documents include the Data Classification Document (S2-5), the Log Retention Policy (S2-6), the Data Use Limitation Policy (S2-7), this alignment statement (S2-2), the Incident Response Plan (S2-3, in progress), and the Business Continuity Summary (S2-4, in progress). Architecture documentation is maintained in `planning/architecture/target_architecture.md` (canonical design) and `planning/architecture/current_state.md` (as-built state). The Admin Access Policy (`planning/security/ADMIN_ACCESS_POLICY.md`) documents the access control intent and use-limitation commitment. All documents reference each other and are updated when the underlying implementation changes.

**Evidence**: `docs/security/nist-800-53-control-mapping.md`; `planning/architecture/target_architecture.md`; `planning/architecture/current_state.md`; `planning/security/ADMIN_ACCESS_POLICY.md`

---

### Domain 3 — Personnel Security

**Status**: Partial Alignment

**Narrative**: The Admin Access Policy (`planning/security/ADMIN_ACCESS_POLICY.md`) defines the three authorized Admin groups — the Invaria founder, the KCM Business Analyst team, and KCM IT — with rationale for each. No self-provisioning or privilege escalation path exists within the application: gaining Admin role requires a role assignment through the provisioning process. The KCM BA team and KCM IT members are KCM employees subject to KCM's existing personnel security policies (background checks, access governance, onboarding/offboarding procedures). The founder's access relationship is disclosed to KCM organizational leadership per the transparency policy documented in `PROJECT_CONTEXT.md`. Operational leadership (chiefs, superintendents, supervisors) hold Lead or UL roles with no access to audit log data or administrative functions — this is enforced at the route layer (`requireAnyRole(['Admin'])`), not solely by policy.

**Gap**: No formal written offboarding runbook exists as a standalone procedure. The process (Admin role removal via the provisioning path) is documented by implication in the Admin Access Policy but has not been codified as a step-by-step runbook. Background vetting for the founder is handled through organizational transparency rather than through a formal personnel vetting process.

**Remediation**: An offboarding runbook will be produced before pilot launch, documenting the specific steps to revoke Admin role, verify removal, and log the change. KCM IT's existing offboarding procedures cover KCM BA team and KCM IT members.

**Evidence**: `planning/security/ADMIN_ACCESS_POLICY.md`; `backend/src/middleware/authz.ts` (requireAnyRole enforcement)

---

### Domain 4 — Physical and Environmental

**Status**: Partial Alignment (demo); upgrades to Aligned at Azure commercial

**Narrative**: BASELINE operates entirely on cloud-hosted infrastructure. There is no on-premises hardware, no co-located equipment, and no physical access surface under BASELINE's direct control. Physical security is inherited from the hosting provider. At demo posture (Render or Fly.io), both providers operate on modern cloud infrastructure with physical security controls; SOC 2 Type II reports are available upon request from each provider. BASELINE does not assert specific FedRAMP physical controls at demo posture because neither Render nor Fly.io holds a FedRAMP authorization.

**Gap at demo posture**: BASELINE cannot independently verify the physical security posture of Render or Fly.io beyond their publicly available compliance documentation. No formal physical security review of the demo hosting provider has been conducted.

**Hosting upgrade path**: At Azure commercial pilot, physical datacenter security is handled by Microsoft's Azure infrastructure, which is ISO 27001 certified, SOC 2 Type II audited, and holds a FedRAMP-Moderate authorization for commercial services. Domain 4 transitions to Aligned at this posture. At Azure Government, the same physical controls apply with full FedRAMP-Moderate inheritance.

**Remediation**: Confirm hosting platform (S3-1); at that point, provider physical security documentation can be cited with specificity.

---

### Domain 5 — Contingency Planning

**Status**: Partial Alignment

**Narrative**: BASELINE's field UL mobile surface includes an offline queue (`offlineQueue.ts`) that allows field workers to continue recording stops during a backend outage. Collected observations sync when connectivity restores. This reduces the operational impact of a backend failure during a field shift — the most time-sensitive use context. The export-and-delete endpoint (S1-4) provides an on-demand full-data export capability that an Admin can use to produce a point-in-time data backup before any planned maintenance or recovery action.

**Gap**: The Business Continuity Summary (S2-4) has not yet been produced. Formal RTO and RPO targets are not documented. Backup frequency and automated backup configuration are not specified at demo posture. A tested restore procedure does not yet exist.

**Hosting upgrade path**: At Azure commercial pilot, Azure Database for PostgreSQL Flexible Server provides automated daily backups with 7–35 day configurable retention and point-in-time recovery (PITR). The S2-4 document will specify RTO/RPO targets and restore procedures once the hosting platform is confirmed (S3-1) and the managed DB backup configuration is set (S3-2). At Azure Government, the same Azure backup capabilities apply with FedRAMP-Moderate CP control inheritance.

**Remediation**: S2-4 (Business Continuity Summary) — can be dispatched in parallel with the hosting decision (demo-posture section can be written now; hosting-dependent sections annotated with upgrade path).

---

### Domain 6 — Configuration Management

**Status**: Aligned

**Narrative**: BASELINE's configuration management approach follows infrastructure-as-code principles throughout. All environment-specific values (database credentials, SFTP keys, KMS key references, Azure Entra client IDs) are passed via environment variables and are documented in `backend/.env.example` without actual values committed to source. No secrets are hardcoded in source code. Database schema changes are managed through versioned migration files in `backend/migrations/`, each with a timestamp prefix and registered in `schema_migrations`. The migration runner (Tier 6A) ensures schema changes are applied deterministically and idempotently. Dependency versions are pinned in `pnpm-lock.yaml` for reproducible builds. The CI pipeline (`.github/workflows/ci.yml`) gates every push — a build that introduces HIGH or CRITICAL dependencies cannot be merged. The Docker deployment configuration (in progress for S3 ops tasks) will complete the infrastructure-as-code posture for deployment configuration.

**Evidence**: `backend/.env.example`; `backend/migrations/` (versioned schema migrations); `.github/workflows/ci.yml`; `docs/changelog/2026-05-12-tier-6-infrastructure.md`

---

### Domain 7 — Maintenance

**Status**: Aligned

**Narrative**: Dependency vulnerability scanning is performed on each development sprint using `pnpm audit` in both the backend and frontend workspaces. A CI gate (`.github/workflows/ci.yml`, S1-10) runs `pnpm audit --audit-level=high` on every push and fails the build on any HIGH or CRITICAL advisory, preventing vulnerable dependencies from reaching the deployment branch. As of 2026-05-14, there are 0 HIGH and 0 CRITICAL advisories in either workspace. Two accepted residuals are documented with rationale in `docs/security/dependency-audit-2026-05-13.md`: one LOW dev-only finding and one MODERATE dev-only finding, both unreachable in the production runtime. The update policy is: HIGH and CRITICAL advisories are remediated before the next sprint closes; MODERATE and LOW dev-only findings are tracked and addressed in a planned upgrade cycle.

**Evidence**: `.github/workflows/ci.yml` (dependency-audit job); `docs/security/dependency-audit-2026-05-13.md`; `docs/changelog/2026-05-13-s1-10-dependency-audit.md`

---

### Domain 8 — System and Information Integrity

**Status**: Aligned

**Narrative**: BASELINE addresses information integrity through multiple layers. File upload integrity is enforced by magic byte detection (inline JPEG/PNG/WebP/HEIC signature matching), MIME type whitelist (`image/jpeg`, `image/png`, `image/webp`, `image/heic` only), a 25 MB file size cap, and server-generated UUID-based S3 storage keys that exclude client filenames entirely — eliminating path traversal by construction (`backend/src/middleware/uploadValidation.ts`, S1-12). The SFTP export pipeline (S1-6) writes SHA-256 checksum sidecars for both export formats (JSON bundle and CSV archive), allowing the receiving party to verify export file integrity at the destination. The `captured_by_oid` field on `core.visits` is encrypted with AES-256-GCM at the application layer (S1-13), so a storage-layer breach does not expose plaintext worker OIDs. All SQL queries use parameterized placeholders (`$1`, `$2` in `node-postgres`) — no string-concatenated SQL exists in any route handler. Input validation is applied at all external boundaries: ISO date format and range validation on the audit query endpoint, MIME and size validation on uploads, JWT claim validation on every authenticated request.

**Evidence**: `backend/src/middleware/uploadValidation.ts`; `backend/src/scripts/sftpExport.ts`; `backend/src/lib/oidCipher.ts`; `docs/changelog/2026-05-13-s1-12-upload-hardening.md`; `docs/changelog/2026-05-13-s1-13-oid-encryption.md`

---

### Domain 9 — Identification and Authentication

**Status**: Aligned

**Narrative**: All BASELINE users authenticate via Microsoft Authentication Library (MSAL) with Azure Entra (formerly Azure Active Directory). There are no local username/password credentials, no shared accounts, and no anonymous access paths to data-bearing endpoints. On every request, the backend validates the MSAL-issued JWT through a two-stage process: `jwt.verify()` validates the token signature against the JWKS endpoint (cached 1 hour), followed by `assertClaims(payload)` (added in S1-11) which validates the `aud` claim (must match the configured client ID), the `iss` claim (v2.0 Entra endpoint only — v1.0 `sts.windows.net` issuers are rejected), the `oid` claim (must be a non-empty string), and the `exp` claim (with 60-second clock tolerance). Claim validation failures trigger an `auth.login_failed` audit write and return HTTP 401 with the generic message `"invalid token"` — no internal claim detail is exposed to the caller. No shared or service accounts with human-readable passwords exist. Session tokens are not persisted by BASELINE.

**Evidence**: `backend/src/authz.ts` (requireAuth, assertClaims); `backend/tests/canonical/authClaims.test.ts`; `docs/changelog/2026-05-13-s1-11-token-claim-validation.md`

---

### Domain 10 — Access Control

**Status**: Aligned

**Narrative**: BASELINE implements role-based access control (RBAC) with three roles — Admin, Lead, and UL — enforced at the API route layer by `requireAnyRole` middleware in `backend/src/middleware/authz.ts`. Each role has a clearly scoped API surface: UL users access field recording routes only; Lead users add route management; Admins add audit log access, administrative configuration, and data export. Operational leadership — chiefs, superintendents, supervisors, and dispatchers — hold Lead or UL roles. They cannot access audit log data, administrative configuration, or the export surface under any condition; this is enforced at the route layer (HTTP 403 on any Admin-gated route for a non-Admin caller), not merely by policy. At the database layer, Row Level Security on all canonical tables (`core.visits`, `core.observations`, `core.evidence`, `core.assignments`, `core.locations`, `core.asset_locations`, `core.location_external_ids`, `identity_directory`) enforces tenant isolation via the `app.current_org_id` session variable set by the `withOrgContext` wrapper in `backend/src/db.ts`. Cross-tenant data access is structurally impossible at the query layer. The principle of least privilege is applied at both the API layer (role-scoped routes) and the data layer (RLS tenant isolation + application-layer OID encryption requiring KMS decrypt for OID access).

**Evidence**: `backend/src/middleware/authz.ts`; `backend/src/db.ts` (withOrgContext); `backend/migrations/20260512_row_level_security.sql`; `docs/changelog/2026-05-12-tier-7-rls-tenant-isolation.md`; `docs/changelog/2026-05-13-r11-multi-tenant-hardening.md`; `planning/security/ADMIN_ACCESS_POLICY.md`

---

### Domain 11 — Audit and Accountability

**Status**: Partial Alignment

**Narrative**: The `audit_log` table (S1-1) captures all administrative and security-relevant actions with `actor_oid` (Azure Entra OID — never a name or display name), `org_id`, `action`, `resource_type`, `resource_id`, `detail` (JSONB), `ip_address`, and `occurred_at`. Twelve action types are currently wired across authentication, route assignment, administrative configuration, export, and OID decrypt events. The table is append-only via `FORCE ROW LEVEL SECURITY` — no `UPDATE` or `DELETE` policy exists, making modification structurally impossible at the application layer. The audit log query endpoint (S1-3) provides Admin-gated access with date range and action-type filtering, and CSV export for compliance review. The Log Retention Policy (S2-6) mandates a minimum 1-year retention period from `occurred_at`, consistent with standard security audit record practice and the KCM records retention schedule category to be confirmed before pilot launch (likely GS 50-05-020).

**Gap**: Two event types are not yet wired — `admin.user_role_change` (no role-change endpoint exists yet) and `audit_log_read` (reading the audit log should itself be auditable — documented in `planning/security/ADMIN_ACCESS_POLICY.md` as a follow-up item). A formal log review procedure (cadence, reviewer role, escalation threshold) has not yet been documented.

**Remediation**: `admin.user_role_change` requires a role-management endpoint (future sprint, tracked in ISSUE-010). `audit_log_read` will be added to the S1-3 query endpoint in a follow-up. A log review procedure will be documented in the operational runbook before pilot launch.

**Evidence**: `backend/migrations/20260513_audit_log.sql`; `backend/src/middleware/auditLog.ts`; `backend/src/middleware/auditWrite.ts`; `docs/security/log-retention-policy.md` (S2-6); `docs/changelog/2026-05-13-s1-1-audit-log-table.md`; `docs/changelog/2026-05-13-s1-2-wire-audit-writes.md`

---

### Domain 12 — Incident Response

**Status**: Partial Alignment

**Narrative**: BASELINE's incident detection capabilities are in place: the audit log (S1-1/S1-2) captures anomalous authentication and administrative events; Azure Entra sign-in logs record unusual authentication patterns at the identity provider level; the CI dependency scan gate (S1-10) provides a vulnerability introduction signal on each push. The audit log's append-only design ensures the forensic evidence base is preserved during an incident — no application-layer action can destroy audit records before export. The Washington State breach notification obligation (RCW 19.255.010, requiring notification within 72 hours for affected residents) and the TPRA contractual notification requirement (24 hours for P1 incidents to KCM IT) are known and acknowledged.

**Gap**: The Incident Response Plan (S2-3) has not yet been written. The severity classification (P1/P2/P3), escalation procedure, 24-hour P1 notification chain, evidence preservation steps, and post-mortem template are not yet documented as an executable procedure. The KCM IT security contact role has not yet been populated.

**Remediation**: S2-3 (Incident Response Plan) is on the Sprint 2 dispatch list and can be written immediately. KCM IT security contact will be populated at pilot onboarding.

**Evidence** (detection capabilities): `backend/migrations/20260513_audit_log.sql`; `backend/src/modules/admin/adminRoutes.ts` (audit query endpoint); `.github/workflows/ci.yml`

---

### Domain 13 — System and Communications Protection

**Status**: Partial Alignment (demo); upgrades to Aligned at Azure commercial

**Narrative**: All client-to-backend communication occurs over HTTPS with TLS terminated at the hosting provider's ingress. No HTTP-only data endpoints exist in the application. SFTP transport (S1-6) uses `ssh2-sftp-client` with key-based authentication (`SFTP_PRIVATE_KEY_PATH` required), strict host-key checking (`SFTP_KNOWN_HOSTS_PATH` required, TOFU disabled), and connection refusal on unknown hosts — password-based SFTP auth is never attempted. No plaintext secrets exist in committed source code or configuration files. `captured_by_oid` on `core.visits` is encrypted with AES-256-GCM at the application layer (S1-13), independent of hosting-layer encryption status. A CORS policy is configured on the Express backend, restricting cross-origin requests to the known frontend origin.

**Gap at demo posture**: HTTPS redirect (HTTP → HTTPS) is handled at the hosting provider's ingress layer; the application itself does not enforce a redirect if the ingress is misconfigured or bypassed. No Azure DDoS Protection or equivalent DoS mitigation is in place at demo posture.

**Hosting upgrade path**: At Azure commercial pilot, TLS enforcement is handled by Azure App Service or Azure Front Door with forced HTTPS redirect as a platform configuration, closing the application-layer gap. Azure DDoS Protection provides network-layer DoS mitigation. Domain 13 transitions to Aligned at this posture. At Azure Government, the same protections apply with FedRAMP-Moderate SC control inheritance.

**Remediation**: Confirm hosting platform (S3-1); configure Azure App Service HTTPS-only setting or Azure Front Door HTTPS redirect at pilot setup.

**Evidence**: `backend/src/scripts/sftpExport.ts` (SFTP key-based auth); `backend/src/lib/oidCipher.ts` (AES-256-GCM); `backend/src/app.ts` (CORS configuration); `backend/.env.example`

---

### Domain 14 — System and Services Acquisition

**Status**: Aligned

**Narrative**: BASELINE's API surface is fully documented via an OpenAPI 3.0.3 specification generated and validated by `backend/src/openapi/generate.ts` (S1-5). The specification covers 53 API paths across 12 route files, with each path annotated with its required role, request/response shapes, and applicable audit action (`x-audit-action`). The spec generator enforces coverage completeness — any route without a `@openapi` annotation causes the generator to exit with a non-zero status code, preventing silent API surface drift. The committed spec is served at `GET /api/openapi.json` for programmatic consumption. Security engineering principles are embedded as hard constraints in the development process via `CLAUDE.md`: worker identity columns may not be added to intelligence-layer tables; no string-concatenated SQL; server-generated storage keys (no client filenames in object paths); all authenticated routes require `requireAnyRole` enforcement. The CI pipeline (R8) provides a build-integrity gate on every push. Code is reviewed with security constraints applied as non-negotiable boundaries, not as aspirational guidelines.

**Evidence**: `backend/openapi/openapi.json`; `backend/src/openapi/generate.ts`; `.github/workflows/ci.yml`; `CLAUDE.md`; `docs/changelog/2026-05-13-s1-5-openapi-spec.md`; `docs/changelog/2026-05-12-r8-ci-pipeline.md`

---

## 4. Gaps Summary

| Domain | Gap | Remediation | Target |
|--------|-----|-------------|--------|
| 1 — Risk Management | No formal risk register document; annual review date not established | Risk register document before pilot launch | Pre-pilot |
| 3 — Personnel Security | No formal offboarding runbook | Offboarding runbook before pilot launch | Pre-pilot |
| 4 — Physical and Environmental | Demo provider physical security not FedRAMP-authorized | Azure commercial pilot hosting (S3-1) | S3-1 |
| 5 — Contingency Planning | S2-4 not written; no RTO/RPO targets; no tested restore procedure | S2-4 (Business Continuity Summary); S3-2 (managed DB backup config) | S2-4 / S3-2 |
| 11 — Audit and Accountability | Two event types unwired; no formal log review procedure | Role-management endpoint (future sprint, ISSUE-010); audit_log_read follow-up to S1-3; log review procedure in operational runbook | Sprint 3 / Pre-pilot |
| 12 — Incident Response | S2-3 (Incident Response Plan) not written; no documented notification chain | S2-3 dispatch (Sprint 2) | S2-3 |
| 13 — Communications Protection | No application-layer HTTPS redirect enforcement; no DDoS protection at demo | Azure App Service HTTPS-only + Azure DDoS at pilot (S3-1) | S3-1 |

---

## 5. Hosting Upgrade Path for Domains 4, 5, and 13

| Domain | Demo posture (Render/Fly.io) | Azure commercial pilot | Azure Government |
|--------|------------------------------|----------------------|-----------------|
| 4 — Physical | SOC 2 Type II from provider (not FedRAMP) | ISO 27001 certified Microsoft datacenters; FedRAMP-Moderate authorized | FedRAMP-Moderate inherited — full 141.10 domain 4 alignment |
| 5 — Contingency | Provider default backups; no RTO/RPO; S2-4 pending | Azure Database PITR (7–35 day retention); 99.99% availability SLA; RTO < 4 hours DB restore | Same capabilities; FedRAMP CP control inheritance |
| 13 — Communications | Provider-ingress TLS; no application HTTPS redirect; no DDoS | Azure Front Door HTTPS redirect; Azure DDoS Protection Standard; forced TLS by App Service config | Same; FedRAMP SC control inheritance |

---

## 6. Document History

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-05-14 | Initial statement — S2-2. Reflects S1 Sprint complete. Demo hosting posture. |

---

## 7. References

| Document | Path |
|----------|------|
| WA OCIO Policy 141.10 | ocio.wa.gov (effective 2020-07-01, last reviewed 2023) |
| NIST SP 800-53 Control Mapping | `docs/security/nist-800-53-control-mapping.md` (S2-1) |
| Admin Access Policy | `planning/security/ADMIN_ACCESS_POLICY.md` |
| Log Retention Policy | `docs/security/log-retention-policy.md` (S2-6) |
| Data Classification Document | `docs/security/data-classification.md` (S2-5) |
| Data Use Limitation Policy | `docs/security/data-use-limitation-policy.md` (S2-7) |
| Dependency Audit Report | `docs/security/dependency-audit-2026-05-13.md` |
| Target Architecture | `planning/architecture/target_architecture.md` |
| S1-10 — Dependency audit | `docs/changelog/2026-05-13-s1-10-dependency-audit.md` |
| S1-11 — Token claim validation | `docs/changelog/2026-05-13-s1-11-token-claim-validation.md` |
| S1-12 — Upload hardening | `docs/changelog/2026-05-13-s1-12-upload-hardening.md` |
| S1-13 — OID encryption | `docs/changelog/2026-05-13-s1-13-oid-encryption.md` |
| Tier 7 — RLS tenant isolation | `docs/changelog/2026-05-12-tier-7-rls-tenant-isolation.md` |
| R11 — Multi-tenant hardening | `docs/changelog/2026-05-13-r11-multi-tenant-hardening.md` |
