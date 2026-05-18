# 2026-05-17 — Frontend Dev Bypass Header Audit

Analysis-only. No code changes. No changelog entry required.

---

## TL;DR

The frontend and backend bypass systems are **not integrated**. They are parallel, independent mechanisms designed for different callers. In the current local dev configuration, authenticated API calls from the browser fail with `401` regardless of whether `__dev_user__` is set in localStorage.

---

## 1. Do any frontend files inject `x-dev-user-*` headers?

**No.** A full-text search of `frontend/src/` for `x-dev-user-oid`, `x-dev-user-roles`, `x-dev-user-org-id`, `DEV_AUTH_BYPASS`, `devBypass`, and `dev-bypass` finds zero call sites that inject those headers into any `fetch()` call.

The Vite dev server proxy (`vite.config.ts:29`) is a plain pass-through:

```ts
proxy: { '/api': 'http://localhost:4000' }
```

No header injection at the proxy layer either.

---

## 2. How the frontend bypass actually works

**Files:** `frontend/src/auth/devAuthBypass.ts`, `frontend/src/auth/AuthContext.tsx`

**Three safety gates** (all must pass or `getDevAuthBypass()` returns null):
1. `import.meta.env.MODE !== 'production'`
2. `VITE_DEV_AUTH_BYPASS === 'true'`
3. A loud `console.warn` banner (once per module load)

**What it does when active:**

```ts
// AuthContext.tsx:30-39
const devBypass = useRef(getDevAuthBypass()).current;
const [me, setMe] = useState<Me>(() => devBypass?.me ?? null);
// ...
const getAccessToken = useCallback(async () => {
  if (devBypass) return 'dev-bypass-token';   // ← hardcoded string, not a JWT
  // ...real MSAL flow...
}, [...]);
```

- Reads `localStorage.__dev_user__` (must be JSON with `{ oid, roles[], org_id }`)
- Constructs a synthetic `AccountInfo` object so `isSignedIn` is true
- Pre-populates `me` from the localStorage data — the `useEffect` that calls `fetchMe()` is short-circuited because `!me` is already false
- Returns the literal string `'dev-bypass-token'` from `getAccessToken()`

**What the frontend sends to the backend:**

```
Authorization: Bearer dev-bypass-token
```

No `x-dev-user-oid`, `x-dev-user-roles`, or `x-dev-user-org-id` headers are ever added.

---

## 3. How the backend bypass works (recap from prior audit)

**File:** `backend/src/middleware/devAuthBypass.ts`, registered in `app.ts:34-37`

The middleware runs first and looks for the three request headers. If any are missing, it calls `next()` without touching `req.user`. Then `requireAuth` runs:

```ts
// authz.ts:157
if (req.user) return next();   // ← shortcut: only fires if devAuthBypass set req.user
```

Since the frontend never sends `x-dev-user-*` headers, `req.user` is null when `requireAuth` runs. It falls through to JWKS JWT verification. `'dev-bypass-token'` is not a valid RS256 JWT — verification fails → `401 { error: "invalid token" }`.

---

## 4. Current env var state

| File | Key | Value | Effect |
|------|-----|-------|--------|
| `frontend/.env.local` | `VITE_DEV_AUTH_BYPASS` | `true` | Frontend bypass is active (Gate 2 passes) |
| `frontend/.env.local` | `VITE_AZURE_TENANT_ID` | real GUID | Available for real MSAL flow |
| `frontend/.env.local` | `VITE_AZURE_CLIENT_ID` | real GUID | Available for real MSAL flow |
| `frontend/.env.local` | `VITE_API_APP_ID_URI` | real URI | Available for real MSAL flow |
| `frontend/.env.example` | `VITE_DEV_AUTH_BYPASS` | `false` | Safe default — `.env.local` overrides it |
| `backend/.env` | `DEV_AUTH_BYPASS` | `true` | Backend bypass is active |
| `backend/.env` | `AZURE_TENANT_ID` | real GUID | Backend can validate real Entra JWTs |
| `backend/.env` | `AZURE_API_AUDIENCE` | real GUID | Backend can validate real Entra JWTs |

---

## 5. Plain-English answers

