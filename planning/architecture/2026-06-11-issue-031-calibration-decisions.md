# ISSUE-031 — Calibration Decision Record

> **Type:** Architectural decision record. Captures decisions made in a Claude
> planning session; no code or schema changed here. CLI agents execute against
> this artifact.
> **Date:** 2026-06-11
> **Inputs:** `docs/audit/2026-06-06-transit-adapter-complete-inventory.md` (the
> load-bearing inventory) + its companion
> `2026-06-06-canonical-core-complete-inventory.md`. Every fact below is from the
> live-DB-verified inventories, which **supersede `ADAPTER_BOUNDARY.md`** wherever
> they disagree (see D0).
> **Purpose:** Close the Section-10 calibration questions (Q1, Q2, Q3) and the
> labor-safety surfacing question (the live route-detail leak / Q11) **before**
> the table-by-table classification pass. This record is the calibrated baseline
> the classification stands on.
> **Scope of this record:** decisions only. The classification pass, the new
> adapter shape, and the migration sequence are *not* in this document — they are
> the next session, and they build on these decisions.

-----

## D0 — Trust the live inventory over `ADAPTER_BOUNDARY.md`

`ADAPTER_BOUNDARY.md` §2 lists `route_run_audit` as an adapter table. It exists
in **no schema** and is referenced by **no code** (Q1). Because that document is
demonstrably wrong on at least one table, the two live-verified inventories are
the authoritative source for ISSUE-031, and `ADAPTER_BOUNDARY.md` is treated as
untrusted until reconciled.

**Action:** correct `ADAPTER_BOUNDARY.md` §2 to remove `route_run_audit`
(reconciliation is already partly tracked in
`2026-06-07-adapter-boundary-reconciliation.md` — fold this in).

-----

## The calibration finding (why the clip target is smaller than the table set)

The single most important result of this session: **the live identity-bearing /
work-attribution read surface is far narrower than the adapter table-and-view set
implies.** Three independent facts, all verified:

1. **The intelligence layer is already fully off the work-attribution log tables
   (Q3).** The active `rebuildStopRiskSnapshot()` reads **only**
   `core.observations` + `core.visits` (+ `transit_stops`/`transit_stop_assets`
   for the stop↔asset spine); its identity flag is clean. The legacy reader of
   `level3_logs`/`hazards`/`infrastructure_issues`/`trash_volume_logs` is
   `rebuildStopRiskSnapshotLegacy()` — **exported, no caller, dormant** (annotated
   "Delete once verified"). This migration already happened in Tier 2 (changelog
   2026-05-11). **Mental model to carry forward: the log tables feed nothing in
   intelligence.**
1. **Four of the six `core.v_*_transit` log views are read by nothing (Q2).**
   `v_infra_transit`, `v_level3_logs_transit`, `v_stop_photos_transit`,
   `v_trash_volume_logs_transit` have **zero application readers**. They exist,
   expose a worker column, and are granted to `intelligence_reader` — pure
   grant-surface exposure (ISSUE-030), never an exercised read path.
1. **The two surviving views are read for clean columns only (Q2).** Control
   Center reads `v_clean_logs_transit` for `duration_minutes`/`cleaned_at`/
   `location_id` and `v_hazards_transit` for `reported_at`/`severity`. **Never the
   worker column** in either.

The remaining live identity-bearing reads on the whole adapter are essentially:

- `clean_logs` `SELECT cl.*` (full row incl. `user_id`) → admin/ops clean-logs
  lists → renders on `LeadCompletedRouteDetail.tsx` (**the one UI that visibly
  breaks on a clip**);
- `loadRouteRunById.ts` → the sanctioned assignment-display exception (see D4);
- `stop_photos.created_by_oid` → reaches `PhotoDto` but is **not rendered**.

Everything else is dead payload, grant-only exposure, or compliance/export
(intentionally attributed).

-----

## Decisions

### D1 — `route_run_audit` is a phantom → documentation fix only

No table, no code. Correct `ADAPTER_BOUNDARY.md` (D0). Nothing to migrate.

### D2 — Drop the four unread log views + the dead `level3_logs` table

