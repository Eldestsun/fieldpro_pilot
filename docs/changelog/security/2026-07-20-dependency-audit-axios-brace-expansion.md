# 2026-07-20 — Dependency audit: clear HIGH axios + brace-expansion advisories blocking CI

**Branch:** `chore/deps-osv-axios-brace-expansion`
**Type:** Security — dependency audit (advisory remediation)
**Scope:** Lockfiles + `package.json` overrides only. No app code, no schema, no migration.

## What changed
- **backend/** — bumped direct dep `axios` `^1.15.2` → `^1.18.0` (resolves
  1.16.1 → 1.18.1), clearing the HIGH advisory GHSA-gcfj-64vw-6mp9 and its nine
  siblings (all CVSS 8.3, fixed in `1.18.0`).
- **backend/** — added `pnpm.overrides` `"brace-expansion@1": "1.1.16"`, clearing
  the transitive HIGH ReDoS advisory GHSA-3jxr-9vmj-r5cp (fixed in `1.1.16`).
- **frontend/** — added `pnpm.overrides` `"brace-expansion@1": "1.1.16"`,
  `"brace-expansion@2": "2.1.2"`, `"brace-expansion@5": "5.0.7"` — all three major
  lines were present (1.1.14, 2.1.0, 5.0.6), each patched at its own line for the
  same GHSA-3jxr-9vmj-r5cp.
- Regenerated `backend/pnpm-lock.yaml` and `frontend/pnpm-lock.yaml`; both pass
  `pnpm install --frozen-lockfile`.

## Why
- The `dependency-audit` CI job (osv-scanner + `.github/scripts/osv-severity-gate.py`,
  HIGH/CRITICAL-only gate per S1-10) went red on `main` with no code change — the
  advisories were **newly published to the OSV database after `main` was last green**
  (PR #91 merged 2026-07-16). No commit has landed on `main` since; the failure is a
  freshly-published-advisory event, the same class as the 2026-06-15 / 2026-06-17
  refreshes, not a regression introduced by a change.
- **axios is a direct backend dependency already on the 1.x major** (`^1.15.2`). The
  patched floor `1.18.0` is within that same major, so the fix is a **minor** bump —
  not a major-version change and not a founder decision.
- **brace-expansion is transitive** across three major lines; a single blanket
  override would force semver-incompatible majors onto one version, so it is pinned
  per-major-line (`@1`/`@2`/`@5`) to each line's patched release — matching the
  established `pnpm.overrides` pattern for transitives (commit 26a209f).
- The gate is **not** weakened: it still runs osv-scanner over both lockfiles, still
  reports residual non-blocking Low/Medium, and still fails the build on any future
  HIGH or CRITICAL advisory.

## Proof (exact CI gate: `osv-scanner scan --lockfile=backend/... --lockfile=frontend/... | osv-severity-gate.py`)

### BEFORE (failing — gate exit 1)
```
BLOCKING — HIGH/CRITICAL advisories: 14
  ✗ axios 1.16.1 (backend)          GHSA-gcfj-64vw-6mp9 HIGH cvss=8.3  (+9 siblings @ cvss 8.3)
  ✗ brace-expansion 1.1.14 (backend)   GHSA-3jxr-9vmj-r5cp HIGH cvss=7.7
  ✗ brace-expansion 1.1.14/2.1.0/5.0.6 (frontend) GHSA-3jxr-9vmj-r5cp HIGH cvss=7.7 (x3)
Dependency gate FAILED (S1-10: High/Critical must be clean).
```

### AFTER (passing — gate exit 0)
```
Informational (Low/Medium — not blocking): 1
  - body-parser GHSA-v422-hmwv-36x6 severity=LOW cvss=3.7 [backend]
Dependency gate PASSED — no High/Critical advisories.
```
Zero HIGH/CRITICAL in either workspace. The one remaining Low `body-parser` finding
is pre-existing and non-blocking per the documented policy — left untouched to keep
this change scoped to the CI-breaking cause.

## Verification
- osv-scanner + severity gate over both lockfiles → **exit 0** (above).
- `pnpm install --frozen-lockfile` → clean in backend and frontend (CI parity).
- Backend build (`pnpm run build`, `tsc`): clean, axios resolved to 1.18.1.

## Files touched
- `backend/package.json`
- `backend/pnpm-lock.yaml`
- `frontend/package.json`
- `frontend/pnpm-lock.yaml`
- `docs/changelog/security/2026-07-20-dependency-audit-axios-brace-expansion.md` (this file)
