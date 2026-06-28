# Clean-Build vs Live-Dev — The Complete Drift Diff

**Date:** 2026-06-27 (recon executed 2026-06-27→28) · **Branch:** `docs/clean-build-vs-live-diff` ·
**Method:** read-only catalog introspection on live dev; a throwaway clean reference DB built from
the migration chain alone. **No mutation of the live dev cluster.** No fix applied — this recon
*bounds* the problem; every fix is a recommendation, not an action.

## Purpose

Closing one card kept surfacing the next (ISSUE-052, 053, audit_log policy-name trap, writeAuditLog
fallback twin, live-dev ownership reconcile, schema_migrations drift, MT-2 live-apply). The hypothesis:
these are **not N independent problems** but symptoms of **one fault line** — the live dev DB has
**drifted** from what the version-controlled migration chain builds. This document draws a **finite,
closed box** around that divergence so it stops being discovered one card at a time.

The deliverable is the **CLOSED, TOTAL** list of every way live differs from migration-truth — not
"here's more drift," but "here is the complete diff; it contains exactly these items and no more."

---

## Method & Artifact Locations

**Clean reference DB ("migration-truth"):** a fresh, isolated `postgres:14` container
`fieldpro_clean_ref` on port **5499** (live dev is `fieldpro_db` on 5432 — never touched). Built by:

1. Fresh volume → `db/init/00_bootstrap_provisioner.sh` runs at initdb (ISSUE-041 bootstrap:
   creates `fieldpro_admin` BYPASSRLS/CREATEDB/CREATEROLE + member of `fieldpro`; installs
   `pgcrypto`; downgrades `fieldpro` to NOSUPERUSER NOBYPASSRLS).
2. Full chain via the runner **as `fieldpro_admin`**: `PGADMIN_USER=fieldpro_admin … npm run migrate`.
3. **Result: exit 0, 28 migrations applied, "Migration run complete." Idempotent re-run: exit 0, 0
   applies.** The chain cleanly produces a complete schema. *(No STOP-condition: the build did not fail.)*

**Both states captured (read-only on live) into comparable dumps** under `/tmp/cvl/`:
`{live,clean}_schema.sql` (pg_dump `--schema-only --no-owner --no-privileges`), plus tabular catalog
captures for ownership, policies, roles, memberships, grants, schema_migrations, organizations, and
per-table row counts. Both schema dumps are **4050 lines**; the normalized structural diff is below.

Both DBs were introspected as the **same role** (`fieldpro_admin`, BYPASSRLS on both) so row counts
and catalog reads are not RLS-masked and the comparison is symmetric.

---

## DIFF TABLES (sections a–g)

### (a) Schema structure — `pg_dump --schema-only`

The **only** non-cosmetic structural difference across 4050 lines is the **RLS policy predicates**.
Every table, column, type, index, constraint, view, MV, function, and trigger is **byte-identical**.

| Item | LIVE | CLEAN | TAG |
|---|---|---|---|
| 36 org-scoped RLS policy quals (34 `org_isolation` + `audit_log_select`/`audit_log_insert`) | **fail-OPEN**: `COALESCE(current_setting(...),'')='' OR org_id=…` | **fail-CLOSED**: `org_id=…` only | **DRIFT** (MT-2 not applied to live) |
| `\restrict`/`\unrestrict` dump tokens | random hash | random hash | (cosmetic — ignore) |
| All other DDL (tables, columns, types, FKs, indexes, views, MVs, fns) | — | — | **IDENTICAL** |

> The fail-open→fail-closed flip touches exactly **36 policies** — matching the MT-2 commit message
> ("36 policies"): 13 `core.*` + 21 `public.*` `org_isolation` policies + 2 `audit_log` per-command
> policies. `export_delete_tokens` uses the **text** predicate form (no `::bigint`) in both states.

### (b) Object ownership — every object differs

| Scope | LIVE owner | CLEAN owner | TAG |
|---|---|---|---|
| 77 of 82 objects (core + public + transit tables/views/MVs/seqs) | `fieldpro` | `fieldpro_admin` | **DRIFT** |
| 5 objects: `core.{assignment,evidence,observation,visit}_actor_audit`, `core.v_observation_normalized` | **`postgres`** | `fieldpro_admin` | **DRIFT** (the hard MT-2 blocker) |