### Is local dev currently hitting real Entra auth or the bypass?

**It depends on whether `__dev_user__` is in localStorage.**

- `__dev_user__` **not set**: `getDevAuthBypass()` returns null → `AuthContext` falls through to real MSAL → user sees login popup → gets a real Entra JWT → backend validates it → everything works.
- `__dev_user__` **is set**: Frontend renders as authenticated (UI shows protected routes), but every API call sends `Authorization: Bearer dev-bypass-token` which the backend rejects with 401. The app renders but is functionally broken for any API-dependent action.

### If bypass: what OID, roles, and org_id is every request running as?

The frontend renders as whatever is in `localStorage.__dev_user__`. The backend sees nothing from the bypass — it returns 401. There is no successful bypass identity for browser-originated requests.

For **direct backend requests** (curl, agent terminal sessions sending `x-dev-user-*` headers), the identity is whatever the caller puts in those headers.

### What would need to change to test the Admin role locally?

**Option A — UI rendering only (no real API calls needed):**
Set in browser DevTools console:
```js
localStorage.setItem('__dev_user__', JSON.stringify({ oid: 'dev-admin', roles: ['Admin'], org_id: 1 }))
```
The frontend will render Admin surfaces. Any API call will 401.

**Option B — Full end-to-end Admin (browser + backend):**
The frontend bypass must be extended to also inject `x-dev-user-*` headers into every `fetch()` call. The cleanest insertion point is `AuthContext.getAccessToken()` or a shared `apiFetch()` wrapper — but this is a code change, not a config change.

**Option C — Use real Entra login:**
Set `VITE_DEV_AUTH_BYPASS=false` in `frontend/.env.local` and sign in via MSAL popup. Your real Entra account must have the `Admin` app role assigned in the Azure App Registration.

### What would need to change to test with real Entra login locally?

Only one change needed — `frontend/.env.local`:

```diff
- VITE_DEV_AUTH_BYPASS=true
+ VITE_DEV_AUTH_BYPASS=false
```

All other credentials (`VITE_AZURE_TENANT_ID`, `VITE_AZURE_CLIENT_ID`, `VITE_API_APP_ID_URI`) are already set correctly. The backend's `AZURE_TENANT_ID` and `AZURE_API_AUDIENCE` are already set correctly. `DEV_AUTH_BYPASS=true` remaining in `backend/.env` causes no harm — it only activates if `x-dev-user-*` headers are present, which the MSAL flow never sends.

---

## 6. The design intent (not a bug)

The two bypass systems serve different callers by design, per `CLAUDE.md`:

> The dev bypass exists exclusively for **headless agent sessions** running remotely in terminal. The founder uses **real Azure Entra authentication** for all live browser testing.

| Caller | Mechanism | How it works |
|--------|-----------|-------------|
| Agent / curl / Prompt 3 | `x-dev-user-*` headers | Backend bypass activates, sets `req.user` directly |
| Browser (founder) | Real MSAL | Full JWT flow, JWKS validation |
| Browser (frontend bypass active) | `localStorage.__dev_user__` | UI renders, API calls 401 — not a supported workflow |

The frontend bypass is effectively a UI rendering harness (like Storybook with auth state), not a full end-to-end bypass. It was never designed to carry through to the backend.

---

## 7. Findings

| # | Finding | Severity |
|---|---------|----------|
| 1 | `VITE_DEV_AUTH_BYPASS=true` in `frontend/.env.local` overrides the `.env.example` safe default of `false` — any developer who sets `__dev_user__` in localStorage will see a broken app (renders but all API calls 401) without understanding why | Medium — confusing failure mode |
| 2 | There is no supported path for full-stack browser testing with a synthetic identity — the frontend bypass and backend bypass have no integration point | Gap — not a bug, but worth documenting for future work |
| 3 | The `devAuthBypass.test.ts` tests cover the frontend module in isolation but do not test what the backend receives — no test exercises the full header injection path | Low — test coverage gap |
| 4 | `backend/.env` `DEV_BYPASS_OID/ROLES/ORG_ID` are dead env vars (confirmed in prior audit) — nothing reads them on either side | Low — already noted |
