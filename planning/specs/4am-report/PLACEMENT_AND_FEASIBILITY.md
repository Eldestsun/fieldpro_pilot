# 4am Report — Placement & Feasibility Report

| Field | Value |
|-------|-------|
| Status | Investigation report (no code changes) |
| Companion doc | `DESIGN_DECISIONS.md` |
| Last updated | 2026-05-21 |

> This document answers concrete placement and feasibility questions for a
> future 4am Report build. It investigates code; it does not change code.
> Where claims reference code, line numbers are provided. Where the
> investigation surfaces a blocker, the blocker is named — it is not
> worked around.

---

## 1. Module Placement

### Confirm — `backend/src/scripts/` is the right home

Verified. The two existing nightly jobs already live there:

- `backend/src/scripts/populateEamBridge.ts` (S1-7 EAM bridge populate)
- `backend/src/scripts/sftpExport.ts` (S1-6 SFTP export writer)

Both are invoked via `pnpm <script>` entries in `backend/package.json`
(`eam-bridge:populate`, `sftp:export`). External scheduling — cron on
Render, Azure-native scheduling for pilot — invokes those `pnpm` entries.
The 4am Report follows the same convention.

There is no parallel "scheduled-jobs" directory and no separate job-runner
abstraction. The pattern is: one script per scheduled job, registered in
`backend/package.json`. The 4am Report should add one new entry, e.g.
`pnpm report:daily`.

### Proposed directory layout

A multi-format generator + delivery pipeline benefits from being slightly
more structured than the two existing scripts (each of which is a single
file). Proposal:

```
backend/src/scripts/
  dailyReport.ts                  ← entry point + scheduler glue
  dailyReport/
    queries.ts                    ← all reads from core.observations + transit_stops
    composer.ts                   ← shape route → exceptions structure
    renderers/
      pdf.ts                      ← PDF renderer
      csv.ts                      ← CSV renderer
      json.ts                     ← JSON renderer
    deliver.ts                    ← email send + retry + audit_log write
```

This keeps the entry point script discoverable in the same place as
`populateEamBridge.ts` and `sftpExport.ts`, while letting the renderers
be tested in isolation.

### What libraries are NOT in `backend/package.json` today

Verified at `backend/package.json:20–37`. Current production deps:
`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `axios`, `cors`,
`dotenv`, `express`, `express-session`, `jsonwebtoken`, `jwks-rsa`,
`multer`, `passport`, `pg`, `ssh2-sftp-client`, `uuid`.

**No PDF library.** Not `pdfkit`, not `puppeteer`, not `@react-pdf/renderer`.
The build will need to add one.

**No email library.** Not `nodemailer`, not `@sendgrid/mail`, not
`@azure/communication-email`. The build will need to add one. The choice
should track the hosting decision (Render → SMTP via SendGrid/Mailgun;
Azure Enterprise → likely `@azure/communication-email`).

**No CSV library required** — the existing `sftpExport.ts` rolls its own
`toCsv()` helper, suitable to copy/adapt.

This document does not propose libraries — that decision is part of the
build spec. It only flags that two new dependency families are needed,
both of which carry security and compliance implications (email
deliverability auth, PDF rendering memory/CPU) that should be discussed
explicitly when the build spec is written.

---

## 2. Read-Side Data Map

The exceptions-only structure the report needs maps to the following
columns. Every read goes through `withOrgContext(orgId, …)` per the
RLS Context Gotcha in `CLAUDE.md`.

### Route header — route status and counts

| Field | Source |
|-------|--------|
| Route identifier | `route_runs.id`, `route_runs.route_pool_id` |
| Run date | `route_runs.run_date` |
| Status (complete / partial / not started) | Derived from `route_runs.status` (`planned` / `in_progress` / `completed` / `…`) — confirm exact set in build spec |
| Stops completed (count, number only) | `COUNT(*) FROM route_run_stops WHERE route_run_id = $1 AND status = 'done'` |
| Stops skipped for safety (count) | `COUNT(*) FROM route_run_stops rrs JOIN core.visits v ON v.client_visit_id = uuidv5('route-run-stop:'||rrs.id::text, ns) WHERE rrs.route_run_id = $1 AND v.outcome = 'skipped'` — or via the observation `stop_not_serviced_due_to_safety` |
| Stops spot-checked (count) | `COUNT(DISTINCT v.id) FROM core.visits v JOIN core.observations o ON o.visit_id = v.id WHERE … AND o.observation_type = 'spot_check'` |
| Exception count | `COUNT(*)` of exception entries surfaced under the route (sum of the four categories, de-duplicated by stop) |
| External work-order number | **No source — see §4** |

`route_run_stops.status` is constrained to `pending / in_progress / done /
skipped` (see `pg_state.sql:746`). That gives a clean way to count the
"completed" bucket without needing a join into canonical state.

### Exception entries — the four categories

All four are derived from `core.observations` filtered to the report date
window. The umbrella + specific types are the design contract (see
`DESIGN_DECISIONS.md §7`).

```sql
-- Sketch — actual query goes in dailyReport/queries.ts
SELECT
  v.id            AS visit_id,
  v.location_id,
  v.primary_asset_id,
  rrs.stop_id,
  rrs.route_run_id,
  o.observation_type,
  o.payload,
  o.severity,
  o.created_at::date AS report_date
