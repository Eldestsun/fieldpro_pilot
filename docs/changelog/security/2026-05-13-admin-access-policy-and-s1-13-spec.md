# 2026-05-13 — Admin Access Policy + S1-13 Spec

## What changed

**Documentation only — no code, schema, or migrations touched.**

### New: `planning/security/ADMIN_ACCESS_POLICY.md`
Committed policy document defining the Admin role access roster and use-limitation
policy for the audit log. Sections:
- Admin roster (Invaria founder, KCM BA team, KCM IT) with rationale for each holder
- Explicit exclusion of operational leadership (chiefs, superintendents, dispatchers)
  from Admin access, with the enforcing code path named
- Structural argument for why the audit log cannot be misused for worker surveillance:
  no stop-level data in the audit log, worker OIDs appear only on admin-action records
  not worker-action records, no join path to stop-level history exists
- Use-limitation policy: audit log data is for security-investigation only
- Meta-audit note: audit log reads will themselves be logged via `admin.audit_log_read`
  (tracked as a Sprint 1 follow-up)
- Forward references to S2-1, S2-5, and S2-7 with specific section callouts

### New spec: S1-13 in `planning/security/SECURITY_SPRINT_1_CODE_GAPS.md`
Added full task spec for KMS-Encrypted `captured_by_oid` on `core.visits`:
- Background: converts the existing access-trail deterrent into structural prevention
  by encrypting at application layer with a KMS-held key
- Schema: two new columns (`captured_by_oid_ciphertext BYTEA`,
  `captured_by_oid_key_id TEXT`); plaintext column is NOT dropped in this task
- Code: `backend/src/lib/oidCipher.ts` with `encryptOid`/`decryptOid`; dev uses
  `DEV_OID_KEY` env var (AES-256-GCM); prod uses a stubbed KMS adapter that
  plugs in post-S3-1 hosting decision
- Audit trail: every `decryptOid()` call writes `admin.oid_decrypt` to audit log
- Done criteria: 9 criteria including unit tests and prod stub requirement
- Updated status table in Sprint 1 file to include S1-13 row

### Updated: `planning/SECURITY_SPRINT_INDEX.md`
- S1-1, S1-2, S1-3, S1-11 statuses updated to 🟢 Done 2026-05-13
- S1-13 row added to sprint map
- S1-13 added to execution order graph (independent; prod adapter waits on S3-1)
- Labor safety constraint section now references ADMIN_ACCESS_POLICY.md as the
  authoritative Admin roster document
- Last updated date bumped to 2026-05-13

## Why
- ADMIN_ACCESS_POLICY.md gives Sprint 2 policy documents a single source of truth
  for the Admin access narrative, preventing the compliance layer from drifting from
  the access configuration the code actually enforces
- S1-13 elevates `captured_by_oid` protection from deterrent to structural prevention —
  NIST SC-13 and SC-28 controls require encryption at rest for sensitive identifiers
- Sprint index status update reflects actual completion state for S1-1/S1-2/S1-3/S1-11

## Files touched
- `planning/security/ADMIN_ACCESS_POLICY.md` (new)
- `planning/security/SECURITY_SPRINT_1_CODE_GAPS.md` (S1-13 spec + status table row)
- `planning/SECURITY_SPRINT_INDEX.md` (statuses, S1-13 row, labor safety forward ref)
- `docs/changelog/2026-05-13-admin-access-policy-and-s1-13-spec.md` (this file)
