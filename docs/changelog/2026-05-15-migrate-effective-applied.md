# 2026-05-15 — Migration runner: effectivelyApplied compatibility set

## What changed
- `backend/src/scripts/migrate.ts`: added `effectivelyApplied` augmented set
  and `hasPreRenameEntries` detection to the migration runner.

## Why
- After the `legacy_` prefix rename, any DB that had previously run the old
  filenames (e.g. `20251201_add_stop_photos.sql`) would have those names in
  `schema_migrations`. The runner would then see `legacy_20251201_add_stop_photos.sql`
  as unapplied and attempt to re-run it — failing because the table already exists.
- `effectivelyApplied` auto-marks `legacy_X` as applied whenever `X` is already
  recorded, preventing double-execution on existing DBs.
- `hasPreRenameEntries` lets the runner treat a DB that ran the old per-file
  sequence as equivalent to one that ran the consolidated schema, so legacy files
  are skipped on both fresh and pre-existing deployments.

## Files touched
- `backend/src/scripts/migrate.ts`
- `docs/changelog/2026-05-15-migrate-effective-applied.md` (new)
