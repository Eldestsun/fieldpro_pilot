# ISSUE-031 — Migration Sequence

> **Type:** Planning artifact (execution plan). Specifies the ordered phases and
> per-step contract for the ISSUE-031 canonical-migration / work-attribution clip.
> **This is not executable SQL.** Each step here is dispatched as its own migration
> task; the SQL is authored in that task, against this sequence.
> **Date:** 2026-06-13
> **Authored against:**
> - `2026-06-07-issue-031-redesign-adr.md` — the target shape and principles (Q-A…Q-G)
> - `2026-06-11-issue-031-calibration-decisions.md` — D0–D8 (what is live / what gets evicted)
> - `2026-06-11-issue-031-dq-decisions.md` — DQ-1…DQ-5 (how the migration sequences)
> - `2026-06-13-dq3-geometry-write-investigation.md` — DQ-3 sizing verdict (thin hook, not a subsystem)
> - `target_architecture.md` / `current_state.md` — target vs. current, must-not-regress list
> - `pg_state.sql` — live schema snapshot (object names below verified against it)
> **Closes:** the migration-sequence artifact flagged MISSING in
> `2026-06-11-live-repo-audit.md` §8c.

-----

## 0. Orientation

### 0.1 What ISSUE-031 is

Complete the canonical migration and land the work-attribution clip: make the
canonical spine load-bearing, evict the contaminated translation views out of
`core`, harden the canonical↔vertical linkage, and remove the worker-identity read
surface — all enforced *structurally* (where data lives, who has grant), not by
convention. The strategic asset this protects is **verifiability**: the clip must
land clean and independently auditable.

### 0.2 Scope (DQ-5), restated for this sequence

**ISSUE-031 OWNS:**

| Item | Source | Phase below |
|------|--------|-------------|
| `transit.*` schema creation | DQ-1 | P0 |
| Drop 4 dead log views + `public.level3_logs` | D2 | P1 |
| Spine inversion — canonical becomes the live asset↔location read path | Q-A/Q-B | P2 |
| DQ-3 re-translation write-back hook (thin, ingestion-boundary) | DQ-3 | P2 |
| `transit_stops` bare-pool handler fix (in routing-layer reshape) | D8 | P2 |
| Run↔visit linkage hardening | Q-C | P3 |
| Evict 2 surviving log views + repoint Control Center to canonical | D3 | P4 |
| `v_stop_location_map` re-evaluation | D2/D3 | P4 |
| Work-attribution clip — identity read-surface removal | core 031 | P5 |
| Clipped-table drop (`clean_logs` et al.) | ADR §6 | P6 (gated) |

**Already landed (prerequisites satisfied — do not re-dispatch):**

- **Q-D — evidence write atomicity** — `stop_photos` + `core.evidence` +
  `core.evidence_actor_audit` made one transaction. Landed `2ee1197`
  (2026-06-11). The orphan-identity inconsistency the clip cannot ship is closed.
- **Q-G / D7 — `mcp_readonly` revoked to canonical-only** — landed
  `17d5959` / merge `ca92bf6`. The LOGIN role no longer reaches the four sidecars,
  `identity_directory`, or any work-attribution log. Verify-still-true is folded
  into P5's verification, but no new work.

**OUT of scope for ISSUE-031 (DQ-5 — each its own tracked issue; this sequence
must not pull them in):**

- **MT-1 / ISSUE-013** — org-resolution lowest-id fallback leak
- **DQ-2** — fail-open → fail-closed RLS (new tenancy-hardening issue, lands with
  **ISSUE-018** intelligence_reader wiring, sequenced *after* 031)
- **Q-E** — uniform sidecar encryption
- **Q-F / ISSUE-028** — `audit_reader` wiring + export-channel move
- **MV-2 / ISSUE-029** — PostGIS / PG15+ bump (discipline only: P2 must not deepen
  lat/lon point-assumptions)
- **MV-4 / DQ-4** — condition-state promotion to canonical (the deliberate
  fast-follow pass, *after* the clip)
- **`admin` schema / `identity_directory` relocation** — ADR §6 target shape shows
  it, but DQ-5 does not assign it to 031 and it is coupled to `audit_reader`
  (Q-F/ISSUE-028). Treated as out here. See Open Question OQ-2.

### 0.3 The governing discipline (every phase is an application of it)

> Canonical learns no vertical's vocabulary, and core knows no worker's name —
> enforced by where data lives and who has grant, not by anyone's discipline.

And the standing build rule from `PROJECT_CONTEXT.md` §Execution-Principle-2
(**additive discipline**): *never remove a working write path until its canonical
replacement is verified.* This is why the table **drops** (P6) are quarantined
behind a hard canonical-completeness gate, separated from the identity
**read-surface** removal (P5) which has no such dependency.

### 0.4 Sequencing rationale at a glance (what unlocks what)

