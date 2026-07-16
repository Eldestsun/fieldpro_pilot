# 2026-07-15 — CI: replace broken `pnpm audit` dependency gate with osv-scanner (severity-gated) + flush all advisories to zero

## What changed
- The `dependency-audit` CI job (S1-10 vulnerability gate) was failing on **every
  branch, including `main`**. `pnpm audit --audit-level=high` calls npm's legacy
  audit endpoint (`/-/npm/v1/security/audits`), which npm **retired** — it now
  returns HTTP **410** ("This endpoint is being retired. Use the bulk advisory
  endpoint instead."). pnpm 10.14.0 (CI) and 10.23.0 both hit the dead endpoint and
  exit non-zero, so the gate red-failed regardless of actual advisories. No
  dependency change triggered it; it is a registry/tooling break.
- Replaced the two `pnpm install` + `pnpm audit` steps with **osv-scanner v2.4.0**,
  which reads `backend/pnpm-lock.yaml` + `frontend/pnpm-lock.yaml` against the OSV
  database and has **no dependency on npm's audit endpoint**.
- osv-scanner's own exit code fails on **any** advisory (Low/Medium included), which
  is stricter than the documented S1-10 posture. Added
  `.github/scripts/osv-severity-gate.py` to parse osv-scanner's JSON and fail **only
  on HIGH or CRITICAL** (CVSS ≥ 7.0, or GHSA `database_specific.severity` in
  {HIGH, CRITICAL}), leaving Low/Medium informational. **The gate's posture is
  unchanged** — only the tool underneath it changed.
- **Flushed all remaining advisories to zero** via `pnpm.overrides` (the repo's
  existing remediation pattern), pinned with `^` to stay within the same major (no
  breaking bumps): backend `qs` ^6.14.2→^6.15.2, added `js-yaml` ^4.2.0 + `diff`
  ^4.0.4; frontend `js-yaml` →^4.2.0, added `@babel/core` ^7.29.6 + `react-router`
  ^7.15.1. osv-scanner now reports **"No issues found"** across both lockfiles (was
  7 Low/Medium). The gate isn't just working — the tree is clean.

## Why
- A security gate that hard-fails for an infrastructure reason is worse than useless:
  it blocks all merges while proving nothing about vulnerabilities. This restores a
  real, working HIGH/CRITICAL gate.
- osv-scanner (Google, OSV database) does not route through npm's advisory API, so it
  is immune to this class of endpoint retirement.
- Kept exactly on-policy rather than accepting osv-scanner's any-vuln default —
  silently tightening the gate to block Low/Medium would be an undocumented posture
  change. (Moot now that the tree is flushed to zero, but the gate must stay
  policy-correct for future advisories that land as Low/Medium.)

## Fail-safe behavior
- Scan step uses `... --format=json > osv-report.json || true`: the `|| true`
  swallows **only** osv-scanner's any-advisory non-zero exit. A genuine tool/network
  failure leaves no (or malformed) report, and the gate script exits **2 (fail
  loud)** on a missing/unparsable report — so a broken scanner can never silently
  pass the gate.

## Files touched
- `.github/workflows/ci.yml` — `dependency-audit` job rewritten (osv-scanner + gate)
- `.github/scripts/osv-severity-gate.py` (new) — HIGH/CRITICAL severity gate
- `backend/package.json` + `backend/pnpm-lock.yaml` — `qs`/`js-yaml`/`diff` overrides
- `frontend/package.json` + `frontend/pnpm-lock.yaml` — `js-yaml`/`@babel/core`/`react-router` overrides
- `docs/changelog/ops/2026-07-15-ci-dependency-audit-osv-scanner.md` (this file)

## Verification (local, osv-scanner 2.4.0 against the real lockfiles)
- Gate script: injected a synthetic CVSS 8.1 (High) → gate **FAILS** (exit 1),
  naming the blocking advisory; missing report → exit **2** (fail loud, never a
  silent pass).
- Post-flush scan of both lockfiles → **"No issues found"** (0 advisories) → gate
  **PASSES** (exit 0).
- No breakage from the bumps: backend `tsc` build clean + **182/182** canonical
  tests; frontend typecheck clean + **64/64** vitest + `vite build` succeeds
  (exercises the babel/rollup/react-router bumps).
- `ci.yml` parses (all four jobs intact: test-backend, build-frontend,
  dependency-audit, build-docker-images).

## Scope
- CI-infra + a dependency-version flush. No application code or schema change.
  Unblocks the `dependency-audit` gate on `main` and every open PR (this was the
  second, external, blocker on PR #90 — the first, a `runtimeIdentityLeak`
  classification for the new `/bases` route, was fixed on that feature branch).
- The dependency bumps are folded in deliberately: this branch's whole concern is
  "dependency-audit → green," and green means both a working gate AND a clean tree.
