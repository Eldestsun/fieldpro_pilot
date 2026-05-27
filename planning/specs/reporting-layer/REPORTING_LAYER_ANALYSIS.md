# Reporting Layer — Gap Analysis & MV Roadmap

| Field | Value |
|-------|-------|
| Status | Analysis (no code changes) |
| Last updated | 2026-05-21 |
| Related specs | `planning/specs/4am-report/DESIGN_DECISIONS.md`, `planning/specs/4am-report/PLACEMENT_AND_FEASIBILITY.md` |

> This document records the current state of the materialized view (MV)
> surface, the infrastructure gaps that affect it, a worker identity audit,
> and the roadmap of MVs needed to support both near-term reporting and
> the longer-horizon analyst-forward platform. It is analysis only —
> no code changes are proposed here.
>
> The MV layer is BASELINE's published data contract. Raw `core.*` tables
> are internal truth. Everything a customer, BA, or downstream tool
> queries should reach only the MV/view layer — never the raw tables
> directly. This document defines what that layer should contain.

---

## 1. What the MV Layer Is

The architecture has three tiers:

```
core.* tables                   ← raw operational truth — never exposed externally
        ↓
public.{mv} / reporting views   ← pre-aggregated, clean shape — the published contract
        ↓
API / app backend                ← what end users see via UI
        ↓
BI tool / BA query (future)      ← what analysts query if they need beyond the API
```

End customers never receive SQL access. They receive the UI and API, both of
which read from the MV layer. The "BA ad-hoc query" question only arises
post-pilot, and the answer is: BAs query the MV/reporting layer under a
scoped read-only role — not the raw tables.

This means the MVs are not just a performance optimization. They are the
**customer-facing data contract**. Their completeness determines what any
analyst, dashboard, or downstream tool can see about operational truth.

---

## 2. Current MV Inventory

As of 2026-05-21, five active materialized views exist. All five are in the
`public` schema. All five join `stop_risk_snapshot` with `stops_legacy` and
are oriented around **per-stop, point-in-time risk scoring**.

| MV | What it answers | Key columns |
|----|----------------|-------------|
| `cleanliness_risk_mv` | Which stops are at cleanliness risk right now? | `cleanliness_score`, `l3_aging_bucket`, `is_overdue_30d`, `combined_risk_score` |
| `safety_risk_mv` | Which stops have recent hazard exposure? | `safety_score`, `hazard_aging_bucket`, `last_hazard_severity`, `has_recent_hazard` |
| `infrastructure_risk_mv` | Which stops have infrastructure scoring issues? | `infrastructure_score`, `infra_issue_score`, `combined_risk_score` |
| `level3_compliance_mv` | Which stops are overdue for a Level 3 clean? | `days_since_last_l3`, `is_overdue_30d`, `l3_urgency_weight` |
| `stop_status_mv` | Comprehensive per-stop operational status (master MV) | All of the above plus `visits_30d`, `hazards_30d`, `last_visit_at`, `last_pad_scrub_at` |

Two export views sit on top:

| View | Built from | Purpose |
|------|-----------|---------|
| `export_stop_status_v1` | `stop_status_mv` | Column-projected, export-friendly alias of the master MV |
| `export_pool_daily_summary_v1` | `stop_status_mv` | Pool-level aggregation: total stops, overdue count, avg scores |

### What this surface covers well

"Which stops are most at risk right now?" — this is well served. The risk
scoring is decomposed (cleanliness / safety / infrastructure / combined),
indexed for efficient pool-scoped queries, and available at the stop and
pool levels.

### What this surface cannot answer

| Operational question | Current coverage |
|---------------------|-----------------|
| Did my crews actually cover everything last shift? | None |
| How did last night's route run compare to the planned route? | None |
| Are my pools getting better or worse over time? | None — all MVs are point-in-time |
| What infrastructure issues are currently open and how old are they? | None — only a score, not a backlog |
| Which stops have gone unvisited for 30+ days? | Partial — `stop_status_mv` has `days_since_last_visit` but no trend |
| What is the visit cadence for a specific stop over the past 90 days? | None |

