# 2026-05-13 — S1-6: SFTP Export Writer

## What changed

- Added `backend/src/scripts/sftpExport.ts` — nightly canonical-data snapshot script
  - Iterates over all organizations; per-org failure does not block others
  - Queries all canonical tables: `core.organizations`, `core.locations`, `core.assignments`,
    `core.visits` (plaintext + S1-13 ciphertext columns), `core.observations`, `core.evidence`
    (metadata only), `stop_effort_history`, `stop_condition_history`, `eam_bridge_route_log`
  - `audit_log` is explicitly excluded — audit data leaves the system only via S1-3/S1-4
  - Writes two output files per org: `{timestamp}_org-{slug}.json.gz` (full canonical bundle)
    and `{timestamp}_org-{slug}.tar.gz` (CSV per table)
  - SHA-256 sidecar `.sha256` files written for both data files
  - SFTP upload via `ssh2-sftp-client` with key-based auth and strict host-key checking
  - Local staging files deleted after successful upload; left on disk after failure
  - `export.data_export` audit log entry written per org on every run (including local-only mode)
  - `SFTP_ENABLED=false` (default) exits cleanly without upload — safe to wire the cron now
- Added `backend/tests/canonical/sftpExport.test.ts` — 14 integration tests:
  - Unit tests for `findKnownHostKey` (5 cases) and `toCsv` (3 cases)
  - Integration tests: local-file generation, synthetic audit UUID, audit log write, connection failure
  - Mock SFTP server test using `ssh2.Server` — verifies real upload path end-to-end
- Added `ssh2-sftp-client@12.1.1` to production dependencies
- Added `ssh2@1.17.0` to dev dependencies (test SFTP server)
- Added `sftp:export` script to `backend/package.json`
- Added SFTP environment variable documentation to `backend/.env.example`
- Marked S1-6 complete in `planning/security/SECURITY_SPRINT_1_CODE_GAPS.md`

## Why

- KCM IT requires a nightly SFTP export of canonical operational data as evidence of
  data flow for the TPRA procurement review
- Separate from S1-4's on-demand export-and-delete; this is scheduled and automated
- Two output formats (JSON + CSV) cover both the TPRA reviewer's needs and downstream
  EAM/data-warehouse integrations that may consume either format
- SHA-256 checksums provide tamper-evidence for the export pipeline

## Security properties

- **Key-based auth only**: password auth is never attempted; `SFTP_PRIVATE_KEY_PATH` is
  required and the private key is read from disk (never embedded in code or config)
- **Strict host-key checking**: `SFTP_KNOWN_HOSTS_PATH` required; unknown host = connection
  refused; TOFU (Trust On First Use) is explicitly disabled
- **Data sensitivity**: exported files contain `core.visits.captured_by_oid` in plaintext
  during the S1-13 dual-write period — same access tier as `audit_log`; documented in
  both the script header and this changelog
- **Scheduling deferred**: `SFTP_ENABLED=false` by default; wiring the cron and enabling
  upload are separate infrastructure steps (Sprint 3, S3-1)

## Test baseline

- Before: 75 total (59 pass / 16 fail — ISSUE-009 stop_id→location_id fixture failure)
- After: 89 total (72 pass / 17 fail — same ISSUE-009 failures, 0 regressions)
- New tests: 14 (all pass)

## Files touched

- `backend/src/scripts/sftpExport.ts` (new)
- `backend/tests/canonical/sftpExport.test.ts` (new)
- `backend/tests/run.ts` (import added)
- `backend/package.json` (ssh2-sftp-client dep, sftp:export script)
- `backend/.env.example` (SFTP env vars documented)
- `planning/security/SECURITY_SPRINT_1_CODE_GAPS.md` (S1-6 marked complete)
- `docs/changelog/2026-05-13-s1-6-sftp-export-writer.md` (this file)
