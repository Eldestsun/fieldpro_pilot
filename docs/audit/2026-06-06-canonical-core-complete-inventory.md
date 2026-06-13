# Canonical Core Complete Inventory

> **Type:** Pure investigation / reference inventory. No schema, code, or data changes.
> **Date:** 2026-06-06
> **Branch:** `feat/issue-031-core-inventory` (cut from `origin/main` @ `9aafc8c`)
> **Purpose:** The matched companion to
> `docs/audit/2026-06-06-transit-adapter-complete-inventory.md`. That document mapped the
> `public.*` adapter layer forensically; this one maps the canonical `core.*` layer it bridges
> into, plus the `public`↔`core` relationship from the canonical side. Together the two show
> **both sides of the bridge**. Written to let the founder execute four standing decisions
> (D1–D4) on the ISSUE-031 adapter redesign — it **answers** them with live-DB fact, it does
> not re-derive or re-decide them.
>
> **Method:** Every DB fact verified live against `fieldpro_db` via the `postgres` MCP
> (`pg_class`, `pg_attribute`, `pg_constraint`, `pg_indexes`, `pg_policies`, `pg_proc`,
> `pg_get_viewdef`, `pg_depend`, `pg_description`, `information_schema.role_table_grants`, plus
> targeted `count`/`GROUP BY` over live rows). Every code fact verified by `grep`/read over
> `backend/src/**` and `backend/scripts/**`. **Prior design docs (`CANONICAL_STATE_LAYER_DESIGN.md`,
> `ADAPTER_BOUNDARY.md`) were treated as untrusted on population/row-count/write-path claims and
> re-verified;** divergences are flagged in §10.
>
> **The four decisions this inventory serves** (verdicts in §10):
> - **D1 (companion Q7):** `public.organizations` is shared multitenant infra (out of scope). OPEN: are `public.assets` / `public.asset_types` load-bearing canonical FK targets, or legacy mirrors core was meant to supersede? → **§3 + §10-D1.**
> - **D2 (companion Q11):** `route_runs.assigned_user_oid`/`created_by_oid` STAY (assignment intent ≠ work-attribution). VERIFY: is completion timing reconstructable from `core` alone so the adapter's copies are convenience, not system-of-record? → **§4 + §10-D2.**
> - **D3 (companion Q3):** every dispatch/admin UI is being rebuilt; only the worker (UL) UI is frozen. Establish the identity-free canonical reads the rebuilt surfaces can stand on. → **§6 + §10-D3.**
> - **D4 (companion Q6):** confirm `intelligence_reader` has NO grant on identity or the sidecars, and produce the same census for `mcp_readonly`. → **§2, §7 + §10-D4.**

**Classification legend** (identical to the companion):
🔴 WORK-ATTRIBUTION · 🟡 ROUTING/SCHEDULING · 🟢 ORG SCAFFOLDING / REFERENCE · 🔵 DERIVED / DE-IDENTIFIED · ⚫ IDENTITY / AUDIT / INFRA.

---

## Object census (live DB, 2026-06-06)

| Object class | Count | Names |
|---|---|---|
| `core.*` base tables | 13 | observations, visits, assignments, evidence, asset_types, asset_locations, locations, location_external_ids, observation_type_registry, **visit_actor_audit, observation_actor_audit, evidence_actor_audit, assignment_actor_audit** (the 4 sidecars) |
| `core.*` views | 12 | v_clean_logs_transit, v_hazards_transit, v_infra_transit, v_level3_logs_transit, v_stop_photos_transit, v_trash_volume_logs_transit, v_assignments_transit, v_locations_transit, v_stop_location_map, v_asset_locations_transit, v_assets, v_locations |
| `core.*` sequences | 9 | one per non-sidecar serial table (sidecars use parent-id PKs, no seq) |
| `core.*` functions | 1 | `enforce_location_external_ids_org_match()` (trigger fn) |
| `core.*` triggers | 1 | `trg_location_external_ids_org_match` on `location_external_ids` |
| DB roles | 5 | postgres (super/bypassrls), fieldpro (app, LOGIN), intelligence_reader (NOLOGIN), audit_reader (NOLOGIN), mcp_readonly (LOGIN) |
| **Schemas** | **2** | `core`, `public` — **no `admin` schema exists** (§9) |

**`public.*` objects `core.*` structurally depends on** (FK targets — cannot be treated as adapter clip candidates without breaking canonical):
- **`public.organizations`** — every `core.*` table's `org_id` FKs here (RESTRICT). Shared multitenant infra (D1: out of scope).
- **`public.assets`** — `core.observations.asset_id`, `core.visits.primary_asset_id`, `core.assignments.primary_asset_id` (all SET NULL), `core.asset_locations.asset_id` (RESTRICT) all FK here. **This makes `public.assets` a live canonical FK target** (§3, §10-D1).

The companion's confirmed core-table list is **complete and correct** — all 13 tables verified present; no core table is missing from it, none extra.

---

# Section 1 — core table inventory

All 13 core tables are **`ROW LEVEL SECURITY ENABLED + FORCED`** and carry the **identical
fail-open `org_isolation` policy** (the PATTERN-001 shape — same as the adapter layer), `cmd=ALL`,
`roles=public`, USING = WITH CHECK:
```sql
(COALESCE(current_setting('app.current_org_id', true), '') = '')
  OR (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::bigint)
```
i.e. **unset org context → fails open** (the disjunct is true) → callers must set `app.current_org_id`
(`withOrgContext`) or run as a BYPASSRLS role. The **sidecars share this exact policy** — their
labor-safety isolation is by **GRANT**, not by a stricter policy (see §2, §7).

The canonical entity tables (`visits`/`observations`/`evidence`/`assignments`) carry **NO worker
column** — the sidecar-extraction migration (2026-05-30/06-01) dropped the plaintext+cipher identity
columns and relocated them to the four `*_actor_audit` sidecars. The `attnum` gaps below are those
dropped columns.

---

### 1.1 `core.visits` — canonical visit (occasion someone looked) · 9 rows · 🟡 timing/outcome, no identity

| # | Column | Type | Null | Default |
|---|---|---|---|---|
| 1 | id | bigint | NOT NULL | `nextval('core.visits_id_seq')` |
| 2 | org_id | bigint | NOT NULL | (FK→public.organizations RESTRICT) |
| 3 | location_id | bigint | — | (FK→core.locations SET NULL) |
| 4 | primary_asset_id | bigint | — | (FK→**public.assets** SET NULL) |
| 5 | assignment_id | bigint | — | (FK→core.assignments SET NULL) |
| 7 | started_at | timestamptz | NOT NULL | `now()` |
| 8 | ended_at | timestamptz | — | |
| 9 | visit_type | text | NOT NULL | |
| 10 | outcome | text | — | |
| 11 | reason_code | text | — | |
| 12 | notes | text | — | |
| 13 | client_visit_id | uuid | — | (UNIQUE — UUIDv5 of `route-run-stop:{rrs.id}`) |
| 14 | meta | jsonb | NOT NULL | `'{}'` |
| 15 | created_at | timestamptz | NOT NULL | `now()` |

- **attnum 6 dropped** = `actor_oid` (+ the cipher cols, relocated to `visit_actor_audit`). **No worker column.**
- **PK** `(id)`. **UNIQUE** `(client_visit_id)`. **FKs:** org_id→public.organizations (RESTRICT), location_id→core.locations (SET NULL), primary_asset_id→**public.assets** (SET NULL), assignment_id→core.assignments (SET NULL). **Referenced by:** observations, evidence, the 8 public log/history tables' `visit_id` (companion §6.1), visit_actor_audit (CASCADE).
- **Indexes:** pkey; `visits_client_visit_id_key`; `idx_core_visits_asset_time (org_id, primary_asset_id, started_at DESC)`; `idx_core_visits_location_time (org_id, location_id, started_at DESC)`.
- **Live data:** 9 rows, all `visit_type='service'`; outcomes: 6 completed, 2 skipped, 1 in-progress (null outcome). `started_at` 9/9; `ended_at` 8/9 (open visit null); `assignment_id` 9/9; `location_id` 9/9; `primary_asset_id` 9/9; `client_visit_id` 9/9.

### 1.2 `core.observations` — the center of the system · 18 rows · 🔵 condition/action data, no identity

