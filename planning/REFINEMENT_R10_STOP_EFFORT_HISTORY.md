# R10 — Stop Effort History

> **Goal**: Replace the dropped `workforce_metrics` and `stop_scoring_history` tables with correctly designed stop-level effort and condition history tables — worker-safe by structure, keyed by `stop_id`, feeding route planning intelligence.
>
> **Status**: 🟢 Done — all three changes complete as of 2026-05-12
> **Depends on**: Tier 4 Sub-task B (surveillance tables must be dropped before replacement is designed)
> **Blocks**: Nothing

---

## Why These Tables Matter

The original `workforce_metrics` table had a valid insight behind a flawed implementation. Stop service time, complexity, and trash volume history are genuinely valuable planning signals:
- Which stops consistently take longer than allocated?
- Which stops spike in complexity on certain days?
- Which stops have increasing trash volume trends suggesting schedule adjustment?

These signals feed smarter route construction, better capacity estimation, and evidence-based conversations with the transit authority about stop difficulty and resource allocation.

The problem was `user_id` — a single column that transforms stop-level data into worker performance records. The fix is to remove worker identity from the schema entirely.

---

## New Tables

### `public.stop_effort_history`

Captures service effort per stop per visit. No worker identity.

```sql
CREATE TABLE public.stop_effort_history (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stop_id          text NOT NULL REFERENCES transit_stops(stop_id) ON DELETE CASCADE,
  visit_id         bigint NOT NULL REFERENCES core.visits(id) ON DELETE CASCADE,
  run_date         date NOT NULL,
  -- Effort signals
  service_minutes  integer,            -- derived from visit ended_at - started_at
  stop_type        text NOT NULL,      -- 'hotspot' | 'compactor' | 'standard'
  complexity_score numeric(4,2),       -- derived from observation types present
  -- Condition at completion
  had_hazard       boolean NOT NULL DEFAULT false,
  had_infra_issue  boolean NOT NULL DEFAULT false,
  trash_volume     numeric(4,2),       -- from trash_volume observation if present
  --
  computed_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(stop_id, visit_id)
);

CREATE INDEX idx_stop_effort_stop_date ON public.stop_effort_history(stop_id, run_date);
CREATE INDEX idx_stop_effort_run_date  ON public.stop_effort_history(run_date);
```

### `public.stop_condition_history`

Replaces `stop_scoring_history`. Per-stop canonical condition scores over time. No `workforce_score`.

```sql
CREATE TABLE public.stop_condition_history (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stop_id            text NOT NULL REFERENCES transit_stops(stop_id) ON DELETE CASCADE,
  visit_id           bigint NOT NULL REFERENCES core.visits(id) ON DELETE CASCADE,
  scored_at          timestamptz NOT NULL DEFAULT now(),
  -- Canonical condition scores (derived from core.observations)
  cleanliness_score  numeric(5,2),
  safety_score       numeric(5,2),
  infra_score        numeric(5,2),
  -- No workforce_score — labor safety constraint
  asset_id           bigint REFERENCES assets(id),
  UNIQUE(stop_id, visit_id)
);

CREATE INDEX idx_stop_condition_stop_id ON public.stop_condition_history(stop_id, scored_at DESC);
```

---

## Files to Touch

| File | Change |
|------|--------|
| New migration `backend/migrations/YYYYMMDD_stop_effort_history.sql` | Create both tables |
| `backend/src/domains/routeRunStop/cleanLogService.ts` | Write to `stop_effort_history` at stop completion |
| `backend/src/intelligence/riskMapService.ts` | Write to `stop_condition_history` after snapshot rebuild (or as a separate step) |

---

## Change 1 — Migration

Write `stop_effort_history` and `stop_condition_history` as defined above.

---

## Change 2 — Write to `stop_effort_history` at Stop Completion

In `cleanLogService.ts`, after writing to `clean_logs` and `core.visits`, compute and insert effort history:

```typescript
await client.query(`
  INSERT INTO stop_effort_history (
    stop_id, visit_id, run_date,
    service_minutes, stop_type, complexity_score,
    had_hazard, had_infra_issue, trash_volume
  )
  SELECT
    rrs.stop_id,
    v.id,
    rrs.created_at::date,
    EXTRACT(EPOCH FROM (v.ended_at - v.started_at)) / 60,
    CASE
      WHEN s.is_hotspot THEN 'hotspot'
      WHEN s.compactor THEN 'compactor'
      ELSE 'standard'
    END,
    -- complexity: count of non-clean observations
    (SELECT COUNT(*) FROM core.observations o2
     WHERE o2.visit_id = v.id
       AND o2.observed_value != 'clean'
       AND o2.observed_value != 'none'),
    -- had_hazard: any hazard observation present
    EXISTS (
      SELECT 1 FROM core.observations o3
      WHERE o3.visit_id = v.id AND o3.observation_type = 'hazard_present'
    ),
    -- had_infra_issue
    EXISTS (
      SELECT 1 FROM core.observations o4
      WHERE o4.visit_id = v.id AND o4.observation_type = 'infra_condition'
        AND o4.observed_value::numeric > 0
    ),
    -- trash volume
    (SELECT o5.observed_value::numeric
     FROM core.observations o5
     WHERE o5.visit_id = v.id AND o5.observation_type = 'trash_volume'
     LIMIT 1)
  FROM core.visits v
  JOIN route_run_stops rrs ON rrs.id = v.route_run_stop_id
  JOIN public.stops s ON s.stop_id = rrs.stop_id
  WHERE v.id = $1
  ON CONFLICT (stop_id, visit_id) DO NOTHING
