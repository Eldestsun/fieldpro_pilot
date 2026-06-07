# Transit Adapter Complete Inventory

> **Type:** Pure investigation / reference inventory. No schema, code, or data changes.
> **Date:** 2026-06-06
> **Branch:** `feat/issue-031-adapter-inventory` (cut from `origin/main` @ `ec041f8`)
> **Purpose:** Capture every fact about the current transit-adapter slice (`public.*` tables
> + adapter views + their read/write paths + UI surfaces + permissions + relationships) in
> enough detail for the founder to design the redesigned adapter shape (ISSUE-031) from
> complete information. **This document inventories what IS. It does not propose what should
> change.**
>
> **Method:** Every DB fact verified live against `fieldpro_db` via the `postgres` MCP
> (`pg_class`, `pg_attribute`, `pg_constraint`, `pg_indexes`, `pg_policies`, `pg_proc`,
> `pg_get_viewdef`, `pg_depend`, `information_schema.role_table_grants`). Every code fact
> verified by `grep`/read over `backend/src/**` and `backend/scripts/**`. Where a fact could
> not be verified it is flagged in §10, not guessed.
>
> **Companion docs (context, committed on other branches):**
> `docs/audit/2026-06-06-adapter-layer-information-content-audit.md` (the labor-safety audit
> that returned HYPOTHESIS WRONG), `planning/architecture/2026-06-06-issue-018-phase-0-context.md`,
> `planning/architecture/ADAPTER_BOUNDARY.md`, `planning/architecture/CANONICAL_STATE_LAYER_DESIGN.md`,
> `docs/KNOWN_ISSUES.md` (ISSUE-018, 027–031).

---

## Object census (live DB, 2026-06-06)

| Object class | Count | Names |
|---|---|---|
| `public.*` base tables | 28 | (see §1) |
| `public.*` materialized views | 5 | `cleanliness_risk_mv`, `infrastructure_risk_mv`, `level3_compliance_mv`, `safety_risk_mv`, `stop_status_mv` |
| `public.*` views | 6 | `stops`, `stop_assets_v1`, `transit_stop_assets_v1`, `export_pool_daily_summary_v1`, `export_route_run_origin_mix_v1`, `export_stop_status_v1` |
| `core.*` views | 12 | `v_clean_logs_transit`, `v_hazards_transit`, `v_infra_transit`, `v_level3_logs_transit`, `v_stop_photos_transit`, `v_trash_volume_logs_transit`, `v_assignments_transit`, `v_locations_transit`, `v_stop_location_map`, `v_asset_locations_transit`, `v_assets`, `v_locations` |
| DB roles | 5 | `postgres` (super), `fieldpro` (app, LOGIN), `intelligence_reader` (NOLOGIN), `audit_reader` (NOLOGIN), `mcp_readonly` (LOGIN) |

**Note — `public.stops` is a VIEW**, not a table (read-only passthrough over `public.transit_stops`, with an `INSTEAD OF` trigger that raises on any write). **`public.route_run_audit` does NOT exist** in the live DB despite being listed as an adapter table in `ADAPTER_BOUNDARY.md` §2 (see §10 Q1).

**Classification legend** (used throughout):
- 🔴 **WORK-ATTRIBUTION** — worker identity / who-did-what-when-where. The clip target.
- 🟡 **ROUTING/SCHEDULING** — run state, sequence, assignment intent, completion timing.
- 🟢 **ORG SCAFFOLDING / REFERENCE** — stops, assets, pools, bases, org, lookups (survives).
- 🔵 **DERIVED / DE-IDENTIFIED** — history/snapshot tables computed from canonical; no worker col.
- ⚫ **IDENTITY / AUDIT / INFRA** — directory, compliance audit, export plumbing, migration state.

---

# Section 1 — Table Inventory

28 `public.*` base tables. Every table except `asset_types`, `eam_bridge_populate_state`,
`organizations`, and `schema_migrations` is `ROW LEVEL SECURITY ENABLED + FORCED`. All
RLS-forced tables carry the identical `org_isolation` policy unless noted (see §6.3).

The standard `org_isolation` policy (USING and WITH CHECK, `cmd=ALL`, `roles=public`):
```sql
(COALESCE(current_setting('app.current_org_id', true), '') = '')
  OR (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::bigint)
```
i.e. **fails open when `app.current_org_id` is unset** (the PATTERN-001 trap), and scopes to
the set org otherwise. `export_delete_tokens` uses the text-comparison variant (its `org_id`
is `text`). `audit_log` has three distinct policies (§6.3).

---

### 1.1 `public.clean_logs` — 🔴 work-attribution (clip target) · 6 rows

Boolean cleaning-action log: what a worker did at a stop. The "smoking gun" — full
WHO/WHAT/WHEN/WHERE in one row.

| # | Column | Type | Null | Default | Class |
|---|---|---|---|---|---|
| 1 | id | bigint | NOT NULL | `nextval('clean_logs_id_seq')` | PK |
| 2 | route_run_stop_id | bigint | — | | 🟡 link to run-stop |
| 3 | stop_id | text | NOT NULL | | 🟢 WHERE (FK→transit_stops) |
| 4 | **user_id** | bigint | — | | 🔴 **WHO** (worker, opaque bigint, no FK) |
| 5 | cleaned_at | timestamptz | NOT NULL | `now()` | 🔴 WHEN |
| 6 | duration_minutes | integer | — | | 🔴 effort / time-on-task |
| 7 | picked_up_litter | boolean | — | `false` | 🔴 WHAT |
| 8 | emptied_trash | boolean | — | `false` | 🔴 WHAT |
| 9 | washed_shelter | boolean | — | `false` | 🔴 WHAT |
| 10 | washed_pad | boolean | — | `false` | 🔴 WHAT |
| 11 | washed_can | boolean | — | `false` | 🔴 WHAT |
| 12 | level | smallint | — | | 🔴 service level |
| 13 | notes | text | — | | 🔴 free-text |
| 14 | photo_keys | text[] | — | | 🔴 evidence refs |
| 15 | asset_id | bigint | — | | 🟡 FK→assets |
| 16 | visit_id | bigint | — | | 🟡 FK→core.visits (ON DELETE SET NULL) — adapter→canonical bridge |
| 17 | org_id | bigint | NOT NULL | | tenant |

- **PK:** `(id)`. **FKs:** `asset_id`→`assets(id)`; `stop_id`→`transit_stops(stop_id)`; `visit_id`→`core.visits(id) ON DELETE SET NULL`.
- **Indexes:** `clean_logs_pkey`, `idx_clean_logs_stop_id (stop_id)`, `idx_clean_logs_visit_id (visit_id)`.
- **No FK on `user_id`** — opaque bigint. **No table comment.**

### 1.2 `public.hazards` — 🔴 work-attribution (clip target) · 2 rows

| # | Column | Type | Null | Default | Class |
|---|---|---|---|---|---|
| 1 | id | bigint | NOT NULL | `nextval('hazards_id_seq')` | PK |
| 2 | stop_id | text | NOT NULL | | 🟢 WHERE |
| 3 | route_run_stop_id | bigint | — | | 🟡 (FK→route_run_stops ON DELETE SET NULL) |
| 4 | reported_at | timestamptz | NOT NULL | `now()` | 🔴 WHEN |
| 5 | **reported_by** | bigint | — | | 🔴 **WHO** (opaque bigint, no FK) |
| 6 | hazard_type | text | — | | 🔴 WHAT ("old string column" per code) |
| 7 | severity | smallint | — | | 🔴 |
| 8 | notes | text | — | | 🔴 |
| 9 | details | jsonb | NOT NULL | `'{}'` | 🔴 (carries `hazard_types` array) |
| 11 | photo_key | text | — | | 🔴 evidence |
| 12 | asset_id | bigint | — | | 🟡 FK→assets |
| 13 | visit_id | bigint | — | | 🟡 FK→core.visits (SET NULL) |
| 14 | org_id | bigint | NOT NULL | | tenant |

(Column 10 dropped historically — gap in `attnum`.)
- **FKs:** `asset_id`→assets, `route_run_stop_id`→route_run_stops (SET NULL), `stop_id`→transit_stops, `visit_id`→core.visits (SET NULL). **Referenced by:** `route_run_stops.hazard_id`.
- **Indexes:** pkey, `hazards_stop_id_reported_at_idx (stop_id, reported_at)`, `idx_hazards_stop_id`, `idx_hazards_visit_id`.

### 1.3 `public.infrastructure_issues` — 🔴 work-attribution (clip target) · 2 rows

| # | Column | Type | Null | Default | Class |
|---|---|---|---|---|---|
| 1 | id | bigint | NOT NULL | seq | PK |
| 2 | stop_id | text | NOT NULL | | 🟢 WHERE |
| 3 | route_run_stop_id | bigint | — | | 🟡 (FK SET NULL) |
| 4 | reported_at | timestamptz | NOT NULL | `now()` | 🔴 WHEN |
| 5 | **reported_by** | bigint | — | | 🔴 **WHO** |
| 6 | issue_type | text | NOT NULL | | 🔴 WHAT |
| 7 | severity | smallint | — | | 🔴 |
| 8 | notes | text | — | | 🔴 |
| 9 | component | text | — | | 🔴 |
| 10 | cause | text | — | | 🔴 |
| 11 | needs_facilities | boolean | NOT NULL | `true` | 🔴 |
| 12 | details | jsonb | — | | 🔴 |
| 13 | photo_keys | text[] | — | | 🔴 |
| 14 | photo_key | text | — | | 🔴 |
| 15 | asset_id | bigint | — | | 🟡 |
| 16 | visit_id | bigint | — | | 🟡 FK→core.visits (SET NULL) |
| 17 | org_id | bigint | NOT NULL | | tenant |

- **FKs:** asset_id→assets, route_run_stop_id→route_run_stops (SET NULL), stop_id→transit_stops, visit_id→core.visits (SET NULL). **Referenced by:** `route_run_stops.infra_issue_id`.
- **Indexes:** pkey, `infrastructure_issues_stop_id_reported_at_idx`, `idx_infrastructure_issues_stop_id`, `idx_infrastructure_issues_visit_id`.

### 1.4 `public.level3_logs` — 🔴 work-attribution (clip target) · 0 rows · **effectively dead**

| # | Column | Type | Null | Default | Class |
|---|---|---|---|---|---|
| 1 | id | bigint | NOT NULL | seq | PK |
| 2 | route_run_stop_id | bigint | — | | 🟡 (FK SET NULL) |
| 3 | stop_id | text | NOT NULL | | 🟢 |
| 4 | cleaned_at | timestamptz | NOT NULL | `now()` | 🔴 WHEN |
| 5 | **user_id** | bigint | — | | 🔴 **WHO** |
| 6 | level | smallint | NOT NULL | | 🔴 |
| 7 | notes | text | — | | 🔴 |
| 8 | asset_id | bigint | — | | 🟡 |
| 9 | visit_id | bigint | — | | 🟡 FK→core.visits (SET NULL) |
| 10 | org_id | bigint | NOT NULL | | tenant |

