# 2026-05-15 — Fix assets.attributes column missing on partial-state Render DB

## What changed
- Added two `ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS` guards in
  `00000000_consolidated_schema.sql`, immediately after the `CREATE TABLE IF NOT EXISTS`
  block for `public.assets`:
  - `attributes jsonb DEFAULT '{}'::jsonb NOT NULL`
  - `external_id text`

## Why
- Render was failing with: `column "attributes" of relation "public.assets" does not exist`
- Root cause: Render's DB already had `public.assets` from an earlier partial deployment
  that pre-dated the Tier-8 migration (`legacy_20260512_tier8_asset_abstraction.sql`),
  which is the migration that originally added `attributes` and `external_id` via
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- Because the table already existed, `CREATE TABLE IF NOT EXISTS public.assets` was a
  no-op. The `attributes` column was never added. The subsequent
  `COMMENT ON COLUMN public.assets.attributes` then failed with the column-not-found error.
- The `ADD COLUMN IF NOT EXISTS` guards are no-ops when the table was just created
  (fresh DB), and add the missing columns when the table pre-existed without them.

## Files touched
- `backend/migrations/00000000_consolidated_schema.sql`
- `docs/changelog/2026-05-15-fix-assets-attributes-column.md` (new)
