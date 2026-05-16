# Sprint 1 — Changelog and Done-Criteria Audit Report

> **Generated**: 2026-05-14
> **Sources cross-referenced**:
> - `planning/SECURITY_SPRINT_INDEX.md`
> - `planning/security/SECURITY_SPRINT_1_CODE_GAPS.md`
> - `docs/changelog/2026-05-13-s1-*.md` and `docs/changelog/2026-05-14-s1-*.md`
> - `docs/changelog/2026-05-14-issue-009-fixture-fix.md`
> - `docs/changelog/2026-05-14-dev-auth-bypass.md` / `2026-05-14-frontend-dev-auth-bypass.md`
> **Scope**: Analysis only. No code changes. No changelog entry required.

---

## Summary

| Item | Changelog | Done Criteria | Status |
|------|-----------|--------------|--------|
| S1-1 Audit Log Table | ✅ | ✅ All verified | **VERIFIED** |
| S1-2 Wire Audit Writes | ✅ | ✅ With ISSUE-010 deferred item noted | **VERIFIED** |
| S1-3 Audit Log Query Endpoint | ✅ | ✅ Smoke-test limitation noted | **VERIFIED** |
| S1-4 Export-and-Delete | ✅ | ✅ 1 deviation (TTL) documented | **VERIFIED** |
| S1-5 OpenAPI 3.0 Spec | ✅ | ✅ 2 deviations documented | **VERIFIED** |
| S1-6 SFTP Export Writer | ✅ | ✅ All verified | **VERIFIED** |
| S1-7 EAM Bridge Route Log | ✅ | ⚠️ 2 criteria unchecked in spec | **INCOMPLETE** |
| S1-8 axe-core Audit | ✅ | ✅ 1 deviation documented | **VERIFIED** |
| S1-9 axe-core Remediation | ✅ | ✅ 3 follow-up items documented | **VERIFIED** |
| S1-10 Dependency Scan | ✅ | ✅ All verified | **VERIFIED** |
| S1-11 Token Claim Validation | ✅ | ✅ All verified | **VERIFIED** |
| S1-12 Upload Hardening | ✅ | ✅ Size deviation noted | **VERIFIED** |
| S1-13 KMS OID Encryption | ✅ | ✅ All verified | **VERIFIED** |
| ISSUE-009 Fixture Fix | ✅ | ✅ 1 residual test failure (separate) | **VERIFIED** |
| Dev Bypass (backend + frontend) | ✅ | ⚠️ Uncommitted change in devAuthBypass.ts | **ATTENTION** |
| audit_log_read meta-trigger | ❌ None found | N/A | **NOT LANDED** |

**Overall Sprint 1 verdict**: 12 of 13 code items fully verified. S1-7 has two open done-criteria gaps. One follow-up item (audit_log_read) has no changelog entry.

---

## S1-1 — Admin Action Audit Log

**Changelog**: `docs/changelog/2026-05-13-s1-1-audit-log-table.md` ✅

| Done criterion | Verified? | Evidence |
|---------------|-----------|---------|
| `audit_log` table created via migration | ✅ | `backend/migrations/20260513_audit_log.sql` — all specified columns and indexes present |
| Migration applied and stamped by migration runner | ✅ | "Migration stamped in `schema_migrations` at 2026-05-13" |
| `writeAuditLog()` utility created | ✅ | `backend/src/middleware/auditLog.ts` — matches spec interface exactly |
| Unit test: insert succeeds; no UPDATE/DELETE path | ✅ | 3 tests: INSERT succeeds, UPDATE blocked by RLS (0 rows), DELETE blocked by RLS (0 rows) |
| Changelog entry written | ✅ | — |

**Deviations**: None.

**Status**: VERIFIED ✅

---

## S1-2 — Wire Audit Writes

**Changelog**: `docs/changelog/2026-05-13-s1-2-wire-audit-writes.md` ✅

