# BASELINE — NIST SP 800-53 Rev 5 Control Mapping

**Document**: S2-1
**Version**: 1.0
**Date**: 2026-05-14
**Status**: Pending founder review
**Hosting posture at time of writing**: Demo — Render or Fly.io (no FedRAMP inheritance, no HA SLA)
**Review cadence**: Annually; updated when hosting posture changes (S3-1) or when controls change

---

## 1. How to Read This Document

Each control entry states:

- **Status** — one of: `Implemented`, `Partial`, `Planned`, or `Not Applicable`
- **How BASELINE satisfies it** — description of the mechanism in place
- **Evidence** — the specific code file, migration, changelog, or policy document that proves it

Controls marked `Planned` are not yet satisfied at demo posture. Each has an inline note on what changes at Azure commercial pilot and, where applicable, at Azure Government (FedRAMP-Moderate inheritance).

Controls marked `Partial` are satisfied in part; the gap and its remediation path are stated explicitly.

The gap statement is the operative signal for the TPRA evaluator: a Partial or Planned without a remediation path is a procurement blocker; a Partial or Planned with a specific remediation reference is an accepted-risk finding with a documented upgrade path.

---

## 2. Summary Table

| Family | Controls Covered | Implemented | Partial | Planned | N/A |
|--------|-----------------|-------------|---------|---------|-----|
| AC — Access Control | AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-14, AC-17 | 7 | 1 | 0 | 0 |
| AU — Audit and Accountability | AU-1, AU-2, AU-3, AU-4, AU-6, AU-9, AU-11, AU-12 | 7 | 1 | 0 | 0 |
| IA — Identification and Authentication | IA-1, IA-2, IA-5, IA-8, IA-12 | 4 | 0 | 0 | 1 |
| SC — System and Communications Protection | SC-8, SC-12, SC-13, SC-28 | 2 | 1 | 1 | 0 |
| SI — System and Information Integrity | SI-2, SI-3, SI-7, SI-10, SI-12 | 5 | 0 | 0 | 0 |
| CP — Contingency Planning | CP-1, CP-2, CP-9 | 0 | 1 | 2 | 0 |
| IR — Incident Response | IR-1, IR-4, IR-6 | 1 | 1 | 1 | 0 |
| SA — System and Services Acquisition | SA-5, SA-8, SA-15 | 3 | 0 | 0 | 0 |
| PL — Planning | PL-2, PL-4 | 2 | 0 | 0 | 0 |

---

## 3. AC — Access Control

### AC-1 — Access Control Policy and Procedures

**Status**: Implemented

**How BASELINE satisfies it**: A written access control policy is established and enforced. The Admin Access Policy (`planning/security/ADMIN_ACCESS_POLICY.md`) names the three authorized Admin groups, documents the rationale for each, and states the use-limitation commitment for audit log data. This document (S2-1) serves as the system-level security plan referencing that policy.

**Evidence**: `planning/security/ADMIN_ACCESS_POLICY.md`; `docs/security/nist-800-53-control-mapping.md` (this document)

---

### AC-2 — Account Management

**Status**: Implemented

**How BASELINE satisfies it**: BASELINE uses three roles — Admin, Lead, and UL (field worker). Role assignment is controlled through Azure Entra group membership. The Admin roster is limited to three defined groups: (1) Invaria founder, (2) KCM Business Analyst team, (3) KCM IT. No self-provisioning or privilege escalation path exists within the application.

**Labor safety enforcement**: Operational leadership — chiefs, superintendents, supervisors, dispatchers — hold Lead or UL roles. Neither role has access to the audit log, to `captured_by_oid` on `core.visits`, or to any worker-keyed intelligence table. This is enforced at the route layer (`requireAnyRole(['Admin'])` guard on all Admin API endpoints), not merely by policy. A superintendent cannot gain audit access by organizational authority; they require a role change through the provisioning process.

**Evidence**: `backend/src/middleware/authz.ts` (requireAnyRole implementation); `planning/security/ADMIN_ACCESS_POLICY.md` (roster and use-limitation); `docs/changelog/2026-05-08-r1-auth-identity.md` (role provisioning implementation)

---

### AC-3 — Access Enforcement

**Status**: Implemented

**How BASELINE satisfies it**: Access to every API endpoint is enforced by the `requireAnyRole` middleware in `backend/src/middleware/authz.ts`. Routes are grouped by minimum required role:

- Admin routes (`/api/admin/*`): `requireAnyRole(['Admin'])` — returns HTTP 403 for non-Admin callers
- Lead routes (`/api/routes/*`, route management): `requireAnyRole(['Admin', 'Lead'])`
- UL routes (`/api/work/*`, field operations): `requireAnyRole(['Admin', 'Lead', 'UL'])`

At the database layer, Row Level Security (RLS) enforces tenant isolation on all canonical tables (`core.visits`, `core.observations`, `core.evidence`, `core.assignments`, `core.locations`, `core.asset_locations`, `core.location_external_ids`, `identity_directory`). The `withOrgContext(orgId, fn)` wrapper in `backend/src/db.ts` sets the `app.current_org_id` session variable for every request-scoped DB operation, making cross-tenant data access structurally impossible at the query layer.

**Evidence**: `backend/src/middleware/authz.ts`; `backend/src/db.ts` (withOrgContext); `backend/migrations/20260512_row_level_security.sql`; `backend/migrations/20260513_r11_identity_directory_org.sql`; `docs/changelog/2026-05-12-tier-7-rls-tenant-isolation.md`

---

### AC-4 — Information Flow Enforcement

**Status**: Implemented

**How BASELINE satisfies it**: Tenant isolation prevents information flow across organizational boundaries. RLS policies on all canonical tables enforce `org_id = current_setting('app.current_org_id')::bigint` at the DB layer. Cross-tenant reads and writes are blocked structurally — a missing `WHERE org_id = $1` clause in application code cannot produce cross-tenant data because the DB policy blocks it. Verified by `backend/scripts/verify_rls.ts` (6 assertions) and `backend/scripts/verify_r11.ts` (6 assertions) against a live database.