```
P0  create transit.* schema ───────────────┐ (destination for evicted views)
                                            │
P1  drop dead views + level3_logs ──────────┤ (shrink surface; independent, lowest risk)
                                            │
P2  spine inversion + DQ-3 hook + D8 ───────┤ (canonical load-bearing for asset↔location;
     │  must precede any read repoint that  │  re-translation hook installed BEFORE reads
     │  relies on canonical asset↔location  │  invert so canonical cannot go stale)
     ▼                                      │
P3  Q-C run↔visit linkage hardening ────────┤ (independent correctness; can run parallel to P2)
                                            │
P4  Control Center repoint + evict 2 views ─┤ (needs transit.* [P0]; sequenced with T1-CC;
     │  + re-evaluate v_stop_location_map   │  removes the last live readers of the log views)
     ▼                                      │
P5  work-attribution clip (read surface) ───┤ (needs P1+P4 done = no view/grant identity surface;
     │                                      │  rebuilds the one identity-reading UI)
     ▼                                      │
P6  drop clipped tables (GATED) ────────────┘ (needs P5 + canonical-write completeness verified;
        clean_logs, hazards, infra_issues,      this is the additive-discipline gate)
        stop_photos, trash_volume_logs
```

The ordering principle: **remove dead weight first (P1), establish canonical as
load-bearing next (P2), harden the linkage (P3), retire the live view readers
(P4), strip the identity read surface (P5), and only then — behind a completeness
gate — drop the underlying tables (P6).** Each phase leaves the system in a
shippable state; no phase depends on a later one.

-----

## Phase 0 — `transit.*` schema creation (DQ-1)

**Scope.** Create the dedicated `transit` schema that the evicted translation
views (P4) will land in, with grants set so CANON-1 is enforceable by *schema
grant* rather than naming discipline. Zero behavior change — empty schema.

**Why first.** It is the destination every later view-eviction step writes into.
It is pure scaffolding with no dependency and no risk, so it goes first and
unblocks P4. (`transit` schema does not exist today — `pg_state.sql` shows only
`core` + `public`; DQ-1 §Note and the live-repo-audit §9a confirm.)

### Step 0.1 — Create `transit` schema + grants

- **What it does:** creates schema `transit`; grants `USAGE` to the roles that
  legitimately read transit translation views (the app role `fieldpro`; **not**
  `intelligence_reader`, **not** `mcp_readonly`).
- **Touches:** new schema `transit` (DDL); role grants.
- **Pre-conditions:** none.
- **Post / verification:** `\dn` lists `transit`; `intelligence_reader` and
  `mcp_readonly` have **no** `USAGE` on it (`has_schema_privilege(...,'USAGE')`
  false for both); no objects in it yet.
- **Rollback:** `DROP SCHEMA transit` (empty → safe, reversible).
- **Labor-safety impact:** positive/structural — makes the vertical boundary a
  grantable schema fact rather than a naming convention. No identity surface.

> Note (OQ-2): the parallel `admin` schema for `identity_directory` relocation is
> **not created here** — out of 031 scope. If the founder later folds it in, it is
> its own P0-sibling step.

-----

## Phase 1 — Dead-object eviction (D2)

**Scope.** Remove the four `core.v_*_transit` log views that have zero application
readers, and drop the dead `public.level3_logs` table. Pure surface reduction —
nothing reads these.

**Why here.** Lowest-risk change in the whole sequence (proven zero readers), and
it shrinks the surface the harder phases operate over. Independent of P0; can run
in parallel with it.

### Step 1.1 — Drop the four unread translation views

- **What it does:** drops `core.v_infra_transit`, `core.v_level3_logs_transit`,
  `core.v_stop_photos_transit`, `core.v_trash_volume_logs_transit`.
- **Touches:** four views in `core` (verified present in `pg_state.sql`).
- **Pre-conditions:** inverted-grep proof of **zero** application readers (D2 /
  calibration Q2 already established this; the agent re-runs it pre-drop as the
  gate). No view depends on these four.
- **Post / verification:** the four views are absent (`\dv core.*`); a full grep of
  `backend/` for each view name returns empty; app boots and Control Center
  `/overview`+`/difficulty` still serve (they read the *surviving* two, not these).
- **Rollback:** `CREATE VIEW` from the definitions captured in the migration's
  down-script (definitions are in `pg_state.sql` today — capture verbatim before
  drop). Fully reversible; no data, just view DDL.
- **Labor-safety impact:** positive — removes four worker-column grant surfaces
  exposed to `intelligence_reader` (ISSUE-030) that were never an exercised read
  path. Net reduction in identity exposure.

### Step 1.2 — Drop `public.level3_logs`

- **What it does:** drops the `public.level3_logs` table.
- **Touches:** `public.level3_logs` (0 rows; no writer; previously read only by the
  dormant `rebuildStopRiskSnapshotLegacy()`).
