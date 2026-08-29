# Dev Auth Bypass — Persona Registry (GUARD-DEVBYPASS)

A dev-only middleware that allows local integration tests and accessibility
audits to call auth-gated API endpoints without going through the full
Microsoft Entra OAuth flow.

**Honest security posture (do not overstate in any review packet):** activation
is controlled by **two environment gates** — `NODE_ENV` and `DEV_AUTH_BYPASS`.
Environment variables are configuration, not structure; a mis-deployed
environment could set both. The *structural* containment (GUARD-DEVBYPASS,
2026-08-29) is what happens when the bypass IS active: identity is minted
**only from a fixed compile-time persona registry**. No identity field — OID,
roles, org — is ever derived from the request. Worst case if both gates fail
in a deployed environment: a caller can act as one of seven known synthetic
dev identities in the dev org (or the empty outsider org) — bounded and
auditable, not unauthenticated arbitrary-role, arbitrary-org access. In
particular a caller can never choose `org_id`, which sets the RLS tenant scope.

---

## Activating the bypass

In `backend/.env` (local only, never committed):

```env
DEV_AUTH_BYPASS=true
```

`NODE_ENV` must not be `'production'`. When active, the server prints a
multi-line warning banner at boot.

---

## How it works

When the middleware is active, a request selects a persona **by name** with a
single header, and receives that persona's fixed identity verbatim:

```
X-Dev-Persona: dispatch
```

The registry (`backend/src/middleware/devAuthBypass.ts` `DEV_PERSONAS`):

| Persona | OID | Org | Roles |
|---------|-----|-----|-------|
| `specialist` | `dev-persona-specialist` | 1 | Specialist |
| `lead` | `dev-persona-lead` | 1 | Lead |
| `dispatch` | `dev-persona-dispatch` | 1 | Dispatch |
| `admin` | `dev-persona-admin` | 1 | Admin |
| `ul-legacy` | `dev-persona-ul-legacy` | 1 | UL (role-rename dual-accept coverage) |
| `multi` | `dev-persona-multi` | 1 | UL, Lead (multi-role coverage) |
| `outsider` | `dev-persona-outsider` | 2 | Dispatch (org-isolation tests; org 2 holds no data) |

Unknown or missing persona → the request falls through to real authentication
(`requireAuth` returns 401 as normal). The legacy `X-Dev-User-Oid` /
`X-Dev-User-Roles` / `X-Dev-User-Org-Id` headers are **dead**: they mint
nothing, and a regression tripwire test
(`backend/tests/canonical/devAuthBypass.test.ts`) fails the build if they
ever mint identity again.

Need a new shape (role combo, another org)? **Add a persona to the registry**
— never a header.

Every bypass use writes a row to `audit_log` with `action = 'auth.dev_bypass'`
and the persona name in the `detail` JSONB column.

---

## Safety gates

Both environment gates must pass or the middleware does not activate
(`createDevAuthBypass()` returns `null` and is never mounted):

1. **NODE_ENV gate** — returns `null` immediately when
   `NODE_ENV === 'production'`.

2. **DEV_AUTH_BYPASS gate** — must equal the literal string `'true'`.
   `'TRUE'`, `'1'`, missing, or any other value → returns `null`.

When active, the server also emits a loud boot banner to stderr. The banner is
an **alarm, not a gate** — it prevents nothing and is deliberately not counted
as one.

> Historical note: earlier revisions of this doc claimed "three independent
> gates" and "impossible to enable in production." Both claims were wrong (the
> banner gates nothing; two env vars are configuration, not impossibility) and
> were corrected as part of GUARD-DEVBYPASS. The containment story now rests on
> the persona registry, which holds even when the env gates fail.

---

## Usage examples

### curl

```bash
curl -s http://localhost:4000/api/secure/ping \
  -H "X-Dev-Persona: admin" | jq .
```

As a field worker (Specialist):

```bash
curl -s http://localhost:4000/api/ul/todays-run \
  -H "X-Dev-Persona: specialist" | jq .
```

Dispatch surfaces:

```bash
curl -s http://localhost:4000/api/ops/route-runs \
  -H "X-Dev-Persona: dispatch" | jq .
```

---

### Playwright (e2e / axe audit)

Set the persona header via `page.setExtraHTTPHeaders` before navigating to an
authenticated surface:

```typescript
// In beforeEach or the test body, before page.goto()
await page.setExtraHTTPHeaders({ 'x-dev-persona': 'admin' })
await page.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' })
```

The header applies to all subsequent requests from that page context,
including XHR/fetch calls that the React app makes after rendering.

For role-specific surfaces, change the persona per test:

```typescript
// Field-worker surface
await page.setExtraHTTPHeaders({ 'x-dev-persona': 'specialist' })
await page.goto('/work', { waitUntil: 'domcontentloaded' })

// Lead surface
await page.setExtraHTTPHeaders({ 'x-dev-persona': 'lead' })
await page.goto('/routes', { waitUntil: 'domcontentloaded' })
```

