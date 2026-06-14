# Adapter Boundary Reference

> **Purpose**: State the contamination rule precisely, document the signal model, and map
> the join paths that cross the canonical↔transit-adapter boundary as they exist in *live code today*.
>
> **Audience**: Any agent or developer writing a query or service that touches `core.*` tables.
>
> **Scope discipline**: This document is the *query-level* boundary guide (what makes a query
> contaminated). The *object-level* model — what makes a whole table/view adapter vs. canonical,
> the identity-sidecar layer, the multi-tenant track, and the redesign's open decisions — lives in
> `planning/architecture/2026-06-07-issue-031-redesign-adr.md`. Do not duplicate that material here;
> consult the ADR for it. This keeps the two documents from drifting apart again.

> ## ⚠️ STATUS BANNER — read before relying on any section
>
> Core column/path structure was written **2026-05-10**, partially reconciled 2026-05-30, and
> **reconciled in full 2026-06-07** against the two live-verified inventories and the ISSUE-031
> redesign ADR (audit: `docs/audit/2026-06-07-adapter-boundary-reconciliation.md`).
>
> **CURRENT and authoritative in this doc:** §4 Signal Model (observation absence is data) and
> §5 Contamination Rule — neither is contradicted by the redesign; use them as-is. The live join
> mechanics in §3 Path A / Path B and §7 R2 status describe *what the code does today* and remain
> accurate for the as-built system.
>
> **SUPERSEDED — retained as history, do NOT build from these:**
> - The **Tier-5 / Tier-8 gap-closure roadmap (§6)**, **Path E** (`core.visits.route_run_stop_id`
>   bridge column), and **Path F via a new `core.assets` table** are replaced by the ISSUE-031
>   redesign. Run↔visit linkage is now a **hardened string translation** (`core.assignments.source_system`
>   + `source_ref`), **never a hard FK from canonical into the adapter** (ADR Q-C). There is **no
>   `core.assets` table** and the redesign does not create one — `public.assets` *is* the canonical
>   asset registry (ADR D1, §6). Sections marked 🪦 below are history.
> - The **identity-on-canonical-rows model** (the `actor_oid` / `created_by_oid` / `captured_by_oid`
>   columns shown in §1) is **gone**. Those columns were dropped on 2026-06-01 and relocated to the
>   four `core.*_actor_audit` identity sidecars; `intelligence_reader` has **no grant** on them. The
>   sidecar mechanism is the labor-safety moat (ADR §0, §3; `2026-06-06-canonical-core-complete-inventory.md` §2).
> - **`transit_stops` / `transit_stop_assets` as the permanent live asset↔location system-of-record.**
>   The redesign **inverts** this: the canonical spine (`core.asset_locations` / canonical location
>   views) becomes load-bearing, and these adapter tables demote to *vertical ingestion source +
>   operational flags* (ADR Q-A/Q-B). Path B below still matches live code *today*, but it is the
>   state the inversion migrates *away from*, not a durable target.
> - The **`v_*_transit` views are slated for eviction from `core`** (CANON-1, ADR §2). They are adapter
>   translation objects misfiled in the canonical schema; `core` is to contain zero vertical-specific
>   names. The §2b note that they "live legitimately in core" is superseded — but the underlying
>   *table* claim (`core.location_external_ids` is genuinely canonical) is correct and retained.
>
> **Population counts** anywhere in this doc are pre-reseed point-in-time snapshots — illustrative,
> not current. For live counts and column shapes, consult the two 2026-06-06 inventories. Live as of
> the 2026-06-07 audit: `core.observations`=18, `core.visits`=9, `core.evidence`=9,
> `core.assignments`=12 (**written live**, not empty), `core.asset_locations`=14,916 (**fully
> populated**, but no live application reader). `public.route_run_audit` **does not exist** in any
> schema.

---

## 1. The Canonical Layer

The canonical layer is the schema under `core.*`. It is the system of record for what happened, regardless of which operational vertical produced the event.

### `core.visits`

