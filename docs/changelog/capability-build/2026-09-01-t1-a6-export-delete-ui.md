# 2026-09-01 — T1-A6: Export-and-delete UI (Admin), three-phase irreversible flow

## What changed
- New API client `frontend/src/api/exportDelete.ts`: `requestExport`, `downloadExport`,
  `executeDelete` against the three existing S1-4 endpoints
  (`/api/admin/export-and-delete/request|export/:token_id|execute`), consumed unchanged.
  `ExportDeleteApiError` carries HTTP status so the panel maps 410 (expired) / 409
  (consumed) / 401/403 to specific copy. Download goes fetch → blob → object URL
  because the endpoint requires the Bearer header — the spec's "links to
  `export_path`" phrasing cannot authenticate as a plain anchor.
- New `frontend/src/components/admin/AdminExportDeletePanel.tsx`: three-phase stepper
  (Request → Review → Execute). Advancing 1→2 additionally requires the bundle to have
  been downloaded (the Review warning references "the export bundle you downloaded";
  after execute the bundle is the only surviving copy, so proceeding without it is
  never allowed). Review shows the confirmation token (copy-to-clipboard) and the
  truthful purge warning — canonical data **and the audit log itself** are deleted.
  Execute button (danger variant) enables only when the pasted token matches AND the
  irreversibility checkbox is checked. Result panel renders the per-table
  `deletion_summary` (including `audit_log`) and the sign-out-to-re-verify notice.
- `frontend/src/App.tsx`: route `/admin/export-delete` gated
  `RequireRole roles={["Admin"]}`; "Export & Delete" nav entry in the Admin block
  (desktop + mobile).
- 8 component tests (`AdminExportDeletePanel.test.tsx`): stepper gating incl.
  download-before-review, paste-match + checkbox guard, no accidental
  `executeDelete` on transitions, deletion-summary render, 410 mapping, request
  failure surface. Frontend suite 95/95 green; backend suite untouched and 202/202.

## Why
- TPRA-blocking: S2 policy docs cite export-and-delete as a demonstrable data-subject
  rights control; the backend (S1-4) was complete but no UI existed, so a reviewer
  could not see the control work.
- Spec followed as corrected by the 2026-07-06 truthing (audit log IS purged by
  execute; live response shapes `{ confirmation_token, export_path, expires_at,
  instructions }` / `{ deleted, deletion_summary, executed_at }`).

## Files touched
- `frontend/src/api/exportDelete.ts` (new)
- `frontend/src/components/admin/AdminExportDeletePanel.tsx` (new)
- `frontend/src/components/admin/__tests__/AdminExportDeletePanel.test.tsx` (new)
- `frontend/src/App.tsx` (route + nav)
- `docs/changelog/capability-build/2026-09-01-t1-a6-export-delete-ui.md` (this entry)

## Smoke test (scratch org, full round-trip — DB left as found)
Executed 2026-09-01 against the dev backend (`PGHOST` pointed at the Docker
`fieldpro_db`; note the open PG-PORT-COLLISION card — native Homebrew Postgres owns
loopback:5432, so the Docker DB was reached via the host's LAN IP).

Method: a disposable org 9999 was created with 2 `core.locations`, 1 `core.visits`,
1 `core.observations`; a **temporary, never-committed** `scratch-admin` bypass persona
(Admin, org 9999) drove the flow end-to-end:

1. `request` → token + bundle issued; bundle gunzipped and verified: org 9999 rows
   only, all seeded rows present, visit sidecar identity fields null (no plaintext
   worker identity in the bundle for these rows).
2. `execute` → `deletion_summary` matched the seed exactly (locations 2, visits 1,
   observations 1, audit_log 6) and org 1 was untouched (verified by count).
3. Replay of the same token → 409 "already been consumed" (replay guard holds).

Cleanup: org 9999's residual `auth.dev_bypass` audit row, its
`export_delete_tokens` rows, the org row, and the staging bundle under
`/tmp/baseline-exports` were all removed; final counts 0/0/0. The temporary persona
was reverted before commit — the GUARD-DEVBYPASS containment test
(`devAuthBypass.test.ts`: registry carries no persona outside orgs {1, 2}) fails by
design if such a persona persists, and that tripwire was left exactly as authored.

## Notes / follow-ups (observations only, not fixed here — per smoke discipline)
- Under dev bypass every persona shares the null-UUID synthetic tenant, so
  `export_delete_tokens.org_id` cannot distinguish personas; the execute handler
  deletes the org resolved from the **caller**, not the token. Real Entra tenants are
  distinct so the production cross-org check is real; dev-only degeneracy, but worth
  knowing before anyone smoke-tests execute with two personas in flight.
- Repeatable smoke runs of the execute step need an Admin persona for a disposable
  org, which the (correct) GUARD-DEVBYPASS registry containment forbids. If a
  repeatable harness is wanted, that is a founder decision on the registry's
  containment shape, not something a build session should widen.