- **0 rows. No application write path. Read only by the dead `rebuildStopRiskSnapshotLegacy()` (no caller).** Legacy intelligence input, superseded by canonical `core.observations`.
- **Indexes:** pkey, `level3_logs_stop_id_cleaned_at_idx`, `idx_level3_logs_stop_id`, `idx_level3_logs_visit_id`.

### 1.5 `public.stop_photos` — 🔴 work-attribution (clip target) · 9 rows

| # | Column | Type | Null | Default | Class |
|---|---|---|---|---|---|
| 1 | id | bigint | NOT NULL | seq | PK |
| 2 | route_run_stop_id | bigint | NOT NULL | | 🟡 (FK→route_run_stops ON DELETE CASCADE) |
| 3 | s3_key | text | NOT NULL | | 🔴 evidence (MinIO/S3 key) |
| 4 | kind | text | NOT NULL | `'generic'` | 🔴 (completion/safety/etc.) |
| 5 | captured_at | timestamptz | NOT NULL | `now()` | 🔴 WHEN |
| 6 | **created_by_oid** | text | NOT NULL | | 🔴 **WHO — plaintext Entra OID** |
| 7 | asset_id | bigint | — | | 🟡 |
| 8 | visit_id | bigint | — | | 🟡 FK→core.visits (SET NULL) |
| 9 | org_id | bigint | NOT NULL | | tenant |

- **`created_by_oid` is a plaintext OID** → resolves directly through `identity_directory` (single join → named individual).
- **FKs:** asset_id→assets, route_run_stop_id→route_run_stops (CASCADE), visit_id→core.visits (SET NULL).
- **Indexes:** pkey, `idx_stop_photos_route_run_stop_id`, `idx_stop_photos_visit_id`.

### 1.6 `public.trash_volume_logs` — 🔴 work-attribution (clip target, indirect) · 4 rows

| # | Column | Type | Null | Default | Class |
|---|---|---|---|---|---|
| 1 | id | bigint | NOT NULL | seq | PK |
| 2 | route_run_stop_id | bigint | — | | 🟡 (FK SET NULL) |
| 3 | stop_id | text | NOT NULL | | 🟢 |
| 4 | logged_at | timestamptz | NOT NULL | `now()` | 🔴 WHEN |
| 5 | volume | smallint | NOT NULL | | 🔴 WHAT (0–4 scale; col comment present) |
| 6 | notes | text | — | | 🔴 |
| 7 | asset_id | bigint | — | | 🟡 |
| 8 | created_at | timestamptz | NOT NULL | `now()` | ⚫ |
| 9 | updated_at | timestamptz | NOT NULL | `now()` | ⚫ |
| 10 | visit_id | bigint | — | | 🟡 FK→core.visits (SET NULL) |
| 11 | org_id | bigint | NOT NULL | | tenant |

- **No direct worker column** — worker reachable only via `route_run_stop_id → route_runs`. Table comment: *"Historical trash volume readings per stop visit; feeds cleanliness risk scoring."* (stale — active risk job reads canonical now). Read only by the dead legacy snapshot function.

### 1.7 `public.route_runs` — 🟡/🔴 mixed routing + attribution · 3 rows

A planned/active route for a date+pool. Survives for routing; carries three worker columns.

| # | Column | Type | Null | Default | Class |
|---|---|---|---|---|---|
| 1 | id | bigint | NOT NULL | seq | PK |
| 2 | **user_id** | bigint | — | | 🔴 WHO (legacy int worker id) |
| 3 | route_pool_id | text | — | | 🟡 FK→route_pools |
| 4 | base_id | text | — | | 🟡 FK→bases |
| 5 | run_date | date | NOT NULL | | 🟡 |
| 6 | status | text | NOT NULL | `'planned'` | 🟡 |
| 7 | total_distance_m | double precision | — | | 🟡 |
| 8 | total_duration_s | double precision | — | | 🟡 |
| 9 | created_at | timestamptz | NOT NULL | `now()` | ⚫ |
| 10 | updated_at | timestamptz | NOT NULL | `now()` | ⚫ |
| 11 | started_at | timestamptz | — | | 🟡 WHEN (run-level) |
| 12 | finished_at | timestamptz | — | | 🟡 WHEN (run-level) |
| 13 | org_id | bigint | NOT NULL | | tenant |
| 16 | **assigned_user_oid** | text | — | | 🔴 WHO (plaintext OID, assigned worker) |
| 17 | **created_by_oid** | text | — | | 🔴 WHO (plaintext OID, creator) |
| 18 | shift_type | text | NOT NULL | `'day'` | 🟡 (CHECK day/night/all_day; col comment) |

(Columns 14–15 dropped historically.)
- **PK** `(id)`. **CHECK** `shift_type IN (day,night,all_day)`. **FKs:** `base_id`→bases, `org_id`→organizations (TWO fkeys: `fk_route_runs_org` + `route_runs_org_id_fkey`), `route_pool_id`→route_pools. **Referenced by:** `route_run_stops.route_run_id` (CASCADE), `eam_bridge_route_log.route_run_id`.
- **Indexes:** pkey, `idx_route_runs_assigned_user_oid`, `idx_route_runs_created_by_oid`, `idx_route_runs_org_id`, `route_runs_run_date_status_idx`.
- **Trigger** `trg_route_runs_pool_invariant` BEFORE INSERT/UPDATE OF (route_pool_id,org_id,base_id) → `enforce_route_runs_pool_invariant()` (autofills/validates org_id+base_id from the pool; see §6.4).

### 1.8 `public.route_run_stops` — 🟡 routing + per-stop completion timing · 12 rows

One row per stop on a route run; the transit execution unit.

| # | Column | Type | Null | Default | Class |
|---|---|---|---|---|---|
| 1 | id | bigint | NOT NULL | seq | PK |
| 2 | route_run_id | bigint | NOT NULL | | 🟡 FK→route_runs (CASCADE) |
| 3 | stop_id | text | NOT NULL | | 🟢 FK→transit_stops |
| 4 | sequence | integer | NOT NULL | | 🟡 |
| 5 | planned_distance_m | double precision | — | | 🟡 |
| 6 | planned_duration_s | double precision | — | | 🟡 |
| 7 | created_at | timestamptz | NOT NULL | `now()` | ⚫ |
| 8 | updated_at | timestamptz | NOT NULL | `now()` | ⚫ |
| 9 | status | text | NOT NULL | `'pending'` | 🟡 (CHECK pending/in_progress/done/skipped) |
| 10 | completed_at | timestamptz | — | | 🟡/🔴 per-stop completion WHEN |
| 11 | trash_volume | smallint | — | | 🟡 (col comment) |
| 12 | hazard_id | bigint | — | | 🟡 FK→hazards (SET NULL) |
| 13 | infra_issue_id | bigint | — | | 🟡 FK→infrastructure_issues (SET NULL) |
| 14 | origin_type | text | — | `'planned'` | 🟡 (CHECK planned/emergency/ul_ad_hoc) |
| 15 | asset_id | bigint | NOT NULL | | 🟡 FK→assets |
| 16 | started_at | timestamptz | — | | 🟡 WHEN |
| 17 | org_id | bigint | NOT NULL | | tenant |

- **CHECKs:** status, origin_type. **FKs:** asset_id→assets, hazard_id→hazards (SET NULL), infra_issue_id→infrastructure_issues (SET NULL), route_run_id→route_runs (CASCADE), stop_id→transit_stops.
- **Indexes:** pkey, `idx_route_run_stops_asset_id`, `idx_route_run_stops_run_id (route_run_id,sequence)`, `idx_route_run_stops_stop_id`, `route_run_stops_origin_type_idx`, `route_run_stops_route_run_id_idx`.
- **No direct worker column** — worker reachable via parent `route_runs`.

### 1.9 `public.transit_stops` — 🟢 reference (survives) · 14,916 rows

Source of truth for transit stop metadata. Matches the "inert scaffolding" model.

Columns: `stop_id` text PK · `trf_district_code` · `bay_code` · `bearing_code` ·
`on_street_name` · `intersection_loc` · `hastus_cross_street_name` · `kcm_managed_equipment` ·
`route_list` · `num_shelters` int · `stop_status` · `gisobjid` · `lon`/`lat` double ·
`is_hotspot` bool NOT NULL `false` · `compactor` bool NOT NULL `false` · `has_trash` bool NOT NULL `false` ·
`notes` · `pool_id` (deprecated denormalized cache — see §1.20) · `last_level3_at` timestamptz
(denormalized last-service marker, no WHO) · `priority_class` text `'medium'` · `asset_id` bigint ·
`org_id` bigint NOT NULL `1`.
- **PK** `(stop_id)`. **FK** `org_id`→organizations. **No per-visit work-attribution.**
- **Trigger** `trg_sync_transit_stop_primary_asset` AFTER INSERT/UPDATE OF asset_id → `sync_transit_stop_primary_asset()` (maintains `transit_stop_assets` primary link; **latent ISSUE-024 defect** — omits NOT NULL org_id on its insert; §6.4).
- **Backed by view `public.stops`** (the lowercase-column read surface; §2).

### 1.10 `public.transit_stop_assets` — 🟢 reference / adapter↔canonical translation · 14,916 rows

Maps transit `stop_id` (text) → canonical `assets.id`. The vertical-identity↔canonical-identity
translation table (ADAPTER_BOUNDARY Path B/C).

Columns: `id` bigint PK · `stop_id` text NOT NULL · `asset_id` bigint NOT NULL · `role` text NOT NULL `'primary'` ·
`active` bool NOT NULL `true` · `installed_at` · `removed_at` · `notes` · `created_at`/`updated_at` · `org_id` bigint NOT NULL.
- **FKs:** asset_id→assets (RESTRICT), stop_id→transit_stops (CASCADE).
- **Indexes:** pkey; partial unique `ux_transit_stop_assets_active (stop_id,asset_id,role) WHERE active`; partial unique `ux_transit_stop_assets_one_primary (stop_id) WHERE active AND role='primary'`.
- **No application write path in `*.ts`** — populated by the `sync_transit_stop_primary_asset` trigger and/or migration seed (see §10 Q4). `intelligence_reader` holds SELECT (§7).

### 1.11 `public.stop_pool_memberships` — 🟢 routing structure · 14,916 rows

Authoritative stop→pool mapping (replaces the deprecated `transit_stops.pool_id` cache).
Columns: `stop_id` text · `pool_id` text · `org_id` bigint NOT NULL · `shift_type` text · `active` bool NOT NULL `true` · `created_at`.
- **PK** `(stop_id, pool_id)`. **FKs:** pool_id→route_pools (CASCADE), stop_id→transit_stops (CASCADE). **Index:** partial `idx_spm_pool_org (pool_id,org_id) WHERE active`.

### 1.12 `public.route_pools` — 🟢 routing groupings · 12 rows

Columns: `id` text PK · `label` text NOT NULL · `trf_district` · `active` bool `true` · `default_max_minutes` int · `created_at`/`updated_at` · `base_id` text · `org_id` bigint NOT NULL.
- **FKs:** base_id→bases (UPDATE CASCADE / DELETE RESTRICT), org_id→organizations. **Referenced by:** route_runs, stop_pool_memberships.
- **Trigger** `trg_route_pools_lock_org_base` BEFORE UPDATE OF (org_id,base_id) → `prevent_route_pool_org_base_change_if_used()` (blocks org/base change while route_runs reference the pool; §6.4).