The current surface answers the state question. It does not answer the
trend question, the completeness question, or the operational narrative
question. All three are required by the 4am Report and by any analyst
visualization surface.

---

## 3. Critical Infrastructure Gap — No Refresh Mechanism

**The MVs are frozen.** This is the most important finding in this document.

### What was found

- The only `REFRESH MATERIALIZED VIEW` calls in the entire codebase are in
  `backend/migrations/legacy_20251207_mv_v1.sql` — a legacy migration file.
  They ran once at schema initialization and never again.
- No pg_cron extension is installed in the database.
- No systemd timers, no cron jobs, no scheduled job infrastructure of any kind.
- The admin endpoint `POST /admin/intelligence/rebuild-risk-map` and the
  CLI utility `riskMapJob.ts` both call `rebuildStopRiskSnapshot()` —
  which rebuilds the `stop_risk_snapshot` table the MVs read from — but
  **do not issue `REFRESH MATERIALIZED VIEW`**. Updating the base table
  does not update MVs that were materialized from it. MVs are static
  snapshots; they require an explicit `REFRESH` call.
- The SFTP export script (`sftpExport.ts`) explicitly defers scheduling to
  Sprint 3 (S3-1). No external scheduler has been configured on any
  deployment target.

### Consequence

Every query against the current MVs returns **initialization-time data**.
The stop risk scores, overdue flags, cleanliness scores, and safety ratings
visible to the UI are the state of the data at the moment the migration ran —
not current operational truth.

### What needs to happen

The `rebuildStopRiskSnapshot` call path (whether triggered via admin
endpoint or CLI) must be extended to also issue `REFRESH MATERIALIZED VIEW`
on every MV that reads from `stop_risk_snapshot`. The five current MVs
all qualify.

The refresh itself is fast for pilot-scale data. The infrastructure
decision — pg_cron vs. external cron (Render cron, Azure timer, etc.) —
should be made in the build spec that closes this gap. `PLACEMENT_AND_FEASIBILITY.md §9`
documents the scheduling approach for the 4am Report's related nightly jobs;
MV refresh should be coordinated with that scheduling surface, not
invented separately.

This gap is a **pre-condition for any reporting surface** — the 4am Report,
the analyst views, and the existing UI risk map are all reading stale data
until it is closed.

---

## 4. Worker Identity Audit

### Finding: current MV surface is clean

All five active MVs and their two export views contain **no worker
identifier in any form** — not a raw user_id, not a hashed ID, not a
pseudonymous token. Verified by column-level inspection of each MV
definition and the `stop_risk_snapshot` base table.

The `workforce_equity_mv` — which did carry `user_id` alongside
performance metrics (`total_stops`, `total_minutes`, `difficulty_score`)
— was explicitly dropped via
`legacy_20260508_replace_surveillance_tables.sql`, along with its
source table `workforce_metrics`. This was a deliberate removal, not
drift.

The labor protection claim holds: **the MV/reporting layer does not
expose worker identity in any form, including pseudonymous form.**

### Forward discipline — required for all new MVs

The source tables that new MVs will read from (`route_runs`,
`route_run_stops`, `core.visits`, `core.observations`) do carry
`user_id` or equivalent actor references. When new MVs are built,
the following rule applies without exception:

**Never include a worker identifier — not raw, not hashed, not salted
— in any reporting MV. Aggregate at pool or route level.**

A hashed `user_id` grouped over performance metrics (stops completed,
time on route, incidents per shift) is still a worker comparison surface.
Pseudonymization does not change the analytical structure; it only
obscures the name. The structural guarantee — no per-worker grouping
in the reporting layer — is the whole point.

The `workforce_equity_mv` was removed because it violated this
structurally. New MVs must not reintroduce the same structure
under different column names.

### What "aggregate to pool or route level" means in practice