| Done criterion | Verified? | Evidence |
|---------------|-----------|---------|
| All listed trigger points wired (7/9) | ✅ | `auth.login`, `auth.login_failed`, `assignment.create`, `assignment.reassign`, `assignment.cancel`, `admin.config_change` (3× pool, 1× stop_edit, 1× bulk_stop_edit), `admin.stop_edit` all wired |
| 2 triggers deferred (no hookable code) | ✅ | `export.data_export` deferred to S1-4 (later wired); `admin.user_role_change` deferred to ISSUE-010 |
| Audit writes fail silently (try/catch) | ✅ | "Every write is wrapped in try/catch and logs to `console.error` on failure" |
| No `actor_oid` in non-Admin API responses | ✅ | S1-3 grep confirmed `actor_oid` appears in responses only via `GET /admin/audit-log` (Admin only) |
| Changelog entry written | ✅ | — |

**Deviations**:
- `export.data_export` was unresolvable at S1-2 time (S1-4 endpoint did not yet exist). It was wired in S1-4 and confirmed in that changelog. The S1-2 done criterion correctly counts this as 7/9 wired.
- `admin.user_role_change` remains unwired. Tracked in ISSUE-010. No endpoint exists to hook.

**Status**: VERIFIED ✅

---

## S1-3 — Audit Log Query Endpoint

**Changelog**: `docs/changelog/2026-05-13-s1-3-audit-log-query-endpoint.md` ✅

| Done criterion | Verified? | Evidence |
|---------------|-----------|---------|
| Endpoint returns filtered results, 30-day default window | ✅ | `from` default 30 days ago, `to` default now; 400 on invalid date, range > 365 days |
| CSV export returns valid CSV with correct headers | ✅ | RFC 4180 quoting, CRLF, column order matches JSON; `Content-Type: text/csv` |
| Admin-only authorization enforced | ✅ | Route sits under `/admin` guard (`requireAnyRole(['Admin'])`); code reviewed |
| `withOrgContext()` applied — no cross-org leakage | ✅ | `withOrgContext(orgId, ...)` + explicit `WHERE org_id = $1` |
| Changelog entry written | ✅ | — |

**Deviations**:
- HTTP smoke tests (live 403 enforcement, live CSV download) could not be run without a real Azure Entra token. Verification relied on code review and `actor_oid` grep. The grep confirmed `actor_oid` appears in API responses only through this Admin-only endpoint — no non-Admin exposure found.
- The `detail` JSONB on `assignment.reassign` and `assignment.cancel` audit records contains `previous_assigned_user_oid` and `new_assigned_user_oid`. These are surfaced to Admins via this endpoint. Flagged in changelog as intentional for audit trail but noted for explicit acceptance in security review.

**`audit_log_read` meta-trigger**: The `admin.audit_log_read` audit action (every query of the endpoint itself writes an audit entry) is referenced in `planning/security/ADMIN_ACCESS_POLICY.md` as "tracked as a Sprint 1 follow-up item." It is NOT a done criterion in S1-3 and has no changelog entry as of this audit. See the **Not-Landed Items** section below.

**Status**: VERIFIED ✅

---

## S1-4 — Export-and-Delete Endpoint with Confirmation Token

**Changelog**: `docs/changelog/2026-05-13-s1-4-export-and-delete.md` ✅

| Done criterion | Verified? | Evidence |
|---------------|-----------|---------|
| Four-step flow implemented and tested | ✅ | POST /request, GET /export/:token_id, POST /execute; 14 integration tests covering full flow |
| Confirmation token expires | ✅ (deviation) | Implemented with **7-day TTL**, not 1-hour as specified. Deviation justified: "more appropriate for async export-then-delete workflows." Documented in done criteria. |
| Deletion is org-scoped only | ✅ | `audit_log_delete` RLS policy verified; org_id mismatch test in suite |
| Audit entries written for confirm and execute steps | ✅ | `export.data_export`, `export.delete_confirm`, `export.delete_execute` all written; also wired `export.data_export` from S1-2 backlog |
| Integration test covers full flow including expired token rejection | ✅ | 14 tests: expiry, replay protection, org mismatch, RLS policy |
| Changelog entry written | ✅ | — |

**Deviations**:
- Confirmation token TTL: 7 days (implemented) vs. 1 hour (specified). Deviation is documented and the spec's done criterion reflects the 7-day implementation.

**Status**: VERIFIED ✅

---

## S1-5 — OpenAPI 3.0 Specification

