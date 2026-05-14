# Dev Auth Bypass — DEV_TOKEN_INJECTION

A dev-only middleware that allows local integration tests and accessibility
audits to call auth-gated API endpoints without going through the full
Microsoft Entra OAuth flow.

**This path is impossible to enable in production.** Three independent gates
prevent it (see Safety section below).

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

When the middleware is active, a request that supplies all three headers
bypasses JWKS validation and receives a synthetic `req.user`:

| Header | Value | Effect |
|--------|-------|--------|
| `X-Dev-User-Oid` | Any string | Sets `req.user.oid` |
| `X-Dev-User-Roles` | Comma-separated roles | Sets `req.roles` |
| `X-Dev-User-Org-Id` | Integer as string | Sets `req.user.org_id` |

If **any** header is missing, the request falls through to real authentication
(`requireAuth` returns 401 as normal).

Every bypass use writes a row to `audit_log` with `action = 'auth.dev_bypass'`
and the headers verbatim in the `detail` JSONB column.

---

## Safety gates

All three gates must pass or the middleware does not activate:

1. **NODE_ENV gate** — `createDevAuthBypass()` returns `null` immediately
   when `NODE_ENV === 'production'`. The middleware is never mounted.

2. **DEV_AUTH_BYPASS gate** — must equal the literal string `'true'`.
   `'TRUE'`, `'1'`, missing, or any other value → returns `null`.

3. **Boot banner** — when active, the server emits to stderr:
   ```
   *** WARNING ***
   DEV AUTH BYPASS IS ACTIVE
   This server accepts X-Dev-User-Oid headers in lieu of
   real authentication. This MUST NEVER run in production.
   If you see this message in a production deploy, halt
   the deploy immediately.
   *** WARNING ***
   ```

---

## Usage examples

### curl

```bash
curl -s http://localhost:4000/api/secure/ping \
  -H "X-Dev-User-Oid: test-oid-001" \
  -H "X-Dev-User-Roles: Admin" \
  -H "X-Dev-User-Org-Id: 1" | jq .
```

As a UL:

```bash
curl -s http://localhost:4000/api/ul/todays-run \
  -H "X-Dev-User-Oid: test-ul-oid" \
  -H "X-Dev-User-Roles: UL" \
  -H "X-Dev-User-Org-Id: 1" | jq .
```

Multi-role:

```bash
curl -s http://localhost:4000/api/ops/route-runs \
  -H "X-Dev-User-Oid: test-lead-oid" \
  -H "X-Dev-User-Roles: Lead,Admin" \
  -H "X-Dev-User-Org-Id: 1" | jq .
```

---

### Playwright (e2e / axe audit)

Add the headers to every API route mock or via `page.setExtraHTTPHeaders`
before navigating to an authenticated surface:

```typescript
// In beforeEach or the test body, before page.goto()
await page.setExtraHTTPHeaders({
  'X-Dev-User-Oid':    'axe-audit-oid',
  'X-Dev-User-Roles':  'Admin',          // or 'UL', 'Lead', etc.
  'X-Dev-User-Org-Id': '1',
})

await page.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' })
```

The headers apply to all subsequent requests from that page context,
including XHR/fetch calls that the React app makes after rendering.

For role-specific surfaces, change `X-Dev-User-Roles` per test:

```typescript
// UL surface
await page.setExtraHTTPHeaders({
  'X-Dev-User-Oid':    'axe-ul-oid',
  'X-Dev-User-Roles':  'UL',
  'X-Dev-User-Org-Id': '1',
})
await page.goto('/work', { waitUntil: 'domcontentloaded' })

// Lead surface
await page.setExtraHTTPHeaders({
  'X-Dev-User-Oid':    'axe-lead-oid',
  'X-Dev-User-Roles':  'Lead',
  'X-Dev-User-Org-Id': '1',
})
await page.goto('/routes', { waitUntil: 'domcontentloaded' })
```

> **Note:** `setExtraHTTPHeaders` does not affect the initial document request.
> API calls from the rendered React app (e.g. `/api/secure/ping`) will carry
> the headers automatically. The frontend auth state still comes from MSAL —
> the bypass only covers backend API validation. For full-stack dev without
> Entra, combine with the MSAL dev stub described in the S1-9 remediation
> plan.

---

### Axe audit script (S1-8 resumed)

The resumed `axeAudit.spec.ts` will use `setExtraHTTPHeaders` instead of the
abandoned MSAL localStorage injection approach. Ensure the backend is running
with `DEV_AUTH_BYPASS=true` before launching the audit:

```bash
# Terminal 1 — backend
DEV_AUTH_BYPASS=true pnpm --filter backend dev

# Terminal 2 — frontend
pnpm --filter frontend dev

# Terminal 3 — run audit
pnpm --filter frontend axe:audit
```

---

## Audit trail

Every bypass activation is logged:

```sql
SELECT actor_oid, action, detail, occurred_at
FROM audit_log
WHERE action = 'auth.dev_bypass'
ORDER BY occurred_at DESC;
```

The `detail` column records the three headers verbatim so there is always
a verifiable record of which synthetic identity was used.
