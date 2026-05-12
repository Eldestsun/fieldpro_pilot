# Tier 2 — Intelligence Migration

> **Goal**: Migrate `riskMapService.ts` to read cleanliness, safety, and infrastructure scores from `core.observations` and `core.visits` instead of `level3_logs`, `hazards`, and `infrastructure_issues`.
>
> **Status**: 🟢 Done — 2026-05-11. Changelog: `docs/changelog/2026-05-11-tier-2-intelligence-migration.md`
> **Depends on**: Tier 1 done + Tier 4 stops-columns done
> **Blocks**: nothing

---

## Why This Tier Is Ordered This Way

`riskMapService.ts` currently builds the risk snapshot from five legacy transit tables:
- `level3_logs` — nothing writes to this in current backend code
- `trash_volume_logs` — populated via stop completion
- `hazards` — populated via skip and complete paths
- `infrastructure_issues` — populated via stop completion
- `public.stops` — queried using uppercase quoted column names (`"STOP_ID"`)

`core.observations` has 31 rows representing real canonical state (`ground_condition`, `shelter_condition`, `trash_can_condition`, etc.) but is completely ignored by intelligence.

**Two things must be true before this tier starts:**
1. Tier 1 must be done — `core.observations` must be fully and reliably populated (washed_can, transactional emit) before intelligence can migrate off legacy tables
2. Tier 4 stops-column rename must be done — the new SQL must use lowercase column names. If Tier 2 ships first it embeds the old names and Tier 4 breaks it.

---

## Files to Touch

| File | Change |
|------|--------|
| `backend/src/intelligence/riskMapService.ts` | Rewrite score derivation CTEs to read from `core.observations` and `core.visits`; update `stops` column references to lowercase |

---

## Files to Leave Alone

| File | Reason |
|------|--------|
| All auth files | Auth is frozen |
| All offline queue files | Offline contract is frozen |
| `backend/src/domains/routeRunStop/cleanLogService.ts` | Transit adapter — leave until canonical layer is verified |
| `public.level3_logs` | Do not drop — intelligence still reads it until Tier 2 is verified |
| `public.trash_volume_logs` | Do not drop — same reason |
| `public.hazards` | Do not drop — same reason |
| `public.infrastructure_issues` | Do not drop — same reason |
| `stop_risk_snapshot` table | Output table stays the same — only the source queries change |
| All frontend files | No frontend changes in this tier |

---

## Observation Type Mapping

The existing scoring model maps directly onto canonical observation types. This is the bridge:

| Current source | Current field | Canonical source | Observation type | Value field |
|----------------|--------------|-----------------|-----------------|-------------|
| `level3_logs.cleaned_at` | days since last L3 | `core.visits` where `outcome='completed'` | — | `MAX(ended_at)` per stop |
| `trash_volume_logs.volume` | recent trash volume avg | `core.observations` | `trash_volume` | `observed_value::numeric` |
| `hazards.severity`, `reported_at` | hazard score + recency | `core.observations` | `hazard_present` | `severity` in metadata or `observed_value` |
| `infrastructure_issues.severity` | infra score | `core.observations` | `infra_condition` | `observed_value::numeric` |
| `stops."STOP_ID"` | stop identity | `stops.stop_id` (after Tier 4 rename) | — | — |

---

## Change 1 — Rewrite Score CTEs to Read from `core.*`

### Before

The five CTEs in `rebuildStopRiskSnapshot`:

```sql
l3 AS (
    SELECT stop_id,
           DATE_PART('day', NOW() - MAX(cleaned_at))::int AS days_since_last_l3
    FROM level3_logs GROUP BY stop_id
),
trash AS (
    SELECT stop_id, AVG(volume)::numeric(4,2) AS recent_trash_volume_avg
    FROM trash_volume_logs
    WHERE logged_at >= NOW() - INTERVAL '7 days'
    GROUP BY stop_id
),
haz AS (
    SELECT stop_id, MAX(reported_at) AS last_hazard_at,
           MAX(severity) AS last_hazard_severity,
           DATE_PART('day', NOW() - MAX(reported_at))::int AS hazard_days_ago
    FROM hazards
    WHERE reported_at >= NOW() - INTERVAL '7 days'
    GROUP BY stop_id
),
infra AS (
    SELECT stop_id, AVG(severity)::numeric(4,2) AS infra_issue_score
    FROM infrastructure_issues
    WHERE reported_at >= NOW() - INTERVAL '30 days'
    GROUP BY stop_id
)
```

And the base CTE uses:
```sql
SELECT "STOP_ID" AS stop_id, is_hotspot FROM stops WHERE ...
```

### After

Replace the four legacy CTEs with canonical equivalents. The `base` CTE stop column rename is covered by Tier 4 — use `stop_id` (lowercase) after that migration.

