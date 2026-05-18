# 2026-05-13 — S1-4 Export-and-Delete Endpoint with Confirmation Token

## What changed

- **Migration** `backend/migrations/20260513_s1_4_export_delete_tokens.sql`:
  - Created `export_delete_tokens` table: stores sha256 token hash, UUID org_id,
    actor_oid, export_path, issued_at, expires_at (7 days), consumed_at (null until used).
    UNIQUE constraint on token_hash ensures each raw token maps to exactly one row.
  - Added `tenant_uuid TEXT` column to `public.organizations` with a partial UNIQUE index.
    Placeholder for multi-org deployments mapping Azure Tenant UUID → organizations.id.
    Currently null in the single-tenant pilot.
  - Added `audit_log_delete` RLS policy to `audit_log` table: allows DELETE only when
    `SET LOCAL app.export_delete_active = 'true'` and `app.export_delete_org_id` matches
    the row's org_id. The SET LOCAL resets at COMMIT — the delete window cannot leak
    to other requests or transactions.

- **New route file** `backend/src/modules/admin/exportDeleteRoutes.ts`:
  - `POST /api/admin/export-and-delete/request` (Admin only):
    - Queries all canonical data for the org: organizations, core.locations, core.assignments,
      core.visits (including S1-13 ciphertext columns), core.observations, core.evidence,
      stop_effort_history, stop_condition_history, audit_log, eam_bridge_route_log.
    - Writes a gzipped JSON bundle to `EXPORT_STAGING_DIR` (default `/tmp/baseline-exports`).
    - Generates a 32-byte cryptographically secure random token; stores only the sha256 hash.
    - Inserts a row into `export_delete_tokens` with 7-day expiry.
    - Writes two audit entries: `export.data_export` and `export.delete_confirm`.
    - Returns the raw confirmation token exactly once (never stored, never retrievable again).
  - `GET /api/admin/export-and-delete/export/:token_id` (Admin only):
    - Serves the gzipped export bundle. Validates org_id match before serving.
  - `POST /api/admin/export-and-delete/execute` (Admin only):
    - Hashes the provided token, looks up the export_delete_tokens row.
    - Rejects with 404 (no match), 410 (expired), 409 (already consumed), or 403 (org_id mismatch).
    - In a single transaction:
      a. Hard-deletes stop_effort_history, stop_condition_history, eam_bridge_route_log,
         core.evidence, core.observations, core.visits, core.assignments,
         core.location_external_ids, core.asset_locations, core.locations.
      b. Marks token consumed_at = NOW().
      c. Writes `export.delete_execute` audit entry within the transaction.
      d. Sets `app.export_delete_active = 'true'` and `app.export_delete_org_id` as LOCAL
         session variables, then deletes all audit_log rows for the org (including the
         execute row just written). SET LOCAL resets at COMMIT.
    - Returns `{ deleted: true, deletion_summary: { <table>: <count>, … }, executed_at }`.

- **Wired `export.data_export` audit trigger** (S1-2 backlog, ISSUE-010):
  - `export.data_export` is now written in the `/request` handler.
  - Both `export.data_export` and `export.delete_confirm` are written as separate audit rows
    on the same request (granular trail as specified).

- **`backend/src/app.ts`**: mounts `exportDeleteRoutes` at `/api`.

- **`backend/tests/canonical/exportDelete.test.ts`**: 14 new integration tests:
  - Token table structure (required columns, UNIQUE constraint).
  - Token hash lookup (sha256 roundtrip, unknown hash returns 0 rows).
  - Expiry detection (expired token, active token).
  - Consumption replay protection (consumed_at IS NOT NULL).
  - Org_id cross-org guard (mismatch vs. match detection).
  - `audit_log_delete` RLS policy: DELETE blocked without flag, succeeds with flag + correct
    org_id, resets after COMMIT, blocked with wrong org_id in session.
  - `organizations.tenant_uuid` column existence.

- **`backend/tests/run.ts`**: imports exportDelete.test.

## Why

- KCM procurement requirement: county data must be fully exportable and hard-deletable within
  30 days of contract termination.
- Two-step flow (issue token → consume token to delete) prevents accidental irreversible deletion.
- Token hash storage means the raw token can never be recovered from the database even by
  someone with DB read access.
- The audit_log delete policy preserves append-only semantics for all normal operations while
  enabling the one legitimate delete path for contract termination.

## Files touched

- `backend/migrations/20260513_s1_4_export_delete_tokens.sql` (new)
- `backend/src/modules/admin/exportDeleteRoutes.ts` (new)
- `backend/src/app.ts` (mount exportDeleteRoutes)
- `backend/tests/canonical/exportDelete.test.ts` (new, 14 tests)
- `backend/tests/run.ts` (import exportDelete.test)
- `docs/changelog/2026-05-13-s1-4-export-and-delete.md` (this file)