**Changelog**: `docs/changelog/2026-05-13-s1-5-openapi-spec.md` ✅

| Done criterion | Verified? | Evidence |
|---------------|-----------|---------|
| `swagger-jsdoc` annotations on all route files | ✅ | 53 paths across 12 route files; coverage enforcer exits 1 on any unannotated handler |
| Spec generated and served | ✅ (deviation) | Served at `GET /api/openapi.json` (raw JSON), not `/api/docs` (no swagger-ui). Coverage enforcement + `openapi:generate` npm script added. |
| Static `openapi.json` committed | ✅ (deviation) | Committed at `backend/openapi/openapi.json`, not `docs/api/openapi.json`. Co-located with backend for generator workflow. |
| All routes documented with auth requirements | ✅ | `x-required-roles` extension on every endpoint |
| OAuth2 security scheme documented | ✅ | AzureAD `authorizationCode` flow in components |
| Changelog entry written | ✅ | — |

**Deviations**:
- Serving path: `/api/openapi.json` instead of `/api/docs`. No swagger-ui mounted.
- Static file location: `backend/openapi/openapi.json` instead of `docs/api/openapi.json`.
- Both deviations are documented in the done criteria and changelog. Neither affects the substance of the spec content.

**Status**: VERIFIED ✅

---

## S1-6 — SFTP Export Writer

**Changelog**: `docs/changelog/2026-05-13-s1-6-sftp-export-writer.md` ✅

| Done criterion | Verified? | Evidence |
|---------------|-----------|---------|
| Script runs against local test SFTP server | ✅ | 14 tests including mock `ssh2.Server` upload test |
| All export files generated with correct column headers | ✅ | 9 tables exported (spec listed 4 minimum; implementation exports more — consistent with canonical data completeness goal) |
| Audit log entry written on each run | ✅ | `export.data_export` per org; `destination: 'sftp'` on upload, `'local-only'` on `SFTP_ENABLED=false` |
| Env vars documented in `.env.example` | ✅ | `SFTP_ENABLED`, `SFTP_HOST`, `SFTP_PORT`, `SFTP_USER`, `SFTP_PRIVATE_KEY_PATH`, `SFTP_KNOWN_HOSTS_PATH`, `SFTP_REMOTE_DIR` |
| Script registered as `pnpm sftp:export` | ✅ | `sftp:export` in `backend/package.json` |
| Changelog entry written | ✅ | — |

**Deviations**:
- Spec listed 4 export files; implementation exports 9 canonical tables. Superset of the spec — not a deviation, an extension.
- Security note in changelog: during the S1-13 dual-write period, exported `core.visits` contains `captured_by_oid` in plaintext. Documented in changelog and script header. Same access tier as `audit_log`. This will resolve when the dual-write period ends and the plaintext column is dropped.
- SFTP cron scheduling deferred to S3-1 (`SFTP_ENABLED=false` by default). Correctly flagged in TPRA-ready checklist as pending.

**Status**: VERIFIED ✅

---

## S1-7 — EAM Bridge Route Log ⚠️

**Changelog**: `docs/changelog/2026-05-13-s1-7-eam-bridge-route-log.md` ✅

| Done criterion | Verified? | Evidence |
|---------------|-----------|---------|
| `eam_bridge_route_log` table created via migration | ✅ | `backend/migrations/20260513_eam_bridge_route_log.sql`; `eam_bridge_populate_state` watermark table also created |
| Populate script runs without error on empty table | ✅ | 3 integration tests including empty-table case |
| Script correctly identifies unlogged completed runs | ✅ | Watermark-based high-water mark; idempotent via `ON CONFLICT DO NOTHING` |
| Audit log entry written per export run | ❌ **GAP** | Flagged as `[ ]` (unchecked) in `SECURITY_SPRINT_1_CODE_GAPS.md`. Changelog does not mention audit entry. `populateEamBridge.ts` does not appear to write an `eam_bridge.populate` or equivalent audit action. |
| Env vars documented in `.env.example` | ❌ **GAP** | Flagged as `[ ]` (unchecked) in `SECURITY_SPRINT_1_CODE_GAPS.md`. Populate script has no SFTP env vars of its own (S1-6 handled SFTP vars); but no `.env.example` update was made for the script's own configuration (watermark schedule, etc.). |
| Changelog entry written | ✅ | — |

