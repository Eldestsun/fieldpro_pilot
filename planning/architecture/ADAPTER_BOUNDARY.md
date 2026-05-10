# Adapter Boundary Reference

> **Purpose**: Document the exact boundary between the canonical layer and the transit adapter layer, map every join path that crosses it, state the contamination rule precisely, and track which tier closes which gap.
>
> **Audience**: Any agent or developer writing a query or service that touches `core.*` tables.
>
> **Schema state**: As of 2026-05-10 (post Tier 1–4, R1–R2, R4).

---

## 1. The Canonical Layer

The canonical layer is the schema under `core.*`. It is the system of record for what happened, regardless of which operational vertical produced the event.

### `core.visits`

| Column | Type | Nullable | Population today |
|--------|------|----------|-----------------|
| `id` | bigint | NOT NULL | ✅ Always |
| `org_id` | bigint | NOT NULL | ✅ Always |
| `location_id` | bigint | NULL | ✅ Always (14,916 locations seeded from transit stops) |
| `primary_asset_id` | bigint | NULL | ✅ Always (17/17 visits have asset) |
| `assignment_id` | bigint | NULL | ❌ Never — 0/17 populated (§5.1 gap, Tier 5) |
| `actor_oid` | text | NOT NULL | ✅ Always — real Entra OID since R1 |
| `started_at` | timestamptz | NOT NULL | ✅ Always — set at stop-start since Tier 1 |
| `ended_at` | timestamptz | NULL | ✅ Always for closed visits |
| `visit_type` | text | NOT NULL | ✅ Always (`'service'`) |
| `outcome` | text | NULL | ✅ For Tier 1+ visits (`'completed'`/`'skipped'`); NULL for pre-Tier-1 rows |
| `reason_code` | text | NULL | ✅ For skipped stops; NULL for completions |
| `client_visit_id` | uuid | NULL (unique) | ✅ Always — UUIDv5 of `route-run-stop:{rrs.id}` |
| `meta` | jsonb | NOT NULL | ✅ Always (empty `{}`) |

**Notable absence**: `route_run_stop_id` — there is no FK from `core.visits` to `route_run_stops`. The only link is the derived `client_visit_id`. This is the §5.1 gap, closed by Tier 5.

---

### `core.observations`

