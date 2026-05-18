# 2026-05-14 — S2-6 Log Retention Policy

## What changed
- Created `docs/security/log-retention-policy.md` — BASELINE's formal log retention policy (S2-6)
  - Retention periods for all four log categories: `audit_log` (≥ 1 year), application logs (90 days), Azure Entra sign-in logs (platform-controlled), SFTP export files (KCM-controlled)
  - Storage mechanism documented for demo posture (primary PostgreSQL DB, append-only RLS) and Azure commercial pilot posture (Flexible Server + Azure Monitor + optional S3-compatible archival for >90-day entries)
  - Access controls during retention: Admin role only; audit log reads are themselves audited
  - Deletion procedure: export-and-delete endpoint (S1-4) with confirmation token; pre-deletion export + `audit.purge` event write resolves the audit-log deletion bootstrapping problem; physical deletion requires IT-provisioned DB-level access
  - Legal hold procedure: all deletion suspended for held records until written release from KCM Legal
  - Washington State records schedule alignment: 1-year conservative minimum pending KCM records retention officer confirmation of applicable GS category (likely GS 50-05-020)

## Why
- Security Sprint 2, item S2-6: KCM IT and the TPRA evaluator require a documented log retention policy confirming that audit trail data is available for the duration of any compliance investigation
- Policy must align with RCW 40.14 (state records retention) and reflect what was actually built in S1-1 and S1-2
- Hosting-independent: policy is valid at demo posture and scales to Azure commercial pilot

## Files touched
- `docs/security/log-retention-policy.md` (new)
- `docs/changelog/2026-05-14-s2-6-log-retention-policy.md` (this file)
