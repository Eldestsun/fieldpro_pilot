# Q-A/B Spine Inversion — Phase 0 Investigation Plan

> **Type:** Investigation artifact + migration plan. No schema or code changes in this document.
> **Date:** 2026-06-13
> **Issue:** ISSUE-031 — canonical migration / work-attribution clip
> **Phase:** Q-A/B (migration-sequence §2, P2)
> **Branch:** `docs/issue-031-qab-spine-inversion-plan`

---

## §1 Executive Summary

**Coverage:** Confirmed exact — 14,916 rows in `core.asset_locations`, `core.locations`, `core.location_external_ids`, and `transit_stop_assets`. Stop-condition (coverage gap gates the inversion) **does not trigger.** Proceed.

**Golden diff:** Zero disagreement in either direction. The canonical path (`asset_id → core.asset_locations → location_id → core.location_external_ids → stop_id`) produces a byte-identical asset↔stop mapping vs. the adapter path (`transit_stop_assets`). The repoint is data-safe.

**Sole live reader:** `backend/src/intelligence/riskMapService.ts` (5 `transit_stop_assets` joins inside `rebuildStopRiskSnapshot()`). Zero frontend readers. Seed/test/verify_rls scripts not in scope.

**RLS:** All three tables carry the identical fail-open `org_isolation` policy (`USING(true)`). `fieldpro` is non-BYPASSRLS. Repoint is RLS-neutral.

**New prerequisites:** None. All canonical tables are fully populated with correct indexes. No new cards needed.

---

## §2 Live Reader Inventory

### A. `transit_stop_assets` — 5 live joins (all in `rebuildStopRiskSnapshot()`)

File: `backend/src/intelligence/riskMapService.ts`

| # | CTE / site | Direction | Purpose |
|---|-----------|-----------|---------|
| 1 | `l3` CTE (~L80) | `asset_id → stop_id` | Translate `core.visits.primary_asset_id` to `stop_id` for visit recency grouping |
| 2 | `trash` CTE (~L95) | `asset_id → stop_id` | Translate `core.observations.asset_id` to `stop_id` for trash volume grouping |
| 3 | `haz` CTE (~L113) | `asset_id → stop_id` | Translate `core.observations.asset_id` to `stop_id` for hazard signal grouping |
| 4 | `infra` CTE (~L140) | `asset_id → stop_id` | Translate `core.observations.asset_id` to `stop_id` for infrastructure score grouping |
| 5 | `stop_condition_history` INSERT (~L296) | `stop_id → asset_id` | Reverse: resolve `stop_risk_snapshot.stop_id` to `tsa.asset_id` for history row |

**Exact join patterns:**

Forward (CTEs 1–4, asset_id→stop_id):
```sql
JOIN transit_stop_assets tsa
  ON tsa.asset_id = <v.primary_asset_id or o.asset_id>
 AND tsa.active = TRUE
 AND tsa.role = 'primary'
GROUP BY tsa.stop_id
```

Reverse (CTE 5, stop_id→asset_id):
```sql
JOIN transit_stop_assets tsa
  ON tsa.stop_id = srs.stop_id
 AND tsa.active = TRUE
 AND tsa.role = 'primary'
-- tsa.asset_id then used in the INSERT
```

### B. `transit_stops` — 1 live read (`base` CTE, ~L64). **Stays unchanged post-inversion.**

```sql
FROM transit_stops ts
WHERE ts.pool_id IS NOT NULL
  AND (ts.has_trash = TRUE OR ts.compactor = TRUE)
```

Reads: `stop_id`, `is_hotspot`, `org_id` (operational flags). Per ADR Q-A/B: `transit_stops` demotes to *"vertical ingestion source + operational flags"* — the `base` CTE reads operational flags and is not a target for spine inversion.

### C. Non-live uses (out of scope)