| Column | Type | Nullable | Population today |
|--------|------|----------|-----------------|
| `id` | bigint | NOT NULL | ✅ Always |
| `org_id` | bigint | NOT NULL | ✅ Always |
| `visit_id` | bigint | NOT NULL | ✅ Always |
| `location_id` | bigint | NULL | ✅ Always (set from stop's location_id) |
| `asset_id` | bigint | NULL | ✅ Always — 87/87 rows populated |
| `observation_type` | text | NOT NULL | ✅ Always |
| `severity` | text | NULL | ❌ Never written — not used yet |
| `status` | text | NULL | ❌ Never written — not used yet |
| `payload` | jsonb | NOT NULL | ✅ Always |
| `created_by_oid` | text | NOT NULL | ✅ Always — real Entra OID since R1 |

---

### `core.evidence`

| Column | Type | Nullable | Population today |
|--------|------|----------|-----------------|
| `id` | bigint | NOT NULL | ✅ 9 rows (1 per photo upload since Tier 1) |
| `org_id` | bigint | NOT NULL | ✅ Always |
| `visit_id` | bigint | NOT NULL | ✅ Always |
| `observation_id` | bigint | NULL | ❌ Never written — no code links evidence to a specific observation |
| `kind` | text | NOT NULL | ✅ `'completion'`/`'safety'` etc. |
| `storage_key` | text | NOT NULL | ✅ MinIO/S3 path |
| `captured_by_oid` | text | NOT NULL | ✅ Always |

---

### `core.assignments`

| Column | Type | Nullable | Population today |
|--------|------|----------|-----------------|
| `id` | bigint | NOT NULL | ❌ **0 rows** — schema only, no write path yet |
| `org_id` | bigint | NOT NULL | — |
| `assignment_type` | text | NOT NULL | — |
| `status` | text | NOT NULL | — |
| `location_id` | bigint | NULL | — |
| `primary_asset_id` | bigint | NULL | — |
| `planned_for_date` | date | NULL | — |
| `created_by_oid` | text | NOT NULL | — |

Tier 5 wires the write path. Until then, `core.assignments` is an empty schema placeholder.

---

### `core.locations`

14,916 rows. Transit stops are seeded here as locations. Each `core.visits` row links to a location via `location_id`. `core.observations` also carries `location_id`.

### `core.asset_locations`

Junction table mapping `assets` to `core.locations` with role and time range. Exists but currently sparse — reflects whatever the transit data migration seeded.

---

## 2. The Transit Adapter Layer

Tables in `public.*` that carry operational meaning for the transit vertical. These are **not** the system of record — they are workflow scaffolding and legacy state. All are expected to remain during the migration period.

| Table | Role |
|-------|------|
| `transit_stops` | Source of truth for transit stop metadata (stop_id text, coordinates, names). The transit stop identifier lives here. |
| `transit_stop_assets` | Maps transit `stop_id` (text) → canonical `assets.id`. The translation table between vertical identity and canonical identity. |
| `assets` | Shared table (public schema, canonical FK target). Transit stops are represented as asset rows. |
| `route_runs` | A planned or active route for a given date and pool. Transit workflow artifact. |
| `route_run_stops` | One row per stop on a route run. The transit execution unit. Has `stop_id` (text FK → transit_stops), `asset_id` (FK → assets). |
| `clean_logs` | Boolean action log: what a worker *did* at a stop. Has `route_run_stop_id`, `stop_id`, `visit_id`, `asset_id`. Transit adapter bridge into canonical visits. |
| `stop_photos` | Photo record at the transit vertical level. Has `route_run_stop_id`, `visit_id`, `asset_id`. |
| `hazards` | Safety hazard records. Has `route_run_stop_id`, `visit_id`. |
| `infrastructure_issues` | Infrastructure issue records. Has `route_run_stop_id`, `visit_id`. |
| `level3_logs` | Legacy intelligence input. Has `route_run_stop_id`, `visit_id`, `asset_id`. |
| `stop_effort_history` | Replacement for dropped `workforce_metrics`. Stop-level effort data, no worker identity. |
| `stop_condition_history` | Stop-level condition history. No worker identity. |
| `stop_risk_snapshot` | Intelligence snapshot per stop. |
| `trash_volume_logs` | Trash volume records. Has `route_run_stop_id`, `visit_id`. |
| `lead_route_overrides` | Lead-driven stop reassignment overrides. |
| `route_run_audit` | Audit log for route run mutations. |

---

## 3. Current Join Map

Every known path from `core.observations` to a transit `stop_id`, with each hop labeled `[canonical]` or `[adapter]`.

---

### Path A — via `clean_logs` bridge *(current R2 implementation)*

```
core.observations.visit_id      [canonical FK]
  → core.visits.id              [canonical]
  ← clean_logs.visit_id         [ADAPTER JOIN — clean_logs is transit adapter]
  clean_logs.route_run_stop_id  [ADAPTER]
  → route_run_stops.id          [ADAPTER]
  route_run_stops.stop_id = $1  [ADAPTER FILTER]
```

**Hop count**: 1 canonical, 3 adapter  
**Availability**: Today — always valid for stops completed after Tier 1 (clean_logs rows guaranteed)  
**Risk**: Breaks if clean_logs write is removed before Tier 5 closes §5.1. Architecturally wrong — canonical queries should not route through transit action logs.

---

### Path B — via `asset_id` + `transit_stop_assets` lookup

```
core.observations.asset_id      [canonical FK — always populated]
  → assets.id                   [shared/canonical]
  ← transit_stop_assets.asset_id [ADAPTER LOOKUP]
  WHERE transit_stop_assets.stop_id = $1
    AND transit_stop_assets.active = true
    AND transit_stop_assets.role = 'primary'
```

**Hop count**: 1 canonical, 1 adapter lookup  
**Availability**: Today — `transit_stop_assets` is seeded; `core.observations.asset_id` is always populated (87/87)  
**Risk**: `transit_stop_assets` is a transit-vertical mapping table. Using it in a canonical query is a one-hop adapter touch. Cleaner than Path A but still vertical-dependent.

---

### Path C — via `core.visits.primary_asset_id` + `transit_stop_assets`

```
core.observations.visit_id      [canonical FK]
  → core.visits.primary_asset_id [canonical — always populated]
  → assets.id                   [shared/canonical]
  ← transit_stop_assets.asset_id [ADAPTER LOOKUP]
  WHERE transit_stop_assets.stop_id = $1
```

**Hop count**: 2 canonical, 1 adapter lookup  
**Availability**: Today  
**Risk**: Same as Path B — terminal adapter dependency.

---

### Path D — via `client_visit_id` derivation *(canonical computation)*

```
core.observations.visit_id      [canonical FK]
  → core.visits.client_visit_id [canonical]
  = uuidv5('route-run-stop:' || rrs.id, NS)  [DERIVED — requires pgcrypto + namespace]
  route_run_stops.id            [ADAPTER]
  WHERE route_run_stops.stop_id = $1
```

Namespace: `4c5e1b10-1f0a-4ce4-9a6b-3b9b6a0f8b9c`  
**Hop count**: 1 canonical derivation, 1 adapter hop  
**Availability**: Today (`pgcrypto` available) — but the UUIDv5 SQL is fragile and embeds the namespace constant  
**Risk**: Brittle. Any change to the derivation algorithm silently breaks the join. Not recommended for production queries.

---

### Path E — via `route_run_stop_id` on `core.visits` *(Tier 5, not yet available)*

```
core.observations.visit_id      [canonical FK]
  → core.visits.route_run_stop_id [TRANSIT BRIDGE COLUMN — acceptable interim]
  → route_run_stops.id          [ADAPTER]
  WHERE route_run_stops.stop_id = $1
```

**Hop count**: 1 canonical, 1 transit bridge column, 1 adapter filter  
**Availability**: After Tier 5 writes `route_run_stop_id` on `core.visits`  
**Classification**: Accepted transitional pattern. The bridge column is transit-vertical-specific but lives on the canonical table as an acknowledged interim FK. Documented explicitly in `target_architecture.md §11`.

---

### Path F — fully canonical *(Tier 8 target state)*

```
core.observations.asset_id = :canonicalAssetId   [canonical — no adapter touch]
```

The caller holds the canonical `asset_id` directly. No transit table is consulted. `stop_id` as a text identifier is never referenced.

**Hop count**: 0  
**Availability**: After Tier 8 ensures all transit stops are proper canonical assets and callsites are updated to use canonical `asset_id` rather than transit `stop_id`  
**This is the target state.**

---

## 4. The Contamination Rule

> **A canonical layer query is contaminated if it uses a transit-vertical table as a join condition or filter, rather than as a one-time translation lookup that resolves a vertical identifier to a canonical identifier before the query begins.**

### What this means in practice

| Pattern | Verdict |
|---------|---------|
| `JOIN clean_logs ON cl.visit_id = v.id` inside a `core.*` query | ❌ Contaminated — transit action log is a join hop, not a translation |
| `JOIN route_run_stops rrs ON rrs.id = v.route_run_stop_id` | ⚠️ Accepted interim (Tier 5 bridge column, acknowledged in architecture) |
| `WHERE o.asset_id = (SELECT asset_id FROM transit_stop_assets WHERE stop_id = $1 LIMIT 1)` | ⚠️ Tolerated — one-hop translation, but vertical-dependent |
| `WHERE o.asset_id = $canonicalAssetId` (canonical ID resolved before query) | ✅ Clean |
| `JOIN core.visits v ON v.id = o.visit_id` | ✅ Clean — canonical-to-canonical |
| Reading `level3_logs` or `hazards` in a canonical intelligence query | ❌ Contaminated — Tier 2 closes this |

### The key distinction

A translation lookup (e.g., resolving `stop_id → asset_id` once before the query) is different from embedding a transit table as a join hop *inside* the query. Translation is tolerated as a boundary-crossing step. Embedded joins are contamination because they make the canonical query structurally dependent on the transit schema.

---

## 5. Gap Closure Roadmap

### Tier 5 — `route_run_stop_id` on `core.visits`

**Closes**: Path A dependency on `clean_logs` as a bridge  
**What it adds**: A `route_run_stop_id bigint` column on `core.visits`, written at stop-start, linking each canonical visit back to its originating transit execution unit  
**Classification**: Transit-vertical bridge column. Explicitly accepted as interim in `target_architecture.md §11`. Not the clean-path target state — Tier 5 makes the join shorter and safer, not canonical.  
**Effect on R2**: Allows `arrivalObservations()` to use Path E instead of Path A, eliminating the `clean_logs` dependency while still retaining one adapter hop.  
**Remaining contamination after Tier 5**: `core.visits.route_run_stop_id` references a transit-vertical table. Acceptable until Tier 8.

---

### Tier 8 — `core.assets` fully seeded, `asset_id` as canonical stop identity

**Closes**: The remaining adapter dependency for all canonical queries targeting a specific stop  
**What it adds**: Ensures every transit stop is a first-class canonical asset, with a stable canonical `asset_id` that can be passed to canonical queries directly — no transit identifier needed  
**Effect on R2**: `arrivalObservations()` can accept `assetId: number` instead of `stopId: string`. The function body becomes `WHERE o.asset_id = $1`. Zero adapter hops.  
**Effect on all canonical intelligence**: Any query that currently resolves `stop_id → asset_id` via `transit_stop_assets` can be simplified to `WHERE asset_id = :known_id`.  
**This tier makes Path F the standard.**

---

## 6. R2 Status Note

`arrivalObservations()` in `observationService.ts` currently uses **Path A** (`clean_logs` bridge) to resolve a transit `stop_id` to prior canonical observations. This is a contaminated path — the canonical prior-state lookup routes through a transit action log.

**Why it is still this way**: No clean path from a transit `stop_id` to `core.observations` exists without touching at least one transit-vertical table. The cleanest available alternative is Path B (`transit_stop_assets`), which is one adapter lookup rather than three adapter hops — an improvement in degree, not in kind.

**Why it is stubbed, not activated**: The current `emitObservationsForStop()` call in `routeRunStopRoutes.ts` does not pass `stopId`, so the lookup branch never fires. The implementation is complete but dormant.

**Activation path**:
1. **Tier 5** — add `stopId` pass-through in `routeRunStopRoutes.ts` start-stop handler; switch to Path E once `route_run_stop_id` is on `core.visits`
2. **Tier 8** — refactor to Path F; replace `stopId: string` parameter with `assetId: number`; eliminate all adapter references from the function body

Until Tier 5, arrival observations fall back to dirty defaults for all stops. This is safe (pessimistic) but means the observation delta is always "worker improved everything from dirty" regardless of actual prior state.