The intelligence layer (`stop_effort_history`, `stop_condition_history`) contains no `user_id` or `captured_by_oid` column. Information cannot flow from field operational records to per-worker profile surfaces because the join key does not exist in the schema.

**Evidence**: `backend/migrations/20260512_row_level_security.sql`; `backend/scripts/verify_rls.ts`; `backend/scripts/verify_r11.ts`; `docs/changelog/2026-05-13-r11-multi-tenant-hardening.md`

---

### AC-5 — Separation of Duties

**Status**: Implemented

**How BASELINE satisfies it**: Administrative functions (role provisioning, audit log access, pool configuration, bulk stop edits) are separated from operational functions (route assignment, field stop recording). An Admin user and a Lead user cannot perform each other's functions:

- Admin cannot masquerade as a field worker via the UL surface (the UI presents the Admin panel; there is no role-switch mechanism)
- Operational leadership (Lead/UL) cannot access administrative or audit surfaces regardless of organizational authority
- The founder holds Admin role; his day-job KCM BA role is Lead, consistent with the transparency policy documented in `planning/security/ADMIN_ACCESS_POLICY.md`

**Evidence**: `backend/src/middleware/authz.ts`; `planning/security/ADMIN_ACCESS_POLICY.md`

---

### AC-6 — Least Privilege

**Status**: Implemented

**How BASELINE satisfies it**: Each role is granted only the API surface necessary for its function. UL users can record stop completions, upload photos, and sync their offline queue — nothing else. Lead users add route management to the UL surface. Admins add the audit, configuration, and export surface. No role has a superset of another beyond this explicit stack. The API enforces this at the route layer; the DB enforces org-scoping via RLS.

The `captured_by_oid` field on `core.visits` is encrypted at application layer (AES-256-GCM, S1-13). Even a DB user with read access to `core.visits` cannot extract worker OIDs without KMS decrypt permission, which requires a separately provisioned and logged access path.

**Evidence**: `backend/src/middleware/authz.ts`; `backend/src/lib/oidCipher.ts`; `docs/changelog/2026-05-13-s1-13-oid-encryption.md`

---

### AC-14 — Permitted Actions Without Identification or Authentication

**Status**: Implemented

**How BASELINE satisfies it**: No application route processes meaningful data without authentication. The only unauthenticated endpoints are `GET /api/health` (liveness check, returns no data) and `GET /api/openapi.json` (the published API specification). All data-bearing routes require a valid Azure Entra JWT validated by `requireAuth` in `backend/src/middleware/authz.ts`. Expired or malformed tokens receive HTTP 401.

**Evidence**: `backend/src/middleware/authz.ts`; `backend/src/openapi/specRouter.ts`; `backend/src/routes/healthRoutes.ts`

---

### AC-17 — Remote Access

**Status**: Partial

**How BASELINE satisfies it**: All client-to-server communication uses HTTPS. The hosting provider (Render or Fly.io at demo posture) terminates TLS. No HTTP-only endpoint is exposed in the application layer. SFTP transport uses key-based authentication and strict host-key checking (S1-6).

**Gap**: BASELINE does not currently enforce HTTP-to-HTTPS redirect in application code — this is handled by the hosting provider's ingress. If the hosting provider's TLS termination is misconfigured or bypassed, the application does not have a fallback enforcement mechanism.

**Remediation**: At Azure commercial pilot, TLS enforcement will be handled by Azure App Service or Azure Front Door with forced HTTPS redirect as a platform configuration. This is a hosting-dependent upgrade (S3-1).

**Evidence**: `backend/src/scripts/sftpExport.ts` (SFTP key-based auth); `docs/changelog/2026-05-13-s1-6-sftp-export-writer.md`

---

## 4. AU — Audit and Accountability

### AU-1 — Audit and Accountability Policy and Procedures

**Status**: Implemented

**How BASELINE satisfies it**: The Log Retention Policy (S2-6) establishes the retention requirements for audit data. The Admin Access Policy establishes the use-limitation commitment. This document maps the technical audit implementation to the NIST AU control family.

**Evidence**: `docs/security/log-retention-policy.md` (S2-6); `planning/security/ADMIN_ACCESS_POLICY.md`

---

### AU-2 — Event Logging

**Status**: Partial

**How BASELINE satisfies it**: The following event types are audited and logged to the `audit_log` table with `actor_oid`, `org_id`, `action`, `resource_type`, `resource_id`, `detail`, `ip_address`, and `occurred_at`:

| Action | Trigger |
|--------|---------|
| `auth.login` | Successful JWT validation (`authz.ts`) |
| `auth.login_failed` | Failed JWT verification or claim assertion (`authz.ts`) |
| `assignment.create` | New route run created (`routeRunRoutes.ts`) |
| `assignment.cancel` | Route assignment nulled (`routeRunRoutes.ts`) |
| `assignment.reassign` | Route assignment OID changed (`routeRunRoutes.ts`) |
| `admin.config_change` | Pool created, updated, or deleted (`adminRoutes.ts`) |
| `admin.stop_edit` | Stop record edited, single or bulk (`adminRoutes.ts`) |
| `export.data_export` | Export bundle generated (`exportDeleteRoutes.ts`) |
| `export.delete_confirm` | Export-and-delete confirmation token issued (`exportDeleteRoutes.ts`) |
| `export.delete_execute` | Hard delete executed (`exportDeleteRoutes.ts`) |
| `admin.oid_decrypt` | `captured_by_oid` decrypted — written on every decrypt call (`oidCipher.ts`) |
| `upload.rejected` | File upload rejected for MIME mismatch or size exceeded (`ulRoutes.ts`, `uploadRoutes.ts`) |