> **Identity correction (2026-06-07):** `core.visits.actor_oid` was **dropped** (migration
> `20260530_sidecar_extraction_b_drop.sql`, applied 2026-06-01). Worker identity now lives in
> `core.visit_actor_audit.actor_ref` (plaintext + encrypted envelope), a grant-isolated sidecar that
> `intelligence_reader` cannot read. **No worker column exists on `core.visits`.** This is the
> labor-safety moat; see ADR §3 and `2026-06-06-canonical-core-complete-inventory.md` §2.

| Column | Type | Nullable | Notes (counts illustrative — see CORE-INV for live) |
|--------|------|----------|-----------------|
| `id` | bigint | NOT NULL | — |
| `org_id` | bigint | NOT NULL | — |
| `location_id` | bigint | NULL | resolved via `core.v_locations_transit` at write |
| `primary_asset_id` | bigint | NULL | FK→`public.assets` (SET NULL) |
| `assignment_id` | bigint | NULL | **Written live** — set from `core.assignments` via the visit-ensure path. `core.assignments` is populated (see below). |
| `started_at` | timestamptz | NOT NULL | set at stop-start |
| `ended_at` | timestamptz | NULL | set for closed visits |
| `visit_type` | text | NOT NULL | `'service'` |
| `outcome` | text | NULL | `'completed'`/`'skipped'` |
| `reason_code` | text | NULL | for skipped stops |
| `client_visit_id` | uuid | NULL (unique) | UUIDv5 of `route-run-stop:{rrs.id}` — the 1:1 link to a `route_run_stops` row |
| `meta` | jsonb | NOT NULL | empty `{}` |

**Notable absence**: there is no FK from `core.visits` to `route_run_stops`, and 🪦 the once-planned
`route_run_stop_id` bridge column was **never added and will not be** (ADR Q-C forbids canonical→adapter
FKs). The link to the originating run is the **string translation** `assignment_id → core.assignments.source_ref`
(= route_run id), plus the derived `client_visit_id` for the per-stop 1:1. Per-stop completion timing is
fully reconstructable from `started_at`/`ended_at` (ADR D2).

---

### `core.observations`

> **Identity correction (2026-06-07):** `core.observations.created_by_oid` was **dropped** (2026-06-01)
> and relocated to `core.observation_actor_audit.actor_ref`. **No worker column exists on
> `core.observations`.**

| Column | Type | Nullable | Notes (counts illustrative — see CORE-INV for live) |
|--------|------|----------|-----------------|
| `id` | bigint | NOT NULL | — |
| `org_id` | bigint | NOT NULL | — |
| `visit_id` | bigint | NOT NULL | FK→`core.visits` (CASCADE) |
| `location_id` | bigint | NULL | set from stop's location_id |
| `asset_id` | bigint | NULL | FK→`public.assets` (SET NULL). Populated on the live write path. (Earlier "87/87" was a pre-reseed snapshot; live total is ~18 rows — consult CORE-INV §1.2.) |
| `observation_type` | text | NOT NULL | free text today — **not** yet registry-FK/CHECK validated (the normalized `obs_kind` shape is deferred; ADR MV-3) |
| `severity` | text | NULL | sparsely written (~2/18 — e.g. biohazard, encampment); no longer strictly "never" |
| `status` | text | NULL | still unwritten (0/18) |
| `payload` | jsonb | NOT NULL | non-empty for measurement types (e.g. `trash_volume`) |

---

### `core.evidence`

> **Identity correction (2026-06-07):** `core.evidence.captured_by_oid` was **dropped** (2026-06-01)
> and relocated to `core.evidence_actor_audit.actor_ref`. **No worker column exists on `core.evidence`.**

| Column | Type | Nullable | Notes |
|--------|------|----------|-----------------|
| `id` | bigint | NOT NULL | ~9 rows (1 per photo upload) |
| `org_id` | bigint | NOT NULL | — |
| `visit_id` | bigint | NOT NULL | FK→`core.visits` (CASCADE) |
| `observation_id` | bigint | NULL | always NULL on the live path — evidence anchors to the visit, not a specific observation |
| `kind` | text | NOT NULL | `'completion'`/`'safety'` etc. |
| `storage_key` | text | NOT NULL | MinIO/S3 path |

