# 2026-05-13 — S1-11 Auth Token Claim Validation

## What changed
- `backend/src/authz.ts`:
  - JWKS cache TTL raised from 10 min to 1 hour (`cacheMaxAge: 60 * 60 * 1000`)
  - Added exported `assertClaims(payload: JwtPayload)` function — validates `aud` (must match configured client ID or `api://` prefixed form), `iss` (v2.0 Entra endpoint only — stricter than `jwt.verify` which also accepts `sts.windows.net`), and `oid` (must be a non-empty string; not validated by `jwt.verify`)
  - `exp` confirmed validated by `jwt.verify` (clockTolerance: 60 is set, ignoreExpiration is not)
  - `requireAuth`: `assertClaims` is called after `jwt.verify` succeeds; any claim failure triggers `auditWarn("invalid_claims", ...)`, `writeAuthAudit("auth.login_failed", ...)`, and returns 401 with generic `"invalid token"` — claim details are logged server-side only and never exposed in the response body
- `backend/tests/canonical/authClaims.test.ts` (new): 9 unit tests covering valid payloads (string aud, `api://` aud, array aud), rejected unknown aud, rejected v1.0 issuer, rejected wrong-tenant issuer, rejected missing/empty/non-string oid
- `backend/tests/run.ts`: registered `authClaims.test`

## Why
- Security Sprint 1, item S1-11: `jwt.verify` does not validate `oid` and accepts both `v2.0` and `v1.0` (`sts.windows.net`) issuers; explicit post-verification claim assertions close these gaps
- Longer JWKS cache reduces external JWKS endpoint calls at scale (sprint spec: 1 hour)
- Claim validation failures never expose internal detail in the 401 body — only `"invalid token"` is returned

## Test results
- 9 new `assertClaims` tests: all pass
- Pre-existing 15 failures (ISSUE-009, stop_id mapping): unchanged

## Files touched
- `backend/src/authz.ts` (assertClaims function, requireAuth wiring, cacheMaxAge bump)
- `backend/tests/canonical/authClaims.test.ts` (new)
- `backend/tests/run.ts` (import added)
