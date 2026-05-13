# 2026-05-13 — Schema Audit: Multi-Tenant Readiness & Labor Safety

**Scope**: every relation in `public.*` and `core.*` of `fieldpro_db` against two axes:
1. **Multi-tenant readiness** — `org_id` column present and `NOT NULL`, RLS policy enabled.
2. **Labor safety** — no per-worker attribution columns in intelligence/analytics tables, no joinable name-resolution paths leaking into aggregate surfaces.

**Inputs**:
- Live schema dump: `/tmp/schema_audit.sql` (4198 lines, regenerated for this audit).
- Live `pg_class.relrowsecurity`, `pg_policy`, `pg_stat_user_tables`.
- Backend code grep for `identity_directory` (3 callsites).

**Audit-only**: no schema or code changes performed. Findings are routed below by severity.

---

## CRITICAL — Labor Safety or Tenant Isolation Violations

### C1. `public.identity_directory` has no `org_id` and no RLS — cross-tenant identity leakage risk

| Property | Value |
|---|---|
| Columns | `oid` (PK, text), `display_name`, `email`, `last_seen_role`, `last_seen_at` |
| `org_id` | **absent** |
| RLS | **disabled** |
| Live rows | 4 |
| PK | `(oid)` — globally unique, not tenant-scoped |

This is the directory of all known workers (UL, Lead, Admin) keyed by Entra OID. With no `org_id` and no RLS:
- A multi-tenant deployment would pool every tenant's workforce into one global table.
- Any tenant's request that bypasses backend filtering (raw SQL, future BI tool, dashboard query, support tooling) reads every other tenant's user list (display name + email + role).
- The PK on `oid` enforces global uniqueness, which means two tenants cannot have the same OID — fine in practice (Entra OIDs are globally unique) but the row content is still cross-tenant.

`authz.ts:79` upserts on every authenticated request:
```sql
INSERT INTO identity_directory (oid, display_name, email, last_seen_role, last_seen_at) ...
```
This will write every tenant's users into a single shared table on the first multi-tenant deploy.

### C2. `identity_directory` is joined into operational route data, exposing a worker-name resolution path

`backend/src/domains/routeRun/loaders/loadRouteRunById.ts:59-60`:
```sql
LEFT JOIN identity_directory id_dir ON id_dir.oid = rr.assigned_user_oid
LEFT JOIN identity_directory creator ON creator.oid = rr.created_by_oid
```
Returned as `assigned_user_name` and `created_by_name` on the route-detail payload. Today this is the **only** join from a worker OID to a worker name in operational queries. Two observations:

- **Defensible today**: this is operational *intent* (who was scheduled), surfaced on a single-route view a Lead needs to coordinate. It is not a ranking, comparison, or scoring surface.
- **Latent risk**: it is the only name-resolution adapter in the codebase. Any future "show all routes by worker", "completion rate by worker", or "stops cleaned by X this week" feature is one JOIN away from violating the §8 / labor-safety guardrails. Worth marking the join site as a known-sensitive boundary (e.g. a comment + lint rule) so it is not casually replicated into intelligence layers.

`backend/src/modules/admin/resourceRoutes.ts:55` (`GET /api/users`) also reads from `identity_directory` to populate an assignable-users dropdown for Leads/Admins — same defensible-but-load-bearing pattern.

### C3. All `public.*` tables have RLS disabled — no defense-in-depth for tenant isolation

`pg_class.relrowsecurity = false` for **every** `public.*` table, including ones that already carry `org_id NOT NULL` (`public.assets`, `public.bases`, `public.route_pools`, `public.transit_stops`).

Tenant isolation in `public.*` is currently enforced solely by backend `WHERE org_id = $1` clauses. Any bug or omission (missing filter on a new endpoint, raw migration, ad-hoc script, support query) reads every tenant's rows. The RLS pattern is already established and working on the `core.*` side (`org_isolation` policy keyed on `current_setting('app.current_org_id')`), so the gap is execution, not design.

### C4. Vestigial worker-attribution columns in transit-adapter tables — latent labor-safety surface

| Table | Column | Status |
|---|---|---|
| `public.clean_logs` | `user_id bigint` | Hardcoded `123` placeholder per `current_state.md` §5.5; vestigial |
| `public.level3_logs` | `user_id bigint` | Same shape — vestigial |
| `public.hazards` | `reported_by bigint` | Vestigial |
| `public.infrastructure_issues` | `reported_by bigint` | Vestigial |
| `public.route_runs` | `user_id bigint` | Legacy field (modern path uses `assigned_user_oid`) |
| `public.lead_route_overrides` | `created_by text` | Active; stores OID of Lead who set override |
| `public.route_run_audit` | `created_by text` | Active; stores OID |