> **⚠️ Write-atomicity gap (ADR Q-D):** the evidence write (`public.stop_photos` + `core.evidence` +
> `core.evidence_actor_audit`) currently runs on a **bare pool, not one transaction** — unlike the
> visit/observation/assignment paths, which are atomic with their sidecars. A partial failure can
> orphan an identity sidecar row. The redesign makes this one transaction. Until then, treat the three
> writes as non-atomic.

---

### `core.assignments`

> **Status (2026-06-07): populated and written live — 12 rows.** The original "Tier 5 wires the write
> path / empty until then" framing is **false/superseded**. Assignments are written in the same
> `BEGIN/COMMIT` as `route_runs`/`route_run_stops` on `POST /api/route-runs`
> (`routeRunService.createRouteRun`), one per `route_run_stops` row, paired with the
> `core.assignment_actor_audit` sidecar. `core.visits.assignment_id` is read back from this table.
>
> **Identity correction:** `core.assignments.created_by_oid` was **dropped** (2026-06-01) → relocated
> to `core.assignment_actor_audit.actor_ref`. **No worker column exists on `core.assignments`.**

| Column | Type | Nullable | Notes |
|--------|------|----------|-----------------|
| `id` | bigint | NOT NULL | 12 rows |
| `org_id` | bigint | NOT NULL | derived from `public.assets.org_id` in the INSERT…SELECT |
| `assignment_type` | text | NOT NULL | `'transit_stop_clean'` |
| `status` | text | NOT NULL | `'planned'` |
| `location_id` | bigint | NULL | — |
| `primary_asset_id` | bigint | NULL | FK→`public.assets` |
| `planned_for_date` | date | NULL | — |
| `source_system` | text | NULL | `'route_runs'` — the vertical this assignment came from |
| `source_ref` | text | NULL | route_run id — **the canonical↔vertical run linkage (string translation, ADR Q-C), not an FK** |

---

### `core.locations`

14,916 rows. Transit stops are seeded here as locations. Each `core.visits` row links to a location via `location_id`. `core.observations` also carries `location_id`.

### `core.asset_locations`

Junction table mapping `public.assets` to `core.locations` with role and time range.
**Fully populated — 14,916 rows** (one primary link per stop), **not** sparse as an earlier draft
stated. Caveat: it has **zero live application readers today** — the live asset↔stop translation code
actually uses the *adapter* `public.transit_stop_assets`, not this table. So it is
fully-populated-but-inert. The ISSUE-031 redesign **inverts this** (ADR Q-A/Q-B): `core.asset_locations`
becomes the load-bearing canonical asset↔location read path, and `transit_stop_assets` demotes to an
ingestion-time translation seed. What *writes* the canonical spine on change is an open design question
(ADR DQ-3).

---

## 2. The Transit Adapter Layer

Tables in `public.*` that carry operational meaning for the transit vertical. These are **not** the system of record — they are workflow scaffolding and legacy state.

> **Redesign note (ADR Q-A/Q-B):** `transit_stops` and `transit_stop_assets` are accurately described
> below as today's live source-of-record for stop identity and asset↔stop mapping — but the ISSUE-031
> redesign **demotes** them to a *vertical ingestion source* (and operational flags), inverting the live
> asset↔location read path onto the canonical spine. They remain load-bearing *as-is today*; they are
> not the durable target. Note also (multi-vertical model, ADR §1): future verticals do **not** share
> `transit_stops` — each vertical gets its own ingestion surface, all feeding the same generic
> `core.locations`/`public.assets`. `transit_stops` is *one* ingestion surface, not the universal one.
>
> **Operational flags vs. reference metadata (ADR §6):** on `transit_stops`, `compactor` (a truck
> empties this can) and `has_trash` (the route spec must service it because no truck does) are
> transit-cleaning-operational and stay vertical *permanently*. `is_hotspot` (chronically bad) is kept
> vertical for now but is "almost canonical" — the generic "chronically degraded asset" signal is a
> future canonical-intelligence candidate, not to be built now.

