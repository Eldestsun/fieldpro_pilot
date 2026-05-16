# BASELINE — Render Staging Deployment Runbook

Target: Render free tier, used for staging and pilot demos.
Not for production. Free Postgres expires after 90 days — see note at end.

---

## Architecture on Render

| Service | Type | Render service name |
|---------|------|---------------------|
| Postgres | Managed DB | `baseline-db` |
| Backend (Node/Express) | Docker web service | `baseline-backend` |
| Frontend (nginx + Vite build) | Docker web service | `baseline-frontend` |

The frontend container runs nginx, which proxies `/api/*` to the backend service.
This preserves the same-origin API call pattern used in local development.

---

## Step 1 — Create the environment variable group

In the Render dashboard: **Account → Env Groups → New Group**

Name the group exactly: `baseline-secrets`

Add the following variables (no values committed here — set them in the dashboard):

| Variable | Description |
|----------|-------------|
| `AZURE_TENANT_ID` | Azure Entra tenant ID |
| `AZURE_API_AUDIENCE` | App registration audience URI (e.g. `api://<client-id>`) |
| `AZURE_CLIENT_ID` | App registration client ID |
| `APP_ROLE_ADMIN` | Entra app role name for Admin (default: `Admin`) |
| `APP_ROLE_LEAD` | Entra app role name for Lead (default: `Lead`) |
| `APP_ROLE_UL` | Entra app role name for UL (default: `UL`) |
| `MINIO_ENDPOINT` | S3-compatible storage endpoint (or leave unset to disable uploads) |
| `MINIO_ACCESS_KEY_ID` | Storage access key |
| `MINIO_SECRET_ACCESS_KEY` | Storage secret key |
| `MINIO_BUCKET` | Bucket name (default: `fieldpro-uploads`) |
| `MINIO_REGION` | Bucket region (default: `us-east-1`) |
| `OSRM_BASE_URL` | OSRM routing engine URL (use public demo or leave unset to disable routing) |
| `AZURE_KEY_VAULT_URL` | Azure Key Vault URL for OID encryption in production (e.g. `https://<vault>.vault.azure.net`) |
| `AZURE_KEY_VAULT_KEY_NAME` | Key Vault key name (default: `oid-kek`) |
| `TZ` | Timezone (default: `America/Los_Angeles`) |