- **Evict (no readers, no migration, no replacement):**
  `core.v_infra_transit`, `core.v_level3_logs_transit`,
  `core.v_stop_photos_transit`, `core.v_trash_volume_logs_transit`.
- **`public.level3_logs` table:** drop — 0 rows, no writer, read only by the dead
  legacy function.
- Consistent with the locked CANON-1 rule (core contains zero vertical-specific
  names): these are `core.v_*_transit` objects read by nothing, so eviction has
  no cost.
- **`v_stop_location_map` stays for now** — it is used *inside* the surviving
  views; it can only be re-evaluated once those are gone (D3).
- Verification standard for the agent: inverted grep proving zero readers
  (pre-drop), and the drop migration is reversible.

### D3 — Evict both surviving log views; repoint Control Center to canonical

**Decision:** do **not** keep the views with worker columns stripped (that leaves
adapter scaffolding standing and makes labor-safety a property of "the view
happens not to select the worker column" — safety by convention). Instead:

- **Evict** `core.v_clean_logs_transit` and `core.v_hazards_transit`.
- **Repoint** the Control Center `/overview` + `/difficulty` reads to canonical:
  - clean-event count / observed-minutes → `core.visits`
    (`ended_at - started_at`, `outcome='completed'`) + `core.observations`,
    joined by `visit_id`, keyed on `location_id`.
  - hazard counts → `core.observations` filtered to the 8 safety `*_present`
    types (`observed_at`, `severity`).
- **Verified feasible:** canonical inventory §6.3 enumerates the identity-free
  column sets that carry every fact these two views currently surface. The risk
  job already reads the same underlying facts from canonical (D-finding Q3), so
  this stands on proven ground.
- **One caveat to hand the agent:** the risk job synthesizes hazard severity as a
  literal `1.0` rather than reading the `severity` column. If the Control Center's
  `COUNT FILTER (severity>=4)` must remain meaningful, the canonical `severity`
  column has to actually be populated on those observation rows. That is an
  **intelligence-semantics** question (already logged in KNOWN_ISSUES), not a
  blocker for the repoint itself — flag, don't fold.

**Cross-workstream dependency (must not be clobbered):** the Control Center is
*already* being relocated Admin→Dispatch by `T1-CC-control-center-relocation.md`,
which rewrites these exact four handlers (`/overview`, `/routes`, `/exceptions`,
`/difficulty`) and currently declares "no schema changes." The ISSUE-031 repoint
touches the **same handlers**. **Sequencing rule:** the canonical repoint must
land *before or within* the T1-CC extraction, so the handlers move to
`backend/src/modules/ops/controlCenterRoutes.ts` **already reading canonical**.
Doing T1-CC first means extracting handlers that still read the adapter views and
immediately re-editing them. Whichever workstream moves first must own the other's
constraint.

### D4 — The `loadRouteRunById` identity join: sanctioned, with a hard boundary

The double `LEFT JOIN identity_directory` on `assigned_user_oid` / `created_by_oid`
(producing assigned/creator **names + role** on the route header) is the **one
sanctioned identity read** outside compliance/export. It is:

- enumerated in the `identity_directory` table comment as the sole permitted JOIN;
- org-scoped and fail-closed (`withOrgContext`; proven by a two-org test);
- assignment **intent**, not work-attribution truth;
- touched by no intelligence path (verified — risk job, history tables, Control
  Center never join `identity_directory`).

**Blessed — but bounded by the surfacing guardrail below (D5).** The boundary
that keeps it safe is not "names are intent" (too permissive); it is the grain/
adjacency rule in D5. The relevant consequence for this loader: its current
payload returns, in one response, **both** the identity join **and** per-stop rows
with `completed_at`/timing. That single payload is the leak in miniature (name +
per-stop timeline together). The fix is grain-based, not name-based — see D5.

### D5 — Labor-safety surfacing guardrail (the session's core architectural result)

**The problem this closes (and the open inventory question it answers).** Worker
non-attribution is guaranteed at the *schema* layer (no `user_id` in intelligence;
identity isolated in no-grant sidecars). But that guarantee can be defeated at the
*presentation* layer with **no offending query**: a live, route-keyed view that
shows a per-stop service time, on a route with a single known assignee,
re-identifies the worker by adjacency — the human eye performs the join the
database refused to. A data-layer audit comes back clean while the screen leaks.
This also resolves **inventory Q11** ("which completion timing counts as
work-attribution"): per-stop service time *at stop grain on a live single-assignee
surface* is attribution; the same timing at route-aggregate or asset-aggregate
grain is not.

**The seam is grain + timing, not "names vs. no names" and not "state vs. event."**

- *What* happened at a stop is an asset-condition fact and is **safe at any grain**
  — heavy trash, needed scrubbing, biohazard found, tasks performed.
- *How long it took* (time-at-stop) is the **only** field that re-identifies on a
  single-assignee route.

**The guardrail (hard constraint):**

> Live, route-keyed operational surfaces (Control Center, dispatch boards, route
> detail) surface service **time** only as a **route-level aggregate** (route
> pace) — **never per-stop**. Stop-level **drill-down is fully available** and
> shows stop **attributes and actions** (condition, heavy trash, scrubbing
> needed, biohazard found, tasks performed) — but carries **no time-at-stop
> field**. Per-stop service time is surfaced only in **post-day, asset-keyed
> intelligence / reporting views**, framed as aggregation, outlier, and trend
> across visits, where it carries no labor risk (no one in intelligence
> reconstructs a person's shift; the asset's timeline is the de-identified union
> of all visits). Per-stop timing is **always captured and logged** in
> `core.visits` (`started_at`/`ended_at`); this constraint governs **surfacing
> grain and surface, not capture** — the data remains retrievable on legitimate
> demand.
> 
> **Rationale:** *what* happened at a stop is an asset-condition fact, safe at any
> grain; *how long it took* re-identifies the worker on a single-assignee route,
> so it lives only at the route aggregate (live) or asset aggregate (post-day).

**Why this fits operations rather than fighting it.** Operations thinks
route-first ("pull up Eastside, how's it doing"). That mental model is fully
preserved: the route stays the lens. "How's Eastside doing" is answered by stop
condition + exceptions + **route-level pace** — none of which needs a person.
Drill-down into a single stop stays, showing what happened there. Only the
per-stop *duration* moves up (to route pace, live) and out (to asset trend,
post-day). Each surface shows the grain its job actually needs: the dispatcher
wants "is the route on pace," the analyst wants outliers and asset trends —
neither wants a per-person event feed.

**Concrete consequences for the build:**

1. **Control Center / route-detail live views:** route-level aggregate service
   time only. No per-stop service-time row. This is the `loadRouteRunById` payload
   fix (D4): the live route-detail surface drops per-stop `completed_at`/duration
   as a *displayed per-stop field*; the route header may carry the aggregate.
1. **Stop drill-down (live):** stop attributes + actions, yes; time-at-stop, no.
1. **Intelligence / reporting (post-day, asset-keyed):** per-stop times available,
   framed as aggregation/outlier/trend. No change needed — already safe.
1. **Capture unchanged:** `core.visits.started_at`/`ended_at` keep logging
   per-stop timing. Nothing is deleted.

**Enforcement:** promoted to a hard guardrail in `CLAUDE.md § Labor Safety Guardrails` so it binds all future UI specs and agent dispatches. Test for a
builder: *putting a duration or `completed_at`-derived time on a live route or
stop-drill-down view is forbidden; that number belongs at the route aggregate
(live) or asset level (intelligence). Everything else about the stop is fair
game.*

-----

## D6 — Q4 resolved: `transit_stop_assets` is seed/migration/trigger-only

Confirmed against the live DB (`2026-06-11-live-repo-audit.md`): all 14,916 rows
are written by (1) the `sync_transit_stop_primary_asset()` trigger (fires on
`transit_stops.asset_id`) and (2) migration seed. **No TypeScript writer.**

**Impact:** demoting `transit_stop_assets` to an ingestion-time seed (the ADR's
target shape, Q-A/Q-B) needs **no application-writer migration** — only the
trigger + seed path move. The asset-linking classification is unblocked and
lighter than feared. **Ride-along defect (ISSUE-024):** the trigger's `INSERT`
omits the NOT NULL `org_id`, so it would fail *if* any runtime path inserted
`transit_stops` (none does today — latent). Fix it with the trigger rework before
any runtime `transit_stops` insert path is introduced.

## D7 — Q6 locked: revoke `mcp_readonly` to canonical-only, no exemption

Confirmed against live grants (`2026-06-11-live-repo-audit.md`): `mcp_readonly`
is a **LOGIN** role with SELECT on **all four `*_actor_audit` sidecars +
`identity_directory` + every work-attribution log + `route_runs` + the canonical
surface** — i.e. it can resolve any actor reference to a named, emailed worker and
join work-attribution to individuals. `intelligence_reader` (control) has none of
these; the boundary is correct everywhere except this role. Matches ADR Q-G.

**Decision (founder, 2026-06-11):** **revoke to canonical-only. No documented
exemption.** Rationale: safety must be structural, not a defended promise — an
exemption is the documented-trust pattern this product exists to replace.

**Impact:** `mcp_readonly` keeps the canonical / non-identity diagnostic surface;
loses the four sidecars, `identity_directory`, and worker-bearing log tables. The
rare identity-debug case uses the superuser `postgres` connection (already the
audited diagnostic path). Operational cost ≈ zero; auditor story becomes
no-asterisk ("no role reaches worker identity except the audited admin path").
**Status: specified in ADR, NOT yet applied — this is now a ready-to-dispatch
revocation migration.** Verification standard for the agent: post-revoke
`has_table_privilege('mcp_readonly', <each sidecar/identity_directory>, 'SELECT')`
must return **false** for all; canonical reads must still return **true**.

## D8 — Q5 bundled: fix the `transit_stops` bare-pool handlers in the routing-layer work

Three handlers `PATCH /api/stops/:id/{hotspot,compactor,has-trash}`
(`stopRoutes.ts:81/176/271`) run bare `pool.query()` on FORCE-RLS `transit_stops`
→ fail-open (PATTERN-001). Works in single-org pilot, latent multi-org
correctness/safety bug. **Decision:** fix via `withOrgContext` **as part of the
routing-layer reshape** (the redesign touches this table) rather than a standalone
task — avoids touching these handlers twice. Tag as required cleanup in that work
item so it can't be lost.

-----

## What this record does NOT decide (next session)

- The table-by-table classification (cleanly-survives / cleanly-clips /
  redesigns-shape) — now runs against a calibrated, smaller target with **no open
  gates in front of it** (Q4 and Q6 resolved).
- The new adapter shape.
- The migration sequence and prep work.

-----

## Decision summary (for the next session's header)

| ID | Decision                                                                                                                 | Status |
|----|--------------------------------------------------------------------------------------------------------------------------|--------|
| D0 | Live inventories supersede `ADAPTER_BOUNDARY.md`                                                                        | Locked |
| D1 | `route_run_audit` phantom → doc fix only                                                                                 | Locked |
| D2 | Drop 4 unread log views + dead `level3_logs` table                                                                       | Locked |
| D3 | Evict 2 surviving views; repoint Control Center to canonical; sequence with T1-CC                                        | Locked |
| D4 | `loadRouteRunById` identity join sanctioned, bounded by D5                                                               | Locked |
| D5 | Time-at-stop surfacing guardrail (route aggregate live / asset aggregate post-day; capture unchanged) → CLAUDE.md        | Locked |
| D6 | Q4 resolved — `transit_stop_assets` seed/trigger-only; no app-writer migration; fix ISSUE-024 org_id with trigger rework | Locked |
| D7 | Q6 locked — revoke `mcp_readonly` to canonical-only, no exemption; ready-to-dispatch migration                           | Locked |
| D8 | Q5 bundled — fix `transit_stops` bare-pool handlers in routing-layer reshape                                             | Locked |

**All Section-10 calibration gates are now closed. Next session opens directly into the table-by-table classification.**
