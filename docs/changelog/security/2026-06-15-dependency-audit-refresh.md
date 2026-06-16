# 2026-06-15 — Dependency audit refresh: clear newly-published HIGH advisories blocking CI

## What changed
- **backend/** — added `form-data: ">=4.0.6"` to `pnpm.overrides`. Pulls the
  transitive `axios>form-data` from 4.0.5 → 4.0.6, clearing the HIGH advisory
  GHSA-hmw2-7cc7-3qxx (CVE-2026-12143, CRLF injection in multipart field
  names/filenames, CVSS 7.5).
- **frontend/** — three fixes:
  - bumped direct devDep `vite` `^7.3.2` → `^7.3.5` (resolves 7.3.3 → 7.3.5),
    clearing HIGH GHSA-fx2h-pf6j-xcff (`server.fs.deny` bypass on Windows
    alternate paths; vulnerable `>=7.0.0 <=7.3.4`).
  - added `form-data: ">=4.0.6"` override — transitive `jsdom>form-data`, same
    advisory as backend.
  - added `ws: ">=8.21.0"` override — transitive `jsdom>ws` 8.x → 8.21.0,
    clearing HIGH GHSA-96hv-2xvq-fx4p (memory-exhaustion DoS from tiny
    fragments; vulnerable `>=8.0.0 <8.21.0`).
- Regenerated both `pnpm-lock.yaml` files; both pass `pnpm install --frozen-lockfile`.

## Why
- The `dependency-audit` CI job (`pnpm audit --audit-level=high`, both workspaces)
  was failing on **every branch** — a symptom of recently-published advisories,
  not anything introduced by a single PR. `form-data` GHSA-hmw2-7cc7-3qxx was
  published 2026-06-15 (the day the failure surfaced); the `ws` and `vite` 7.x
  advisories are likewise recent. All four blocking findings were HIGH with a
  patched version already available upstream.
- **Root cause class: A** (real vuln, fix available, just not applied). Not a
  threshold problem and not a misconfig — the `--audit-level=high` gate is the
  deliberate, documented policy (see `docs/security/dependency-audit-2026-05-13.md`:
  "Critical and High findings must be fixed before pilot; Moderate/Low are
  documented"). The correct remediation is to update the deps, which is what this
  change does, using the workspaces' existing `pnpm.overrides` convention for
  transitive floors (matching the `qs` / `follow-redirects` / `rollup` / `esbuild`
  entries already present) and a direct version bump for the direct `vite` dep.
- The gate is **not** weakened: the audit still runs at `--audit-level=high`, still
  reports the residual non-blocking findings, and will still fail the build on any
  future HIGH or CRITICAL advisory.

## Proof (exact CI command: `pnpm audit --audit-level=high`)

### BEFORE (failing)
```
backend/   → 4 vulnerabilities found  | Severity: 1 low | 2 moderate | 1 high   | exit 1
  HIGH: form-data  >=4.0.0 <4.0.6  (.>axios>form-data)         GHSA-hmw2-7cc7-3qxx

frontend/  → 8 vulnerabilities found  | Severity: 3 low | 2 moderate | 3 high   | exit 1
  HIGH: ws         >=8.0.0 <8.21.0 (.>jsdom>ws)                GHSA-96hv-2xvq-fx4p
  HIGH: form-data  >=4.0.0 <4.0.6  (.>jsdom>form-data)         GHSA-hmw2-7cc7-3qxx
  HIGH: vite       >=7.0.0 <=7.3.4 (.>vite)                    GHSA-fx2h-pf6j-xcff
```

### AFTER (passing)
```
backend/   → 3 vulnerabilities found  | Severity: 1 low | 2 moderate            | exit 0
frontend/  → 4 vulnerabilities found  | Severity: 3 low | 1 moderate            | exit 0
```
Zero HIGH/CRITICAL in either workspace. Remaining low/moderate (backend `diff`,
`qs`, `js-yaml`; frontend lows + one moderate) are reported but non-blocking, per
the documented policy — intentionally left untouched to keep this change scoped to
the CI-breaking cause.

## Verification
- `pnpm audit --audit-level=high` → exit 0 in both workspaces (above).
- `pnpm install --frozen-lockfile` → clean in both workspaces (CI parity).
- Backend test suite (`pnpm test`, local `fieldpro_db`): **111 passed, 0 failed**.
- Frontend build (`pnpm run build`, vite 7.3.5): clean (`tsc -b` + `vite build` OK).

## Files touched
- `backend/package.json`
- `backend/pnpm-lock.yaml`
- `frontend/package.json`
- `frontend/pnpm-lock.yaml`
- `docs/changelog/security/2026-06-15-dependency-audit-refresh.md` (this file)