> **All 82 objects** diverge. On clean, the provisioner (`fieldpro_admin`) uniformly owns everything
> it created. On live, ownership is split `fieldpro` (legacy build) + `postgres` (the 5 ISSUE-031 canon
> objects hand-applied via `psql` as the superuser). `fieldpro_admin` is a **member of `fieldpro`**, so
> it can `ALTER`/`DROP POLICY` on the 77 `fieldpro`-owned objects — **but it is not a member of
> `postgres`**, so it **cannot** alter the 5 `postgres`-owned objects. That is the precise mechanism of
> the "MT-2 ownership-reconcile blocker": applying MT-2 to live via the runner would fail on those 5.

### (c) RLS policies — names/commands identical; only predicates differ

| Item | LIVE | CLEAN | TAG |
|---|---|---|---|
| Policy set (schemaname/tablename/policyname/cmd) | 37 policies | 37 policies | **IDENTICAL** |
| Policy predicates (`qual`/`with_check`) | fail-open | fail-closed | **DRIFT** (= item a, same root) |

### (d) Roles & attributes

| Item | LIVE | CLEAN | TAG |
|---|---|---|---|
| `postgres` superuser role | **present** (super/bypassrls/login) | **absent** | **DRIFT** (env break-glass; on clean the bootstrap superuser is `fieldpro` itself) |
| `mcp_readonly` LOGIN | **`login=true`** | **`login=false`** (NOLOGIN) | **DRIFT** → borderline **LIVE-ONLY** (login+password hand-set for the postgres MCP server; migration deliberately ships it NOLOGIN/no-password) |
| `fieldpro`, `fieldpro_admin`, `intelligence_reader`, `audit_reader` attributes | match | match | **IDENTICAL** |
| Memberships (`fieldpro_admin` ∈ `fieldpro`) | 1 | 1 | **IDENTICAL** |

### (e) Grants on the canonical read roles

| Item | LIVE | CLEAN | TAG |
|---|---|---|---|
| `audit_reader` SELECT on `core.{assignment,evidence,observation,visit}_actor_audit` (4) | **missing** | present | **DRIFT** (live missing) |
| `intelligence_reader` SELECT on `core.v_observation_normalized` (1) | **missing** | present | **DRIFT** (live missing) |
| `mcp_readonly` SELECT on `core.v_observation_normalized` (1) | **missing** | present | **DRIFT** (live missing) |
| `mcp_readonly` total objects | 29 | 30 | (clean = full canonical set) |
| `audit_reader` total objects | 4 | 8 | (clean = full audit set) |
| **Identity wall** — `mcp_readonly`/`intelligence_reader` SELECT on any `*_actor_audit` / `identity_directory` / OID-bearing object | **0** | **0** | **IDENTICAL — wall intact on both** |

> The 6 grants live is missing all attach to the 5 `postgres`-owned objects from (b): when those
> objects were hand-applied on live, the corresponding grant migrations did not confer SELECT on them.
> The clean chain grants them correctly. **None of the missing/added grants touch the identity wall** —
> they are `audit_reader`→audit-tier tables (allowed by design) and reader→normalized-view (no identity).

### (f) `schema_migrations` contents

| Item | LIVE | CLEAN | TAG |
|---|---|---|---|
| Total recorded | 80 | 28 | — |
| In CLEAN, not recorded on LIVE | — | **`20260627_mt2_rls_fail_closed.sql`** | **DRIFT** (= item a — MT-2 unapplied on live) |
| On LIVE, not in CLEAN | 53 pre-rename / `legacy_` / `migrations_manifest.sql` / `V1_*` names | — | **DRIFT (benign)** — runner maps `legacy_X`↔`X`, so live correctly skips the `legacy_*` files; functionally equivalent to clean's consolidated baseline |
| `20260627_issue013_seed_org1_tenant_uuid.sql` | **recorded** | recorded | **IDENTICAL** (013 already applied to live) |

### (g) Seed-critical rows & row counts