| Table | Role |
|-------|------|
| `transit_stops` | Source of truth for transit stop metadata (stop_id text, coordinates, names). The transit stop identifier lives here. |
| `transit_stop_assets` | **Ingestion-only** (spine inversion complete, Q-A/B 2026-06-14). Maps transit `stop_id` (text) → canonical `assets.id` at ingestion time only — no live application readers. Canonical asset↔location resolution is now `core.asset_locations`. |
| `assets` | Shared table (public schema), and **itself canonical** — the canonical asset registry and FK target for four `core.*` columns (ADR D1). It lives in `public` but is *not* an adapter artifact; it is in the same "lives in public, is canonical" class as `organizations`. The `core.assignments` INSERT…SELECT derives `org_id` from `assets.org_id`; `core.visits` org-scoping flows through `withOrgContext` (RLS), not a literal join — the earlier "both derive org_id by joining to assets.org_id" was over-generalized. Schema: `id bigint PK`, `org_id bigint NOT NULL FK→organizations`, `asset_type_id bigint NOT NULL`, `seed_key text NOT NULL`, `lon/lat float`, `display_name text`, `active bool`, `attributes jsonb`, `external_id text`. |
| `route_runs` | A planned or active route for a given date and pool. Transit workflow artifact. |
| `route_run_stops` | One row per stop on a route run. The transit execution unit. Has `stop_id` (text FK → transit_stops), `asset_id` (FK → assets). Now has `org_id bigint NOT NULL` + RLS (Phase 2, 2026-05-18). |
| `clean_logs` | Boolean action log: what a worker *did* at a stop. Has `route_run_stop_id`, `stop_id`, `visit_id`, `asset_id`. 🪦 **Clip target** — canonical holds the truth; rebuilt UI reads it identity-free (ADR §6). |
| `stop_photos` | Photo record at the transit vertical level. Has `route_run_stop_id`, `visit_id`, `asset_id`. 🪦 **Clip target.** |
| `hazards` | Safety hazard records. Has `route_run_stop_id`, `visit_id`. 🪦 **Clip target.** |
| `infrastructure_issues` | Infrastructure issue records. Has `route_run_stop_id`, `visit_id`. 🪦 **Clip target.** |
| `level3_logs` | Legacy intelligence input. Has `route_run_stop_id`, `visit_id`, `asset_id`. 🪦 **Clip target.** |
| `stop_effort_history` | Replacement for dropped `workforce_metrics`. Stop-level effort data, no worker identity. (De-identified; candidate for promotion to canonical condition-state, ADR MV-4.) |
| `stop_condition_history` | Stop-level condition history. No worker identity. (De-identified; ADR MV-4 candidate.) |
| `stop_risk_snapshot` | Intelligence snapshot per stop. (De-identified.) |
| `trash_volume_logs` | Trash volume records. Has `route_run_stop_id`, `visit_id`. 🪦 **Clip target.** |
| `lead_route_overrides` | Lead-driven stop reassignment overrides. |
| `stop_pool_memberships` | Junction table for many-to-many stop-to-pool relationships (Phase 3, 2026-05-18). Schema: `stop_id text`, `pool_id text` (composite PK), `org_id bigint NOT NULL`, `shift_type text DEFAULT NULL` (day/night/all_day), `active boolean DEFAULT true`, `created_at timestamptz`. Authoritative stop-to-pool mapping — `transit_stops.pool_id` is retained only as a deprecated denormalized cache. |

---

## 2b. Bridge Views

Views in the `core` schema that translate transit-vertical identifiers into canonical identifiers.

> **CANON-1 correction (ADR §2):** these `v_*_transit` views are **adapter translation objects
> misfiled in the canonical schema** and are **slated for eviction from `core`**. They are named
> `*_transit` and filter on `location_type='transit_stop'`/`source_system='metro_stop'` — vertical
> vocabulary that must not live in `core` (the rule: `core` contains zero vertical-specific names).
> The earlier framing of them as "tolerated bridge objects living legitimately in core" is superseded.
> **However** — and this distinction matters — the *table* they read, `core.location_external_ids`, **is
> genuinely canonical** (a generic external-id sidecar; `source_system` is a parameter, not a hardcoded
> transit concept). The contamination is the **view placement/naming**, not the underlying table. Until
> the eviction lands, these views are still the live translation surface; treat them as one-hop
> translation, never as embedded join hops inside a canonical intelligence query.

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

