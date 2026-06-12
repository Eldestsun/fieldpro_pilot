# ADAPTER_BOUNDARY.md Reconciliation Audit

> **Type:** Pure investigation / reconciliation. **No edit to `ADAPTER_BOUNDARY.md`, no schema, no
> code, no data changes.** This document is a findings report only — the founder decides which
> dispositions in §4 to apply.
> **Date:** 2026-06-07
> **Branch:** `feat/issue-031-adapter-boundary-audit` (cut from `origin/main` @ `9aafc8c`)
> **Document under audit:** `planning/architecture/ADAPTER_BOUNDARY.md`
> (its own header dates its core structure to **2026-05-10**, with a partial bridge-layer
> reconciliation noted **2026-05-30**).
>
> **Standard audited against:**
> 1. `planning/architecture/2026-06-07-issue-031-redesign-adr.md` — the ISSUE-031 redesign
>    decision record (principles + settled decisions; the *target*).
> 2. `docs/audit/2026-06-06-canonical-core-complete-inventory.md` — live-verified core census
>    (cited below as **CORE-INV**).
> 3. `docs/audit/2026-06-06-transit-adapter-complete-inventory.md` — live-verified adapter census
>    (cited below as **ADPT-INV**).
>
> **Method:** Every factual claim in §1 was re-verified live against `fieldpro_db` via the
> `postgres` MCP on 2026-06-07 (queries quoted inline), or cited to a specific inventory section
> that itself carries a live-DB verification. The inventories' pre-flagged divergences
> (ADPT-INV §10 Q1; CORE-INV §10.3) were treated as *starting points to re-confirm*, not as
> assumptions. Where I cannot determine whether the boundary doc or the live state is the thing
> that drifted, it goes to §5, not §1.
>
> **A note on the boundary doc's own self-awareness:** `ADAPTER_BOUNDARY.md` is partially honest
> about its own staleness. Its header says population counts "elsewhere [other than the bridge
> layer] are pre-reseed point-in-time snapshots — treat them as illustrative, not current," and it
> carries inline 2026-05-30 corrections on `core.assignments`/`assignment_id` and
> `v_locations_transit`. Several findings below are therefore *already self-flagged by the doc* —
> they are recorded here anyway because (a) the self-flag is informal and easy for a CLI agent to
> miss, and (b) the redesign has since made some of them not just stale-counts but
> wrong-in-principle (see §2). Findings note where the doc already warns.

---

## Verification snapshot (live DB, 2026-06-07)

Run at audit time; every §1 finding traces to one of these or to a cited inventory section.

| Query | Result |
|---|---|
| `SELECT count(*) FROM core.assignments` | **12** |
| `SELECT count(*) FROM core.asset_locations` | **14916** |
| `SELECT count(*) FROM core.observations` | **18** |
| `SELECT count(*) FROM core.visits` | **9** |
| `SELECT count(*) FROM core.evidence` | **9** |
| `SELECT count(*) FROM core.locations` | **14916** |
| `pg_class WHERE relname='route_run_audit'` (any schema) | **0 rows — does not exist** |
| schemas present (`pg_namespace`, non-system) | **`core`, `public` only — no `admin`** |
| `core.visits` columns | no `actor_oid` (attnum 6 gap), **no `route_run_stop_id` at all** |
| `core.observations` columns | no `created_by_oid` (attnum 10 gap); `severity` 2/18, `status` 0/18 non-null |
| `core.evidence` columns | no `captured_by_oid` (attnum 8 gap) |
| `core.assignments` columns | no `created_by_oid` (attnum 10 gap) |
| views named `v_*transit` | **9, all in schema `core`** (the 6 log views + `v_locations_transit`, `v_assignments_transit`, `v_asset_locations_transit`) |

---

# Section 1 — Factual staleness

Claims in `ADAPTER_BOUNDARY.md` that the live DB or the inventories contradict. Each: the
boundary-doc claim (quoted minimally), the verified reality, the evidence.

### F-1 — `core.assignments` "0 rows / Tier 5 not wired" → populated, written live

