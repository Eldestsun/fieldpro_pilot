# Adapter Boundary Reference

> **Purpose**: Document the exact boundary between the canonical layer and the transit adapter layer, map every join path that crosses it, state the contamination rule precisely, and track which tier closes which gap.
>
> **Audience**: Any agent or developer writing a query or service that touches `core.*` tables.
>
> **Schema state**: Core column/path structure as of 2026-05-10 (post Tier 1–4,
> R1–R2, R4). **Partially reconciled 2026-05-30** for the bridge layer: §2b
> (`v_locations_transit`), the `core.location_external_ids` canonical table, the
> FORCE-RLS posture on the bridge tables, and the `core.assignments` /
> `assignment_id` write-path status. Population counts elsewhere are pre-reseed
> point-in-time snapshots — treat them as illustrative, not current. A full
> reconciliation against the 2026-05-25 state-layer ratification (registry,
> normalized columns) is still outstanding.

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
| `assignment_id` | bigint | NULL | ✅ Now written (2026-05-30 verified) — `ensureVisitForRouteRunStop` resolves it via `route_run_stops → route_runs → core.assignments`. `core.assignments` is no longer empty. The §5.1 "Tier 5 not yet" note below is stale. |
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
| `id` | bigint | NOT NULL | ✅ **No longer empty** (2026-05-30 verified) — assignment rows now exist and `core.visits.assignment_id` is populated from them |
| `org_id` | bigint | NOT NULL | — |
| `assignment_type` | text | NOT NULL | — |
| `status` | text | NOT NULL | — |
| `location_id` | bigint | NULL | — |
| `primary_asset_id` | bigint | NULL | — |
| `planned_for_date` | date | NULL | — |
| `created_by_oid` | text | NOT NULL | — |

**Update 2026-05-30:** this is no longer an empty placeholder. `core.assignments`
holds rows and the visit-ensure path writes `core.visits.assignment_id` from them
(verified live). The original "Tier 5 wires the write path / empty until then"
statement is retained here only as history.

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
| `assets` | Shared table (public schema, canonical FK target). Transit stops are represented as asset rows. Also the source of `org_id` for canonical writes — `core.assignments` and `core.visits` both derive `org_id` by joining `route_run_stops → assets.org_id`. Schema: `id bigint PK`, `org_id bigint NOT NULL FK→organizations`, `asset_type_id bigint NOT NULL`, `seed_key text NOT NULL` (unique with org_id+type), `lon/lat float`, `display_name text`, `active bool`. |
| `route_runs` | A planned or active route for a given date and pool. Transit workflow artifact. |
| `route_run_stops` | One row per stop on a route run. The transit execution unit. Has `stop_id` (text FK → transit_stops), `asset_id` (FK → assets). Now has `org_id bigint NOT NULL` + RLS (Phase 2, 2026-05-18). |
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
| `stop_pool_memberships` | Junction table for many-to-many stop-to-pool relationships (Phase 3, 2026-05-18). Schema: `stop_id text`, `pool_id text` (composite PK), `org_id bigint NOT NULL`, `shift_type text DEFAULT NULL` (day/night/all_day), `active boolean DEFAULT true`, `created_at timestamptz`. Authoritative stop-to-pool mapping — `transit_stops.pool_id` is retained only as a deprecated denormalized cache. |

---

## 2b. Bridge Views

Views in the `core` schema that translate transit-vertical identifiers into canonical identifiers. These are one-hop translation surfaces — they are tolerated at the adapter boundary but must not be embedded as join hops inside canonical intelligence queries.

### `core.v_locations_transit`

A read-only view that maps a transit `stop_id` (text) to the corresponding
`core.locations.id`. Used wherever a canonical write needs a `location_id` but
only has a transit `stop_id` available (e.g. `ensureVisitForRouteRunStop`).

**Actual definition (verified live 2026-05-30):** the view does *not* map
`stop_id` directly — it joins `core.locations` to the canonical external-id
sidecar `core.location_external_ids`, and the "stop_id" it exposes is that
sidecar's `external_id`:

```sql
SELECT l.id AS location_id, l.org_id, l.location_type, l.label, l.lon, l.lat,
       lei.source_system, lei.external_id AS stop_id
FROM core.locations l
JOIN core.location_external_ids lei ON lei.location_id = l.id
WHERE l.location_type = 'transit_stop'
  AND lei.source_system = 'metro_stop';
```

