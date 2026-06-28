# Multi-Tenant Schema Readiness Recon

**Date:** 2026-06-27 · **Method:** read-only live catalog introspection (`pg_catalog` / `information_schema` / `pg_policies`) via postgres MCP. No DDL, no mutation.
**Purpose:** verify what the schema *actually enforces* about the GUID→numeric-id tenant model **before** seeding `tenant_uuid` (ISSUE-013) or flipping RLS fail-closed (MT-2). "The shape is right" ≠ "the schema enforces it."

**Headline:** the design is multi-tenant-correct and several constraints the earlier recon *feared missing are actually present* — `tenant_uuid` is uniquely indexed **and already populated for the pilot org**. The gaps are referential-integrity and scope-key-consistency, plus one population-reproducibility trap that directly reshapes ISSUE-013's seed work.

---

## A. `organizations` table DDL

Columns (`information_schema.columns`):

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | `bigint` | NO | — |
| `name` | `text` | NO | — |
| `slug` | `text` | NO | — |
| `created_at` | `timestamptz` | NO | `now()` |
| `tenant_uuid` | `text` | **YES** | — |

Constraints (`pg_constraint`):
- `organizations_pkey` — `PRIMARY KEY (id)`
- `organizations_slug_key` — `UNIQUE (slug)`

Indexes (`pg_indexes`):
- `organizations_pkey` — `UNIQUE (id)`
- `organizations_slug_key` — `UNIQUE (slug)`
- `organizations_tenant_uuid_key` — **`UNIQUE (tenant_uuid) WHERE tenant_uuid IS NOT NULL`** (partial unique)

**Finding:** `organizations` is a clean numeric-PK tenant table. `tenant_uuid` is a nullable `text` column carrying a **partial unique index** (unique across non-null values, multiple NULLs allowed).

---

## B. `tenant_uuid` — the five multi-tenant-safety questions

| # | Question | Evidence | Answer |
|---|---|---|---|
| B1 | **UNIQUE?** | `organizations_tenant_uuid_key UNIQUE (tenant_uuid) WHERE tenant_uuid IS NOT NULL` | **YES** — two orgs cannot share a non-null GUID; resolution is unambiguous. (Multiple NULLs permitted.) |
| B2 | **NOT NULL?** | `is_nullable = YES`; partial index explicitly excludes NULL | **NO** — an org row may have `tenant_uuid NULL`. This is the state the lowest-id fallback fed on. *For fail-closed it is acceptable/correct:* a NULL-tenant org yields no positive match → denied. |
| B3 | **INDEXED?** | the partial unique index `… USING btree (tenant_uuid) WHERE tenant_uuid IS NOT NULL` serves `WHERE tenant_uuid = $1` (non-null literal) | **YES** — auth lookup is index-backed, not a full scan. |
| B4 | **Type = uuid?** | `data_type = text`, `udt_name = text` | **NO** — it is `text`, not `uuid`. Entra `tid` (a GUID) is stored/compared as text; no uuid normalization (case/format). Low-risk but a coercion footgun. |
| B5 | **Cardinality 1:1?** | scalar column + partial unique index; no junction/bridge table references `organizations` for tenancy | **YES (1:0..1)** — each org has at most one `tenant_uuid`; each non-null GUID maps to exactly one org. No one-to-many / many-to-many tenant modeling anywhere. |

**Finding:** the constraint posture earlier feared missing is largely **present** — `tenant_uuid` is UNIQUE (partial) and INDEXED, and tenancy is a clean 1:1. The only soft spots are *type* (`text` not `uuid`) and *nullability* (intentional, and correct to keep for fail-closed).

---

## C. Numeric `id` as the universal scope key

- `organizations.id` is **`bigint`**, the PK. Confirmed.
- **33 org-scoped tables** carry an `org_id` column with an RLS policy (32 named `org_isolation` + `public.audit_log` via per-command policies — see below). **Every one scopes on the numeric `org_id` compared to `current_setting('app.current_org_id')`. None scope on `tenant_uuid` directly.** Representative qual (uniform across the 32):
  ```sql
  (COALESCE(current_setting('app.current_org_id', true), '') = '')
  OR (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::bigint)
  ```
