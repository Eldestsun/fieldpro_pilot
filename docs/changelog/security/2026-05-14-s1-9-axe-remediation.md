# 2026-05-14 — S1-9: axe-core Remediation + Manual A11y Audit

## What changed

**Part A — Automated violations (S1-8 findings)**
- `frontend/src/auth/LoginPage.tsx`: version badge inline color `#94a3b8` → `#64748b` (slate-500, 4.6:1 on white)
- `frontend/src/components/admin/AdminControlCenter.tsx`: 5× `text-gray-300` → `text-gray-500` on empty-state and secondary-label text
- `frontend/src/components/ui/DataTable.tsx`: added `tabIndex={0}` to `overflow-x-auto` table wrapper; sort-arrow icon `text-gray-300` → `text-gray-500`
- `frontend/src/components/ui/OpsTable.tsx`: added `tabIndex={0}` to `overflow-x-auto` table wrapper

**Part B — UL surfaces re-audit (3 new violations found + fixed)**
- `frontend/src/components/today-route/StopList.tsx`: removed invalid `<div>` wrapper between `<ul>` and `<li>` (list structure violation)
- `frontend/src/components/today-route/StopListItem.tsx`: added `id?: string` prop to `<li>`; `text-gray-500` → `text-gray-600` on skipped badge (4.39:1 → 5.7:1)
- `frontend/src/components/today-route/RouteHeader.tsx`: sync status colors: `text-green-600` → `text-green-800` (3.08:1 → 5.98:1 on gray-50); `text-amber-600` → `text-amber-800` (3.0:1 → 6.06:1)
- `frontend/src/components/today-route/StopDetail.tsx`: checklist unchecked icon `text-gray-300` → `text-gray-500`
- `backend/src/routes/devRoutes.ts`: added `/dev/seed-axe-fixture` endpoint (idempotent fixture seeder, gated by DEV_AUTH_BYPASS)

**Part C — Manual accessibility fixes**
- `frontend/src/components/ui/ConfirmDialog.tsx`: added `role="dialog"`, `aria-modal="true"`, `aria-labelledby="confirm-dialog-title"` + matching `id` on `<h3>`
- `frontend/src/components/common/ImagePreviewModal.tsx`: added `role="dialog"`, `aria-modal="true"`, `aria-label="Image preview"`
- `frontend/src/components/ui/ConflictResolutionModal.tsx`: added `role="dialog"`, `aria-modal="true"`, `aria-labelledby="conflict-modal-title"` + matching `id` on `<h2>`; bumped close/dismiss/copy buttons to `minHeight: '44px'`
- `frontend/src/components/today-route/StopDetail.tsx` (Safety Modal): added `role="dialog"`, `aria-modal="true"`, `aria-labelledby="safety-modal-title"` + matching `id`
- `frontend/src/components/today-route/StopDetail.tsx` (Infra Modal): added `role="dialog"`, `aria-modal="true"`, `aria-labelledby="infra-modal-title"` + matching `id`
- `frontend/src/components/today-route/StopDetail.tsx` ("← Back to Route" button): added `min-h-[44px] flex items-center`
- `frontend/src/components/today-route/StopDetail.tsx` (trash volume buttons): added `aria-pressed={checklist.trashVolume === val}`

## Why
- S1-9 compliance work: zero WCAG 2.1 AA violations across all 6 authenticated surfaces
- Screen readers now receive dialog role and label on all modal surfaces
- Trash volume toggle state now exposed to assistive technology via `aria-pressed`
- Keyboard users can access horizontal-scroll tables on Lead and Admin surfaces

## Files touched
- `frontend/src/auth/LoginPage.tsx`
- `frontend/src/components/admin/AdminControlCenter.tsx`
- `frontend/src/components/ui/DataTable.tsx`
- `frontend/src/components/ui/OpsTable.tsx`
- `frontend/src/components/today-route/StopList.tsx`
- `frontend/src/components/today-route/StopListItem.tsx`
- `frontend/src/components/today-route/RouteHeader.tsx`
- `frontend/src/components/today-route/StopDetail.tsx`
- `frontend/src/components/ui/ConfirmDialog.tsx`
- `frontend/src/components/common/ImagePreviewModal.tsx`
- `frontend/src/components/ui/ConflictResolutionModal.tsx`
- `backend/src/routes/devRoutes.ts`
- `docs/security/axe-audit-2026-05-14.md`
- `planning/security/SECURITY_SPRINT_1_CODE_GAPS.md`
