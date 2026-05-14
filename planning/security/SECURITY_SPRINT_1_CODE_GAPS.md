# Security Hardening Sprint 1 — Code Gaps

> **Track**: Security Hardening & Procurement Compliance
> **Sprint**: 1 of 3 — Agent-executable code tasks
> **Estimated effort**: ~3 focused agent-days
> **Prerequisite**: Refactor (Tiers 1–8) and Refinement (R1–R10) complete or stable
> **Last updated**: 2026-05-13

| Task | Status | Completed |
|------|--------|-----------|
| S1-1 Admin Action Audit Log | ✅ Complete | 2026-05-13 |
| S1-2 Wire Audit Writes | ✅ Complete | 2026-05-13 |
| S1-3 Audit Log Query Endpoint | ✅ Complete | 2026-05-13 |
| S1-4 Export-and-Delete Endpoint | 🔴 Not started | — |
| S1-5 OpenAPI 3.0 Specification | 🔴 Not started | — |
| S1-6 SFTP Export Writer | 🔴 Not started | — |
| S1-7 EAM Bridge Route Log | ✅ Complete | 2026-05-13 |
| S1-8 axe-core Accessibility Audit | 🔴 Not started | — |
| S1-9 Remediate axe-core Findings | 🔴 Not started | — |
| S1-10 Dependency Vulnerability Scan | ✅ Complete | 2026-05-13 |
| S1-11 Auth Token Validation Hardening | ✅ Complete | 2026-05-13 |
| S1-12 File Upload Path Traversal & Validation | ✅ Complete | 2026-05-13 |
| S1-13 KMS-Encrypted captured_by_oid on core.visits | ✅ Complete | 2026-05-13 |

---

## Sprint 1 Overview

Sprint 1 closes all code-level security and compliance gaps identified in the Gap Analysis. Every task here is agent-executable without a hosting platform decision. Sprint 2 (policy documents) may begin in parallel for the hosting-independent items once Sprint 1 is underway.

**Critical labor safety constraint for all Sprint 1 tasks:**
No task may introduce `user_id` or any worker-identifying column into any intelligence table. The `audit_log` records `actor_oid` (Azure Entra OID) at the Admin security tier only — it must never be surfaced in operational dashboards, risk maps, or any surface accessible to dispatchers or supervisors.

---

## S1-1 — Admin Action Audit Log ✅

**Type**: Code
**Depends on**: None
**Blocks**: S1-2, S1-3
**Status**: Complete — 2026-05-13 | Changelog: `docs/changelog/2026-05-13-s1-1-audit-log-table.md`

### What to build

Create an `audit_log` table in the database and an append-only middleware utility that writes to it. The table records administrative and security-relevant actions for compliance auditability.

### Schema

```sql
CREATE TABLE audit_log (
  id            BIGSERIAL PRIMARY KEY,
  actor_oid     TEXT NOT NULL,          -- Azure Entra OID only — NOT a name, NOT a role-inferrable value
  org_id        UUID NOT NULL,
  action        TEXT NOT NULL,          -- see action registry below
  resource_type TEXT,                   -- e.g. 'route', 'stop', 'user', 'export', 'config'
  resource_id   TEXT,                   -- the ID of the affected resource, if applicable
  detail        JSONB,                  -- action-specific detail payload (no PII)
  ip_address    TEXT,                   -- request IP for security audit trail
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Append-only enforcement: no UPDATE or DELETE permissions granted on this table
-- RLS: audit_log rows are org-scoped — actor must be in the same org
CREATE INDEX audit_log_org_occurred ON audit_log (org_id, occurred_at DESC);
CREATE INDEX audit_log_actor ON audit_log (actor_oid, occurred_at DESC);
```

### Action registry

Standard action strings for consistency across all writes:

| Action | Description |
|--------|-------------|
| `auth.login` | Successful authentication |
| `auth.login_failed` | Failed authentication attempt |
| `assignment.create` | Route assigned to a worker |
| `assignment.reassign` | Route reassigned |
| `assignment.cancel` | Route assignment cancelled |
| `export.data_export` | Data export initiated |
| `export.delete_confirm` | Export-and-delete confirmation token issued |
| `export.delete_execute` | Data deleted following confirmed export |
| `admin.config_change` | Any admin configuration changed |
| `admin.user_role_change` | User role changed |
| `admin.stop_edit` | Stop record edited by admin |
| `admin.route_edit` | Route record edited by admin |

