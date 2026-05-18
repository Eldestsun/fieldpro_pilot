# 2026-05-12 — R6: Control Center live updates + ISSUE-002 + ISSUE-003

## What changed

### R6 — 30-second polling + live indicator

- `AdminControlCenter.tsx`: replaced the previous 60-second unified polling interval
  with 30-second polling. `intervalRef` (useRef) holds the interval ID so the
  visibility handler can clear and restart it without stale closures.
- Added `lastUpdatedAt: Date | null` state — set to `new Date()` on every successful
  fetch from any section.
- Added `fetchFailed: boolean` state — set on poll failure, cleared on success.
  Initial-load failures still replace the page with an error card; subsequent poll
  failures only update the live indicator (last good data stays visible).
- Added `LiveIndicator` sub-component rendered via `OpsLayout`'s `rightActions` prop:
  - Pulsing dot (`animate-pulse`, `var(--color-success)`) + "Live · Updated {relative}"
    while polling normally.
  - "Live · Loading..." before the first successful fetch.
  - Warning indicator + "Live · Update failed" when the most recent poll errored.
- Added `formatRelativeTime(date: Date): string` helper:
  - < 30 s → "just now"
  - < 60 s → "{N}s ago"
  - ≥ 60 s → "{N}m ago"
- Added visibility-change effect: polling pauses when `document.visibilityState ===
  'hidden'`, immediately re-fetches and restarts the interval on `'visible'`.
  The same `intervalRef` is shared between the polling effect and the visibility
  effect. The visibility cleanup removes the event listener on unmount.
- Removed `subtitle="Auto-refreshes every 60s"` from all three `OpsLayout` render
  paths (loading, error, main) — the live indicator replaces this copy.

### ISSUE-002 — Progress bar label corrected to "visited"

- Route Status table column header changed from "Progress" to "Visited".
- Variable renamed from `resolved` to `visited` for readability.
- Progress percentage label updated to `{N}% visited` in the cell.
- The backend `/routes` endpoint already computed `resolved_stops` as
  `COUNT(*) FILTER (WHERE rrs.status IN ('done', 'skipped'))` — both completed
  and skipped stops were already counted. No backend change required.
- Added inline comment clarifying that `resolved_stops` = done + skipped (worker
  was present either way).

### ISSUE-003 — Raw DB stop identifiers replaced

- Added `sanitizeStopLabel(label)` helper: maps `null`, empty string, or the
  literal `"(route_stop)"` placeholder returned by `core.v_locations_transit` to
  `"Transit Stop"`. Any other label passes through unchanged.
- Applied to `difficulty.heavy_stops[].label` in the "Heavier Than Median" panel.
- Added `TODO(ISSUE-003)` comment at the heavy_stops render site noting that the
  `/difficulty` endpoint needs to return `stop_id + on_street_name + intersection_loc`
  to enable the full `"#{stop_id} · street — cross"` display format. This is a
  **backend follow-up task** — the `/difficulty` heavy_stops query must JOIN to the
  `stops` table and return those three fields. The frontend render site is ready to
  consume them once available.
- No other sections in the current component expose per-stop identifiers:
  the `/routes` endpoint returns route-level aggregates only, and `/exceptions`
  returns aggregate counts. The `"route_stop: N"` pattern does not appear as a
  static string in the rebuilt R5 component; it was a pre-R5 artifact. If it
  reappears via dynamic data in pool_id or label fields, `sanitizeStopLabel` will
  handle the `"(route_stop)"` form; the `"route_stop: N"` form would require an
  additional backend data quality fix.

## Why

- R6: Dispatchers watching an active shift need near-real-time route status without
  manually refreshing. 30-second polling is sufficient for operational use.
  Pause-on-hidden saves unnecessary network calls when no dispatcher is watching.
- ISSUE-002: A skipped stop represents a real worker visit with a documented safety
  hazard. Excluding it from coverage metrics understates actual field coverage and
  misrepresents the shift to dispatchers.
- ISSUE-003: Raw database placeholder labels like "(route_stop)" are not meaningful
  to dispatchers. "Transit Stop" is a correct, human-readable fallback until proper
  stop names are available from the backend.

## Files touched

- `frontend/src/components/admin/AdminControlCenter.tsx`

## Issues closed

- R6 — Control Center Live Updates ✅
- ISSUE-002 — Progress bar counts completed-only ✅
- ISSUE-003 — Raw DB identifiers in stop display ✅ (partial — backend follow-up
  needed to add `stop_id + on_street_name + intersection_loc` to `/difficulty`
  heavy_stops response for full name display)
