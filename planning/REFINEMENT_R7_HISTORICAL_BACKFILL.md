# R7 — Historical Backfill

> **Goal**: Write a one-time migration script that populates `core.visits`, `core.observations`, and `core.evidence` from existing transit table records, so the canonical layer has historical data from day one rather than starting empty.
>
> **Status**: ⛔ Blocked
> **Depends on**: R1 done (correct OID resolution) + Tier 1 done (canonical write paths verified)
> **Blocks**: Nothing

---

## Context

The canonical tables will be fully populated for new stops after Tier 1. But every route completion, observation, and photo taken before Tier 1 shipped exists only in transit tables:
- `clean_logs` — stop completion records
- `hazards` — safety observations from skips and completions
- `infrastructure_issues` — infra observations
- `trash_volume_logs` — volume observations
- `stop_photos` — photo evidence

A risk map built the day after Tier 1 ships would show every stop as having no history. The `stop_effort_history` table (R10) would also start empty. A demo or pilot pitch showing a "blank slate" canonical layer would undermine confidence in the platform.

The backfill runs once, after Tier 1 is verified and R1 is done (so OIDs are resolvable). It is not a live write path — it is a migration script.

---

## Files to Touch

| File | Change |
|------|--------|
| `backend/scripts/backfill_canonical.ts` (new) | One-time migration script |

No production code changes. Script only.

---

## Backfill Mapping

### `clean_logs` → `core.visits`

Each `clean_logs` row represents a completed stop. Map to a visit:

```sql
INSERT INTO core.visits (
  client_visit_id,
  route_run_stop_id,
  started_at,
  ended_at,
  outcome,
  captured_by_oid,
  org_id
)
SELECT
  -- Deterministic UUIDv5 from clean_log id to avoid duplicates
  uuid_generate_v5('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'backfill:clean_log:' || cl.id::text),
  cl.route_run_stop_id,
  cl.created_at,   -- started_at approximation
  cl.updated_at,   -- ended_at approximation
  'completed',
  id.oid,          -- resolved via identity_directory on user_id
  $1               -- org_id from environment
FROM clean_logs cl
LEFT JOIN identity_directory id ON id.id = cl.user_id
WHERE cl.route_run_stop_id IS NOT NULL
ON CONFLICT (client_visit_id) DO NOTHING
```

### `hazards` + `infrastructure_issues` + `trash_volume_logs` → `core.observations`

Each of these maps to an observation type and links to a backfilled visit:

```sql
-- Hazard observations
INSERT INTO core.observations (visit_id, observation_type, observed_value, observed_at)
SELECT
  v.id,
  'hazard_present',
  h.severity::text,
  h.reported_at
FROM hazards h
JOIN core.visits v ON v.route_run_stop_id = h.route_run_stop_id
  AND v.outcome = 'completed'
WHERE h.route_run_stop_id IS NOT NULL
ON CONFLICT DO NOTHING
```

Repeat for `infrastructure_issues` → `infra_condition` and `trash_volume_logs` → `trash_volume`.

### `stop_photos` → `core.evidence`

```sql
INSERT INTO core.evidence (visit_id, kind, storage_key, captured_by_oid)
SELECT
  v.id,
  sp.kind,
  sp.storage_key,
  id.oid
FROM stop_photos sp
JOIN core.visits v ON v.route_run_stop_id = sp.route_run_stop_id
LEFT JOIN identity_directory id ON id.id = sp.user_id
WHERE sp.route_run_stop_id IS NOT NULL
ON CONFLICT DO NOTHING
```

---

## Script Safety Rules

1. **Idempotent** — all inserts use `ON CONFLICT DO NOTHING`. Running the script twice produces the same result.
2. **Dry-run mode** — script accepts a `--dry-run` flag that logs what would be inserted without writing.
3. **Batched** — process in chunks of 500 rows to avoid long-running transactions.
4. **Logged** — print row counts for each table before and after.
5. **Never deletes** — the script only inserts. It does not modify or delete transit table records.

---

## R7 Overall Done Definition

R7 is complete when ALL of the following are true, **and a changelog entry has been written**:

- [ ] `backfill_canonical.ts` script exists and runs with `--dry-run` flag
- [ ] Dry run output shows expected row counts for visits, observations, evidence
- [ ] Full run completes without errors
- [ ] `SELECT COUNT(*) FROM core.visits` increases by the number of historical clean_log records
- [ ] `SELECT COUNT(*) FROM core.observations` increases by historical hazard + infra + trash records
- [ ] `SELECT COUNT(*) FROM core.evidence` increases by historical stop_photos records
- [ ] Running the script a second time produces no new rows (idempotent)
- [ ] Transit tables are unmodified
- [ ] Changelog entry written to `docs/changelog/YYYY-MM-DD-r7-historical-backfill.md`

---

## Agent Launch Block

```
Ops task. Read CLAUDE.md, then planning/REFINEMENT_R7_HISTORICAL_BACKFILL.md.
Write backend/scripts/backfill_canonical.ts:
  a one-time migration script that populates core.visits, core.observations,
  and core.evidence from clean_logs, hazards, infrastructure_issues,
  trash_volume_logs, and stop_photos.
The full mapping is in the file.
Use ON CONFLICT DO NOTHING throughout. Support a --dry-run flag.
Process in chunks of 500. Log row counts before and after.
Do not modify any transit table records.
Do not touch any production service code.
```
