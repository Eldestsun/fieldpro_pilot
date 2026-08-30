# 2026-08-29 — GUARD-DEVBYPASS: dev auth bypass structurally contained (persona registry)

## The defect (recon 2026-08-09, card GUARD-DEVBYPASS)
The dev bypass was **configured off, not structurally contained**. When active
(two env vars), it minted `req.user` **verbatim from request headers**: roles
from `x-dev-user-roles` (no allowlist), org from `x-dev-user-org-id` (which
sets the RLS tenant scope), OID from `x-dev-user-oid`. Exposure if both env
gates were ever true in a deploy: unauthenticated arbitrary-role,
arbitrary-org access to every endpoint. A second, independent defect:
`POST /dev/generate-route-run` had no inline gate — an unauthenticated
DB-writing endpoint in any non-production deploy. Docs claimed "three
independent gates" and "impossible to enable in production"; both claims false
(the boot banner gates nothing; two env vars are configuration, not
impossibility).

## The fix — remove the escalation, don't gate it
- **`backend/src/middleware/devAuthBypass.ts`** — identity is minted ONLY from
  a frozen compile-time registry `DEV_PERSONAS` (specialist / lead / dispatch /
  admin / ul-legacy / multi / outsider), selected by name via a single
  `X-Dev-Persona` header. No identity field is derived from the request; the
  caller can never choose org (RLS tenant scope) or roles. Unknown/missing
  persona falls through to real auth. Worst case if both env gates fail:
  seven known synthetic identities in the dev org (or the empty org-2
  outsider) — bounded and auditable. Audit row now records the persona name
  only. The legacy `X-Dev-User-*` headers are dead.
- **`backend/src/routes/devRoutes.ts`** — `POST /dev/generate-route-run` gains
  the same inline env gate as `/dev/seed-axe-fixture` (404 unless
  `NODE_ENV !== 'production'` && `DEV_AUTH_BYPASS === 'true'`).
- **Regression tripwires** (`backend/tests/canonical/devAuthBypass.test.ts`,
  rewritten): legacy identity headers mint NOTHING (the exact old escalation
  is replayed and must produce `req.user === undefined`); persona identity
  ignores accompanying identity headers; registry shape asserts (frozen,
  synthetic OIDs, no Admin outside org 1); env-gate tests preserved; audit
  detail carries persona name only.
- **Callers migrated** (13 backend canonical test files + `axeAudit.spec.ts`):
  three-header blocks → `X-Dev-Persona`. Role-templated helpers map
  `role.toLowerCase()` → persona; cross-org isolation cases use `outsider`.
  `auditLog.test.ts` negative assertion re-scoped by time (fixed persona OID
  replaced the per-test marker OID).
- **Docs corrected** (the three divergences from the recon):
  1. `docs/dev/dev-auth-bypass.md` rewritten — honest posture ("two env
     gates, banner is an alarm not a gate"; containment = the registry),
     persona table, updated curl/Playwright examples, historical note on the
     false "three gates / impossible" claim.
  2. `docs/KNOWN_ISSUES.md` — `generate-route-run` gating claim corrected
     with provenance (the doc previously described a gate that did not exist;
     the gate now actually exists).
  3. Audit-detail claim ("headers verbatim") corrected — detail records the
     persona name only.
  Plus stale references updated: `backend/.env.example` (persona header
  contract), two KNOWN_ISSUES mechanism descriptions.

## Why this matters (labor-safety framing)
The labor-safety argument rests on *structural* containment. A
header-controlled role and org assignment was a policy control wearing a
structural costume — and caller-supplied `org_id` selected the RLS tenant.
After this change the bypass has the same character as the rest of the moat:
bounded by construction, verified by tripwire tests, honestly documented.

## Verification
- Backend `tsc --noEmit` exit 0; frontend `tsc -p tsconfig.e2e.json` exit 0.
- Full backend suite **202/202** (was 200/200; the rewritten bypass suite nets
  +2), run against the live dev DB.
- No DB changes; no scaffold data (smoke discipline: nothing to clean).

## Founder-Infra residual (from the card — NOT closed by this change)
Inspect the Render `baseline-secrets` env group: does `NODE_ENV` or
`DEV_AUTH_BYPASS` appear in it? That answer determines whether the old
exposure was live or latent while the red deploy sat. This code change makes
the answer matter far less (bounded personas either way), but the group check
is still the honest close-out — fold into SHADOW-ENV's Render work.

## Held follow-on now unblocked (CRED-ENVLOCAL rescope)
Per the card: with the bypass now safe to depend on, the four
`E2E_LEAD_USER_*` / `E2E_UL_USER_*` credential pairs (real-Entra e2e logins)
should be **deleted rather than documented** — a second credential-based
login path is strictly worse than the persona bypass. Separate dispatch; not
bundled here.

## Files touched
- backend/src/middleware/devAuthBypass.ts
- backend/src/routes/devRoutes.ts
- backend/tests/canonical/devAuthBypass.test.ts (rewritten)
- backend/tests/canonical/{adhocRouteRuns, auditLog, ccExceptionsCanonical, ccOverviewAccessBlockedDrift, controlCenterRelocation, loadRouteRunOidTrim, opsRouteRunsExceptions, previewPoolOrgContext, resourceRoutesOrgFailClosed, roleRenamePhase1Audit, runtimeIdentityLeak, seamCUserIdDropped, stopHistory}.test.ts
- frontend/e2e/a11y/axeAudit.spec.ts
- backend/.env.example
- docs/dev/dev-auth-bypass.md (rewritten)
- docs/KNOWN_ISSUES.md
- docs/changelog/security/2026-08-29-guard-devbypass-persona-containment.md
