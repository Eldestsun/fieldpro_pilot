> **⚠️ SUPERSEDED (2026-06-14, later same day).** This audit was a point-in-time
> snapshot taken ~01:51 on 2026-06-14, before the build landed. Its "NOT STARTED"
> bottom line was **correct at the moment it ran** but is **no longer true**: CANON-NORM
> Steps 1–6 merged to `main` later that day. The live DB now has all five normalized
> columns (18/18 rows backfilled with `obs_kind`, `norm_status` on the 4
> condition/measurement rows), the registry is migrated to the §4.1 shape, the
> write-time normalizer is wired, and `core.v_observation_normalized` exists. See the
> CANON-NORM step changelogs under `docs/changelog/` and `CANONICAL_STATE_LAYER_DESIGN.md`
> §9 items 4/5 (updated). This file is retained as a historical record of the pre-build
> state; do not cite its "not started" conclusion as current.

# 2026-06-14 — Normalized Observation Shape: Live Build-Status Verification

> **Purpose.** Scope-check for the epic *"Finish Canonical State Layer — normalized
> observation shape."* The inventories asserting this work is unbuilt are dated
> 2026-06-06 and were suspected stale. This audit verifies the claim **directly
> against the live repo + live DB** (`fieldpro_db`, queried 2026-06-14 as the
> `postgres` superuser via MCP).
>
> **Read-only.** No schema, code, or migration changes. SQL and grep evidence pasted
> verbatim below.
>
> **The (A)/(B) distinction is honored throughout.** (A) = the code-side four-kind
> taxonomy (`mapSafetyHazard`/`mapInfraIssue` in `observationService.ts`) — exists,
> not the question. (B) = the persisted normalized columns + write-time normalizer +
> read seam — **this** is what was verified. Nothing below counts (A) as evidence for (B).

---

## Bottom line (read this first)

**The normalized-shape epic is NOT STARTED.** Every one of the five design columns
is absent from the live table, the registry is still the seeder shape, no normalizer
exists in the write path, the read seam view does not exist, and `core.assets` is
still a view. The 2026-06-06 audit is **confirmed, not stale.**

