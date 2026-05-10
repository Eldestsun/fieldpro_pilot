# Tier 3 — Reconnect Control Center

> **Goal**: Mount the fully-built `AdminControlCenter.tsx` component into `App.tsx` so Admin-role users can reach the Control Center.
>
> **Status**: 🟢 Done
> **Depends on**: Nothing (unblocked)
> **Blocks**: Nothing

---

## Context

`AdminControlCenter.tsx` is a complete 331-line React component at `frontend/src/components/admin/AdminControlCenter.tsx`. It calls four backend endpoints:
- `GET /api/admin/control-center/overview`
- `GET /api/admin/control-center/routes`
- `GET /api/admin/control-center/exceptions`
- `GET /api/admin/control-center/difficulty`

All four endpoints exist in `backend/src/modules/admin/adminRoutes.ts`, are correctly guarded by `requireAnyRole(["Admin"])`, and return data. The component was built and then disconnected — it is simply never imported or rendered in `App.tsx`.

This is the lowest-risk tier in the entire refactor. It is frontend-only and requires zero backend changes.

---

## Files to Touch

| File | Change |
|------|--------|
| `frontend/src/App.tsx` | Import `AdminControlCenter`, add `"admin_control_center"` to the view state type, add a nav button in the Admin Tabs section, add a case in `renderView()` |

---

## Files to Leave Alone

| File | Reason |
|------|--------|
| `frontend/src/components/admin/AdminControlCenter.tsx` | Complete and correct — do not modify |
| All backend files | Backend endpoints already exist and work |
| All auth files | Auth is frozen |
| All offline queue files | Offline contract is frozen |
| All other frontend components | No other changes needed |

---

## Change 1 — Mount AdminControlCenter in App.tsx

### Before

`App.tsx` does not import `AdminControlCenter`. The `activeView` type has no `"admin_control_center"` case. The Admin Tabs nav section has three buttons (Admin Dashboard, Pools, Stops). The `renderView()` switch has no case for Control Center.

Relevant current state:

```tsx
// No AdminControlCenter import

type ActiveView = "work" | "routes" | "admin_dash" | "admin_pools" | "admin_stops" | "ops_dash" | "ops_pools" | "ops_stops"

// Admin Tabs nav:
{isAdmin && (
  <>
    <div style={{ width: "1px", ... }}></div>
    <button onClick={() => setActiveView("admin_dash")} ...>Admin Dashboard</button>
    <button onClick={() => setActiveView("admin_pools")} ...>Pools</button>
    <button onClick={() => setActiveView("admin_stops")} ...>Stops</button>
  </>
)}

// renderView():
if (activeView === "admin_dash") return <AdminDashboard scope="admin" />;
if (activeView === "admin_pools") return <AdminPoolsPanel scope="admin" />;
if (activeView === "admin_stops") return <AdminStopsPanel scope="admin" />;
```

### After

Add the import following the same dynamic resolution pattern already used in the file:

```tsx
import * as AdminControlCenterMod from "./components/admin/AdminControlCenter";
const AdminControlCenter = resolveComponent(AdminControlCenterMod, "AdminControlCenter");
```

Extend the view type:
```tsx
const [activeView, setActiveView] = useState<
  "work" | "routes" | "admin_dash" | "admin_pools" | "admin_stops" |
  "admin_control_center" | "ops_dash" | "ops_pools" | "ops_stops"
>("work");
```

Add nav button at the end of the Admin Tabs section:
```tsx
<button
  onClick={() => setActiveView("admin_control_center")}
  style={navButtonStyle(activeView === "admin_control_center")}
>
  Control Center
</button>
```

Add case in `renderView()`:
```tsx
if (activeView === "admin_control_center") return <AdminControlCenter />;
```

### Done criteria
- Admin users see a "Control Center" tab in the nav bar
- Clicking it renders `AdminControlCenter`
- All four data sections in the component (overview, routes, exceptions, difficulty) load without errors
- Non-Admin users do not see the tab (the existing security guard in the `useEffect` already handles this — the `admin_` prefix is already covered)
- No regressions to existing Admin Dashboard, Pools, or Stops views

---

## Tier 3 Overall Done Definition

Tier 3 is complete when ALL of the following are true, **and a changelog entry has been written to `docs/changelog/`**:

- [ ] "Control Center" tab visible for Admin-role users
- [ ] All four Control Center sections render data without console errors
- [ ] Non-Admin users cannot reach `admin_control_center` view (security guard enforced)
- [ ] Existing Admin views unaffected
- [ ] Changelog entry written to `docs/changelog/YYYY-MM-DD-tier-3-control-center.md`

---

## What Tier 3 Does NOT Do

- Does not modify `AdminControlCenter.tsx`
- Does not add any backend routes
- Does not change any auth logic
- Does not change the Control Center's data source (that is Tier 2 — its current data comes from the admin routes which use `v_clean_logs_transit` and related views)

---

## Agent Launch Block — Change 1

```
Refactor task. Read CLAUDE.md, then planning/TIER_3_CONTROL_CENTER.md.
Implement Change 1: mount AdminControlCenter in frontend/src/App.tsx.
Add the import using the existing resolveComponent pattern, extend the activeView
type with "admin_control_center", add a "Control Center" nav button in the Admin
Tabs section, and add a renderView() case for it.
Do not touch AdminControlCenter.tsx or any backend file.
The component takes no props.
```