- A `pool_shift_summary_mv` that shows stops visited, L3s completed,
  and exceptions per pool per shift is acceptable — it reflects the
  state of the stop pool, not the output of any individual.
- A `route_run_summary_mv` that shows planned vs. actual completion
  for a given route run is acceptable — a route run maps to a plan,
  not to a worker (even if one worker executed it).
- A query that groups either of the above by `user_id` (or any
  worker-linked column) to produce per-worker rates is not acceptable
  in the MV layer. That analysis, if it is ever needed for scheduling
  or equity purposes, lives in a restricted internal table — not a
  reporting MV.

---

## 5. MV Buildout Roadmap

The following MVs are proposed in priority order. Priority is determined
by: (a) whether the 4am Report requires them, (b) whether they answer
questions customers ask every day, and (c) build complexity.

### Tier 1 — Required for the 4am Report

#### `pool_shift_summary_mv`

Answers: did my crews actually cover what was planned, and what
exceptions surfaced, per pool per shift period?

| Column | Source |
|--------|--------|
| `pool_id` | `route_runs.route_pool_id` |
| `run_date` | `route_runs.run_date` |
| `runs_total` | COUNT of route_runs for this pool + date |
| `runs_complete` / `runs_partial` / `runs_not_started` | Derived from `route_runs.status` |
| `stops_planned` | COUNT of `route_run_stops` entries |
| `stops_completed` | COUNT where `route_run_stops.status = 'done'` |
| `stops_skipped_safety` | COUNT where `status = 'skipped'` AND matched `stop_not_serviced_due_to_safety` observation |
| `stops_spot_checked` | COUNT of stops with a `spot_check` observation |
| `exceptions_total` | COUNT of unique stops with any exception observation |
| `l3s_completed` | COUNT of stops where a Level 3 clean was performed that day |
| `hazards_reported` | COUNT of `safety_concern_present` observations |
| `infra_issues_reported` | COUNT of `infrastructure_issue_present` observations |
| `as_of` | `now()` at refresh time |

**Labor safety note:** No worker identifier. This MV reflects the
aggregate state of the pool's stop coverage for the shift — not the
output of any individual worker.

---

#### `route_run_summary_mv`

Answers: for each route run, how did execution compare to the plan?

| Column | Source |
|--------|--------|
| `route_run_id` | `route_runs.id` |
| `route_pool_id` | `route_runs.route_pool_id` |
| `run_date` | `route_runs.run_date` |
| `status` | `route_runs.status` |
| `stops_planned` | COUNT from `route_run_stops` |
| `stops_completed` | COUNT where `status = 'done'` |
| `stops_skipped` | COUNT where `status = 'skipped'` |
| `completion_rate` | `stops_completed / stops_planned` |
| `exceptions_count` | Unique stops with any exception observation |
| `l3_count` | Level 3 cleans performed on this run |
| `hazard_count` | Safety hazard observations on this run |
| `infra_count` | Infrastructure issue observations on this run |
| `as_of` | `now()` at refresh time |

**Labor safety note:** Route run is a plan entity — it maps to a
route assignment, not a worker identity. No `user_id` or worker
reference included.

---

### Tier 2 — Compliance & Trend Intelligence

#### `pool_compliance_trend_mv`

Answers: are my pools getting better or worse over time?

Rolling windows (7d / 14d / 30d) per pool:

| Column | Source |
|--------|--------|
| `pool_id` | Aggregated dimension |
| `window_days` | 7, 14, or 30 (one row per pool per window) |
| `as_of_date` | Report date |
| `pct_stops_visited` | stops visited / total stops in pool |
| `pct_stops_overdue_l3` | stops where days_since_last_l3 > 30 |
| `avg_cleanliness_score` | Pool average from `stop_risk_snapshot` |
| `avg_combined_risk` | Pool average |
| `hazard_count` | Total hazards reported in window |
| `infra_count` | Total infra issues reported in window |
| `l3_completion_rate` | L3s completed / stops requiring L3 in window |

