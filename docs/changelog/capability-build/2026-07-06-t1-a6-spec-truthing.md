# 2026-07-06 — T1-A6 spec truthing: audit-log purge + live response shapes

**Branch:** `docs/issue-a6-spec-truthing`
**Type:** Documentation — deliberate truthing of a spec against shipped code
**Scope:** `planning/capability-build/specs/T1-A6-export-and-delete-ui.md` only. No code, no schema.

## Why

Two claims in the T1-A6 spec were wrong against the shipped `exportDeleteRoutes.ts`.
Both were surfaced during the T1-A5/A6 capability build and the identity-at-rest
hardening reviews and flagged for correction; this entry lands the fix. The code is
authoritative; the spec was corrected to match it (not the reverse).

## What was wrong, and the proof

**1. False audit-retention claim.** The spec's Labor Safety Constraint said *"Audit log
is **not** deleted by execute … The UI must not suggest that audit entries are deleted,"*
and the Review-step copy said *"Audit log is retained."* Live code purges it:

```
exportDeleteRoutes.ts (execute transaction, STEP d):
  :564  SELECT set_config('app.export_delete_active', 'true', true)
  :567  SELECT set_config('app.export_delete_org_id', $1, true)
  :572  DELETE FROM audit_log WHERE org_id = $1
  :575  deletionSummary.audit_log = auditDel.rowCount ?? 0
```

The DELETE is not behind a conditional — it runs on every successful execute. The two
`SET LOCAL` flags unlock the append-only `audit_log_delete` RLS policy for this one
sanctioned purge path; the `export.delete_execute` row written earlier in the same
transaction is included in the purge. The org's audit trail survives only inside the
downloaded export bundle (which carries the full `audit_log` table).

**2. Stale response shapes.** The spec documented `{ token_id, download_url, expires_at,
confirm_token }` (request) and `{ deleted, rows_affected }` (execute). Live contract:

```
request  (:268–272):  { confirmation_token, export_path, expires_at, instructions }
execute  (:579–582):  { deleted: true, deletion_summary, executed_at }
```

There is no top-level `token_id` (embedded in `export_path`); `deletion_summary` is a
per-table `{ <table>: <rowCount> }` map, not a single `rows_affected`.

## What changed in the spec

- Frontend API-client section: corrected `requestExport` / `downloadExport` /
  `executeDelete` return shapes and signatures to the live fields.
- Stepper copy: Request step displays `expires_at` + a download button on `export_path`;
  Review step shows `confirmation_token` and a truthful destruction warning that names the
  audit-log purge and the export bundle as the only surviving copy.
- Result panel: shows the per-table `deletion_summary` (incl. `audit_log` count), not
  `rows_affected`.
- Labor Safety Constraint: replaced the false "not deleted" paragraph with the accurate
  gated-purge description, and corrected the surfaced-fields list.
- Added an in-spec **Correction (2026-07-06 truthing)** note stating what was wrong and why,
  so the change reads as a deliberate truthing, not a silent contradiction.

## Files touched

- `planning/capability-build/specs/T1-A6-export-and-delete-ui.md`