| Column | Type | Notes |
|--------|------|-------|
| `location_id` | bigint | `core.locations.id` — the canonical location FK |
| `org_id` | bigint | Organization the location belongs to |
| `location_type` | text | always `'transit_stop'` (view filter) |
| `label` | text | Human-readable stop label |
| `lon` | double precision | Longitude |
| `lat` | double precision | Latitude |
| `source_system` | text | always `'metro_stop'` (view filter) — **not** `'transit'` as an earlier draft of this doc stated |
| `stop_id` | text | `core.location_external_ids.external_id` — the transit stop identifier (join key from the adapter side) |

**`core.location_external_ids` (canonical):** the external-id sidecar that backs
this view — `(org_id, location_id, source_system, external_id)`. ~14,916 rows
(`source_system='metro_stop'`), one per seeded transit location. It is a
*canonical* table, not an adapter table, even though its `external_id` values are
transit `stop_id`s.

> **⚠️ RLS / org-context trap (PATTERN-001).** Both base tables —
> `core.locations` and `core.location_external_ids` — are `FORCE ROW LEVEL
> SECURITY`. `v_locations_transit` is a **security-definer view** (owned by a
> non-`BYPASSRLS` role), so the base-table policies are enforced even for a
> superuser querying *through* the view, and they evaluate against
> `app.current_org_id` on the connection. Any caller that reads this view must
> set org context (use `withOrgContext(orgId, …)`); a bare `pool.connect()` will
> silently return zero rows (→ "missing location_id") or, on a pooled connection
> whose context was reset to `''`, raise `invalid input syntax for type bigint:
> ""` (HTTP 500). This was the live start-stop failure fixed 2026-05-30:
> `startRouteRunStopInternal` now runs inside `withOrgContext`, and the
> `core.location_external_ids` / `core.asset_locations` policies were hardened to
> the guarded `COALESCE/NULLIF` form so a missing context fails closed instead of
> raising. See `docs/changelog/bugfix/2026-05-30-start-stop-rls-org-context.md`.

**Usage**: `ensureVisitForRouteRunStop` and the `core.assignments` INSERT join
`route_run_stops → core.v_locations_transit ON loc.stop_id = rrs.stop_id` to
resolve `location_id`. Verified live 2026-05-30 — the four Developer Test Pool
stops (79213/79234/50712/80580) resolve to locations 98/6951/14916/9349.

**Classification**: Tolerated bridge — one adapter lookup, not an embedded join
hop inside a canonical query. The same one-hop translation rule applies as for
`transit_stop_assets`.

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

## 4. Signal Model — Observation Absence Is Data

Observation absence is a valid signal. A stop condition type not appearing in `core.observations` for a given visit means that condition did not require servicing — it was already clean. A skipped stop produces no observations, signaling the entire stop did not need servicing. Intelligence queries derive cleanliness duration from the interval between consecutive positive (cleaned) observations, not from dirty/clean pairs. Do not add assumed-dirty arrival observations to fill silence — silence is data.

---

## 5. The Contamination Rule

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

## 6. Gap Closure Roadmap

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

## 7. R2 Status Note

`arrivalObservations()` in `observationService.ts` uses **Path B** — `core.observations.asset_id → transit_stop_assets.asset_id WHERE stop_id = $1 AND active = TRUE AND role = 'primary'` — to resolve a transit `stop_id` to prior canonical observations. One adapter lookup, tolerated under the contamination rule as a vertical identifier translation.

History: migrated from Path A (`clean_logs` bridge, 3 adapter hops) to Path B in commit `e231ed9`. The `active`/`role` filter on the `transit_stop_assets` join was added during Tier 2 verification (2026-05-11) so that historical or secondary asset re-pairings cannot leak into the prior-state lookup.

**Why Path B is the current state**: No clean path from a transit `stop_id` to `core.observations` exists without touching at least one transit-vertical table until Tier 8 makes `asset_id` the caller-supplied canonical identity. Path B is one boundary-crossing translation rather than three embedded hops — different in kind from Path A, not just in degree.

**Why it is dormant in some flows**: Live `emitObservationsForStop()` callers in `routeRunStopRoutes.ts` do not all pass `stopId` yet, so for those callsites the lookup branch never fires and the function falls back to pessimistic dirty defaults. The implementation is complete but partially unactivated.

**Activation / cleanup path**:
1. **Tier 5** — pass `stopId` through everywhere `emitObservationsForStop()` is called from the start-stop handler. (Optionally switch to Path E once `route_run_stop_id` is on `core.visits`, but Path B is acceptable until Tier 8.)
2. **Tier 8** — refactor to Path F: replace `stopId: string` with `assetId: number`; drop the `transit_stop_assets` join entirely.

Until callers fully pass `stopId`, arrival observations fall back to dirty defaults for those stops. This is safe (pessimistic) but means the observation delta for those flows is always "worker improved everything from dirty" regardless of actual prior state.