| # | Column | Type | Null | Default |
|---|---|---|---|---|
| 1 | id | bigint | NOT NULL | `nextval('core.observations_id_seq')` |
| 2 | org_id | bigint | NOT NULL | (FK→public.organizations) |
| 3 | visit_id | bigint | NOT NULL | (FK→core.visits CASCADE) |
| 4 | location_id | bigint | — | (FK→core.locations SET NULL) |
| 5 | asset_id | bigint | — | (FK→**public.assets** SET NULL) |
| 6 | observation_type | text | NOT NULL | |
| 7 | severity | text | — | |
| 8 | status | text | — | |
| 9 | payload | jsonb | NOT NULL | `'{}'` |
| 11 | observed_at | timestamptz | NOT NULL | `now()` |

- **attnum 10 dropped** = `created_by_oid` (→ observation_actor_audit). **No worker column.**
- **NO normalized columns** — there is no `obs_kind` / `norm_status` / `norm_severity` / `intervention` / `type_id` FK. `observation_type` is free text with **no FK and no CHECK** to the registry. This confirms `CANONICAL_STATE_LAYER_DESIGN.md` §9 items 4/5 are still **deferred** (the normalized shape is target-only). → §10.
- **PK** `(id)`. **FKs:** org_id, visit_id (CASCADE), location_id (SET NULL), asset_id→**public.assets** (SET NULL). **Index:** `idx_core_observations_visit (visit_id)`, pkey.
- **Live data (18 rows):** action — `picked_up_litter`×4, `emptied_trash`×4; measurement — `trash_volume`×4 (payload `{level:2|3}`); presence — `biohazard_present`, `encampment_present`, `graffiti_present`, `shelter_panel_damage_present` (×1 each); condition — `spot_check`×2. `severity` populated on only 2 rows (biohazard, encampment); `status` **never** populated; `payload` non-empty only on `trash_volume`.

### 1.3 `core.assignments` — canonical assignment (plan that scheduled a visit) · **12 rows** · 🟡 routing/scheduling

> **Resolves the stale-doc flag.** `ADAPTER_BOUNDARY.md` says "0 rows / Tier 5 not wired." **FALSE** — 12 rows, written live on route creation (§5.3).

| # | Column | Type | Null | Default |
|---|---|---|---|---|
| 1 | id | bigint | NOT NULL | `nextval('core.assignments_id_seq')` |
| 2 | org_id | bigint | NOT NULL | (FK→public.organizations) |
| 3 | assignment_type | text | NOT NULL | |
| 4 | status | text | NOT NULL | `'planned'` |
| 5 | location_id | bigint | — | (FK→core.locations SET NULL) |
| 6 | primary_asset_id | bigint | — | (FK→**public.assets** SET NULL) |
| 7 | planned_for_date | date | — | |
| 8 | planned_start_at | timestamptz | — | |
| 9 | planned_end_at | timestamptz | — | |
| 11 | source_system | text | — | |
| 12 | source_ref | text | — | |
| 13 | meta | jsonb | NOT NULL | `'{}'` |
| 14 | created_at | timestamptz | NOT NULL | `now()` |
| 15 | updated_at | timestamptz | NOT NULL | `now()` |

- **attnum 10 dropped** = `created_by_oid` (→ assignment_actor_audit). **No worker column.**
- **PK** `(id)`. **FKs:** org_id, location_id (SET NULL), primary_asset_id→**public.assets** (SET NULL). **Referenced by:** visits.assignment_id (SET NULL), assignment_actor_audit (CASCADE). **Index:** `idx_core_assignments_org_status (org_id, status)`, pkey.
- **Live data:** 12 rows, exactly matching the 12 `route_run_stops`. `assignment_type='transit_stop_clean'`, `status='planned'`, `source_system='route_runs'`, `source_ref` = the route_run id. Linked back from `core.visits.assignment_id` (9/9 populated).

### 1.4 `core.evidence` — proof (photo/attachment refs) · 9 rows · 🟢 evidence refs, no identity

| # | Column | Type | Null | Default |
|---|---|---|---|---|
| 1 | id | bigint | NOT NULL | `nextval('core.evidence_id_seq')` |
| 2 | org_id | bigint | NOT NULL | (FK→public.organizations) |
| 3 | visit_id | bigint | NOT NULL | (FK→core.visits CASCADE) |
| 4 | observation_id | bigint | — | (FK→core.observations SET NULL) |
| 5 | kind | text | NOT NULL | |
| 6 | storage_key | text | NOT NULL | (S3/MinIO key) |
| 7 | captured_at | timestamptz | NOT NULL | `now()` |
| 9 | meta | jsonb | NOT NULL | `'{}'` |
| 10 | created_at | timestamptz | NOT NULL | `now()` |

- **attnum 8 dropped** = `captured_by_oid` (→ evidence_actor_audit). **No worker column.**
- **`observation_id` is always NULL on the live write path** (evidence is anchored to the visit, not a specific observation — companion/design noted this). 9 rows, 1:1 with `public.stop_photos` (the adapter twin).
- **PK** `(id)`. **FKs:** org_id, visit_id (CASCADE), observation_id→core.observations (SET NULL). **Index:** `idx_core_evidence_visit (visit_id)`, pkey.

### 1.5 `core.locations` — canonical location spine · 14,916 rows · 🟢 reference

| # | Column | Type | Null | Default |
|---|---|---|---|---|
| 1 | id | bigint | NOT NULL | seq |
| 2 | org_id | bigint | NOT NULL | (FK→public.organizations) |
| 3 | location_type | text | NOT NULL | |
| 4 | label | text | — | |
| 5 | lon | double precision | — | |
| 6 | lat | double precision | — | |
| 7 | address | text | — | |
| 8 | active | boolean | NOT NULL | `true` |
| 9 | created_at | timestamptz | NOT NULL | `now()` |
| 10 | updated_at | timestamptz | NOT NULL | `now()` |

- 14,916 rows = one per transit stop (`location_type='transit_stop'`), mirroring `public.transit_stops`. **PK** `(id)`. **FK** org_id. **No app INSERT/UPDATE path** — seeded by migration (§5, §10); only DELETE'd in export-delete and INSERT/DELETE'd in `verify_rls.ts`. Referenced by visits/observations/assignments/asset_locations/location_external_ids.

### 1.6 `core.location_external_ids` — stop_id↔location_id sidecar · 14,916 rows · 🟢 reference