| Table | LIVE | CLEAN | TAG |
|---|---|---|---|
| `organizations` (id, tenant_uuid) | 1 row — org 1, `tenant_uuid=66d756aa-…` | 1 row — org 1, `tenant_uuid=66d756aa-…` | **IDENTICAL** (013 seed migration reproduces it; GUID = `AZURE_TENANT_ID` in `backend/.env`) |
| **`core.observation_type_registry`** | **30 rows** (full obs taxonomy) | **0 rows** | **LIVE-ONLY-TRUTH** ⚠️ — no migration anywhere seeds it |
| `core.asset_types` / `public.asset_types` | 1 / 1 (`transit_stop`) | 0 / 0 | **LIVE-ONLY-TRUTH** (seeded by `seed_transit_assets.ts`, not a migration) |
| `public.bases` | 2 (South/North Facilities) | 0 | **LIVE-ONLY-TRUTH** (operational config) |
| `public.route_pools` | 12 | 0 | **LIVE-ONLY-TRUTH** (operational config) |
| `public.identity_directory` | 4 | 0 | dev users (OID-bearing) — **dev data**, not truth |
| Inventory: `locations`, `assets`, `transit_stops`, `stop_pool_memberships`, `asset_external_ids`, `location_external_ids`, `stops_legacy`, `transit_stop_assets` | **14,916 each** | 0 | **dev data** (KCM stop inventory; re-ingestable from source) |
| Field data: `visits` (18), `observations` (38), `evidence` (19), `assignments` (37), the 4 `*_actor_audit` (18–38), `route_runs` (4), `route_run_stops` (37), `clean_logs` (7), `hazards` (2), `infrastructure_issues` (2), `stop_photos` (9), `stop_*_history` (1/12) | non-zero | 0 | **dev data** (ephemeral test captures) |
| `public.audit_log` | 30,069 | 0 | **dev data** (append-only history) |
| `public.stop_risk_snapshot` | 206 | 0 | **dev data** (derived/recomputable) |
| `public.schema_migrations` | 80 | 28 | (= item f) |

---

## The 5 Questions — Answered with Evidence

**Q1 — Is the live ownership problem DRIFT (does a clean build already have correct `fieldpro_admin`
ownership so MT-2 applies)?**
**YES — it is DRIFT.** On the clean reference DB, **all 82 objects are owned by `fieldpro_admin`**
(section b). MT-2 applied cleanly there (the clean build *is* fail-closed). The live split —
`fieldpro` owns 77, **`postgres` owns 5** (`*_actor_audit` + `v_observation_normalized`) — is the
drift. `fieldpro_admin` (member of `fieldpro`) can alter the 77 but **not** the 5 `postgres`-owned
objects, which is exactly why MT-2 cannot be runner-applied to live as-is. A clean rebuild erases the
split.

**Q2 — Complete set of `schema_migrations` drift?**
Exactly two classes (section f): **(1)** `20260627_mt2_rls_fail_closed.sql` is recorded on clean but
**not on live** (MT-2 unapplied — the only *active* migration live is missing). **(2)** 53 pre-rename /
`legacy_*` / manifest names are recorded on live but not clean — **benign**, an artifact of live being
built file-by-file before consolidation; the runner's `legacy_`↔original mapping makes them equivalent
to clean's consolidated baseline. **No active migration is recorded on live-but-absent-from-clean, and
no active migration is recorded on clean-but-unapplied-to-live except MT-2.** `013` is on both.

**Q3 — Does the clean reference DB already embody the end-state we want (MT-2 fail-closed, 013 seed
org-1, 041a ownership, identity wall intact)?**
**YES — with one functional caveat.** Evidence: fail-closed RLS on all 36 policies ✓ (a); org 1 +
`tenant_uuid` seeded by 013 ✓ (g); uniform `fieldpro_admin` ownership + `fieldpro` NOSUPERUSER
NOBYPASSRLS + read roles NOLOGIN ✓ (b, d); identity wall (`mcp_readonly`/`intelligence_reader` =
**0** identity grants) intact ✓ (e). **Caveat:** the clean build's `observation_type_registry` is
**empty** (g), so while the *security/structure* end-state is fully reproduced, the *functional*
end-state is not — the normalizer has no rules until the registry is seeded (see Q4).

