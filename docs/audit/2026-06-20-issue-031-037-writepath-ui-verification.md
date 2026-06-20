# 2026-06-20 — Post-migration write-path verification (UI-driven, ISSUE-031 + ISSUE-037)

**Type:** one-time write-path re-test (the deferred post-purification pass). NOT a CI suite.
**Method:** every field-capture seam driven through the REAL Specialist route-execution surface
via Chrome DevTools MCP; each verified on two surfaces — UI cause + (DB row via psql AND/or
network response). `app.current_org_id='1'` set on every verification query (PATTERN-001).
**Target:** local `fieldpro_db` + locally-served frontend/backend. Per ISSUE-038 this DB is NOT
a from-scratch migration; a clean-room re-run is deferred until 038 is fixed — noted, not attempted.
**Verdict: ALL GREEN.** Every capture seam lands in canonical (`core.*`); trash volume writes
`core.observations` and does NOT touch the dropped `public.trash_volume_logs`; no API response
leaks stop-level worker identity; the photo OID gate holds on the wire.

---

## Session / auth (Phase 0.5)

Real Entra/MSAL session established by the founder via the browser login (frontend
`VITE_DEV_AUTH_BYPASS=false`; bearer JWT seen on every request). Decoded token:
`oid=55a66724-705d-45d3-b160-128906c86aa9`, `preferred_username=baseline-dispatch@valoremseo.onmicrosoft.com`,
**`roles=["Dispatch"]`**.

⚠️ **Caveat (flagged, not blocking):** the session role is **Dispatch**, not a dedicated
Specialist account. The route-execution endpoints accept `["Specialist","Dispatch","Admin"]`, so
all capture seams are exercisable and write a real OID to the audit sidecars — but a role-pure
Specialist login would be a cleaner artifact if you want one later. No bypass/fake auth was used.

