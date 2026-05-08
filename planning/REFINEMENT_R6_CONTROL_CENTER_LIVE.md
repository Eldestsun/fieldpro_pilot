# R6 — Control Center — Live Updates

> **Goal**: Add near-real-time data refresh to the Control Center so dispatchers see route status, exceptions, and stop completions update without manually refreshing the page.
>
> **Status**: 🔴 Not started
> **Depends on**: Tier 3 done (Control Center must be mounted before live updates make sense)
> **Blocks**: Nothing

---

## Context

After Tier 3 mounts `AdminControlCenter.tsx`, it will work — data loads on mount and the four sections populate. But it goes stale immediately. A dispatcher watching the Control Center during an active shift will see stop completions accumulate in the DB but the UI will not update unless they refresh.

This item adds polling to the four Control Center data sections. Polling is the right first implementation — it's simple, requires no backend changes, and is sufficient for operational use where near-real-time (every 30s) is adequate. Server-sent events or websockets are future scope if sub-10s latency becomes a requirement.

---

## Files to Touch

| File | Change |
|------|--------|
| `frontend/src/components/admin/AdminControlCenter.tsx` | Add polling intervals to each of the four data-fetching hooks/effects; add a "last updated" timestamp and a live indicator |

---

## Files to Leave Alone

| File | Reason |
|------|--------|
| All backend files | The four endpoints already return current data — no backend changes needed |
| All other frontend files | Isolated to AdminControlCenter |
| Auth files | Frozen |

---

## Change 1 — Add Polling to Data Sections

### Current pattern (inferred from component structure)

Each section likely has a `useEffect` that fires on mount:
```typescript
useEffect(() => {
  fetchOverview()
}, [])
```

### After — polling with cleanup

```typescript
const POLL_INTERVAL_MS = 30_000 // 30 seconds

useEffect(() => {
  fetchOverview() // immediate on mount

  const interval = setInterval(() => {
    fetchOverview()
  }, POLL_INTERVAL_MS)

  return () => clearInterval(interval) // cleanup on unmount
}, [])
```

Apply the same pattern to all four sections: overview, routes, exceptions, difficulty.

---

## Change 2 — Live Indicator + Last Updated Timestamp

Add to the Control Center header:

```tsx
<div className="live-indicator">
  <span className="pulse-dot" />
  <span>Live · Updated {formatRelativeTime(lastUpdatedAt)}</span>
</div>
```

`lastUpdatedAt` is a `useState<Date>` set on each successful fetch. `formatRelativeTime` shows "just now", "30s ago", "2m ago" etc.

The pulsing dot indicates the component is in polling mode. If the last fetch failed, replace with a warning indicator.

---

## Change 3 — Pause on Tab Blur (Battery / Network Consideration)

Polling should pause when the browser tab is not visible to avoid unnecessary network requests when no dispatcher is watching:

```typescript
useEffect(() => {
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      fetchAllSections() // immediate refresh on tab focus
      startPolling()
    } else {
      stopPolling()
    }
  }
  document.addEventListener('visibilitychange', handleVisibility)
  return () => document.removeEventListener('visibilitychange', handleVisibility)
}, [])
```

---

## R6 Overall Done Definition

R6 is complete when ALL of the following are true, **and a changelog entry has been written**:

- [ ] All four Control Center sections refresh every 30 seconds
- [ ] "Last updated" timestamp visible in the header
- [ ] Live indicator (pulsing dot) visible while polling
- [ ] Polling pauses when the browser tab is not visible
- [ ] Polling resumes and immediately refreshes when tab becomes visible again
- [ ] No backend changes required or made
- [ ] Changelog entry written to `docs/changelog/YYYY-MM-DD-r6-control-center-live.md`

---

## Agent Launch Block

```
Feature task. Read CLAUDE.md, then planning/REFINEMENT_R6_CONTROL_CENTER_LIVE.md.
Add 30-second polling to all four data sections in
frontend/src/components/admin/AdminControlCenter.tsx.
Add a "last updated" timestamp and pulsing live indicator to the header.
Pause polling when document.visibilityState is 'hidden', resume and refresh on 'visible'.
Do not touch any backend file or any other frontend component.
```