These are documented in `current_state.md` as vestigial. They are not a current violation (no data, no query joins them as labor signal) but they should be **removed**, not just ignored, because their presence in the schema invites future regressions. `current_state.md §5.5` explicitly says "Do not use this pattern in new code" — but the columns themselves persist and will eventually be reintroduced by a careless ORM scaffold or migration.

---

## ACTION REQUIRED — Multi-Tenant & Schema Gaps

### A1. `public.*` tables missing `org_id` entirely

Tenant isolation impossible without per-row tenant tag. All of these participate in tenant-scoped operational data:

| Table | Live rows | Notes |
|---|---|---|
| `public.route_run_stops` | 4 | Operational truth scaffolding; `route_run_id` → `route_runs.org_id` is only indirect path |
| `public.clean_logs` | 2 | Transit adapter — but still tenant-scoped operational data |
| `public.hazards` | 3 | Same |
| `public.infrastructure_issues` | 11 | Same |
| `public.level3_logs` | 0 | Same |
| `public.trash_volume_logs` | 2 | Same |
| `public.stop_photos` | 15 | Anchors evidence; **also** has no `org_id` on a row that contains `s3_key` |
| `public.lead_route_overrides` | 0 | Active operational concept; tenant-scoped |
| `public.route_run_audit` | 0 | See also A5 (type mismatch with `route_runs.id`) |
| `public.asset_external_ids` | 14916 | Should mirror `core.location_external_ids` which IS scoped |
| `public.transit_stop_assets` | 14916 | Asset binding table; cross-tenant in current shape |
| `public.stop_risk_snapshot` | 0 live | Intelligence layer — derives from per-stop data |
| `public.stop_condition_history` | 0 | R10 intelligence layer; org-blind |
| `public.stop_effort_history` | 0 | Same |
| `public.stops_legacy` | 14916 | Legacy seed table; may be acceptable if frozen, but should be confirmed |
| `public.asset_types` | 1 | Global code table; **`core.asset_types` is the per-tenant replacement** — confirm migration plan deprecates `public.asset_types` |
| `public.identity_directory` | 4 | See C1 |

### A2. `public.route_runs.org_id` is nullable

```
org_id bigint  -- NULLABLE
```

A NULL `org_id` cannot be filtered by an RLS policy and cannot be filtered by a `WHERE org_id = $1` clause without producing surprising NULL semantics. Should be `NOT NULL` after backfill.

### A3. `core.*` tables that have `org_id` but no RLS

| Table | `org_id` | RLS |
|---|---|---|
| `core.asset_locations` | NOT NULL | **disabled** |
| `core.location_external_ids` | NOT NULL | **disabled** |

Every other `core.*` table has both. These two are the only `core` gaps — likely an oversight in the Tier that introduced them. Adding the same `org_isolation` policy used elsewhere closes the gap with no schema change.

### A4. `public.*` tenant-tagged tables that have `org_id` but no RLS (defense-in-depth gap)

`public.assets`, `public.bases`, `public.route_pools`, `public.transit_stops` all carry `org_id NOT NULL`. None have RLS. Same fix as A3.

### A5. `public.route_run_audit.route_run_id` is `uuid`, but `public.route_runs.id` is `bigint` — FK impossible

```sql
public.route_run_audit (
    id uuid,
    route_run_id uuid NOT NULL,  -- mismatched type
    ...
)
public.route_runs ( id bigint ... )
```
No FK declared (cannot be — types differ). The table has 0 rows; likely never wired. Either fix the column type or drop the table.

### A6. `public.lead_route_overrides` has 0 rows and no FK to `route_pools`/`stops`

`pool_id text NOT NULL`, `stop_id text NOT NULL`, `created_by text NOT NULL` — all unconstrained. If the table is real, add FKs. If it's not, it's a candidate for removal (see Orphan section).

### A7. `core.observation_type_registry` has 25 rows but lacks a unique constraint visible at audit time

Not visible in dump excerpt — registry tables should usually have `UNIQUE (org_id, asset_type_id, observation_key)`. Worth confirming during the next Tier 8 follow-up; flagging only because the registry is now load-bearing per Tier 8 Change 3.

---

## CLEAN — Tables That Pass All Checks

**Canonical (`core.*`) — `org_id NOT NULL` + RLS + identity stored as OID only (no resolvable name in-row):**

| Table | `org_id` | RLS | Identity columns |
|---|---|---|---|
| `core.assignments` | NOT NULL | enabled | `created_by_oid` (OID only) |
| `core.visits` | NOT NULL | enabled | `actor_oid` (OID only) |
| `core.observations` | NOT NULL | enabled | `created_by_oid` (OID only) |
| `core.evidence` | NOT NULL | enabled | `captured_by_oid` (OID only) |
| `core.locations` | NOT NULL | enabled | — |
| `core.asset_types` | NOT NULL | enabled | — |
| `core.observation_type_registry` | NOT NULL | enabled | — |

