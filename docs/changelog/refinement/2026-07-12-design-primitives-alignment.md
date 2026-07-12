# 2026-07-12 — Ops* primitives aligned to design-system tokens (Invaria BASELINE DS, step 2)

## What changed
- All nine `components/ui/` primitives repointed from hardcoded Tailwind palette
  classes to design-system tokens, using Tailwind 4's `bg-(--token)` var
  shorthand and keeping the existing Tailwind/`cn()` idiom (the DS ships
  inline-style JSX; its specs were transcribed, not adopted):
  - **OpsButton** — variants per DS Button spec. Values identical for
    primary/secondary/outline; `danger` shifts red-500 → `--color-danger`
    (#e02424, hover #c81e1e per spec). Disabled opacity 60 → 55.
  - **OpsBadge** — variants per DS Badge spec. `success`/`danger` text deepens
    to the status tokens; `warning` moves orange → amber (`--color-warning`).
    New `pending` variant added from the spec.
  - **OpsCard / OpsTable / DataTable / OpsLayout** — surfaces, borders, header
    and text grays → `--surface-*`, `--border-*`, `--text-*` aliases;
    `shadow-sm` → `shadow-(--shadow-card)` on cards/tables.
  - **ConfirmDialog** — now composes OpsButton (outline cancel; danger/primary
    confirm per DS Dialog spec — warning intent maps to the brand action, and
    no current caller uses warning). Graphite scrim `rgba(17,24,39,0.5)`,
    `--shadow-overlay`, 400px max width.
  - **OfflineStatusBar** — DS StatusBar treatment: solid status dot + text
    label replaces the emoji prefix (🔴/🟡/🟢/🟠); state colors from status
    tokens (conflict orange pair hardcoded, as in the spec); pulse on syncing.
    Copy unchanged.
  - **ConflictResolutionModal** — Chakra-era hex → tokens; conflict palette
    aligned to the DS StatusBar conflict family.

## Why
- Step 2 of the design-system adoption track: one source of truth for
  primitive styling so capability-build surfaces compose the primitives and
  inherit the brand automatically; per-surface polish (step 4) then has a
  stable base.

## Verification
- `pnpm build` clean; dist CSS confirms every `*-(--token)` utility generated
  (including the composed `--tw-shadow:var(--shadow-card)` and
  `color-mix` /20 border modifiers).
- `vitest run`: 54/54 pass — OfflineStatusBar tests assert on text, which is
  unchanged by the dot-for-emoji swap.
- Rendered `/admin/pools` via dev server + frontend dev bypass: OpsLayout,
  OpsButton (computed #1d4ed8, Inter), DataTable headers (`--text-muted`,
  0.05em tracking) all resolve from tokens.

## Files touched
- `frontend/src/components/ui/OpsButton.tsx`
- `frontend/src/components/ui/OpsBadge.tsx`
- `frontend/src/components/ui/OpsCard.tsx`
- `frontend/src/components/ui/OpsTable.tsx`
- `frontend/src/components/ui/DataTable.tsx`
- `frontend/src/components/ui/OpsLayout.tsx`
- `frontend/src/components/ui/ConfirmDialog.tsx`
- `frontend/src/components/ui/OfflineStatusBar.tsx`
- `frontend/src/components/ui/ConflictResolutionModal.tsx`
