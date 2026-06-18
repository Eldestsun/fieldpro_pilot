# 2026-06-17 — Dependency audit: clear HIGH multer DoS advisory blocking CI

## What changed
- **backend/** — bumped direct dep `multer` `^2.1.1` → `^2.2.0` (resolves
  2.1.1 → 2.2.0), clearing HIGH advisory GHSA-72gw-mp4g-v24j (CVE-2026-5079,
  Denial of Service via deeply nested field names; vulnerable `>=1.0.0 <2.2.0`,
  patched `>=2.2.0`).
- Regenerated `backend/pnpm-lock.yaml`; passes `pnpm install --frozen-lockfile`.
- **frontend/** — no change required: audit already exits 0 (3 low, 1 moderate,
  zero HIGH/CRITICAL). The three frontend HIGH advisories cleared by the
  2026-06-15 refresh remain resolved.

## Why
- The `dependency-audit` CI job (`pnpm audit --audit-level=high`, both workspaces)
  was failing again — the second occurrence. The first (2026-06-15, PR #33,
  `f6f3089`) cleared four newly-published HIGH advisories (`form-data`, `ws`,
  `vite`). This failure is a *different*, separately-published advisory:
  `multer` GHSA-72gw-mp4g-v24j (CVE-2026-5079).
- **multer is a direct backend dependency, already on the 2.x major** (`^2.1.1`).
  The patched floor `>=2.2.0` is within that same major, so the fix is a **minor**
  bump — not a major-version change and not a founder decision. (The advisory's
  `>=1.0.0` lower bound is just the bottom of the vulnerable range; the installed
  version was 2.1.1.)
- **Root cause class: A** (real vuln, fix available, just not applied). The
  `--audit-level=high` gate is the deliberate, documented policy
  (`docs/security/dependency-audit-2026-05-13.md`: Critical/High must be fixed;
  Moderate/Low documented). Correct remediation is to update the dep — done here
  via a direct version bump, matching the prior fix's pattern for direct deps
  (the `vite` bump) rather than a `pnpm.overrides` floor (used for transitives).
- The gate is **not** weakened: audit still runs at `--audit-level=high`, still
  reports residual non-blocking findings, and will still fail the build on any
  future HIGH or CRITICAL advisory.

## Proof (exact CI command: `pnpm audit --audit-level=high`)

### BEFORE (backend failing)
```
backend/   → 5 vulnerabilities found  | Severity: 1 low | 3 moderate | 1 high   | exit 1
  HIGH: multer  >=1.0.0 <2.2.0  (.>multer)   GHSA-72gw-mp4g-v24j / CVE-2026-5079

frontend/  → 4 vulnerabilities found  | Severity: 3 low | 1 moderate           | exit 0
```

### AFTER (passing)
```
backend/   → 3 vulnerabilities found  | Severity: 1 low | 2 moderate           | exit 0
frontend/  → 4 vulnerabilities found  | Severity: 3 low | 1 moderate           | exit 0
```
Zero HIGH/CRITICAL in either workspace. Remaining low/moderate are reported but
non-blocking per the documented policy — left untouched to keep this change
scoped to the CI-breaking cause.

## Verification
- `pnpm audit --audit-level=high` → exit 0 in both workspaces (above).
- `pnpm install --frozen-lockfile` → clean in backend (CI parity).
- Backend build (`pnpm run build`, `tsc`): clean.
- Backend test suite (`pnpm test`, local `fieldpro_db`): **114 passed, 0 failed**.

## Files touched
- `backend/package.json`
- `backend/pnpm-lock.yaml`
- `docs/changelog/security/2026-06-17-dependency-audit-multer.md` (this file)
