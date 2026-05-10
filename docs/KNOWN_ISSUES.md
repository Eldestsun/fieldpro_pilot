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
**Status:** Deferred  
**Discovered:** 2026-05-10  
**Area:** frontend — Control Center progress bar component  
**Severity:** medium  

**Symptom:**  
Progress bar reflects only `completed` stops. Skipped stops (which represent a real worker visit with a documented safety hazard) are excluded, making coverage look lower than it is.

**Root cause (if known):**  
Progress calculation filters on `outcome = 'completed'` only. Skipped stops have `outcome = 'skipped'` and are not counted.

**Deferred because:**  
Control Center live data wiring is deferred to R6.

**Fix hint:**  
Update progress calculation to count `outcome IN ('completed', 'skipped')` as visited. Update label from "completed" to "visited" wherever the bar is rendered.

**Target:** R6 (Control Center Live Updates) or post-R4 triage

---

## ISSUE-003 — Control Center surfaces raw database identifiers instead of stop names
**Status:** Deferred  
**Discovered:** 2026-05-10  
**Area:** frontend — Control Center stop display  
**Severity:** medium  

**Symptom:**  
`"route_stop: 4"` and `"(route_stop)"` appear in several Control Center UI locations instead of the human-readable stop name or address.

**Root cause (if known):**  
Stop display name is not being resolved from the stops table. Raw `route_run_stop_id` values are rendered directly.

**Deferred because:**  
Control Center live data wiring is deferred to R6.

**Fix hint:**  
Wherever `route_stop` ID is rendered in Control Center components, join or look up the stop display name from the stops table (use `on_street_name` + `intersection_loc` from the `stops` view as the display string).

**Target:** R6 (Control Center Live Updates) or post-R4 triage

---

## ISSUE-004 — Skip stop: "No hazard selected" fires on first attempt despite hazard being selected
**Status:** Deferred  
**Discovered:** 2026-05-10  
**Area:** frontend — UL skip stop workflow / `handleSkipStop`  
**Severity:** high  

**Symptom:**  
On the skip stop flow, the validation gate fires "No hazard selected" (now `console.warn` post-R4B) on the first attempt even when the worker has selected a hazard type. Worker must deselect and reselect the hazard for the second attempt to succeed. Online path threw a visible error; offline path swallows it silently but still requires double-tap.

**Root cause (if known):**  
State update from hazard selection is async. `handleSkipStop` reads `safetyState[stopId].hazardTypes` before the React re-render cycle has committed the selection, so it sees stale state on first invocation.

**Deferred because:**  
Does not cause data loss — second attempt succeeds. R4B removed the visible `alert()` so the error is now silent. Full fix requires careful state timing work best done in a dedicated session.

**Fix hint:**  
Either (a) move the hazard validation to fire after state settles using a `useEffect` or `useCallback` with the correct dependency, or (b) pass hazard selection directly as an argument to `handleSkipStop` rather than reading from `safetyState` at call time, eliminating the async read entirely. Option (b) is cleaner.

**Target:** Post-R4 triage (before R4 final sign-off)