**Deviations**: None beyond the two open criteria.

**Open gaps (both flagged in spec, neither resolved)**:
1. **Audit log entry per populate run**: `populateEamBridge.ts` does not write to `audit_log`. The spec done criterion is explicitly unchecked. This is the more security-significant gap — without it, EAM bridge runs are not part of the admin audit trail.
2. **Env var documentation**: Minor. The populate script operates from DB state and the watermark table; it does not require SFTP env vars of its own. The gap may be that the script's invocation method (cron schedule, org filter, watermark reset) is undocumented in `.env.example`.

**Status**: INCOMPLETE ⚠️ — 2 done criteria explicitly unmet

---

## S1-8 — axe-core Accessibility Audit

**Changelog**: `docs/changelog/2026-05-14-s1-8-axe-audit.md` ✅

| Done criterion | Verified? | Evidence |
|---------------|-----------|---------|
| Audit script runs against all 6 surfaces | ✅ | 5 authenticated via dual dev-bypass; Login scanned unauthenticated; authentication verified per surface via landmark rule |
| JSON report written | ✅ (deviation) | At `docs/security/axe-audit-2026-05-14.json`, not `docs/accessibility/` as spec suggested |
| Violations summary and per-surface findings in `.md` | ✅ | `docs/security/axe-audit-2026-05-14.md` — per-surface table + detailed appendix |
| Findings grouped by remediation pattern | ✅ | 4 patterns documented |
| Fixture gaps documented | ✅ | UL surfaces scanned in empty state; fixture requirement specified; re-audit required (completed in S1-9 Part B) |
| Changelog entry written | ✅ | — |

**Initial findings**: 4 confirmed violations (all serious, 0 critical); 2 incomplete findings. UL surfaces yielded 0 violations due to empty state (fixture gap).

**Status**: VERIFIED ✅

---

## S1-9 — Remediate axe-core Findings

**Changelog**: `docs/changelog/2026-05-14-s1-9-axe-remediation.md` ✅

| Done criterion | Verified? | Evidence |
|---------------|-----------|---------|
| Re-run axe-core — 0 violations, 5/5 tests passing | ✅ | "Post-remediation UL scan: 0 violations." "5/5 axe Playwright tests passing." |
| Zero critical violations remaining | ✅ | None found in S1-8; none introduced |
| Zero serious violations remaining | ✅ | 7 total found (4 in S1-8 + 3 UL re-audit); all 7 fixed |
| Moderate and minor findings documented (Part C) | ✅ | Part C section in `axe-audit-2026-05-14.md` covers 6 manual check categories |
| No design system color tokens introduced | ✅ | Only existing Tailwind tokens used (gray-500, gray-600, green-800, amber-800) |
| Changelog entry written | ✅ | — |
| Part C manual checks completed | ✅ | Focus trap ARIA, focus order, touch targets, viewport reflow, color-only state, VoiceOver noted |

**Follow-up items (explicitly deferred from S1-9 scope)**:
1. **Modal focus management JS** (`useEffect`-based focus trap — Tab containment, focus-on-open, return-focus-on-close): ARIA roles applied to all 5 dialogs, but programmatic focus management not implemented. Tracked in S2-9 prerequisite 1. Assessed as not a WCAG 2.1 AA failure in S2-9 conformance statement.
2. **Photo remove button touch target** (20×20px on photo strip): below WCAG 2.5.5 AAA minimum; not a Level AA violation. Product decision deferred to founder. Tracked in S2-9 prerequisite 2.
3. **VoiceOver / TalkBack manual run**: tracked as S3-4 (Founder task). Not yet completed.

All three follow-up items are correctly documented in the S2-9 conformance statement with accurate WCAG level assessments.

**Status**: VERIFIED ✅

---

## S1-10 — Dependency Vulnerability Scan

**Changelog**: `docs/changelog/2026-05-13-s1-10-dependency-audit.md` ✅