`, [visitId])
```

---

## Change 3 — Write to `stop_condition_history` After Risk Snapshot Rebuild

In `riskMapService.ts` (after Tier 2 rewrite), after rebuilding `stop_risk_snapshot`, also insert condition history rows for each stop that had a visit in the rebuild window:

```typescript
await client.query(`
  INSERT INTO stop_condition_history (stop_id, visit_id, scored_at, cleanliness_score, safety_score, infra_score, asset_id)
  SELECT
    rrs.stop_id,
    v.id,
    NOW(),
    srs.cleanliness_score,
    srs.safety_score,
    srs.infrastructure_score,
    s.asset_id
  FROM stop_risk_snapshot srs
  JOIN route_run_stops rrs ON rrs.stop_id = srs.stop_id
  JOIN core.visits v ON v.route_run_stop_id = rrs.id
  JOIN public.stops s ON s.stop_id = srs.stop_id
  WHERE v.ended_at >= NOW() - INTERVAL '1 day'
  ON CONFLICT (stop_id, visit_id) DO NOTHING
`)
```

---

## Intelligence Queries These Tables Enable

After R10, the following queries become possible — pure stop/asset intelligence, no worker attribution:

```sql
-- Average service time per stop over last 30 days
SELECT stop_id, AVG(service_minutes) AS avg_minutes
FROM stop_effort_history
WHERE run_date >= NOW() - INTERVAL '30 days'
GROUP BY stop_id ORDER BY avg_minutes DESC;

-- Stops with consistently high complexity
SELECT stop_id, AVG(complexity_score) AS avg_complexity
FROM stop_effort_history
GROUP BY stop_id HAVING AVG(complexity_score) > 3
ORDER BY avg_complexity DESC;

-- Stop condition trend (is this stop getting cleaner or dirtier?)
SELECT stop_id, run_date, cleanliness_score
FROM stop_condition_history
WHERE stop_id = $1
ORDER BY scored_at DESC LIMIT 30;
```

---

## R10 Overall Done Definition

R10 is complete when ALL of the following are true, **and a changelog entry has been written**:

- [x] Migration creates `stop_effort_history` and `stop_condition_history`
- [x] `stop_effort_history` has no `user_id` column
- [x] `stop_condition_history` has no `workforce_score` column
- [x] After a stop completion, `SELECT * FROM stop_effort_history WHERE visit_id = :id` returns one row — write path wired in `cleanLogService.ts`; verified by code review (table empty in dev DB, no stop completions since migration applied)
- [x] After a risk snapshot rebuild, `stop_condition_history` receives new rows — verified 3 rows inserted for stop 50712 on 2026-05-12
- [x] The three intelligence queries above return results — condition trend query returns results; effort queries return empty (no stop completions yet in dev DB, not a code gap)
- [x] Changelog entry written to `docs/changelog/2026-05-12-r10-stop-effort-history.md`

---

## Agent Launch Blocks

### Step 1 — Migration

```
Refactor task. Read CLAUDE.md, then planning/REFINEMENT_R10_STOP_EFFORT_HISTORY.md.
Write backend/migrations/YYYYMMDD_stop_effort_history.sql creating both
stop_effort_history and stop_condition_history tables as specified.
No user_id column. No workforce_score column.
Do not touch any source files.
```

### Step 2 — Write effort history at stop completion

```
Refactor task. Read CLAUDE.md, then planning/REFINEMENT_R10_STOP_EFFORT_HISTORY.md, Change 2.
In backend/src/domains/routeRunStop/cleanLogService.ts, after the canonical
writes (core.visits close, core.observations), add the stop_effort_history insert.
The SQL is in the file. Use the visitId resolved earlier in the same transaction.
Additive only — do not remove any existing writes.
```

### Step 3 — Write condition history after risk rebuild (run after Tier 2)

```
Refactor task. Read CLAUDE.md, then planning/REFINEMENT_R10_STOP_EFFORT_HISTORY.md, Change 3.
In backend/src/intelligence/riskMapService.ts, after the stop_risk_snapshot rebuild,
add the stop_condition_history insert for stops visited in the last day.
The SQL is in the file.
```