- **Pre-conditions:** confirm 0 rows live; confirm the only reader
  (`rebuildStopRiskSnapshotLegacy`) is still exported-but-uncalled (it is annotated
  "Delete once verified"); confirm `level3_compliance_mv` (a separate MV, see OQ-5)
  does **not** depend on `level3_logs` — *verify before drop*.
- **Post / verification:** table absent; app boots; risk job (`rebuildStopRiskSnapshot`,
  the live one) unaffected.
- **Rollback:** recreate the table from DDL (down-script); it carried 0 rows so no
  data restore is needed.
- **Labor-safety impact:** none material (dead table). Removes a `reported_by`-style
  worker column from the schema.

> `v_stop_location_map` is **not** touched in P1 — it is consumed inside the two
> *surviving* views (`v_clean_logs_transit`, `v_hazards_transit`) and can only be
> re-evaluated once those are gone (P4). Carried per D2.

-----

## Phase 2 — Spine inversion + DQ-3 hook + `transit_stops` reshape (Q-A/Q-B, DQ-3, D8)

**Scope.** Make the canonical spine (`core.locations` / `core.asset_locations` /
`core.location_external_ids`) the **live** read path for asset↔location, demote
`transit_stops` / `transit_stop_assets` to ingestion-source-plus-operational-flags,
install the thin DQ-3 re-translation hook so canonical can never go stale, and fix
the three bare-pool flag handlers (D8) as part of touching this table.

**Why here.** This is the inversion the whole "canonical is load-bearing" claim
rests on. It must come **before** P4 (any read repoint that relies on a current
canonical asset↔location mapping) and the hook (2.1) must be installed **before**
the reads invert (2.2) so there is never a window where a live ingestion change
leaves canonical stale.

**DQ-3 sizing (settled by the 2026-06-13 investigation):** geometry (`lat`/`lon`)
and asset-linkage (`transit_stops.asset_id` / `transit_stop_assets`) are
**seed/ingestion-only — no live edit path exists.** At runtime today the
re-translation hook would fire **zero times.** So 2.1 is a *thin on-change hook at
the ingestion boundary*, not a subsystem. Canonical stays strictly **derived**;
there is **no** direct admin write path into canonical (DQ-3 decision).

### Step 2.1 — Install the DQ-3 adapter→canonical re-translation hook

- **What it does:** adds an on-change re-translation so that whenever ingestion
  mutates a stop's geometry or primary asset link, that stop's `core.locations` /
  `core.asset_locations` rows are re-derived from the adapter (one direction:
  adapter → canonical).
- **Touches:** writes `core.locations`, `core.asset_locations` (re-derive);
  reads `transit_stops`, `transit_stop_assets`. Natural form (per the investigation
  §"What this means", point 2): a trigger mirroring `sync_transit_stop_primary_asset`'s
  shape — `AFTER INSERT OR UPDATE OF lat, lon, asset_id ON transit_stops` →
  re-translate that stop. **Exact mechanism is an implementation choice for the
  dispatched task** (DB trigger vs. ingestion-path function call) — see OQ-1.
- **Pre-conditions:** the one-time seed backfill that populated `core.locations` /
  `core.asset_locations` / `core.location_external_ids` from `transit_stops` is
  confirmed present and 1:1 (DQ-3 investigation §5 confirmed the seed migrations
  and the 14,916 = 14,916 row baseline). RLS org-context discipline: the hook must
  set / run under `app.current_org_id` (it writes FORCE-RLS canonical tables — see
  `CLAUDE.md §RLS Context Gotcha`).
- **Post / verification:** with no live geometry/asset_id write path, the hook is
  *correct-by-construction-silent* — verify by an **explicit ingestion test**:
  insert/modify a test stop's `lat`/`lon`/`asset_id` under org context and confirm
  the matching `core.locations`/`core.asset_locations` rows re-derive correctly and
  carry the right `org_id`; confirm a flag-only `UPDATE` (hotspot/compactor/has_trash)
  does **not** fire it.
- **Rollback:** drop the trigger/function; canonical reverts to seed-only (its state
  today). Reversible; no data loss (canonical is derived).
- **Labor-safety impact:** none — geometry/linkage, no worker identity. **MV-2
  discipline (ISSUE-029):** the hook must **not** introduce new lat/lon point-only
  math or new float geometry columns on canonical — keep it a translation of the
  existing columns so the PostGIS retrofit stays a contained future job.

### Step 2.2 — Repoint live asset↔location reads onto canonical

- **What it does:** inverts the live reads that currently resolve asset↔location
  through `transit_stops` / `transit_stop_assets` so they read the canonical spine
  (`core.asset_locations` for asset↔location; `core.location_external_ids` /
  `core.v_stop_location_map` for the `stop_id ↔ location_id` translation).
