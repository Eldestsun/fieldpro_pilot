# DQ-3 Geometry / Asset-Linkage Write-Path Investigation

> **Type:** Bounded, read-only fact-gather. No code or schema changed.
> **Date:** 2026-06-13
> **Dispatched by:** ISSUE-031 DQ-3 gate
> (`2026-06-11-issue-031-dq-decisions.md` §DQ-3 — "verify before sizing").
> **Question:** Is there any live write path that mutates `transit_stops`
> geometry (`lat`/`lon`/`location`) or `transit_stops.asset_id` /
> `transit_stop_assets` linkage **after seed**? Enumerate every such path.
> **Companion facts:** calibration record D6 (`transit_stop_assets`
> seed/migration/trigger-only) and `docs/KNOWN_ISSUES.md` ISSUE-024
> (the `sync_transit_stop_primary_asset` trigger `org_id` defect).

---

## Bottom line (sizing verdict)

**Geometry (`lat`/`lon`) and asset-linkage (`transit_stops.asset_id` /
`transit_stop_assets`) are seed / ingestion-only. There is no live edit path.**

The DQ-3 adapter→canonical re-translation is therefore a **thin on-change hook,
not a subsystem.** At runtime today it would fire **zero times** — nothing in the
running application writes geometry or `asset_id`, and nothing writes
`transit_stop_assets` at all. The re-translation need only cover the
seed/ingestion path (and any *future* admin geometry-edit surface, which does not
exist yet). This matches and strengthens the DQ-3 hypothesis: "if geometry/linkage
never changes post-seed in practice, the re-translation path is a thin on-change
trigger, not a subsystem."

The prime suspect named in the gate — the ISSUE-024 trigger
`sync_transit_stop_primary_asset` — was inspected in full. It fires only on
`asset_id` (not geometry), and its own latent `org_id` defect is positive evidence
that **no runtime path exercises it** (if one did, it would already be throwing a
NOT NULL violation in production).

---

## Findings (per the dispatch's five questions)

### 1. Does any live TypeScript path mutate geometry (`lat`/`lon`) or `asset_id` on `transit_stops`? — **NO.**

Every TypeScript write to `transit_stops` was enumerated. None touch geometry or
`asset_id`:

| Path | Columns written | Geometry / `asset_id`? |
|------|-----------------|------------------------|
| `backend/src/modules/work/stopRoutes.ts:82` | `is_hotspot` | No — flag only |
| `backend/src/modules/work/stopRoutes.ts:177` | `compactor` | No — flag only |
| `backend/src/modules/work/stopRoutes.ts:272` | `has_trash` | No — flag only |
| `backend/src/services/adminStopService.ts:138` (`updateStop`) | `pool_id` and/or `notes` only | No — `lat`/`lon` appear **only in the `RETURNING` read-back clause** (lines 152–153), never in `SET` |
| `backend/src/services/adminStopService.ts:223` (`bulkUpdateStops`) | `pool_id` | No |
| `backend/src/services/adminStopService.ts:251/259/267` (`bulkUpdateStops`) | `is_hotspot` / `compactor` / `has_trash` | No — flags only |

**Confirmation of the three known flag writes:** `stopRoutes.ts:81/176/271` set
`is_hotspot` / `compactor` / `has_trash` respectively — verified to be flags, **not
geometry**, as the gate expected.

**`updateStop` is the one path that looked geometry-adjacent and is not:** it
builds its `SET` clause dynamically from only two optional fields (`pool_id`,
`notes`); `lat`/`lon` are in the `RETURNING` list so the API can echo the row back,
but they are never assignable. A grep for `transit_stops` + `asset_id` across all
of `backend/src` and `backend/scripts` returns **zero** writes.

**Non-live paths (excluded — not the running app):**
- `backend/tests/canonical/loadRouteRunById.test.ts:66/102` — test fixture
  `INSERT`/`DELETE` (stop_id, org_id, flags; no geometry, no `asset_id`).
- `backend/scripts/verify_rls.ts:30/97/117/123` — RLS-verification harness
  `INSERT`/`DELETE`. Diagnostic script, not a runtime request path.

### 2. Does any live TypeScript path write to `transit_stop_assets` outside migration/seed? — **NO.**

Every TypeScript reference to `transit_stop_assets` is a **read** or a test
assertion. No `INSERT` / `UPDATE` / `DELETE` exists in application code:
- `backend/src/intelligence/riskMapService.ts:80/95/113/140/296` — `JOIN
  transit_stop_assets` for the `asset_id → stop_id` spine lookup. Read-only.
- `backend/scripts/verify_rls.ts:242/243` — RLS read assertions. Diagnostic.

This confirms calibration D6: **no TypeScript writer.** All 14,916 rows are
written by the trigger + migration seed.

### 3. What does `sync_transit_stop_primary_asset()` do, and what fires it?

**Trigger:**
```
CREATE TRIGGER trg_sync_transit_stop_primary_asset
AFTER INSERT OR UPDATE OF asset_id ON public.transit_stops
FOR EACH ROW EXECUTE FUNCTION sync_transit_stop_primary_asset()
```
It fires **only on `INSERT` or `UPDATE OF asset_id`** — **not** on geometry
(`lat`/`lon`) changes. A geometry-only `UPDATE` does not invoke it.

**Function body (verified live):** maintains the primary link row in
`transit_stop_assets`:
- If `NEW.asset_id IS NULL` → deactivate any existing `active` primary for the
  stop, return.
