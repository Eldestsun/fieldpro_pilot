# 2026-05-10 — R5 Surface 1: App Shell + Navigation

## What changed
- Installed Tailwind CSS v4 (`tailwindcss`, `@tailwindcss/vite`) and utility libs (`clsx`, `tailwind-merge`)
- Wired `@tailwindcss/vite` plugin into `vite.config.ts`
- Added `@import "tailwindcss"` to `index.css`
- Created `src/styles/tokens.css` with brand, status, surface, typography, and spacing design tokens
- Created `src/lib/utils.ts` with `cn()` helper (clsx + tailwind-merge)
- Rewrote `App.tsx` shell — zero inline `style={{}}` props remain
- Fixed top nav bar: BASELINE wordmark, role-appropriate NavLinks with active state, user identity + role badge, sign-out button
- Mobile hamburger menu (hidden on md+) with slide-down panel showing all nav items and sign-out
- Role badges: "Operations" (red) for Admin, "Lead" (blue pill) for Lead-only
- Loading state uses Tailwind layout instead of inline styles

## Why
- R5 Enterprise UI/UX Rebuild — Surface 1 establishes the design system foundation (Tailwind) and replaces the dev-grade inline-style nav shell with an enterprise-standard layout

## Files touched
- `frontend/package.json` — added tailwindcss, @tailwindcss/vite, clsx, tailwind-merge
- `frontend/pnpm-lock.yaml` — updated lockfile
- `frontend/vite.config.ts` — added tailwindcss() plugin
- `frontend/src/index.css` — added @import "tailwindcss" and tokens.css
- `frontend/src/styles/tokens.css` — new: design tokens
- `frontend/src/lib/utils.ts` — new: cn() utility
- `frontend/src/App.tsx` — full shell rewrite with Tailwind classes