| Done criterion | Verified? | Evidence |
|---------------|-----------|---------|
| `pnpm audit` run in both workspaces | ✅ | `backend/` and `frontend/` both audited |
| All critical and high vulnerabilities resolved | ✅ | Pre: 1 CRITICAL + 13 HIGH (backend), 13 HIGH (frontend). Post: 0 H/C both workspaces |
| Audit results documented | ✅ | `docs/security/dependency-audit-2026-05-13.md` — per-finding resolution table, accepted residuals with rationale |
| CI gate added | ✅ | `dependency-audit` job in `.github/workflows/ci.yml`; fails on HIGH or CRITICAL |
| Changelog entry written | ✅ | — |

**Accepted residuals** (documented with rationale, not blocking):
- Backend LOW: `diff` via `ts-node` (GHSA-73rr-hh4g-fpgx) — dev-only, DoS path unreachable
- Frontend MODERATE: `vite` via `vitest` (GHSA-4w7w-66w2-5vf9) — dev-only; requires vitest 2.x → 3.x major upgrade

**Status**: VERIFIED ✅

---

## S1-11 — Auth Token Claim Validation

**Changelog**: `docs/changelog/2026-05-13-s1-11-token-claim-validation.md` ✅

| Done criterion | Verified? | Evidence |
|---------------|-----------|---------|
| `aud` claim validated against `AZURE_CLIENT_ID` | ✅ | Handles string, `api://` prefix, and array forms |
| `iss` claim validated against `AZURE_TENANT_ID` | ✅ | v2.0 endpoint only — stricter than `jwt.verify` (rejects `sts.windows.net` v1.0) |
| `oid` claim presence asserted before use | ✅ | Throws on missing, null, or empty string |
| JWKS cache TTL confirmed (1 hour) | ✅ | `cacheMaxAge: 60 * 60 * 1000` |
| Clock skew tolerance confirmed ≤ 60 seconds | ✅ | `clockTolerance: 60` |
| Token with wrong `aud` returns 401 | ✅ | Unit test: `assertClaims: rejects unknown aud` |
| Token with missing `oid` returns 401 | ✅ | Unit tests: `rejects missing oid`, `rejects empty string oid` |
| Changelog entry written | ✅ | — |

**Deviations**: None. 9 unit tests all pass.

**Status**: VERIFIED ✅

---

## S1-12 — File Upload Path Traversal & Validation

**Changelog**: `docs/changelog/2026-05-13-s1-12-upload-hardening.md` ✅

| Done criterion | Verified? | Evidence |
|---------------|-----------|---------|
| MIME type allowlist enforced on all upload routes | ✅ | `ALLOWED_MIME_TYPES`: jpeg, png, webp, heic — applied to both multipart and presigned URL paths |
| Magic-byte content validation in place | ✅ | `detectMimeFromBytes()` — inline magic byte detection; not header-only |
| Size limit enforced | ✅ (deviation) | **25 MB default** (spec said 10 MB). Configurable via `UPLOAD_MAX_FILE_BYTES` env var (spec said `MAX_UPLOAD_BYTES`). Functionally equivalent; size is more permissive than spec. |
| Filename sanitization applied | ✅ | Server-generated UUID storage key; `validateFilename()` rejects path traversal chars before key generation |
| Path traversal sequences rejected | ✅ | `../`, backslash, null bytes rejected with 400 |
| Rejected upload audit log entries written | ✅ | `upload.rejected` with reason in detail; filename never logged |
| Integration tests | ✅ | 12 unit tests: MIME detection, traversal rejection, UUID key pattern and uniqueness |
| Changelog entry written | ✅ | — |

**Deviations**:
- Size limit: 25 MB implemented vs. 10 MB specified. Not flagged as a deviation in the done criteria. Noted here for completeness. The larger limit is more permissive; if KCM IT has a specific upload size policy, this should be confirmed before pilot.
- Env var name: `UPLOAD_MAX_FILE_BYTES` (implemented) vs. `MAX_UPLOAD_BYTES` (spec). Functionally identical; different name only.

**Status**: VERIFIED ✅

---

## S1-13 — KMS-Encrypted `captured_by_oid` on `core.visits`

**Changelog**: `docs/changelog/2026-05-13-s1-13-oid-encryption.md` ✅

