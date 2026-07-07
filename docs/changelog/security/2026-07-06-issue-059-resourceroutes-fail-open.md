# 2026-07-06 — ISSUE-059: close the fail-open org fallback on GET /api/users

**Branch:** `security/issue-059-resourceroutes-fail-open`
**Type:** Security — pre-multi-tenant hardening (labor-safety-adjacent)
**Priority:** High (not Blocker — benign in the single-org pilot)
**Scope:** One handler + one new static-guard test. No schema, no migration.

## What changed

`GET /api/users` (`resourceRoutes.ts`) resolved the caller's org with a hand-inlined
fallback:

```sql
SELECT id FROM organizations WHERE tenant_uuid = $1
UNION ALL SELECT id FROM organizations ORDER BY id LIMIT 1
```
…with a further `?? 1` default. This is the ISSUE-013 fail-open pattern already closed
in `resolveNumericOrgId`, `writeAuditLog`, and `upsertIdentity` — and `resolveNumericOrgId`'s
own doc comment names this exact block as what it replaced.

**It was worse than a fallback.** The trailing `ORDER BY id LIMIT 1` binds to the whole
`UNION ALL`, so it always returned the globally-lowest org id — proven empirically:
`SELECT 99 UNION ALL SELECT id FROM organizations ORDER BY id LIMIT 1 → 1`. On the
real-Entra path (`org_id == null`, since Entra puts no numeric org_id in the JWT) the
tenant match was therefore dead: **every** real-Entra caller resolved to org 1, not just
indeterminate ones. Benign today only because org 1 is the sole org with a `tenant_uuid`;
the moment a second org is provisioned, its users reading `/api/users` would see **org 1's
identity directory** — a cross-tenant worker-identity read.

The handler now delegates to the shared fail-closed helper:
```ts
const numericOrgId = await resolveNumericOrgId(req);
```
`resolveNumericOrgId` short-circuits on dev-bypass `org_id`, else matches `tenant_uuid`, else
throws `OrgResolutionError` (status 403). The `/users` catch now honors `err.status ?? 500`
so an indeterminate caller gets the clean 403 the endpoint's OpenAPI already declares,
instead of a masked 500. The now-unused `pool` import was dropped (the `/pools` handler was
already clean and uses `withOrgContext`).

## Tripwire (static source guard — ISSUE-059)

A runtime red-demo through the HTTP endpoint is infeasible: dev-bypass requires all three
`X-Dev-User-*` headers (so it always supplies `org_id` and short-circuits), and a synthetic
bad-`tid` real-Entra token can't pass `requireAuth`/JWKS in tests. So the tripwire is a
**static source guard** — new file `tests/canonical/resourceRoutesOrgFailClosed.test.ts`,
modeled on the `cleanLogsIdentity.test.ts` precedent — which slices the `/users` handler,
strips comments, and asserts: no `UNION ALL`, no `ORDER BY id LIMIT 1`, no `?? 1`, no
hand-rolled `tenant_uuid` lookup, and that it **does** call `resolveNumericOrgId(req)`.
`orgFailClosed.test.ts` (runtime-only by its stated contract) is left untouched; the runtime
fail-closed guarantee for `resolveNumericOrgId` is already covered by its three green cases.

## Proof

- **Green:** full suite **159 passed, 0 failed** (158 + the new static guard). tsc clean.
- **Red-demo:** temporarily reintroducing the `UNION ALL … ORDER BY id LIMIT 1` fallback in
  code turned the new guard **red**; reverting to the delegated `resolveNumericOrgId(req)`
  made it green again.
- **Grep:** no `UNION ALL` / `ORDER BY id LIMIT 1` / `?? 1` on the org path, and no bare
  `pool` reference, remains in `resourceRoutes.ts`.
- **No caller breaks:** the only consumer (`frontend/src/api/routeRuns.ts`) is a dev-bypass
  or provisioned-tenant caller in the single-org pilot; both resolve cleanly.

## Files touched

- `backend/src/modules/admin/resourceRoutes.ts`
- `backend/tests/canonical/resourceRoutesOrgFailClosed.test.ts` (new)
- `backend/tests/run.ts` (register the new test)
