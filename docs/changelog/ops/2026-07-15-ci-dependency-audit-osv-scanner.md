# 2026-07-15 — CI: replace broken `pnpm audit` dependency gate with osv-scanner (severity-gated)

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

## Why
- A security gate that hard-fails for an infrastructure reason is worse than useless:
  it blocks all merges while proving nothing about vulnerabilities. This restores a
  real, working HIGH/CRITICAL gate.
- osv-scanner (Google, OSV database) does not route through npm's advisory API, so it
  is immune to this class of endpoint retirement.
- Kept exactly on-policy rather than accepting osv-scanner's any-vuln default —
  silently tightening the gate to block Low/Medium would be an undocumented posture
  change (and would itself red the current tree: backend/frontend carry 7
  Low/Medium advisories today — `qs`, `js-yaml`, `diff`, `@babel/core`,
  `react-router` — none High/Critical).

## Fail-safe behavior
- Scan step uses `... --format=json > osv-report.json || true`: the `|| true`
  swallows **only** osv-scanner's any-advisory non-zero exit. A genuine tool/network
  failure leaves no (or malformed) report, and the gate script exits **2 (fail
  loud)** on a missing/unparsable report — so a broken scanner can never silently
  pass the gate.

## Files touched
- `.github/workflows/ci.yml` — `dependency-audit` job rewritten (osv-scanner + gate)
- `.github/scripts/osv-severity-gate.py` (new) — HIGH/CRITICAL severity gate
- `docs/changelog/ops/2026-07-15-ci-dependency-audit-osv-scanner.md` (this file)

## Verification (local, osv-scanner 2.4.0 against the real lockfiles)
- Clean case: both lockfiles scanned → 7 Low/Medium advisories, **0 High/Critical**
  → gate **PASSES** (exit 0). Matches the S1-10 policy exactly.
- Fail case: injected a synthetic CVSS 8.1 (High) into the report → gate **FAILS**
  (exit 1), naming the blocking advisory.
- Fault case: missing report path → gate exits **2** (fail loud), never a silent pass.
- `ci.yml` parses (all four jobs intact: test-backend, build-frontend,
  dependency-audit, build-docker-images).

## Scope
- CI-infra only. No application code, schema, or dependency change. Unblocks the
  `dependency-audit` gate on `main` and every open PR (this was the second, external,
  blocker on PR #90 — the first, a `runtimeIdentityLeak` classification for the new
  `/bases` route, was fixed on that feature branch).
- Follow-up (not this change): the 7 Low/Medium advisories are fixable by minor
  bumps (`qs` 6.15.1→6.15.2, `js-yaml` 4.1.1→4.2.0, `diff` 4.0.2→4.0.4, etc.) —
  worth a routine dependency-refresh card, but they do not block CI.
