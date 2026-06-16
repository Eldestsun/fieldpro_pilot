# PR draft — Dependency audit refresh: clear newly-published HIGH advisories blocking CI

**Branch:** `security/dependency-audit-refresh-2026-06` → `main`
**Title:** `security: refresh deps to clear HIGH advisories breaking dependency-audit CI`

---

**SIGNIFICANCE:** Unblocks CI on every branch. The `dependency-audit` job has been
red repo-wide — not because any PR introduced a vulnerable dep, but because four
HIGH advisories were published upstream (the `form-data` CRLF advisory landed
2026-06-15, the day this surfaced) and tripped the gate everywhere at once. This
applies the upstream patches so the gate goes green, without loosening it.

**ROOT CAUSE — class A** (real vuln, fix available, just not applied). The
`pnpm audit --audit-level=high` gate is correctly configured and is the documented
policy (HIGH/CRITICAL block; LOW/MODERATE report only —
`docs/security/dependency-audit-2026-05-13.md`). No threshold change, no allowlist,
no config change is warranted or made. The fix is to update the deps.

**WHAT LANDED:**
- **backend/** — `pnpm.overrides` += `form-data: ">=4.0.6"` (transitive
  `axios>form-data` 4.0.5 → 4.0.6). Clears HIGH GHSA-hmw2-7cc7-3qxx (CVE-2026-12143).
- **frontend/**:
  - direct devDep `vite` `^7.3.2` → `^7.3.5`. Clears HIGH GHSA-fx2h-pf6j-xcff.
  - `pnpm.overrides` += `form-data: ">=4.0.6"` (transitive `jsdom>form-data`).
  - `pnpm.overrides` += `ws: ">=8.21.0"` (transitive `jsdom>ws`). Clears HIGH
    GHSA-96hv-2xvq-fx4p.
- Both `pnpm-lock.yaml` regenerated; both pass `--frozen-lockfile`.
- Mechanism matches the existing in-repo convention: `pnpm.overrides` floors for
  transitive deps (cf. `qs`, `follow-redirects`, `rollup`, `esbuild`), direct
  version bump for the direct dep.

**PROOF — `pnpm audit --audit-level=high` (the exact CI command):**
- BEFORE: backend exit 1 (1 HIGH: form-data); frontend exit 1 (3 HIGH: ws,
  form-data, vite).
- AFTER: backend exit 0 (1 low, 2 moderate); frontend exit 0 (3 low, 1 moderate).
  Zero HIGH/CRITICAL either side. Full verbatim before/after is in the changelog:
  `docs/changelog/security/2026-06-15-dependency-audit-refresh.md`.

**The gate is NOT weakened.** Still runs at `--audit-level=high`, still reports the
residual low/moderate findings, still fails on any future HIGH/CRITICAL. A
procurement reviewer can confirm enforcement is intact.

**VERIFICATION:**
- `pnpm install --frozen-lockfile` clean in both workspaces (CI parity).
- Backend `pnpm test` (local `fieldpro_db`): **111 passed, 0 failed.**
- Frontend `pnpm run build` (vite 7.3.5): clean (`tsc -b` + `vite build`).

**HONEST RESIDUAL:**
- Non-blocking findings intentionally left untouched (scoped to the CI-breaking
  cause): backend `diff` (low), `qs` (moderate, GHSA-q8mj-m7cp-5q26),
  `js-yaml` (moderate, GHSA-h67p-54hq-rp68); frontend remaining low/moderate.
  These are reported-not-blocking per the documented policy. If desired, `qs` and
  `js-yaml` can be floored in a follow-up, but they do not block CI and are out of
  scope for this fix.