- **Touches (reads):** `riskMapService.ts` is the known live consumer — it joins
  `transit_stop_assets` for the `asset_id → stop_id` spine lookup
  (`riskMapService.ts:80/95/113/140/296`, per the DQ-3 investigation). Repoint these
  onto the canonical equivalent. **Enumerate every other live asset↔location reader
  before repointing** (the dispatched task owns this grep; OQ-3).
- **Pre-conditions:** 2.1 installed (canonical stays current); canonical spine
  verified 1:1 complete vs. `transit_stop_assets` (the 14,916 baseline); the read
  path uses `withOrgContext` (these are FORCE-RLS canonical tables).
- **Post / verification:** risk-snapshot rebuild produces **identical** output
  reading canonical vs. reading the adapter (golden-diff against a pre-change run);
  `riskMapService` no longer references `transit_stop_assets` for the spine; app
  boots; Control Center difficulty surface unchanged.
- **Rollback:** revert the read repoint (point back at `transit_stop_assets`).
  Adapter tables are untouched and still authoritative-by-seed, so rollback is a
  pure code revert.
- **Labor-safety impact:** none — asset↔location is identity-free.

### Step 2.3 — Fix the three `transit_stops` bare-pool flag handlers (D8)

- **What it does:** wraps the three flag-update handlers in `withOrgContext` so they
  no longer run bare `pool.query()` on FORCE-RLS `transit_stops` (PATTERN-001
  fail-open).
- **Touches:** `PATCH /api/stops/:id/{hotspot,compactor,has-trash}` —
  `stopRoutes.ts:81/176/271`. (These are the surviving operational-flag writes; the
  DQ-3 investigation confirmed they touch flags only, never geometry/asset_id.)
- **Pre-conditions:** none beyond being inside the routing-layer reshape (D8 mandates
  fixing here, *not* as a standalone task, to avoid touching these handlers twice).
- **Post / verification:** a two-org test proves each handler is org-scoped and
  fail-closed (write under org A is invisible to org B; bare-pool path is gone).
- **Rollback:** revert to prior handler code. Pure code revert.
- **Labor-safety impact:** none directly; it is a multi-tenant correctness fix.
  **Note:** D8 is a *correctness* fix bundled here for efficiency; it is **not** the
  DQ-2 fail-closed RLS flip (that is out of scope, OQ-7). This only routes the
  existing handlers through `withOrgContext`.

### Step 2.4 — Demote `transit_stops` / `transit_stop_assets` (documentation + table comments)

- **What it does:** records, in table comments and `ADAPTER_BOUNDARY.md`, that
  `transit_stops` / `transit_stop_assets` are **ingestion source + operational
  flags only**, no longer the live system-of-record for asset↔location.
- **Touches:** comments on `transit_stops`, `transit_stop_assets`;
  `ADAPTER_BOUNDARY.md` (also fold in the D0/D1 `route_run_audit` phantom correction
  here if not already done).
- **Pre-conditions:** 2.2 landed (reads actually inverted — the comment must be true
  when written).
- **Post / verification:** comments present; `ADAPTER_BOUNDARY.md` reconciled; no
  live read path resolves asset↔location through these tables (grep clean).
- **Rollback:** revert comments/doc. No functional effect.
- **Labor-safety impact:** none.

> **ISSUE-024 (latent `org_id` defect in `sync_transit_stop_primary_asset`):** the
> DQ-3 investigation confirms the trigger's `INSERT` omits the NOT NULL `org_id`,
> and that this is *positive evidence* no runtime path sets `asset_id` today. The
> DQ-3 re-translation (2.1) does **not** write `transit_stops`, so it does not trip
> ISSUE-024. **Fix ISSUE-024 only if 2.1's implementation reworks that trigger, or
> if a runtime `transit_stops` ingestion/asset_id write path is introduced** (per
> D6). If neither happens in this phase, leave it as a tracked latent defect — do
> not expand P2's blast radius to chase it.

-----

## Phase 3 — Run↔visit linkage hardening (Q-C)

**Scope.** Promote the run↔visit linkage from "incidental join that works" to a
declared, tested, canonical↔vertical linkage — **as a string translation**
(`assignments.source_system='route_runs'` + `source_ref` = route_run id), never a
hard FK from canonical into the adapter (canonical must never FK into a vertical).

**Why here.** Independent correctness/robustness work; can run in parallel with P2.
Placed before the clip (P5) because the clip and the post-clip rebuilt UIs lean on
this linkage being trustworthy, and it is cheap to harden now.

### Step 3.1 — Index + validate + regression-test the linkage

- **What it does:** (a) indexes the `(source_system, source_ref)` pair on
  `core.assignments`; (b) adds write-time validation that the linkage resolves 1:1;
  (c) adds a 1:1 integrity regression test.