The only drift since the 2026-05-30/06-06 inventories is in directions that **do not
touch the normalized shape**:
- Row count grew **3 → 18** (more real-pipeline rows captured; still authentic, not fixtures).
- `created_by_oid` is **now dropped** from `core.observations` — that is the **sidecar
  extraction** (2026-06-01, design §8 build-item #4), a *different* epic that has
  landed. It is not normalized-shape work.

So: significant state-layer work *has* landed since the audits — but it was the
**identity sidecar**, not the normalized columns. The normalized-shape epic remains
entirely ahead.

| # | Epic build-list item | Verdict |
|---|---|---|
| 1 | Normalized columns on `core.observations` (`obs_kind`/`norm_status`/`norm_severity`/`intervention`/`type_id`) | **NOT BUILT** — all 5 absent |
| 2 | Registry migrated to design contract (`obs_kind`/`payload_schema`/`ok_rule`/`severity_map`) | **NOT BUILT** — still seeder shape |
| 3 | Generic write-time normalizer (§4.2) present + called | **NOT BUILT** — absent |
| 4 | `core.v_observation_normalized` read seam + intelligence reads it | **NOT BUILT** — view absent; risk job reads raw strings + synthesizes severity=1.0 |
| 5 | `core.assets` as a base table (§3.1) | **NOT BUILT** — still a view (`core.v_assets`) |
| 6 | Backfill historical rows + re-derive `complexity_score` (§9 items 4/5) | **NOT BUILT** — nowhere to write until #1 lands |

*(Design §8 build-item "audit-only identity sidecar + no-grant intelligence role" is
**already DONE** as of 2026-06-01 and is intentionally NOT in this epic's remaining
scope — see the drift note above.)*

---

## Item-by-item evidence

### 1. Columns on `core.observations` — **NOT BUILT (all 5 absent)**

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='core' AND table_name='observations'
ORDER BY ordinal_position;
```

Live result (2026-06-14):

| column_name | data_type | nullable |
|---|---|---|
| id | bigint | NO |
| org_id | bigint | NO |
| visit_id | bigint | NO |
| location_id | bigint | YES |
| asset_id | bigint | YES |
| observation_type | text | NO |
| severity | text | YES |
| status | text | YES |
| payload | jsonb | NO |
| observed_at | timestamptz | NO |

Per-design-column verdict (§3.3):

| Design column | Present? |
|---|---|
| `obs_kind` | **ABSENT** |
| `norm_status` | **ABSENT** |
| `norm_severity` | **ABSENT** |
| `intervention` | **ABSENT** |
| `type_id` (FK → registry) | **ABSENT** |

**Old-shape disambiguation (the stop-condition flagged in the brief):** the live
`severity` (**text**) and `status` (text) columns are the **pre-normalization old
shape**, NOT the design's `norm_severity` (smallint) / `norm_status`. They differ in
both name and type from the design columns and are not counted as normalized columns.
The five normalized columns simply do not exist on the table.

**Note on a further drift vs. the 2026-05-30 audit:** that audit listed
`created_by_oid text NOT NULL` on this table. It is **now gone** — dropped by the
2026-06-01 sidecar extraction. This confirms the sidecar epic landed; it is unrelated
to the normalized shape.

### 2. Population on live rows — **N/A (columns don't exist)**

The brief's population query (`count(obs_kind)`, etc.) cannot run — the columns are
absent, so it would error rather than return zeros. The distinction the brief asks
for (exists-but-NULL vs. populated) does not apply: the state is one level earlier —
**the columns are not present at all.**

For context, the table holds **18 rows** (was 3 on 2026-05-30 — grown via real
pipeline use), all authentic post-state-layer-fix rows:

```sql
SELECT observation_type, count(*) FROM core.observations GROUP BY observation_type ORDER BY 1;
```

| observation_type | count |
|---|---|
| biohazard_present | 1 |
| emptied_trash | 4 |
| encampment_present | 1 |
| graffiti_present | 1 |
| picked_up_litter | 4 |
| shelter_panel_damage_present | 1 |
| spot_check | 2 |
| trash_volume | 4 |

These are exactly the kinds the normalizer *would* classify (action / presence /
condition / measurement) — but classification lives only in code today (A), never
persisted (B).

### 3. Registry shape — **NOT BUILT (seeder shape, confirms 2026-06-06)**

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='core' AND table_name='observation_type_registry' ORDER BY ordinal_position;
```

Live columns: `id, org_id, asset_type_id, observation_key, display_name,
value_type, valid_values, is_required, sort_order, is_active`.

| Design §4.1 contract column | Present? |
|---|---|
| `obs_kind` | **ABSENT** |
| `payload_schema` | **ABSENT** |
| `ok_rule` | **ABSENT** |
| `severity_map` | **ABSENT** |

This is the **seeder shape** (`value_type` / `valid_values` / `is_required`) exactly
as the 2026-06-06 audit reported. **Confirmed.** The four-kind classification and
ok-rules would have to be *derived* from `value_type`/`valid_values`, or the registry
migrated to the §4.1 shape, before any normalizer could run.

Row count: **30 total, 28 active** (matches the §9 live-reconciliation note; not the
doc-body "27 active").

### 4. Normalizer in the write path — **NOT BUILT (absent)**

The only INSERTs into `core.observations` are in
[observationService.ts](backend/src/domains/observation/observationService.ts) at
lines 267 and 312. Both write **only the old-shape columns**:

```sql
-- insertObservations (observationService.ts:267)
INSERT INTO core.observations (
  org_id, visit_id, location_id, asset_id, observation_type, payload, severity
) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id

-- emitSpotCheckObservation (observationService.ts:312)
INSERT INTO core.observations (
  org_id, visit_id, location_id, asset_id, observation_type, payload
) VALUES ($1, $2, $3, $4, 'spot_check', '{}'::jsonb) RETURNING id
```

Neither populates `obs_kind` / `norm_status` / `norm_severity` / `intervention` /
`type_id` (they don't exist), and neither calls a normalizer.

The only functions named `normalize*` in the write path are
`normalizeSafetyKey` (line 186) and `normalizeInfraKey` (line 193) — these are **string
key cleanup helpers feeding `mapSafetyHazard`/`mapInfraIssue`** (the (A) code-side
taxonomy that picks an `observation_type` string). They are **not** the design's §4.2
normalizer that computes `(kind, status, severity, intervention)` from a registry
rule. The §4.2 function is **absent**, and the write path never reads
`core.observation_type_registry` at all (consistent with §9 item 3's 2026-05-30 finding).

### 5. Read seam — **NOT BUILT (view absent; intelligence reads raw strings)**

```sql
SELECT viewname FROM pg_views WHERE schemaname='core' AND viewname='v_observation_normalized';
-- []  (no rows — view does not exist)
```

The risk job still reads **raw `observation_type` string sets** and **synthesizes
severity**, exactly as the 2026-06-06 finding stated.
[riskMapService.ts](backend/src/intelligence/riskMapService.ts):

- **Hazard CTE (lines 112–137):** `WHERE o.observation_type IN ('encampment_present',
  'fire_present', …)` and `1.0::numeric(4,2) AS last_hazard_severity` (line 116) —
  severity is **hardcoded to 1.0**, with the explicit comment *"Severity is not stored
  canonically; presence-in-window = 1.0."* (line 111).
- **Infra CTE (lines 144–161):** `LEAST(COUNT(*)::numeric, 5)` stands in for AVG
  severity (line 147), again over a raw `observation_type IN (…)` set — comment:
  *"Severity not stored canonically; COUNT(*) capped at 5"* (line 140).

No reference to `v_observation_normalized`, `obs_kind`, or `norm_status` anywhere in
the risk job. Intelligence reads `core.observations` directly by string-matching
`observation_type`.

### 6. `core.assets` table vs view — **NOT BUILT (still a view)**

```sql
SELECT relkind, relname FROM pg_class JOIN pg_namespace n ON n.oid=relnamespace
WHERE nspname='core' AND relname IN ('assets','v_assets','observations');
```

| relname | relkind |
|---|---|
| observations | r (table) |
| v_assets | v (view) |

There is **no base table `core.assets`** (the query returns nothing for `assets`).
`core.v_assets` is a **view** (relkind `v`), confirming the 2026-06-06 finding. Design
§3.1's `CREATE TABLE core.assets` is unbuilt.

---

## Drift vs. the 2026-06-06 audit (explicit, per the brief)

Live DB and the audit **agree on every normalized-shape question.** The audit is
**not stale on this epic.** The only changes since are orthogonal:

| Fact | 2026-05-30 / 06-06 audit | Live 2026-06-14 | Moves normalized-shape needle? |
|---|---|---|---|
| 5 normalized columns | absent | absent | — (no change) |
| Registry shape | seeder shape | seeder shape | — |
| `v_observation_normalized` | absent | absent | — |
| `core.assets` | view | view | — |
| Normalizer in write path | absent | absent | — |
| `core.observations` row count | 3 | **18** | No — more real rows, same shape |
| `created_by_oid` on table | present | **dropped** | No — sidecar epic (2026-06-01), not this one |

---

## Recommendation for the epic card

**Keep the epic OPEN; do not close or down-scope it.** All six build-list items are
NOT-BUILT. The work is genuinely ahead, in this dependency order:

1. **Migration: add the 5 normalized columns** to `core.observations` (the §9 item 4
   in-place-vs-shadow decision is still unmade and is its own sub-dispatch — flag it
   as the first gate).
2. **Migrate/extend the registry** to carry `obs_kind` + ok-rule + severity-map (or a
   derivation layer over `value_type`/`valid_values`) and add the `type_id` FK.
3. **Build the §4.2 normalizer** and call it in both write paths
   (`insertObservations`, `emitSpotCheckObservation`).
4. **Create `core.v_observation_normalized`** and **repoint `riskMapService` + MVs**
   off raw `observation_type` strings / synthesized `1.0` severity onto the seam.
5. **(Optional/architectural)** promote `core.assets` from view to base table per §3.1.
6. **Backfill** the 18 existing rows through the normalizer and **re-derive
   `complexity_score`** (§9 item 5; currently written NULL at
   `cleanLogService.ts`).

The sidecar boundary (design §8 item 4) is **already done** and should be removed from
the epic's scope to avoid double-counting it as remaining work.
