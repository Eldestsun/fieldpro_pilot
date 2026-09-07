# 2026-09-07 — ISSUE-024: sync_transit_stop_primary_asset made org-aware

## What changed
- Migration `20260907_issue024_sync_trigger_org_id.sql` (idempotent
  `CREATE OR REPLACE FUNCTION`; trigger binding unchanged): the
  `transit_stop_assets` link INSERT now carries `NEW.org_id` (previously
  omitted → NOT NULL violation on every trigger fire), and both deactivation
  UPDATEs are scoped `AND org_id = NEW.org_id` — under an org-scoped app
  connection RLS already constrains them, but the explicit predicate makes the
  trigger correct under BYPASSRLS callers (seeds, migrations) too, closing the
  RLS-TSA multi-org concern at the root.
- 3 regression tests (`tests/canonical/issue024SyncTrigger.test.ts`): setting
  `asset_id` creates an org-carrying active primary link; re-setting the same
  value self-heals via ON CONFLICT with no duplicate; clearing `asset_id`
  deactivates the link. Self-cleaning synthetic stop.
- `docs/KNOWN_ISSUES.md` ISSUE-024 entry → Fixed, with a correction: the
  recorded claim that the ON CONFLICT arbiter "does not self-heal inside
  plpgsql" was disproven by the regression test — the arbiter works; the
  org_id NOT NULL violation was masking it.

## Why
- Latent production defect: any runtime write setting `transit_stops.asset_id`
  crashed the statement. Stops were historically bulk-loaded so no runtime path
  hit it, but the CI seed had to disable the trigger to seed asset-linked
  fixture stops, and any future stop-management surface (e.g. the T2-A2 admin
  panel growing asset assignment) would have tripped it immediately.

## Deliberately not in scope
- The CI seed's trigger-disable workaround stays (harmless either way);
  retiring it plus the broader multi-org recon is the RLS-TSA card's remaining
  scope. This fix removes that card's root defect.

## Files touched
- `backend/migrations/20260907_issue024_sync_trigger_org_id.sql` (new)
- `backend/tests/canonical/issue024SyncTrigger.test.ts` (new) + `backend/tests/run.ts`
- `docs/KNOWN_ISSUES.md` (ISSUE-024 → Fixed)
- `docs/changelog/bugfix/2026-09-07-issue-024-sync-trigger-org-id.md` (this entry)

## Verification
- Migration runner-applied + recorded on dev in the same step. Backend suite
  212/212 (3 new). Clean-room gate via CI on the PR (fresh DB → full chain →
  suite; the seed still exercises its own path, the new tests exercise the
  fixed trigger under the normal role).