This MV enables the "trend line" that makes a renewal conversation
factual rather than anecdotal. "Your pool's L3 completion rate
improved from 71% to 89% over the pilot" is a row from this MV.

---

#### `infrastructure_backlog_mv`

Answers: what infrastructure issues are currently open, how old are
they, and how are they distributed across the pool?

| Column | Source |
|--------|--------|
| `pool_id` | Aggregated dimension |
| `stop_id` | Per-stop row |
| `issue_type` | The specific observation type (e.g., `graffiti_present`) |
| `first_reported_at` | Earliest `core.observations.created_at` for this issue at this stop |
| `days_open` | `NOW() - first_reported_at` |
| `age_bucket` | '0-7', '8-14', '15-30', '30+' (matches existing aging convention) |
| `last_reported_at` | Most recent observation of the same type at this stop |
| `times_reported` | COUNT of observations of this type at this stop |

**Important:** "Open" means reported but not resolved via a
confirmed infrastructure repair observation. The resolution signal
(a clean sweep visit after the issue was reported, or an explicit
infrastructure-resolved observation type) needs to be confirmed
against the current observation type set before building this MV.
This is an open question for the build spec.

The current `infrastructure_risk_mv` surfaces a score. This MV
surfaces the **actual backlog** — the list of open issues, their
age, and their recurrence. These serve different audiences: the risk
score drives prioritization, the backlog drives work order creation.

---

### Tier 3 — Stop-Level Historical Depth

#### `stop_visit_history_mv`

Answers: what is the visit pattern for a specific stop over the
past 90 days?

| Column | Source |
|--------|--------|
| `stop_id` | Dimension |
| `pool_id` | From stop attributes |
| `trailing_days` | 30 or 90 (one row per stop per window) |
| `visit_count` | Number of visits in window |
| `l3_count` | Level 3 cleans in window |
| `hazard_count` | Hazards reported in window |
| `infra_count` | Infrastructure issues in window |
| `days_since_last_visit` | From current `stop_status_mv` |
| `days_since_last_l3` | From current `stop_status_mv` |
| `visit_frequency_bucket` | 'weekly', 'biweekly', 'monthly', 'infrequent', 'never' |

The existing `stop_status_mv` already carries `days_since_last_visit`
and `visits_30d`. This MV extends that into a 90-day window and adds
the pattern classification — enabling findings like "this stop was
visited weekly for two months, then dropped off the schedule entirely
six weeks ago."

---

## 6. Analyst-Forward Platform Vision

The MV roadmap above is the foundation for a broader platform evolution.

BASELINE's current trajectory is tool → platform. The distinction:

- **Tool**: surfaces pre-defined reports and dashboards to a fixed
  set of views. Customers consume what was built for them.
- **Platform**: exposes a curated data surface that analysts can
  query, slice, and compose. Customers build on top of what is
  provided.

The MV layer is the enabling condition for the platform direction.
When the MVs in §5 exist and refresh reliably, the reporting surface
answers the questions above directly. But it also becomes queryable
by a BA-facing BI tool (Metabase, Redash, etc.) pointed at a
read-only replica — without any additional engineering.

### What analyst-forward looks like in practice

A Business Analyst at the customer org is given read-only access
to the `reporting.*` schema on a read replica (or the equivalent
scoped Metabase connection). They can:

- Query `pool_compliance_trend_mv` to build a rolling compliance
  chart for their operations review
- Query `infrastructure_backlog_mv` filtered by `age_bucket = '30+'`
  to find issues that have never been addressed
- Query `route_run_summary_mv` to understand which routes consistently
  underperform on completion rate — and feed that into their scheduling
  decisions (without knowing anything about individual workers)
- Compose a custom view that joins `pool_shift_summary_mv` with
  `stop_status_mv` on `pool_id` to correlate shift coverage with
  current risk state

None of this requires new API endpoints or new UI surfaces — it
requires MVs that answer the right questions, refreshed reliably,
exposed via a scoped read-only role.

### The data access model for BA query access

- BAs query only the MV/reporting layer — never `core.*` or
  `public.{legacy_tables}` directly
