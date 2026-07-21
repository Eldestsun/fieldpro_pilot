# 2026-07-12 — Review-surface polish (Invaria BASELINE DS, step 4 tranche 1)

## What changed
Per-surface polish of the **review/admin surface**, scoped to surfaces with no
in-flight structural work. (Checked before starting: `App.tsx`,
`AuthContext.tsx`, `OfflineStatusBar.tsx`, and the new audit-log panel are
touched by open branches `feat/capability-t1-a5-a6-admin-ui` and
`fix/ping-retry-backoff-jitter` — none were modified here.)

- **AdminControlCenter**
  - Deviations column: 🚨/⏭️ emoji → `OpsBadge` pills ("Emergency" danger,
    "High skips" warning), per the DS iconography rules.
  - LiveIndicator failure state: `!` glyph → warning-token dot; colors tokened.
  - Exceptions mini-stats → semantic tokens (danger/warning/brand) with
    tabular numerals.
  - Difficulty band chips (Heavy / Very Heavy / Elevated / High) → the
    `--band-heavy-*` / `--band-very-heavy-*` tokens they were designed for.
  - Hotspot chips → brand tint tokens; heavy-stop/route `#id`s → mono;
    remaining raw grays → text/border aliases.
- **AdminStopsPanel**
  - Flag toggles: 🔥/📦/🗑️ emoji buttons → text pill toggles
    (Hotspot / Compactor / Trash; filled when active, faint outline when not);
    read-only scope shows active flags as neutral OpsBadges. Handlers, titles,
    and toggle semantics unchanged.
  - Stop # and Bearing columns → mono (first users of DataTable's `mono` col
    option); toolbar → OpsCard; inputs/selects/checkbox → token borders and
    brand focus rings; bulk toolbar → brand tints.
- **AdminPoolsPanel** — create form → OpsCard + token inputs; ID column mono
  color tokened.
- **AdminDashboard** — error card → danger tokens (matches CC).
- **LoginPage** — inline styles → tokens (surface, border, radius-xl,
  shadow-modal); version string set in mono.
- **index.css** — base button reset and legacy `.btn-primary`/`.card` classes
  → tokens. Notably `.btn-primary` was still "Deep Cerulean" `#1D6FBD`, an
  off-brand blue predating the token system (one consumer: TodayRouteView).

## Why
- Step 4 of the design-system adoption, first tranche: finish the
  review/admin surface end-to-end now that tokens (step 1), primitives
  (step 2), and StatCard/ProgressBar (step 3) are in place beneath it.
- Deferred to later tranches: the field surface (today-route — deserves its
  own pass against `ui_kits/field` with wizard care), Lead panels, and the
  nav/App.tsx chrome (blocked until T1-A5/A6 merges).

## Verification
- `pnpm build` clean; `vitest run` 63/63.
- Rendered via dev server + dev bypass with network-stubbed endpoints:
  - `/ops/control-center`: badge deviations, band-token chips, brand hotspot
    chip, semantic mini-stats, mono IDs — full-page screenshot on-design.
  - `/admin/stops`: mono Stop #/Bearing, flag pills active/inactive states,
    OpsCard toolbar.
  - `/` (logged out): LoginPage on token surfaces, mono version string.

## Files touched
- `frontend/src/components/admin/AdminControlCenter.tsx`
- `frontend/src/components/admin/AdminStopsPanel.tsx`
- `frontend/src/components/admin/AdminPoolsPanel.tsx`
- `frontend/src/components/admin/AdminDashboard.tsx`
- `frontend/src/auth/LoginPage.tsx`
- `frontend/src/index.css`
