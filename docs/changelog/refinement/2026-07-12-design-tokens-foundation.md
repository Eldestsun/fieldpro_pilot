# 2026-07-12 — Design-system token foundation (Invaria BASELINE DS, step 1)

## What changed
- Adopted the token layer of the Claude Design project **"Invaria BASELINE Design
  System"** (`38ee63fc-c984-4f50-979d-7eb24132ef23`) into the frontend.
  `src/styles/tokens.css` is now an @import manifest (mirroring the design
  project's `styles.css`) over five new files in `src/styles/tokens/`:
  `fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `shape.css`.
  Four are verbatim from the design project; `fonts.css` carries one local
  change (below).
- Brand fonts now actually load: **Inter** (400–800) and **IBM Plex Mono**
  (400–600) self-hosted via `@fontsource/inter` and `@fontsource/ibm-plex-mono`.
  The design system ships a Google Fonts `@import`; that was swapped for
  self-hosting because the field surface is offline-first and must not depend
  on fonts.googleapis.com. The DS readme explicitly sanctions this swap.
- Latin woff2 subsets (8 files, ~166 KB) added to the PWA service-worker
  precache (`vite.config.ts` globPatterns) so typography survives offline
  sessions. Precache: 7 → 15 entries.
- `index.css` base styles wired to tokens: `:root`/`body` font-family now
  `var(--font-sans)` (previously hardcoded system-ui — Inter was named in the
  old tokens.css but never loaded or applied), body color/background →
  `var(--text-body)` / `var(--surface-app)`, headings → `var(--text-heading)`.

## Why
- Step 1 of adopting the reverse-engineered design system: land the token
  foundation additively so capability-build surfaces can compose it, before any
  primitive repointing (step 2) or per-surface polish (step 4).
- Several DS token names (`--font-sans`, `--font-mono`, `--text-*`,
  `--radius-*`, `--tracking-*`, `--shadow-sm`) intentionally coincide with
  Tailwind 4 theme variables, so these unlayered `:root` definitions also
  re-point the matching Tailwind utilities. Radius and text sizes are
  value-identical to Tailwind defaults (no visual change); `shadow-sm` (7 uses)
  flattens slightly and `tracking-wide/widest` widen slightly — both on-design.

## Verification
- `pnpm build` clean; dist CSS confirms token definitions cascade over
  Tailwind's layered defaults; sw.js precaches the 8 latin font files.
- `vitest run`: 10 files / 54 tests pass. `pnpm lint`: 173 pre-existing
  problems, identical count on main; `vite.config.ts` lints clean.
- Rendered the built app (vite preview + DevTools): body computes to Inter,
  `document.fonts` confirms Inter 400/600 loaded, `--surface-app`/`--radius-md`
  resolve. Plex Mono registered but not yet consumed (applied in step 3).

## Files touched
- `frontend/src/styles/tokens.css` (now a manifest)
- `frontend/src/styles/tokens/{fonts,colors,typography,spacing,shape}.css` (new)
- `frontend/src/index.css`
- `frontend/vite.config.ts`
- `frontend/package.json`, `frontend/pnpm-lock.yaml` (@fontsource/inter, @fontsource/ibm-plex-mono)