`id` PK · `org_id` (FK) · `location_id` (FK→core.locations CASCADE) · `source_system` text NOT NULL · `external_id` text NOT NULL · `created_at`.
- **UNIQUE** `(org_id, source_system, external_id)`; partial-ish unique `ux_location_one_id_per_system (org_id, location_id, source_system)`. 14,916 rows, `source_system='metro_stop'`, `external_id` = the transit `stop_id`. **Trigger** `trg_location_external_ids_org_match` (BEFORE INSERT/UPDATE → `enforce_location_external_ids_org_match()` — enforces the location's org matches). **No app INSERT path** (seed/migration); DELETE in export-delete only. Backs `v_locations_transit` / `v_stop_location_map`.

### 1.7 `core.asset_locations` — asset↔location junction · **14,916 rows (fully populated)** · 🟢 reference

> `ADAPTER_BOUNDARY.md` calls this "sparse." **FALSE** — it is fully populated, one row per stop.

`id` PK · `org_id` (FK) · `asset_id` bigint NOT NULL (FK→**public.assets** RESTRICT) · `location_id` bigint NOT NULL (FK→core.locations CASCADE) · `role` text NOT NULL `'primary'` · `active` bool NOT NULL `true` · `installed_at` · `removed_at` · `notes` · `created_at`/`updated_at`.
- **Indexes:** `idx_core_asset_locations_asset (org_id, asset_id)`, `idx_core_asset_locations_location (org_id, location_id)`, pkey. **No app INSERT/UPDATE path** (seed/migration); DELETE in export-delete; only **read by nothing in app code** (§6). It is the canonical asset↔location mapping but no live read path consumes it.

### 1.8 `core.asset_types` — per-tenant asset type registry · 1 row · 🟢 reference

`id` PK · `org_id` (FK) · `type_key` text NOT NULL · `display_name` text NOT NULL · `description` · `is_active` bool NOT NULL `true` · `created_at`. **UNIQUE** `(org_id, type_key)`.
- **Table comment (verbatim):** *"Per-tenant asset type registry… **Distinct from public.asset_types, which is a global code table without org scoping.** core.observation_type_registry is keyed here."* 1 row: `type_key='transit_stop'` for KCM. Written by `assetService.createAssetType` + seed script (§5). Read by `assetService` (§6). **Referenced by:** observation_type_registry.asset_type_id (CASCADE). → key D1 evidence (§3.4).

### 1.9 `core.observation_type_registry` — meaning-as-data · 30 rows · 🟢 reference

`id` PK · `org_id` (FK) · `asset_type_id` bigint NOT NULL (FK→core.asset_types CASCADE) · `observation_key` text NOT NULL · `display_name` text NOT NULL · `value_type` text NOT NULL (CHECK `state|numeric|boolean`) · `valid_values` jsonb · `is_required` bool NOT NULL `false` · `sort_order` int NOT NULL `0` · `is_active` bool NOT NULL `true`. **UNIQUE** `(org_id, asset_type_id, observation_key)`.
- **Live shape:** 30 rows = **28 active** (22 boolean, 1 numeric, 5 state) + 2 inactive (boolean) — matches the design §9 reconciliation note (30 rows, 28 active). **This is the live registry shape (`value_type`/`valid_values`), NOT the design's §4.1 `obs_kind`/`ok_rule`/`payload_schema` shape** — confirms the registry was never migrated to the design's target columns (§10). Rich column comments present (value_type semantics, valid_values shape per type). Written by `assetService.upsertObservationTypes` + seed; read by `assetService.listObservationTypes` (admin config).

### 1.10 The four actor-audit sidecars (⚫ IDENTITY) — see §2 for deep treatment

`core.visit_actor_audit` (9 rows), `core.observation_actor_audit` (18), `core.evidence_actor_audit` (9), `core.assignment_actor_audit` (12). Each: `<parent>_id` bigint **PK** (1:1 with parent, FK→parent **ON DELETE CASCADE**), `org_id` (FK→public.organizations), `actor_ref` text NOT NULL (the worker OID, **plaintext**), `actor_ref_ciphertext` bytea, `actor_ref_key_id` text, `recorded_at` timestamptz NOT NULL `now()`. Index `<name>_org_idx (org_id)`. RLS forced, standard fail-open policy.

---

# Section 2 — The actor_audit sidecars (the labor-safety core) [D4]

This is the structural mechanism behind invariant #1 ("observation attaches to the asset, not the
worker"). The guarantee is **by GRANT** (`intelligence_reader` has none), **not** by a stricter RLS
policy — all four sidecars carry the same fail-open `org_isolation` policy as every other table.

## 2.1 Structure (all four, one template)

| Column | Type | Null | Notes |
|---|---|---|---|
| `<parent>_id` | bigint | NOT NULL | **PK**, FK→`core.<parent>(id)` **ON DELETE CASCADE** (1:1 with parent) |
| `org_id` | bigint | NOT NULL | FK→public.organizations RESTRICT |
| `actor_ref` | text | NOT NULL | **the worker Entra OID, PLAINTEXT** |
| `actor_ref_ciphertext` | bytea | — | S1-13 KMS-envelope ciphertext (AES-256-GCM) |
| `actor_ref_key_id` | text | — | KMS key id for the envelope |
| `recorded_at` | timestamptz | NOT NULL | `now()` |

`<parent>` ∈ {visit, observation, evidence, assignment}. PK = parent id → **exactly 1:1** with the
canonical row, verified: visit 9/9, observation 18/18, evidence 9/9, assignment 12/12.

## 2.2 What identity is actually stored (verified by live counts)

| Sidecar | rows | `actor_ref` non-null | `actor_ref_ciphertext` non-null | `actor_ref_key_id` non-null |
|---|---|---|---|---|
| visit_actor_audit | 9 | 9 | **9** | **9** |
| observation_actor_audit | 18 | 18 | 0 | 0 |
| evidence_actor_audit | 9 | 9 | 0 | 0 |
| assignment_actor_audit | 12 | 12 | 0 | 0 |

**Findings:**
- `actor_ref` holds the **plaintext worker OID** on every row of all four sidecars. (The table comments say *"actor_ref = worker OID"*; the dev data has a single distinct OID — one specialist.)
- **Only `visit_actor_audit` carries the encrypted envelope** (`actor_ref_ciphertext`+`actor_ref_key_id` populated 9/9). The other three have those columns **NULL** — encryption was relocated to `visit_actor_audit` only; extending it to the others is the design's tracked follow-on. The columns exist on all four (uniform template) but are unused on three.
- **Net:** anyone with `SELECT` on a sidecar reads the worker OID in plaintext (no decryption needed). The boundary is therefore entirely a **grant** question (§2.4).

## 2.3 How each is written (file · SQL · txn-atomicity with parent)

| Sidecar | Writer (file:line) | Trigger | Same txn as parent write? | Identity written |
|---|---|---|---|---|
| visit_actor_audit | `visitService.ts:162-170` (`ensureVisitForRouteRunStop`) | start / complete / skip-with-hazard stop endpoints | **YES** (same `client`, step 5 right after the visit INSERT) | plaintext `actor_ref` **+ ciphertext + key_id** (via `oidCipher.encrypt(oid,"visit_create")`) |
| observation_actor_audit | `observationService.ts:289-296` (`insertObservations`) and `:324-331` (`emitSpotCheckObservation`) | `POST /api/route-run-stops/:id/complete` | **YES** (same client, same loop iteration after each observation INSERT) | plaintext `actor_ref` only |
| evidence_actor_audit | `stopPhotosService.ts:74-79` (`createStopPhotos`) | `POST /api/route-runs/:runId/stops/:stopId/photos` | **NO** — runs on bare `pool` (not one wrapping txn); statements auto-commit (§5.4) | plaintext `actor_ref` only |
| assignment_actor_audit | `routeRunService.ts:444-452` (`createRouteRun`, `INSERT…SELECT UNNEST`) | `POST /api/route-runs` | **YES** (inside the `BEGIN/COMMIT` of route create) | plaintext `actor_ref` (`created_by_oid ?? 'system'`) |

Each INSERT is `ON CONFLICT (<parent>_id) DO NOTHING`. Representative — visit sidecar:
```sql
INSERT INTO core.visit_actor_audit (visit_id, org_id, actor_ref, actor_ref_ciphertext, actor_ref_key_id)
VALUES ($1, $2, $3, $4, $5) ON CONFLICT (visit_id) DO NOTHING
```
Annotation (`visitService.ts:159-161`, verbatim): *"5) Identity sidecar — worker OID (plaintext + S1-13 envelope) lives here, never on core.visits. intelligence_reader has no grant on this table; the labor-safety boundary (invariant #1) is structural here, not in query code."*

## 2.4 Grant census — the four sidecars (D4 core answer)

| Sidecar | fieldpro | intelligence_reader | audit_reader | mcp_readonly |
|---|---|---|---|---|
| visit_actor_audit | SELECT,INSERT,UPDATE,DELETE | **— (none)** | SELECT | **SELECT** |
| observation_actor_audit | SELECT,INSERT,UPDATE,DELETE | **— (none)** | SELECT | **SELECT** |
| evidence_actor_audit | SELECT,INSERT,UPDATE,DELETE | **— (none)** | SELECT | **SELECT** |
| assignment_actor_audit | SELECT,INSERT,UPDATE,DELETE | **— (none)** | SELECT | **SELECT** |

- ✅ **CONFIRMED: `intelligence_reader` has NO grant on any sidecar** (verified by absence in `information_schema.role_table_grants`). The structural labor-safety claim is **true today** for `intelligence_reader`.
- ⚠️ **`mcp_readonly` (a LOGIN role) holds `SELECT` on all four sidecars** — it can read the plaintext worker OID. Same exposure the companion flagged on the adapter side. (`audit_reader` holds SELECT by design — the audit/export channel; it is NOLOGIN/unwired per ISSUE-028.)
- `fieldpro` on sidecars: `SELECT,INSERT,UPDATE,DELETE` (no TRUNCATE/REFERENCES/TRIGGER — narrower than its grant on the canonical entity tables).

## 2.5 Views reading a sidecar

**None.** No `core.*` or `public.*` view references any `*_actor_audit` table (verified via `pg_depend` and `pg_get_viewdef` across all 24 views). So `intelligence_reader`, which can read all 12 core views, **cannot reach a sidecar through any view**. The only reads of the sidecars are the two export paths and a dangling decrypt fn (§2.6).

## 2.6 Who reads the sidecars (the only non-grant-only access)

Exactly **two** code paths JOIN the sidecars, both Admin-guarded export paths running on a bare pool
(no `withOrgContext` — they rely on the pool's role for org scope), plus one dangling capability:
- **`exportDeleteRoutes.ts`** (`POST /api/admin/export-and-delete/request`, `requireAuth+requireAdmin`) — LEFT JOINs all four sidecars, aliasing `actor_ref` back to the legacy OID column names; for visits also exports `actor_ref_ciphertext`/`actor_ref_key_id` (no decryption). GDPR/CCPA export.
- **`scripts/sftpExport.ts`** (CLI/cron) — identical sidecar JOIN shape; gzipped JSON+CSV to SFTP.
- **`lib/oidCipher.ts` `decrypt()`** — decrypts a `visit_actor_audit` ciphertext to plaintext OID with a mandatory `admin.oid_decrypt` audit-log entry. **Currently has NO caller** anywhere in `backend/src` (the `admin.oid_decrypt` action is registered and documented, but the function is unreferenced) — a wired-but-dormant reveal capability.

---

# Section 3 — Asset model resolution: `public.assets` vs core [D1]

The decision gate. Verdict and evidence:

## 3.1 Is there a `core.assets` table?
**No.** There is **no `core.assets` base table.** The asset registry is `public.assets` (companion §1.14,
14,916 rows). Core has only: `core.asset_types` (per-tenant type registry), `core.asset_locations`
(asset↔location junction), the `asset_id` FK columns on observations/visits/assignments, and the
**view `core.v_assets`** (a passthrough of `public.assets`).

## 3.2 Where the canonical `asset_id` FKs actually point (verbatim from `pg_constraint`)

| Core column | → references | On delete |
|---|---|---|
| `core.observations.asset_id` | **`public.assets(id)`** | SET NULL |
| `core.visits.primary_asset_id` | **`public.assets(id)`** | SET NULL |
| `core.assignments.primary_asset_id` | **`public.assets(id)`** | SET NULL |
| `core.asset_locations.asset_id` | **`public.assets(id)`** | RESTRICT |

All four canonical asset references target `public.assets`. The companion's claim is confirmed exactly.

## 3.3 What `core.asset_locations` is for
The canonical asset↔location junction (asset_id→public.assets, location_id→core.locations, role/active/
installed/removed). **14,916 rows — fully populated** (one primary link per stop), *not* sparse as
ADAPTER_BOUNDARY claims. **But nothing live reads it** (§6): no app `FROM core.asset_locations` except
the export-delete DELETE and an RLS test. It is a populated-but-unconsumed canonical mapping. The
*live* asset↔stop translation that code actually uses is the **adapter** `public.transit_stop_assets`
(companion §1.10, Path B/C), not this table.

## 3.4 `core.asset_types` vs `public.asset_types`
**Both exist, both populated (1 row each), and they are NOT the same kind of object — neither is a
mirror of the other:**
- `public.asset_types` — **global code table, no `org_id`** (`id, code, name`). Read by `assetService.seedAssets` via `code`. Companion §1.16.
- `core.asset_types` — **per-tenant, org-scoped** (`org_id, type_key, …`), its comment explicitly: *"Distinct from public.asset_types, which is a global code table without org scoping."* Read by `assetService` admin config; **referenced by `core.observation_type_registry`**.
- **Data-flow bridge:** `assetService.seedAssets` (`:169-173`) joins `core.asset_types cat JOIN public.asset_types pat ON pat.code = cat.type_key` to translate the tenant type → the global code → `public.assets.asset_type_id`. So `public.assets.asset_type_id` FKs to **`public.asset_types`** (the global code table), while `core.asset_types` is the tenant-facing registry that the observation registry hangs off. They are **complementary, not duplicative.**

## 3.5 Verdict (D1)
**`public.assets` is a load-bearing canonical FK target, NOT a legacy mirror.** It is referenced by
four canonical `core.*` columns (incl. one RESTRICT), is the asset registry the canonical layer was
built on (its own table comment frames it as the canonical, industry-neutral asset table —
"transit_stops is one seeding source"), and there is no `core.assets` table for it to be a mirror *of*.
It lives in `public` but is **canonical infrastructure**, in the same category as `public.organizations`
(D1) — **not an adapter clip candidate.** `public.asset_types` is likewise canonical infra (the global
code table the asset FK resolves through). `core.asset_locations` is canonical but **inert** (populated,
zero live readers) — a candidate for the founder to decide on, but its removal would not break a live
read path (it would only drop a RESTRICT FK guard on `public.assets` deletion). Full evidence: §3.2–3.4.

---

# Section 4 — Location spine + completion-timing reconstruction [D2]

## 4.1 The location spine
`core.locations` (14,916) + `core.location_external_ids` (14,916) mirror `public.transit_stops`,
one row per stop. Both are **seed/migration-populated** — no application INSERT/UPDATE path exists
(§5, §6); the only writes are the export-delete DELETEs and `verify_rls.ts` fixtures. `location_external_ids`
carries `source_system='metro_stop'`, `external_id`=transit `stop_id`, with the org-match trigger.

## 4.2 stop_id (text, adapter) → location_id (canonical) translation
A transit `stop_id` resolves to a `core.locations.id` through the canonical-side views:
- **`core.v_locations_transit`** = `core.locations l JOIN core.location_external_ids lei ON lei.location_id=l.id WHERE l.location_type='transit_stop' AND lei.source_system='metro_stop'` → exposes `(location_id, org_id, location_type, label, lon, lat, source_system, stop_id=lei.external_id)`.
- **`core.v_stop_location_map`** = `SELECT org_id, external_id AS stop_id, location_id FROM core.location_external_ids WHERE source_system='metro_stop'` (the minimal map used inside the six `v_*_transit` log views).

What core **consumes** through these: `visitService.getVisitContext` resolves `stop_id→location_id`
via `v_locations_transit` to anchor a `core.visits` row; `routeRunService.createRouteRun` uses the same
view in its `core.assignments INSERT…SELECT`. (Mirror of how the companion documented what the views
*expose* to the adapter side.)

## 4.3 Completion-timing reconstruction (the D2 verification)
**Timestamp columns that exist and are populated:**
- `core.visits.started_at` (NOT NULL, **9/9**), `core.visits.ended_at` (**8/9** — null only on the one open visit), `core.visits.created_at`.
- `core.observations.observed_at` (NOT NULL, 18/18), `core.observations` has no started/ended.
- `core.assignments.planned_for_date` / `planned_start_at` / `planned_end_at` (plan times), `created_at`/`updated_at`.
- Sidecar `recorded_at` (identity write time — not a work timestamp, and grant-gated).

**Reconstruction chain (all identity-free):**
- A `core.visits` row is **1:1 with a `route_run_stops` row** via `client_visit_id` (UUIDv5 of `route-run-stop:{rrs.id}`, UNIQUE). So **per-stop completion timing = `core.visits.started_at`/`ended_at`** — a direct canonical equivalent of `route_run_stops.started_at`/`completed_at`.
- A visit links to its run via `core.visits.assignment_id → core.assignments.source_ref` (= the `route_run` id). So the **run** a visit belongs to is recoverable from core alone.
- **Run-level** start/finish (`route_runs.started_at`/`finished_at`) is **derivable** as the min/max of the run's member visit timestamps (`MIN(started_at)`, `MAX(ended_at)` over visits whose assignment's `source_ref` = that run). The active risk job already reads `v.ended_at` for exactly this kind of "last service" logic (§6).

## 4.4 Verdict (D2)
**YES — run/stop completion timing is reconstructable from `core` alone.** Per-stop timing is a direct
1:1 column on `core.visits` (`started_at`/`ended_at`, keyed by `client_visit_id`); run-level timing is
an aggregation of member-visit timestamps via the `assignment_id → assignments.source_ref` link. The
adapter's `route_runs.started_at/finished_at` and `route_run_stops.started_at/completed_at` are
therefore **convenience copies, not the system-of-record** — canonical holds the same facts.
**Two caveats:** (1) the run↔visit link runs through `core.assignments.source_ref` (a text route_run id),
not a hard FK — robust today (12/12 assignments + 9/9 visit.assignment_id populated) but a string join,
not declarative; (2) run-level start/finish is *derived* (min/max), so a run with no visits yet (planned,
unworked) has no core timing — consistent with "no visit anchor = no timing," which is the intended
silence-as-signal semantics, but means "planned but unstarted run" timing lives only in the adapter.

---

# Section 5 — Canonical write paths

Cross-referenced to the companion's §3 (the adapter half of each dual-write). All run as `fieldpro`.

## 5.1 `core.visits`
- **INSERT** `visitService.ts:115-140` `ensureVisitForRouteRunStop()`: `INSERT INTO core.visits (org_id, location_id, primary_asset_id, assignment_id, visit_type, outcome, client_visit_id, started_at) VALUES ($1..$7, NOW()) ON CONFLICT (client_visit_id) DO NOTHING RETURNING id`. Triggers: start/complete/skip-with-hazard stop endpoints. **Dual-write:** the canonical anchor for the adapter's `clean_logs`/`hazards`/`stop_photos`/`route_run_stops` writes in the same handler txn; paired with `visit_actor_audit` (same client). Comments at `:107-114` (identity → sidecar). Companion §3.1/§3.2.
- **UPDATE (close)** `visitService.ts:185-196` `closeVisitForRouteRunStop()`: `UPDATE core.visits SET ended_at=COALESCE(ended_at,COALESCE($2,NOW())), outcome=COALESCE(outcome,$3), reason_code=COALESCE(reason_code,$4) WHERE client_visit_id=$1 AND ended_at IS NULL RETURNING id`. Trigger: complete. Idempotent.

## 5.2 `core.observations`
- **INSERT** `observationService.ts:265-288` `insertObservations` (via `emitObservationsForStop`): `INSERT INTO core.observations (org_id, visit_id, location_id, asset_id, observation_type, payload, severity) VALUES (...) RETURNING id`. Trigger: complete (`cleanLogService.ts:159`) + `routeRunStopRoutes.ts:276`. Paired with `observation_actor_audit` (same loop, same client).
- **INSERT (spot-check)** `observationService.ts:310-321` `emitSpotCheckObservation`: `INSERT INTO core.observations (org_id, visit_id, location_id, asset_id, observation_type, payload) VALUES ($1,$2,$3,$4,'spot_check','{}'::jsonb) RETURNING id`. Trigger: complete when `spotCheck===true`. Paired with `observation_actor_audit`. Comment `:263-264`, `:309` (identity → sidecar). Adapter half: the cleaning/hazard/infra writes in `cleanLogService.completeStop` (companion §3.1/3.4/3.5).

## 5.3 `core.assignments` (resolves the stale-doc flag)
- **INSERT…SELECT** `routeRunService.ts:422-439` `createRouteRun()`:
  ```sql
  INSERT INTO core.assignments (org_id, assignment_type, status, location_id, primary_asset_id,
    planned_for_date, source_system, source_ref, meta)
  SELECT a.org_id, 'transit_stop_clean', 'planned', loc.location_id, s.asset_id, $1::date,
    'route_runs', $2::text, '{}'::jsonb
  FROM route_run_stops rrs
  JOIN public.stops s ON s.stop_id = rrs.stop_id
  JOIN public.assets a ON a.id = rrs.asset_id
  LEFT JOIN core.v_locations_transit loc ON loc.stop_id = rrs.stop_id
  WHERE rrs.route_run_id = $2::bigint
  ON CONFLICT DO NOTHING RETURNING id, org_id
  ```
  Triggers: `POST /api/route-runs` (`routeRunRoutes.ts:553/620`) + dev `devRoutes.ts:205`. **Dual-write:** the canonical mirror of `route_runs`+`route_run_stops`, **same `BEGIN/COMMIT` txn** (`:300`/`:455`). Paired with `assignment_actor_audit` (`:444-452`, `INSERT…SELECT UNNEST` over the RETURNED ids). Comment `:415-417`. **`visitService.ts:92-103` reads it back** to set `core.visits.assignment_id`. → §10-D-assignments.

## 5.4 `core.evidence`
- **INSERT…SELECT** `stopPhotosService.ts:59-67` `createStopPhotos()`: `INSERT INTO core.evidence (org_id, visit_id, observation_id, kind, storage_key) SELECT v.org_id, v.id, NULL, $1, $2 FROM core.visits v WHERE v.client_visit_id=$3 LIMIT 1 RETURNING id, org_id`. Trigger: `POST /api/route-runs/:runId/stops/:stopId/photos`. Holds `kind` (e.g. "completion") + `storage_key` (S3 key); `observation_id` always NULL. **Dual-write** with adapter `public.stop_photos` (companion §3.6) + `evidence_actor_audit`. Comments `:41` ("additive discipline — do not remove"), `:57-58` (identity → sidecar).
  > **Atomicity gap:** `createStopPhotos` is called with the **bare `pool`** (`ulRoutes.ts:290`), so `stop_photos` + `core.evidence` + `evidence_actor_audit` each auto-commit — **not one transaction.** (Contrast: the visit/observation and assignment writes ARE atomic with their sidecars.) → §10.

## 5.5 Sidecars
All four detailed in §2.3 (writers, SQL, atomicity, identity form).

## 5.6 `core.asset_types` / `core.observation_type_registry` (config, not field writes)
- `core.asset_types` — `assetService.createAssetType` (`:77-84`, `POST /api/admin/tenant/asset-types`, `withOrgContext`) + seed `seed_transit_assets.ts:341-348`. `ON CONFLICT (org_id,type_key) DO UPDATE`.
- `core.observation_type_registry` — `assetService.upsertObservationTypes` (`:128-139`, `POST /api/admin/tenant/observation-types`) + seed `seed_transit_assets.ts:363-373`. `ON CONFLICT (org_id,asset_type_id,observation_key) DO UPDATE`.

## 5.7 `core.locations` / `core.location_external_ids` / `core.asset_locations`
**No production INSERT/UPDATE path** in surveyed code. Only: export-delete DELETEs (§5.8) and
`verify_rls.ts` test fixtures (`core.locations` only). Their rows are **seed/migration-populated**
(the 14,916-row stop spine). → §10.

## 5.8 Export-delete DELETE cascade (`exportDeleteRoutes.ts`, `POST /api/admin/export-and-delete/execute`)
Single `BEGIN`-txn, child→parent order: `core.evidence` → `core.observations` → `core.visits` →
`core.assignments` → `core.location_external_ids` → `core.asset_locations` → `core.locations`
(plus public `stop_effort_history`/`stop_condition_history` by `visit_id`, `eam_bridge_route_log`).
**The four sidecars are NOT explicitly deleted** — they rely on `ON DELETE CASCADE` from their parent
canonical rows. (If that guarantee matters, it is structural via the FK; verified the FKs are CASCADE.)

## 5.9 Stale script
`backfillOidEncryption.ts` reads `core.visits.actor_oid` and writes `captured_by_oid_ciphertext`/
`captured_by_oid_key_id` — **all three columns are dropped from `core.visits`** (relocated to the
sidecar). The script is a pre-sidecar artifact and **would error if run today.** → §10.

---

# Section 6 — Canonical read paths (what the rebuilt UI can stand on) [D3]

## 6.1 The active intelligence/risk job — `riskMapService.rebuildStopRiskSnapshot()`
Confirmed: it reads **only `core.observations` + `core.visits`** (the legacy reader of the public log
tables is dead — companion §4). Triggers: CLI `riskMapJob.ts` + `POST /api/admin/intelligence/rebuild-risk-map`.
Runs on a **bare `pool.connect()` with no `app.current_org_id`** → depends on its role being
superuser/BYPASSRLS (PATTERN-001; relevant to ISSUE-018 wiring). CTEs and exact columns:
- `l3` CTE — `core.visits`: `ended_at`, `primary_asset_id`, `outcome` (WHERE `outcome='completed' AND ended_at IS NOT NULL`, joined to `transit_stop_assets`).
- `trash` CTE — `core.observations`: `asset_id`, `observation_type`, `observed_at`, `payload->>'level'` (WHERE `observation_type='trash_volume'`, 7-day window).
- `haz` CTE — `core.observations`: `asset_id`, `observation_type`, `observed_at` (WHERE the 8 safety `*_present` types, 7-day). **Severity synthesized as literal `1.0` — the `severity` column is NOT read.**
- `infra` CTE — `core.observations`: same columns (WHERE the 8 infra `*_present` types, 30-day). Score = `LEAST(COUNT(*),5)`.
- post-query `stop_condition_history` write — `core.visits`: `id`, `primary_asset_id`, `ended_at`, `org_id`.
- **Identity flag: CLEAN** — no identity column, no sidecar, anywhere in the job.

## 6.2 Other canonical reads
- **`loadRouteRunById.ts` events query** (`:87-104`, `withOrgContext`): `core.observations` (`observation_type`, `observed_at`) JOIN `core.visits` (bridge) JOIN `public.stop_photos` — surfaces per-stop `spot_check` events + photo keys to the route-detail UI. Clean (the identity JOIN is the *other* query in this fn — §9/B2).
- **`cleanLogService.ts` stop_effort_history derivation** (`:191/208/221/225`): reads `core.observations` (`visit_id`, `observation_type`, `payload`) + `core.visits` (`id`, `started_at`, `ended_at`, `org_id`) to write the de-identified effort row. Clean.
- **`visitService.getVisitContext`** (`:33-68`): reads `core.v_locations_transit` (`location_id`, `stop_id`). **`ensureVisitForRouteRunStop`** idempotency reads `core.visits` (`id` by `client_visit_id`) + `core.assignments` (`:92-103`). Clean.
- **`stopPhotosService`/`routeRunService`** read `core.visits`/`core.v_locations_transit` as the read-half of their INSERT…SELECTs. Clean.
- **`assetService`** reads `core.asset_types` (`:59`, `:117`, `:169` seed bridge) + `core.observation_type_registry` (`:98-102`) for admin config UI. Clean.
- **Admin Control Center** (`adminRoutes.ts`): `/overview` reads `core.v_clean_logs_transit` (`cleaned_at`, `duration_minutes`) + `core.v_hazards_transit` (`reported_at`, `severity`) — aggregate counts only; `/difficulty` reads `v_clean_logs_transit` + `v_locations_transit` + `v_assignments_transit` (location/asset/route aggregates). **No identity column selected** in any of them (the views expose worker columns but these reads don't select them). `/routes` + `/exceptions` read `public.*` only.

## 6.3 D3 — identity-free canonical reads for the rebuilt dispatch/admin UI
A rebuilt "completed route detail" / "stop history" surface can render completion + condition +
effort + evidence **with zero identity exposure** from these column sets (no sidecar, no
`identity_directory`):

- **`core.visits`** (completion + outcome; the table has no identity column): `id, org_id, location_id, primary_asset_id, assignment_id, started_at, ended_at, visit_type, outcome, reason_code, notes, client_visit_id, meta, created_at`. Service duration = `ended_at - started_at`; completion = `outcome='completed'`; safety skip = `outcome='skipped' AND reason_code='safety'`.
- **`core.observations`** (what was observed): `id, org_id, visit_id, location_id, asset_id, observation_type, severity, status, payload, observed_at`. (Condition from the `*_present` types + `trash_volume` `payload->>'level'`. Note: normalized `obs_kind`/`norm_status` don't exist yet — read `observation_type`/`payload` today.)
- **`core.evidence`** (photos, metadata only — identity in sidecar, not here): `id, org_id, visit_id, observation_id, kind, storage_key, captured_at, meta, created_at`. (`storage_key` → presigned read URL.)
- **`public.stop_effort_history`** (🔵 de-identified, already written by cleanLogService): `id, stop_id, visit_id, run_date, service_minutes, stop_type, complexity_score, had_hazard, had_infra_issue, trash_volume, computed_at, org_id`.
- **`public.stop_condition_history`** (🔵 de-identified, written by riskMapService): `id, stop_id, visit_id, scored_at, cleanliness_score, safety_score, infra_score, asset_id, org_id`.

Join by `visit_id` (visits + observations + evidence) or by `stop_id`/`visit_id` (the two history
tables) to render completion, condition scores, effort minutes, hazard/infra flags, trash level, and
photo evidence — **all without touching identity.** Identity (assigning Lead / assigned UL) is only
ever available through the one controlled-exception JOIN in `loadRouteRunById` (§9/B2), which must not
feed these surfaces. **This is the constructive guarantee that makes D3's teardown of the old
`public.clean_logs`-backed surfaces safe.**

## 6.4 core objects with NO application read path
- `core.asset_locations`, `core.location_external_ids`, `core.locations` — only export-delete DELETE / RLS test; no live read (location_external_ids is read indirectly only as a `v_*_transit` base table).
- All four sidecars — read only via the two export paths (§2.6); no non-export read.
- `core.evidence` — written/exported/deleted; no identity-free runtime read except the photo-key aggregation in `loadRouteRunById` reads `stop_photos`, not `core.evidence`.
- **Views never read in code:** `v_infra_transit`, `v_level3_logs_transit`, `v_stop_photos_transit`, `v_trash_volume_logs_transit`, `v_stop_location_map` (used only inside other views), `v_asset_locations_transit`, `v_assets`, `v_locations`. Only `v_clean_logs_transit`, `v_hazards_transit`, `v_assignments_transit`, `v_locations_transit` are read by app code (§8).

---

# Section 7 — Role / grant census (core) [D4]

Roles: `postgres` (super, bypassrls, LOGIN), `fieldpro` (app, LOGIN, **not** super/bypassrls),
`intelligence_reader` (NOLOGIN), `audit_reader` (NOLOGIN), `mcp_readonly` (LOGIN). **No role
memberships** (all `member_of = {}`).

## 7.1 Consolidated core grant matrix (SELECT unless noted; fieldpro = full CRUD+ on all)

| Core object | intelligence_reader | audit_reader | mcp_readonly |
|---|---|---|---|
| observations | SELECT | SELECT | SELECT |
| visits | SELECT | SELECT | SELECT |
| assignments | SELECT | SELECT | SELECT |
| evidence | SELECT | SELECT | SELECT |
| asset_types | SELECT | — | — |
| asset_locations | SELECT | — | SELECT |
| locations | SELECT | — | SELECT |
| location_external_ids | SELECT | — | SELECT |
| observation_type_registry | SELECT | — | — |
| **visit_actor_audit** | **—** | SELECT | **SELECT** |
| **observation_actor_audit** | **—** | SELECT | **SELECT** |
| **evidence_actor_audit** | **—** | SELECT | **SELECT** |
| **assignment_actor_audit** | **—** | SELECT | **SELECT** |
| all 12 `core.v_*` views | SELECT | — | SELECT |

`fieldpro`: `SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER` on entity/reference tables and
all views; `SELECT,INSERT,UPDATE,DELETE` (no TRUNCATE/REFERENCES/TRIGGER) on the four sidecars.

## 7.2 Reading of the matrix
- **`intelligence_reader`** — broad canonical read (entities, reference, registry, all 12 views) but **zero sidecar access**. Its labor-safety property is real and structural. It does, however, hold SELECT on all 6 `core.v_*_transit` log views, which **expose** worker columns (`user_id`/`reported_by`/`created_by_oid` from the underlying public tables) — the ISSUE-030 grant exposure (companion). It also reaches the underlying public log tables through those `fieldpro`-owned views (PG14 bridge, ISSUE-029). So intelligence_reader's exposure is on the **adapter** side (the views), not the core sidecars.
- **`audit_reader`** — the audit/export channel: the 4 sidecars + the 4 canonical entities only. No views, no reference tables, no registry. NOLOGIN/unwired (ISSUE-028) — the export paths that should use it currently run as `fieldpro`.
- **`mcp_readonly`** — LOGIN role with SELECT on **all four sidecars** + entities + most reference + all views (but not `asset_types`/`observation_type_registry`). **Can read the plaintext worker OID.** Same exposure as the companion found on the adapter side (`identity_directory`, `clean_logs`, etc.). → §10-D4.

## 7.3 Section-10 input (stated, not fixed)
The "intelligence_reader has no identity/sidecar grant" claim is **TRUE**. The one core-side identity
leak is **`mcp_readonly`** (sidecar SELECT, LOGIN). The redesign's permission model must decide whether
to revoke `mcp_readonly` to canonical-only (it appears to back read-only diagnostic/MCP access) or
document an explicit exemption. Not changed here.

---

# Section 8 — core view inventory + dependency chain

All 12 views **owned by `fieldpro`**, `security_invoker` **unset** (PG14.18 — runs as owner; ISSUE-029).
Grants per §7. Definitions verbatim (`pg_get_viewdef`):

## 8.1 The six `v_*_transit` log views (each exposes the underlying worker column — ISSUE-030)
These bridge **adapter→canonical**: each reads an adapter `public.*` log table (carrying the worker
column) + `assets` + `route_run_stops` + `route_runs` + `core.v_stop_location_map`, adding
`location_id` + `COALESCE(...) AS org_id_resolved`.

- **`v_clean_logs_transit`** — exposes `cl.user_id` 🔴 + `cleaned_at`/`duration_minutes`/5 task booleans/`level`/`notes`/`photo_keys`. Deps: `clean_logs[A]`, `assets[R]`, `route_run_stops[A]`, `route_runs[A]`, `v_stop_location_map[C]`. **Read by app:** yes (Control Center `/overview`, `/difficulty` — non-identity columns only).
- **`v_hazards_transit`** — exposes `h.reported_by` 🔴 + hazard fields. Same deps with `hazards[A]`. **Read by app:** yes (Control Center `/overview` — `reported_at`/`severity` only).
- **`v_infra_transit`** — exposes `i.reported_by` 🔴 + infra fields. Deps with `infrastructure_issues[A]`. **Read by app:** no.
- **`v_level3_logs_transit`** — exposes `l3.user_id` 🔴. Deps with `level3_logs[A]`. **Read by app:** no.
- **`v_stop_photos_transit`** — exposes `sp.created_by_oid` 🔴 (plaintext OID) + `s3_key`/`kind`/`captured_at`. Deps with `stop_photos[A]`. **Read by app:** no.
- **`v_trash_volume_logs_transit`** — no direct worker col 🟡. Deps with `trash_volume_logs[A]`. **Read by app:** no.

## 8.2 `v_assignments_transit` — 🟡 routing
`SELECT rrs.id AS source_route_run_stop_id, rr.org_id, 'route_stop' AS assignment_type, rrs.status, vt.location_id, rrs.asset_id AS primary_asset_id, rr.id AS source_route_run_id, rrs.sequence, rrs.created_at FROM route_run_stops rrs JOIN route_runs rr ON rr.id=rrs.route_run_id LEFT JOIN core.v_locations_transit vt ON vt.stop_id=rrs.stop_id`. Deps: `route_run_stops[A]`, `route_runs[A]`, `v_locations_transit[C]`. No worker col exposed (but `source_route_run_id → route_runs.assigned_user_oid` is one hop away). **Read by app:** yes (Control Center `/difficulty`).

## 8.3 Bridge / canonical views
- **`v_locations_transit`** 🟢 — `core.locations JOIN core.location_external_ids` (location_type='transit_stop', source_system='metro_stop') → `(location_id, org_id, location_type, label, lon, lat, source_system, stop_id)`. Deps: `core.locations[C]`, `core.location_external_ids[C]`. **Read by app:** yes (`getVisitContext`, assignment INSERT, `/difficulty`).
- **`v_stop_location_map`** 🟢 — `SELECT org_id, external_id AS stop_id, location_id FROM core.location_external_ids WHERE source_system='metro_stop'`. Deps: `core.location_external_ids[C]`. **Read by app:** no (used only inside the six log views).
- **`v_asset_locations_transit`** 🟢 — `core.asset_locations al JOIN v_locations_transit vt` → asset_location + stop_id. Deps: `core.asset_locations[C]`, `v_locations_transit[C]`. **Read by app:** no.
- **`v_assets`** 🟢 — passthrough of `public.assets` (id, org_id, asset_type_id, seed_key, lon, lat, display_name, active, created_at, updated_at). Deps: `public.assets[R]`. **Read by app:** no.
- **`v_locations`** 🟢 — passthrough of `core.locations`. Deps: `core.locations[C]`. **Read by app:** no.

## 8.4 Dependency tree (from `pg_depend`; [A]=adapter/public log, [R]=reference/public, [C]=canonical/core)
```
v_clean_logs_transit        → clean_logs[A], assets[R], route_run_stops[A], route_runs[A], v_stop_location_map[C]
v_hazards_transit           → hazards[A], assets[R], route_run_stops[A], route_runs[A], v_stop_location_map[C]
v_infra_transit             → infrastructure_issues[A], assets[R], route_run_stops[A], route_runs[A], v_stop_location_map[C]
v_level3_logs_transit       → level3_logs[A], assets[R], route_run_stops[A], route_runs[A], v_stop_location_map[C]
v_stop_photos_transit       → stop_photos[A], assets[R], route_run_stops[A], route_runs[A], v_stop_location_map[C]
v_trash_volume_logs_transit → trash_volume_logs[A], assets[R], route_run_stops[A], route_runs[A], v_stop_location_map[C]
v_assignments_transit       → route_run_stops[A], route_runs[A], v_locations_transit[C]
v_locations_transit         → core.locations[C], core.location_external_ids[C]
v_stop_location_map         → core.location_external_ids[C]
v_asset_locations_transit   → core.asset_locations[C], v_locations_transit[C]
v_assets                    → public.assets[R]
v_locations                 → core.locations[C]
```
**Pressure points:** the six `v_*_transit` log views are the only objects that join an adapter
worker-column table into a canonical-named surface; they are `fieldpro`-owned and
`intelligence_reader`-granted. **No core view touches a sidecar.** `v_assets` is the only core view
that reaches `public.assets` directly (a canonical FK target, §3).

---

# Section 9 — admin schema + identity_directory relocation target [D4]

## 9.1 Does an `admin` schema exist?
**No.** `\dn` returns only `core` and `public`. Relocating `identity_directory` to an `admin` schema
would be a **create-schema-then-move**, not a move into an existing schema.

## 9.2 `identity_directory` — every code path (relocation surface)
`public.identity_directory` (companion §1.18; FORCE RLS; the one place worker identity is stored).
Exactly **three runtime paths** + one test path; all three runtime paths correctly use `withOrgContext`:

| # | File:line | Op | What | withOrgContext? |
|---|---|---|---|---|
| B1 | `authz.ts:114` (`upsertIdentity`, called from `requireAuth` `:221`) | **WRITE** (upsert) | `INSERT … ON CONFLICT (oid) DO UPDATE` of display_name/email/last_seen_role/last_seen_at — fire-and-forget on **every authenticated request** | **YES** (`:112`) |
| B2 | `loadRouteRunById.ts:77-78` | **READ** | the documented **controlled-exception** double `LEFT JOIN identity_directory` on `assigned_user_oid` / `created_by_oid` → `assigned_user_name`/`assigned_user_role`/`created_by_name`. Comment marks it the ONLY permitted JOIN. | **YES** (`:111`) |
| B3 | `resourceRoutes.ts:162` (`GET /api/users`) | **READ** | `SELECT oid AS id, display_name, email, last_seen_role AS role FROM identity_directory WHERE last_seen_role IN ('UL','Specialist','Lead','Dispatch')` — the assignment dropdown. Guard `requireAuth, requireAnyRole(['Dispatch','Admin'])`. | **YES** (`:167`) |
| B4 | `verify_r11.ts:38` (+ :16,:27) | READ (test) | `SELECT count(*) FROM public.identity_directory` with NO org context — asserts RLS returns 0 rows (fail-closed check). | NO (intentional) |

**Relocation surface (do NOT move — inventory only):** a move to `admin.identity_directory` with
audit_reader-only access would repoint exactly **B1 (writer), B2 (route-detail JOIN), B3 (/api/users),
B4 (test)**. No intelligence/risk/Control-Center path reads `identity_directory` (confirmed — §6.1/6.2
never touch it), so the relocation does not intersect the intelligence layer. The `oidCipher.decrypt()`
sidecar-reveal path (§2.6) is wired in the audit registry but **has no caller**, so it is not yet a live
identity read. The write at B1 fires on every authed request — any relocation must keep that path's
latency/availability (it is fire-and-forget today).

---

# Section 10 — Loose ends + Open Questions (with D1/D2/D4 verdicts)

## 10.1 Loose ends
- **Sequences (9):** `asset_locations_id_seq, asset_types_id_seq, assignments_id_seq, evidence_id_seq, location_external_ids_id_seq, locations_id_seq, observation_type_registry_id_seq, observations_id_seq, visits_id_seq`. Sidecars use parent-id PKs (no seq).
- **Functions (1):** `core.enforce_location_external_ids_org_match()` (trigger fn for `trg_location_external_ids_org_match`).
- **Dead/inert core objects:** `core.asset_locations` (populated 14,916, **zero live readers**), `core.locations`/`core.location_external_ids` (read only via views / as FK spine; no direct app read), the 4 sidecars (read only by the 2 export paths), 8 of 12 views unread by app code (§6.4/§8). The `oidCipher.decrypt()` reveal capability is wired but uncalled. `backfillOidEncryption.ts` is a broken pre-sidecar script.
- **Seed vs live population:** seed/migration-populated (no live write): `core.locations`, `core.location_external_ids`, `core.asset_locations` (14,916 each), `core.asset_types` (1), and `core.observation_type_registry` (30, via seed/admin). Live field-written: `core.visits`, `core.observations`, `core.evidence`, `core.assignments`, and their 4 sidecars.
- **Core migration history:** all 9 canonical/reference tables created in `00000000_consolidated_schema.sql` (applied 2026-05-16). The 4 sidecars created in **`20260530_sidecar_extraction_a_additive.sql`** (applied 2026-05-31) — which also backfilled identity into the sidecars and provisioned `intelligence_reader`/`audit_reader`; **`20260530_sidecar_extraction_b_drop.sql`** (applied 2026-06-01) dropped the plaintext+cipher identity columns from `core.visits/observations/evidence/assignments`. Both have rollbacks under `backend/migrations/rollback/`.

## 10.2 Explicit verdicts

**D1 — `public.assets`: canonical infra or legacy mirror?** → **CANONICAL INFRASTRUCTURE (not a mirror).**
There is no `core.assets` table; `public.assets` is the asset registry that four canonical `core.*`
columns FK into (`observations.asset_id`, `visits.primary_asset_id`, `assignments.primary_asset_id` SET
NULL; `asset_locations.asset_id` RESTRICT). It is in the same "lives in public but is canonical, out of
adapter-clip scope" category as `public.organizations`. `public.asset_types` is likewise canonical infra
(the global code table the asset FK resolves through, complementary to org-scoped `core.asset_types`).
`core.asset_locations` is canonical but **inert** (14,916 rows, no live reader). Evidence: §3.2–3.5.

**D2 — Is run/stop completion timing reconstructable from `core` alone?** → **YES.** Per-stop timing is
a 1:1 column on `core.visits` (`started_at`/`ended_at`, keyed by `client_visit_id` = UUIDv5 of the
route_run_stop); run-level timing aggregates member-visit timestamps via `visits.assignment_id →
assignments.source_ref` (= route_run id). The adapter's `route_runs.started_at/finished_at` and
`route_run_stops.started_at/completed_at` are **convenience copies, not system-of-record.** Caveats: the
run↔visit link is a *string* join on `source_ref` (not a hard FK), and a planned-but-unstarted run has
no core timing (no visit anchor). Evidence: §4.3.

**D4 — Is "intelligence_reader has no identity/sidecar grant" true today? Where does identity leak?** →
**TRUE for `intelligence_reader`** (zero grant on all four sidecars, and no view exposes a sidecar — §2.4,
§2.5, §7). **Leaks:** (1) **`mcp_readonly`** (LOGIN) holds SELECT on all four sidecars → reads plaintext
worker OID (core-side); same role also reads `identity_directory` and adapter identity columns
(companion). (2) `intelligence_reader` *can* read worker columns on the **adapter** side via the six
`fieldpro`-owned `v_*_transit` log views (ISSUE-030/029) — not a core sidecar leak, but a labor-safety
exposure in the same role. (3) `audit_reader` holds sidecar SELECT **by design** (audit channel) but is
NOLOGIN/unwired, so today the export paths read sidecars as `fieldpro`.

**core.assignments — written today?** → **YES, 12 rows.** `ADAPTER_BOUNDARY.md`'s "0 rows / Tier 5 not
wired" is **stale/false.** Written via `INSERT…SELECT` per stop in `routeRunService.createRouteRun`
(`:422-439`) on `POST /api/route-runs`, same txn as `route_runs`/`route_run_stops`, with the
`assignment_actor_audit` sidecar; read back by `visitService` to set `core.visits.assignment_id` (9/9).
Evidence: §1.3, §5.3.

## 10.3 Where the live DB contradicts `CANONICAL_STATE_LAYER_DESIGN.md` / `ADAPTER_BOUNDARY.md`
1. **`core.assignments` is populated** (12 rows), not "0 rows / Tier 5 pending" (ADAPTER_BOUNDARY §1, §5.1). [resolved here]
2. **`core.asset_locations` is fully populated** (14,916), not "sparse" (ADAPTER_BOUNDARY §1).
3. **No `core.assets` table** — the design DDL (§3.1) shows `CREATE TABLE core.assets`; live has only the view `core.v_assets` over `public.assets`. (The design's §9 reconciliation note already flags this; confirmed.)
4. **`core.observations` has NO normalized columns** — no `obs_kind`/`norm_status`/`norm_severity`/`intervention`/`type_id` FK; `observation_type` is free text with no registry FK/CHECK. The design §3.3 normalized shape is **target-only** (matches design §9 items 4/5 DEFERRED). `severity`/`status` exist but are nearly unused (severity on 2/18, status 0/18).
5. **Registry shape is the seeder shape, not the design shape** — `core.observation_type_registry` has `value_type`(state|numeric|boolean)/`valid_values`/`is_required`, NOT the design §4.1 `obs_kind`/`payload_schema`/`ok_rule`/`severity_map`. The four-kind taxonomy lives in **code** (observationService mapping), not the table.
6. **Identity columns are dropped from the canonical entities** (matches the design's 2026-06-01 §3.2 "VERIFIED" note) — but only **`visit_actor_audit` carries the cipher envelope**; the other three sidecars store **plaintext `actor_ref` only** (encryption extension is the design's tracked follow-on — confirmed unbuilt).

## 10.4 Open questions raised by the inventory (not recommendations)
- **Q-A (asset_locations):** `core.asset_locations` is fully populated yet has zero live readers; the *live* asset↔stop translation uses the adapter `public.transit_stop_assets` instead. Does the redesign keep `core.asset_locations` as the canonical mapping (and move reads onto it), or is it dead weight?
- **Q-B (location spine ownership):** `core.locations`/`core.location_external_ids` (the 14,916-row spine) have **no live write path** — they are migration-seeded and mirror `public.transit_stops`. Which side is the intended system-of-record for stop geometry/identity post-redesign, given the adapter `transit_stops` is the one with live flag-update writes?
- **Q-C (run↔visit link strength):** the only link from a `core.visits` row to its run is `assignment_id → core.assignments.source_ref` (a **text** route_run id, not a typed FK). Is that string bridge intended to be the permanent canonical run linkage, or a placeholder until a hard FK lands?
- **Q-D (evidence atomicity):** the photo path writes `public.stop_photos` + `core.evidence` + `core.evidence_actor_audit` on a **bare pool (not one transaction)** — a partial failure can leave the canonical evidence and its sidecar out of sync with the adapter photo. Is that acceptable, or a defect to fix during the redesign?
- **Q-E (sidecar encryption asymmetry):** only `visit_actor_audit` is encrypted; the other three store plaintext OID. The export paths read all four in plaintext. Does the redesign want uniform encryption (the design's follow-on) before or independent of the adapter clip?
- **Q-F (export reads run as fieldpro):** `audit_reader` is provisioned with exactly the right sidecar grants but is NOLOGIN/unwired (ISSUE-028); the two export paths read the sidecars as `fieldpro` on a bare pool. The redesign's permission model will need to decide whether the export channel moves onto `audit_reader`.
- **Q-G (mcp_readonly):** a LOGIN role can read every sidecar and `identity_directory` — the one standing core-side identity leak. Revoke to canonical-only, or document an exemption? (Same question the companion raised; answered here for the core side.)
- **Q-H (normalized columns / registry drift):** the intelligence layer is supposed to read normalized `obs_kind`/`norm_status` (design §4.3) but those columns don't exist; today's risk job reads raw `observation_type` string sets + synthesizes severity. Any redesign that assumes the normalized read surface must first land the deferred migration (design §9 items 4/5).
- **Q-I (stale script):** `backfillOidEncryption.ts` references dropped `core.visits` columns and would error if run — leftover that should be retired.

---

*End of inventory. All facts verified live (DB) or by code read on 2026-06-06. Uncertainties are
confined to §10. No schema, code, or data was modified. Companion:
`docs/audit/2026-06-06-transit-adapter-complete-inventory.md`.*