**Gap**: Two action types are not yet wired because the trigger point does not exist:
- `admin.user_role_change` — no role-change endpoint; tracked in ISSUE-010
- `audit_log_read` — audit log read is itself auditable; the write is documented in ADMIN_ACCESS_POLICY.md as a follow-up item

**Remediation**: `admin.user_role_change` requires a role-management endpoint (future sprint). `audit_log_read` will be added to the query endpoint in a follow-up to S1-3.

**Evidence**: `backend/src/middleware/auditLog.ts`; `backend/src/middleware/auditWrite.ts`; `backend/src/authz.ts`; `backend/src/modules/admin/adminRoutes.ts`; `backend/src/modules/admin/exportDeleteRoutes.ts`; `backend/src/lib/oidCipher.ts`; `docs/changelog/2026-05-13-s1-1-audit-log-table.md`; `docs/changelog/2026-05-13-s1-2-wire-audit-writes.md`

---

### AU-3 — Content of Audit Records

**Status**: Implemented

**How BASELINE satisfies it**: Every `audit_log` entry contains:

| Field | NIST AU-3 requirement satisfied |
|-------|--------------------------------|
| `id` | Unique record identifier |
| `actor_oid` | User identity (Azure Entra OID — never a name or role string) |
| `org_id` | Organization / tenant scope |
| `action` | Type of event |
| `resource_type`, `resource_id` | Object of the action |
| `detail` (JSONB) | Supplemental context — varies by action type |
| `ip_address` | Source location of the event |
| `occurred_at` | Timestamp (timestamptz) |

**Evidence**: `backend/migrations/20260513_audit_log.sql`; `backend/src/middleware/auditLog.ts`; `docs/changelog/2026-05-13-s1-1-audit-log-table.md`

---

### AU-4 — Audit Log Storage Capacity

**Status**: Implemented

**How BASELINE satisfies it**: At demo posture, the `audit_log` table resides in the primary PostgreSQL database. No separate capacity monitoring is configured. The append-only RLS design prevents any application-layer deletion, so storage grows monotonically with audit activity during the retention period.

**Gap at demo posture**: No automated alerting for storage capacity. This is a low-priority risk at current pilot scale (small user population, bounded audit volume).

**Remediation**: At Azure commercial pilot, Azure Monitor storage alerts can be configured on the PostgreSQL Flexible Server instance. Log archival export to Azure Blob Storage (cool tier) for records older than 90 days will reduce primary DB storage growth (referenced in S2-6 Log Retention Policy).

**Evidence**: `backend/migrations/20260513_audit_log.sql`; `docs/security/log-retention-policy.md`

---

### AU-6 — Audit Record Review, Analysis, and Reporting

**Status**: Implemented

**How BASELINE satisfies it**: The audit log query endpoint (`GET /api/admin/audit-log`, S1-3) provides:
- Date range filtering (`from`, `to`, up to 365 days)
- Action-type filtering (`action` exact match against known action registry)
- Format selection: JSON (`{ entries, total, from, to }`) or CSV (RFC 4180, filename `audit-log-{from}-to-{to}.csv`)
- Org scoping enforced — no cross-org data is returned regardless of caller's access
- Pagination with true `COUNT(*)` (not page count)

The CSV format supports compliance review export. The JSON format supports programmatic analysis.

**Evidence**: `backend/src/modules/admin/adminRoutes.ts` (GET /admin/audit-log); `docs/changelog/2026-05-13-s1-3-audit-log-query-endpoint.md`

---

### AU-9 — Protection of Audit Information

**Status**: Implemented

**How BASELINE satisfies it**: The `audit_log` table is protected against modification and deletion at the database layer:

- `FORCE ROW LEVEL SECURITY` is enabled on `audit_log`
- Only `SELECT` and `INSERT` RLS policies exist. The absence of `UPDATE` and `DELETE` policies causes those operations to silently affect 0 rows for **all** roles, including the table owner, in normal operation
- The one permitted delete path — contract-termination export-and-delete (S1-4) — requires: (a) an Admin role, (b) a cryptographically secure confirmation token, (c) a `SET LOCAL app.export_delete_active = 'true'` session variable that resets at `COMMIT` and cannot persist across requests
- Audit log read operations are themselves auditable (`audit_log_read` action — pending implementation; documented in ADMIN_ACCESS_POLICY.md)
- The `actor_oid` field is populated with Azure Entra OIDs only — never a username, display name, or role-inferrable string that could be altered without trace

**Evidence**: `backend/migrations/20260513_audit_log.sql` (RLS policy); `backend/migrations/20260513_s1_4_export_delete_tokens.sql` (audit_log_delete policy); `backend/src/modules/admin/exportDeleteRoutes.ts`; `docs/changelog/2026-05-13-s1-1-audit-log-table.md`; `docs/changelog/2026-05-13-s1-4-export-and-delete.md`; `planning/security/ADMIN_ACCESS_POLICY.md`

---

### AU-11 — Audit Record Retention

**Status**: Implemented

**How BASELINE satisfies it**: The Log Retention Policy (S2-6) mandates a minimum 1-year retention period for `audit_log` entries from their `occurred_at` timestamp. The append-only RLS design enforces this structurally — no application path deletes audit records during normal operation. The only deletion path (S1-4 export-and-delete) is gated behind a confirmation token and is intended for contract termination, not routine purging.

**Evidence**: `docs/security/log-retention-policy.md` (S2-6); `backend/migrations/20260513_audit_log.sql` (RLS design)

---

### AU-12 — Audit Record Generation

**Status**: Implemented

**How BASELINE satisfies it**: Audit record generation is centralized in two modules:
- `backend/src/middleware/auditLog.ts` — `writeAuditLog(entry: AuditEntry)`: constructs and inserts the row; uses the existing connection pool from `db.ts`
- `backend/src/middleware/auditWrite.ts` — `auditWrite(...)`: thin fire-and-forget wrapper; `reqOrgId()` extracts `org_id` from the JWT `tid` claim; every write is wrapped in try/catch and logs to `console.error` on failure without blocking the primary request

