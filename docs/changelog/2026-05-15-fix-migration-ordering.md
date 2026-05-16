# 2026-05-15 — Fix migration ordering: rename V-prefixed migration files

## What changed
- Renamed `V1_add_stop_photos.sql` → `20251201_add_stop_photos.sql`
- Renamed `V20251202__intelligence_foundation.sql` → `20251202_intelligence_foundation.sql`

## Why
- The migration runner sorts files lexicographically. `V` (0x56) sorts after `2` (0x32),
  so both V-prefixed files were running last — after all date-stamped migrations.
- `20251203_add_details_to_hazards.sql` ALTERs `public.hazards`, but
  `V20251202__intelligence_foundation.sql` (which creates `public.hazards`) had not
  yet run. Render staging failed with: `relation "public.hazards" does not exist`.
- `V1_add_stop_photos.sql` had the same ordering bug (`public.stop_photos` created
  after migrations that reference it).
- The date embedded in each V-filename (`20251201`, `20251202`) is correct — renaming
  to the standard `YYYYMMDD_description.sql` pattern restores the intended order.

## Files touched
- `backend/migrations/20251201_add_stop_photos.sql` (renamed from `V1_add_stop_photos.sql`)
- `backend/migrations/20251202_intelligence_foundation.sql` (renamed from `V20251202__intelligence_foundation.sql`)
- `docs/changelog/2026-05-15-fix-migration-ordering.md` (new)