```sql
-- Days since last completed visit for this stop (replaces level3_logs)
l3 AS (
    SELECT rrs.stop_id,
           DATE_PART('day', NOW() - MAX(v.ended_at))::int AS days_since_last_l3
    FROM core.visits v
    JOIN route_run_stops rrs ON rrs.id = v.route_run_stop_id
    WHERE v.outcome = 'completed'
      AND v.ended_at IS NOT NULL
    GROUP BY rrs.stop_id
),
-- Trash volume from canonical observations (replaces trash_volume_logs)
trash AS (
    SELECT rrs.stop_id,
           AVG(o.observed_value::numeric)::numeric(4,2) AS recent_trash_volume_avg
    FROM core.observations o
    JOIN core.visits v ON v.id = o.visit_id
    JOIN route_run_stops rrs ON rrs.id = v.route_run_stop_id
    WHERE o.observation_type = 'trash_volume'
      AND o.observed_at >= NOW() - INTERVAL '7 days'
    GROUP BY rrs.stop_id
),
-- Hazard signals from canonical observations (replaces hazards table)
haz AS (
    SELECT rrs.stop_id,
           MAX(o.observed_at) AS last_hazard_at,
           MAX(o.observed_value::numeric)::numeric(4,2) AS last_hazard_severity,
           DATE_PART('day', NOW() - MAX(o.observed_at))::int AS hazard_days_ago
    FROM core.observations o
    JOIN core.visits v ON v.id = o.visit_id
    JOIN route_run_stops rrs ON rrs.id = v.route_run_stop_id
    WHERE o.observation_type = 'hazard_present'
      AND o.observed_at >= NOW() - INTERVAL '7 days'
    GROUP BY rrs.stop_id
),
-- Infrastructure scores from canonical observations (replaces infrastructure_issues)
infra AS (
    SELECT rrs.stop_id,
           AVG(o.observed_value::numeric)::numeric(4,2) AS infra_issue_score
    FROM core.observations o
    JOIN core.visits v ON v.id = o.visit_id
    JOIN route_run_stops rrs ON rrs.id = v.route_run_stop_id
    WHERE o.observation_type = 'infra_condition'
      AND o.observed_at >= NOW() - INTERVAL '30 days'
    GROUP BY rrs.stop_id
)
```

The `base` CTE becomes (after Tier 4):
```sql
base AS (
    SELECT stop_id, is_hotspot
    FROM stops
    WHERE pool_id IS NOT NULL
      AND (has_trash = TRUE OR compactor = TRUE)
)
```

All scoring weights (`HOTSPOT_BASE_WEIGHT`, `L3_DAYS_WEIGHT`, `TRASH_VOL_WEIGHT`, etc.) remain unchanged — only the data source changes.

### Done criteria
- `rebuildStopRiskSnapshot()` runs without error against the live DB
- `stop_risk_snapshot` is populated with row counts comparable to the legacy run
- No references to `level3_logs`, `trash_volume_logs`, `hazards`, or `infrastructure_issues` remain in `riskMapService.ts`
- No uppercase quoted column references (`"STOP_ID"`) remain in `riskMapService.ts`

---

## Change 2 — Additive Verification Period

During the verification period, run both the old and new snapshot rebuild in sequence and compare outputs. Do not remove the legacy CTE path until outputs are comparable.

Add a temporary `rebuildStopRiskSnapshotLegacy()` function that preserves the old query as a reference. Delete it only after the canonical version has been verified in production.

### Done criteria
- Both functions produce comparable `combined_risk_score` distributions for the same set of stops
- Diff logged at rebuild time: `[riskMap] canonical vs legacy stop count delta: N`

---

## Tier 2 Overall Done Definition

Tier 2 is complete when ALL of the following are true, **and a changelog entry has been written to `docs/changelog/`**:

- [ ] `riskMapService.ts` reads exclusively from `core.observations` and `core.visits` (no legacy table references)
- [ ] `stop_risk_snapshot` is populated with canonical-source scores
- [ ] Scores are comparable to legacy output (within 10% distribution delta acceptable during transition)
- [ ] No uppercase quoted column references remain in `riskMapService.ts`
- [ ] Legacy CTE reference function deleted after verification
- [ ] `level3_logs`, `trash_volume_logs`, `hazards`, `infrastructure_issues` still exist in DB (not dropped — that is a future cleanup task)
- [ ] Changelog entry written to `docs/changelog/YYYY-MM-DD-tier-2-intelligence-migration.md`

---

## What Tier 2 Does NOT Do

- Does not drop legacy transit tables — that is a future cleanup after all dependents are confirmed migrated
- Does not change the scoring weights or model logic — source migration only
- Does not touch the admin endpoint that triggers the rebuild (`POST /api/admin/risk-map/rebuild`)
- Does not touch `AdminControlCenter.tsx` or any frontend (Tier 3)
- Does not write to `core.assignments` (Tier 5)

---

## Agent Launch Block — Change 1

```
Refactor task. Read CLAUDE.md, then planning/TIER_2_INTELLIGENCE_MIGRATION.md.
Implement Change 1 only: rewrite the four legacy CTEs in rebuildStopRiskSnapshot()
in backend/src/intelligence/riskMapService.ts to read from core.observations and
core.visits instead of level3_logs, trash_volume_logs, hazards, infrastructure_issues.
Also update the base CTE to use lowercase stop_id column (not "STOP_ID").
Do not change scoring weights. Do not touch any other file.
Additive discipline: preserve the old query as rebuildStopRiskSnapshotLegacy()
alongside the new version until verified.
```