Every wired action type generates a record at the moment of the triggering operation, not in a batch or at session end.

**Evidence**: `backend/src/middleware/auditLog.ts`; `backend/src/middleware/auditWrite.ts`; `docs/changelog/2026-05-13-s1-1-audit-log-table.md`; `docs/changelog/2026-05-13-s1-2-wire-audit-writes.md`

---

## 5. IA — Identification and Authentication

### IA-1 — Identification and Authentication Policy and Procedures

**Status**: Implemented

**How BASELINE satisfies it**: Authentication policy is established through this document, the ADMIN_ACCESS_POLICY.md, and the JWT claim validation implementation (S1-11). No local username/password authentication exists or is planned. All user identity is brokered through Azure Entra.

**Evidence**: `planning/security/ADMIN_ACCESS_POLICY.md`; `backend/src/authz.ts`

---

### IA-2 — Identification and Authentication (Organizational Users)

**Status**: Implemented

**How BASELINE satisfies it**: All users authenticate via Microsoft Authentication Library (MSAL) with Azure Entra (formerly Azure Active Directory). On each request, the backend validates the MSAL-issued JWT:

1. `jwt.verify()` validates the token signature against the JWKS endpoint (cached 1 hour per `cacheMaxAge: 3_600_000`)
2. `assertClaims(payload)` — added in S1-11 — validates:
   - `aud`: must match the configured client ID or `api://`-prefixed form
   - `iss`: v2.0 Entra endpoint only (`https://login.microsoftonline.com/{tid}/v2.0`) — v1.0 `sts.windows.net` issuers are explicitly rejected
   - `oid`: must be a non-empty string (not validated by `jwt.verify` alone)
   - `exp`: validated by `jwt.verify` with 60-second clock tolerance
3. Any claim validation failure triggers `auth.login_failed` audit write and returns HTTP 401 with `"invalid token"` — no internal claim detail is exposed in the response body

No shared accounts. No service accounts with human-readable passwords. No local username/password credential store.

**Evidence**: `backend/src/authz.ts` (requireAuth, assertClaims); `backend/tests/canonical/authClaims.test.ts`; `docs/changelog/2026-05-13-s1-11-token-claim-validation.md`

---

### IA-5 — Authenticator Management

**Status**: Implemented

**How BASELINE satisfies it**: BASELINE stores no authenticators. Credential management (password policies, MFA, credential rotation) is entirely delegated to Microsoft's Azure Entra identity platform, which operates under its own SOC 2 Type II and ISO 27001 certifications. BASELINE validates the tokens Entra issues; it has no surface to create, modify, or revoke credentials.

Session tokens (JWTs) are validated on every request and are not persisted by BASELINE. Token expiration is enforced by `jwt.verify`. An expired token returns HTTP 401; the user re-authenticates through the MSAL flow.

**Evidence**: `backend/src/authz.ts`; `frontend/src/auth/msalConfig.ts` (MSAL configuration — frozen file, not modified)

---

### IA-8 — Identification and Authentication (Non-Organizational Users)

**Status**: Not Applicable

**How BASELINE satisfies it**: BASELINE has no public-facing surface and no anonymous user access model. All users are organizational users authenticated through KCM's Azure Entra tenant. There are no consumer-facing features, no self-registration flows, and no external user access paths.

---

### IA-12 — Identity Proofing

**Status**: Implemented

**How BASELINE satisfies it**: Identity proofing is delegated to Azure Entra at the organizational level. KCM IT controls the Entra tenant and manages identity onboarding per KCM's personnel security policies. BASELINE relies on the `oid` claim in the JWT as the canonical user identifier — it does not perform additional identity proofing at the application layer and does not need to, as Entra identity proofing is a prerequisite for Azure Entra account issuance.

**Evidence**: `backend/src/authz.ts` (oid claim extraction); `docs/changelog/2026-05-13-s1-11-token-claim-validation.md`

---

## 6. SC — System and Communications Protection

### SC-8 — Transmission Confidentiality and Integrity

**Status**: Implemented

**How BASELINE satisfies it**: All client-to-backend communication occurs over HTTPS with TLS terminated at the hosting provider's ingress (Render or Fly.io at demo; Azure App Service or Front Door at pilot). No HTTP-only data endpoints exist.

SFTP transport (S1-6) uses `ssh2-sftp-client` with key-based authentication (`SFTP_PRIVATE_KEY_PATH` required), strict host-key checking (`SFTP_KNOWN_HOSTS_PATH` required, TOFU disabled), and connection refusal on unknown hosts. Password-based SFTP auth is never attempted.

No plaintext secrets exist in source code or committed configuration. Secrets are passed via environment variables (documented in `backend/.env.example`; actual values not committed).

**Evidence**: `backend/src/scripts/sftpExport.ts`; `backend/.env.example`; `docs/changelog/2026-05-13-s1-6-sftp-export-writer.md`

---

### SC-12 — Cryptographic Key Establishment and Management

**Status**: Partial

**How BASELINE satisfies it**: Application-layer KMS is implemented as an envelope encryption pattern in `backend/src/lib/oidCipher.ts`:
- `DevStaticKeyAdapter`: per-record DEK wrapped with `DEV_OID_KEY` (32-byte hex env var). Used in non-production environments.
- `AzureKeyVaultAdapter`: stub with `@azure/keyvault-keys` + `DefaultAzureCredential` integration. Requires `AZURE_KEY_VAULT_URL` and `AZURE_KEY_VAULT_KEY_NAME` env vars.

**Gap**: The `AzureKeyVaultAdapter` is a stub. It is not yet connected to a provisioned Azure Key Vault instance. Key rotation policy, key version management, and access control for the KMS key are not yet documented or configured.

**Remediation**: Key Vault provisioning is part of the Azure commercial pilot setup (S3-1). Once the vault is provisioned, the adapter requires only the vault URL and key name — no code changes. Key rotation policy will be documented in the operational runbook at that time.

