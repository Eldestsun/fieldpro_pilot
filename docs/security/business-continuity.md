# BASELINE — Business Continuity Summary

> **Document type**: Security policy artifact
> **Sprint item**: S2-4
> **Status**: Active — demo posture. Hosting-dependent sections (HA, SLA, backups) will be updated when S3-1 (hosting decision) and S3-2 (managed DB backup config) are complete.
> **Last updated**: 2026-05-14
> **Input to**: S2-10 (TPRA Package — Availability section), S2-2 (WA OCIO 141.10, domain 5)

---

## 1. Scope

This document covers BASELINE's approach to availability, data durability, and recovery from failure at each hosting posture. It is written primarily for KCM IT, who will use it to determine whether BASELINE's availability posture is appropriate for a production field-operations tool, and for the TPRA evaluator, who will confirm that the system has a credible backup and recovery posture.

Three hosting postures are described:

| Posture | Platform | Status |
|---------|----------|--------|
| **Demo** | Render or Fly.io | Current |
| **Pilot** | Azure commercial | Target — pending S3-1 |
| **Full contract** | Azure Government | Future |

Sections 2–7 document the **current demo posture** in full. Section 8 documents the Azure commercial and Azure Government upgrade paths.

---

## 2. Availability Target

### 2.1 Current Demo Posture

**No formal SLA is claimed at demo posture.**

Render and Fly.io do not provide contractually guaranteed uptime SLAs on the deployment tier in use for the current demo. Observed availability depends on platform reliability and is not contractually enforceable.

This is stated accurately — BASELINE does not claim 99.9% uptime at demo posture because the hosting platform does not guarantee it.

**Compensating control**: The BASELINE field worker (UL) surface has an offline queue (`offlineQueue.ts`) that continues recording stop data locally when the backend is unreachable. Field workers can complete an entire shift without backend connectivity and sync when connectivity restores. A backend outage during an active shift does not prevent data capture. See section 6 for detail.

### 2.2 SLA Gap Acknowledgment

KCM IT may have minimum availability requirements for production operational tools. The current demo posture does not satisfy a formal SLA requirement. The upgrade path to Azure commercial (section 8) provides a documented path to a contractual SLA. If KCM IT has a specific SLA requirement for pilot onboarding, that requirement should be resolved at S3-1 (hosting decision) before S3-3 (production deployment).

---

## 3. Backup Procedure

### 3.1 Current Demo Posture

At demo posture, BASELINE relies on the hosting provider's default backup mechanisms. No independently configured backup procedure is in place. This is a documented gap.

**What is covered by provider defaults (Render / Fly.io)**:
- Render PostgreSQL (paid tier): automated daily snapshots, 7-day retention by default. Restores are initiated through the Render dashboard or CLI.
- Fly.io PostgreSQL: automated daily snapshots via Fly.io's managed Postgres offering. Retention and restore capabilities depend on the Fly.io plan tier.

**What is not backed up by provider defaults**:
- Uploaded photos stored in the S3-compatible object bucket: backup schedule depends on the bucket provider configuration. This must be verified and configured explicitly at S3-2.
- Environment configuration (connection strings, API keys): stored in the hosting provider's secrets/environment variable store; not part of a DB snapshot. Must be documented separately in a secure credentials store before pilot onboarding.

**Backup retention at demo**: 7-day rolling window (Render default). This means the RPO is at most 24 hours (daily snapshot) and the restore window is at most 7 days back.

### 3.2 What Is Backed Up

| Data category | Backup mechanism | Retention |
|--------------|-----------------|-----------|
| PostgreSQL DB (all tables including `audit_log`) | Provider daily snapshot | 7 days (demo default) |
| Uploaded photos (S3-compatible bucket) | Provider default or manual — **to be configured at S3-2** | TBD |
| App environment configuration | Provider secrets store — not snapshot-backed | Maintain separate secure record |
| SFTP export files | At KCM-controlled SFTP destination — outside BASELINE's control | Governed by KCM records policy |

**Audit log data** is retained in the primary PostgreSQL DB and is therefore included in the daily DB snapshot. Minimum 1-year retention for audit log records is required per S2-6. At demo posture with a 7-day backup window, audit log data older than 7 days is accessible only from the live DB, not from a backup. Long-term audit log durability requires the archive export mechanism described in S2-6. This is a documented gap at demo posture.

### 3.3 Backup Verification

At demo posture, backup verification is manual. Before pilot launch, the following verification should be performed:

1. Identify the most recent automated snapshot in the hosting provider dashboard.
2. Request a restore to a separate test instance (Render/Fly.io both support point-in-time or snapshot restore to a new instance).
3. Connect to the restored instance and verify: table count matches production, recent records are present, `audit_log` entries from the past 24 hours appear.
4. Record the verification date and result.

Frequency: verify backup integrity before pilot launch and quarterly thereafter (or after any significant schema change).

---

## 4. Restore Procedure

The following steps describe how a technical operator restores BASELINE from a backup after a data loss or corruption event. These steps assume the operator has access to the hosting provider dashboard and the application's environment configuration.

### 4.1 DB Failure — Restore from Snapshot

Applicable scenario: the PostgreSQL instance is corrupted, deleted, or fails in a way that prevents access to live data.

1. Log in to the hosting provider dashboard (Render or Fly.io).
2. Navigate to the PostgreSQL service for the BASELINE application.
3. Identify the most recent successful snapshot (check timestamp; confirm it is within the expected backup window).
4. Initiate a restore from snapshot to a new PostgreSQL instance. Use the same region as the original. Do not overwrite the original instance until the restore is verified.
5. Once the restore completes, connect to the restored instance using `psql` or a DB client:
   ```
   psql $RESTORED_DATABASE_URL
   \dt           -- verify tables are present
   SELECT COUNT(*) FROM audit_log;  -- spot-check record count
   SELECT MAX(created_at) FROM audit_log;  -- verify recency
   ```
6. If the restore is clean, update the application's `DATABASE_URL` environment variable to point to the restored instance. Redeploy the app service to pick up the new connection string.
7. Verify application health: `GET /api/health` should return HTTP 200.
8. Decommission the failed original instance only after the restored instance is confirmed operational.
9. Record the incident, restore timestamp, and data loss window in the incident log.

**Estimated RTO (demo)**: 2–4 hours depending on snapshot size and provider restore speed. No contractual RTO is available at demo posture.

**Data loss window (RPO)**: up to 24 hours (since last successful daily snapshot).

### 4.2 App Server Failure — Service Restart

Applicable scenario: the application server process crashes, becomes unresponsive, or returns errors, but the database is intact.

1. Check the application logs in the hosting provider dashboard for crash reason.
2. If the process is stopped: trigger a manual redeploy from the hosting provider dashboard, or push a no-op commit to the deployment branch to trigger a new build.
3. If the process is running but returning errors: check `GET /api/health`. Inspect logs for DB connection failures, environment variable issues, or uncaught exceptions.
4. Most app server failures on Render/Fly.io self-heal within minutes via automatic restart policies. If auto-restart has not resolved the issue within 15 minutes, proceed with manual redeploy.
5. Verify health after restart: `GET /api/health` HTTP 200; spot-check one authenticated API route.

**Estimated RTO (demo)**: < 15 minutes for auto-restart; < 30 minutes for manual redeploy.

**Data loss window (RPO)**: None — app server failure does not affect DB data. Field workers in offline mode continue recording locally; data syncs on reconnect.

### 4.3 Total Environment Loss

Applicable scenario: the entire deployment environment is unavailable (hosting provider outage, accidental account deletion, or migration failure).

1. Provision a new hosting account or project on the target platform (Render or Fly.io, or Azure for pilot onboarding).
2. Retrieve the application's environment configuration from the secure credentials record. Required variables: `DATABASE_URL`, `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `DEV_AUTH_BYPASS` (dev only), `SFTP_HOST`/`SFTP_USER`/`SFTP_KEY_PATH`, photo storage bucket credentials.
3. Create a new PostgreSQL instance on the new platform.
4. Restore DB from the most recent snapshot (follow steps in 4.1 from step 3 onward).
5. Deploy the BASELINE application from source (GitHub repository). The `Dockerfile` is the canonical deployment artifact. Build and deploy to the new instance.
6. Set all environment variables in the new deployment.
7. Run the migration runner (`Tier 6 Sub-task A`) against the new DB to ensure schema is current.
8. Verify: `GET /api/health` HTTP 200; run smoke test (authenticate, load routes, verify stop list renders).
9. Update DNS or the application URL in any external integrations (SFTP export destination, Azure Entra redirect URIs).

**Estimated RTO (demo)**: 4–8 hours for a total environment rebuild. No contractual RTO is available at demo posture.