- **Touches:** `core.assignments` (index); the assignment write path (validation);
  test suite. **No** FK added into `route_runs`.
- **Pre-conditions:** confirm the current linkage is in fact 1:1 in live data before
  asserting it in a test (a pre-existing many-to-one would fail the new test —
  surface it, don't mask it).
- **Post / verification:** index present (`\d core.assignments`); write-time
  validation rejects a non-resolving `source_ref`; regression test passes proving
  1:1; no FK from `core.*` into `public.route_runs` exists.
- **Rollback:** drop the index; remove the validation + test. Reversible.
- **Labor-safety impact:** none — assignment intent, not work-attribution. (Note:
  `assignments.created_by_oid` is intent-creator identity, openly known in any
  transit op per ADR D2; this step does not change its exposure.)

> **§5.1 interaction (flag, do not fold):** `current_state.md` §5.1 notes
> `core.visits.assignment_id` is never populated. Q-C hardens the
> *assignment↔route_run* string linkage; it does **not** by itself fix the
> *visit→assignment* FK gap. If the dispatched task finds the two are entangled,
> surface it — but §5.1 closure is canonical-write-path (Tier) work, an OQ-6
> dependency for P6, not Q-C's job.

-----

## Phase 4 — Control Center repoint + surviving-view eviction (D3)

**Scope.** Repoint the Control Center `/overview` + `/difficulty` reads off the two
surviving translation views onto canonical (`core.visits` + `core.observations`),
then evict `core.v_clean_logs_transit` and `core.v_hazards_transit`, then
re-evaluate `core.v_stop_location_map`.

**Why here.** This removes the **last live readers** of the log-derived views, which
is the precondition for stripping the identity read surface (P5). It needs the
`transit.*` schema (P0) available as the eviction destination. **It carries a hard
cross-workstream sequencing constraint with T1-CC (below).**

> **CROSS-WORKSTREAM SEQUENCING (must not be clobbered — calibration D3):** the
> Control Center is *also* being relocated Admin→Dispatch by
> `T1-CC-control-center-relocation.md`, which rewrites these exact handlers
> (`/overview`, `/routes`, `/exceptions`, `/difficulty`) and currently declares "no
> schema changes." **The ISSUE-031 canonical repoint must land *before or within*
> the T1-CC extraction**, so the handlers move to
> `backend/src/modules/ops/controlCenterRoutes.ts` **already reading canonical.**
> Doing T1-CC first means extracting handlers that still read the adapter views and
> immediately re-editing them. **Whichever workstream moves first owns the other's
> constraint** — this must be explicitly assigned at dispatch time, not left to
> chance.

### Step 4.1 — Repoint Control Center reads to canonical

- **What it does:** rewrites the `/overview` + `/difficulty` reads:
  - clean-event count / observed-minutes → `core.visits`
    (`ended_at - started_at`, `outcome='completed'`) + `core.observations`, joined
    by `visit_id`, keyed on `location_id`.
  - hazard counts → `core.observations` filtered to the 8 safety `*_present` types
    (`observed_at`, `severity`).
- **Touches (reads):** the Control Center handlers (today read
  `v_clean_logs_transit` for `duration_minutes`/`cleaned_at`/`location_id` and
  `v_hazards_transit` for `reported_at`/`severity`); after this, `core.visits` +
  `core.observations`.
- **Pre-conditions:** canonical-inventory §6.3 identity-free column sets confirmed
  to carry every fact these two views surface (D3 verified feasible); reads use
  `withOrgContext`.
- **Post / verification:** Control Center `/overview` + `/difficulty` produce
  equivalent aggregates from canonical (golden-diff vs. pre-change); no handler
  references either `v_*_transit` view; **D5 guardrail respected** — service time
  surfaces only as a **route-level aggregate**, never per-stop (see 4.1a).
- **Rollback:** revert the handler reads to the views (views still exist until 4.2).
  Pure code revert.
- **Labor-safety impact:** **central.** The repoint must preserve D5: live route-keyed
  surfaces show service time only as route-level aggregate (route pace), never
  per-stop; stop drill-down shows attributes/actions but **no time-at-stop field**.

> **4.1a — D3 severity caveat (FLAG, do not fold — intelligence-semantics):** the
> risk job synthesizes hazard severity as a literal `1.0` rather than reading the
> `severity` column. If Control Center's `COUNT FILTER (severity >= 4)` must stay
> meaningful after the repoint, `core.observations.severity` must actually be
> populated on those rows. That is an intelligence-semantics question (already in
> KNOWN_ISSUES), **not a blocker for the repoint itself.** Surface it to the
> dispatch; do not silently let the filter become a no-op. See OQ-4.

### Step 4.2 — Evict the two surviving views into `transit.*` (or drop)

- **What it does:** removes `core.v_clean_logs_transit` and `core.v_hazards_transit`
  from `core` (CANON-1). Per DQ-1 they move to the `transit` schema as
  transit-adapter translation objects — **unless** 4.1 leaves them with zero readers,
  in which case they are dropped outright (cleaner). Decide at dispatch based on the
  post-4.1 reader grep.
- **Touches:** `core.v_clean_logs_transit`, `core.v_hazards_transit`; possibly new
  `transit.v_clean_logs` / `transit.v_hazards`.
- **Pre-conditions:** 4.1 landed; grep proves no `core.v_*_transit` reader remains in
  `backend/`; `transit` schema exists (P0).
- **Post / verification:** neither view exists in `core` (`\dv core.*`); if relocated,
  they exist in `transit` with grants scoped to `fieldpro` only (not
  `intelligence_reader`); app boots; Control Center unchanged.
- **Rollback:** recreate in `core` from captured definitions (in `pg_state.sql`
  today — capture verbatim before the move).
- **Labor-safety impact:** **positive/structural** — this is the move that makes
  CANON-1 a schema-grant fact instead of "the view happens not to select the worker
  column." After this, no `core` object exposes a transit worker column to
  `intelligence_reader`.

### Step 4.3 — Re-evaluate `core.v_stop_location_map`

- **What it does:** determines whether `v_stop_location_map` still has readers once
  4.1/4.2 land. It reads `core.location_external_ids` (the canonical spine) and was
  consumed *inside* the two surviving views. If the repointed Control Center and the
  inverted spine reads (P2) no longer need it, drop it; if a canonical read path
  still uses it as the `stop_id ↔ location_id` translation helper, keep it (it is a
  legitimate canonical-spine view, not a contaminated one).
- **Touches:** `core.v_stop_location_map` (verified present, `pg_state.sql:809`).
- **Pre-conditions:** 4.1 + 4.2 landed; P2 spine repoint landed; reader grep run.
- **Post / verification:** decision recorded with the grep evidence; if dropped,
  absent and app boots; if kept, justified as a canonical translation helper (it
  filters `source_system='metro_stop'` — note that filter is itself a vertical
  value; if kept long-term it arguably belongs in `transit.*` too — flag for the
  dispatch, OQ-3).
- **Rollback:** recreate from definition (trivial — it is a 3-column projection).
- **Labor-safety impact:** none (no worker column).

-----

## Phase 5 — Work-attribution clip: identity read-surface removal (the labor-safety migration)

**Scope.** Remove the remaining live worker-identity **read** surface. This is the
migration the whole labor-safety guarantee rests on, so it lands **clean and
independently verifiable** — and it is deliberately separated from the table
**drops** (P6), which carry a canonical-completeness dependency this phase does not.

**Why here.** By P5, intelligence is already off the log tables (Tier 2, verified),
the view/grant identity surface is gone (P1 + P4), `mcp_readonly` is already revoked
(D7), and evidence identity is already atomic (Q-D). What remains is the handful of
live identity reads catalogued in the calibration record's "remaining live
identity-bearing reads."

### Step 5.1 — `loadRouteRunById` / `LeadCompletedRouteDetail` payload fix (D4/D5)

- **What it does:** removes per-stop `completed_at`/duration as a *displayed per-stop
  field* from the live route-detail surface, and rebuilds the admin clean-logs list
  on `LeadCompletedRouteDetail.tsx` to read canonical identity-free instead of
  `clean_logs SELECT cl.*` (full row incl. `user_id`). The sanctioned
  `loadRouteRunById` identity join (assigned/creator name + role on the route
  header) **stays** (D4 — blessed), but the payload must no longer pair it with a
  per-stop timeline (D5: name + per-stop timing together is the leak in miniature).
- **Touches:** `loadRouteRunById.ts` (payload shape); `LeadCompletedRouteDetail.tsx`
  (the one UI that visibly breaks on a clip); the admin/ops clean-logs list read.
- **Pre-conditions:** P4 landed (canonical carries the facts the rebuilt list needs);
  the route-level aggregate pace surface exists (per D5, the route header may carry
  the aggregate).
- **Post / verification:** the live route-detail payload contains **no** per-stop
  `completed_at`/duration field; the admin clean-logs list renders from canonical
  with no `user_id`/`reported_by` worker column; the blessed header identity join
  still works (two-org test, fail-closed); **D5 test:** "putting a duration or
  `completed_at`-derived time on a live route or stop-drill-down view is forbidden"
  — the agent demonstrates the surface has none.
- **Rollback:** revert the payload/UI change. (Underlying `clean_logs` still exists
  until P6, so rollback restores the prior read.)
- **Labor-safety impact:** **this is the presentation-layer leak D5 closes** — the
  human-eye join (name + per-stop time on a single-assignee route) is removed.
  Capture is unchanged: `core.visits.started_at`/`ended_at` keep logging per-stop
  timing; only the *surfacing grain* changes.

### Step 5.2 — `stop_photos.created_by_oid` read removal

- **What it does:** removes the `created_by_oid` field from `PhotoDto` (it reaches
  the DTO but is **not rendered** today — calibration). Canonical evidence identity
  now lives in `core.evidence_actor_audit` (the no-grant sidecar, Q-D landed).
- **Touches:** `PhotoDto`, `stopPhotosService.ts` read shape.
- **Pre-conditions:** Q-D atomic evidence write confirmed landed (it is — `2ee1197`),
  so canonical evidence + sidecar fully carry the photo provenance.
- **Post / verification:** `PhotoDto` carries no `created_by_oid`; grep confirms no
  surface reads `stop_photos.created_by_oid`.
- **Rollback:** revert the DTO field. Pure code revert.
- **Labor-safety impact:** positive — removes a worker-OID field from an
  app-reachable DTO, even though it was unrendered.

### Step 5.3 — Identity-read-surface verification sweep (the audit the clip exists for)

- **What it does:** the verifiable, auditor-facing proof that the clip landed — a
  systematic confirmation that no live read surface resolves work to an individual.
- **Touches:** verification only (no schema/code change).
- **Pre-conditions:** 5.1, 5.2 landed.
- **Post / verification (the standard the clip is judged by):**
  - `has_table_privilege('mcp_readonly', X, 'SELECT')` = **false** for all four
    `*_actor_audit` sidecars + `identity_directory` + every work-attribution log;
    canonical reads = **true** (re-confirms D7 still holds).
  - `intelligence_reader` has **no** grant reaching any sidecar, `identity_directory`,
    or worker-column view (re-confirms post-P4 surface).
  - The only sanctioned live identity read is `loadRouteRunById`'s header join (D4),
    and it is org-scoped/fail-closed; no other surface joins `identity_directory`.
  - Risk job, history tables, Control Center: grep-clean of `identity_directory` and
    `*_actor_audit`.
- **Rollback:** n/a (verification).
- **Labor-safety impact:** **this is the deliverable** — "an evaluator can open the
  DB and confirm with their own eyes there is no worker-attribution read surface."

-----

## Phase 6 — Clipped-table drop (GATED on canonical-write completeness)

**Scope.** Drop the transit log tables the ADR clips entirely:
`clean_logs`, `hazards`, `infrastructure_issues`, `stop_photos`,
`trash_volume_logs` (`level3_logs` already dropped in P1). This is the final
removal of the write-attribution substrate.

**Why last, and why gated.** This is the one phase that violates *additive
discipline* if rushed: these tables (notably `clean_logs` and `stop_photos`) are
**still actively written** by the live app, and `current_state.md` §5.1–5.9
catalogs canonical-write gaps (e.g. §5.3 `washed_can` not emitted as an observation;
§5.1 `assignment_id` never written; §5.2 `outcome`/`reason_code` null). **The tables
cannot be dropped until canonical demonstrably holds everything they hold, and their
write paths are removed.** That completeness is partly Tier/refactor work outside
031 — so P6 is **gated, and may land as a 031 fast-follow** rather than within the
core clip.

### Gate G6 (hard pre-condition for the entire phase)

All must be true and **verified**, not assumed:

1. Canonical write path is complete vs. each clipped table's facts — `current_state.md`
   §5.1–5.9 closed (or each open item proven irrelevant to the specific table being
   dropped). **This is the dependency on Tier/refactor work — see OQ-6.**
2. The transit write paths into the clipped tables are removed or proven dormant
   (`cleanLogService.ts` clean_logs write; `stopPhotosService.ts` stop_photos write —
   noting Q-D now dual-writes `core.evidence`).
3. No reader of any clipped table remains (P4 + P5 removed the known ones; re-grep).
4. A backup/export of each table is taken before drop (these carry real rows, unlike
   `level3_logs`).

### Step 6.1 — Remove the clipped-table write paths

- **What it does:** stops the app writing `clean_logs` / `stop_photos` / etc. once
  canonical fully covers them.
- **Touches:** `cleanLogService.ts`, `stopPhotosService.ts`, any other writer.
- **Pre-conditions:** G6.1 (canonical completeness) verified.
- **Post / verification:** stop-completion + photo-upload flows produce complete
  canonical rows (visit + observations + evidence) with the same facts; no write to
  the clipped tables; offline replay path unaffected (`offlineQueue.ts` is FROZEN —
  do not touch its contract).
- **Rollback:** restore the write paths. Reversible while tables still exist.
- **Labor-safety impact:** removes the last writers of `user_id`/`reported_by`
  worker columns.

### Step 6.2 — Drop the clipped tables

- **What it does:** drops `clean_logs`, `hazards`, `infrastructure_issues`,
  `stop_photos`, `trash_volume_logs`.
- **Touches:** those five `public` tables.
- **Pre-conditions:** Gate G6 fully satisfied; 6.1 landed and verified in a real run;
  backups taken.
- **Post / verification:** tables absent; app boots; full stop-completion +
  photo-upload + skip-with-hazard flows pass end-to-end against canonical only;
  intelligence + Control Center + route detail all unaffected.
- **Rollback:** restore from the pre-drop backup (these had real rows). **Rollback is
  heavier than earlier phases — this is why the gate is hard.**
- **Labor-safety impact:** completes the structural clip — the work-attribution log
  substrate no longer exists in the database.

-----

## Open questions (flagged, not guessed)

| # | Question | Why it matters / what investigation is needed | Blocks |
|---|----------|-----------------------------------------------|--------|
| **OQ-1** | DQ-3 hook mechanism: DB trigger (`AFTER INSERT OR UPDATE OF lat,lon,asset_id`) vs. an ingestion-path function call? | Both satisfy "thin, derived, one-direction." Trigger mirrors `sync_transit_stop_primary_asset` and fires automatically; a function call is explicit at the ingestion boundary. Since there is **no** live edit path today, either is near-zero-runtime. The dispatched P2.1 task should pick based on where the future ingestion surface will live. | P2.1 sizing only |
| **OQ-2** | Is `admin` schema + `identity_directory` relocation in 031 or deferred to Q-F/ISSUE-028? | ADR §6 target shape shows it; DQ-5 does not list it under "ISSUE-031 OWNS" and it is coupled to `audit_reader` (ISSUE-028, out of scope). This sequence assumes **deferred**. Founder confirm. | P0 sibling (if pulled in) |
| **OQ-3** | Full enumeration of live asset↔location readers (P2.2) and `v_stop_location_map` readers (P4.3); and whether `v_stop_location_map` (which filters `source_system='metro_stop'`) should relocate to `transit.*` if kept. | `riskMapService` is the known reader; the repoint must not miss another. The `metro_stop` filter is a vertical value inside a `core` view — arguably a CANON-1 candidate. Bounded grep in the P2/P4 tasks. | P2.2, P4.3 |
| **OQ-4** | Must Control Center's `COUNT FILTER (severity >= 4)` stay meaningful post-repoint? | If yes, `core.observations.severity` must be populated (today the risk job synthesizes `1.0`). Intelligence-semantics decision, already in KNOWN_ISSUES. Flagged by D3 as "flag, don't fold." | P4.1 correctness (not the repoint mechanism) |
| **OQ-5** | Does `public.level3_compliance_mv` depend on `public.level3_logs`? | `level3_compliance_mv` is a separate MV (`pg_state.sql:1877`). P1.2 drops `level3_logs`; must verify the MV does not read it before drop. Cheap dependency check. | P1.2 |
| **OQ-6** | Are `current_state.md` §5.1–5.9 (canonical-write completeness) closed, and is that closure inside 031 or prerequisite Tier work? | **The single largest sequencing dependency in this plan.** P6 (table drops) cannot land until canonical fully covers the clipped tables' facts. If §5.x closure is Tier work, P6 is a 031 fast-follow gated on it. Confirm the issue boundary. | P6 (entire phase) |
| **OQ-7** | Confirm D8 (P2.3) is *only* `withOrgContext` routing, not the DQ-2 fail-closed flip. | DQ-2 (fail-open→fail-closed) is explicitly out of 031 (own issue, with ISSUE-018). P2.3 must route the three handlers through `withOrgContext` **without** changing the global RLS posture, or it pulls out-of-scope work into 031. | P2.3 scope boundary |

-----

## What this sequence deliberately does NOT do

- Does not author migration SQL — each step is dispatched as its own task that
  writes its SQL against this plan.
- Does not pull in the DQ-5 out-of-scope items (MT-1/013, DQ-2 fail-closed,
  Q-E encryption, Q-F/028 audit_reader, MV-2/029 PostGIS, MV-4 condition-state).
- Does not re-open Q-D (evidence atomicity) or Q-G/D7 (`mcp_readonly` revoke) —
  both already landed; they are verified-still-true inside P5, not re-built.
- Does not promote condition-state to canonical (MV-4/DQ-4) — that is the deliberate
  fast-follow pass *after* the clip, with its own focused migration.
- Does not flip the RLS posture (DQ-2) — P2.3 routes three handlers through
  `withOrgContext` for correctness, nothing more.

-----

*Governing sentence, restated: canonical learns no vertical's vocabulary, and core
knows no worker's name — enforced by where data lives and who has grant. Every phase
above is an application of it: P0–P4 remove the vertical vocabulary from `core`;
P2–P3 keep canonical the single derived write direction; P5–P6 remove the worker's
name from every live read surface and, finally, from the database.*
