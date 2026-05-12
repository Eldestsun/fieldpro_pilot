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
**Status:** Fixed 2026-05-11  
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

---

## ISSUE-005 — baseline:after-replay fires on empty replays, causing fetchRoute loop
**Status:** Deferred  
**Discovered:** 2026-05-10  
**Area:** frontend — `OfflineSyncManager.tsx` / `useTodayRoute.ts`  
**Severity:** medium  

**Symptom:**  
`window.dispatchEvent(new Event('baseline:after-replay'))` fires on every `runReplay` call, including runs where there were no queued actions. When the app loads offline, `useTodayRoute` listens for this event and calls `fetchRoute`, which immediately fails (network unavailable), triggering another replay attempt, which fires the event again — loop. Results in UI flicker and excessive failed network calls on reconnect.

**Root cause (if known):**  
`onAfterReplay` is dispatched unconditionally in `OfflineSyncManager.attemptReplay` via `.finally()`. The guard inside `runReplay` (`anyCompleteStopSucceeded`) only gates the `onAfterReplay` callback passed into `runReplay`, but the DOM event is dispatched by `OfflineSyncManager` outside that guard.

**Fix hint:**  
Gate the `window.dispatchEvent` in `OfflineSyncManager` so it only fires when `runReplay` actually processed and succeeded at least one action. Investigate whether `anyCompleteStopSucceeded` is the right guard or whether any successful action (START_STOP, UPLOAD_STOP_PHOTOS, etc.) should trigger the route refresh. `runReplay` could return a boolean or a count of successful actions to make this decision at the call site.

**Deferred because:**  
Does not cause data loss. Loop self-terminates once online. Fix requires a small but careful interface change to `runReplay`'s return type.

**Target:** Post-R4 triage

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
**Status:** Fixed 2026-05-11
Backend write path: `observationService.ts` writes `core.observations.severity` from
`StopUiPayload.hazard_severity`. Frontend: severity pill selector (Low/Medium/High)
added to safety modal in `StopDetail.tsx`; value wired through `SafetyState.severity`
→ `handleCompleteStop`/`handleSkipStop` → queue action payload → route handler →
`cleanLogService` → `observationService` → `core.observations.severity`.
Changelogs: `2026-05-11-fix-007-hazard-severity-write.md`,
`2026-05-11-issue-007-severity-frontend.md`.

---

## ISSUE-008 — complexity_score not computed in stop_effort_history
stop_effort_history.complexity_score is always NULL. The spec intended 
a count of non-clean observations but payload key varies by observation 
type with no consistent 'value'/'clean' field across types.
Fix: define a canonical "condition" observation type with a consistent 
payload shape, then rewrite the complexity subquery against it.
Priority: post-pilot — complexity_score is not consumed by any 
current surface.