| File | Use | Why out of scope |
|------|-----|-----------------|
| `backend/tests/canonical/loadRouteRunById.test.ts:102` | `DELETE FROM transit_stops WHERE stop_id = $1` | Test teardown only |
| `backend/scripts/seed_transit_assets.ts` | Seed script | Not live application code |
| `backend/scripts/verify_rls.ts` | RLS policy assertions | Not live application code |
| `rebuildStopRiskSnapshotLegacy()` in riskMapService.ts | Legacy additive-verification function | Preserved verbatim under Tier 2 additive discipline; deleted wholesale when verification window closes, not modified |

---

## §3 Coverage and Golden-Diff Verification (Live DB)

### Row counts

| Table | Count | Match |
|-------|-------|-------|
| `transit_stop_assets` | 14,916 | — |
| `core.asset_locations` | 14,916 | ✅ |
| `core.locations` | 14,916 | ✅ |
| `core.location_external_ids` | 14,916 | ✅ |

**Coverage verdict:** Exact match across all four tables. Stop-condition does NOT trigger.

### Golden diff

Canonical path (`core.asset_locations` JOIN `core.location_external_ids`) vs. adapter path (`transit_stop_assets`): **zero rows in exclusive-to-adapter; zero rows in exclusive-to-canonical.** The asset↔stop mapping is identical under both paths.

### Fan-out check

Zero duplicate `asset_id` values in `core.asset_locations`. All live `primary_asset_id` values used by the risk job resolve to exactly one `stop_id` under both paths. No JOIN fan-out risk.

---

## §4 RLS Posture

All three tables (`transit_stop_assets`, `core.asset_locations`, `core.location_external_ids`) carry the **identical** `org_isolation` RLS policy:
- `USING (true)` — fail-open, no org filtering at the policy level
- `WITH CHECK (true)` — fail-open on write
- All three tables have `FORCE ROW LEVEL SECURITY`

`fieldpro` is non-BYPASSRLS. The risk job (`rebuildStopRiskSnapshot`) runs bare-pool with no `SET LOCAL app.current_org_id` — it reads cross-org today via fail-open. The repoint to `core.asset_locations + core.location_external_ids` inherits the **exact same posture**. This is an RLS-neutral change.

---

## §5 Translation Seam (Contamination Rule — ADAPTER_BOUNDARY.md §5)

The Contamination Rule: *"A canonical layer query is contaminated if it uses a transit-vertical table as a join condition or filter, rather than as a one-time translation lookup."*

`transit_stop_assets` is currently tolerated as a one-hop translation join but is explicitly the state the spine inversion migrates away from (ADAPTER_BOUNDARY.md §5, third row in the verdict table).

**Replacement uses canonical tables only** (`core.asset_locations`, `core.location_external_ids`) — canonical-to-canonical joins are not contamination.

### Schema of canonical translation tables

**`core.asset_locations`:**
`id` PK · `org_id` FK · `asset_id` bigint NOT NULL (FK→`public.assets` RESTRICT) · `location_id` bigint NOT NULL (FK→`core.locations` CASCADE) · `role` text NOT NULL (all rows: `'primary'`) · `active` bool NOT NULL (all rows: `true`) · `installed_at` · `removed_at` · `notes` · `created_at`/`updated_at`
Indexes: `idx_core_asset_locations_asset(org_id, asset_id)`, `idx_core_asset_locations_location(org_id, location_id)`

**`core.location_external_ids`:**
`id` PK · `org_id` FK · `location_id` FK→`core.locations` CASCADE · `source_system` text NOT NULL (all rows: `'metro_stop'`) · `external_id` text NOT NULL (= transit `stop_id`) · `created_at`
UNIQUE `(org_id, source_system, external_id)` · 14,916 rows, one per transit stop

### Replacement query patterns

**Forward direction** (asset_id → stop_id — CTEs `l3`, `trash`, `haz`, `infra`):