- **Boundary-doc claim:** Multiple stale statements. §1 `core.visits.assignment_id` row references
  "the §5.1 'Tier 5 not yet' note below is stale"; Path E (§3) and the entire §6 Tier-5 roadmap are
  framed around `core.assignments` / `assignment_id` being unwired. (The doc *does* carry a
  2026-05-30 inline correction at §1 `core.assignments`: *"No longer empty… retained here only as
  history."*)
- **Verified reality:** `core.assignments` = **12 rows**; one per `route_run_stops` row.
  `assignment_type='transit_stop_clean'`, `status='planned'`, `source_system='route_runs'`,
  `source_ref`=route_run id. Written live in the same `BEGIN/COMMIT` as `route_runs`/`route_run_stops`
  on `POST /api/route-runs` (`routeRunService.createRouteRun`, `:422-439`), paired with the
  `assignment_actor_audit` sidecar. `core.visits.assignment_id` is read back from it (9/9 populated).
- **Evidence:** live `SELECT count(*) FROM core.assignments` = 12 (snapshot above); CORE-INV §1.3,
  §5.3, §10.2 ("core.assignments — written today? → YES, 12 rows"); ADPT-INV §3.2/§3.3.
- **Note:** the boundary doc is *partially* self-corrected here (the 2026-05-30 inline note), but the
  correction is local to the `core.assignments` table block — Path E and the §6 roadmap still read as
  if Tier 5 is pending. See also F-7 (Tier 5 superseded) and §2 PC-2.

### F-2 — `core.asset_locations` "currently sparse" → fully populated (14,916)

- **Boundary-doc claim (§1, verbatim):** *"Junction table mapping `assets` to `core.locations` with
  role and time range. Exists but currently sparse — reflects whatever the transit data migration
  seeded."*
- **Verified reality:** **14,916 rows — fully populated**, one primary link per stop. (Caveat that
  belongs with it: it has **zero live application readers** — the live asset↔stop translation code
  actually uses the *adapter* `public.transit_stop_assets`, not this table. So "sparse" is wrong, but
  "load-bearing in the live read path" would also be wrong — it is fully-populated-but-inert.)
- **Evidence:** live `SELECT count(*) FROM core.asset_locations` = 14916; CORE-INV §1.7, §3.3, §10.3
  item 2.

### F-3 — `public.route_run_audit` listed as an adapter table → does not exist

- **Boundary-doc claim (§2 table, verbatim):** *"`route_run_audit` | Audit log for route run
  mutations."*
- **Verified reality:** **No such relation exists in any schema** (`pg_class WHERE
  relname='route_run_audit'` → 0 rows). It is referenced by no code (ADPT-INV searched
  `backend/src`/`backend/scripts`).
- **Evidence:** live `pg_class` query (snapshot above); ADPT-INV object-census note ("`public.route_run_audit`
  does NOT exist… despite being listed as an adapter table in `ADAPTER_BOUNDARY.md` §2") and ADPT-INV
  §10 Q1.

### F-4 — Canonical entity identity columns described as live, NOT NULL "always" → dropped

The boundary doc's per-table column listings still show the plaintext-OID identity columns as
present and always-populated. **All four were dropped** by the 2026-05-30/06-01 sidecar-extraction
migration (`20260530_sidecar_extraction_b_drop.sql`, applied 2026-06-01) and relocated to the
`*_actor_audit` sidecars.

| Boundary-doc claim | Verified reality |
|---|---|
| `core.visits.actor_oid` "text NOT NULL ✅ Always — real Entra OID since R1" (§1) | Column **dropped** (attnum 6 gap). Identity now in `core.visit_actor_audit.actor_ref`. |
| `core.observations.created_by_oid` "text NOT NULL ✅ Always" (§1) | Column **dropped** (attnum 10 gap). → `core.observation_actor_audit`. |
| `core.evidence.captured_by_oid` "text NOT NULL ✅ Always" (§1) | Column **dropped** (attnum 8 gap). → `core.evidence_actor_audit`. |
| `core.assignments.created_by_oid` "text NOT NULL" (§1) | Column **dropped** (attnum 10 gap). → `core.assignment_actor_audit`. |

- **Evidence:** live `pg_attribute` listing for all four tables (attnum gaps exactly at the dropped
  columns; snapshot above); CORE-INV §1.1–1.4, §1.10, §2, §10.1 (migration history), §10.3 item 6.
- **Significance:** this is not just a stale column list — it predates the entire sidecar mechanism
  that is now the redesign's labor-safety *moat* (ADR §3 "on the sidecar pattern itself"). A CLI agent
  reading the boundary doc would believe identity lives on the canonical rows. See also §2 PC-4.

### F-5 — `core.observations` "asset_id … 87/87 rows populated" → 18 rows total

- **Boundary-doc claim (§1):** `core.observations.asset_id` "✅ Always — 87/87 rows populated"; also
  Path B (§3/§7) "core.observations.asset_id is always populated (87/87)."
- **Verified reality:** `core.observations` holds **18 rows** total (post-reseed). `asset_id`
  population ratio is not 87/87. (The doc's header pre-disclaims non-bridge population counts as
  "illustrative, not current," so this is a self-flagged staleness — but the "87/87" is repeated as
  load-bearing justification for Path B's safety in §7.)
- **Evidence:** live `SELECT count(*) FROM core.observations` = 18; CORE-INV §1.2.

### F-6 — `core.observations.severity`/`status` "Never written — not used yet" → mostly true, with drift

- **Boundary-doc claim (§1):** `severity` and `status` both "❌ Never written — not used yet."
- **Verified reality:** **`status` 0/18 (still never written — claim holds). `severity` is now
  written on 2/18 rows** (biohazard, encampment), so "never written" is no longer strictly true for
  `severity`. Minor, but it is a factual drift, and it matters to MV-3 (the ADR's deferred
  typed-observation work, §5 MV-3), which assumes severity/status are "nearly unused."
- **Evidence:** live `count(severity)=2, count(status)=0` over 18 rows; CORE-INV §1.2, §10.3 item 4.

### F-7 — Tier-5 / Tier-8 roadmap (§6) and Path E describe future work that has been superseded, not completed

- **Boundary-doc claim (§3 Path E, §5 table, §6):** Path E ("`route_run_stop_id` on `core.visits`",
  "Tier 5, not yet available"), the §6 "Gap Closure Roadmap" (Tier 5 adds `route_run_stop_id`; Tier 8
  seeds `core.assets` and makes `asset_id` canonical stop identity), and `target_architecture.md §11`
  citations all describe a planned migration path.
- **Verified reality:** the path described was **not taken** — and the redesign chose a different
  direction (so these are stale-as-superseded, distinct from "done"):
  - **`core.visits.route_run_stop_id` was never added** (no such column; live `pg_attribute`). The
    interim transit bridge column the doc calls an "accepted transitional pattern" does not exist and,
    per the ADR, will not — Q-C settles run↔visit linkage as a hardened **string translation**
    (`assignments.source_system`/`source_ref`), explicitly *"NOT a hard FK from canonical into the
    adapter."* So Path E's premise is dead.
  - **`core.assets` was never created** (Tier 8's "fully seeded `core.assets`"). There is only the
    view `core.v_assets` over `public.assets`; D1 settles `public.assets` as canonical infrastructure.
    Tier 8's "Path F" goal (caller holds canonical `asset_id`) is a reasonable end-state, but its
    stated *mechanism* (a new `core.assets` table) is not the chosen one.
- **Evidence:** live `core.visits` columns (no `route_run_stop_id`); CORE-INV §3.1 (no `core.assets`
  table), §3.5/§10.2 D1; ADR §3 Q-C, §6 target shape, ADPT-INV §10 / CORE-INV §10.3 item 3.
- **Note:** this is the boundary doc's largest staleness surface — roughly half the document (§3
  Paths D/E/F, §5, §6, §7) is organized around a Tier 5/Tier 8 sequencing that the ISSUE-031 redesign
  has replaced. See §2 PC-2 and PC-3 for the principle-level consequences.

### F-8 — `org_id` derivation description ("join `route_run_stops → assets.org_id`") is narrower than live

- **Boundary-doc claim (§2, `assets` row):** *"Also the source of `org_id` for canonical writes —
  `core.assignments` and `core.visits` both derive `org_id` by joining `route_run_stops →
  assets.org_id`."*
- **Verified reality:** partially stale. The live `core.assignments` INSERT…SELECT
  (`routeRunService.ts:422-439`) derives `org_id` from `public.assets a` (`a.org_id`) — consistent.
  But `core.visits` org scoping flows through `withOrgContext` + the visit-ensure path, not a literal
  "join to `assets.org_id`"; and the canonical write paths run under RLS org context generally. The
  statement is directionally true for assignments but over-generalized for visits.
- **Evidence:** CORE-INV §5.1 (visit write path), §5.3 (assignment INSERT…SELECT joins `public.assets`).
- **Confidence:** medium — flagged partly to §5 (OQ-3) since the doc's phrasing is loose rather than
  cleanly true/false.

---

# Section 2 — Principle contradiction

Places where `ADAPTER_BOUNDARY.md` states a design intent that was reasonable when written but now
**contradicts a settled ISSUE-031 redesign principle**. Distinct from §1: the facts may even still
describe the live DB correctly — what has changed is the *target*.

### PC-1 — Six (nine) `v_*_transit` views treated as legitimate `core` residents → contradicts CANON-1

- **Boundary-doc stance (§2b):** treats `core.v_locations_transit` (and, by the contamination
  framework, the family of `v_*_transit` bridge views) as **canonical-side** objects — *"It is a
  *canonical* table, not an adapter table, even though its `external_id` values are transit
  `stop_id`s"* (said of `core.location_external_ids`, and the same logic frames the views as
  "tolerated bridge" objects living legitimately in `core`).
- **Redesign principle (CANON-1, ADR §2, §3 Q-A/B corollary):** *"`core` contains zero
  vertical-specific names and zero vertical-specific filters. Translation views are adapter
  objects."* The six `core.v_*_transit` views (named `*_transit`, filtering
  `location_type='transit_stop' AND source_system='metro_stop'`) are **slated for eviction from
  `core`** into an adapter namespace. The corollary ("the `_transit` translation views are evicted
  from `core`") is **SETTLED**.
- **Live state:** confirmed **9 `v_*transit` views, all in schema `core`** (snapshot above) — exactly
  the contamination the ADR names. The boundary doc's "tolerated bridge, lives in core" framing is now
  the wrong target.
- **Nuance worth preserving:** the boundary doc's underlying *table* claim is still correct and the
  ADR agrees — `core.locations`/`core.location_external_ids` are genuinely canonical (the ADR: "the
  tables are already generic; it is the view placement that betrays the layer"). So the contradiction
  is specifically about **view placement / naming**, not about the external-id sidecar table. Disposition
  in §4 should correct the *view* stance without discarding the correct table stance.

### PC-2 — Path E `route_run_stop_id` bridge column "accepted transitional pattern" → contradicts Q-C

- **Boundary-doc stance (§3 Path E, §5 row 2, §6 Tier 5):** a `core.visits.route_run_stop_id`
  transit-vertical bridge column is *"Accepted transitional pattern… an acknowledged interim FK…
  Documented explicitly in `target_architecture.md §11`."* I.e. canonical is permitted to carry a
  column that points at an adapter table.
- **Redesign principle (Q-C, ADR §3):** run↔visit linkage *"stays a string translation
  (`assignments.source_system='route_runs'` + `source_ref`), NOT a hard FK from canonical into the
  adapter. Canonical must never FK into a vertical."* **SETTLED.**
- **Why it's a contradiction, not just staleness:** even though the column was never built (F-7), the
  doc still *endorses the pattern* as acceptable. The redesign has ruled that exact pattern out on
  principle ("canonical never FKs into the adapter"). A reader could legitimately try to add the
  Path E column tomorrow citing this doc, and would be building the one thing Q-C forbids.

### PC-3 — Tier 8 `core.assets` table as canonical stop identity → contradicts the settled asset model (D1)

- **Boundary-doc stance (§6 Tier 8):** the end-state requires *"`core.assets` fully seeded"* — a new
  canonical assets *table* — as the home of canonical stop identity.
- **Redesign / inventory decision (D1, ADR §6, CORE-INV §3/§10.2):** there is **no `core.assets`
  table and the redesign does not create one**; `public.assets` *is* the canonical asset registry
  (load-bearing FK target for four `core.*` columns), in the same "lives in public but is canonical"
  category as `public.organizations`. The ADR target shape lists `assets` as *"canonical registry
  (lives in public, IS canonical — load-bearing FK target)."*
- **Why it's a contradiction:** the boundary doc's target (Path F / Tier 8) and the redesign's target
  agree on the *goal* (callers use a canonical asset id, no transit table consulted) but disagree on
  the *structure* (a `core.assets` table vs. canonical-`public.assets`). Following the boundary doc
  would build a table the redesign has decided against.

### PC-4 — Identity-on-canonical-rows model → predates and contradicts the sidecar mechanism

- **Boundary-doc stance (§1):** identity (`actor_oid`/`created_by_oid`/`captured_by_oid`) lives **on
  the canonical entity rows** as NOT NULL columns. The doc has no concept of identity sidecars,
  `intelligence_reader`, or grant-based labor-safety isolation.
- **Redesign principle (ADR §0, §3, §6):** *"core knows no worker's name"* enforced *"by where data
  lives and who has grant."* Identity is extracted into the four `*_actor_audit` sidecars;
  `intelligence_reader` has **no grant** on them (verified); the sidecar pattern is *"confirmed
  CORRECT, not a workaround… the moat."*
- **Live state:** all four identity columns dropped from canonical entities (F-4). The boundary doc
  describes a schema shape that no longer exists *and* a design philosophy (identity-on-the-row) the
  redesign structurally repudiates.
- **Severity:** this is the most consequential contradiction for a labor-safety-by-structure system —
  the boundary doc, read alone, would teach an agent that worker OID is a normal canonical column.

### PC-5 — `transit_stops` / `transit_stop_assets` as permanent system-of-record → contradicts the spine inversion (Q-A/Q-B)

- **Boundary-doc stance (§2 table; Paths B/C; §7):** `transit_stops` is *"Source of truth for transit
  stop metadata… The transit stop identifier lives here"* and `transit_stop_assets` is *"The
  translation table between vertical identity and canonical identity"* — and Paths B/C/§7 establish
  `transit_stop_assets` as the live asset↔stop resolution mechanism for canonical queries, with no
  expiry. The doc frames these as the durable live mapping.
- **Redesign principle (Q-A/Q-B, ADR §3, §6):** the **canonical spine becomes load-bearing** for stop
  identity/geometry/asset-linking; `transit_stops`/`transit_stop_assets` **demote** to *"vertical
  ingestion source + operational flags, no longer the live system-of-record for asset↔location. Live
  reads invert onto `core.asset_locations`/canonical location views."* **SETTLED.**
- **Why it's a contradiction:** the boundary doc's Path B (the current, *documented-as-acceptable*
  state) routes canonical asset resolution **through the adapter** `transit_stop_assets`. The redesign
  inverts exactly this: canonical should resolve asset↔location from `core.asset_locations` and demote
  the adapter table to ingestion. So the doc's "tolerated one-hop translation" target becomes the
  thing the spine inversion is built to remove.
- **Honest tension:** Path B is still the *live* code today (CORE-INV §3.3 confirms code reads
  `transit_stop_assets`, not `core.asset_locations`). So the boundary doc describes *what is*
  accurately; it contradicts *what the redesign has decided should be*. Disposition should mark it
  superseded-as-target while noting it still matches current live code (relevant to §5 OQ-1 / the
  ADR's own DQ-3).

---

# Section 3 — Silent gaps

Things the redesign now treats as load-bearing that `ADAPTER_BOUNDARY.md` does not mention at all.
Not contradictions — omissions a reader of the boundary doc alone would miss.

- **G-1 — The adapter-definition test.** The ADR's core conceptual tool — *"the test for adapter vs
  canonical: would the next vertical understand this word?"* and the three-jobs definition of an
  adapter (ingestion translation / operational scaffolding / outbound translation) — is absent. The
  boundary doc has a *contamination rule* (§5, a query-level test) but no *object-level* definition of
  what makes a table/view adapter-vs-canonical. The redesign's whole classification pass runs on the
  object-level test the boundary doc lacks.

- **G-2 — Many ingestion surfaces → one canonical spine.** The ADR's multi-vertical model
  (*"Verticals do NOT share `transit_stops`. Parks gets its own ingestion surface… Both adapters write
  into the same generic `core.locations` + `assets`"*) is unmentioned. The boundary doc is implicitly
  single-vertical (transit) and never frames `transit_stops` as *one* ingestion surface among future
  many. A reader would not learn that the multi-vertical claim hinges on per-vertical ingestion tables.

- **G-3 — Operational-flags-stay-vertical rule.** The ADR records that `compactor`/`has_trash` are
  transit-operational and stay vertical *permanently*, while `is_hotspot` is "almost canonical" but
  kept vertical for now (ADR §6 operational-flags note). The boundary doc's `transit_stops` entry does
  not distinguish operational flags from reference metadata at all.

- **G-4 — Per-vertical adapter namespace question (DQ-1).** The open question of *where* evicted
  translation views live (dedicated `transit.*`/`parks.*` schema vs. tagged `public` objects) is a
  live design decision in the ADR (§7 DQ-1). The boundary doc, having no eviction concept, naturally
  omits it — but any agent acting on the boundary doc would not know a namespace decision is pending.

- **G-5 — The identity sidecar layer + grant-based isolation.** Beyond PC-4 (the contradiction): the
  boundary doc has **no mention** of the four `*_actor_audit` sidecars, the `intelligence_reader` /
  `audit_reader` / `mcp_readonly` roles, the no-grant labor-safety boundary, or the encryption
  envelope. This is now the central mechanism of the system. A reader of the boundary doc alone would
  not know the sidecar layer exists.

- **G-6 — Multi-tenant correctness items (MT-1..MT-4).** The ADR's "fast second customer" track —
  org-resolution fallback leak (MT-1/ISSUE-013), RLS fail-open posture (MT-2/PATTERN-001),
  onboarding-as-data (MT-3), `org_id` type inconsistency (MT-4) — is entirely outside the boundary
  doc's scope. The boundary doc mentions the PATTERN-001 RLS trap *once* (§2b, as an org-context
  gotcha on `v_locations_transit`) but not as the systemic multi-tenant fail-open decision the ADR
  elevates (MT-2 / DQ-2).

- **G-7 — Spine write-back mechanism (DQ-3).** The ADR flags that when the canonical spine becomes
  load-bearing, *something* must write `core.locations`/`core.asset_locations` on geometry/asset
  change (today they are seed-only, no live write path — CORE-INV §5.7). The boundary doc, treating
  `transit_stops` as the permanent source-of-record (PC-5), never raises the write-back question.

- **G-8 — Evidence write atomicity (Q-D).** The ADR settles the `stop_photos` + `core.evidence` +
  `core.evidence_actor_audit` write into one transaction (Q-D; today it runs on a bare pool, not
  atomic — CORE-INV §5.4). The boundary doc's `core.evidence`/`stop_photos` treatment does not mention
  the write path or its atomicity at all.

---

# Section 4 — Recommended disposition (options, not edits)

Per finding, the disposition options the founder chooses between. **No edit is made here.** Options:
**(A) correct-in-place** · **(B) mark-superseded-with-pointer-to-ADR** · **(C) delete** ·
**(D) keep-as-historical-record**. Where a claim shows *why* a decision was made, I flag
keep-as-history over delete.

| Finding | Recommended disposition | Rationale |
|---|---|---|
| **F-1** assignments 0-rows/Tier-5 | **A correct-in-place** (mostly done; finish the job) | The doc already half-corrected this (2026-05-30 inline). Propagate the correction to Path E / §6 so no stale Tier-5 framing remains. The "0 rows" history is not instructive enough to keep. |
| **F-2** asset_locations "sparse" | **A correct-in-place** | One-word factual fix to "14,916, fully populated"; add the inert-no-live-reader caveat (CORE-INV §3.3) so it isn't mistaken for load-bearing. |
| **F-3** `route_run_audit` phantom table | **C delete** the row | The object never existed; it is pure misdirection (a CLI agent could try to query it). Nothing historical to preserve. |
| **F-4** identity columns on canonical rows | **B mark-superseded → ADR §3 + CORE-INV §2** | Highest-value correction. The old column model is gone; point to the sidecar mechanism. Keep a one-line history note that identity *used* to live on the row and was extracted on 2026-06-01 (it explains the sidecar's existence). |
| **F-5** observations "87/87" | **A correct-in-place** | Replace stale counts with "illustrative — see CORE-INV for live counts," consistent with the doc's own header disclaimer. |
| **F-6** severity/status "never written" | **A correct-in-place** | Minor: note `severity` now 2/18, `status` still 0/18; tie to MV-3 deferral. |
| **F-7** Tier 5 / Tier 8 / Path E roadmap | **B mark-superseded → ADR** (large) | This is the doc's biggest stale surface. The Tier-5/8 sequencing is replaced by the ISSUE-031 redesign. Recommend a prominent banner at §3/§6 pointing to the ADR; **keep the roadmap as history** because it documents *why* Path B exists and what the original migration intent was — useful provenance, but must be clearly marked not-current. |
| **F-8** org_id derivation phrasing | **A correct-in-place** (light) | Tighten the over-generalized "both derive via join to assets.org_id"; or leave if the founder reads it as close-enough. (Also see §5 OQ-3.) |
| **PC-1** `v_*_transit` views legitimate in core | **B mark-superseded → CANON-1 (ADR §2)** | Correct the *view* stance (views are adapter objects, eviction settled); **preserve** the correct *table* stance (`location_external_ids` is canonical). Do not blanket-delete §2b — it has correct content. |
| **PC-2** Path E bridge column "accepted" | **B mark-superseded → Q-C** | The pattern is now forbidden ("canonical never FKs into adapter"). Must be marked clearly so no one builds it. Keep as history only if F-7's roadmap is kept (same banner). |
| **PC-3** Tier 8 `core.assets` table | **B mark-superseded → D1 / ADR §6** | Goal survives, mechanism doesn't. Point to "public.assets IS canonical; no core.assets table." |
| **PC-4** identity-on-rows philosophy | **B mark-superseded → ADR §0/§3** | Pairs with F-4. The philosophy repudiation is the important part — flag that the labor-safety model is now grant-based sidecars. |
| **PC-5** transit_stops/_assets permanent SoR | **B mark-superseded → Q-A/Q-B** | Subtle: the doc describes live truth accurately but the *target* inverts. Mark as "current live state, but redesign demotes these — see spine inversion." Keep as history (it's the as-is the inversion migrates *from*). |
| **G-1..G-8** silent gaps | **Not a disposition on existing text — add-pointer or leave to ADR** | These are omissions. Recommend the founder *not* expand the boundary doc to cover them, but instead add a single header pointer: "For the object-level adapter definition, sidecar/identity model, multi-tenant track, and open design questions, see the ISSUE-031 ADR." Keeping the boundary doc narrow (query-level contamination) and delegating the rest to the ADR avoids two docs drifting again. |

**Cross-cutting recommendation (founder's call, not an edit):** the cleanest disposition for the
document as a whole may be a **status banner at the top** — "Structure as of 2026-05-10; the Tier-5/8
roadmap and the identity-on-canonical-row model are SUPERSEDED by
`2026-06-07-issue-031-redesign-adr.md`; consult the ADR + the two 2026-06-06 inventories for current
state" — plus the targeted per-finding fixes above. This preserves the doc's still-useful core (the
§5 contamination rule, the §4 signal model, the Path A/B join mechanics that match live code) while
stopping it from misdirecting on the superseded parts. The §4 Signal Model ("observation absence is
data") and the §5 Contamination Rule are **not contradicted by anything in the ADR** and should be
kept as-is.

---

# Section 5 — Open questions

Where I cannot tell whether the boundary doc is stale or whether the live DB / redesign is the thing
that drifted — surfaced for the founder rather than guessed.

- **OQ-1 — Path B as "current state" vs. spine inversion: which is the intended *now*?** The boundary
  doc's Path B (canonical resolves asset via adapter `transit_stop_assets`) **matches live code today**
  (CORE-INV §3.3). The ADR's Q-A/Q-B inverts this onto `core.asset_locations`. Is Path B still the
  correct *as-built* description until the inversion migration lands (i.e. the doc is right about today,
  wrong about the target), or does the founder consider the inversion already the governing intent such
  that Path B should be marked deprecated immediately? This determines whether PC-5/§4-PC-5 is "correct
  but superseded" or "actively misleading." (The ADR's own DQ-3 — what writes the spine on change —
  is unresolved, which is why I can't settle this.)

- **OQ-2 — `target_architecture.md §11` cross-references.** The boundary doc cites
  `target_architecture.md §11` as the authority that "accepts" the Path E transit bridge column
  (PC-2). I did not audit `target_architecture.md` (not in scope / not a required read). If §11 still
  endorses the bridge column, **it too contradicts Q-C** and the staleness is wider than this one doc.
  The founder may want a follow-on check of `target_architecture.md §11` before relying on it.

- **OQ-3 — `core.visits` org_id derivation (F-8).** I confirmed the *assignment* INSERT derives
  `org_id` from `public.assets`, but the boundary doc's claim that `core.visits` "derives org_id by
  joining route_run_stops → assets.org_id" is looser than the live visit-ensure path (which scopes via
  `withOrgContext`). I can't tell if the doc meant the literal join (now inaccurate) or was describing
  the conceptual org source (still roughly true). Founder/author intent needed to classify it as F-1
  staleness vs. acceptable shorthand.

- **OQ-4 — Is the boundary doc meant to remain a *living* design doc or become a historical artifact?**
  Much of its forward-looking content (Tier 5/8 roadmap) is superseded, but its query-level
  contamination rule and signal model are current and genuinely useful to "any agent writing a query
  that touches core.*" (its stated audience). The disposition strategy differs sharply depending on
  whether the founder wants to (a) keep it as the living query-author's guide with the roadmap excised,
  or (b) freeze it as a 2026-05-10 historical record and move the living guidance into the ADR lineage.
  This is a doc-strategy call only the founder can make; §4's dispositions are written to support
  either, but the choice changes which findings get "correct-in-place" vs. "mark-superseded."

- **OQ-5 — `mcp_readonly` / sidecar exposure is out of the boundary doc's frame entirely.** Not a
  drift question so much as a scope question: the live identity-leak surface the inventories flag
  (`mcp_readonly` reads sidecars; ADR Q-G revokes it) has no home in the boundary doc. Should the
  permission/grant model be referenced from the boundary doc at all, or is it correctly the ADR's and
  the inventories' territory? (I lean: leave it out of the boundary doc — but flagging because a
  reader looking for "the boundary" might expect the grant boundary here too.)

---

*End of reconciliation. All §1 factual claims verified live against `fieldpro_db` (postgres MCP) on
2026-06-07 or cited to a live-verified inventory section. `ADAPTER_BOUNDARY.md` was not modified. No
schema, code, or data changed. Standards audited against: `2026-06-07-issue-031-redesign-adr.md`,
`2026-06-06-canonical-core-complete-inventory.md`, `2026-06-06-transit-adapter-complete-inventory.md`.*
