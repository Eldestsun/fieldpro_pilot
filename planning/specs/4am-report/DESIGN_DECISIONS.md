# 4am Report — Design Decisions

| Field | Value |
|-------|-------|
| Status | Design (not yet a build spec) |
| Phase | Pre-build — gated on role rename + canonical write-path verification |
| Audience | Dispatch / Chiefs / Superintendents (one distribution list) |
| Last updated | 2026-05-21 |

> This document is a decision record, not a build spec. It captures decisions
> already made about what the 4am Report is, what it isn't, and the labor-safety
> rationale for its structure. A build spec is written only after the role rename
> lands and the canonical observation write path is verified end-to-end (see
> `PLACEMENT_AND_FEASIBILITY.md` for the gating questions).
>
> Role names in this document follow the post-rename convention: **Specialist**
> (field worker, was UL), **Dispatch** (operational leadership, was Lead), and
> **Admin** (back office). Code still carries the old names in many places — that
> migration is its own workstream and not covered here.

---

## 1. Report Purpose & Audience

### One report, one distribution list

The 4am Report is a single daily operational summary, emailed once per day at
the 4am reset boundary, to a single distribution list: **Dispatch, Chiefs, and
Superintendents**. There is not a Dispatch version and a Chief version. There
is one report that all three roles read the same way.

It is an **operational artifact** — a human-readable narrative of the prior
day's truth — not a compliance artifact and not a machine-integration artifact.

### Admins do not depend on this report

Admins receive operational truth through the Admin surface: System Health,
audit logs, and (for the founder / very small set of contributors with
read-only DB access) direct queries. Admins may be added to the distribution
list but they are not the audience the report is designed for.

### What the report drives

The report drives three concrete downstream actions:

1. **Close route-level work orders** — completed routes need their associated
   external work order closed in the EAMS system.
2. **Create work orders for infrastructure issues** — each surfaced
   infrastructure issue is the raw input for a new EAMS work order.
3. **Report safety hazards to Origami** — the organization's safety reporting
   tool. Each surfaced safety hazard is the raw input for an Origami entry.

The report's payload is shaped to make each of these downstream actions
mechanical — the reader should not need to look up additional context to act.

---

## 2. Distinct from Existing Nightly Jobs

The 4am Report is **not** either of the two nightly jobs that already exist.
Stating this explicitly because the three jobs run in the same window and
read overlapping data, and it would be easy to consolidate them into the
wrong thing.

| Job | What it is | What it is not |
|-----|-----------|----------------|
| **SFTP export** (S1-6, `sftpExport.ts`) | Machine-readable compliance evidence — full canonical dump per org, gzipped, SHA-256-checksummed, uploaded over SFTP at 02:00. For TPRA reviewers and downstream data-warehouse integrations. | Not human-readable. Not narrative. Not opinionated about what counts as an exception. |
| **EAM bridge populate** (S1-7, `populateEamBridge.ts`) | Structured write to the EAMS-facing contract table `eam_bridge_route_log` — one row per completed route run with stop and exception counts in a JSONB summary. Read by EAMS (Hexagon) to generate work-order records. | Not a human document. No narrative. No detail beneath the per-stop status. |
| **4am Report** (this spec) | Human-readable narrative for Dispatch / Chiefs / Superintendents, grouped by route, exceptions-only. Drives WO closure, WO creation, and Origami reporting. | Not the contract surface for EAMS. Not compliance evidence. Not machine-shaped. |

The 4am Report and the EAM bridge read from overlapping sources but produce
different artifacts for different consumers. They are intentionally separate
jobs.

---

## 3. Structure — Exceptions-Only Model

> This is the core labor-safety design decision. The report's structure is
> not a UX choice; it is the structural answer to the question
> "what is the smallest set of operational truth a chief needs to act on,
> without making the report a worker shift trace?"

### Grouped by route, roll-up at the route header

The report is grouped by route. Each route shows a roll-up header containing:

- **Route identifier** (pool / run reference)
- **External work-order number** (when available — see open question §9)
- **Status** — `complete` / `partial` / `not started`
- **Counts** —
  - Stops completed *(number only — see §3.2 on what is NOT shown)*
  - Stops skipped for safety
  - Stops spot-checked
  - Total exceptions

### Below the header — exception stops only

Under each route header, the report surfaces **only the exception stops**.
There are four exception categories:

1. Stops with **infrastructure issues** (umbrella: `infrastructure_issue_present`)
2. Stops with **safety hazards** (umbrella: `safety_concern_present`)
3. Stops **skipped for safety** (`stop_not_serviced_due_to_safety`)
4. Stops **spot-checked** (`spot_check`)

**Stops handled normally without incident DO NOT APPEAR in the report at all.**
Their absence is the signal. "Route X had 38 stops completed and 2 exceptions"
means 36 stops were handled safely with no incident — and those 36 do not need
to be enumerated.

A single exception stop that has multiple issues (e.g., a graffiti report
AND a lighting failure) appears **once**, with its issue types grouped
underneath it. A stop is never split across multiple exception lists.

