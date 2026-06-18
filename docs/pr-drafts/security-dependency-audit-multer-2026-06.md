# PR draft — Dependency audit: clear HIGH multer DoS advisory blocking CI

**Branch:** `security/dependency-audit-multer-2026-06` → `main`
**Title:** `security: bump multer to clear HIGH DoS advisory breaking dependency-audit CI`

---

**SIGNIFICANCE:** Unblocks CI. The `dependency-audit` job is red again — the
**second** occurrence. The first (PR #33, `f6f3089`, 2026-06-15) cleared four
HIGH advisories in `form-data`/`ws`/`vite`. This is a *different*, separately
published advisory: `multer` GHSA-72gw-mp4g-v24j (CVE-2026-5079), a Denial of
Service via deeply nested field names. Patch is available upstream; this applies
it without loosening the gate.

**ROOT CAUSE — class A** (real vuln, fix available, just not applied). The
`pnpm audit --audit-level=high` gate is correctly configured and is the documented
policy (HIGH/CRITICAL block; LOW/MODERATE report only —
`docs/security/dependency-audit-2026-05-13.md`). No threshold change, no allowlist,
no config change is warranted or made. The fix is to update the dep.

**WHAT LANDED:**
- **backend/** — direct dep `multer` `^2.1.1` → `^2.2.0` (resolves 2.1.1 → 2.2.0).
  Clears HIGH GHSA-72gw-mp4g-v24j (CVE-2026-5079). Vulnerable `>=1.0.0 <2.2.0`,
  patched `>=2.2.0`.
- `backend/pnpm-lock.yaml` regenerated; passes `--frozen-lockfile`.
- **frontend/** — no change needed; already exits 0 (zero HIGH/CRITICAL).
- Mechanism matches the prior fix's convention: a **direct version bump** for a
  direct dep (cf. the `vite` bump in PR #33), not a `pnpm.overrides` floor (those
  are for transitives).

**NOT A MAJOR BUMP / NOT A FOUNDER DECISION:** multer was already on the 2.x major
(`^2.1.1`); the patched floor `>=2.2.0` is within that same major, so this is a
minor bump. The advisory's `>=1.0.0` lower bound is just the bottom of the
vulnerable range, not the installed version. No direct dependency's major version
is changed by this PR.

**PROOF — `pnpm audit --audit-level=high` (the exact CI command):**
- BEFORE: backend exit 1 (1 HIGH: multer; + 1 low, 3 moderate); frontend exit 0.
- AFTER: backend exit 0 (1 low, 2 moderate); frontend exit 0 (3 low, 1 moderate).
  Zero HIGH/CRITICAL either side. Full verbatim before/after is in the changelog:
  `docs/changelog/security/2026-06-17-dependency-audit-multer.md`.

**The gate is NOT weakened.** Still runs at `--audit-level=high`, still reports the
residual low/moderate findings, still fails on any future HIGH/CRITICAL.

**VERIFICATION:**
- `pnpm install --frozen-lockfile` clean in backend (CI parity).
- Backend `pnpm run build` (`tsc`): clean.
- Backend `pnpm test` (local `fieldpro_db`): **114 passed, 0 failed.**

**HONEST RESIDUAL:**
- Non-blocking findings intentionally left untouched (scoped to the CI-breaking
  cause): backend residual 1 low + 2 moderate; frontend 3 low + 1 moderate. These
  are reported-not-blocking per the documented policy and out of scope for this fix.