| Done criterion | Verified? | Evidence |
|---------------|-----------|---------|
| `captured_by_oid_ciphertext` and `captured_by_oid_key_id` columns exist | ✅ | `backend/migrations/20260513_s1_13_oid_encryption.sql` |
| All existing visits have ciphertext populated | ✅ | `backend/scripts/backfillOidEncryption.ts` — batched, idempotent, `SKIP LOCKED` |
| New visit inserts write ciphertext | ✅ | `ensureVisitForRouteRunStop` dual-writes during transition period |
| `decryptOid()` requires KMS key — errors on wrong/missing/tampered | ✅ | Unit tests: wrong key throws, tampered ciphertext throws, unknown keyId throws, missing env var throws |
| `admin.oid_decrypt` audit entry on every decrypt call | ✅ | Written inside `decrypt()` — mandatory, not optional |
| Dev environment works with `DEV_OID_KEY` | ✅ | `DevStaticKeyAdapter` active when `NODE_ENV !== 'production'` |
| Prod KMS adapter stubbed | ✅ | `AzureKeyVaultAdapter` stub with clear TODO for S3-1 |
| Unit tests (10) | ✅ | `oidCipher.test.ts` — encrypt/decrypt roundtrip, all error paths, DB column-presence check |
| Changelog entry written | ✅ | — |

**Deviations**: None.

**Pending (by design)**: Plaintext `captured_by_oid` column not yet dropped. This is correct per spec — dual-write period, drop is a follow-up migration. Azure Key Vault integration is a stub pending S3-1 hosting decision.

**Status**: VERIFIED ✅

---

## Additional Items

### ISSUE-009 — Fixture Fix (16 failing tests)

**Changelog**: `docs/changelog/2026-05-14-issue-009-fixture-fix.md` ✅

**Root cause**: `core.v_locations_transit` JOINs `core.location_external_ids` (FORCE ROW LEVEL SECURITY). Test fixture bypassed `withOrgContext()` using a raw pool client — `app.current_org_id` was never set, so RLS filtered all rows, `getVisitContext` received `NULL` for `location_id` on every query.

**Fix**: Added `set_config('app.current_org_id', FIXTURE_ORG_ID)` to `createRouteRunFixture` in `backend/tests/setup.ts`; matching reset in `cleanupFixture`.

**Test baseline improvement**:
- Before (DB up, S1 migrations): 82 pass / 17 fail
- After: **98 pass / 1 fail**

**Remaining failure**: `devAuthBypass: audit_log entry written for every bypass use` — this failure is caused by an uncommitted change in `backend/src/middleware/devAuthBypass.ts` (confirmed by git status: `M backend/src/middleware/devAuthBypass.ts`). The uncommitted change restructured the audit detail payload in a way that breaks the existing test assertion. This is **not** an ISSUE-009 item — it is a separate uncommitted edit that predates this fix.

**Status**: VERIFIED ✅ (99 tests total; 1 residual failure from uncommitted devAuthBypass.ts change)

---

### Dev Auth Bypass (Backend + Frontend)

**Changelogs**: `docs/changelog/2026-05-14-dev-auth-bypass.md` ✅ and `docs/changelog/2026-05-14-frontend-dev-auth-bypass.md` ✅

**What was built**: Dual dev-bypass mechanism that unblocked S1-8 authenticated surface scanning.
- Backend: `devAuthBypass.ts` middleware reads `X-Dev-User-*` headers; mounted before route handlers; 3 production-safety gates; `auth.dev_bypass` audit action added to known-actions registry
- Frontend: `devAuthBypass.ts` reads `localStorage.__dev_user__`; synthetic MSAL `AccountInfo` constructed; mounted via `useRef` in `AuthContext`

**CLAUDE.md update**: A CLAUDE.md clarification was made 2026-05-14 regarding dev bypass usage. No changelog entry required (per task dispatch). Confirmed: no changelog exists for this, and none is expected.

**Active issue — uncommitted change**: `backend/src/middleware/devAuthBypass.ts` has an uncommitted modification (git status: `M backend/src/middleware/devAuthBypass.ts`). This causes 1 test to fail: `devAuthBypass: audit_log entry written for every bypass use`. The change restructured the audit detail payload. This needs to be either committed (if intentional) or reverted before the next push.