**Evidence**: `backend/src/lib/oidCipher.ts`; `docs/changelog/2026-05-13-s1-13-oid-encryption.md`

---

### SC-13 — Cryptographic Protection

**Status**: Implemented

**How BASELINE satisfies it**: The `captured_by_oid` field on `core.visits` is encrypted using AES-256-GCM via `backend/src/lib/oidCipher.ts`:

- Per-record DEK generated via `crypto.randomBytes(32)` for each encryption operation
- DEK wrapped with a KMS Key Encryption Key (KEK) — `DevStaticKeyAdapter` in development, `AzureKeyVaultAdapter` in production
- Ciphertext blob layout: `version(1) | wrapped_dek_len(2) | wrapped_dek(N) | data_iv(12) | data_tag(16) | data_ciphertext(var)` — authenticated encryption with GCM tag prevents ciphertext tampering
- Every decrypt call writes a mandatory `admin.oid_decrypt` audit log entry, creating an access trail for any legitimate or illegitimate OID access
- Non-deterministic (random IV per encryption) — ciphertext for the same OID differs on each write, preventing correlation attacks

SFTP exports include SHA-256 tamper-evidence sidecars for each export file (S1-6).

**Evidence**: `backend/src/lib/oidCipher.ts`; `backend/migrations/20260513_s1_13_oid_encryption.sql`; `docs/changelog/2026-05-13-s1-13-oid-encryption.md`

---

### SC-28 — Protection of Information at Rest

**Status**: Planned — pending hosting decision (S3-1)

**How BASELINE satisfies it at demo posture**: Not asserted. Render and Fly.io provide managed infrastructure, but BASELINE cannot assert disk-level encryption guarantees from these providers' free or entry-tier offerings without reviewing their current infrastructure documentation. This control is not claimed at demo posture.

**Application-layer mitigation**: The most sensitive field in the BASELINE data model — `captured_by_oid` (worker OID on `core.visits`) — is encrypted at the application layer (AES-256-GCM, S1-13) regardless of whether disk-level encryption exists. A storage-layer breach does not expose plaintext worker OIDs.

**At Azure commercial pilot**: Azure Database for PostgreSQL Flexible Server encrypts all data at rest with AES-256 by default, using Microsoft-managed keys (with customer-managed key option available). Azure Blob Storage (for photo evidence) similarly encrypts at rest by default. SC-28 transitions to **Implemented** at this hosting posture.

**At Azure Government**: Same AES-256 at-rest encryption with FedRAMP-Moderate inheritance. SC-28 is a FedRAMP-inherited control at Azure Government posture.

**Evidence** (application-layer mitigation): `backend/src/lib/oidCipher.ts`; `docs/changelog/2026-05-13-s1-13-oid-encryption.md`

---

## 7. SI — System and Information Integrity

### SI-2 — Flaw Remediation

**Status**: Implemented

**How BASELINE satisfies it**: A comprehensive dependency vulnerability audit was completed on 2026-05-13 (S1-10):

- **Pre-remediation state**: 1 CRITICAL + 13 HIGH in backend; 13 HIGH in frontend
- **Post-remediation state**: 0 HIGH / 0 CRITICAL in both workspaces as of 2026-05-14
- **CI gate**: `.github/workflows/ci.yml` runs `pnpm audit --audit-level=high` in both `backend/` and `frontend/` workspaces on every push; any HIGH or CRITICAL advisory fails the build, preventing regression
- **Accepted residuals** (documented with rationale):
  - `diff` via `ts-node>diff` (GHSA-73rr-hh4g-fpgx) — LOW, dev-only, DoS path unreachable in BASELINE usage
  - `vite` via `vitest>vite` (GHSA-4w7w-66w2-5vf9) — MODERATE, dev-only, not in production build

**Evidence**: `.github/workflows/ci.yml` (dependency-audit job); `docs/security/dependency-audit-2026-05-13.md`; `docs/changelog/2026-05-13-s1-10-dependency-audit.md`

---

### SI-3 — Malicious Code Protection

**Status**: Implemented

**How BASELINE satisfies it**: File upload paths are hardened against malicious file injection via `backend/src/middleware/uploadValidation.ts` (S1-12):