> **Note on OID encryption**: If Azure Key Vault is not yet provisioned, set
> `DEV_OID_KEY` to a 32-byte hex string instead (generate with
> `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
> Do not use `DEV_OID_KEY` in production.

> **Note on OSRM**: The free tier cannot run a local OSRM instance (requires
> large OSM data files and CPU). For staging, either point to a public OSRM
> demo server or leave `OSRM_BASE_URL` unset — routing features will degrade
> gracefully.

> **Note on MinIO/S3**: For staging without a MinIO instance, leave the
> `MINIO_*` vars unset. Photo upload routes will return errors but the rest of
> the application functions.

---

## Step 2 — Connect to GitHub and deploy

1. In the Render dashboard, click **New → Blueprint** (or go to the repo
   settings and connect via Blueprints).
2. Select the **fieldpro_pilot** GitHub repo and the `main` branch.
3. Render reads `render.yaml` from the repo root and creates all three services
   (`baseline-db`, `baseline-backend`, `baseline-frontend`) automatically.
4. Attach the `baseline-secrets` env group to the `baseline-backend` service:
   - Go to `baseline-backend` → Environment → Add Env Group → select `baseline-secrets`.
5. Trigger the first deploy by clicking **Manual Deploy → Deploy latest commit**
   on each service, in this order:
   1. `baseline-db` (Postgres must be available before backend starts)
   2. `baseline-backend`
   3. `baseline-frontend`

---

## Step 3 — Set the backend URL on the frontend service

After the backend deploys, Render assigns it a public URL:
`https://baseline-backend.onrender.com`

If Render assigned a different name (e.g. due to name conflict), update the
`BACKEND_URL` environment variable on the `baseline-frontend` service to match:

1. Go to `baseline-frontend` → Environment.
2. Set `BACKEND_URL` to `https://<actual-backend-url>` (no trailing slash).
3. Save and redeploy the frontend.

---

## Step 4 — Verify the deployment

**Backend health check:**
```
curl https://baseline-backend.onrender.com/api/health
# Expected: {"ok":true,"service":"fieldpro-backend"}
```

**Migration status** — check backend logs:
1. Go to `baseline-backend` → Logs in Render dashboard.
2. Look for lines matching `apply YYYYMMDD_*.sql` or `skip YYYYMMDD_*.sql`.
3. The final line should be `Migration run complete.`
4. The server line `API listening on http://localhost:4000` confirms startup.

**Frontend:**
Open `https://baseline-frontend.onrender.com` in a browser.
The Azure Entra login should appear. Log in with your Entra account.

---

## Step 5 — Manual deploys

Render auto-deploys when commits land on `main` (if auto-deploy is enabled).
For manual deploys:

1. Go to the service → **Manual Deploy → Deploy latest commit**.
2. Deploy backend before frontend if schema migrations are included.

To trigger a deploy via CLI:
```
# Requires Render CLI: https://render.com/docs/cli
render deploy --service-id <srv-id>
```

---

## Recovering from a failed consolidated schema migration

If the backend logs show:

```
FAIL  00000000_consolidated_schema.sql
<error message about already-existing object>
```

This means the Render DB has partial state from a previous deployment attempt
(e.g. some objects were created by legacy migrations before the consolidated
schema approach was introduced). The consolidated schema is now fully idempotent
(CREATE OR REPLACE FUNCTION, CREATE TABLE IF NOT EXISTS, DROP TRIGGER IF EXISTS,
etc.), so this should not recur — but if it does on an existing Render DB:

**Required action: reset the Render database before redeploying.**

1. Go to Render dashboard → `baseline-db` → **Reset Database**.
2. Confirm the reset. This drops all data and schema on the Render DB.
3. Redeploy `baseline-backend` (Manual Deploy → Deploy latest commit).
4. The migration runner will apply `00000000_consolidated_schema.sql` cleanly
   on the empty DB and skip all `legacy_*` files automatically.

> This reset is only needed when the DB has partial schema state from earlier
> deployments. A clean DB (first deploy or after reset) will always succeed.

---

## Checking logs if something fails

**Backend fails to start:**
- Check `baseline-backend` logs for `FAIL <migration>.sql` — a migration error
  kills startup intentionally so the app never runs on a broken schema.
- Check that `DATABASE_URL` is set (visible in the Environment tab, value hidden).
- Check that all required Azure env vars are present.

**Frontend shows blank page or 502 on /api routes:**
- Confirm `BACKEND_URL` is set correctly on `baseline-frontend`.
- Check `baseline-frontend` logs for nginx startup errors.
- Confirm `baseline-backend` is healthy (green status, /api/health returns 200).

**Auth errors (401/403 from backend):**
- Confirm `AZURE_TENANT_ID`, `AZURE_API_AUDIENCE`, `AZURE_CLIENT_ID` are set.
- Confirm the Entra app registration's redirect URI includes the frontend URL.
- The `/api/health` endpoint is public (no auth required) — use it to confirm
  the backend is running independent of auth issues.

---

## Free tier limits and upgrade path

| Limit | Free tier | Action needed |
|-------|-----------|---------------|
| Postgres expiry | 90 days | Upgrade to Starter ($7/mo) before pilot |
| Postgres storage | 1 GB | Adequate for staging; not for production |
| Services spin down after inactivity | ~15 min cold start | Upgrade to Starter to keep always-on |
| Build minutes | 500/month | Adequate for CI-triggered deploys |

Before any external demo, upgrade `baseline-db` and both web services to the
Starter plan to eliminate cold starts and the 90-day DB expiry.