- Their Postgres role is scoped to `SELECT` on `reporting.*` only
  (or equivalent schema containing the MVs and export views)
- Their role **bypasses RLS** for the reporting schema, since BAs
  need cross-stop visibility within their org — but is **org-scoped
  at the connection level** via a connection string or Metabase
  data source configured per org
- Every BA query is logged by the BI tool's query history — no
  additional audit infrastructure needed at the DB layer
- This is a post-pilot capability, blocked on the MV buildout in §5
  and on the MV refresh infrastructure in §3

### What this requires of new MVs going forward

Every MV added to the reporting layer must be designed with the
analyst access model in mind:

1. **The column names are part of the contract.** Choose names that
   are self-explanatory without schema context — BAs will see them
   directly in their query tool.
2. **No worker identifiers, ever.** See §4. This is non-negotiable
   for BA-accessible MVs.
3. **Document what each MV answers** — not just what it contains.
   A BA looking at 8 MVs in Metabase needs to know which one to
   start from.
4. **Keep refresh semantics explicit.** Each MV definition should
   note its expected refresh cadence and whether it is point-in-time
   or windowed. Stale data in a BI tool is worse than no data because
   the staleness is invisible.

---

## 7. Open Questions

| # | Question | Notes |
|---|----------|-------|
| Q1 | What is the resolution signal for `infrastructure_backlog_mv`? | A confirmed infrastructure repair observation type? Or inferred from absence of recurrence after a period? This needs to be resolved against the current `core.observations` type set before building the backlog MV. |
| Q2 | Where does MV refresh land in the scheduling infrastructure? | Should be coordinated with the 4am Report scheduling decision (`PLACEMENT_AND_FEASIBILITY.md §9`) rather than invented separately. pg_cron vs. external cron affects what environment supports it. |
| Q3 | Should the MV layer live in a separate `reporting` schema? | Currently all MVs are in `public`. A dedicated `reporting` schema makes the BA access model cleaner — scope the read-only role to `reporting.*` and the raw tables are structurally inaccessible rather than requiring explicit grant denials. Worth deciding before adding more MVs. |
| Q4 | What is the staleness tolerance for each MV tier? | Shift summary needs to be current by the 4am report run. Trend MVs (30d windows) can tolerate daily refresh. Stop history likely daily. The refresh schedule should match each MV's consumer cadence. |
| Q5 | Does the pilot BA need cross-org visibility or org-scoped only? | If the founder acts as BA across all orgs, they need a superuser or bypassrls role. If BAs are per-org, they can be org-scoped. Both are achievable — the answer determines the role design. |

---

## 8. Dependencies and Sequencing

This document does not propose build tasks. The following sequencing
observations are recorded for whoever writes the build specs:

1. **MV refresh wiring** (§3) must land before any reporting surface
   is trusted. It is a pre-condition for the 4am Report, the
   analyst-forward views, and the existing UI risk map.

2. **`pool_shift_summary_mv` and `route_run_summary_mv`** (§5 Tier 1)
   are pre-conditions for the 4am Report build spec (`DESIGN_DECISIONS.md`
   §7 — the report reads from `core.observations` and `route_runs`, but
   the aggregation logic it needs is exactly what these MVs pre-compute).

3. **Skip-with-hazard post-commit gap** (documented in
   `PLACEMENT_AND_FEASIBILITY.md §3`) must be closed before the 4am
   Report reads exclusively from `core.observations`. This is independent
   of the MV buildout but is a peer pre-condition.

4. **`pool_compliance_trend_mv`** (§5 Tier 2) is the primary analyst
   output for renewal conversations. It should follow the shift summary
   MVs, not precede them.

5. **Schema question (Q3 above)** — `public` vs. `reporting` schema for
   MVs — should be decided before the Tier 2 MVs are built. Retrofitting
   a schema rename across 7+ MVs after the fact is migration overhead.

---

This document is analysis only. No code, schema, or migration changes.
No changelog entry required.
