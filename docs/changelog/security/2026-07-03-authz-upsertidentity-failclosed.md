# 2026-07-03 — authz.ts upsertIdentity fails closed (scoped unfreeze; last first-org fallback)

**Type:** Security / labor-safety (worker-identity surface) ·
**Branch:** `security/authz-upsertidentity-failclosed`
**Authorization:** founder-authorized scoped unfreeze of `authz.ts`, for `upsertIdentity`'s
org resolution ONLY. **Specs:** ISSUE-013 card + KNOWN_ISSUES § PATTERN-001 (the fail-closed
pattern this mirrors); org-bridge changelog 2026-07-02 (where this twin was found and
reported as frozen).

## What changed

`backend/src/authz.ts § upsertIdentity` — the LAST live instance of the first-org fallback
pattern (`UNION ALL … ORDER BY id LIMIT 1`) is removed. The identity-cache write now
resolves the caller's org ONLY by an `organizations.tenant_uuid` match, exactly like
`resolveNumericOrgId` and `writeAuditLog`:

- no `tid` on the token → **skip the write** + structured `auditWarn`
  (`upsertIdentity_skipped_no_tid`);
- `tid` matches no organization → **skip the write** + structured `auditWarn`
  (`upsertIdentity_skipped_unknown_tenant`);
- match → upsert into THAT org, unchanged.

**Why skip+warn rather than throw:** `upsertIdentity` is fire-and-forget with an internal
catch — its only caller (`requireAuth`, authz.ts:221) ignores the result, so a throw would
be swallowed and indistinguishable from a skip. Explicit skip + the file's own structured
warn helper keeps the legitimate auth request working (the cache is not authorization —
per-request org scoping is separately fail-closed via ISSUE-013) while making the
misconfiguration visible in logs, never silent. The invariant either way: **no
identity_directory row is ever written to a guessed org** — cross-org worker-identity
contamination is structurally impossible.

Two testability enablers, flagged for review: the function is now `export`ed and returns
its internal promise (`Promise<void>`, never rejects — internal catch retained) so the gate
test can await and assert on it. The call site and its fire-and-forget behavior are
byte-unchanged.

## Tripwire extended

`backend/tests/canonical/orgFailClosed.test.ts` gains two runtime assertions:
- **authz twin guard:** `upsertIdentity` with an unmatched tenant writes **zero**
  `identity_directory` rows in org 1 — red message names the regression ("cross-org
  WORKER-IDENTITY contamination; the first-org fallback is back").
- **legit path guard:** a tenant matching org 1's seeded `tenant_uuid` still upserts its
  row (into its own org), proving the fix targets the fallback, not the cache.

Red-demo performed: temporarily reintroducing the fallback turned the twin guard red
(`expected 0, got 1` — the fallback genuinely wrote the contaminated row); restored → 8/8.

## Verification

- Gate file: 8/8 green (6 prior + 2 new).
- Full suite: **140 passed, 15 failed (155 total)** — failure set byte-identical to the
  pre-change baseline (the 15 known debt); zero new failures.
- Scope: `git diff` touches exactly `backend/src/authz.ts` (both hunks inside
  `upsertIdentity` + its declaration comment) and the gate test — nothing else in
  `authz.ts`, no signature-visible change to callers, no schema/RLS/grant/migration.
- `tsc --noEmit` clean.

## Files touched

- `backend/src/authz.ts` (upsertIdentity org resolution only — scoped unfreeze)
- `backend/tests/canonical/orgFailClosed.test.ts` (two identity-path assertions)
- `docs/changelog/security/2026-07-03-authz-upsertidentity-failclosed.md` (this file)
