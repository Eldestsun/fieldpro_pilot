# 2026-07-12 — StatCard + ProgressBar primitives; mono data face (Invaria BASELINE DS, step 3)

## What changed
- **New `components/ui/StatCard.tsx`** per the DS StatCard spec: uppercase
  eyebrow label (xs, tracked) over a large tabular-numeral value, tone prop
  (`default/brand/success/warning/danger`), inline `unit`. Composes OpsCard.
  Replaces the two duplicated local `StatCard` sub-components in
  `AdminDashboard` and `AdminControlCenter`.
- **New `components/ui/ProgressBar.tsx`** per the DS ProgressBar spec: thin
  full-radius track (`--gray-200`) with a token-toned fill and width
  transition; optional "{value} of {max}" label row. Replaces the inline bars
  in `RouteHeader` (field surface) and the Control Center route table.
- **Monospace data face applied**: `DataTable` columns gain a `mono?: boolean`
  option (`font-mono tabular-nums`); Control Center Route ID and Pool cells set
  in mono; numeric cells and the RouteHeader stats row get `tabular-nums`.
  First consumer of IBM Plex Mono loaded in step 1.
- Tone mapping changes while consolidating (all per the DS spec, which uses
  these exact tile labels in its examples):
  - Control Center "Hazards Reported" tile: green → **danger** (hazards carry
    condition meaning; green read as "good").
  - "Observed Minutes" uses the `unit` prop ("318 m") instead of string concat.
  - Snapshot/dashboard eyebrow labels: text-sm → text-xs per spec.
  - Progress fills: green-400/500 → `--color-success`; tracks gray-100/200 →
    `--gray-200`.

## Why
- Step 3 of the design-system adoption: the DS promoted StatCard and
  ProgressBar to named primitives precisely because they were inline patterns
  repeated across AdminDashboard, AdminControlCenter, and RouteHeader —
  extraction keeps dashboards consistent and gives capability-build surfaces
  (T1-A5 audit viewer, T2-A7 system health) ready-made metric tiles.
- Labor-safety note: both primitives carry the DS's aggregate-only framing in
  their doc comments — route/aggregate progress, never per-worker.

## Verification
- `pnpm build` clean; `vitest run` 63/63 (9 new tests covering StatCard
  label/value/unit/tone and ProgressBar width math, clamping, zero-max, label,
  tone).
- Rendered `/ops/control-center` via dev server + dev bypass with
  network-stubbed CC endpoints: snapshot tiles show brand/default/danger tones
  with tabular values and inline unit; Route ID/Pool cells render in IBM Plex
  Mono; ProgressBar fills at 58%/100% with the success token.

## Files touched
- `frontend/src/components/ui/StatCard.tsx` (new)
- `frontend/src/components/ui/ProgressBar.tsx` (new)
- `frontend/src/components/ui/__tests__/StatCard.test.tsx` (new)
- `frontend/src/components/ui/__tests__/ProgressBar.test.tsx` (new)
- `frontend/src/components/ui/DataTable.tsx` (mono column option)
- `frontend/src/components/admin/AdminDashboard.tsx`
- `frontend/src/components/admin/AdminControlCenter.tsx`
- `frontend/src/components/today-route/RouteHeader.tsx`