### 1.13 `public.bases` — 🟢 reference · 2 rows

Columns: `id` text PK · `name` text NOT NULL · `lon`/`lat` double NOT NULL · `address` · `active` bool `true` · `created_at`/`updated_at` · `org_id` bigint NOT NULL (FK→organizations). Read for OSRM route origin/dest.

### 1.14 `public.assets` — 🟢 **canonical asset registry (shared, in public schema)** · 14,916 rows

The canonical asset table (industry-neutral). FK target for canonical `core.*` tables —
**structurally load-bearing for the canonical layer, not an adapter-only artifact.**

Columns: `id` bigint PK · `org_id` bigint NOT NULL (FK→organizations RESTRICT) · `asset_type_id` bigint NOT NULL (FK→asset_types RESTRICT) ·
`seed_key` text NOT NULL (pre-Tier-8 identity key; col comment) · `lon`/`lat` double · `display_name` text ·
`active` bool NOT NULL `true` · `created_at`/`updated_at` · `attributes` jsonb NOT NULL `'{}'` (asset-type-specific metadata; col comment) · `external_id` text (Tier 8 canonical external identity; col comment).
- **Unique** `(org_id, asset_type_id, seed_key)`; partial unique `idx_assets_org_external_id (org_id, external_id) WHERE external_id IS NOT NULL`. **Indexes:** `assets_lon_lat_idx`, `assets_org_type_idx`.
- **Rich table comment** (canonical asset narrative — transit_stops is "one seeding source"; parks/facilities/housing plug in here).
- **Referenced (cross-schema) by:** `core.asset_locations`, `core.assignments.primary_asset_id`, `core.observations.asset_id`, `core.visits.primary_asset_id`, plus public `clean_logs/hazards/infrastructure_issues/level3_logs/stop_photos/trash_volume_logs/route_run_stops/transit_stop_assets/stop_condition_history/stop_risk_snapshot.asset_id`.

### 1.15 `public.asset_external_ids` — 🟢 reference · 14,916 rows · **no app read/write**

Columns: `id` bigint PK · `asset_id` bigint NOT NULL (FK→assets CASCADE) · `external_system` text NOT NULL · `external_key` text NOT NULL · `created_at` · `org_id` bigint NOT NULL.
- **Unique** `(asset_id, external_system)` and `(external_system, external_key)`. **No reference in `*.ts`** (only an RLS-test `SELECT COUNT(*)` in `verify_rls.ts`). Reference/seed table.

### 1.16 `public.asset_types` — 🟢 reference / code table · 1 row · **not RLS**

Columns: `id` bigint PK · `code` text NOT NULL UNIQUE · `name` text NOT NULL · `created_at`. Global code table (read by asset seeding via `code` join). No RLS.

### 1.17 `public.organizations` — 🟢 tenant master · 1 row · **not RLS**

Columns: `id` bigint PK · `name` text NOT NULL · `slug` text NOT NULL UNIQUE · `created_at` · `tenant_uuid` text (Azure AD tenant UUID; col comment; partial unique). FK target for nearly all `org_id` columns in both schemas. No application write (only `verify_rls.ts` fixtures); read in auth/org-resolution and exports.

### 1.18 `public.identity_directory` — ⚫ **the OID→name+email resolver** · 4 rows

The single place worker identity is stored. **Table comment is a labor-safety directive:**
*"This table is the ONLY place worker identity is stored. No query in the intelligence layer
(riskMapService, stop_risk_snapshot, stop_effort_history, stop_condition_history,
AdminControlCenter) may JOIN to this table. The one controlled exception is loadRouteRunById
in routeRunService.ts."*

Columns: `oid` text PK · `display_name` text · `email` text · `last_seen_role` text (CHECK NULL or Specialist/Dispatch/Admin) · `last_seen_at` timestamptz NOT NULL `now()` · `org_id` bigint NOT NULL (FK→organizations).
- **Index** `idx_identity_directory_org_id`. Turns any plaintext OID (`route_runs.assigned_user_oid`/`created_by_oid`, `stop_photos.created_by_oid`) into a named, emailed individual.

### 1.19 `public.audit_log` — ⚫ compliance audit trail · 28,360 rows

Append-only compliance trail. **Table comment:** *"Stores Azure Entra OIDs (actor_oid) only…
UPDATE and DELETE are blocked by RLS policy."* (DELETE is in fact permitted under one guarded
policy for export-delete — §6.3.)

Columns: `id` bigint PK (seq) · `actor_oid` text NOT NULL (⚫ compliance actor identity) · `action` text NOT NULL · `resource_type` · `resource_id` · `detail` jsonb · `ip_address` text · `occurred_at` timestamptz NOT NULL `now()` · `org_id` bigint NOT NULL.
(Column 3 dropped historically.) **Indexes:** `audit_log_actor (actor_oid, occurred_at DESC)`, `audit_log_org_occurred (org_id, occurred_at DESC)`, pkey. **Three RLS policies** (§6.3).

### 1.20 Derived / de-identified history (🔵 — no worker column by design)

These three replaced the dropped worker-identified "surveillance tables"
(`workforce_metrics`/`stop_scoring_history`) via `legacy_20260508_replace_surveillance_tables.sql`.

**`public.stop_effort_history`** · 6 rows. Per-stop service effort. Comment: *"Derived from
core.visits and core.observations. No user_id — worker-safe by structure. Keyed by (stop_id, visit_id)."*
Columns: `id` PK · `stop_id` text NOT NULL (FK→transit_stops CASCADE) · `visit_id` bigint NOT NULL (FK→core.visits CASCADE) ·
`run_date` date NOT NULL · `service_minutes` int · `stop_type` text NOT NULL (CHECK hotspot/compactor/standard) ·
`complexity_score` numeric(4,2) (**always written NULL** — ISSUE-008) · `had_hazard` bool NOT NULL `false` ·
`had_infra_issue` bool NOT NULL `false` · `trash_volume` numeric(4,2) · `computed_at` · `org_id` NOT NULL.
Unique `(stop_id, visit_id)`. `intelligence_reader` holds SELECT.

**`public.stop_condition_history`** · 0 rows. Comment: *"Per-stop condition score history. Derived
from core.observations via riskMapService. No workforce_score — worker-safe by structure."*
Columns: `id` PK · `stop_id` (FK→transit_stops CASCADE) · `visit_id` bigint NOT NULL (FK→core.visits CASCADE) ·
`scored_at` · `cleanliness_score`/`safety_score`/`infra_score` numeric(5,2) · `asset_id` (FK→assets) · `org_id` NOT NULL.
Unique `(stop_id, visit_id)`.

**`public.stop_risk_snapshot`** · 0 rows. PK `(stop_id)`. De-identified per-stop risk aggregate
(19 columns: `stop_id`, `is_hotspot`, `days_since_last_l3`, `recent_trash_volume_avg`,
`last_hazard_at/_severity`, `infra_issue_score`, `cleanliness_score`, `safety_score`,
`infrastructure_score`, `combined_risk_score`, `computed_at`, `hotspot_weight`, `l3_urgency_weight`,
`has_recent_hazard`, `hazard_days_ago`, `hazard_decay_factor`, `asset_id`, `org_id`). FKs:
asset_id→assets, stop_id→transit_stops. `TRUNCATE`+rebuilt by the risk-map job; `intelligence_reader` holds SELECT.

### 1.21 EAM bridge plumbing (⚫)

**`public.eam_bridge_route_log`** · 0 rows. EAMS-facing contract. Comment: *"One row per completed
route run. Contains NO worker identity — no actor_oid, no captured_by_oid, no user_id. Read-only
from EAMS; written by populateEamBridge.ts. Schema changes require coordination with KCM IT / EAMS."*
Columns: `id` PK (seq) · `org_id` NOT NULL (FK) · `route_run_id` bigint NOT NULL (FK→route_runs) · `completed_at` ·
`stop_count` int `0` · `exception_count` int `0` · `canonical_summary` jsonb `'{}'` · `logged_at`. Unique `(route_run_id)`.

**`public.eam_bridge_populate_state`** · 1 row · **not RLS**. Singleton watermark: `id` int `1` (CHECK id=1) · `watermark` timestamptz NOT NULL `'1970-01-01'`.

### 1.22 `public.export_delete_tokens` — ⚫ GDPR-style export-delete plumbing · 0 rows

Columns: `id` PK (seq) · `token_hash` text NOT NULL UNIQUE (sha256) · `org_id` **text** NOT NULL · `actor_oid` text NOT NULL ·
`export_path` text NOT NULL · `issued_at` · `expires_at` NOT NULL · `consumed_at`. Comment warns hard delete is permanent. Note `org_id` is `text` here (its RLS policy uses text comparison). **Index** `export_delete_tokens_org_expires`.

### 1.23 `public.lead_route_overrides` — 🟡 routing override + light attribution · 0 rows

Columns: `id` uuid PK `gen_random_uuid()` · `pool_id` text NOT NULL · `stop_id` text NOT NULL ·
`override_type` text NOT NULL (CHECK FORCE_INCLUDE/FORCE_EXCLUDE/PRIORITY_BUMP) · `value` numeric ·
`created_by` text NOT NULL (🔴 Lead OID who set it) · `created_at` · `org_id` bigint NOT NULL.
**Indexes:** `idx_overrides_pool_stop`, `idx_overrides_pool_type`. No FKs declared.

### 1.24 `public.stops_legacy` — ⚫ legacy artifact · 14,916 rows · **no app read/write**

The original `stops` table (renamed when `public.stops` became a view). **UPPERCASE column names**
(`STOP_ID` PK, `TRF_DISTRICT_CODE`, `BAY_CODE`, … `ON_STREET_NAME`, `INTERSECTION_LOC`,
`KCM_MANAGED_EQUIPMENT`, `ROUTE_LIST`, `NUM_SHELTERS`, `STOP_STATUS`, `GISOBJID`, `lon`, `lat`,
`is_hotspot`, `compactor`, `has_trash`, `notes`, `pool_id`, `last_level3_at`, `priority_class`,
`asset_id`, `org_id`). **CHECKs:** priority_class IN (light/medium/hotspot); hotspot↛light consistency.
- **No reference in `backend/src` or `backend/scripts` `*.ts`** at all — BUT it is **read by the 5 matviews and `stop_assets_v1`** (see §2, §8). Index `idx_stops_pool_id`.

### 1.25 `public.schema_migrations` — ⚫ migration runner state · 61 rows · **not RLS**

`filename` text PK · `applied_at` timestamptz NOT NULL `now()`. Written one row per applied migration by `migrate.ts`. (See §9.5 for the full ledger.)

---

# Section 2 — View Inventory

All views/matviews are **owned by `fieldpro`** with `security_invoker` **unset** (PG14.18 —
`security_invoker` requires PG15+). Consequence: every view executes underlying base-table
access **as `fieldpro`** (the owner), not as the querying role — the PG14 view-owner privilege
bridge (ISSUE-029). Grants per view are in §7.

