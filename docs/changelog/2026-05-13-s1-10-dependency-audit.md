# 2026-05-13 — S1-10 Dependency Vulnerability Scan

## What changed

- `backend/package.json`: bumped `axios` ^1.13.2 → ^1.15.2, `multer` ^2.0.2 → ^2.1.1, `uuid` ^13.0.0 → ^13.0.1
- `backend/package.json`: added `pnpm.overrides` for transitive vulnerabilities: `fast-xml-parser >=5.5.7`, `jws ^3.2.3`, `express>path-to-regexp ^0.1.13`, `qs ^6.14.2`, `follow-redirects >=1.16.0`
- `frontend/package.json`: bumped `vite` ^7.1.2 → ^7.3.2
- `frontend/package.json`: added `pnpm.overrides` for transitive vulnerabilities: `rollup >=4.59.0`, `flatted >=3.4.2`, `protocol-buffers-schema >=3.6.1`, `postcss >=8.5.10`, `esbuild >=0.25.0`, `js-yaml >=4.1.1`, `ajv ^6.14.0`, `picomatch >=4.0.4`

### Functional changes adjacent to security

Path-specific pnpm overrides did not resolve the minimatch HIGH findings in the eslint dependency chain. The HIGH advisories were resolved by direct package upgrades:

- `frontend/package.json`: bumped `eslint` ^9.33.0 → ^9.39.4 (ships minimatch 3.1.5, above the `>=3.1.4` patched threshold)
- `frontend/package.json`: bumped `typescript-eslint` ^8.41.0 → ^8.59.3 (updated alongside eslint)

These are devDependency-only bumps within the same major version. See process notes in the audit doc for detail on why path-specific overrides did not work.

- `.github/workflows/ci.yml`: added `dependency-audit` job that runs `pnpm audit --audit-level=high` in both `backend/` and `frontend/` workspaces; fails the build on any HIGH or CRITICAL advisory
- `docs/security/dependency-audit-2026-05-13.md`: full compliance evidence — pre/post finding totals, per-finding resolution table, residual findings with rationale, process notes

## Why

- KCM IT will run their own dependency scan during TPRA review; resolving findings proactively is required before pilot
- Pre-remediation state: 1 CRITICAL + 13 HIGH in backend, 13 HIGH in frontend
- Post-remediation: 0 HIGH/CRITICAL in both workspaces; CI gate added to prevent regression

## Residual findings (accepted)

- **backend LOW** — `diff` via `ts-node>diff` (GHSA-73rr-hh4g-fpgx): dev-only dep, DoS path unreachable in BASELINE usage. Patch path: upgrade ts-node or switch to tsx.
- **frontend MODERATE** — `vite` via `vitest>vite` (GHSA-4w7w-66w2-5vf9): vitest 2.x bundles vite 5.4.21 internally. Fix requires vitest 2.x → 3.x major upgrade. Dev-only, not exposed in production. Patch path: upgrade vitest to ^3.x when stable.

## Files touched

- `backend/package.json`
- `backend/pnpm-lock.yaml`
- `frontend/package.json`
- `frontend/pnpm-lock.yaml`
- `.github/workflows/ci.yml`
- `docs/security/dependency-audit-2026-05-13.md` (new)
- `docs/changelog/2026-05-13-s1-10-dependency-audit.md` (this file)
- `planning/security/SECURITY_SPRINT_1_CODE_GAPS.md` (status updated)
- `planning/security/SECURITY_SPRINT_INDEX.md` (status updated)