**Classification**: Adapter translation object (per CANON-1, **eviction from `core` pending** — ADR
§2). Functionally a one-hop translation today, governed by the same one-hop rule as
`transit_stop_assets`; do not embed inside canonical queries. Its backing table
`core.location_external_ids` stays canonical.

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
**Availability**: Today — `transit_stop_assets` is seeded; `core.observations.asset_id` is populated on the live path (the earlier "87/87" was a pre-reseed snapshot)  
**Risk**: `transit_stop_assets` is a transit-vertical mapping table. Using it in a canonical query is a one-hop adapter touch. Cleaner than Path A but still vertical-dependent. **This is the live state today, and it is exactly what the ISSUE-031 spine inversion removes** (ADR Q-A/Q-B): the redesign repoints asset↔location resolution onto the canonical `core.asset_locations` and demotes `transit_stop_assets` to ingestion. Path B is the *as-is*, not the target.

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

### 🪦 Path E — `route_run_stop_id` on `core.visits` — SUPERSEDED, NEVER BUILT, FORBIDDEN

> **Do not build this.** This path proposed a transit-vertical `route_run_stop_id` bridge column on
> `core.visits`. The column was **never added**, and the ISSUE-031 redesign **forbids the pattern**:
> ADR Q-C settles that canonical **never holds an FK into the adapter** — run↔visit linkage is a
> hardened **string translation** via `core.assignments.source_system`/`source_ref`, not a bridge
> column. The original block (citing `target_architecture.md §11` as accepting the column) is retained
> below only as history so the decision trail is legible. The §11 endorsement, if it still exists,
> is itself stale — see the audit's OQ-2.

<details><summary>Historical text (superseded — for provenance only)</summary>

```
core.observations.visit_id      [canonical FK]
  → core.visits.route_run_stop_id [TRANSIT BRIDGE COLUMN — was proposed interim]
  → route_run_stops.id          [ADAPTER]
  WHERE route_run_stops.stop_id = $1
```

Was classified "accepted transitional pattern… documented in `target_architecture.md §11`." This
classification is repudiated by ADR Q-C ("canonical must never FK into a vertical").
</details>

---

### Path F — fully canonical *(the goal — but via `public.assets`, NOT a new `core.assets` table)*

```
core.observations.asset_id = :canonicalAssetId   [canonical — no adapter touch]
```

The caller holds the canonical `asset_id` directly. No transit table is consulted. `stop_id` as a
text identifier is never referenced. **Hop count: 0. This zero-hop end-state is still the goal.**

> **Mechanism correction (ADR D1):** the original Tier-8 framing said this required *"`core.assets`
> fully seeded"* — a **new `core.assets` table**. 🪦 **That table does not exist and the redesign does
> not create one.** `public.assets` *is* the canonical asset registry (a load-bearing FK target for
> four `core.*` columns, in the "lives in public, is canonical" class with `organizations`). So Path F's
> *goal* (callers pass a canonical `asset_id`, no transit table consulted) is correct and survives; its
> stated *mechanism* (build `core.assets`) is superseded. The canonical id is `public.assets.id`.

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
| `JOIN route_run_stops rrs ON rrs.id = v.route_run_stop_id` | ❌ Forbidden — 🪦 the `route_run_stop_id` bridge column was never built and is repudiated (ADR Q-C: canonical never FKs into the adapter) |
| `WHERE o.asset_id = (SELECT asset_id FROM transit_stop_assets WHERE stop_id = $1 LIMIT 1)` | ✅ Removed — spine inversion complete (Q-A/B, 2026-06-14). No live application readers. `transit_stop_assets` is now ingestion-only. |
| `WHERE o.asset_id = $canonicalAssetId` (canonical ID resolved before query) | ✅ Clean |
| `JOIN core.visits v ON v.id = o.visit_id` | ✅ Clean — canonical-to-canonical |
| Reading `level3_logs` or `hazards` in a canonical intelligence query | ❌ Contaminated — and these are clip targets (the live risk job already reads `core.observations`/`core.visits`, not the log tables) |

### The key distinction