**Q4 — What is LIVE-ONLY-TRUTH that a rebuild would destroy and must be captured FIRST?**
**One make-or-break item + a short secondary list.**
- ⚠️ **`core.observation_type_registry` (30 rows) — MAKE-OR-BREAK.** **No migration anywhere** (active
  or legacy or consolidated) INSERTs these rows; the chain only ADDS columns (step2) and UPDATEs
  `ok_rule`/`severity_map` on **presumed-existing** rows (step3 — which silently no-op against an empty
  registry). These 30 rows are the four-kind observation taxonomy the normalizer reads to populate
  `obs_kind`/`norm_status`/`norm_severity`. **A rebuild produces 0 rows → the normalizer and every
  intelligence/dashboard surface that reads normalized columns are broken.** Must become an idempotent
  seed migration before any rebuild.
- Secondary LIVE-ONLY config (no seed migration; lower criticality — re-creatable via app/scripts):
  `asset_types` (1, via `seed_transit_assets.ts`), `bases` (2), `route_pools` (12).
- **Not truth (acceptable to lose in a *dev* rebuild):** the 14,916-row KCM stop inventory
  (re-ingestable), all field-capture data, `audit_log` history, `identity_directory` dev users,
  derived snapshots.

**Q5 — Net recommendation: does rebuilding dev from the chain resolve the drift-class cards in one act,
and which DESIGN-GAP cards survive?**
**Rebuild resolves the entire DRIFT class in one act — but is UNSAFE until the registry is seeded.**
A rebuild (or, equivalently for the security posture, a clean Azure deploy) fixes: MT-2 live-apply,
the ownership reconcile (incl. the 5 `postgres`-owned objects), the missing-grant drift, and the
`schema_migrations` legacy clutter — **all at once, all from version control.** It does **not** fix the
DESIGN-GAP cards, which reproduce identically on clean (confirmed by direct check on both DBs):
ISSUE-052 (`export_delete_tokens.org_id` = **text** on both), ISSUE-053 (15 public org-scoped tables
without an `organizations` FK on both), and the `writeAuditLog`/`auditLog.ts` "fallback to first org"
twin (code-level, `backend/src/middleware/auditLog.ts:22` — survives by definition). **Recommendation:
treat the registry seed as a hard prerequisite, then a clean rebuild is the single highest-leverage act
to collapse the drift cards; file the three DESIGN-GAP items as the genuinely-separate residual work.**

---

## CLOSED-SET STATEMENT

This is the **complete** divergence between the migration chain and live dev — not a sample. Across
**all seven captured dimensions** (schema DDL, ownership, policies, roles, grants, migration records,
data), the total set of differences is **exactly 9 classes**, enumerated once and bounded here:

| # | Divergence class | Tag |
|---|---|---|
| 1 | 36 RLS policy predicates fail-open (live) vs fail-closed (clean) | DRIFT |
| 2 | 82 objects owned by `fieldpro`/`postgres` (live) vs `fieldpro_admin` (clean); 5 `postgres`-owned = hard blocker | DRIFT |
| 3 | `postgres` superuser role exists on live, absent on clean | DRIFT (benign) |
| 4 | `mcp_readonly` LOGIN=true (live) vs NOLOGIN (clean) | DRIFT / borderline LIVE-ONLY |
| 5 | 6 read-role grants present on clean, missing on live | DRIFT |
| 6 | 53 pre-rename/`legacy_` migration records on live, absent on clean | DRIFT (benign) |
| 7 | `observation_type_registry` 30 rows (live) vs 0 (clean) | **LIVE-ONLY-TRUTH** ⚠️ |
| 8 | `asset_types`/`bases`/`route_pools` config rows (live) vs 0 (clean) | LIVE-ONLY-TRUTH (secondary) |
| 9 | Bulk dev data (inventory, field captures, audit_log, snapshots) live vs empty clean | dev data (not truth) |

