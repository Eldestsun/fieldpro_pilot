# 2026-09-08 — ISSUE-064: bump maplibre-gl 5.14.0 → 6.x (CRITICAL advisory)

## What changed
Upgraded `maplibre-gl` from `^5.14.0` to `^6.4.1` (resolved 6.8.0) to clear a
newly-published CRITICAL advisory that was failing the `dependency-audit` CI gate
on every PR repo-wide.

- **GHSA-jrc7-96c5-q579** — *MapLibre GL JS: XSS Sanitizer Bypass in
  `DOM.sanitize()` via Live NamedNodeMap Removal Skip*. CVSS **10.0 (CRITICAL)**.
  `DOM.sanitize()` iterated the live `elem.attributes` `NamedNodeMap` while calling
  `removeAttribute()` in the same loop, skipping the adjacent attribute and letting
  a crafted attribute survive sanitization → XSS. Vulnerable range `<= 6.4.0`;
  **only** patched version is **6.4.1** (no 5.x backport), so the fix requires the
  5→6 major bump.

## Why now (not deferred)
The S1-10 `dependency-audit` job gates merges on any HIGH/CRITICAL advisory. This
one is CRITICAL, so it blocked *every* PR — including the ISSUE-037 migration —
until fixed. `maplibre-gl` is a direct frontend dependency used in exactly one
surface: `frontend/src/components/work/ULRouteMap.tsx` (the UL route map).

## v6 migration impact — minimal
maplibre-gl v6's breaking changes are mostly structural and don't touch the APIs
this component uses (`Map`, `NavigationControl`, `addControl`, the zoom handlers,
`LngLatBounds.extend`, `Popup.setText`, `Marker` w/ `element`/`setLngLat`/`setPopup`/
`addTo`/`remove`/`togglePopup`, `fitBounds`, `map.remove`). The only code change:

- **ESM-only + no default export.** v6 drops the UMD bundle and the default export.
  Changed `import maplibregl from "maplibre-gl"` → `import * as maplibregl from
  "maplibre-gl"`. Vite is ESM-native, so no bundler config change was needed.

Other v6 requirements — **WebGL2** (was WebGL1; universal on modern devices) and an
**ES2022** target — are both fine for the pilot's target devices/build.

## Verification
- `pnpm install` → `maplibre-gl` resolved to **6.8.0** (satisfies `^6.4.1`, past the
  patched 6.4.1). Lockfile net-shrinks (v6 dropped transitive deps);
  `frontend/package.json` diff is the single `maplibre-gl` line; lockfileVersion
  unchanged.
- `pnpm run build` (tsc + vite) **clean**. `maplibre-gl/dist/maplibre-gl.css` still
  resolves.
- Authoritative check: CI `dependency-audit` (the S1-10 OSV gate) — green confirms
  the CRITICAL is cleared and no new HIGH/CRITICAL was pulled in.
- Recommended before relying on the map in the pilot: a visual smoke of the route
  map (markers, hover popups, fit-bounds) on a run with geocoded stops.

## Files touched
- `frontend/package.json` (maplibre-gl `^5.14.0` → `^6.4.1`)
- `frontend/pnpm-lock.yaml` (regenerated)
- `frontend/src/components/work/ULRouteMap.tsx` (namespace import)
- `docs/changelog/security/2026-09-08-issue-064-maplibre-gl-critical-bump.md` (this entry)

## Downstream
- Unblocks the `dependency-audit` CI gate for all open/future PRs.