FROM core.observations o
JOIN core.visits v   ON v.id = o.visit_id
JOIN route_run_stops rrs ON rrs.id IN (
  -- derive from v.route_run_stop_id once Tier 5 bridge column is wired everywhere,
  -- else use client_visit_id derivation — see ADAPTER_BOUNDARY.md §3 Path E vs D
)
WHERE o.org_id = $1
  AND o.created_at >= $window_start
  AND o.created_at <  $window_end
  AND o.observation_type IN (
    'safety_concern_present',
    'infrastructure_issue_present',
    'stop_not_serviced_due_to_safety',
    'spot_check',
    -- plus the specific child types
    'encampment_present','fire_present','dangerous_activity_present',
    'drug_use_present','violence_present','biohazard_present',
    'access_blocked','other_safety_concern_present',
    'graffiti_present','glass_damage_present','receptacle_damage_present',
    'shelter_panel_damage_present','lighting_failure_present',
    'access_obstructed_by_landscape','structural_damage_present',
    'other_infrastructure_issue_present'
  );
```

The composer (`dailyReport/composer.ts`) folds these rows into one entry
per `(stop_id, visit_id)` with all issue types grouped underneath —
matching the design contract that a stop never appears in more than one
exception list (`DESIGN_DECISIONS.md §3`).

### Cross streets — found, but field-name nuance

Verified at `pg_state.sql:2198–2222`. The columns live on
`public.transit_stops`:

| Column | Notes |
|--------|-------|
| `on_street_name` | The street the stop is on |
| `hastus_cross_street_name` | The cross street, as named by the HASTUS source system |
| `intersection_loc` | An additional location descriptor |

The view `public.stops` (`pg_state.sql:2231–2253`) re-exposes these. Both
are reliably populated for KCM transit stops — the seeder uses this data.

The report's "cross streets" string should likely be
`"{on_street_name} & {hastus_cross_street_name}"` with a fallback to
`intersection_loc` when either is null.

**Vertical note**: these columns are transit-vertical. For the MVP this is
fine — KCM is transit-only — but the report will need a location-label
abstraction once a second vertical is onboarded (parks, facilities). The
canonical `core.locations.label` column exists (referenced in
`core.v_locations_transit`, `ADAPTER_BOUNDARY.md §2b`) and is the
forward-looking home for this.

### Spot-check marker — confirmed

The spot-check signal is emitted exclusively as
`core.observations.observation_type = 'spot_check'`. Verified at:

- `observationService.ts:397–420` (`emitSpotCheckObservation`) — the only
  writer
- `observationService.ts:416` — the literal `'spot_check'` value
- `loadRouteRunById.ts:88` — reads it as `o.observation_type = 'spot_check'`
- `cleanLogService.ts:84–93` — the call site, gated on
  `data.spotCheck === true`

There is no separate `route_run_stops.spot_check` column or analogous
boolean flag. The observation row is the only signal.

### Skip-reason representation — confirmed, with one cross-check

Skipped-for-safety is recorded on the canonical side at two layers:

1. `core.visits.outcome = 'skipped'`, `reason_code = hazard_types[0]`
   (see `visitService.ts:160–185` + `routeRunStopRoutes.ts:251–255`).
   Note that `reason_code` is the first hazard type, not the literal
   string `"safety"` — so "skipped for safety" is best identified by
   the observation, not the reason_code value.
2. `core.observations.observation_type =
   'stop_not_serviced_due_to_safety'` (emitted by `observationService.ts:
   239–244` whenever `uiPayload.skipForSafety` is true).

`route_run_stops.status = 'skipped'` is also set
(`routeRunStopRoutes.ts:234–242`). All three are written from the same
endpoint in the same flow.

**No other skip paths exist today.** A "skipped — out of time" or
"skipped — couldn't access" code path is not present. If one is added
in future, it must produce a *different* observation type (not
`stop_not_serviced_due_to_safety`) so the 4am Report does not
misclassify it.

---

## 3. Dual-Write / Canonical Completeness Assessment

> This is the section that determines whether the 4am Report can be
> built. The TL;DR: the canonical write path exists and is exercised on
> every flow, but the **skip-with-hazard** flow writes observations
> *post-commit on a separate connection*, which is the §5.7 gap from
> `current_state.md`. Until that gap is closed (or proven to be
> reliable in practice), an exceptions-only report reading exclusively
> from `core.observations` will under-count safety skips on rare
> failure modes.

### Current dual-write reality

#### Infrastructure issues

There is only one copy of `infrastructureIssueService.ts` —
`backend/src/domains/routeRunStop/infrastructureIssueService.ts`. No
parallel `backend/src/services/infrastructureIssueService.ts` exists today
(verified with `find … -name infrastructureIssueService*`). If a parallel
service ever existed, it has been collapsed into the domains-folder copy.

**What it writes to:** `public.infrastructure_issues` (legacy table, lines
49–67 of the service file). It does NOT write to `core.observations`.

**Where the canonical observation write happens:** in
`cleanLogService.completeStop()`, after the legacy write, inside the same
transaction. Specifically:

- `cleanLogService.ts:112–120` calls
  `createInfrastructureIssuesForRouteRunStop(client, …)` — legacy write
- `cleanLogService.ts:144–168` builds a `uiPayload` containing
  `infrastructureIssues` and calls `emitObservationsForStop({ phase:
  'submit', client, … })` — canonical write, same client, same transaction

**Net for the complete-stop happy path:** both writes happen
transactionally, atomic together. If observation emission fails, the
whole transaction rolls back and neither write lands.

#### Safety hazards

Same single-file pattern:
`backend/src/domains/routeRunStop/hazardService.ts`. No parallel copy in
`backend/src/services/`.

**What it writes to:** `public.hazards` (legacy table, lines 59–75 of
the service file). It does NOT write to `core.observations`.

**Where the canonical observation write happens — depends on the flow:**

- **Complete-stop with hazard** (`routeRunStopRoutes.ts:484–542`): the
  hazard write is inside the same transaction as the clean log write,
  and `completeStop()`'s post-clean-log call to `emitObservationsForStop`
  with `client` is also inside the same transaction. Both writes are
  atomic. Same guarantee as infrastructure.
- **Skip-with-hazard** (`routeRunStopRoutes.ts:218–278`): the hazard
  write and `closeVisitForRouteRunStop` are inside a transaction
  (`BEGIN` at line 219, `COMMIT` at line 257). The observation
  emit at lines 270–278 happens **after the COMMIT**, **with no
  `client` parameter passed** — meaning `emitObservationsForStop`
  takes a fresh pool connection via `withOrgContext` and runs in its
  own short transaction.

**This is the `current_state.md §5.7` gap.** If the post-commit
observation write fails (connection drop, RLS context missing, pool
exhausted), the hazard is recorded in `public.hazards` and the visit
is closed in `core.visits`, but no row appears in `core.observations`.
A report reading exclusively from `core.observations` will not see
that exception.

### Does every infrastructure issue and every safety hazard reach `core.observations` today?

- **Infrastructure issues — yes**, via the complete-stop path, atomic in
  one transaction.
- **Safety hazards reported alongside a normal completion — yes**, atomic
  in one transaction.
- **Safety hazards that cause a skip — yes on the happy path, but no
  transactional guarantee.** The §5.7 post-commit pattern means a
  silent gap is possible under failure.

For the 4am Report's labor-safety design, this matters. The report's
selling point is "exceptions surface so they can be acted on." If a
skip-with-hazard silently misses, a safety hazard that field workers
reported will not appear in the report and will not be filed to Origami.

### Cross-reference — Tier 1 / Tier 2 status

Per `planning/REFACTOR_INDEX.md` (verified, last updated 2026-05-13):

- **Tier 1 — Canonical Completeness — 🟢 Done.**
- **Tier 2 — Intelligence Migration — 🟢 Done.**

Tier 1's done-criteria include writing canonical state from every
completed and skipped stop. The §5.7 post-commit pattern is documented in
`current_state.md` as a residual concern even after Tier 1 — it was not
required to be moved inside the transaction as part of Tier 1's
done-criteria.

### What the build spec should require before unblocking

1. Move the skip-with-hazard `emitObservationsForStop` call inside the
   `BEGIN`/`COMMIT` transaction (consistent with the complete-stop
   pattern), OR
2. Add a reliable post-commit retry mechanism (outbox + retry loop),
   AND
3. Add an integration test that proves: when the post-commit observation
   emit fails, the system detects and recovers it before the next 4am
   report runs.

Either (1) — which is simpler and matches the §5.7 recommended fix — or
(2). Until one of these lands, the 4am Report build is blocked. The §5.7
gap predates this report; closing it is a refactor, not a 4am-report task,
and should be tracked in `planning/refactor/` or `planning/refinement/`.

---

## 4. External Work-Order Number Gap

### No field exists today

Searched `backend/src/` and `pg_state.sql` for any of: `external_wo`,
`eams_wo`, `wo_number`, "EAMS work-order" — **no column, no service, no
write path**. Confirmed.

The closest the schema gets to an EAMS handle is
`eam_bridge_route_log.route_run_id` (the BASELINE-side ID, which EAMS
then maps to its own work order) and `eam_bridge_route_log.canonical_summary`
(JSONB — could conceivably carry a WO number if added). Neither holds an
EAMS-side identifier today.

### Implications

- The 4am Report can render the external WO column as null in MVP. The
  empty field needs to be visibly labelled — readers should not interpret
  absence as "no WO exists." It exists in EAMS; BASELINE just doesn't
  know its number yet.
- Closing the gap is **not a 4am-report task.** It is a data-model
  change that touches:
  - Route creation flow (where the WO number is captured — likely
    Dispatch input at route creation time, or an EAMS-side mapping
    fed back via the bridge contract)
  - The `eam_bridge_route_log` contract surface — per the S1-7
    changelog, any column change there requires coordination with
    KCM IT / the EAMS (Hexagon) team before deployment
- Recommend the build spec calls out this as the single field that the
  report would benefit from but explicitly does not block on.

---

## 5. System Health Hand-Off

### Where the "last report sent at / status" surface would read from

`public.audit_log` (see `pg_state.sql:1285–1306`). The intended pattern
matches S1-7's `admin.eam_bridge_populate` audit row (see
`populateEamBridge.ts:121–132`) — every report run writes one row with:

```
action      = 'report.daily_sent'
actor_oid   = SYSTEM_ACTOR_OID
detail      = { run_at, status, window_start, window_end, recipient_count,
                formats: ['pdf','csv','json'] }