### Backend implementation

Create `backend/src/middleware/auditLog.ts`:

```typescript
import { pool } from '../db';

interface AuditEntry {
  actor_oid: string;
  org_id: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  detail?: Record<string, unknown>;
  ip_address?: string;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  await pool.query(
    `INSERT INTO audit_log (actor_oid, org_id, action, resource_type, resource_id, detail, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.actor_oid,
      entry.org_id,
      entry.action,
      entry.resource_type ?? null,
      entry.resource_id ?? null,
      entry.detail ? JSON.stringify(entry.detail) : null,
      entry.ip_address ?? null,
    ]
  );
}
```

### Migration file

Create `backend/migrations/20260512_audit_log.sql`. Follow the existing migration runner convention.

### Done criteria

- [x] `audit_log` table created via migration
- [x] Migration applied and stamped by migration runner
- [x] `writeAuditLog()` utility in `backend/src/middleware/auditLog.ts`
- [x] Unit test: inserting an audit entry succeeds; no UPDATE or DELETE path exists
- [x] Changelog entry written

---

## S1-2 — Wire Audit Writes ✅

**Type**: Code
**Depends on**: S1-1
**Blocks**: Nothing downstream (runs in parallel with S1-3)
**Status**: Complete — 2026-05-13 | Changelog: `docs/changelog/2026-05-13-s1-2-wire-audit-writes.md`
> Note: `export.data_export` and `admin.user_role_change` are not wired — no hookable code exists yet. Tracked in ISSUE-010. Will be wired when their endpoints land.

### What to wire

Add `writeAuditLog()` calls at each of the following trigger points. Load the relevant route handler files and insert calls without modifying any existing logic — this is additive only.

| Trigger | Action string | Notes |
|---------|--------------|-------|
| Successful login (post-MSAL token validation) | `auth.login` | actor_oid from `req.user.oid` |
| Failed auth (token validation throws) | `auth.login_failed` | actor_oid may be null — log `'unknown'` |
| Route assignment created | `assignment.create` | resource_type: `'route'`, resource_id: assignment ID |
| Route reassigned | `assignment.reassign` | include old and new assignment in detail |
| Route assignment cancelled | `assignment.cancel` | resource_id: assignment ID |
| Data export initiated | `export.data_export` | resource_type: `'export'`, detail: export parameters |
| Admin config changed | `admin.config_change` | detail: config key + old/new values (redact secrets) |
| Admin user role changed | `admin.user_role_change` | resource_id: target user OID |
| Admin stop edited | `admin.stop_edit` | resource_id: stop_id |

### Implementation notes

- `actor_oid` is always `req.user.oid` — never the worker name, never a role string
- `org_id` is always `req.user.org_id` resolved from the Entra tenant ID
- Audit writes must **not** be in the critical path — wrap in try/catch and log errors to console without blocking the primary response
- Do not surface `actor_oid` values to any API response accessible to non-Admin roles

### Done criteria

- [x] All listed trigger points have audit writes (7/9 wired; 2 deferred — no hookable code yet, see ISSUE-010)
- [x] Audit writes fail silently (try/catch, console.error) — never break primary request
- [x] No `actor_oid` appears in any response accessible to UL or Lead roles
- [x] Changelog entry written

---

## S1-3 — Audit Log Query Endpoint ✅

**Type**: Code
**Depends on**: S1-1
**Status**: Complete — 2026-05-13 | Changelog: `docs/changelog/2026-05-13-s1-3-audit-log-query-endpoint.md`
> Note: HTTP smoke tests (Auth role enforcement, CSV download) require a running server with a valid Azure Entra token. Code review and actor_oid grep confirmed correct behavior.

### Endpoint spec

```
GET /api/admin/audit-log
Authorization: Admin role required (requireAnyRole(['Admin']))
```

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `from` | ISO 8601 date | 30 days ago | Start of date range |
| `to` | ISO 8601 date | now | End of date range |
| `action` | string | all | Filter by action string |
| `format` | `json` \| `csv` | `json` | Response format |

**JSON response shape:**
```json
{
  "entries": [
    {
      "id": 1,
      "actor_oid": "abc123...",
      "action": "auth.login",
      "resource_type": "route",
      "resource_id": "uuid...",
      "detail": {},
      "ip_address": "10.0.0.1",
      "occurred_at": "2026-05-12T10:00:00Z"
    }
  ],
  "total": 42,
  "from": "2026-04-12T00:00:00Z",
  "to": "2026-05-12T23:59:59Z"
}
```

**CSV export:**
When `format=csv`, return `Content-Type: text/csv` with headers matching the JSON fields. Used for compliance reporting.

### RLS note

The query must use `withOrgContext()` so the Admin can only see their own org's audit entries. Cross-org visibility is not permitted.

### Done criteria

- [x] Endpoint returns filtered results with default 30-day window
- [x] CSV export returns valid CSV with correct headers
- [x] Admin-only authorization enforced (returns 403 for UL and Lead roles)
- [x] `withOrgContext()` applied — no cross-org leakage
- [x] Changelog entry written

---

## S1-4 — Export-and-Delete Endpoint

**Type**: Code
**Depends on**: None

### What to build

A two-step export-and-delete flow for data subject requests (GDPR/privacy compliance). The export step packages all data for an org. The delete step requires a confirmation token to prevent accidental deletion.

**Step 1 — Initiate export:**
```
POST /api/admin/data-export
Authorization: Admin role required
Body: { "format": "json" | "csv" }
Response: { "export_id": "uuid", "download_url": "/api/admin/data-export/uuid", "expires_at": "..." }
```

**Step 2 — Download:**
```
GET /api/admin/data-export/:export_id
Authorization: Admin role, same org
Response: File download (JSON or CSV)
```

**Step 3 — Request deletion confirmation token:**
```
POST /api/admin/data-export/:export_id/request-delete
Authorization: Admin role required
Response: { "confirm_token": "...", "expires_at": "..." }  -- token valid for 1 hour
```

**Step 4 — Execute deletion:**
```
DELETE /api/admin/data-export/:export_id
Authorization: Admin role required
Body: { "confirm_token": "..." }
Response: { "deleted": true, "rows_affected": N }
```

### Implementation notes

- Confirm token is a signed JWT or a random 32-byte hex string stored server-side with TTL
- Deletion scope: all `core.*` table rows for the org — NOT the org record itself, NOT audit_log (audit log is retained per log retention policy)
- Write `export.delete_confirm` and `export.delete_execute` audit log entries
- Export file should contain: all canonical visits, observations, evidence, assignments for the org

### Done criteria

- [ ] Four-step flow implemented and tested
- [ ] Confirmation token expires after 1 hour
- [ ] Deletion is org-scoped only — no cross-org data touched
- [ ] Audit entries written for confirm and execute steps
- [ ] Integration test covers the full flow including expired token rejection
- [ ] Changelog entry written

---

## S1-5 — OpenAPI 3.0 Specification

**Type**: Code/Documentation
**Depends on**: None

### What to build

Generate an OpenAPI 3.0 spec from existing route definitions using `swagger-jsdoc`. The spec documents all API routes, request/response schemas, authentication requirements, and the OAuth2 security scheme.

### Approach

1. Install `swagger-jsdoc` and `swagger-ui-express` as dev dependencies
2. Add JSDoc annotations to all route handler files (`routes/*.ts`)
3. Generate the spec at build time and serve it at `/api/docs` (Admin-only or dev-only)
4. Export the static `openapi.json` to `docs/api/openapi.json`

### Required documentation coverage

Every route must document:
- HTTP method and path
- Auth requirement (Bearer token + required role)
- Request body schema (if POST/PUT)
- Query parameters
- Response shape (200, 400, 401, 403, 404, 500)

### OAuth2 security scheme

```yaml
securitySchemes:
  AzureAD:
    type: oauth2
    flows:
      authorizationCode:
        authorizationUrl: https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/authorize
        tokenUrl: https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token
        scopes:
          openid: OpenID Connect
          profile: User profile
          email: Email address
```

### Done criteria

- [ ] `swagger-jsdoc` annotations on all route files
- [ ] Spec generated and served at `/api/docs` in development
- [ ] Static `openapi.json` exported to `docs/api/openapi.json`
- [ ] All routes documented with auth requirements
- [ ] OAuth2 security scheme documented
- [ ] Changelog entry written

---

## S1-6 — SFTP Export Writer

**Type**: Code
**Depends on**: None

### What to build

A scheduled script that exports canonical operational data as CSV/JSON and deposits it to a configured SFTP endpoint. This is the integration mechanism for EAM systems and data warehouse pipelines.

### Script location

`backend/scripts/sftp-export.ts`

### Export content

| File | Content | Format |
|------|---------|--------|
| `visits_YYYYMMDD.csv` | All `core.visits` for the org, last 24 hours | CSV |
| `observations_YYYYMMDD.csv` | All `core.observations` for the org, last 24 hours | CSV |
| `stop_condition_YYYYMMDD.csv` | All `stop_condition_history` for the org, last 24 hours | CSV |
| `stop_effort_YYYYMMDD.csv` | All `stop_effort_history` for the org, last 24 hours | CSV |

### Configuration (environment variables)

```
SFTP_HOST=
SFTP_PORT=22
SFTP_USER=
SFTP_KEY_PATH=              # path to private key file
SFTP_REMOTE_PATH=           # remote directory path
SFTP_EXPORT_ORG_ID=         # the org to export (pilot: KCM org UUID)
```

### Schedule

The script is designed to be invoked by a cron job or CI schedule. It is not a long-running process. The recommended schedule is nightly at 02:00 local time.

### Implementation notes

- Use `ssh2-sftp-client` for SFTP
- Write `export.data_export` audit log entry on each run
- Log export summary (rows exported per table) to stdout for CI log capture
- Handle partial failure: if one table export fails, log the error and continue with others

### Done criteria

- [ ] Script runs successfully against a local test SFTP server
- [ ] All four export files generated with correct column headers
- [ ] Audit log entry written on each run
- [ ] Env vars documented in `.env.example`
- [ ] README note added for scheduling setup
- [ ] Changelog entry written

---

## S1-7 — EAM Bridge Route Log

**Type**: Code
**Depends on**: None

### What to build

Create the `eam_bridge_route_log` table and a populate-on-schedule script. This is the pilot stub for the EAMS (Hexagon) integration — a structured log of completed route runs that the EAM system can consume via SFTP or API pull.

### Schema

```sql
CREATE TABLE eam_bridge_route_log (
  id              BIGSERIAL PRIMARY KEY,
  org_id          UUID NOT NULL,
  route_run_id    UUID NOT NULL REFERENCES route_runs(id),
  exported_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  export_format   TEXT NOT NULL DEFAULT 'csv',
  row_count       INT,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | exported | failed
  error_detail    TEXT
);

CREATE INDEX eam_bridge_org_exported ON eam_bridge_route_log (org_id, exported_at DESC);
```

### Populate script

`backend/scripts/eam-bridge-export.ts`

Logic:
1. Query `route_runs` where `status = 'completed'` and no `eam_bridge_route_log` row exists for the run
2. For each unlogged completed run, generate the EAM export row (stop IDs, completion timestamps, condition summary)
3. Insert into `eam_bridge_route_log` with `status = 'exported'`
4. The generated export data is written to the SFTP path (reuses S1-6 SFTP client)

### Done criteria

- [ ] `eam_bridge_route_log` table created via migration
- [ ] Populate script runs without error on an empty table
- [ ] Script correctly identifies unlogged completed runs
- [ ] Audit log entry written per export run
- [ ] Env vars documented in `.env.example`
- [ ] Changelog entry written

---

## S1-8 — axe-core Accessibility Audit

**Type**: Audit
**Depends on**: None
**Blocks**: S1-9, S2-9

### What to run

Run automated accessibility audits against all six application surfaces using `axe-core` via Playwright or `@axe-core/playwright`. The audit must cover each surface at the correct authentication role.

### Surfaces to audit

| Surface | Role | Notes |
|---------|------|-------|
| Login / Auth flow | Unauthenticated | MSAL redirect page |
| Stop Wizard (UL mobile) | UL | Core field worker flow — highest priority |
| Stop List (UL) | UL | Route stop list view |
| Lead Routes | Lead | Route management |
| Control Center | Admin | Live dispatch view |
| Admin Panel | Admin | User/stop/route management |

### Audit script

`backend/scripts/axe-audit.ts` or `frontend/tests/a11y/axe-audit.spec.ts`

For each surface:
1. Load the page with the correct auth context
2. Run `axe.run()` with WCAG 2.1 AA ruleset
3. Output violations to `docs/accessibility/axe-audit-YYYYMMDD.json`
4. Print a summary table of violations by surface and impact level

### Output format

```json
{
  "audit_date": "2026-05-12",
  "surfaces": {
    "stop_wizard": {
      "violations": [...],
      "passes": [...],
      "incomplete": [...]
    }
  },
  "total_violations": N,
  "critical_violations": N,
  "serious_violations": N
}
```

### Done criteria

- [ ] Audit script runs against all 6 surfaces
- [ ] JSON report written to `docs/accessibility/axe-audit-YYYYMMDD.json`
- [ ] Violations summary printed to console with impact levels
- [ ] Findings become the input to S1-9 remediation
- [ ] Changelog entry written

---

## S1-9 — Remediate axe-core Findings

**Type**: Code
**Depends on**: S1-8
**Blocks**: S2-9

### What to do

Fix all WCAG 2.1 AA violations found in the S1-8 audit. The remediation covers three categories:

**Color contrast**
- Ensure all text meets 4.5:1 contrast ratio (normal text) or 3:1 (large text)
- Check: button labels, status badges, navigation items, form labels, error messages
- Reference the design system's color tokens — do not introduce new color values

**ARIA and semantic HTML**
- All interactive elements must have accessible names
- Form inputs require associated `<label>` elements or `aria-label`
- Dialogs and modals require `role="dialog"` and `aria-modal="true"`
- Dynamic content updates must use `aria-live` regions where appropriate
- Navigation landmarks: `<nav>`, `<main>`, `<header>`, `<footer>` must be present

**Focus order and keyboard navigation**
- Tab order must follow visual reading order
- Focus must not be trapped (except inside open modals — then it must be trapped correctly)
- All interactive elements must be reachable via keyboard
- Visible focus ring must be present on all focusable elements
- Skip-to-main-content link must be the first focusable element

### Special attention: UL mobile stop wizard

This is the most critical surface. Field workers may use assistive technology on county-issued devices. Every step of the stop wizard must be fully navigable without a pointer.

### Done criteria

- [ ] Re-run axe-core audit after remediation
- [ ] Zero critical violations remaining
- [ ] Zero serious violations remaining
- [ ] Moderate and minor findings documented in `docs/accessibility/axe-audit-YYYYMMDD-post-remediation.json`
- [ ] No design system color tokens introduced or modified
- [ ] Changelog entry written

---

## S1-10 — Dependency Vulnerability Scan ✅

**Type**: Code/Ops
**Depends on**: None
**Status**: Complete — 2026-05-13 | Changelog: `docs/changelog/2026-05-13-s1-10-dependency-audit.md`

### What to run

Run `pnpm audit` in both `backend/` and `frontend/` workspaces. KCM IT will almost certainly run their own scan during the TPRA review — it is far better to find and fix issues first.

```bash
cd backend && pnpm audit
cd frontend && pnpm audit
```

### Resolution rules

| Severity | Required action |
|----------|----------------|
| Critical | Must fix before pilot — upgrade or replace dependency |
| High | Must fix before pilot — upgrade or replace dependency |
| Moderate | Fix if a non-breaking upgrade is available; document if not |
| Low | Document; fix opportunistically |

### If a direct upgrade is not available

- Check if the vulnerability is reachable in BASELINE's actual usage pattern
- Document the assessment in `docs/security/dependency-audit-YYYYMMDD.md`
- If the vulnerable code path is unreachable, note that explicitly with reasoning

### Done criteria

- [x] `pnpm audit` run in both `backend/` and `frontend/`
- [x] All critical and high vulnerabilities resolved (backend: 0 H/C; frontend: 0 H/C)
- [x] Audit results documented in `docs/security/dependency-audit-2026-05-13.md`
- [x] CI gate added: `dependency-audit` job in `.github/workflows/ci.yml`
- [x] Changelog entry written

---

## S1-11 — Auth Token Validation Hardening ✅

**Type**: Code
**Depends on**: None
**Status**: Complete — 2026-05-13 | Changelog: `docs/changelog/2026-05-13-s1-11-token-claim-validation.md`

### What to harden

The MSAL/Entra token validation in `authz.ts` must verify all required JWT claims. A token that passes signature validation but has incorrect audience or issuer claims must be rejected. This is not currently verified end-to-end.

### Required claim checks

| Claim | Expected value | Risk if missing |
|-------|---------------|-----------------|
| `aud` (audience) | `AZURE_CLIENT_ID` env var | Token issued for a different app accepted |
| `iss` (issuer) | `https://login.microsoftonline.com/{AZURE_TENANT_ID}/v2.0` | Token from a different tenant accepted |
| `exp` (expiry) | Must be in the future | Expired tokens accepted |
| `oid` (object ID) | Must be present (non-empty string) | Auth proceeds with no user identity |

### Implementation

In `backend/src/middleware/authz.ts` (or wherever token validation occurs), after the JWKS signature check passes, add explicit claim assertions:

```typescript
function assertClaims(payload: JwtPayload): void {
  if (payload.aud !== process.env.AZURE_CLIENT_ID) {
    throw new Error(`Invalid aud claim: ${payload.aud}`);
  }
  const expectedIss = `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/v2.0`;
  if (payload.iss !== expectedIss) {
    throw new Error(`Invalid iss claim: ${payload.iss}`);
  }
  if (!payload.oid || typeof payload.oid !== 'string') {
    throw new Error('Missing or invalid oid claim');
  }
  // exp is validated by the JWT library — confirm the library option is not disabled
}
```

Also verify:
- JWKS cache TTL is configured (recommended: 1 hour) — prevents excessive JWKS endpoint calls
- Clock skew tolerance is set conservatively (recommended: ≤ 60 seconds)
- The `authz.ts` auth middleware is frozen per cross-refinement constraint — these are additive claim checks only, not a rewrite

### Done criteria

- [x] `aud` claim validated against `AZURE_CLIENT_ID` (handles string, `api://` prefix, and array forms)
- [x] `iss` claim validated against `AZURE_TENANT_ID` (v2.0 endpoint only — stricter than jwt.verify)
- [x] `oid` claim presence asserted before use
- [x] JWKS cache TTL confirmed configured (1 hour)
- [x] Clock skew tolerance confirmed ≤ 60 seconds (clockTolerance: 60)
- [x] Token with wrong `aud` returns 401 (unit test: `assertClaims: rejects unknown aud`)
- [x] Token with missing `oid` returns 401 (unit tests: `rejects missing oid`, `rejects empty string oid`)
- [x] Changelog entry written

---

## S1-12 — File Upload Path Traversal & Validation

**Type**: Code
**Depends on**: None

### What to harden

File upload endpoints (stop photos, evidence attachments) must reject:
- Non-image MIME types
- Files exceeding the size limit
- Filenames containing path traversal sequences

### Validation rules

**MIME type allowlist** (reject anything not in this list):
```typescript
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
```

**Size limit**: 10 MB per file (configurable via `MAX_UPLOAD_BYTES` env var)

**Filename sanitization** — strip or reject any filename containing:
- `..` (parent directory traversal)
- `/` or `\` (path separators)
- Null bytes (`\0`)
- Any character outside `[a-zA-Z0-9._-]`

Use a sanitizer rather than a blocklist:
```typescript
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 255);
}
```

**Content validation**: Do not trust the `Content-Type` header alone. Use a magic-byte check (first N bytes of the file) to confirm the file is actually the image type it claims to be. The `file-type` npm package handles this.

### Implementation notes

- Add validation middleware to all upload route handlers
- Reject with HTTP 400 and a generic error message — do not echo the filename or MIME type back in the error (information leakage)
- Log rejected uploads to the audit log: action `upload.rejected`, detail: reason (mime_mismatch | size_exceeded | invalid_filename) — do NOT log the filename itself

### Done criteria

- [x] MIME type allowlist enforced on all upload routes
- [x] Magic-byte content validation in place (not header-only)
- [x] Size limit enforced (25 MB default, `UPLOAD_MAX_FILE_BYTES` env override)
- [x] Filename sanitization applied before any storage write (server-generated UUID key, `validateFilename` rejects traversal chars)
- [x] Path traversal sequences rejected
- [x] Rejected upload audit log entries written (no filename in detail)
- [x] Integration tests: reject MIME mismatch, reject traversal filename, key UUID pattern, key uniqueness
- [x] Changelog entry written — `docs/changelog/2026-05-13-s1-12-upload-hardening.md`

**Status**: ✅ Complete 2026-05-13

---

## S1-13 — KMS-Encrypted captured_by_oid on core.visits

**Type**: Code (schema + service)
**Depends on**: None
**Blocks**: Nothing in Sprint 1; informs S2-1 (NIST SC-13, SC-28)
**Status**: Complete — 2026-05-13 | Changelog: `docs/changelog/2026-05-13-s1-13-oid-encryption.md`

### Background

`core.visits.captured_by_oid` currently holds the plaintext Azure Entra OID of
the field worker who made the visit. The architectural deterrent today is the
access trail — reaching this column requires IT-provisioned DB access or Entra
access, both of which are themselves logged. This task converts that deterrent
into a structural prevention by encrypting the column at the application layer
using a KMS-held key that IT controls.

**After S1-13:**
- `captured_by_oid` is stored as ciphertext in the database
- The plaintext OID is never visible at the DB layer to a reader without explicit
  KMS decrypt permission
- Decryption requires a formal IT key-release process that is itself logged
  outside BASELINE
- This converts "DBA with read access can reconstruct patterns" from a
  deterrent-only mitigation into a structural impossibility without an
  IT-logged key request

### Schema change

Add two columns to `core.visits`:

```sql
ALTER TABLE core.visits
  ADD COLUMN captured_by_oid_ciphertext BYTEA,
  ADD COLUMN captured_by_oid_key_id     TEXT;
-- captured_by_oid_ciphertext: the AES-256-GCM encrypted OID
-- captured_by_oid_key_id:     which KMS key version was used (supports rotation)
```

- Existing plaintext values: encrypt and write to the new column in the same
  migration transaction.
- The plaintext `captured_by_oid` column is **not** dropped in this task. Drop
  it in a follow-up migration after one release cycle of dual-write. Document
  the dual-write period clearly in the migration file.

### Code change

**`backend/src/lib/oidCipher.ts`** (new):

```typescript
// Dev: uses DEV_OID_KEY env var with AES-256-GCM.
// Prod: thin adapter interface — plug in Azure Key Vault or AWS KMS
//       once the hosting decision is made (S3-1). Stub the prod adapter here;
//       founder configures the real KMS integration post-S3-1.

export async function encryptOid(oid: string): Promise<{ ciphertext: Buffer; keyId: string }>;
export async function decryptOid(ciphertext: Buffer, keyId: string): Promise<string>;
```

- For local/dev: static key from `DEV_OID_KEY` env var. Document clearly in
  the file header that this is dev-only and that production requires a real KMS.
- For prod: the adapter interface accepts a `KmsProvider` so the hosting
  platform plugs in without further changes to call sites.

**`backend/src/domains/visit/visitService.ts`**:
- Update `ensureVisitForRouteRunStop` to call `encryptOid(actorOid)` before
  INSERT and write `captured_by_oid_ciphertext` and `captured_by_oid_key_id`.

**Any reader of `captured_by_oid`**:
- Update to call `decryptOid(ciphertext, keyId)` instead of reading plaintext.
- Every `decryptOid` call must write an audit log entry:
  `action: 'admin.oid_decrypt'`, `resource_id: visit_id`.
  This is the trail that proves the structural control is working.

### Done criteria

- [ ] `captured_by_oid_ciphertext` and `captured_by_oid_key_id` columns exist on `core.visits`
- [ ] All existing visits have ciphertext populated (migration backfill)
- [ ] New visit inserts write ciphertext, not plaintext
- [ ] `decryptOid()` requires the KMS key — missing key throws, wrong key throws
- [ ] `admin.oid_decrypt` audit entry written on every decrypt call
- [ ] Dev environment works with `DEV_OID_KEY` static key
- [ ] Prod KMS adapter stubbed with clear TODO for hosting decision
- [ ] Unit tests: encrypt → decrypt roundtrip, missing key error, wrong key error
- [ ] Changelog entry written

### Critical constraints

- **Labor safety**: this strengthens the existing constraint — no worker identity
  is added anywhere new. The ciphertext column replaces the plaintext column
  for the same data.
- **Do not drop the plaintext column in this task** — that is a separate
  migration after a dual-write release cycle.
- **No change to any surface visible to UL or Lead roles.** Those views never
  showed `captured_by_oid` and do not show it after this task.

---

## Sprint 1 Agent Dispatch Template

Use this format when dispatching each S1 task to the coding agent:

```
Security hardening task. Read CLAUDE.md, then PROJECT_CONTEXT.md.

Task: [Task title from above]

[Paste the relevant section from this file as the task spec]

Labor safety constraints apply: no user_id introduced on any new table. 
audit_log records actor_oid (Azure Entra OID), not worker name or role-inferrable identifier.
actor_oid must not be surfaced in any view accessible to UL or Lead roles.

Write changelog entry to docs/changelog/YYYY-MM-DD-[slug].md before marking done.
```