> **Note:** `setExtraHTTPHeaders` does not affect the initial document request.
> API calls from the rendered React app (e.g. `/api/secure/ping`) will carry
> the header automatically. The frontend auth state still comes from MSAL —
> the bypass only covers backend API validation. For full-stack dev without
> Entra, combine with the frontend bypass below.

---

### Axe audit script (S1-8)

`axeAudit.spec.ts` uses `page.setExtraHTTPHeaders` (backend persona bypass)
combined with `VITE_DEV_AUTH_BYPASS=true` and a `__dev_user__` localStorage key
(frontend bypass) to reach all authenticated surfaces without a real Entra
session. The localStorage half mirrors the backend persona so both halves
agree (see `BACKEND_PERSONAS` in the spec).

Ensure the backend is running with `DEV_AUTH_BYPASS=true` before launching the audit:

```bash
# Terminal 1 — backend
DEV_AUTH_BYPASS=true pnpm --filter backend dev

# Terminal 2 — frontend
VITE_DEV_AUTH_BYPASS=true pnpm --filter frontend dev

# Terminal 3 — run audit
pnpm --filter frontend axe:audit
```

---

## Frontend bypass

`frontend/src/auth/devAuthBypass.ts` is the frontend counterpart. It renders
UI only — it grants no backend access (API calls still need the backend
persona header or real auth). It is dead-code-eliminated from production
bundles at build time, which is a genuinely structural guarantee.

### Activating

In `frontend/.env.local` (local only, never committed):

```env
VITE_DEV_AUTH_BYPASS=true
```

`import.meta.env.MODE` must not be `'production'`.

### Setting the synthetic user

Before navigating to any protected route, seed `localStorage.__dev_user__`
with a payload that mirrors a backend persona:

```javascript
localStorage.setItem('__dev_user__', JSON.stringify({
  oid:    'dev-persona-specialist',
  roles:  ['Specialist'],
  org_id: 1,
}))
```

The frontend router reads this key via `getDevAuthBypass()` on mount and injects
a synthetic `AccountInfo` into `AuthContext`, bypassing the MSAL account check.
The `me` state is pre-populated from the same payload, bypassing the
`/api/secure/ping` fetch. `getAccessToken()` returns `'dev-bypass-token'`
(which the backend does **not** accept — backend access requires the persona
header or real auth).

### Playwright snippet (full-stack dev bypass)

```typescript
// In setupAuth() — before page.goto()
await page.addInitScript(({ devUser }) => {
  localStorage.setItem('__dev_user__', JSON.stringify(devUser))
}, { devUser: { oid: 'dev-persona-specialist', roles: ['Specialist'], org_id: 1 } })

await page.setExtraHTTPHeaders({ 'x-dev-persona': 'specialist' })

await page.goto('/work')
```

### Safety gates (frontend)

1. **MODE gate** — `import.meta.env.MODE === 'production'` → returns `null`.
   Vite eliminates the code path entirely from production bundles (structural).

2. **VITE_DEV_AUTH_BYPASS gate** — must equal the literal string `'true'`.

A boot banner is emitted once to `console.warn` on activation (alarm, not a
gate).

---

## Dev DB-writing endpoints

Both dev endpoints carry the same **inline** env gate
(`NODE_ENV !== 'production' && DEV_AUTH_BYPASS === 'true'`), independent of the
`app.ts` mount-level gate:

- `POST /dev/seed-axe-fixture`
- `POST /dev/generate-route-run` (inline gate added by GUARD-DEVBYPASS —
  previously it relied on the mount-level gate alone, making it an
  unauthenticated DB-writing endpoint in any non-production deploy)

---

## Audit trail

Every bypass activation is logged:

```sql
SELECT actor_oid, action, detail, occurred_at
FROM audit_log
WHERE action = 'auth.dev_bypass'
ORDER BY occurred_at DESC;
```

`actor_oid` carries the persona's synthetic OID and `org_id` its fixed org.
The `detail` column records only the persona name — the single
request-supplied input. (Identity values are never copied into `detail`;
labor-safety scrub.)

---

## Intended Use — Agent (terminal) vs Founder (browser)

> The *rule* — "the dev bypass is for headless agent terminal sessions only; never switch
> the founder off real MSAL/Entra; the Entra path is always the fix for in-browser auth
> issues" — lives in `CLAUDE.md § Dev Auth Bypass`. This section holds the rationale moved
> out of CLAUDE.md during the 2026-06-16 rules-index restructure.

The dev bypass (`localStorage.__dev_user__` / `dev-bypass-token`) exists exclusively for
headless agent sessions running remotely in terminal via tools like Prompt 3. It allows a
coding agent to interact with the application without a real Entra account.

The founder uses real Azure Entra authentication (personal business tenant) with actual role
assignments for all live browser testing. Do NOT suggest switching the founder to dev bypass
when auth issues arise in the browser — the correct fix is always on the real MSAL/Entra path.

Two auth paths, two separate contexts:
- Agent in terminal → dev bypass (persona registry)
- Founder in browser → real Entra, v2.0 tokens, role-based