```

System Health surfaces "last successful run" by selecting
`MAX(occurred_at) WHERE action = 'report.daily_sent' AND detail->>'status'
= 'sent'`, and computes "hours since last send" client-side.

### Does the System Health page exist yet?

**No, only planned.** Verified in
`planning/capability-build/CAPABILITY_BUILD_INDEX.md` and
`planning/capability-build/specs/T2-A7-system-health-page.md`:

- T2-A7 status: **🔴 Not started**
- Depends on: **role rename complete in code**
- Scope (per the spec): adds `GET /api/admin/health` aggregation endpoint
  plus a new page; expands on the existing 4-counter `AdminDashboard.tsx`

The 4am Report's "last sent / status" surfacing is **a cross-session
dependency**, not a build dependency. The Report can ship and write its
audit rows even before T2-A7 exists — System Health will just not yet
have a panel for them. When T2-A7 is built, it adds a panel that reads
the same audit rows the Report has been writing all along.

**Do not bundle a System Health surface into the 4am Report build.** Note
the audit-row contract clearly so T2-A7 can consume it, and stop there.

---

## 6. Control Center Photo-Access Hand-Off

### The transition

The labor-safety photo design from `DESIGN_DECISIONS.md §5` says:

> During the route day, finish photos are available in the Control Center
> drill-down for live issue surfacing. After day-close, photos require
> admin-gated, formally-requested, access-logged retrieval.

This is a **Control Center behavior** — it lives in the live-view UI and
its underlying photo-fetch API. The 4am Report itself never serves
photos; it is unaware of the transition.

### Conflict to flag for the Control Center spec session

Read `planning/capability-build/specs/T1-CC-control-center-relocation.md`
and `planning/capability-build/specs/T2-D5-stop-history-view.md`:

- **T1-CC** (Control Center relocation) does not currently address a
  post-day-close photo-access model. The component being relocated
  (`AdminControlCenter.tsx`) polls every 30s and shows today's runs —
  the implicit assumption is "live view, today only." That assumption
  does not contradict the labor-safety model, but it also does not
  *enforce* it for historical access.
- **T2-D5** (stop-level history view) is the spec that comes closest to
  the conflict. Its current response shape includes condition history,
  effort history, and open hazards — but **not photos**. So the
  immediate conflict is small.

The risk is that a future iteration of T2-D5 or T1-CC adds a "show me the
finish photos for this stop" affordance without recognizing it as a
post-close access surface that needs admin gating and access logging.

### What to do

- **Add a hand-off note to T1-CC and T2-D5** during the capability-build
  session: any post-day-close photo retrieval (including from a
  drill-down on a closed run) must go through an admin-gated,
  audit-logged retrieval flow, not a direct signed-URL fetch.
- **Do not modify Control Center specs from this session.** This
  document only records the hand-off. The decision and the spec change
  belong in the capability-build workstream, not in the 4am-report
  workstream.

---

## Summary of Blockers and Hand-Offs

| Item | Type | Owner | Notes |
|------|------|-------|-------|
| Skip-with-hazard `emitObservationsForStop` is post-commit (current_state §5.7) | **Build blocker** | Refactor / Refinement workstream | Move inside the transaction, or add a verified outbox/retry pattern. 4am Report cannot ship exceptions-only-from-canonical without one of these. |
| External work-order number — no field exists | **Field gap, not a blocker** | Future data-model task + KCM IT coordination | MVP renders as null with a visible label. |
| System Health "last sent" surface | Hand-off | T2-A7 capability-build spec | Cross-session dependency only — Report writes its audit row regardless. |
| Control Center post-close photo retrieval gating | Hand-off | T1-CC / T2-D5 capability-build specs | Add an explicit gating note to those specs during their build session. |
| Role-name strings in report copy | Build-time decision | Role rename workstream | Lands first per `CAPABILITY_BUILD_INDEX.md`. Report copy uses Specialist / Dispatch / Admin. |

This document is investigation only — no code, schema, migrations, or
changelog. No branch, no commit.