A translation lookup (e.g., resolving `stop_id → asset_id` once before the query) is different from embedding a transit table as a join hop *inside* the query. Translation is tolerated as a boundary-crossing step. Embedded joins are contamination because they make the canonical query structurally dependent on the transit schema.

---

## 🪦 6. Gap Closure Roadmap — SUPERSEDED (retained as history)

> **This entire section is superseded by `2026-06-07-issue-031-redesign-adr.md`.** The Tier-5/Tier-8
> sequencing below was the 2026-05-10 plan; the ISSUE-031 redesign replaced it. Specifically: Tier 5's
> `route_run_stop_id` bridge column is **forbidden** (ADR Q-C — canonical never FKs into the adapter;
> run↔visit linkage is the hardened `source_ref` string translation), and Tier 8's `core.assets` table
> **is not created** (ADR D1 — `public.assets` is the canonical registry). The zero-hop *goal* (callers
> pass a canonical `asset_id`) survives; the *mechanism* below does not. Kept only because it documents
> why Path B exists and what the original migration intent was. **Do not plan work from this section —
> use the ADR's migration sequence.**

### 🪦 Tier 5 — `route_run_stop_id` on `core.visits` (SUPERSEDED — column never built, pattern forbidden)

**Was**: a `route_run_stop_id bigint` column on `core.visits` linking each visit to its transit
execution unit, classified as an accepted interim transit-vertical bridge column.
**Now**: forbidden by ADR Q-C. The linkage is `core.assignments.source_ref` (string translation), and
per-stop linkage is the derived `client_visit_id`. No bridge column.

### 🪦 Tier 8 — `core.assets` fully seeded, `asset_id` as canonical stop identity (SUPERSEDED — no such table)

**Was**: ensure every transit stop is a first-class row in a new `core.assets` table with a stable
canonical `asset_id`.
**Now**: there is no `core.assets` table (ADR D1). `public.assets` already *is* the canonical registry;
the goal (callers use `public.assets.id`, drop the `transit_stop_assets` join) is reached by the spine
inversion (ADR Q-A/Q-B), not by building a new table.

---

## 7. R2 Status Note

`arrivalObservations()` in `observationService.ts` uses **Path B** — `core.observations.asset_id → transit_stop_assets.asset_id WHERE stop_id = $1 AND active = TRUE AND role = 'primary'` — to resolve a transit `stop_id` to prior canonical observations. One adapter lookup, tolerated under the contamination rule as a vertical identifier translation.

History: migrated from Path A (`clean_logs` bridge, 3 adapter hops) to Path B in commit `e231ed9`. The `active`/`role` filter on the `transit_stop_assets` join was added during Tier 2 verification (2026-05-11) so that historical or secondary asset re-pairings cannot leak into the prior-state lookup.

**Why Path B is the current state**: No clean path from a transit `stop_id` to `core.observations` exists without touching at least one transit-vertical table until Tier 8 makes `asset_id` the caller-supplied canonical identity. Path B is one boundary-crossing translation rather than three embedded hops — different in kind from Path A, not just in degree.

**Why it is dormant in some flows**: Live `emitObservationsForStop()` callers in `routeRunStopRoutes.ts` do not all pass `stopId` yet, so for those callsites the lookup branch never fires and the function falls back to pessimistic dirty defaults. The implementation is complete but partially unactivated.

**Activation / cleanup path** (superseding the old Tier 5/Tier 8 steps):
1. Pass `stopId` through everywhere `emitObservationsForStop()` is called from the start-stop handler, so the Path B lookup fires instead of falling back to dirty defaults.
2. 🪦 The old "switch to Path E / refactor to Path F via `core.assets`" steps are superseded. The clean end-state (caller passes canonical `public.assets.id`, drop the `transit_stop_assets` join) is reached by the **ISSUE-031 spine inversion** (ADR Q-A/Q-B), which repoints asset↔location resolution onto `core.asset_locations`. Plan this from the ADR's migration sequence, not from the retired tier roadmap.

Until callers fully pass `stopId`, arrival observations fall back to dirty defaults for those stops. This is safe (pessimistic) but means the observation delta for those flows is always "worker improved everything from dirty" regardless of actual prior state.