# 2026-07-12 — Field-surface polish (Invaria BASELINE DS, step 4 tranche 2)

## What changed
Per-surface polish of the **field surface** (`today-route/` + `TodayRouteView`),
against the DS `ui_kits/field` reference. Styling only — no handler, flow,
offline-queue, or validation logic touched. All changes preserve the 44px
touch targets and high-contrast requirements the surface is built around.

- **StopListItem** — status pills onto the DS Badge pairs (pending amber,
  in-progress brand tint, done success tint, skipped neutral); sequence tag
  set in mono on token fill; metadata flags drop the 🔥 emoji for a
  warning-tint "Hotspot" pill (compactor/trash tokened); queued/conflict sync
  lines drop ⏳/⚠ for plain warning/danger-toned text (test regexes assert on
  the words, which are unchanged).
- **StopChecklist** (shared checklist) + the wizard's inline cleaning-task
  cards — checked state onto `--color-success-tint`, checkbox accent onto
  `--color-success`, surfaces/borders tokened.
- **StopDetail** (1,400-line wizard) — full color pass:
  - Not-started view: card onto surface tokens with hairline border
    (rounded-lg per DS shape scale, was rounded-xl), status-dot overlay onto
    brand/warning tokens, mono stop number, Start Stop onto brand-700/800
    with 55% disabled opacity.
  - Read-only view: skipped/completed banners onto danger/success tints;
    "⚠ Skipped" → "Skipped".
  - Wizard: REPORT SAFETY / REPORT INFRASTRUCTURE buttons onto
    warning/brand tints with emoji dropped from labels (⚠️/🏗); spot-check
    toggle onto brand; safety modal fully tokened (graphite scrim, overlay
    shadow, danger hazard checkboxes, severity low/medium/high →
    warning/amber/danger tokens, Skip Stop / Save Hazards gate states as
    danger/warning fills at 60% when locked); infra modal same treatment in
    brand; photo buttons drop 📷/📸; hotspot toggle "🔥 Hotspot" →
    "✓ Hotspot"; after-photo/Finish onto `--color-brand-dark`.
- **TodayRouteView** — error/empty/conflict/completed banners onto semantic
  tokens (🎉/📋 dropped); Start Route onto brand; map card + list card onto
  surface tokens with DS radius; next-suggested `#seq` in mono; slate-*
  strays normalized to the gray/token scale.
- **UlLayout** — column width onto `--width-reading` (640px, was max-w-xl
  576px) per the DS layout spec.

## Why
- Step 4 tranche 2. The field surface was quiet (no in-flight structural
  branches touch it) and is the worker-facing half of the product; the DS
  explicitly replaces decorative emoji with dots, pills, and text labels.

## Verification
- `pnpm build` clean; `vitest run` 63/63 (StopWizard + StopListItem suites
  assert on text/roles — copy preserved through the emoji removals).
- Rendered via dev server + dev bypass with a stubbed `/api/ul/todays-run`
  (mobile 430px viewport): route list shows all four status pills, mono
  sequence tags, tokened metadata pills, warning-toned queued line; wizard
  shows tinted report buttons, token task cards, brand action stack; safety
  modal shows danger callout, hazard grid, gated footer states.
- One mid-verification error ("cannot read length") was traced to the network
  stub returning `{}` for the photos endpoint, not to these changes.

## Files touched
- `frontend/src/components/today-route/StopListItem.tsx`
- `frontend/src/components/today-route/StopChecklist.tsx`
- `frontend/src/components/today-route/StopDetail.tsx`
- `frontend/src/components/today-route/UlLayout.tsx`
- `frontend/src/components/TodayRouteView.tsx`