- Else → deactivate any *other* active primary for the stop, then
  `INSERT INTO public.transit_stop_assets (stop_id, asset_id, role, active)
  VALUES (NEW.stop_id, NEW.asset_id, 'primary', true)
  ON CONFLICT (stop_id, asset_id, role) WHERE active = true DO UPDATE SET
  active = true, updated_at = now()`.

**The ISSUE-024 defect is confirmed in the live definition:** the `INSERT` omits
`org_id`, which is `NOT NULL` with no default on `transit_stop_assets`. Any runtime
`asset_id` write would throw `null value in column "org_id" ... violates not-null
constraint`. The fact that production is *not* throwing this is direct evidence
that **no runtime path sets `asset_id`** — geometry/linkage is seed-only, exactly
the fact DQ-3 needed.

### 4. Are there any other triggers on these tables? — **NO.**

- `transit_stops`: exactly one non-internal trigger,
  `trg_sync_transit_stop_primary_asset` (above). `tgenabled = 'O'` (enabled).
- `transit_stop_assets`: **zero** non-internal triggers.

### 5. Migrations — any post-seed `UPDATE` on geometry / `asset_id`? — **NO.**

A grep for `UPDATE ... transit_stops` across all of `backend/migrations/` returns
**empty**. Geometry and `asset_id` enter `transit_stops` only at **seed**:
- `migrations/legacy_20251222_phase5c_create_transit_stops.sql` — the seed `INSERT`
  populating `lon`, `lat`, `asset_id` (and other columns) from staging.
- `migrations/legacy_20251222_phase5c_escape_hatch.sql` — backfills
  `transit_stop_assets` from `transit_stops.asset_id` at seed time.

The canonical-spine backfill
(`legacy_20261226_core_backfill_coreLocations_...sql` and
`legacy_20260514_seed_core_location_external_ids.sql`) **reads** `ts.lon`/`ts.lat`
to populate `core.locations` — it does not write back to `transit_stops`. This is
the existing one-time adapter→canonical geometry translation; DQ-3 makes it
on-change instead of one-shot.

**Row-count baseline:** `transit_stops` = 14,916; `transit_stop_assets` = 14,916
(1:1, consistent with one primary link per stop from seed).

---

## What this means for DQ-3 sizing

1. **Re-translation is an ingestion-time hook, not a live-edit subsystem.** Because
   geometry and `asset_id` change only via seed/ingestion, the canonical spine
   (`core.locations` / `core.asset_locations`) can be kept current by re-running
   the adapter→canonical translation **at the ingestion boundary** — there is no
   stream of live edits to debounce, queue, or reconcile.

2. **A trigger mirroring `sync_transit_stop_primary_asset`'s shape is the natural
   form** if an on-change DB hook is wanted: `AFTER INSERT OR UPDATE OF
   lat, lon, asset_id ON transit_stops` → re-translate that stop's
   `core.locations` / `core.asset_locations` rows. It would fire only when
   ingestion actually changes those columns.

3. **The ISSUE-024 `org_id` fix is a prerequisite for any future `asset_id` write
   path** (re-seed, admin edit, or the re-translation trigger if it ever writes
   back through `transit_stops`). The DQ-3 re-translation does **not** write
   `transit_stops`, so it does not itself trip ISSUE-024 — but the two should be
   sequenced together if a runtime `transit_stops` ingestion path is introduced,
   per D6.

4. **No admin geometry-edit surface exists.** If one is later built (e.g. "correct
   a stop's coordinates"), it becomes the *first* live geometry write and must
   carry the re-translation hook + the ISSUE-024 fix. Today it is out of scope.

**Verdict for the migration-sequence artifact:** size DQ-3 as a **thin on-change
re-translation hook at the ingestion boundary**, not a subsystem. The single
remaining DQ-3 gate is now satisfied.

---

## Side note — DQ-5 KNOWN_ISSUES backfill (out of scope; reported, not actioned)

The dispatch asked me to check whether `docs/KNOWN_ISSUES.md` entries for
ISSUE-027 through ISSUE-031 are missing (DQ-5 states they are "missing entirely").

**They are present**, not missing — ISSUE-027 (line 605), ISSUE-028 (626),
ISSUE-029 (647), ISSUE-030 (665), ISSUE-031 (687), and ISSUE-024–026 are all in
the file. The backfill DQ-5 calls for **appears already done** (consistent with the
merged commit `59a7fb7` "Merge sec/mcp-readonly-revoke" / the
`chore/known-issues-027-031-backfill` branch in recent history). The DQ-5 "missing
entirely" claim, sourced from the 2026-06-11 audit, is **stale**. No backfill needs
to be dispatched. Per the dispatch instruction, I changed nothing here — flagging
only.

---

## Method / evidence

- **Codebase:** `grep` over `backend/src`, `backend/scripts`, `frontend` for every
  `INSERT`/`UPDATE`/`DELETE` and column reference on `transit_stops` /
  `transit_stop_assets`; read of `adminStopService.ts:110–199` and
  `stopRoutes.ts:75–94`.
- **Live DB (postgres MCP):** `pg_get_triggerdef` on both tables;
  `pg_get_functiondef` on `sync_transit_stop_primary_asset`; row counts.
- **Migrations:** `grep` over `backend/migrations/` for `UPDATE transit_stops` and
  for `lat`/`lon`/`location`/`asset_id` proximity.
- **Read-only:** no schema, code, or data changed.