## 2A — `core.v_*_transit` adapter views (the per-log passthroughs)

These six log views share one shape: passthrough of the underlying `public.*` log table +
`location_id` (via `core.v_stop_location_map`) + a `COALESCE(...)` `org_id_resolved`. **Each
exposes the underlying table's worker column.** `intelligence_reader` holds SELECT on all of them.

### 2.1 `core.v_clean_logs_transit` — 🔴 exposes `user_id`
```sql
SELECT cl.id, cl.route_run_stop_id, cl.stop_id, cl.user_id, cl.cleaned_at, cl.duration_minutes,
       cl.picked_up_litter, cl.emptied_trash, cl.washed_shelter, cl.washed_pad, cl.washed_can,
       cl.level, cl.notes, cl.photo_keys, cl.asset_id, slm.location_id,
       COALESCE(a.org_id, rr.org_id, slm.org_id) AS org_id_resolved
FROM clean_logs cl
  LEFT JOIN assets a ON a.id = cl.asset_id
  LEFT JOIN route_run_stops rrs ON rrs.id = cl.route_run_stop_id
  LEFT JOIN route_runs rr ON rr.id = rrs.route_run_id
  LEFT JOIN core.v_stop_location_map slm ON slm.stop_id = cl.stop_id;
```
**Depends on:** `clean_logs`, `assets`, `route_run_stops`, `route_runs`, `core.v_stop_location_map`.
**Exposed columns incl. work-attribution:** `user_id`, `cleaned_at`, `duration_minutes`, the 5 task booleans, `level`, `notes`, `photo_keys`.

### 2.2 `core.v_hazards_transit` — 🔴 exposes `reported_by`
Passthrough of `hazards` (`id, stop_id, route_run_stop_id, reported_at, reported_by, hazard_type,
severity, notes, details, photo_key, asset_id`) + `location_id` + `org_id_resolved`. Same 4 LEFT JOINs.

### 2.3 `core.v_infra_transit` — 🔴 exposes `reported_by`
Passthrough of `infrastructure_issues` (`id, stop_id, route_run_stop_id, reported_at, reported_by,
issue_type, severity, notes, component, cause, needs_facilities, details, photo_keys, photo_key, asset_id`)
+ `location_id` + `org_id_resolved`. (Not named in the prior adapter audit — newly confirmed.)

### 2.4 `core.v_level3_logs_transit` — 🔴 exposes `user_id`
Passthrough of `level3_logs` (`id, route_run_stop_id, stop_id, cleaned_at, user_id, level, notes, asset_id`)
+ `location_id` + `org_id_resolved`.

### 2.5 `core.v_stop_photos_transit` — 🔴 exposes `created_by_oid`
Passthrough of `stop_photos` (`id, route_run_stop_id, s3_key, kind, captured_at, created_by_oid, asset_id`)
+ `location_id` (via `rrs.stop_id`) + `org_id_resolved` + `rrs.stop_id`. Joins through `route_run_stops` for stop_id.

### 2.6 `core.v_trash_volume_logs_transit` — 🟡 no direct worker col
Passthrough of `trash_volume_logs` (`id, route_run_stop_id, stop_id, logged_at, volume, notes, asset_id,
created_at, updated_at`) + `location_id` + `org_id_resolved`.

### 2.7 `core.v_assignments_transit` — 🟡 routing (derived from route state)
```sql
SELECT rrs.id AS source_route_run_stop_id, rr.org_id, 'route_stop'::text AS assignment_type,
       rrs.status, vt.location_id, rrs.asset_id AS primary_asset_id, rr.id AS source_route_run_id,
       rrs.sequence, rrs.created_at
FROM route_run_stops rrs
  JOIN route_runs rr ON rr.id = rrs.route_run_id
  LEFT JOIN core.v_locations_transit vt ON vt.stop_id = rrs.stop_id;
```
**Depends on:** `route_run_stops`, `route_runs`, `core.v_locations_transit`. No worker column exposed (but `source_route_run_id` → `route_runs.assigned_user_oid` is one hop away).

## 2B — `core.*` bridge/translation views (canonical-side, survive)

### 2.8 `core.v_locations_transit` — 🟢 stop_id↔location_id translation
```sql
SELECT l.id AS location_id, l.org_id, l.location_type, l.label, l.lon, l.lat,
       lei.source_system, lei.external_id AS stop_id
FROM core.locations l
  JOIN core.location_external_ids lei ON lei.location_id = l.id
WHERE l.location_type = 'transit_stop' AND lei.source_system = 'metro_stop';
```
**Depends on:** `core.locations`, `core.location_external_ids` (both canonical, FORCE RLS). Backs `ensureVisitForRouteRunStop` location resolution.

### 2.9 `core.v_stop_location_map` — 🟢 minimal stop_id→location_id map
```sql
SELECT lei.org_id, lei.external_id AS stop_id, lei.location_id
FROM core.location_external_ids lei WHERE lei.source_system = 'metro_stop';
```
Used inside the six `core.v_*_transit` log views to attach `location_id`.

### 2.10 `core.v_asset_locations_transit` — 🟢
`SELECT al.* (asset_location_id, org_id, location_id, asset_id, role, active, installed_at, removed_at, notes) + vt.stop_id FROM core.asset_locations al JOIN core.v_locations_transit vt ON vt.location_id = al.location_id;`

### 2.11 `core.v_assets` — 🟢 passthrough of `public.assets` (`id, org_id, asset_type_id, seed_key, lon, lat, display_name, active, created_at, updated_at`).
### 2.12 `core.v_locations` — 🟢 passthrough of `core.locations`.

## 2C — `public.*` views

### 2.13 `public.stops` — 🟢 **read-only view over `transit_stops`** (lowercase columns)
Passthrough of `transit_stops` (all columns except `org_id`). **`INSTEAD OF INSERT/UPDATE/DELETE`
trigger `trg_stops_readonly`** raises *"public.stops is read-only. Write to public.transit_stops instead."*
Heavily read by route-planning/candidate code, clean-logs label joins, `loadRouteRunById`, dashboards. `intelligence_reader` holds SELECT.

### 2.14 `public.stop_assets_v1` — 🟢 `stops_legacy` ⨝ `assets` (stop_id, asset_id, org_id, asset_type_id, lon, lat, display_name, pool_id, is_hotspot, priority_class, has_trash, compactor). **Reads `stops_legacy`.** No app read found.
### 2.15 `public.transit_stop_assets_v1` — 🟢 `transit_stops` ⨝ `transit_stop_assets` ⨝ `assets`. No app read found.
### 2.16 `public.export_pool_daily_summary_v1` — 🔵 aggregates `stop_status_mv` by pool/date.
### 2.17 `public.export_route_run_origin_mix_v1` — 🟡 aggregates `route_run_stops` origin_type per run.
### 2.18 `public.export_stop_status_v1` — 🔵 passthrough of `stop_status_mv`.

## 2D — Materialized views (🔵 — **all dead in code**)

Per Phase-0 findings and confirmed here: **no application code reads or `REFRESH`es any of the
5 matviews** (no `_mv` read, no `REFRESH MATERIALIZED` in `backend/src` / `backend/scripts`).
The `export_*_v1` views read two of them but those export views themselves have no confirmed app reader.

### 2.19 `public.stop_status_mv` — the large one
Reads (via CTEs): `stop_risk_snapshot`, `hazards`, `infrastructure_issues`, `clean_logs`,
`level3_logs`, `stops_legacy`. **Aggregates only — selects no worker column** (counts/maxes by
`stop_id`; e.g. `count(*) FILTER (...30 days...)` on hazards/infra/clean, `max(cleaned_at)`).
Indexes: unique `(stop_id)`, `(pool_id)`.

### 2.20–2.23 `cleanliness_risk_mv`, `infrastructure_risk_mv`, `level3_compliance_mv`, `safety_risk_mv`
Each = `stop_risk_snapshot r JOIN stops_legacy s ON s."STOP_ID" = r.stop_id`, projecting risk
columns + aging buckets. No worker columns. Each has a unique `(stop_id)` index (+ pool/score indexes).

---

# Section 3 — Write Path Inventory

Every `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` against a `public.*` table from backend code. Routers
mounted under `/api` (`backend/src/app.ts:40-53`). "Dual-write" = same code path also writes
canonical `core.*`.

## 3.1 `clean_logs`
- **INSERT** — `cleanLogService.ts:97-109` `completeStop()`:
  ```sql
  INSERT INTO clean_logs (visit_id, route_run_stop_id, stop_id, asset_id, user_id,
    duration_minutes, picked_up_litter, emptied_trash, washed_shelter, washed_pad, washed_can,
    photo_keys, cleaned_at, org_id) VALUES ($1..$14) RETURNING id
  ```
  Trigger: `POST /api/route-run-stops/:id/complete` (`routeRunStopRoutes.ts:423`→`:527`). **Dual-write:** same txn writes `core.visits`(+`visit_actor_audit`), `core.observations`(+`observation_actor_audit`), updates `route_run_stops`, inserts `trash_volume_logs`/`stop_effort_history`. Canonical truth = `core.observations`/`core.visits`; `clean_logs` is the legacy/adapter side.

## 3.2 `route_run_stops`
- **INSERT** (route create) — `routeRunService.ts:392-397` `createRouteRun()`: `INSERT INTO route_run_stops (route_run_id, stop_id, asset_id, sequence, planned_distance_m, planned_duration_s, org_id) VALUES ($1,$2,$3,$4,$5,$6,(SELECT org_id FROM route_runs WHERE id=$1))`. Trigger: `POST /api/route-runs` (`routeRunRoutes.ts:553/620`), dev `POST /api/dev/generate-route-run`. **Dual-write:** `route_runs` + `core.assignments` + `core.assignment_actor_audit`. Annotation `:415-417` (creator identity → no-grant sidecar, never onto core.assignments).
- **UPDATE** (start) — `operations/startRouteRunStop.ts:43-51` `startRouteRunStopInternal()`: `UPDATE route_run_stops SET status='in_progress', started_at=COALESCE(started_at,NOW()), updated_at=NOW() WHERE id=$1 AND status=ANY($2::text[]) RETURNING *`. Trigger: `POST /api/route-run-stops/:id/start`. **Dual-write:** `ensureVisitForRouteRunStop`→`core.visits`(+sidecar). Annotations: RLS PATTERN-001 note (`:17-25`); no-manufactured-arrival-state (`:66-73`).
- **UPDATE** (set trash_volume on complete) — `cleanLogService.ts:123-126`: `UPDATE route_run_stops SET trash_volume=$1 WHERE id=$2`.
- **UPDATE** (mark done) — `cleanLogService.ts:134-137`: `UPDATE route_run_stops SET status='done', completed_at=$2, updated_at=$2 WHERE id=$1`.
- **UPDATE** (skip with hazard) — `routeRunStopRoutes.ts:239-247`: `UPDATE route_run_stops SET status='skipped', hazard_id=$1, completed_at=NOW(), updated_at=NOW() WHERE id=$2 RETURNING *`. Trigger: `POST /api/route-run-stops/:id/skip-with-hazard`. **Dual-write:** `createHazardForRouteRunStop`→`hazards`+`core.visits`; `emitObservationsForStop`→`core.observations`.
- **UPDATE** (set hazard_id on complete when safety present) — `routeRunStopRoutes.ts:513-516`.
- **INSERT** (dev fixture) — `devRoutes.ts:146-150` (`POST /api/dev/seed-axe-fixture`).

