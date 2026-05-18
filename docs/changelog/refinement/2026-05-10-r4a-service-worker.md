# 2026-05-10 — R4-A: Service Worker (app shell cache)

## What changed
- Added `vite-plugin-pwa` (v1.3.0) as a dev dependency via pnpm
- Registered `VitePWA` plugin in `vite.config.ts` with `autoUpdate` strategy, glob pre-cache pattern, and `navigateFallback: 'index.html'`
- Created `frontend/public/manifest.json` with BASELINE FieldPro PWA manifest fields

## Why
- Sub-task A of R4 offline-first hardening: the app must load from cache when the device has no network signal
- Without a registered Service Worker the app returns a network error on offline load, making all other offline work moot

## Files touched
- `frontend/package.json` — vite-plugin-pwa added to devDependencies
- `frontend/pnpm-lock.yaml` — updated by pnpm install
- `frontend/vite.config.ts` — VitePWA plugin registered
- `frontend/public/manifest.json` — new PWA manifest