### What is NOT in the report — by deliberate design

- **No per-stop timestamps.** No start time, no end time, no completion time.
- **No visit-order sequencing.** Stops are listed by stop ID or cross-street,
  not by the order the route was executed.
- **No worker identity, no actor reference, no `oid`.** This goes without
  saying — `core.visits.actor_oid` exists at a separate access tier and
  never reaches the report — but it is repeated here so no one is tempted
  to "enrich the report" with it later.
- **Time grain is the day only.** The header shows the date. Per-stop
  detail shows the date the stop was attempted. Nothing more granular.

### Why the structure looks like this

A route listed in visit order with per-stop timestamps is functionally a
worker shift trace, even when no worker name is attached. The route is a
proxy for the assigned worker (one route ≈ one Specialist's day), and
sequential per-stop detail reconstructs surveillance: "Stop 1 at 06:12,
Stop 2 at 06:24, Stop 3 at 06:51 — what happened between 06:24 and 06:51?"

Exceptions-only structure breaks the proxy. Date-only grain breaks the
within-day reconstruction. Together they preserve every action the report
needs to drive — Dispatch still gets the route status they need to close
work orders, and Chiefs still get the hazards they need to act on — without
giving any reader the raw material to build a worker performance profile.

This is the same labor-safety principle that keeps `user_id` off
`stop_effort_history` and `stop_condition_history`. The structural
guarantee is the whole point.

---

## 4. Per-Item Payload

Each exception entry must carry exactly the data needed to mechanically
drive the corresponding downstream action — no more.

### Route work-order closure
- Route identifier
- External work-order number *(when available — see §9 open question)*

### Infrastructure work-order creation
- Cross streets (on-street + cross-street)
- Stop ID
- Infrastructure issue reported (specific observation type, e.g.
  `graffiti_present`, `lighting_failure_present`)
- Date

### Safety hazard reporting (Origami)
- Cross streets
- Stop ID
- Hazard reported (specific observation type, e.g. `encampment_present`,
  `biohazard_present`)
- Date

The observation capture flow was designed to match the existing Origami /
EAMS intake forms. The observation IS the payload — there are no new fields
to invent or compose at report time. The report renders what was captured.

---

## 5. Photos

> The labor-safety guarantee here works in both directions. Workers are
> protected from after-the-fact reconstruction of their day; the
> organization is protected by giving authorized reviewers a documented,
> auditable path to the evidence they legitimately need.

**Photos are NOT in the 4am Report.** Not in the PDF, not in the CSV,
not in the JSON.

**Live access (during the route day):** Finish photos and safety photos
are available via the Control Center drill-down. A dispatcher can see the
photo on a live or just-closed route without filing a request — this is
operational coordination, not historical review.

**Post day-close access (after the 4am reset boundary):** Photos require
**admin-gated, formally-requested, access-logged retrieval**. No casual
after-the-fact "show me all finish photos for Route X." The friction is
the protection — every retrieval generates an audit row and a deliberate
decision by an admin.

**This is a Control Center behavior, not a 4am Report behavior.** It is
documented here only because the post-close transition originates from
this design discussion — see the hand-off note in
`PLACEMENT_AND_FEASIBILITY.md §6`.

---

## 6. Output Formats

Three coordinated outputs from a **single generation run**. The same data
goes through three serializers; the report does not run three times.

| Format | Consumer | Purpose |
|--------|----------|---------|
| **PDF** | Operations (Dispatch / Chiefs / Supts) reading the email | Human reading |
| **CSV** | The BA team dashboards | Tabular consumption |
| **JSON** | Downstream form-fill automation (e.g. Python autofill of Origami / EAMS forms) | Machine consumption |

### JSON forward-compatibility note

The JSON schema should allow `work_order_refs` as a list attachable at the
**route level** (KCM's one-WO-per-route-day pattern) **and/or** the
**stop level**, to accommodate other agencies that use one-WO-per-stop.
This is a forward-compatibility note for the schema shape — it is not an
MVP feature. KCM's MVP will populate only the route-level reference (and
even that is null until the external-WO-number gap is closed — see §9).

---

## 7. Read-Side Source of Truth

### The report reads `core.observations` exclusively

The 4am Report reads from `core.observations`, filtered by `org_id` and
the report date window. No other observation source is read.

- Exception identification:
  - `observation_type = 'safety_concern_present'` → safety umbrella
  - `observation_type = 'infrastructure_issue_present'` → infrastructure umbrella
  - `observation_type = 'stop_not_serviced_due_to_safety'` → skipped-for-safety
  - `observation_type = 'spot_check'` → spot-checked
- Payload detail: the specific child observation types under each umbrella
  become the entry detail
  - Under safety: `encampment_present`, `fire_present`,
    `dangerous_activity_present`, `drug_use_present`, `violence_present`,
    `biohazard_present`, `access_blocked`, `other_safety_concern_present`
  - Under infrastructure: `graffiti_present`, `glass_damage_present`,
    `receptacle_damage_present`, `shelter_panel_damage_present`,
    `lighting_failure_present`, `access_obstructed_by_landscape`,
    `structural_damage_present`, `other_infrastructure_issue_present`

### The report MUST NOT query the legacy tables

The report **does not** query `public.hazards` or
`public.infrastructure_issues`. Those remain as transit-adapter writes
during the migration period (current dual-write reality — see
`PLACEMENT_AND_FEASIBILITY.md §3`) but they are not the source of truth
for the report. Reading them would tie the 4am Report to the transit
vertical and would not generalize to future verticals.

### Precondition — this is only safe once canonical writes are verified

This is the **hard precondition** for building the report. Today, every
infrastructure issue and every safety hazard is written to *both*
`public.{table}` AND `core.observations` — but this is a dual-write,
not a single-write, and the canonical leg is not yet load-bearing for any
downstream contract.

Until the canonical write path for observations is verified end-to-end
for both the complete-stop flow AND the skip-with-hazard flow — and
verified under realistic failure modes, not just the happy path — an
exceptions-only report reading from `core.observations` can silently
miss exceptions if a canonical write fails while the legacy write
succeeds.

**The build is gated on this verification.** See
`PLACEMENT_AND_FEASIBILITY.md §3` for the current state of the dual-write
and the specific verification gaps.

---

## 8. Failure Handling (design intent)

These are design decisions to be implemented in the build spec — they do
not yet exist in code.

### Every send writes an audit row

Each report generation writes an `audit_log` row with `action =
'report.daily_sent'`. The detail payload includes:

- Date window covered
- Recipient count
- Output formats generated (`pdf`, `csv`, `json`)
- Send status (`sent` / `failed` / `partial`)

### Failed sends retry with backoff

Failed deliveries retry with exponential backoff (specific schedule
TBD in the build spec). Final failure after retries exhausted writes
a separate audit row with `status = 'failed_final'`.

### Absence detection lives in System Health

System Health (T2-A7) compares the expected vs. actual most-recent
successful send and alerts if the gap exceeds threshold — design target
~26h, so a normal 24h cycle does not alert and one missed cycle does.

### Partial-data failure does not block the whole report

If the report can be generated for some orgs but not others — or some
exception categories but not others — it sends with what it has and
includes a clearly-labelled **data-quality note** describing what was
missing. The empty / missing section is annotated, not silently dropped.

### Open — failure-alert recipient

Where does the failure alert go? The founder? The full distribution list?
A designated ops contact? This is **TBD**, captured in §9 below.

---

## 9. Scheduling and Hosting

Hosting-agnostic. The report is "the scheduler" — whichever scheduling
surface the deployment environment provides.

| Environment | Likely scheduler |
|-------------|-----------------|
| Render (testing / demos) | Render cron |
| Azure Enterprise (pilot / contract) | Azure-native scheduling — Azure Functions timer trigger or similar |

The implementation choice is deferred to the build spec — `populateEamBridge`
and `sftpExport` already use `pnpm <script>` entries invoked by whatever
external scheduler is configured. The 4am Report will follow that same
pattern.

---

## 10. Open Questions

These are deliberately unresolved here. The build spec will resolve them
when it is written.

| # | Question | Notes |
|---|----------|-------|
| Q1 | Where does the **external (EAMS) work-order number** live in the data model? | Does not currently exist anywhere — see `PLACEMENT_AND_FEASIBILITY.md §4`. The report can render the field as null in MVP, but the empty column should be flagged so reviewers don't read absence as "no work order exists." |
| Q2 | Who receives the **failure-alert** when the report fails to generate or send? | Founder vs. distribution list vs. designated ops contact. TBD. |
| Q3 | Where does the **distribution list** live? | Env var, DB table, or admin-UI-managed? Defer to build spec — likely DB table to allow rotation without a deploy. |
| Q4 | Confirm exact source field for the **spot-check marker**. | Code today emits `observation_type = 'spot_check'` (see `observationService.ts:416`). Confirm this is the only signal — no separate `spot_check = true` column to also read. |
| Q5 | Confirm how **"skipped for safety"** is distinguished from other skip reasons. | Today the skip-with-hazard route writes `outcome = 'skipped'` and `reason_code = hazard_types[0]` on `core.visits`, and also writes `observation_type = 'stop_not_serviced_due_to_safety'`. Confirm there is no other skip path (e.g., "skipped — out of time") that should be treated differently in the report. |

---

## Status — not a build spec yet

This document records design intent. The build of the 4am Report is gated
on:

- Role rename workstream complete (so the role names in copy and routing
  match the codebase)
- Canonical observation write path verified for both the complete-stop and
  skip-with-hazard flows (see `PLACEMENT_AND_FEASIBILITY.md §3`)
- External work-order number model decision (Q1 above) — or an explicit
  decision to ship MVP with that field null

Once those gates are cleared, a follow-on document
`planning/specs/4am-report/BUILD_SPEC.md` translates these decisions into
implementation tasks. This document does not produce a changelog entry —
it is analysis only.
