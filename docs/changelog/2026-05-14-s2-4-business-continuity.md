# 2026-05-14 — S2-4 Business Continuity Summary

## What changed
- Created `docs/security/business-continuity.md` — BASELINE business continuity summary (S2-4)

## Why
- Required security policy artifact for KCM IT review and TPRA submission
- Documents current demo posture honestly: no formal SLA, provider-default daily snapshots, 7-day retention, no HA
- Defines RTO and RPO for all three failure scenarios (DB failure, app server failure, total environment loss)
- Provides step-by-step restore procedures specific enough for a technical operator to execute
- Documents offline mode (offlineQueue.ts) as a compensating control for backend outages during active shifts
- Specifies hosting upgrade path (Azure commercial) with contractual SLA figures (99.99% DB, 99.95% app, ~99.94% composite)
- Notes S3-2 (managed DB backup config) as an open dependency for photo backup RPO

## Files touched
- `docs/security/business-continuity.md` (created)
- `docs/changelog/2026-05-14-s2-4-business-continuity.md` (this file)
