# 2026-07-03 — CI env parity: throwaway DEV_OID_KEY for the test step

**Type:** Ops / CI config only (no app code, no oidCipher.ts, no prod secret, no KV path) ·
**Branch:** `ci/dev-oid-key-env-parity` (based on `origin/main` @ `9f05c72`; deliberately
independent of the still-open authz PR so it can merge FIRST)
**Spec:** the 2026-07-03 CI-vs-local recon (verdict `CI-MISSING-DEV_OID_KEY`).

## What changed

`.github/workflows/ci.yml`: one new step before "Run tests" —
`Generate throwaway DEV_OID_KEY` → `echo "DEV_OID_KEY=$(openssl rand -hex 32)" >> "$GITHUB_ENV"`.

## Why

- `DevStaticKeyAdapter` (`src/lib/oidCipher.ts:99-106`) requires `DEV_OID_KEY` as exactly
  64 hex chars (32 bytes) and throws otherwise. The key lives locally in gitignored
  `backend/.env`; CI's test env never had it, so **24 tests died at env validation**
  (every `ensureVisitForRouteRunStop` → `encrypt(OID)` path + oidCipher's own tests)
  before touching a DB row — CI 115/38 vs local 138/15.
- **Throwaway-per-run is correct** (dispatch-preferred, and confirmed): nothing encrypted
  with the dev key outlives the ephemeral CI Postgres, and the fixed-key check found no
  hardcoded ciphertext / known-pair assertions — the oidCipher tests generate and
  save/restore their **own** keys around themselves. `openssl rand -hex 32` = 64 hex
  chars, matching the validated format exactly.
- **Not a production secret:** prod selects `AzureKeyVaultAdapter`
  (`NODE_ENV === "production"`, oidCipher.ts § makeAdapter; ISSUE-045 track) — untouched.

## Verification

- Local empirical proof of the throwaway approach: full suite with a freshly generated
  random key (NOT `.env`'s) → **138 passed / 15 failed (153 total)**, **0**
  `DEV_OID_KEY must be` errors, failure set = exactly the DISCOVERY-B debt (audit_log ×7,
  sftpExport ×3, eam_bridge ×2, riskMap ×1, devAuthBypass ×1, loadRouteRunById ×1);
  zero category-(c).
- CI-run proof lands when the founder opens the PR (`pull_request` trigger): expect the
  24 env-validation failures gone and the tally to converge to the local number
  (138/15 on this base; 140/15 once the authz PR #75 adds its two gate tests). If green
  modulo known debt, it is the **first fully-legible CI run in repo history** (GitHub
  API shows zero successful runs ever).

## Files touched

- `.github/workflows/ci.yml`
- `docs/changelog/ops/2026-07-03-ci-dev-oid-key-env-parity.md` (this file)