## 3.3 `route_runs`
- **INSERT** — `routeRunService.ts:340-347` `createRouteRun()`: `INSERT INTO route_runs (user_id, route_pool_id, base_id, run_date, status, total_distance_m, total_duration_s, assigned_user_oid, created_by_oid, shift_type) VALUES ($1..$7,'planned'→$5..., $7,$8,$9) RETURNING id` (status literal 'planned'). Annotation `:338-339` ("Enterprise Identity: Insert OIDs…"). **Dual-write** with `core.assignments`(+sidecar).
- **UPDATE** (start) — `routeRunService.ts:471-479` `startRouteRun()`: `SET status='in_progress', started_at=COALESCE(started_at,NOW()), updated_at=NOW()`. Trigger `POST /api/route-runs/:id/start`.
- **UPDATE** (finish) — `routeRunService.ts:496-503`: `SET status='completed', finished_at=NOW(), updated_at=NOW()`. `POST /api/route-runs/:id/finish`.
- **UPDATE** (auto-complete) — `routeRunService.ts:540-547` `checkAndCompleteRouteRun()`: `SET status='finished', finished_at=COALESCE(...)` WHERE status NOT IN (finished,completed). Called at end of `completeStop()`.
- **UPDATE** (assign) — `routeRunService.ts:556-561` `assignRouteRun()`: `SET assigned_user_oid=$1, updated_at=NOW() WHERE id=$2`. `PATCH /api/route-runs/:id/assign`.
- **INSERT** (dev fixture) — `devRoutes.ts:134-138`.

## 3.4 `hazards`
- **INSERT** — `hazardService.ts:59-75` `createHazardForRouteRunStop()`: `INSERT INTO hazards (visit_id, stop_id, asset_id, route_run_stop_id, reported_by, hazard_type, photo_key, severity, notes, details, reported_at, org_id) VALUES ($1..$10, NOW(), $11) RETURNING *`. Triggers: skip-with-hazard, and complete when `safety.hazard_types` present. **Dual-write:** `ensureVisitForRouteRunStop`→`core.visits`; `emitObservationsForStop`→`core.observations` (canonical safety `*_present` types — riskMapService reads canonical, not this table).

## 3.5 `infrastructure_issues`
- **INSERT** (loop, one per issue) — `infrastructureIssueService.ts:48-67`: `INSERT INTO public.infrastructure_issues (visit_id, route_run_stop_id, stop_id, asset_id, reported_by, issue_type, photo_key, component, cause, notes, details, needs_facilities, reported_at, org_id) VALUES ($1..$12, NOW(), $13) RETURNING *`. Called from `completeStop()` (`cleanLogService.ts:113`). **Dual-write** within completeStop txn (canonical = `core.observations` 8 specific `*_present` infra types).

## 3.6 `stop_photos`
- **INSERT** (loop per key) — `stopPhotosService.ts:42-49` `createStopPhotos()`:
  ```sql
  INSERT INTO stop_photos (visit_id, route_run_stop_id, asset_id, s3_key, kind, created_by_oid, captured_at, org_id)
  SELECT id, $2, $3, $4, $5, $6, NOW(), org_id FROM core.visits WHERE client_visit_id = $1 LIMIT 1
  ```
  Trigger: `POST /api/route-runs/:runId/stops/:stopId/photos` (`ulRoutes.ts:217`→`:290`). **Dual-write:** `core.evidence`(+`evidence_actor_audit`). **Annotations (verbatim):** `:41` `// Existing transit write (additive discipline — do not remove)`; `:57-58` canonical evidence write → no-grant sidecar.

## 3.7 `trash_volume_logs`
- **INSERT** — `cleanLogService.ts:127-131`: `INSERT INTO trash_volume_logs (visit_id, route_run_stop_id, stop_id, asset_id, volume, org_id) VALUES ($1..$6)` (when `trashVolume !== undefined`). Part of completeStop dual-write; canonical = `core.observations` `trash_volume`.

## 3.8 `stop_effort_history`
- **INSERT…SELECT** — `cleanLogService.ts:170-230` `completeStop()`: derived aggregate that **reads `core.observations`/`core.visits`** (and `public.stops`) to populate `stop_effort_history (stop_id, visit_id, run_date, service_minutes, stop_type, complexity_score[=NULL], had_hazard, had_infra_issue, trash_volume, org_id)`, `ON CONFLICT (stop_id, visit_id) DO NOTHING`. `had_hazard`/`had_infra_issue` are `EXISTS` over the 8 specific safety / 8 specific infra `*_present` observation types. Annotations `:187-189`, `:204-206` (umbrella retirement §2.1).
- **DELETE** — `exportDeleteRoutes.ts:386-389`: `DELETE FROM stop_effort_history WHERE visit_id = ANY($1::bigint[])` (`POST /api/admin/export-and-delete/execute`). Annotation `:375-376` (no org_id; scope via visit_id FK).

## 3.9 `stop_condition_history`
- **INSERT…SELECT** — `riskMapService.ts:284-303` `rebuildStopRiskSnapshot()`: reads `stop_risk_snapshot`⨝`transit_stop_assets`⨝`core.visits` (visits in last day), `ON CONFLICT (stop_id, visit_id) DO NOTHING`. Trigger: `POST /api/admin/intelligence/rebuild-risk-map` + CLI `riskMapJob`. Annotation `:281-283` (Path B/C one-hop translation).
- **DELETE** — `exportDeleteRoutes.ts:392-395`.

## 3.10 `stop_risk_snapshot`
- **TRUNCATE + INSERT…SELECT (canonical)** — `riskMapService.ts:42` (`TRUNCATE`) + `:237-276` `rebuildStopRiskSnapshot()`. Source CTEs read `core.observations`/`core.visits` + `transit_stops`/`transit_stop_assets`. Trigger: `POST /api/admin/intelligence/rebuild-risk-map`; CLI `riskMapJob.ts`. Annotation `:46-62` (Tier 2 migration to canonical).
- **TRUNCATE + INSERT…SELECT (LEGACY, dead)** — `riskMapService.ts:330` + `:448-487` `rebuildStopRiskSnapshotLegacy()`: reads legacy `level3_logs`/`trash_volume_logs`/`hazards`/`infrastructure_issues`. **No application caller** (dormant additive-verification code). Annotation `:317-324` ("Delete once verified").

## 3.11 `transit_stops` — ⚠️ bare-pool writes (PATTERN-001 risk; table IS force-RLS)
- **UPDATE** is_hotspot — `stopRoutes.ts:81-85` (`PATCH /api/stops/:stop_id/hotspot`).
- **UPDATE** compactor — `stopRoutes.ts:176-180` (`PATCH /api/stops/:stop_id/compactor`).
- **UPDATE** has_trash — `stopRoutes.ts:271-275` (`PATCH /api/stops/:stop_id/has-trash`).
  > These three use bare `pool.query()` with **no `withOrgContext`** wrapper. `transit_stops` is FORCE RLS (verified) → §10 Q5.
- **UPDATE** (admin single, pool/notes) — `adminStopService.ts:137-156` `updateStop()` (dynamic SET), `PATCH /api/admin/stops/:id`. Annotations `:122` (pool_id is deprecated cache), `:160` (dual-write to stop_pool_memberships).
- **UPDATE** (admin bulk: pool_id/is_hotspot/compactor/has_trash) — `adminStopService.ts:223,251,259,267`, `POST /api/admin/stops/bulk`.
- **DELETE/INSERT** (RLS test) — `scripts/verify_rls.ts` (CLI only).

## 3.12 `stop_pool_memberships`
- **UPDATE/INSERT (sync)** — `adminStopService.ts:164,169-177` (single, `PATCH /api/admin/stops/:id`) and `:231,236-245` (bulk, `POST /api/admin/stops/bulk`). The authoritative membership table kept in sync alongside the deprecated `transit_stops.pool_id` cache.

## 3.13 `route_pools`
- **INSERT** `adminPoolService.ts:41-45` (`POST /api/admin/pools`); **UPDATE** `:85-90` (`PATCH /api/admin/pools/:id`); **UPDATE soft-delete** `:97-101` (`DELETE /api/admin/pools/:id`); DELETE/INSERT in `verify_rls.ts`.

## 3.14 `lead_route_overrides`
- **INSERT** — `routeOverrideService.ts:49-55` `addOverride()` (`POST /api/route-overrides/add`); **DELETE** `:76` (`DELETE /api/route-overrides/:id`).

## 3.15 `identity_directory`
- **INSERT…ON CONFLICT (oid) DO UPDATE** — `authz.ts:113-122` `upsertIdentity()` inside `withOrgContext`. Trigger: fire-and-forget on **every authenticated request** (`authz.ts:221`). Annotation `:110-111` (RLS context required).

## 3.16 `audit_log`
- **INSERT (central writer)** — `middleware/auditLog.ts:31-43` `writeAuditLog()`. Callers: auth (`authz.ts:135`), dev-bypass login (`devAuthBypass.ts:82`), generic `auditWrite()` middleware across admin routes, EAM bridge CLI (`populateEamBridge.ts:123`), SFTP export CLI (`sftpExport.ts:534`), OID decrypt audit (`oidCipher.ts:337`).
- **INSERT (in export-delete txn)** — `exportDeleteRoutes.ts:463-465` (writes `export.delete_execute` before purge).
- **DELETE (export-delete purge)** — `exportDeleteRoutes.ts:493-496`: `DELETE FROM audit_log WHERE org_id=$1` (`POST /api/admin/export-and-delete/execute`; relies on `app.export_delete_active`/`app.export_delete_org_id` settings — §6.3).

## 3.17 `export_delete_tokens`
- **INSERT** `exportDeleteRoutes.ts:192-196` (`POST /api/admin/export-and-delete/request`); **UPDATE** consumed `:451-453` (execute).

## 3.18 `assets`
- **INSERT…ON CONFLICT (org_id,asset_type_id,seed_key) DO UPDATE** — `assetService.ts:190-200` `seedAssets()` (HTTP `POST /api/admin/tenant/assets/seed` → `tenantRoutes.ts:502`); and CLI `scripts/seed_transit_assets.ts:401-432`. Same script also upserts `core.asset_types` + `core.observation_type_registry`. Annotation `:165-167` (asset_type_id bridge via code).

## 3.19 `schema_migrations`
- **INSERT** — `scripts/migrate.ts:88-91` (`npm run migrate`, one row per applied file).

## 3.20 `eam_bridge_route_log` / `eam_bridge_populate_state`
- **INSERT…ON CONFLICT (route_run_id) DO NOTHING** — `populateEamBridge.ts:86-99` (CLI/cron). Also UPDATE `eam_bridge_populate_state SET watermark=$1 WHERE id=1` (`:112-115`), and audit_log write.
- **DELETE** `eam_bridge_route_log WHERE org_id=$1` — `exportDeleteRoutes.ts:402-404`.

