# Known Issues

Issues deferred for future sessions. Each entry stays until fixed and a changelog entry is written.

---

## ISSUE-001 — Offline queue pending count miscounts after spot check
**Status:** Deferred  
**Discovered:** 2026-05-10  
**Area:** frontend — OfflineStatusBar / queue state derivation  
**Severity:** low  

**Symptom:**  
After a spot check stop completes, the offline queue UI shows a pending action count instead of clearing to zero. Data writes correctly to the DB — display/counting issue only.

**Root cause (if known):**  
Spot check action type may not be handled in the queue state derivation logic that drives `OfflineSyncContext`. The pending count filter may not recognise the spot check action type as terminal/done.

**Deferred because:**  
Data integrity confirmed correct. UI cosmetic issue only. `OfflineSyncContext` doesn't exist yet — it's being built in R4 Sub-task D.

**Fix hint:**  
Investigate spot check action type handling in queue state derivation inside `OfflineSyncManager.tsx` once Sub-task D is implemented. Ensure all terminal action types are covered in the pending count filter.

**Target:** R4 Sub-task D or post-R4 triage

---

## ISSUE-002 — Control Center progress bar counts completed-only, should count visited
**Status:** Fixed 2026-05-12  
**Discovered:** 2026-05-10  
**Area:** frontend — Control Center progress bar component  

**Resolution:**  
The backend `/routes` endpoint already computed `resolved_stops` as
`COUNT(*) FILTER (WHERE rrs.status IN ('done', 'skipped'))` — both completed and
skipped stops were already counted at the data layer. Frontend: the "Progress" column
header was renamed to "Visited", the progress percentage label now reads `{N}% visited`,
and the local variable was renamed from `resolved` to `visited` for clarity.  
No backend change required.  
Changelog: `2026-05-12-r6-control-center-live.md`

---

## ISSUE-003 — Control Center surfaces raw database identifiers instead of stop names
**Status:** Fixed 2026-05-12 (partial — backend follow-up open)  
**Discovered:** 2026-05-10  
**Area:** frontend — Control Center stop display  

**Resolution:**  
Added `sanitizeStopLabel()` helper in `AdminControlCenter.tsx` — maps `null`, empty
string, or the `"(route_stop)"` DB placeholder from `core.v_locations_transit` to
`"Transit Stop"`. Applied to `difficulty.heavy_stops[].label` (the only per-stop
display surface in the current component).  
**Backend follow-up required:** the `/api/admin/control-center/difficulty` heavy_stops
query must JOIN to the `stops` table and return `stop_id + on_street_name +
intersection_loc` to enable the full `"#{stop_id} · street — cross"` display format.
A `TODO(ISSUE-003)` comment marks the render site. The routes and exceptions endpoints
return only route-level aggregates — no per-stop identifiers to fix there.  
Changelog: `2026-05-12-r6-control-center-live.md`

---

## ISSUE-004 — Skip stop: "No hazard selected" fires on first attempt despite hazard being selected
**Status:** Fixed 2026-05-11  
**Discovered:** 2026-05-10  
**Area:** frontend — UL skip stop workflow / `handleSkipStop`  

**Resolution:**  
Hazard selection is now passed directly as an argument to `handleSkipStop` from the
confirm dialog `onConfirm` callback, eliminating the async state read entirely.
`localSafety.hazardTypes` is read at the time the worker taps "Skip Stop" in the
safety modal, not deferred to the confirm step where stale state could be read.  
Changelog: `2026-05-11-fix-004-skip-hazard-double-tap.md`

---

## ISSUE-005 — baseline:after-replay fires on empty replays, causing fetchRoute loop
**Status:** Fixed 2026-05-11  
**Discovered:** 2026-05-10  
**Area:** frontend — `OfflineSyncManager.tsx` / `useTodayRoute.ts`  

**Resolution:**  
`runReplay` now returns `Promise<boolean>` — `true` when at least one terminal stop action (`COMPLETE_STOP` or `SKIP_STOP_WITH_HAZARD`) succeeded. `OfflineSyncManager.attemptReplay` is now `async` and gates `window.dispatchEvent(new Event('baseline:after-replay'))` on that return value. Empty-queue and upload-only replay runs no longer fire the event.  
Changelog: `2026-05-11-fix-005-after-replay-guard.md`

---

## ISSUE-006 — Offline queue memoryCache may not flush to localStorage before tab crash
**Status:** Deferred  
**Discovered:** 2026-05-10  
**Area:** frontend — `offlineQueue.ts` — `persistState` / `enqueueAction`  
**Severity:** medium  

**Symptom:**  
Queue actions are held in `memoryCache` (a module-level object) and written to `localStorage` synchronously on every `enqueueAction` call. If a worker queues actions while offline and the browser tab is killed (crash, battery loss, force-quit) between the enqueue and the `localStorage.setItem` completing, queued stop data is lost permanently — the canonical visit and observation rows are never written.

**Root cause (if known):**  
`localStorage.setItem` is synchronous in the spec but browsers may defer writes under memory pressure. Module-level `memoryCache` is authoritative during a session but not durable across tab death. There is no `beforeunload` flush or write confirmation.

**Fix hint:**  
Audit write-through timing in `persistState()`. Add a `beforeunload` / `visibilitychange: hidden` handler that iterates `memoryCache` and force-flushes any entries not yet confirmed in `localStorage`. Confirm `localStorage.setItem` is truly synchronous in the target browser environments (Chrome on Android). Consider using IndexedDB for the queue store (same as `photoStore` and `todayRouteCache`) for stronger durability guarantees.

**Deferred because:**  
Edge case for pilot (requires simultaneous offline session + tab crash). Existing `persistState` call is synchronous and covers the majority of real-world scenarios. Must harden before scale.

**Target:** Pre-scale hardening (before multi-agency rollout)

---

## ISSUE-007 — Hazard severity not captured in canonical observations
**Status:** Fixed 2026-05-12  
**Discovered:** 2026-05-10  
**Area:** backend — `observationService.ts` / frontend — `StopDetail.tsx`, `useTodayRoute.ts`  

**Resolution:**  
Backend: `observationService.ts` now writes `core.observations.severity` (text) from
`StopUiPayload.hazard_severity`. `cleanLogService.ts` passes `safety.severity` through
as `hazard_severity` in the `uiPayload`. `hazardService.ts` converts string labels
(`"low"/"medium"/"high"`) to smallint (1/2/3) via `toNumericSeverity()` for the
`hazards.severity` column. Skip path `uiPayload` now includes `hazard_severity`.  
Frontend: severity pill selector (Low/Medium/High) added to safety modal in
`StopDetail.tsx`; value wired through `SafetyState.severity` → queue action payload →
route handler → `cleanLogService` → `observationService` → `core.observations.severity`.  
Changelogs: `2026-05-11-fix-007-hazard-severity-write.md`,
`2026-05-11-issue-007-severity-frontend.md`,
`2026-05-12-fix-hazard-severity-backend-bugs.md`.

---

## ISSUE-008 — complexity_score not computed in stop_effort_history
stop_effort_history.complexity_score is always NULL. The spec intended 
a count of non-clean observations but payload key varies by observation 
type with no consistent 'value'/'clean' field across types.
Fix: define a canonical "condition" observation type with a consistent 
payload shape, then rewrite the complexity subquery against it.
Priority: post-pilot — complexity_score is not consumed by any 
current surface.