- **`org_id` is `bigint NOT NULL` on 32 of 33 tables.** One outlier: **`public.export_delete_tokens.org_id` is `text`** and its policy compares without the `::bigint` cast (`org_id = NULLIF(current_setting(...), '')`). Scope key type-inconsistent with every other table.
- **Referential integrity is split by layer.** FKs `org_id → organizations(id)` exist on **all 13 `core.*` tables** (`ON DELETE RESTRICT`) and 7 `public.*` tables (`assets`, `bases`, `route_pools`, `route_runs`, `transit_stops`, `identity_directory`, `eam_bridge_route_log`). **14 `public.*` org-scoped tables have `org_id` (bigint NOT NULL) + a forced-RLS policy but NO FK to `organizations`:**
  `asset_external_ids`, `clean_logs`, `export_delete_tokens`, `hazards`, `infrastructure_issues`, `lead_route_overrides`, `route_run_stops`, `stop_condition_history`, `stop_effort_history`, `stop_photos`, `stop_pool_memberships`, `stop_risk_snapshot`, `stops_legacy`, `transit_stop_assets`.
- **Coverage check — `public.audit_log`:** has `org_id` (bigint NOT NULL), RLS enabled + **forced**, but **no `org_isolation` policy**. It is org-scoped under three per-command names instead: `audit_log_select` and `audit_log_insert` carry the **same fail-open COALESCE branch**; `audit_log_delete` uses a separate already-fail-closed mechanism (`app.export_delete_active` + `app.export_delete_org_id`). No FK to `organizations`.

**Finding:** the numeric-id-as-scope-key design holds **uniformly** — every tenant-scoped table keys on `org_id`, never on `tenant_uuid`, so resolve-at-edge → scope-on-id is structurally consistent. Three enforcement gaps sit on top of it: (1) `export_delete_tokens` keys on `text` not `bigint`; (2) 14 adapter/intelligence tables have no org FK (orphan `org_id` is possible — RLS still scopes the value, but nothing guarantees the org exists); (3) `audit_log` is org-scoped under non-`org_isolation` policy names and is therefore invisible to any "iterate the `org_isolation` policies" sweep.

---

## D. Current population state

`SELECT id, tenant_uuid, name, slug FROM organizations`:

| id | tenant_uuid | name | slug |
|---|---|---|---|
| 1 | `66d756aa-edfd-46e9-895a-06d9e0e21f3a` | King County Metro | kcm |

- **One org row. `tenant_uuid` IS POPULATED** (non-null GUID on org 1). **This revises the earlier recon's "tenant_uuid unpopulated" claim** — in this dev DB the pilot org already carries a tenant GUID.
- **Caveat:** whether `66d756aa-…` is the **real KCM Entra tenant id** or a dev placeholder cannot be determined from the schema — founder must confirm before relying on it for production resolution.
- **Reproducibility trap:** this value lives in **dev row data only**. There is no seed migration that sets it. A clean-room rebuild (empty DB → `npm run migrate`) would produce org 1 with `tenant_uuid = NULL` → under a fail-closed `resolveNumericOrgId`, **every login would be denied.** This — not "add the column constraints" — is the actual Blocker-4 work for ISSUE-013.
- FK integrity (per C): `core.*` fully FK'd to `organizations(id)`; 14 `public.*` org-scoped tables are bare `org_id` with no referential integrity.

---

## MULTI-TENANT READINESS VERDICT — **YELLOW**

**Design correct; enforcement partial. Not RED — nothing in the schema contradicts the multi-tenant model** (every tenant table keys on a numeric `org_id`; the GUID resolver has a unique, indexed target; tenancy is 1:1). **Not GREEN — four enforcement gaps remain:**

