# 2026-07-11 — SEAM-B-R1: /overview hazards tile repointed to derived presence set (silent-zero drift closed) + /routes debug dump removed

## What changed
- Deleted the local `SAFETY_HAZARD_OBSERVATION_TYPES` array in
  `controlCenterRoutes.ts` (byte-copied from `adminRoutes.ts` during the SEAM-B
  extraction). Its `access_blocked_present` entry never matched what the write
  path emits: `SAFETY_HAZARD_TYPE_MAP` (observationService.ts) maps
  `access_blocked → 'access_blocked'` (bare, no `_present` suffix — the only
  such entry), so every access-blocked hazard report was silently excluded from
  the `/ops/control-center/overview` `hazards_reported` tile while the sibling
  `/exceptions` endpoint (which uses the derived set) counted it.
- Repointed the `/overview` hazard aggregation to `SAFETY_PRESENCE_TYPES`
  (presenceTaxonomy.ts) — derived from the write map itself and pinned by
  `presenceTaxonomy.test.ts` — so `/overview` and `/exceptions` now resolve the
  SAME type set and the read side structurally cannot drift from the writer.
- Removed the `/routes` handler's `console.log("[ControlCenter:Routes] rows =",
  result.rows)` — an inert full-rowset debug dump to stdout on every request.
- Added regression test `ccOverviewAccessBlockedDrift.test.ts`: seeds one
  access-blocked hazard through the real write path (field-wizard UI key
  `"traffic"` → `normalizeSafetyKey` → `access_blocked` → written type
  `'access_blocked'`) and asserts the `/overview` tile counts it (+1 delta).
  Committed red-first: fails against the pre-fix handler (179/180), green at
  the fix commit (180/180). Also pins that the derived set contains
  `access_blocked` and not `access_blocked_present`.

## Why
- Pre-shadow cleanup (SEAM-B-R1 card): a tile real supervisors watch could read
  zero forever for a whole hazard category — falsifies the CC's operational
  claim during the shadow operation.
- The drifted local array was the ONLY read site not derived from the write
  map; deleting it closes the class of bug, not just the instance.
- Debug rowset dumps don't belong on a production request path.

## Files touched
- `backend/src/modules/admin/controlCenterRoutes.ts`
- `backend/tests/canonical/ccOverviewAccessBlockedDrift.test.ts` (new)
- `backend/tests/run.ts` (test registration)
- `docs/changelog/bugfix/2026-07-11-seam-b-r1-cc-overview-presence-drift.md` (this file)

## Scope guard (per ruling: direction (a), read side only)
- NOT touched: `observationService.ts` write map, `presenceTaxonomy.ts`,
  `presenceTaxonomy.test.ts` (drift guard), `cleanLogService.ts:210`,
  `riskMapService.ts:192` (the three correct read sites).