## 3.21 `organizations` — **no production write** (only `verify_rls.ts` fixtures).

## 3.22 Tables with NO application write path
`stops` (view, write-blocked by trigger), `level3_logs` (0 rows, no writer), `transit_stop_assets`
(trigger/seed-populated — §10 Q4), `asset_types`, `asset_external_ids`, `bases`, `stops_legacy`
(no `*.ts` reference at all), `organizations` (prod). **`route_run_audit` does not exist.**

---

# Section 4 — Read Path Inventory

Every backend application read (`FROM`/`JOIN`) of a `public.*` table or `core.v_*_transit` view.

## 4A — `core.v_*_transit` views (read only by the Admin Control Center)

- **`core.v_clean_logs_transit`** — read 4× in `adminRoutes.ts` control-center handlers, **selecting only `duration_minutes`, `cleaned_at`, `location_id`, `asset_id`** (never `user_id`):
  - `:1042` `/overview` — `clean_metrics` CTE (`COUNT(*)`, `SUM(duration_minutes)` for today). 🟢 aggregate.
  - `:1387` `/difficulty` heavyStops — `AVG(duration_minutes)` per `location_id` vs median. 🟢.
  - `:1429` `/difficulty` heavyRoutes — `SUM/COUNT(duration_minutes)` joined to `v_assignments_transit`. 🟢.
  - `:1461` `/difficulty` hotspots — heavy `location_id`s joined to `v_assignments_transit`. 🟢.
- **`core.v_hazards_transit`** — `:1051` `/overview` `hazard_metrics` CTE (`COUNT(*)`, `COUNT FILTER severity>=4`, by `reported_at` date). 🟢 (no `reported_by` selected).
- **`core.v_assignments_transit`** — JOIN partner in `/difficulty` heavyRoutes/hotspots (`source_route_run_id`, `assignment_type`, `primary_asset_id`, `location_id`). 🟢.
- **`core.v_locations_transit`** — `/difficulty` heavyStops label join (`adminRoutes.ts:1411`); **visit context resolution** `visitService.ts:42` `getVisitContext()` (`stop_id`→`location_id`, feeds `ensureVisitForRouteRunStop`); **assignment backfill** `routeRunService.ts:435` (in `core.assignments` INSERT…SELECT). 🟢 translation.

> **`core.v_infra_transit`, `v_level3_logs_transit`, `v_stop_photos_transit`, `v_trash_volume_logs_transit`, `v_stop_location_map`, `v_asset_locations_transit`, `v_assets`, `v_locations` are NOT read by any application code** (the log views are written-through-base-table only; `v_stop_location_map` is used only inside other views). `intelligence_reader` nonetheless holds SELECT on all of them (§7).

## 4B — `public.*` tables

### `route_runs` (10 reads)
- **🟢 aggregate/routing:** `/control-center/routes` route_base CTE (`adminRoutes.ts:1139`); admin dashboard counts (`:62/:68`); EAM unlogged-runs (`populateEamBridge.ts:42`).
- **🟡 selects `user_id` (unused downstream):** admin route-runs list (`adminRoutes.ts:597`), ops route-runs list (`opsRoutes.ts:291`), routes active list (`routeRunRoutes.ts:123`).
- **🔴 attribution-dependent:** **`loadRouteRunById.ts:68`** (selects `assigned_user_oid`, `created_by_oid`, `user_id`; JOINs `identity_directory` ×2 for display names — the documented controlled exception; called from `/api/ul/todays-run`, worker submit/skip, route GET/create/start/finish, dev); `/ul/todays-run` lookup `ulRoutes.ts:117` (filter `assigned_user_oid=$1`); assign lookup `routeRunRoutes.ts:1038`; dev seed `devRoutes.ts:113`.

### `route_run_stops` (7 read clusters)
- 🟢/🟡: `/control-center/routes` counts/observed-minutes/deviation (`adminRoutes.ts:1158/1168/1181`, joins `clean_logs`); `/control-center/exceptions` skips+emergency (`:1278/:1307`); clean-logs join (`adminRoutes.ts:702/714`, `opsRoutes.ts:402/414`); stop-count subselects; `loadRouteRunById.ts:79/94` per-stop rows (selects `completed_at` — per-stop completion timing 🟡/🔴, no worker col); write-path lookups (`visitService`, `hazardService`, `infrastructureIssueService`, `cleanLogService.ts:49 FOR UPDATE`, `stopPhotosService`, `startRouteRunStop`); EAM stop summary (`populateEamBridge.ts:59`).

### `clean_logs` (3 reads)
- **🔴 `SELECT cl.*`** — admin & ops clean-logs list (`adminRoutes.ts:701/713` `GET /admin/clean-logs`; `opsRoutes.ts:401/413` `GET /api/ops/clean-logs`), joined to `route_run_stops`/`route_runs`/`stops`, paginated. Surfaces the **full `clean_logs` row including `user_id`**. → UI: Lead Completed Route + Clean Logs (§5).
- 🟢: `/control-center/routes` observed-minutes `SUM(duration_minutes)` (`adminRoutes.ts:1171`); `loadRouteRunById.ts:81` (5 action booleans only).

### `hazards` / `infrastructure_issues`
- 🟢: `/control-center/exceptions` — skip-reason join + `COUNT(*)` today (`adminRoutes.ts:1279/1295`, `:1301`). No `reported_by` selected.
- Dead: `rebuildStopRiskSnapshotLegacy()` reads both (no caller).

### `transit_stops` / `public.stops` (view)
- 🟢 routing/reference everywhere: risk-snapshot base set (`riskMapService.ts:69`); admin stop list (`adminStopService.ts:57/79`); **candidate stops** `getCandidateStopsForPoolWithRisk()` (`routeRunService.ts:40/93`, joins `stop_pool_memberships`+`stop_risk_snapshot`); asset_id resolution (`routeRunService.ts:372/433`); clean-logs label joins; `/difficulty` labels; `loadRouteRunById.ts:80` stop master; dashboard `COUNT(*)`; route plan/preview (`routeRunRoutes.ts:302/412/596`); dev (`devRoutes.ts:124/185`).

### `transit_stop_assets`
- 🟢 translation: `riskMapService.ts:80/95/113/140/296` (`asset_id`↔`stop_id`, active primary). Risk job + condition-history write.

### `stop_risk_snapshot`
- 🟢: candidate ranking `LEFT JOIN` (`routeRunService.ts:45`); re-read by rebuild for condition-history (`riskMapService.ts:295`).

### `stop_pool_memberships`
- 🟢: candidate-stops join (`routeRunService.ts:41/95`); admin stop pool filter (`adminStopService.ts:51`).

### `route_pools`
- 🟢: pool list (`resourceRoutes.ts:63` `GET /api/pools`); admin pools (`adminPoolService.ts:24`); counts/validation/org-resolution (`adminRoutes.ts:59`, `adminStopService.ts:109/210`, `routeOverrideService.ts:53`, `routeRunRoutes.ts:579`, `devRoutes.ts:175`); label joins (`adminRoutes.ts:598`, `opsRoutes.ts:292`, `loadRouteRunById.ts:69`).

### `bases`
- 🟢: `routeRunService.ts:201` (`id, lon, lat` for OSRM).

### `assets`
- 🟢: org resolution `visitService.ts:41`, `routeRunService.ts:434` (`a.org_id` via `asset_id`).

### `asset_types`
- 🟢: `assetService.ts:171` (`code` bridge join), seed script.

### `identity_directory` (🔴/⚫ attribution by purpose)
- **`resourceRoutes.ts:162` `GET /api/users`** — worker directory for the assignment picker (`oid, display_name, email, last_seen_role`). → UI: Route Create Panel dropdown.
- **`loadRouteRunById.ts:77/78`** — the documented controlled-exception JOIN (assigned/creator display names).

### `audit_log` (⚫ compliance)
- `adminRoutes.ts:879/885` `GET /admin/audit-log` (selects `actor_oid`, JSON/CSV); `exportDeleteRoutes.ts:155` + `sftpExport.ts` export `SELECT *`.

### `lead_route_overrides`
- 🟡: `routeOverrideService.ts:31` `getOverridesByPool()` (selects `created_by`; routing logic ignores it). Read by candidate selection + override UI.

### `stop_effort_history` / `stop_condition_history`
- **Export-only:** `exportDeleteRoutes.ts:139/144` + `sftpExport.ts:231/237` (`SELECT *` by `visit_id`). No dashboard/intelligence read.

### EAM + tokens + org
- `eam_bridge_route_log` idempotency check + export; `eam_bridge_populate_state` watermark read; `export_delete_tokens` lifecycle; `organizations` org-resolution (auth middleware every request) + export metadata.

