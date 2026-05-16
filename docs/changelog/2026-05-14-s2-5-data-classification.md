# 2026-05-14 — S2-5 Data Classification Document for Exports

## What changed
- Created `docs/security/data-classification.md` — BASELINE data classification document (S2-5)

## Why
- Required security policy artifact for KCM IT security review and TPRA submission
- Establishes classification levels (Public / Internal / Confidential / Restricted) and inventories all data categories
- Documents the structural worker privacy guarantee as a verifiable schema fact: `stop_effort_history`, `stop_condition_history`, and `core.observations` contain no `user_id` column
- Documents `captured_by_oid` access model (KMS-encrypted, separate access tier, no operational UI surface)
- Provides export controls summary and data residency statement for all three hosting postures

## Files touched
- `docs/security/data-classification.md` (created)
- `docs/changelog/2026-05-14-s2-5-data-classification.md` (this file)