DDL beyond the policy predicates is **byte-identical** (4050-line dumps; only the 36 quals + cosmetic
dump tokens differ). Policy *names/commands*, role attributes (except #3/#4), memberships, and the
`organizations` seed row are identical. **The box is closed at these 9 classes.**

---

## WHAT A REBUILD RESOLVES vs WHAT SURVIVES

| Card / item | Class | Rebuild outcome |
|---|---|---|
| MT-2 live-apply (fail-open→closed) | DRIFT #1 | **RESOLVED** — clean is fail-closed |
| Live-dev ownership reconcile (incl. 5 `postgres`-owned) | DRIFT #2 | **RESOLVED** — clean is uniform `fieldpro_admin` |
| `schema_migrations` drift | DRIFT #6 (+#1) | **RESOLVED** — clean = 28 consolidated baseline |
| Missing read-role grants | DRIFT #5 | **RESOLVED** — clean grants the full canonical/audit sets |
| `mcp_readonly` MCP login | DRIFT/LIVE-ONLY #4 | **REGRESSES** — clean ships NOLOGIN; MCP login/password must be re-granted post-rebuild |
| **ISSUE-052** — `export_delete_tokens.org_id` text | DESIGN-GAP | **SURVIVES** — text on clean too |
| **ISSUE-053** — 14/15 public tables missing org FK | DESIGN-GAP | **SURVIVES** — identical on clean |
| **writeAuditLog / auditLog.ts** "first-org" fallback | DESIGN-GAP (code) | **SURVIVES** — lives in code, not schema |
| `audit_log` non-`org_isolation` policy names | DESIGN (handled) | **N/A** — MT-2 already flips both `audit_log` policies fail-closed on clean |

---

## PRE-REBUILD CAPTURE LIST

A rebuild is **NOT non-destructive today.** Before any rebuild of dev (or first clean Azure deploy),
capture into idempotent, `schema_migrations`-recorded migrations (per Migration Recording Discipline):

1. ⚠️ **REQUIRED — `core.observation_type_registry` (30 rows).** Author an idempotent seed migration
   (`INSERT … ON CONFLICT DO NOTHING`, org_id=1) carrying the full taxonomy (the 30 `observation_key`
   rows with their `obs_kind`/`value_type`), positioned **before** the step3 rules UPDATE so the
   UPDATEs land on real rows. Without this, rebuild = broken normalizer. *(Founder note: one row,
   `stop_not_serviced_due_to_safety`, currently has `obs_kind = NULL` on live — decide its kind while
   authoring the seed rather than copying the NULL.)*
2. **RECOMMENDED — operational config seeds:** `asset_types` (`transit_stop`), `bases`
   (South/North Facilities), `route_pools` (12). Either fold into seed migrations or document the
   `seed_transit_assets.ts`/setup-script run order as a required post-migrate step.
3. **OPTIONAL — `mcp_readonly` login:** if the postgres MCP server must work immediately post-rebuild,
   plan to re-set its password/LOGIN out-of-band (kept out of VC, per the role-provisioning fix) — or
   accept NOLOGIN until provisioned.

The KCM stop inventory and field/audit data are **dev data**, intentionally not captured — a dev
rebuild is expected to start them empty (re-ingest from source as needed).

---

## NEW ISSUES (founder files; this recon does not create or edit cards)

- **NI-1 (P-high) — `observation_type_registry` has no seed migration.** 30 taxonomy rows exist only
  in live data; the chain never INSERTs them (step3 UPDATEs presume they exist). Clean build = empty
  registry = broken normalizer. *Blocks safe rebuild.* Fix: idempotent seed migration before step3.
  *(This is the strongest single argument the "drift" hypothesis is real: the chain cannot reproduce a
  functioning DB on its own.)*
- **NI-2 (P-med) — operational config (`asset_types`, `bases`, `route_pools`) not reproducible from
  VC.** Seeded by scripts/hand, not migrations. Document or migrate.
- **NI-3 (P-low) — `mcp_readonly` LOGIN is out-of-band drift.** Live has login+password; the migration
  ships NOLOGIN/no-password by design. Same ISSUE-039-class "credential lives only in the hand-mutated
  DB" pattern. Decide whether MCP login provisioning belongs in the bootstrap.
- **NI-4 (P-low / data quality) — `observation_type_registry.stop_not_serviced_due_to_safety` has
  `obs_kind = NULL` on live.** Resolve when authoring the NI-1 seed.

*Recon by desktop Claude Code. Read-only on live dev (`fieldpro_db`:5432); comparison built on an
isolated throwaway container (`fieldpro_clean_ref`:5499), which can be removed with
`docker rm -f fieldpro_clean_ref`. No live ALTER/migration/ownership/DROP. No cards created or edited.*