```sql
-- BEFORE (adapter path, tolerated today, removed by Q-A/B)
JOIN transit_stop_assets tsa
  ON tsa.asset_id = <source>.asset_id
 AND tsa.active = TRUE
 AND tsa.role = 'primary'
GROUP BY tsa.stop_id

-- AFTER (canonical path)
JOIN core.asset_locations al
  ON al.asset_id = <source>.asset_id
 AND al.active = TRUE
 AND al.role = 'primary'
JOIN core.location_external_ids lei
  ON lei.location_id = al.location_id
 AND lei.source_system = 'metro_stop'
GROUP BY lei.external_id   -- lei.external_id IS the stop_id
```

Note: `stop_risk_snapshot` and `stop_condition_history` continue to use `stop_id` as their key. The output key does not change — only the join path that resolves it.

**Reverse direction** (stop_id → asset_id — `stop_condition_history` INSERT):

```sql
-- BEFORE (adapter path)
JOIN transit_stop_assets tsa
  ON tsa.stop_id = srs.stop_id
 AND tsa.active = TRUE
 AND tsa.role = 'primary'
-- uses: tsa.asset_id

-- AFTER (canonical path)
JOIN core.location_external_ids lei
  ON lei.external_id = srs.stop_id
 AND lei.source_system = 'metro_stop'
JOIN core.asset_locations al
  ON al.location_id = lei.location_id
 AND al.active = TRUE
 AND al.role = 'primary'
-- uses: al.asset_id
```

---

## §6 Ordered Migration Steps

All code changes in this plan target `backend/src/intelligence/riskMapService.ts`.
Each step is dispatched as its own focused session. No step starts until the previous step's CI passes.

### Step 1 — Repoint forward-direction CTEs (l3, trash, haz, infra)

**Pre-condition:** `grep -c 'transit_stop_assets' backend/src/intelligence/riskMapService.ts` = `5`

**Change (Code session):**
Replace the 4 forward-direction `JOIN transit_stop_assets tsa ON tsa.asset_id = ... GROUP BY tsa.stop_id` patterns with the canonical `al + lei` pattern above. CTEs `l3`, `trash`, `haz`, `infra`.

**Post-condition:**
- Inverted grep confirms 0 of these 4 occurrences remain in forward-direction form
- `rebuildStopRiskSnapshot()` unit test passes (row count for stop_risk_snapshot ≥ 0; shape unchanged)
- `stop_risk_snapshot` row count in dev: same as before (0 today = expected, seed data sparse)

**Additive discipline:** Do not remove `transit_stop_assets` from the legacy function `rebuildStopRiskSnapshotLegacy()` — that function is untouched.

---

### Step 2 — Repoint reverse-direction join (stop_condition_history INSERT)

**Pre-condition:** Step 1 merged and CI green.

**Change (Code session):**
Replace the reverse-direction `JOIN transit_stop_assets tsa ON tsa.stop_id = srs.stop_id` in the `stop_condition_history` INSERT block with the canonical `lei + al` pattern above.

**Post-condition:**
- `grep -c 'transit_stop_assets' backend/src/intelligence/riskMapService.ts` = `1` (only legacy function remains)
- Full test suite passes

---

### Step 3 — Confirm zero live readers in riskMapService.ts (verification milestone)

After Steps 1+2 are merged and CI is green, the canonical live path owns `rebuildStopRiskSnapshot()`. `transit_stop_assets` has **1 remaining reference in that file** — the legacy function only.

**Verification:**
```bash
grep -n 'transit_stop_assets' backend/src/intelligence/riskMapService.ts
# Expected: only lines inside rebuildStopRiskSnapshotLegacy() (line range ~325–420)
```

**No code change.** This is a verification milestone, not a step.

---

### Step 4 — Update ADAPTER_BOUNDARY.md (docs-only)

**Change (Code or Cowork session):**
In `planning/architecture/ADAPTER_BOUNDARY.md` §5, update the `transit_stop_assets` tolerated-today note from:
> "⚠️ Tolerated *today* — one-hop translation, but vertical-dependent; the spine inversion removes it (ADR Q-A/Q-B)"

