# Clean-Room Rebuild — Deploy Gate Closed In Fact (ISSUE-038 / ISSUE-039)

> **Date:** 2026-06-23
> **Type:** VERIFICATION RUN — no code changes. Single end-to-end clean-room rebuild on a
> genuinely empty database, the run the ISSUE-038/039 done-criterion requires (the pieces were
> proven on scratch DBs; this is the one fresh end-to-end run nobody had executed).
> **Dispatch:** "Clean-Room Rebuild: close the deploy gate in fact."

---

## VERDICT: 🟢 GREEN — the deploy gate is now closed IN FACT, not just in principle.

A completely empty PostgreSQL cluster rebuilt to canonical state end-to-end with **exit 0**,
and **both** the migration chain **and** the labor-safety grant posture reproduced **entirely
from version control** — nothing hand-applied. The four-part done-criterion is satisfied on a
genuinely fresh environment:

| Leg | Result |
|-----|--------|
| **clean** (empty DB → `npm run migrate` → exit 0) | ✅ 24 versioned migrations applied, 0 FAIL |
| **intended-set** (the 30-object mcp_readonly grant wall lands exactly) | ✅ 30/30, 0 missing / 0 extra; identity-leak = 0 |
| **idempotent** (second run no-ops cleanly) | ✅ exit 0, 0 apply / 81 skip / 0 FAIL; ledger + grants unchanged |
| **live-unregressed** | ✅ established at ISSUE-038/039 merge (idempotent re-assert on the populated DB); this run additionally shows the clean build reproduces a **stricter, correct** posture than live (see §Note) |

> **exit 0 alone was NOT treated as acceptance.** The grant wall (30-object intended set) and
> identity-leak = 0 were independently proven before calling it green.

**Environment handling:** the run started from a genuinely empty container (the live dev data
dir was moved aside, a fresh dir initialized, `initdb` produced a bare cluster). After
verification the original dev DB (14,916 `transit_stops` rows, full data) was restored from the
backup; the disposable clean-room data dir was removed. The repo is unchanged.

---

## Environment

- DB: `postgres:14` container `fieldpro_db` (`docker-compose.yml`), app role `fieldpro`
  (superuser in-container), db `fieldpro_db`.
- Migration command: `cd backend && PG*=… npm run migrate` → `ts-node src/scripts/migrate.ts`.
- Runner semantics: applies `00000000_consolidated_schema.sql` (pre-canon structural baseline)
  → `00000001_reconcile_issue038_record_canon_drift.sql` (fresh-safe: all catalog gates FALSE on
  an empty DB, records nothing) → 22 dated delta migrations → skips all `legacy_*` once
  consolidated is applied.

---

## Step 1 — START FROM EMPTY (proof the DB had zero prior state)

Teardown: `docker stop/rm fieldpro_db`; live data dir moved to `data/db.preclean-20260623`
(reversible backup, not deleted); fresh empty `data/db` created; `docker compose up -d postgres`
→ fresh `initdb`. Ready in 3s.

```
-- schemas (\dn): only `public` (owner fieldpro). No core, no transit.
SELECT count(*) ... WHERE schema_name IN ('core','transit');   -> 0
-- app tables (any non-system schema):
SELECT count(*) ... table_schema NOT IN ('pg_catalog','information_schema');   -> 0
-- roles (\du): only `fieldpro` (Superuser). Targeted check:
SELECT rolname FROM pg_roles WHERE rolname IN
  ('mcp_readonly','intelligence_reader','audit_reader');   -> (0 rows)
-- migration ledger:
SELECT to_regclass('public.schema_migrations');   -> (null / absent)
```

Genuinely empty: one schema, zero app tables, only the bootstrap superuser, no custom roles, no
ledger.

## Step 2 — RUN THE FULL MIGRATION CHAIN (`npm run migrate` from clean)

```
  apply 00000000_consolidated_schema.sql
  apply 00000001_reconcile_issue038_record_canon_drift.sql
  apply 20260518_rls_phase1_public_tables.sql
  apply 20260518_rls_phase2_add_orgid.sql
  apply 20260518_rls_phase3_structural_fixes.sql
  apply 20260519_role_rename_backfill.sql
  apply 20260525_role_rename_last_seen_role_check.sql
  apply 20260530_rls_harden_core_location_org_isolation.sql
  apply 20260530_sidecar_extraction_a_additive.sql
  apply 20260530_sidecar_extraction_b_drop.sql
  apply 20260611_mcp_readonly_canonical_grant_provision.sql
  apply 20260612_mcp_readonly_revoke_canonical_only.sql
  apply 20260613_create_transit_schema.sql
  apply 20260613_p1_2_redefine_stop_status_mv_drop_level3logs.sql
  apply 20260613_p1_drop_dead_transit_views.sql
  apply 20260614_canon_norm_step1_observation_columns.sql
  apply 20260614_canon_norm_step2_registry_contract.sql
  apply 20260614_canon_norm_step3_registry_rules.sql
  apply 20260614_canon_norm_step4_normalized_view.sql
  apply 20260614_canon_norm_step6_backfill_observations.sql
  apply 20260617_canon_norm_2_backfill_hazard_infra_severity.sql
  apply 20260617_canon_norm_3_grant_normalized_view_select.sql
  apply 20260617_canon_norm_p1_presence_severity_passthrough.sql
  apply 20260620_issue037_drop_trash_volume_logs.sql
  skip  legacy_20251130_base_schema.sql (legacy)
  … [all 58 legacy_* skipped] …
Migration run complete.

===== MIGRATE EXIT CODE: 0 =====
```

