# 2026-05-11 — R5 Surface 5: Admin Dashboard, Pools, Stops

## What changed

### New shared UI primitives

**src/components/ui/DataTable.tsx** (new)
- Lightweight sortable + paginated data table — shadcn DataTable pattern without TanStack Table dependency
- `columns` array with `key`, `header`, `sortable`, `getValue` (sort accessor), `render` (JSX cell), `className`, `headerClassName`
- Internal sort state: clicking a sortable `<th>` toggles asc/desc; sort icon ↕/↑/↓ in header
- `serverPagination` mode: data is a pre-fetched page slice; DataTable sorts within the slice and shows Prev/Next controls calling `onPageChange`
- Client-side mode (default): DataTable sorts + paginates all provided data internally
- Pagination footer: "Showing X–Y of Z" + Prev/Next buttons with disabled states
- Loading state: full-width "Loading…" row; empty state: configurable `emptyMessage`

**src/components/ui/ConfirmDialog.tsx** (new)
- Reusable confirmation modal for destructive actions
- `title`, `message`, `confirmLabel`, `cancelLabel`, `variant` ("danger" → red, "warning" → orange)
- Backdrop click cancels; `onConfirm` / `onCancel` callbacks
- Replaces `confirm()` native dialog in AdminPoolsPanel

### OpsCard.tsx — deprecated props removed
- Removed `style?: React.CSSProperties` and `padding?: string | number` props (deprecated since Surface 4, all callers now migrated)
- Component is now `{ children, className }` only
- All callers already use `className` — no functional change

### OpsTable.tsx — deprecated props removed
- Removed `style?: React.CSSProperties` from `OpsTableRow` and `OpsTableCell` (deprecated since Surface 4)
- `OpsTableRow`: `{ children, onClick, className }` only
- `OpsTableCell`: `{ children, alignRight, className, ...tdProps }` only

### AdminDashboard.tsx
- Extracted `StatCard` sub-component — `label`, `value`, `valueClassName` props
- Stat grid: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6` (responsive, desktop shows 4 columns)
- Loading state: 4 skeleton cards with `animate-pulse` bars
- Error state: `OpsCard className="border-red-200 bg-red-50"` with `text-red-600` message
- Active Runs Today: `text-blue-700`; Completed Runs Today: `text-green-700`

### AdminPoolsPanel.tsx
- Replaced `OpsTable` + manual pagination with `DataTable<Pool>`
- Columns: ID (sortable, monospace), Name (sortable, bold), Status (OpsBadge), Actions (Disable button)
- Client-side sort — `getValue` accessors on id and name
- Page size 20; pagination footer handled by DataTable
- **Confirmation dialog**: replaced `confirm()` with `ConfirmDialog` modal
  - "Disable Pool" button sets `confirmDisableId` state; dialog shows pool name in message
  - `onConfirm` calls `disableAdminPool`; `onCancel` clears state
- Create pool form: Tailwind `flex gap-4 items-end` layout; input with `min-h-[44px]`; Enter key submits
- Removed all deprecated `style`/`padding` props from Ops* component calls

### AdminStopsPanel.tsx
- Replaced `OpsTable` + inline pagination with `DataTable<any>` in `serverPagination` mode
- Columns with render functions (closures capture component state):
  - Checkbox select column (admin only) — `accent-blue-600`
  - Stop # — sortable, `getValue` → stop_id, bold cell
  - Bearing — sortable, `getValue` → bearing_code
  - Location — sortable, `getValue` → `buildLocation(stop)`
  - Pool — sortable by pool name; inline `<select>` for admin edit mode
  - Notes — inline `<input>` for admin edit mode; muted text for read-only
  - Flags — 🔥📦🗑️ emoji toggles; active `opacity-100`, inactive `opacity-25 hover:opacity-50` via `cn()`
  - Actions (admin only) — "Save" / "Saving…" button when row has unsaved changes
- Search/filter toolbar: `flex gap-3 flex-wrap` card; inputs with `min-h-[44px]`; pool `<select>` with same height
- Bulk selection toolbar: `bg-blue-50 border-blue-200` banner with count and action buttons
- Server-side pagination delegated to DataTable footer (`page`, `total`, `onPageChange`)
- Removed all deprecated `style`/`padding` props

## Why
- R5 Surface 5 — replaces all dev-grade inline styles in admin surfaces with Tailwind v4
- DataTable provides sortable columns across all admin tables (requirement from Surface 5 spec)
- ConfirmDialog replaces `confirm()` browser dialog for destructive actions (spec requirement)
- Removing deprecated Ops* props cleans the component API completely — no more `style` pass-through on shared primitives
- Desktop-primary (1280px); OpsLayout uses `max-w-5xl`; responsive grid on Dashboard

## Files touched
- `frontend/src/components/ui/DataTable.tsx` (new)
- `frontend/src/components/ui/ConfirmDialog.tsx` (new)
- `frontend/src/components/ui/OpsCard.tsx`
- `frontend/src/components/ui/OpsTable.tsx`
- `frontend/src/components/admin/AdminDashboard.tsx`
- `frontend/src/components/admin/AdminPoolsPanel.tsx`
- `frontend/src/components/admin/AdminStopsPanel.tsx`
