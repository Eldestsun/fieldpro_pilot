# 2026-09-08 — ISSUE-064: clear the S1-10 OSV HIGH/CRITICAL dependency gate

## What changed
Bumped three dependencies to clear every HIGH/CRITICAL advisory blocking the
`dependency-audit` CI gate (S1-10 policy). maplibre-gl was the trigger; refreshing
the scan surfaced newly-published js-yaml and multer advisories against versions
already in the lockfiles (classic OSV drift — the advisory DB gained entries
between PR runs). All three are within-major, low-risk bumps.

| Package | From | To | Advisory | Sev |
|---|---|---|---|---|
| `maplibre-gl` (frontend, direct) | 5.14.0 | ^6.4.1 → **6.8.0** | GHSA-jrc7-96c5-q579 XSS sanitizer bypass | CRITICAL 10.0 |
| `multer` (backend, direct) | 2.2.0 | ^2.3.0 → **2.3.0** | GHSA-535w-7cp7-47q4, GHSA-qfvm-cv95-jqjf, GHSA-qvfw-j98x-7q72, GHSA-wc9g-mqfw-jrwm (DoS / limit-bypass) | HIGH 7.5 ×4 |
| `js-yaml` (both, override `js-yaml@4`) | 4.3.1 | **4.3.2** | GHSA-2883-xcg3-v3hh (merge-key CPU DoS) | HIGH 7.5 |

## Per-package notes
- **maplibre-gl 5→6 (only patched in 6.4.1, no 5.x backport).** Used in exactly one
  surface: `frontend/src/components/work/ULRouteMap.tsx`. v6's breaking changes are
  mostly structural and don't touch the APIs this component uses (`Map`,
  `NavigationControl`, `addControl`, zoom handlers, `LngLatBounds`, `Popup`, `Marker`,
  `fitBounds`, `remove`). The one code change: v6 is **ESM-only with no default
  export**, so the import switched `import maplibregl from` → `import * as maplibregl
  from`. Vite is ESM-native (no bundler change). v6 requires WebGL2 (universal) +
  ES2022 — fine for the pilot.
- **multer 2.2.0 → 2.3.0** (minor, all four advisories fixed in 2.3.0). Backend
  photo/file-upload path (`ulRoutes.ts`, `tenantRoutes.ts`). API-compatible; the full
  backend suite (incl. the ISSUE-063 upload/evidence tests) passes on 2.3.0.
- **js-yaml 4.3.1 → 4.3.2** (patch) via the existing `pnpm.overrides["js-yaml@4"]`
  in both `backend/package.json` and `frontend/package.json` — bumped the override
  floor from `^4.3.1` to `^4.3.2`. No other resolution moved.

## Verification
- Installs done with the pinned `pnpm@10.14.0` (backend `packageManager`); both
  lockfiles stay at `lockfileVersion: '9.0'`. Diffs are confined to the three target
  subtrees — no unrelated resolution drift (the earlier js-yaml-manifest-drift trap
  did not recur; the override pinned the bump exactly to 4.3.2).
- `frontend`: `pnpm run build` (tsc + vite) clean; `maplibre-gl/dist/maplibre-gl.css`
  resolves.
- `backend`: `tsc --noEmit` clean; **215/215** tests pass (multer upload path).
- Authoritative: CI `dependency-audit` green = zero HIGH/CRITICAL remaining.
- Recommended pre-pilot follow-up: a visual smoke of the route map (markers, hover
  popups, fit-bounds) on a run with geocoded stops.

## Files touched
- `frontend/package.json`, `frontend/pnpm-lock.yaml`
- `frontend/src/components/work/ULRouteMap.tsx` (namespace import)
- `backend/package.json`, `backend/pnpm-lock.yaml`
- `docs/changelog/security/2026-09-08-issue-064-osv-gate-clear.md` (this entry)

## Downstream
- Unblocks the `dependency-audit` CI gate for all open/future PRs.
- The 6 remaining LOW/MODERATE advisories (body-parser, qs ×2, @humanfs/node,
  @vitest/mocker, vitest) are informational (non-blocking) and left as-is.