24 versioned migrations applied for real (incl. the 11 ISSUE-031 canon migrations + the
`20260611` grant provision), all 58 `legacy_*` skipped, **exit 0**, no FAIL.

## Step 3 — CONFIRM THE LEDGER

```
schema_migrations rows: 24
the 11 canon migrations + 20260611 grant migration present: 12 / 12
legacy_ rows recorded: 0   (skipped, never inserted)
```

Full ledger (24 rows): `00000000_consolidated_schema.sql`, `00000001_reconcile_issue038…`,
`20260518_rls_phase1/2/3`, `20260519_role_rename_backfill`, `20260525_role_rename_last_seen…`,
`20260530_rls_harden…`, `20260530_sidecar_extraction_a/b`, **`20260611_mcp_readonly_canonical_grant_provision`**,
`20260612_mcp_readonly_revoke_canonical_only`, `20260613_create_transit_schema`,
`20260613_p1_2_redefine_stop_status_mv_drop_level3logs`, `20260613_p1_drop_dead_transit_views`,
`20260614_canon_norm_step1/2/3/4/6`, `20260617_canon_norm_2/3/p1`,
`20260620_issue037_drop_trash_volume_logs`.

## Step 4 — CONFIRM THE GRANT POSTURE (the labor-safety wall)

**(a) Exact mcp_readonly grant set:** `30 | SELECT` (30 objects, SELECT only — no write privilege).

**(b) Intended-set exactness** — diff of granted-vs-intended (30):
```
 kind | obj
------+-----
(0 rows)        -- 0 missing, 0 extra → the 30-object intended set landed EXACTLY
```
The 30 = 14 core (`observations, visits, evidence, assignments, asset_locations, locations,
location_external_ids, v_assets, v_locations, v_locations_transit, v_asset_locations_transit,
v_assignments_transit, v_stop_location_map, v_observation_normalized`) + 16 public (`assets,
asset_types, asset_external_ids, bases, organizations, route_pools, route_run_stops, stops_legacy,
stop_assets_v1, stop_risk_snapshot, transit_stops, transit_stop_assets, transit_stop_assets_v1,
export_stop_status_v1, export_pool_daily_summary_v1, export_route_run_origin_mix_v1`).

**(d) `\dp` evidence (canonical spine sample):**
```
 core | observations | table | fieldpro=arwdDxt/fieldpro
                              | intelligence_reader=r/fieldpro
                              | audit_reader=r/fieldpro
                              | mcp_readonly=r/fieldpro          <- read-only (r), org_isolation RLS policy present
 core | visits       | table | … mcp_readonly=r/fieldpro …
```

**(e) IDENTITY-LEAK CHECK** — mcp_readonly SELECT on any worker-identity object:
```
 obj | object_exists | mcp_can_select
-----+---------------+----------------
(0 rows)

identity-leak count (MUST be 0): 0
```
Checked all 18 identity surfaces that exist: 4 actor-audit sidecars, `identity_directory`,
`route_runs`, `lead_route_overrides`, the 6 work-attribution logs, and the 5 identity-named
`core.v_*_transit` views. **None** are SELECT-able by mcp_readonly.

**(f) COLUMN-SCAN leak** — any granted object exposing a worker-identity column
(`user_id / reported_by / created_by / captured_by / assigned_user / *_oid / email`):
```
 granted_object | column_name
----------------+-------------
(0 rows)        -- no granted object exposes a worker-identity column
```

## Step 5 — IDEMPOTENT RE-RUN

Second `npm run migrate` against the now-built DB:
```
exit code: 0
apply lines: 0
skip lines:  81      (24 versioned + 58 legacy, all skipped; second confirmation run identical)
FAIL lines:  0
Migration run complete.
```
Post-re-run state unchanged: `schema_migrations_rows=24`, `distinct_filenames=24` (no duplicate
inserts — the PK held), `mcp_readonly_grants=30`. Idempotency guards hold on the re-run path.

---

## Note — clean build is STRICTER than the hand-mutated live DB (confirmation, not a regression)

On restore, the live dev DB reports **31** mcp_readonly grants vs the clean build's **30**. The
extra live grant is the known **D3 residual** — an identity-named transit view
(`core.v_clean_logs_transit` / `core.v_hazards_transit`) still granted on the hand-mutated live
DB, whose eviction is owned by card **ISSUE-031/D3** (labor-safety-gated, still open). The clean
room reproduces *only* the version-controlled intended set (30, no residual), which is the
correct target posture. This is exactly the drift ISSUE-039 set out to eliminate: the fresh
build's grant wall is provable and reproducible; the live residual is a separate, carded
eviction. The fresh build does **not** carry it.

---

## Conclusion

The deploy gate — "empty DB → `npm run migrate` → exit 0 → schema + grant posture match a
known-good, version-controlled target" — is **closed in fact**. Migrations and the labor-safety
grant wall both reproduce from version control with nothing hand-applied; the 30-object intended
set lands exactly; identity-leak is 0; the chain is idempotent on re-run. ISSUE-038 and ISSUE-039
are proven on a genuinely fresh environment, not just on scratch DBs.

**Procedure is fully reproducible** from this document: tear down `fieldpro_db`, empty
`data/db`, `docker compose up -d postgres`, `cd backend && PGUSER=fieldpro PGPASSWORD=fieldpro_pass
PGDATABASE=fieldpro_db PGHOST=localhost PGPORT=5432 npm run migrate`, then re-run steps 3–5.