1. **`tenant_uuid` value is not reproducible from version control** (lives in dev data only) → a fresh build resolves nobody under fail-closed. *(Population/seed gap — feeds ISSUE-013.)*
2. **`export_delete_tokens.org_id` is `text`, not `bigint`** — scope-key type inconsistent with the other 32 tables.
3. **14 `public.*` org-scoped tables have no FK to `organizations`** — orphan `org_id` values are possible; referential integrity is enforced only on the canonical `core.*` layer.
4. **`audit_log` is org-scoped under non-`org_isolation` policy names** and carries the same fail-open branch — invisible to a policy-name-scoped MT-2 sweep.

`tenant_uuid` being `text`-not-`uuid` and nullable are noted but are **not** verdict-movers (nullable is correct for fail-closed; text is a low-risk hardening item).

---

## FEEDS 013 / MT-2

**ISSUE-013 (resolve fail-closed + seed `tenant_uuid`):**
- ✅ **Already satisfied — do NOT redo:** `tenant_uuid` is already UNIQUE (partial) + INDEXED, and populated for org 1. 013 does **not** need to add a unique constraint or index. *(This corrects the earlier recon's "add UNIQUE + index" line.)*
- ⛳ **The real Blocker-4 work:** codify org 1's `tenant_uuid` as an **idempotent seed migration** (recorded in `schema_migrations`, per Migration Recording Discipline) so a clean-room rebuild reproduces the mapping. Without it, fail-closed + a NULL `tenant_uuid` on rebuild = total login denial.
- ⚠️ **Founder gate (unchanged from the dispatch's Stop Condition #2):** confirm `66d756aa-…` is the real KCM Entra tenant id before it is committed to a migration. If it is a dev placeholder, the real value must be supplied — do not commit a guessed GUID.
- 🚫 **Do NOT add `NOT NULL` to `tenant_uuid`** — it would block provisioning a not-yet-mapped org; nullable + fail-closed (no match → deny) is the correct posture.
- 📝 Optional hardening (not a 013 blocker): consider `uuid` type or case-normalization on the match.

**MT-2 (flip RLS fail-open → fail-closed):**
- ⚠️ **Scope is wider than "the 37 `org_isolation` policies."** MT-2 must **also** flip `audit_log_select` and `audit_log_insert` (same fail-open COALESCE branch, different policy names). Selecting policies by `policyname='org_isolation'` alone **misses `audit_log`.** Drive the flip off "every policy whose qual contains the COALESCE pass-all branch," not off the policy name.
- ⚠️ **`export_delete_tokens` needs the `text` form** of the fail-closed predicate (`org_id = NULLIF(current_setting(...), '')`, no `::bigint`) — do not apply a uniform bigint-cast template across all tables or it will error on this one.
- ✅ Leave `audit_log_delete` alone — it already uses a separate, already-fail-closed export-delete mechanism.
- ℹ️ The 14 missing-FK tables do **not** block MT-2 (RLS compares the `org_id` value regardless of FK), but they belong on the same multi-tenant-hardening track.

---

## Appendix — raw introspection queries

1. `information_schema.columns` on `organizations` (DDL).
2. `pg_constraint WHERE conrelid='public.organizations'` (PK/UNIQUE).
3. `pg_indexes WHERE tablename='organizations'` (partial unique on `tenant_uuid`).
4. `SELECT id, tenant_uuid, name, slug FROM organizations` (population).
5. `pg_policies WHERE policyname='org_isolation'` (32 quals — all numeric `org_id` except `export_delete_tokens`).
6. `pg_attribute` org_id type across all policy-bearing tables (32 bigint + 1 text).
7. `pg_constraint contype='f' confrelid='public.organizations'` (20 FK rows; core fully covered, 14 public tables uncovered).
8. `pg_class`/`pg_attribute` for every `org_id`-bearing table + policy presence (surfaced `audit_log` with forced RLS, no `org_isolation`).
9. `pg_policies WHERE tablename='audit_log'` (per-command select/insert/delete policies).