### Adapter objects with NO application read
`level3_logs` (live), `trash_volume_logs` (live — only dead legacy reads them), `route_run_audit`
(doesn't exist), `stops_legacy` (only RLS-test + the matviews/`stop_assets_v1`), `asset_external_ids`
(only RLS-test), the 4 unread `core.v_*_transit` log views, `v_stop_location_map`/`v_asset_locations_transit`/`v_assets`/`v_locations`, all 5 matviews, `stop_assets_v1`/`transit_stop_assets_v1`/`export_*_v1` views.

### Attribution-sensitive reads (would break/change if work-attribution is clipped)
1. `loadRouteRunById` (`assigned_user_oid`/`created_by_oid` + `identity_directory` JOIN) — controlled exception.
2. `/ul/todays-run` + `assigned_user_oid` reads (`ulRoutes.ts`, `routeRunRoutes.ts:1038`, `devRoutes.ts`).
3. `/api/users` (`identity_directory`) — assignment picker.
4. `/admin/clean-logs` & `/ops/clean-logs` `SELECT cl.*` — exposes `clean_logs.user_id`.
5. `listStopPhotosByRouteRunStop` (`stop_photos.created_by_oid`) — `stopPhotosService.ts:110`.
6. `/admin/audit-log` + export reads of `audit_log`/`stop_effort_history` (compliance, intentionally attributed).
7. Light: route-run lists select `route_runs.user_id`; `lead_route_overrides.created_by`.

**Every intelligence/dashboard read** (Control Center overview/routes/exceptions/difficulty, risk-map
job, candidate ranking, condition/effort history except export) reads **routing/reference only — no
worker-attribution column** — consistent with the labor-safety boundary.

---

# Section 5 — UI Surface Inventory

(Frontend API client: `frontend/src/api/routeRuns.ts`; router `App.tsx`.)

| UI surface | File | Endpoint(s) | What it shows | Class | Post-clip impact |
|---|---|---|---|---|---|
| **Lead Completed Route + Clean Logs** | `components/LeadCompletedRouteDetail.tsx` | `GET /api/lead/route-runs/:id`, **`GET /api/ops/clean-logs`** | Per-stop clean-log table: **`cleaned_at` (toLocaleString)**, washed pad/shelter, litter, trash vol | 🔴 work-attribution | **Highest — visibly breaks** (only UI rendering a completion timestamp; source = `public.clean_logs` via `cl.*`) |
| Specialist Stop Detail / Work Wizard | `components/today-route/StopDetail.tsx` | `GET /api/ul/todays-run`, `…/stops/:id/photos` | Completed-stop summary: checklist, trash vol, hazards, infra, photos | 🔴 (self-scoped) | High — richest work rendering; worker views own work. `PhotoDto.created_by_oid` fetched but **not rendered** |
| Admin Control Center | `components/admin/AdminControlCenter.tsx` | `GET /api/admin/control-center/{overview,routes,exceptions,difficulty}` | Anonymous aggregates: clean events, observed minutes, hazards, route status, exceptions, difficulty bands | 🔴-derived but aggregated | High lineage (counts/observed-minutes depend on clean-log timestamps); no identity rendered |
| Lead Routes List | `components/LeadRoutesPanel.tsx` | `GET /api/ops/route-runs` | Active/completed run tables: id, pool, status, stop count, date | 🟡 (`user_id` in payload, **unused**) | Medium |
| Lead Active Route Detail | `components/LeadRouteDetail.tsx` | `GET /api/lead/route-runs/:id` | Run header + per-stop status | 🟡 status = which stops done/skipped | Medium |
| Specialist Today Route list | `today-route/StopList(Item).tsx`, `TodayRouteView.tsx` | `GET /api/ul/todays-run` | Ordered stops, location, own status, flags, map | 🟢 + own status | Low |
| Specialist Route Summary | `components/RouteSummary.tsx` | client-derived | Counts (completed/pending/hotspot), base_id, run_date | 🟢 aggregate | Low |
| Admin/Ops Dashboard | `components/admin/AdminDashboard.tsx` | `GET /api/{admin,ops}/dashboard` | total stops/pools, active/completed runs today | 🟢 counts | Low |
| Admin/Ops Stops Panel | `components/admin/AdminStopsPanel.tsx` | `GET /api/{admin,ops}/stops`, `PATCH/POST` | Stop catalog + flags (editable) | 🟢 reference | None |
| Admin/Ops Pools Panel | `components/admin/AdminPoolsPanel.tsx` | `GET /api/{admin,ops}/pools` | Pool catalog | 🟢 reference | None |
| Route Create Panel | `components/RouteCreatePanel.tsx`, `hooks/useCreateRoute.ts` | `GET /api/users`, `POST /api/route-runs/preview\|''` | Pool/specialist select (**shows worker name from `/api/users`**), stop preview | assignment intent (not adapter work-attribution) | Out of ISSUE-031 scope |

**Key UI findings:**
1. The single surface that **visibly breaks** on a clip is `LeadCompletedRouteDetail.tsx` (renders `cleaned_at` + per-task columns from `public.clean_logs`).
2. **No frontend surface renders a worker name from adapter work-attribution data.** The only worker-name display is the Route Create assignment dropdown (from `identity_directory` via `/api/users` — intent, not truth). `route_runs.user_id` and `PhotoDto.created_by_oid` reach payloads but are never rendered.
3. `AdminControlCenter` is entirely work-attribution-**derived** but fully aggregated/anonymous; "observed minutes" / "clean events" depend on clean-log timestamps and rows.

---

# Section 6 — Constraints and Relationships

## 6.1 Foreign keys FROM `public.*` → `core.*` (the adapter→canonical bridge)
All via `visit_id` → `core.visits(id)`:

| Table | FK | On delete |
|---|---|---|
| clean_logs | visit_id→core.visits | SET NULL |
| hazards | visit_id→core.visits | SET NULL |
| infrastructure_issues | visit_id→core.visits | SET NULL |
| level3_logs | visit_id→core.visits | SET NULL |
| stop_photos | visit_id→core.visits | SET NULL |
| trash_volume_logs | visit_id→core.visits | SET NULL |
| stop_condition_history | visit_id→core.visits | CASCADE |
| stop_effort_history | visit_id→core.visits | CASCADE |

## 6.2 Foreign keys FROM `core.*` → `public.*` (canonical depends on public.assets / public.organizations)
**These make `public.assets` and `public.organizations` structurally load-bearing for the canonical layer:**

| Referencing (core) | → Referenced (public) | On delete |
|---|---|---|
| core.asset_locations.asset_id | public.assets | RESTRICT |
| core.asset_locations.org_id, core.asset_types.org_id, core.assignments.org_id, core.assignment_actor_audit.org_id, core.evidence.org_id, core.evidence_actor_audit.org_id, core.location_external_ids.org_id, core.locations.org_id, core.observations.org_id, core.observation_actor_audit.org_id, core.observation_type_registry.org_id, core.visits.org_id, core.visit_actor_audit.org_id | public.organizations | RESTRICT |
| core.assignments.primary_asset_id | public.assets | SET NULL |
| core.observations.asset_id | public.assets | SET NULL |
| core.visits.primary_asset_id | public.assets | SET NULL |

## 6.3 Notable check / unique / policy facts
- **`audit_log` has three RLS policies:** `audit_log_select` (org-scoped read), `audit_log_insert` (org-scoped WITH CHECK), `audit_log_delete` (DELETE permitted **only** when `current_setting('app.export_delete_active')='true'` AND `org_id = app.export_delete_org_id`). So the "UPDATE/DELETE blocked" comment is true except for the guarded export-delete path.
- **Partial uniques:** `transit_stop_assets` one-active-primary-per-stop; `assets` one external_id per org; `organizations` one tenant_uuid.
- **CHECKs:** route_runs.shift_type; route_run_stops.status & origin_type; stop_effort_history.stop_type; lead_route_overrides.override_type; identity_directory.last_seen_role; stops_legacy priority/hotspot consistency; eam_bridge_populate_state singleton.

## 6.4 Triggers on `public.*` (4)
| Table | Trigger | Function | Effect |
|---|---|---|---|
| route_pools | `trg_route_pools_lock_org_base` (BEFORE UPDATE OF org_id,base_id) | `prevent_route_pool_org_base_change_if_used()` | RAISE if route_runs reference the pool |
| route_runs | `trg_route_runs_pool_invariant` (BEFORE INSERT/UPDATE OF route_pool_id,org_id,base_id) | `enforce_route_runs_pool_invariant()` | Autofill/validate org_id & base_id from the pool (this is what makes `INSERT...VALUES(...,'planned',...)` work without explicit org_id) |
| stops (view) | `trg_stops_readonly` (INSTEAD OF INS/UPD/DEL) | `stops_readonly()` | RAISE "public.stops is read-only…" |
| transit_stops | `trg_sync_transit_stop_primary_asset` (AFTER INSERT/UPDATE OF asset_id) | `sync_transit_stop_primary_asset()` | Maintain primary `transit_stop_assets` link. **Latent ISSUE-024:** its `INSERT INTO transit_stop_assets` omits NOT NULL `org_id` → would fail; no runtime path inserts transit_stops today |

---

# Section 7 — Permissions Inventory

Roles: `postgres` (super/bypassrls), `fieldpro` (app, LOGIN, **not** super/bypassrls), `intelligence_reader`
(NOLOGIN), `audit_reader` (NOLOGIN), `mcp_readonly` (LOGIN, the read-only diagnostic role). No role memberships.

- **`fieldpro`** — full `SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER` on every `public.*` and `core.*` object (incl. all four `core.*_actor_audit` sidecars).
- **`intelligence_reader`** — `SELECT` on:
  - **all 12 `core.*` views** including all six `core.v_*_transit` log views (`v_clean_logs_transit` exposing `user_id`, `v_hazards_transit`/`v_infra_transit` exposing `reported_by`, `v_level3_logs_transit` exposing `user_id`, `v_stop_photos_transit` exposing `created_by_oid`) → **ISSUE-030**;
  - canonical `core.observations`, `core.visits`, `core.assignments`, `core.asset_types`, `core.asset_locations`, `core.locations`, `core.location_external_ids`, `core.observation_type_registry`;
  - public `stop_risk_snapshot`, `stop_effort_history`, `stops` (view), `transit_stop_assets`;
  - **NO grant on any `core.*_actor_audit` sidecar** (the structural labor-safety boundary — verified by absence). **NO grant on the raw `public.*` log base tables** (clean_logs/hazards/etc.) — but reaches them through the `fieldpro`-owned views (PG14 bridge, ISSUE-029).
- **`audit_reader`** — `SELECT` on the four sidecars (`visit/observation/evidence/assignment_actor_audit`) **and** the four canonical entity tables (`visits, observations, evidence, assignments`). No transit-view or public-table grants. NOLOGIN/unwired (ISSUE-028).
- **`mcp_readonly`** — `SELECT` on most `public.*` tables (incl. `clean_logs`, `hazards`, `stop_photos`, `route_runs`, **`identity_directory`**) and on **all four `core.*_actor_audit` sidecars** + canonical tables + views. ⚠️ This LOGIN role can read worker identity and the sidecars (§10 Q6).
- **Per-column grants:** none observed (all grants are table-level).

---

# Section 8 — Adapter View Dependency Chain

(From `pg_depend`; `[A]`=adapter/public log, `[R]`=reference/public, `[C]`=canonical/core.)

```
core.v_clean_logs_transit      → clean_logs[A], assets[R], route_run_stops[A], route_runs[A], core.v_stop_location_map[C]
core.v_hazards_transit         → hazards[A], assets[R], route_run_stops[A], route_runs[A], core.v_stop_location_map[C]
core.v_infra_transit           → infrastructure_issues[A], assets[R], route_run_stops[A], route_runs[A], core.v_stop_location_map[C]
core.v_level3_logs_transit     → level3_logs[A], assets[R], route_run_stops[A], route_runs[A], core.v_stop_location_map[C]
core.v_stop_photos_transit     → stop_photos[A], assets[R], route_run_stops[A], route_runs[A], core.v_stop_location_map[C]
core.v_trash_volume_logs_transit → trash_volume_logs[A], assets[R], route_run_stops[A], route_runs[A], core.v_stop_location_map[C]
core.v_assignments_transit     → route_run_stops[A], route_runs[A], core.v_locations_transit[C]
core.v_locations_transit       → core.locations[C], core.location_external_ids[C]
core.v_stop_location_map       → core.location_external_ids[C]
core.v_asset_locations_transit → core.asset_locations[C], core.v_locations_transit[C]
core.v_assets                  → assets[R]
core.v_locations               → core.locations[C]

public.stops                   → transit_stops[R]
public.stop_assets_v1          → stops_legacy[legacy], assets[R]
public.transit_stop_assets_v1  → transit_stops[R], transit_stop_assets[R], assets[R]
public.stop_status_mv          → stops_legacy[legacy], stop_risk_snapshot[derived], clean_logs[A], hazards[A], infrastructure_issues[A], level3_logs[A]
public.cleanliness_risk_mv     → stop_risk_snapshot[derived], stops_legacy[legacy]
public.infrastructure_risk_mv  → stop_risk_snapshot[derived], stops_legacy[legacy]
public.level3_compliance_mv    → stop_risk_snapshot[derived], stops_legacy[legacy]
public.safety_risk_mv          → stop_risk_snapshot[derived], stops_legacy[legacy]
public.export_pool_daily_summary_v1 → stop_status_mv
public.export_route_run_origin_mix_v1 → route_run_stops[A]
public.export_stop_status_v1   → stop_status_mv
```

**Labor-safety pressure points (cross-schema joins bridging adapter→canonical):** the six
`core.v_*_transit` log views each join an adapter log table (carrying the worker column) to the
canonical `core.v_stop_location_map`, and are `fieldpro`-owned + `intelligence_reader`-granted. The
`stop_status_mv` reaches four adapter log tables directly (but selects no worker column and is dead in code).

---

# Section 9 — Loose Ends

## 9.1 Sequences (18, public)
`asset_external_ids_id_seq, asset_types_id_seq, assets_id_seq, audit_log_id_seq, clean_logs_id_seq,
eam_bridge_route_log_id_seq, export_delete_tokens_id_seq, hazards_id_seq, infrastructure_issues_id_seq,
level3_logs_id_seq, organizations_id_seq, route_run_stops_id_seq, route_runs_id_seq,
stop_condition_history_id_seq, stop_effort_history_id_seq, stop_photos_id_seq, transit_stop_assets_id_seq,
trash_volume_logs_id_seq`. (`lead_route_overrides`/`stop_pool_memberships` use uuid/composite PK — no seq;
`bases`/`route_pools`/`organizations`/`asset_types` natural/assigned ids; `transit_stops`/`stops_legacy` text PK.)

## 9.2 Functions (public)
- **4 trigger functions** (§6.4): `enforce_route_runs_pool_invariant`, `prevent_route_pool_org_base_change_if_used`, `stops_readonly`, `sync_transit_stop_primary_asset`.
- **pgcrypto** extension functions (`armor`, `crypt`, `digest`, `encrypt`, `gen_random_uuid`, `pgp_sym_encrypt`/`decrypt`, etc.) — used by `oidCipher.ts` (S1-13 OID encryption, now relocated to `core.visit_actor_audit`).

## 9.3 Seed / fixture-loaded reference data
- `transit_stops`, `transit_stop_assets`, `stop_pool_memberships`, `assets`, `asset_external_ids`, `stops_legacy` — all 14,916 rows (the KCM transit stop inventory). `route_pools` 12, `bases` 2, `asset_types` 1, `organizations` 1 (KCM). `core.locations`/`core.location_external_ids` mirror at 14,916 (seeded from transit stops).
- `transit_stop_assets` is populated by the `sync_transit_stop_primary_asset` trigger and/or migration seed SQL, **not** by `*.ts` (§10 Q4).

## 9.4 Apparent dead / near-dead objects
- **Tables:** `level3_logs` (0 rows, no writer, read only by dead legacy fn), `stops_legacy` (no `*.ts` ref; only matviews/`stop_assets_v1`/RLS-test), `asset_external_ids` (no `*.ts` read/write), `trash_volume_logs` (written live but read only by dead legacy fn + the dead matview).
- **Views:** all 5 matviews (no app read/refresh); `stop_assets_v1`, `transit_stop_assets_v1`, the 3 `export_*_v1` views (no confirmed app reader); 4 of 6 `core.v_*_transit` log views (`v_infra/v_level3_logs/v_stop_photos/v_trash_volume_logs_transit`) + `v_asset_locations_transit`/`v_assets`/`v_locations` (no app read).
- **Code:** `rebuildStopRiskSnapshotLegacy()` (`riskMapService.ts:325`) — exported, no caller.
- **Referenced-but-absent:** `public.route_run_audit` (in ADAPTER_BOUNDARY.md, not in DB).

## 9.5 Migration history (origin of each adapter table)
Schema was consolidated into `00000000_consolidated_schema.sql` (applied 2026-05-16); `legacy_*` files
are the historical origin. Table origins:

| Table | Origin migration |
|---|---|
| organizations, asset_types, bases, assets, route_pools, route_runs, route_run_stops, clean_logs, stop_risk_snapshot | `legacy_20251130_base_schema.sql` |
| stop_photos | `legacy_20251201_add_stop_photos.sql` |
| hazards, infrastructure_issues, level3_logs, trash_volume_logs | `legacy_20251202_intelligence_foundation.sql` |
| lead_route_overrides | `legacy_20251206_add_lead_route_overrides.sql` |
| transit_stops | `legacy_20251222_phase5c_create_transit_stops.sql` |
| transit_stop_assets | `legacy_20251222_phase5c_escape_hatch.sql` |
| `public.stops` → view; `stops_legacy` = renamed original | `legacy_20251222_phase5c_convert_stops_RO_compat_view.sql` |
| identity_directory | `legacy_20251223_002_identity_directory.sql` |
| route_runs OID identity (assigned_user_oid, created_by_oid) | `legacy_20251223_001_route_run_identity.sql`, `legacy_20251223_assign_user_oid_route_runs.sql` |
| visit_id columns on the 6 log tables | `legacy_20251227_add_visitID_*.sql` |
| stop_effort_history, stop_condition_history (**replaced worker-identified `workforce_metrics`/`stop_scoring_history`**) | `legacy_20260508_replace_surveillance_tables.sql` |
| audit_log | `legacy_20260513_audit_log.sql` |
| export_delete_tokens | `legacy_20260513_s1_4_export_delete_tokens.sql` |
| eam_bridge_route_log, eam_bridge_populate_state | `legacy_20260513_eam_bridge_route_log.sql` |
| asset_external_ids + assets.external_id (Tier 8) | `20260512_tier8_asset_abstraction.sql` |
| RLS (phase 1/2/3), org_id NOT NULL, stop_pool_memberships | `20260518_rls_phase{1,2,3}*.sql` |
| sidecar extraction (core.*_actor_audit; dropped canonical identity cols) | `20260530_sidecar_extraction_{a_additive,b_drop}.sql` |

(61 rows in `schema_migrations`; the `legacy_*` files are superseded by the consolidated schema for fresh DBs.)

---

# Section 10 — Open Questions for the Founder

*(Questions raised by the inventory — not recommendations.)*

**Q1 — `public.route_run_audit` is documented but does not exist.** `ADAPTER_BOUNDARY.md` §2 lists
`route_run_audit` ("Audit log for route run mutations") as an adapter table. It exists in **no schema**
in the live DB and is referenced by **no code**. Is this a planned-but-never-built table, or was it
dropped? The design narrative the redesign starts from currently overstates the table set by one.

**Q2 — Six `core.v_*_transit` log views exist, but only two are read, and the read columns are
clean.** `v_clean_logs_transit` and `v_hazards_transit` are read by the Control Center, but **only
their non-identity columns** (`duration_minutes`/`cleaned_at`/`location_id`; `severity`/`reported_at`).
`v_infra_transit`, `v_level3_logs_transit`, `v_stop_photos_transit`, `v_trash_volume_logs_transit`
are read by **nothing**. Yet all six (a) expose the worker column and (b) are `SELECT`-granted to
`intelligence_reader`. The labor-safety exposure (ISSUE-030) is therefore a **grant/availability**
exposure, not an exercised read path. Does the redesign want these views at all, or only the two
columns the Control Center actually uses?

**Q3 — The intelligence layer no longer reads the work-attribution log tables on any live path.**
The active `rebuildStopRiskSnapshot` reads `core.observations`/`core.visits`; the legacy reader of
`level3_logs`/`trash_volume_logs`/`hazards`/`infrastructure_issues` is dead code with no caller. The
only **live** non-export consumers of the adapter log tables are: the Control Center (aggregate
counts, no worker col) and `loadRouteRunById`/clean-logs lists (which DO carry identity). This means
the clip's read-path surface is narrower than the table set suggests — is the founder's mental model
that the log tables are still feeding intelligence (they are not), or already that they only feed the
operational/route-detail surfaces?

**Q4 — How is `transit_stop_assets` populated?** 14,916 rows, FORCE RLS, `intelligence_reader`-granted,
central to ADAPTER_BOUNDARY Path B/C — but **no `*.ts` writes it**. Population is via the
`sync_transit_stop_primary_asset` trigger (which has the latent ISSUE-024 org_id defect) and/or
migration/seed SQL. The redesign needs a definite answer on the authoritative write mechanism before
reshaping the asset-linking layer.

**Q5 — Three `transit_stops` flag-update handlers write on a bare pool (PATTERN-001).** The
`PATCH /api/stops/:id/{hotspot,compactor,has-trash}` handlers (`stopRoutes.ts:81/176/271`) use bare
`pool.query()` with no `withOrgContext`, and `transit_stops` is FORCE RLS (verified). With
`app.current_org_id` unset these UPDATEs hit the fail-open policy branch (they affect the row because
the policy's first disjunct is true when context is empty). This is a latent correctness/safety
inconsistency in the surviving routing layer — flagging it because the redesign touches this table.

**Q6 — `mcp_readonly` (a LOGIN role) can read worker identity and all four actor-audit sidecars.**
`mcp_readonly` holds `SELECT` on `identity_directory`, `clean_logs`, `stop_photos`, `route_runs`, and
on `core.{visit,observation,evidence,assignment}_actor_audit`. The no-grant boundary that makes
`intelligence_reader` labor-safe does **not** apply to `mcp_readonly`. Is this role intended to retain
that breadth (it appears to back the `postgres`-MCP-style diagnostic access), and should the redesign's
permission model account for it?

**Q7 — `public.assets` and `public.organizations` are canonical, not adapter, despite living in
`public`.** Both are FK targets for the `core.*` tables (observations, visits, assignments,
asset_locations, all `org_id`s). They cannot be reshaped as "adapter" objects without affecting the
canonical layer. Does the redesign treat the `public` schema as "adapter" wholesale, or recognize that
`assets`/`organizations`/`asset_types` are canonical objects that happen to reside in `public`?

**Q8 — Derived history tables are de-identified but FK to `core.visits`, which CASCADE-deletes them.**
`stop_effort_history`/`stop_condition_history` have `visit_id → core.visits ON DELETE CASCADE` and are
export-only reads (no dashboard consumer). They carry no worker column by design. Are these intended to
survive the redesign as the de-identified history surface, and is the CASCADE-from-canonical the
intended retention semantics?

**Q9 — `complexity_score` is structurally present but never populated.** `stop_effort_history.complexity_score`
is written `NULL` (ISSUE-008). The column survives in the schema. Does the redesigned adapter keep it as
a placeholder, or is its fate tied to the intelligence-layer recompute?

**Q10 — Two `org_id` FKs on `route_runs`.** `route_runs` carries both `fk_route_runs_org` and
`route_runs_org_id_fkey` referencing `organizations(id)` — a redundant duplicate constraint. Harmless,
but worth cleaning if the table is reshaped.

**Q11 — Which "completion timing" counts as work-attribution?** `route_run_stops.completed_at`/`started_at`
and `route_runs.started_at`/`finished_at` are run/stop-level timestamps with no direct worker column,
but combined with `route_runs.assigned_user_oid` they reconstruct "who finished what when." The clip
scope (ISSUE-031) names `assigned_user_oid` etc. as attribution — does it also treat these completion
timestamps as attribution to strip, or as routing state to keep? (The audit classified them 🟡; the UI
renders `cleaned_at` from `clean_logs`, not these.)

---

*End of inventory. All facts verified live (DB) or by code read on 2026-06-06. Uncertainties are
confined to §10. No schema, code, or data was modified.*