To:
> "✅ Removed — spine inversion complete (Q-A/B). No live application readers. `transit_stop_assets` is now ingestion-only."

Also update §2 `transit_stop_assets` table row to reflect ingestion-only status.

**Post-condition:** Docs committed and pushed; no test impact.

---

### Step 5 — Gate for table drop (not in this phase)

After Step 3, `transit_stop_assets` has zero live application readers. Its `DROP` is gated on ISSUE-031 **P6 (table drops)**, which requires ALL phases complete and a separate explicit Founder-Decision sign-off. This card does not execute the drop. It flags `transit_stop_assets` as a P6 drop candidate.

Notion action (Cowork): Add a comment to the ISSUE-031 board Q-A/B card noting `transit_stop_assets` is zero-reader post-merge and is queued for P6 drop.

---

## §7 Stop-Condition Result

**Coverage was confirmed exact (14,916 rows, zero gap).** Stop-condition does not trigger. Migration proceeds as planned.

---

## §8 Open Questions / Gaps Surfaced

### OQ-1: Legacy function and transit_stops operational flags

The `base` CTE in `rebuildStopRiskSnapshotLegacy()` also reads `transit_stops` for operational flags. This is untouched — the legacy function is deleted wholesale when the Tier 2 additive verification window closes, not modified piecemeal.

**Action:** None for Q-A/B. The legacy function deletion is tracked under Tier 2 additive discipline.

### OQ-2: Operational flags long-term home

`transit_stops` columns `is_hotspot`, `has_trash`, `compactor`, `pool_id` are read by the `base` CTE of `rebuildStopRiskSnapshot()` for scoring logic. Post-inversion, transit_stops remains as the source for these. If/when transit_stops is eventually retired (not planned in ISSUE-031), these flags would need a canonical home.

**Action:** Not a Q-A/B concern. Note for future architecture. Flag as OQ if a transit_stops retirement card is ever filed.

### OQ-3: `v_stop_location_map` live use

`core.v_stop_location_map` is used by `riskMapService.ts` for the stop-location translation seam reference but is not a join hop in the canonical intelligence CTEs. It backs `v_locations_transit` (write-side translation). These views are slated for eviction under D3 (CANON-1), not under Q-A/B.

**Action:** None for Q-A/B. D3 sequencing is governed by T1-CC (see migration-sequence §4.1).

---

## Appendix: Verified DB Queries (2026-06-13)

```sql
-- Coverage
SELECT
  (SELECT COUNT(*) FROM transit_stop_assets) AS tsa_count,
  (SELECT COUNT(*) FROM core.asset_locations) AS al_count,
  (SELECT COUNT(*) FROM core.locations) AS loc_count,
  (SELECT COUNT(*) FROM core.location_external_ids) AS lei_count;
-- Result: 14916 / 14916 / 14916 / 14916

-- Golden diff (adapter-only rows)
SELECT COUNT(*) FROM transit_stop_assets tsa
WHERE NOT EXISTS (
  SELECT 1 FROM core.asset_locations al
  JOIN core.location_external_ids lei ON lei.location_id = al.location_id
  WHERE al.asset_id = tsa.asset_id AND lei.external_id = tsa.stop_id
);
-- Result: 0

-- Golden diff (canonical-only rows)
SELECT COUNT(*) FROM core.asset_locations al
JOIN core.location_external_ids lei ON lei.location_id = al.location_id
WHERE NOT EXISTS (
  SELECT 1 FROM transit_stop_assets tsa
  WHERE tsa.asset_id = al.asset_id AND tsa.stop_id = lei.external_id
);
-- Result: 0

-- Fan-out check
SELECT COUNT(*) FROM (
  SELECT asset_id FROM core.asset_locations GROUP BY asset_id HAVING COUNT(*) > 1
) dups;
-- Result: 0
```