**Data loss window (RPO)**: up to 24 hours (since last successful daily DB snapshot). Photo data loss window depends on the S3 bucket backup configuration (to be determined at S3-2).

---

## 5. Recovery Point Objective (RPO) Summary

| Failure scenario | RPO at demo posture | Notes |
|-----------------|--------------------|----|
| DB failure | Up to 24 hours | Daily snapshot; data since last snapshot is lost |
| App server failure | Zero | No DB data affected; offline queue preserves field data |
| Total environment loss | Up to 24 hours (DB) + TBD (photos) | Photo RPO depends on S3 bucket backup config (S3-2) |

---

## 6. Offline Mode Continuity

The BASELINE field worker (UL) mobile surface operates with an offline queue. Field workers recording stop completions, checklist observations, and photos during a shift do so against a local draft store (`stopDraftStore.ts`). Completed stop records are queued in `offlineQueue.ts` and synced to the backend when connectivity is restored.

**Operational impact of a backend outage during a shift**:
- Field workers can continue navigating their route and recording stop completions without interruption.
- Stop data is durably stored on the device until sync succeeds.
- The Lead dashboard and Control Center will not reflect in-progress completions until sync occurs — this is an observability gap during the outage, not a data loss event.
- No field data is lost due to a backend outage unless the worker's device is also lost or reset before sync.

This offline capability is a meaningful compensating control for the absence of a formal SLA at demo posture. A backend outage during an active shift does not constitute a service failure from the field worker's perspective.

**Scope**: The offline capability applies to the UL (field worker) surface only. Lead and Admin surfaces require backend connectivity to function.

---

## 7. Maintenance Window Policy

Planned maintenance (deployments, schema migrations, dependency updates) should be scheduled during the following window:

**Target window**: weekday mornings, 04:00–06:00 local time (Pacific), prior to route specialist shift start.

Rationale: route specialists begin active shifts typically between 06:00–08:00. The 04:00–06:00 window provides a buffer after the overnight shift ends and before the morning shift begins.

**Communication policy**: notify any active Lead or Admin users at least 24 hours before scheduled maintenance. For pilot operations, notification should go to the KCM BA team point of contact (see `planning/security/ADMIN_ACCESS_POLICY.md` for role roster). Maintenance that does not require downtime (zero-downtime deployments) does not require advance notice but should be documented in the changelog.

**Emergency maintenance** (security patches, P1 incident response): no advance notice window applies. Apply the fix; communicate to the KCM BA team contact within 2 hours of completion.

---

## 8. Hosting Upgrade Path

### 8.1 Azure Commercial (Pilot Target)

When S3-1 (hosting decision) selects Azure commercial and S3-2 (managed DB backup config) is complete, the following applies:

**Availability SLA**:
- Azure Database for PostgreSQL Flexible Server with zone-redundant standby: **99.99% uptime SLA**
- Azure App Service (Standard tier or higher): **99.95% uptime SLA**
- Composite application SLA (both tiers): approximately **99.94%**

**Backup**:
- Azure Database for PostgreSQL: automated backups with configurable retention (1–35 days). Geo-redundant backup storage available.
- RPO: configurable; minimum 5-minute point-in-time recovery granularity (PITR)
- Photo storage: Azure Blob Storage with geo-redundant storage (GRS) option — data replicated to a secondary region

**RTO at Azure commercial**:
- DB zone failover (zone-redundant standby): < 60 seconds automatic
- DB restore from backup (PITR): < 4 hours
- App server failure: Azure App Service auto-restarts within seconds; < 5 minutes if manual redeploy required
- Total environment loss: < 2 hours with infrastructure-as-code deployment (Docker + Azure Resource Manager)

**Backup verification**: Azure provides backup health monitoring and test-restore capability through the Azure portal.

### 8.2 Azure Government (Full Contract)

Same infrastructure capabilities as Azure commercial. FedRAMP-Moderate contingency planning (CP) controls inherited. Azure Government regions (USGov Virginia, USGov Iowa) satisfy data residency requirements for government data. HA and backup SLAs identical to Azure commercial.

---

## 9. Document Review and Maintenance

This document is reviewed:
- When S3-1 (hosting decision) is made — update sections 2, 3, 4, 5, 7, and 8 to reflect the confirmed platform
- When S3-2 (managed DB backup config) is complete — update section 3 with the actual backup schedule and retention configuration
- Annually as part of the security policy review cycle
- After any P1 or P2 incident that triggers a restore operation — update RTO estimates based on actual experience