OID-only identity is the correct shape: it preserves who-acted for audit and idempotency without embedding a resolvable name into truth-bearing rows. The labor-safety risk exists only if these OIDs are later JOINed to `identity_directory` in an intelligence/aggregate context (see C2).

**Intelligence materialized views — aggregate-only, no per-worker grouping:**

`public.cleanliness_risk_mv`, `public.safety_risk_mv`, `public.infrastructure_risk_mv`, `public.level3_compliance_mv`, `public.stop_status_mv` all aggregate by `stop_id` only. No `GROUP BY user_id`, no worker-keyed columns. Labor-safe by structure. (They DO read from `stops_legacy` rather than `transit_stops` / `core.locations` — that is a canonical-alignment concern, not a labor-safety one.)

**Reference / root tables (org scoping not applicable):**

- `public.organizations` — tenancy root.
- `public.schema_migrations` — infrastructure.

---

## Orphan / Unused Candidates (0 live rows, not in canonical or transit-adapter path)

| Table | Reason to keep | Reason to drop |
|---|---|---|
| `public.lead_route_overrides` | Active conceptual feature in Lead UI | 0 rows, no FKs, no clear write path identified in this audit |
| `public.route_run_audit` | Audit log intent | 0 rows, type mismatch with parent (A5) prevents FK |
| `public.stop_condition_history` | R10 wires this | 0 rows, deferred — fine as scaffolded |
| `public.stop_effort_history` | R10 wires this | 0 rows, deferred — fine as scaffolded |
| `public.stop_risk_snapshot` | Feeds 4 risk MVs | `n_live_tup=0` but `reltuples=206` — likely truncated dev state, not orphan |
| `public.stops_legacy` | Seed source, joined by `stop_status_mv` | 14916 rows; if `transit_stops` is now canonical, `stops_legacy` is duplicate state — needs explicit deprecation plan |
| `public.asset_types` (global) | Legacy code table | `core.asset_types` is the per-tenant replacement; one row in the global table |

---

## `identity_directory` Deep Dive (per task section 3)

**Columns**: `oid text PK`, `display_name text`, `email text`, `last_seen_role text`, `last_seen_at timestamptz`.

**Tenant tagging**: `org_id` **absent**. Cross-tenant identity pool risk on first multi-tenant deploy (see C1).

**RLS**: **disabled**.

**FK references into it**: **none declared** (no FK constraints from any table to `identity_directory.oid`). The two indexes on `public.route_runs (assigned_user_oid)` and `(created_by_oid)` exist purely to speed up the unconstrained JOIN.

**Query-level joins / read sites** (full backend grep result):

| File | Use | Surface |
|---|---|---|
| `backend/src/authz.ts:79` | UPSERT on every authenticated request | write path; not a leak by itself |
| `backend/src/domains/routeRun/loaders/loadRouteRunById.ts:59-60` | JOIN twice (assignee + creator) to resolve names | operational route-detail; defensible but sensitive |
| `backend/src/modules/admin/resourceRoutes.ts:55` | `SELECT ... FROM identity_directory WHERE last_seen_role IN ('UL','Lead')` | assignable-users dropdown for Leads/Admins |

No intelligence-layer code (risk MVs, history tables, control-center aggregates) currently JOINs to `identity_directory`. The labor-safety guardrails are intact **today**. The risk is forward-looking: the table has no `org_id` and no RLS, and it is the sole name-resolution adapter — both of those properties matter for the next multi-tenant and BI build-out.

---

## Summary table

| Severity | Count | Examples |
|---|---|---|
| CRITICAL | 4 | C1 identity_directory tenant gap; C2 name-resolution join; C3 zero `public.*` RLS; C4 vestigial `user_id`/`reported_by` cols |
| ACTION REQUIRED | 7 | A1 17 tables missing `org_id`; A2 nullable `org_id` on `route_runs`; A3/A4 `org_id`-present-but-no-RLS; A5 type mismatch; A6/A7 FK & constraint gaps |
| CLEAN | 7 canonical tables + 5 MVs + 2 reference | all `core.*` truth tables + intelligence MVs |
| ORPHAN candidates | 7 | see table above |

---

## Notes on routing

- Per `CLAUDE.md` step 2, Analysis output is normally a spec in `/planning/specs/`. The user requested this be saved as an audit report under `docs/audit/` instead and asked for no changelog. Both instructions honored.
- This audit does not propose fixes. Each CRITICAL or ACTION REQUIRED item should be picked up as its own spec/refinement item — many of these (R-style multi-tenant items, especially A1 and C1) likely belong as a new R-track item in `REFINEMENT_INDEX.md`.