Route under test: **run 1427**, "Test Pool 1 (Easy)", 25 stops. 6 stops actioned (stops #0–#5);
the rest left pending (the dispatch allows using a subset).

---

## Phase 0 — Live-surface action enumeration (from the rendered surface)

| Action | Options exposed |
|---|---|
| Start Route (route-level) | single CTA |
| Start Stop (per stop) | single CTA; "Mark Hotspot" pre-start |
| Cleaning tasks | 5 checkboxes: picked_up_litter, emptied_trash, washed_shelter, washed_pad, washed_can |
| Trash volume | 0 / 1 / 2 / 3 / 4 (required for a cleaning completion) |
| Report Safety → Skip-with-hazard | 8 hazards (Encampment, Fire, Dangerous Activity, Active Drug Use, Violence, Biohazard, Traffic/Access, Other) + **Severity (Low/Medium/High, appears after a hazard is picked)** + notes + **mandatory safety photo** |
| Report Infrastructure | 9 types (Broken glass, Graffiti, Trash can damaged, Panel damaged/missing, Lighting not working, Contaminated waste, Landscaping blocking access, Structure damaged, Other) + notes + photo. **No `needs_facilities` field** (ISSUE-034 drop visible in the UI). |
| Perform Spot Check | toggle — disables cleaning tasks, requires photo only |
| Document Conditions / After Photo | photo/evidence capture (mandatory for completion & skip) |
| Finish (complete stop) | enabled once requirements met |

---

## Phase 1+2 — Seam → canonical map + PASS/FAIL (one representative case per seam)

| Seam | Network (method path → status) | Canonical landing (psql, org=1) | Verdict |
|---|---|---|---|
| **Start Route** | `POST /api/route-runs/1427/start → 200` | `route_runs.status='in_progress'`+`started_at` (ADAPTER). **0** `core.visits` created. | ✅ adapter-only, by design |
| **Start Stop** | `POST /api/route-run-stops/1536/start → 200` | `core.visits` 983 (`visit_type=service`, open); OID→`visit_actor_audit`. `core.visits` has **no** worker column. | ✅ PASS |
| **Clean actions** | (in `/complete` body: `picked_up_litter:true, emptied_trash:true, washed_*:false`) | `core.observations` action rows: `picked_up_litter`, `emptied_trash` only. | ✅ PASS |
| **Trash volume** | (in `/complete`: `trashVolume:3`) | `core.observations` `trash_volume` (measurement), `payload.level=3`. `to_regclass('public.trash_volume_logs')=NULL` — write did NOT hit/err on the dropped table. | ✅ PASS (core ISSUE-037 proof) |
| **Skip-with-hazard** | `POST /api/route-run-stops/1537/skip-with-hazard → 200` | `rrs.status='skipped'`; visit 984 `outcome='skipped'`, `reason_code='biohazard'`; `biohazard_present` obs, `norm_severity=3`; safety photo `core.evidence kind=safety`. | ✅ PASS |
| **Infrastructure** | `POST .../1538/complete → 200` (`infraIssues` path) | `graffiti_present` (presence), `payload={cause,component}`. `needs_facilities`: **0** refs. `public.infrastructure_issues`: **0** new adapter rows. | ✅ PASS |
| **Spot check** | `POST .../1539/complete → 200` (spotCheck) | visit `completed`; single `spot_check` obs (obs_kind=condition); no cleaning rows; evidence photo present. | ✅ PASS |
| **Photo/evidence** | `POST /api/route-runs/1427/stops/1536/photos → 200` | `core.evidence` 240 (`kind=completion`); OID→`evidence_actor_audit`; **see OID gate below**. | ✅ PASS |
| **Complete stop** | `POST .../1536/complete → 200` | `core.visits` 983 `outcome='completed'`+`ended_at`. | ✅ PASS |

Consolidated final state (adapter status ↔ canonical outcome aligned 1:1, no orphans):

```
 rrs  | stop_id | adapter_status | canonical_outcome | obs | evidence
 1536 | 18220   | done           | completed         |   3 |   1
 1537 | 31190   | skipped        | skipped           |   1 |   1
 1538 | 24410   | done           | completed         |   3 |   1
 1539 | 13800   | done           | completed         |   1 |   1
 1540 | 13830   | skipped        | skipped           |   1 |   1
 1541 | 2610    | skipped        | skipped           |   1 |   1
 open/dangling (outcome NULL) visits today: 0
```

UI read-back confirmed for every seam (route list shows DONE / SKIPPED per stop; progress
counter advanced 0→3 completed; skipped stops render the "SKIPPED" badge).

---

## Phase 3 — Edge cases

### Clean absence-convention (TRUE→row, FALSE→no row) — ✅
Visit 983 was driven with litter+emptied=TRUE, washed_shelter/pad/can=FALSE. Canonical action rows:
`picked_up_litter`, `emptied_trash` ONLY — zero rows for the three FALSE actions. Distinguishable
from never-recorded because the completed visit (`outcome='completed'`) is the anchor.

### Skip-with-hazard at each severity — ✅ (norm_severity carries per level)
```
 ui_severity         | observation_type   | norm_severity | payload
 Low (fire)          | fire_present       |  1            | {"severity": 1}
 Medium (encampment) | encampment_present |  2            | {"severity": 2}
 High (biohazard)    | biohazard_present  |  3            | {"severity": 3}
```
Each UI hazard maps to its specific `*_present` type and the chosen severity carries linearly into
`norm_severity` (1/2/3). Not a synthesized constant.

### Photo OID gate (ISSUE-036), proven on the wire — ✅ (banked)
`POST /api/route-runs/1427/stops/1536/photos` **response body** (verbatim):
```json
{"ok":true,"photos":[{"id":"240","route_run_stop_id":"1536",
"storage_key":"route-run-stops/1536/completion/a512520a-8327-4d6c-86cb-7918b61d55cc.png",
"kind":"completion","captured_at":"2026-06-20T11:01:34.150Z","url":"http://localhost:9000/...presigned..."}]}
```
**No `created_by_oid`, no `oid`, no worker-identity field on the wire.** Canonical side, three layers:
- `core.evidence` 240 has the photo; `core.evidence` has **no** oid column (structural).
- The real OID (`55a6…`) is isolated in `core.evidence_actor_audit`.
- That sidecar is **grant-walled**: `intelligence_reader` and `mcp_readonly` have **zero** grant
  (only `fieldpro`). Worker identity is unreachable from the intelligence/reporting roles by
  permission, not policy. (Same pattern verified for `visit_actor_audit`.)

### Infrastructure post-clip shape — ✅
`needs_facilities` is gone from the UI and writes **0** references to canonical (ISSUE-034); the
live infra path writes structured canonical presence (`cause`/`component` in payload) and **0**
rows to the still-existing-but-clipped `public.infrastructure_issues` adapter.

### Empty-payload (ISSUE-032/033 residue) NOT reproduced by the live path — ✅
Every live presence/measurement observation written this pass carries a populated payload
(`{"severity":N}`, `{"level":N}`, `{"cause","component"}`). The live write path does not emit the
empty-`{}` presence rows that were prior test residue.

---

## Notable finding for discussion — Start Route reads from the adapter (answers the founder's question)

"Route in progress" is logged and read entirely from the **adapter**: `POST /route-runs/:id/start`
sets `public.route_runs.status='in_progress'` + `started_at` + `assigned_user_oid`; it creates **no**
`core.*` rows; the UI reads it back via `GET /api/ul/todays-run` (`route_runs.status`) to swap the
"Start Route" CTA for the map/sequence.

This is architecturally consistent, not a gap: `route_runs` is execution scaffolding (assignment +
sequencing + run lifecycle), and "assignments are intent, not truth" (CLAUDE.md). Canonical state
captures *what was observed at an asset*; it has no need for a "route in progress" concept — that's
workflow, legitimately adapter-resident. So a mix of canonical-read surfaces (intelligence, stop
condition) and adapter-read surfaces (route lifecycle/assignment) is normal for an app of this
shape. **Labor-safety angle:** `route_runs.started_at` is a route-level timestamp (not a per-stop,
per-worker service time), and `assigned_user_oid` is route-assignment intent visible to Dispatch —
neither is the stop-level per-worker profiling the intelligence-layer guarantee protects against
(`stop_effort_history`/`stop_condition_history` keyed by `(stop_id, visit_id)`, no `user_id`).

### Secondary observation (for your judgment)
The route-lifecycle responses (`/start`, `/complete`) include `assigned_user.oid` and
`created_by.oid` in the JSON (route-assignment surface, Dispatch-facing). This is distinct from
the stop-level capture-attribution leak the dispatch hunts (the photo path, which is clean). Worth
a deliberate decision on whether the route-assignment surface should also project display-name-only.

---

## Fixtures

No orphans created — every started stop reached a terminal state (done/skipped) with a closed
visit; 0 dangling open visits. The 6 actioned stops remain on run 1427 as inspectable evidence
(not torn down — they are the artifact, and are consistent rows, not the orphan class that causes
false failures). Teardown referenced no dropped tables. If you want run 1427 reset to all-pending,
that's a scoped cleanup I can run on request.

---

## Bottom line
All write seams land in canonical; trash volume is fully off the dropped `trash_volume_logs`; the
photo OID gate holds on the wire and at the permission layer; severities and the absence convention
carry correctly; the infra clip + `needs_facilities` drop are reflected in the live path. This table
is the migration-soundness artifact for ISSUE-031 + ISSUE-037. No regression found → no card filed.