**Status**: DOCUMENTED ✅ — uncommitted change in devAuthBypass.ts requires resolution

---

### `audit_log_read` Meta-Trigger

**Changelog**: ❌ None found

**Context**: `planning/security/ADMIN_ACCESS_POLICY.md` describes `audit_log_read` as follows:
> "The `admin.audit_log_read` action (tracked as a Sprint 1 follow-up item) will write an entry to `audit_log` every time an Admin user queries the endpoint."

This action is mentioned in S2-5 (data classification) and S2-6 (log retention) as an expected audit event. It is referenced as a key meta-audit property: any review of audit data leaves its own footprint.

**Current state**: No changelog entry exists for this item. The task dispatch notes it was "dispatched today, may still be in progress." As of this audit, it has **not landed**. The `GET /admin/audit-log` handler in `adminRoutes.ts` does not appear to write an `admin.audit_log_read` audit entry based on the S1-3 changelog (which does not mention this write).

**Impact**: The S2 policy documents (S2-5, S2-6, ADMIN_ACCESS_POLICY.md) describe this as a functioning control. Until it lands, those descriptions are aspirational rather than implemented. The TPRA evaluator reading those documents will expect to see this action in the audit log when they query it during review.

**Status**: NOT YET LANDED ❌ — no changelog entry; implementation status unconfirmed

---

## Sprint Index Status Discrepancy

The `planning/SECURITY_SPRINT_INDEX.md` was last updated 2026-05-13. As of 2026-05-14, the following S2 items have changelogs and committed documents but remain marked `🔴 Not started` in the index:

| Item | Index status | Actual status |
|------|-------------|--------------|
| S2-3 Incident Response Plan | 🟢 Done 2026-05-14 | ✅ Document committed |
| S2-4 Business Continuity Summary | 🔴 Not started | ✅ Document committed today |
| S2-5 Data Classification | 🔴 Not started | ✅ Document committed today |
| S2-6 Log Retention Policy | 🔴 Not started | ✅ Document committed today |
| S2-7 Data Use Limitation Policy | 🔴 Not started | ✅ Document committed today |
| S2-8 ArcGIS Integration Roadmap | 🔴 Not started | ✅ Document committed today |
| S2-9 WCAG Conformance Statement | 🔴 Not started | ✅ Document committed today |
| S2-1 NIST 800-53 Mapping | 🔴 Not started | ✅ Document committed today |
| S2-2 WA OCIO 141.10 Alignment | 🔴 Not started | ✅ Document committed today |

The sprint index needs a status sweep update. This is out of scope for this audit report but should be actioned before the TPRA-ready checklist is used.

---

## Action Items for Operator

Priority-ordered:

| Priority | Item | Action |
|----------|------|--------|
| 🔴 High | `audit_log_read` meta-trigger | Confirm whether implementation is in progress; if not, dispatch as a targeted code task to wire `admin.audit_log_read` audit write in `GET /admin/audit-log` handler |
| 🔴 High | `devAuthBypass.ts` uncommitted change | Inspect the uncommitted edit to `backend/src/middleware/devAuthBypass.ts`; either commit (if intentional restructuring of audit detail payload) or revert; either way resolves the 1 remaining failing test |
| 🟡 Medium | S1-7 audit log entry gap | Wire `eam_bridge.populate` (or equivalent action) audit log write in `populateEamBridge.ts`; add to `AUDIT_KNOWN_ACTIONS` |
| 🟡 Medium | S1-7 env var documentation | Determine what configuration the populate script exposes (schedule, org filter, watermark reset) and document in `.env.example` |
| 🟢 Low | Sprint index status sweep | Update `planning/SECURITY_SPRINT_INDEX.md` to reflect S2-1 through S2-9 as completed |
| 🟢 Low | S1-12 size limit confirmation | Confirm whether 25 MB upload limit is acceptable to KCM IT (spec said 10 MB); document acceptance decision |
| 🟢 Low | SFTP cron deployment | `SFTP_ENABLED=false` by default; wiring to a cron is S3-1 follow-up; already on TPRA-ready checklist |
| 🟢 Low | `captured_by_oid` plaintext column drop | Schedule follow-up migration after one release cycle of dual-write confirmation |