- **Magic byte detection**: `detectMimeFromBytes(buf)` reads the first bytes of the upload buffer and matches against JPEG, PNG, WebP, and HEIC magic byte signatures. A PHP script with a `.jpg` extension is detected and rejected.
- **MIME type whitelist**: `ALLOWED_MIME_TYPES` permits only `image/jpeg`, `image/png`, `image/webp`, `image/heic`. Any other declared or detected type returns HTTP 400.
- **Size cap**: 25 MB hard cap via `multer limits: { fileSize: MAX_FILE_BYTES }`. Oversized uploads return HTTP 413.
- **Path traversal prevention**: `validateFilename()` rejects any filename containing `/`, `\`, or `..`. The storage key is always server-generated via `generateStorageKey()` using a UUID — the client filename never appears in the S3 object key.
- **Audit trail on rejection**: `upload.rejected` audit entry written with rejection reason (`mime_mismatch`, `size_exceeded`, `invalid_filename`); the offending filename is never logged.

**Evidence**: `backend/src/middleware/uploadValidation.ts`; `backend/src/s3Client.ts`; `docs/changelog/2026-05-13-s1-12-upload-hardening.md`

---

### SI-7 — Software, Firmware, and Information Integrity

**Status**: Implemented

**How BASELINE satisfies it**: SHA-256 checksums are generated for every SFTP export file (S1-6). Both the JSON bundle and the CSV archive receive a `.sha256` sidecar file written to the SFTP destination alongside the data file. The receiving party (KCM IT or EAMS pipeline) can verify integrity by comparing the checksum of the received file against the sidecar. This covers the data-in-transit integrity guarantee for the export pipeline.

The CI pipeline (`R8`, `.github/workflows/ci.yml`) runs on every push, providing a build-integrity gate that prevents deployment of code that fails tests or introduces HIGH/CRITICAL vulnerabilities.

**Evidence**: `backend/src/scripts/sftpExport.ts` (sha256 sidecar generation); `.github/workflows/ci.yml`; `docs/changelog/2026-05-13-s1-6-sftp-export-writer.md`; `docs/changelog/2026-05-12-r8-ci-pipeline.md`

---

### SI-10 — Information Input Validation

**Status**: Implemented

**How BASELINE satisfies it**: Input validation is applied at all external-facing boundaries:

- **Audit query endpoint** (S1-3): validates ISO date format for `from`/`to`, rejects `to < from`, rejects range > 365 days, rejects unknown format values. Returns HTTP 400 on any validation failure.
- **File uploads** (S1-12): magic byte detection, MIME whitelist, size cap, filename path traversal check — all applied before any downstream processing.
- **JWT claims** (S1-11): `aud`, `iss`, `oid` validated post-`jwt.verify`; invalid claims trigger 401 without exposing internal detail.
- **Export-and-delete flow** (S1-4): token hashed before lookup; 404 on unknown hash, 410 on expiry, 409 on consumed token, 403 on org_id mismatch — all validated before the delete transaction opens.
- **SQL queries**: parameterized queries throughout (`$1`, `$2` placeholder style in `node-postgres`). No string-concatenated SQL.

**Evidence**: `backend/src/modules/admin/adminRoutes.ts`; `backend/src/middleware/uploadValidation.ts`; `backend/src/authz.ts`; `backend/src/modules/admin/exportDeleteRoutes.ts`

---

### SI-12 — Information Management and Retention

**Status**: Implemented

**How BASELINE satisfies it**: Retention periods for all log and data categories are defined in the Log Retention Policy (S2-6):
- `audit_log`: minimum 1 year from `occurred_at`
- Application logs: 90 days
- Azure Entra sign-in logs: per Microsoft platform defaults (30–90 days depending on license tier)
- SFTP export files: retention at KCM-controlled SFTP destination — outside BASELINE's control; BASELINE does not dictate downstream retention

The append-only RLS design prevents premature deletion of audit records. The export-and-delete endpoint (S1-4) is the only deletion path, gated by confirmation token, and is intended for contract termination rather than routine retention management.

**Evidence**: `docs/security/log-retention-policy.md` (S2-6); `backend/migrations/20260513_audit_log.sql`; `docs/changelog/2026-05-13-s1-4-export-and-delete.md`

---

## 8. CP — Contingency Planning

### CP-1 — Contingency Planning Policy and Procedures

**Status**: Planned — pending S2-4 completion

**How BASELINE satisfies it**: The Business Continuity Summary (S2-4) is the contingency planning policy document for BASELINE. It is not yet written. When complete, it will define RPO/RTO targets, backup procedures, restore procedures, and the hosting upgrade path.

**Remediation**: S2-4 is on the Sprint 2 dispatch list and can be written as soon as the hosting decision (S3-1) is made or in parallel with a demo-posture section.

**Evidence**: `planning/security/SECURITY_SPRINT_2_POLICY_DOCS.md` (S2-4 spec); `docs/changelog/2026-05-14-s2-policy-docs-sync.md`

---

### CP-2 — Contingency Plan

**Status**: Planned — pending S2-4

**How BASELINE satisfies it**: See CP-1. Specific elements that will be covered in S2-4:
- **Availability target**: not asserted at demo posture (Render/Fly.io provides no formal SLA); 99.9% SLA at Azure commercial via Azure Database for PostgreSQL Flexible Server
- **Offline mode continuity**: BASELINE's UL mobile surface includes an offline queue (`offlineQueue.ts`) — field workers continue recording stops during a backend outage; data syncs when connectivity restores. This is a compensating control that reduces operational impact of backend failures during shifts.

**Evidence** (offline mitigation): `frontend/src/stores/offlineQueue.ts` (frozen — not modified); `docs/changelog/2026-05-10-r4-offline-first-hardening.md`

---

### CP-9 — Information System Backup

**Status**: Planned — pending hosting decision (S3-1)

**How BASELINE satisfies it at demo posture**: Backup posture depends on Render or Fly.io provider defaults. BASELINE does not configure or verify backup schedules at demo posture. This is acknowledged as a gap.

**Compensating control**: The export-and-delete endpoint (S1-4) provides an on-demand full-data export capability that an Admin can use to create a point-in-time export of all canonical data, including `audit_log`. This is not a substitute for automated backups but provides a manual recovery path.

**At Azure commercial pilot**: Azure Database for PostgreSQL Flexible Server provides automated backups with 7–35 day configurable retention and point-in-time recovery (PITR). CP-9 transitions to **Implemented** at this posture. Target: 30-day backup retention minimum, daily frequency. RTO/RPO targets will be defined in S2-4.

**At Azure Government**: Same Azure backup capabilities with FedRAMP-Moderate CP-9 inheritance.

**Evidence** (manual compensating control): `backend/src/modules/admin/exportDeleteRoutes.ts`; `docs/changelog/2026-05-13-s1-4-export-and-delete.md`

---

## 9. IR — Incident Response

### IR-1 — Incident Response Policy and Procedures

**Status**: Planned — pending S2-3 completion

**How BASELINE satisfies it**: The Incident Response Plan (S2-3) is the governing document for this control. It defines severity classification (P1/P2/P3), response procedures, notification chain, evidence preservation, and post-mortem requirements. S2-3 is on the Sprint 2 dispatch list.

**Remediation**: S2-3 can be dispatched immediately (hosting-dependent sections are annotated with upgrade paths for each hosting posture).

**Evidence**: `planning/security/SECURITY_SPRINT_2_POLICY_DOCS.md` (S2-3 spec)

---

### IR-4 — Incident Handling

**Status**: Partial

**How BASELINE satisfies it**: Detection sources are in place even before a formal incident response plan is written:
- Azure Entra sign-in logs — unusual authentication patterns visible to KCM IT
- `audit_log` anomaly detection — Admin users can query for unexpected action types or unusual `actor_oid` activity via the S1-3 endpoint
- CI dependency scan gate — introduces a vulnerability-detection signal on each push

The `audit_log` append-only design ensures the evidence base is preserved during an incident — no application-layer action can destroy audit records before they are exported.

**Gap**: No formal severity classification, escalation procedure, or 24-hour notification commitment is documented prior to S2-3 completion.

**Remediation**: S2-3 (Incident Response Plan).

**Evidence**: `backend/src/modules/admin/adminRoutes.ts` (audit query endpoint); `backend/migrations/20260513_audit_log.sql` (append-only design); `.github/workflows/ci.yml` (vulnerability gate)

---

### IR-6 — Incident Reporting

**Status**: Partial

**How BASELINE satisfies it**: The obligation to report exists (Washington State RCW 19.255.010 requires breach notification within 72 hours for affected residents; contractual TPRA obligation requires KCM IT notification within 24 hours for P1 incidents). The technical audit trail to support incident reporting is in place.

**Gap**: The notification chain, KCM IT security contact role, and WA AGO notification procedure are not yet documented as an executable procedure.

**Remediation**: S2-3 (Incident Response Plan) will document the full reporting chain. KCM IT security contact role will be populated at pilot onboarding.

**Evidence**: `docs/security/log-retention-policy.md` (audit trail retention guarantee for incident investigations); `planning/security/SECURITY_SPRINT_2_POLICY_DOCS.md` (S2-3 spec)

---

## 10. SA — System and Services Acquisition

### SA-5 — System Documentation

**Status**: Implemented

**How BASELINE satisfies it**: The API surface is fully documented via an OpenAPI 3.0.3 specification generated and validated by `backend/src/openapi/generate.ts` (S1-5):
- 53 API paths documented with `@openapi` JSDoc annotations across 12 route files
- Every route includes: required role, request/response shapes, applicable audit action (`x-audit-action`)
- The spec generator enforces coverage — any route without a `@openapi` block causes the generator to exit 1, preventing silent spec drift
- Committed to `backend/openapi/openapi.json` and `backend/openapi/openapi.yaml`; served at `GET /api/openapi.json` with 5-minute cache

Architecture documentation is maintained in `planning/architecture/target_architecture.md` (canonical design) and `planning/architecture/current_state.md` (as-built state including must-not-regress list).

**Evidence**: `backend/openapi/openapi.json`; `backend/openapi/openapi.yaml`; `backend/src/openapi/generate.ts`; `docs/changelog/2026-05-13-s1-5-openapi-spec.md`; `planning/architecture/target_architecture.md`

---

### SA-8 — Security Engineering Principles

**Status**: Implemented

**How BASELINE satisfies it**: Security engineering principles are embedded as hard constraints in the development process:

- **Labor safety as architecture**: worker identity columns are excluded from intelligence-layer tables by schema design, not by access control policy. This is a schema-engineering principle, not a configuration choice.
- **Append-only audit storage**: the decision to use RLS-enforced append-only design (rather than soft-delete or application-layer controls) is a security engineering principle applied at the data layer.
- **No plaintext sensitive data at rest**: `captured_by_oid` encrypted at application layer (AES-256-GCM) regardless of hosting-layer encryption status — defense in depth by design.
- **Server-generated storage keys**: client filenames are never used in S3 object keys (generateStorageKey), eliminating path traversal by construction.
- **Parameterized queries throughout**: no string-concatenated SQL in any route handler.
- **Principle of least privilege in schema**: intelligence tables have no worker identity column and therefore cannot be queried to produce worker profiles, even by a user with full read access to the DB.

**Evidence**: `backend/src/middleware/uploadValidation.ts` (generateStorageKey); `backend/src/lib/oidCipher.ts`; `backend/migrations/20260513_audit_log.sql` (RLS append-only); `CLAUDE.md` (labor safety guardrails as hard constraints)

---

### SA-15 — Development Process, Standards, and Tools

**Status**: Implemented

**How BASELINE satisfies it**: The development process includes security gates at the build layer:
- CI pipeline (`.github/workflows/ci.yml`, R8) runs on every push: backend tests, frontend build, dependency audit
- `pnpm audit --audit-level=high` in both workspaces — HIGH/CRITICAL findings fail the build
- OpenAPI spec generation validates spec completeness and audit action coverage on each generation run
- `verify_rls.ts` and `verify_r11.ts` scripts provide end-to-end DB isolation verification runnable at any time against a live DB

**Evidence**: `.github/workflows/ci.yml`; `backend/src/openapi/generate.ts`; `backend/scripts/verify_rls.ts`; `backend/scripts/verify_r11.ts`; `docs/changelog/2026-05-12-r8-ci-pipeline.md`

---

## 11. PL — Planning

### PL-2 — System Security Plan

**Status**: Implemented

**How BASELINE satisfies it**: This document (S2-1) is the system security plan. It maps implemented controls to the NIST SP 800-53 Rev 5 catalog, states gaps and remediation paths, and references the evidence artifacts for each control. It is complemented by the full Sprint 2 policy document suite: S2-2 (WA OCIO 141.10 alignment), S2-3 (Incident Response), S2-4 (Business Continuity), S2-5 (Data Classification), S2-6 (Log Retention), S2-7 (Data Use Limitation), S2-8 (ArcGIS Roadmap), S2-9 (WCAG Conformance).

**Evidence**: `docs/security/` (this document and all S2 policy documents); `planning/architecture/target_architecture.md`

---

### PL-4 — Rules of Behavior

**Status**: Implemented

**How BASELINE satisfies it**: The rules of behavior for BASELINE users are established through:
- **Admin Access Policy** (`planning/security/ADMIN_ACCESS_POLICY.md`): use-limitation commitment for audit log data; prohibition of non-security uses; roster governance
- **Data Use Limitation Policy** (`docs/security/data-use-limitation-policy.md`, S2-7): prohibited uses enumerated (worker performance assessment, scheduling decisions based on BASELINE data alone, data sale or sharing)
- **CLAUDE.md labor safety guardrails**: hard constraints on what may not be introduced at any layer — no `user_id` on intelligence tables, no worker comparison surfaces, no GPS tracking

These are not aspirational policies — they are enforced by schema design and route-layer access controls. The behavioral rules reflect what the system structurally permits, not what users are asked to voluntarily avoid.

**Evidence**: `planning/security/ADMIN_ACCESS_POLICY.md`; `docs/security/data-use-limitation-policy.md` (S2-7); `CLAUDE.md`

---

## 12. Open Gaps Summary

| Control | Status | Gap | Remediation | Target |
|---------|--------|-----|-------------|--------|
| AC-17 | Partial | HTTP-to-HTTPS redirect is hosting-provided, not application-enforced | Azure App Service / Front Door enforced HTTPS at pilot | S3-1 |
| AU-2 | Partial | `admin.user_role_change` and `audit_log_read` action types not yet wired | Role-change endpoint (future sprint); S1-3 follow-up | Sprint 3 |
| SC-12 | Partial | `AzureKeyVaultAdapter` is a stub; Key Vault not yet provisioned | Key Vault provisioning at Azure commercial pilot setup | S3-1 |
| SC-28 | Planned | Disk-level encryption not asserted at demo posture | Azure Database for PostgreSQL AES-256 at-rest at pilot | S3-1 |
| CP-1 | Planned | Business Continuity Summary (S2-4) not yet written | S2-4 dispatch (Sprint 2) | S2-4 |
| CP-2 | Planned | Contingency plan pending S2-4 | See CP-1 | S2-4 |
| CP-9 | Planned | Automated backup schedule not configured at demo posture | Azure automated backups at pilot (S3-2) | S3-1/S3-2 |
| IR-1 | Planned | Incident Response Plan (S2-3) not yet written | S2-3 dispatch (Sprint 2) | S2-3 |
| IR-4 | Partial | No formal severity classification or escalation procedure | S2-3 (Incident Response Plan) | S2-3 |
| IR-6 | Partial | Notification chain and KCM IT contact not yet documented | S2-3; KCM IT contact at pilot onboarding | S2-3 |

---

## 13. Hosting Upgrade Path Summary

| Control | Demo posture | Azure commercial pilot | Azure Government |
|---------|-------------|----------------------|-----------------|
| SC-28 (at rest) | Not asserted; app-layer OID encryption as mitigation | Implemented — AES-256 via Azure Database for PostgreSQL | FedRAMP-Moderate inherited |
| CP-9 (backup) | Provider defaults; not verified | Implemented — automated PITR, 7–35 day retention | FedRAMP-Moderate inherited |
| SC-12 (key mgmt) | DevStaticKeyAdapter (dev only) | AzureKeyVaultAdapter connected to provisioned vault | Same; Azure Key Vault GovCloud endpoint |
| CP-1/CP-2 (continuity) | Partial — S2-4 pending | Documented; Azure 99.99% Flexible Server SLA | FedRAMP CP control inheritance |
| IR (detection sources) | Audit log + Azure Entra logs | + Azure Monitor alerts + Azure Security Center | + Azure Sentinel SIEM |
| AC-17 (HTTPS enforce) | Hosting-provider ingress | Azure Front Door / App Service enforced redirect | Same |

---

## 14. Document History

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-05-14 | Initial mapping — S2-1. Reflects S1 Sprint complete (S1-1 through S1-13). Demo hosting posture. |

---

## 15. References

| Document | Path |
|----------|------|
| Admin Access Policy | `planning/security/ADMIN_ACCESS_POLICY.md` |
| S1-1 — Audit log table | `docs/changelog/2026-05-13-s1-1-audit-log-table.md` |
| S1-2 — Wire audit writes | `docs/changelog/2026-05-13-s1-2-wire-audit-writes.md` |
| S1-3 — Audit query endpoint | `docs/changelog/2026-05-13-s1-3-audit-log-query-endpoint.md` |
| S1-4 — Export-and-delete | `docs/changelog/2026-05-13-s1-4-export-and-delete.md` |
| S1-5 — OpenAPI spec | `docs/changelog/2026-05-13-s1-5-openapi-spec.md` |
| S1-6 — SFTP export writer | `docs/changelog/2026-05-13-s1-6-sftp-export-writer.md` |
| S1-7 — EAM bridge route log | `docs/changelog/2026-05-13-s1-7-eam-bridge-route-log.md` |
| S1-10 — Dependency audit | `docs/changelog/2026-05-13-s1-10-dependency-audit.md` |
| S1-11 — Token claim validation | `docs/changelog/2026-05-13-s1-11-token-claim-validation.md` |
| S1-12 — Upload hardening | `docs/changelog/2026-05-13-s1-12-upload-hardening.md` |
| S1-13 — OID encryption | `docs/changelog/2026-05-13-s1-13-oid-encryption.md` |
| Tier 7 — RLS tenant isolation | `docs/changelog/2026-05-12-tier-7-rls-tenant-isolation.md` |
| R11 — Multi-tenant hardening | `docs/changelog/2026-05-13-r11-multi-tenant-hardening.md` |
| R8 — CI pipeline | `docs/changelog/2026-05-12-r8-ci-pipeline.md` |
| S2-6 — Log Retention Policy | `docs/security/log-retention-policy.md` |
| S2-7 — Data Use Limitation | `docs/security/data-use-limitation-policy.md` |
| Dependency audit report | `docs/security/dependency-audit-2026-05-13.md` |
| OpenAPI specification | `backend/openapi/openapi.json` |
| Target architecture | `planning/architecture/target_architecture.md` |
