# 2026-07-03 — PRODUCT FIXES surfaced by ISSUE-057: EAM-bridge populate + risk-map rebuild org-scoping

**Type:** Bugfix (product code — called out separately from the ISSUE-057 test-seed work by
founder instruction; see `docs/changelog/ops/2026-07-03-issue-057-test-seed-debt.md` for the
test side) · **Branch:** `fix/issue-057-test-seed-debt`

## 1. `populateEamBridge.ts` — context-less ops script (founder-approved in the ISSUE-057 reply)

The EAM-bridge populate ran context-less against forced-RLS `route_runs` /
`route_run_stops` / `eam_bridge_route_log`: under fail-closed RLS (MT-2) it silently found
**0 runs and populated nothing**. Fixed mirroring the riskMapJob pattern exactly:
- `populate(orgId)` — REQUIRED parameter, throws `orgId is required (fail-closed)` when
  absent/empty; sets `app.current_org_id` on its client (reset before release).
- Its own audit row now carries the passed org (was a hardcoded `org_id: 1`).
- CLI entry requires `EAM_BRIDGE_ORG_ID` (the analog of `RISK_MAP_ORG_ID`) or exits 1.
- Surgical: no other change to the script.

## 2. `riskMapService.ts` — `TRUNCATE stop_risk_snapshot` → `DELETE` (LOUD CALLOUT: found during repair, not pre-approved — one line, easily reverted if the founder disagrees)

The rebuild's `TRUNCATE TABLE stop_risk_snapshot` broke two ways once the hardening landed:
1. **Permission:** TRUNCATE requires the TRUNCATE privilege or ownership. It only ever
   worked because the app role used to OWN the table; the dev rebuild moved ownership to
   `fieldpro_admin`, so the app-role rebuild path (`/admin/intelligence/rebuild-risk-map`,
   the CLI job, the test) died with `permission denied`.
2. **Cross-tenant destruction:** TRUNCATE is not subject to RLS — an org-scoped rebuild
   would have wiped EVERY org's snapshot rows before re-inserting only its own.

`DELETE FROM stop_risk_snapshot` under the session org context is RLS-scoped to that org
and uses the app role's ordinary DELETE grant — **strictly tighter; no privilege widened,
no grant/schema change**. Proven live: an org-654321 snapshot row **survived** an org-1
rebuild (count 1 after), and the app role still **cannot** TRUNCATE (permission denied
re-verified).

## Tripwire

`orgFailClosed.test.ts` gains one compact assertion pinning BOTH scripts' required-org
guards (red with `ISSUE-057 REGRESSION: <script> ran WITHOUT an explicit org` if either
fallback returns).

## Files touched (product)

- `backend/src/scripts/populateEamBridge.ts`
- `backend/src/intelligence/riskMapService.ts` (the one line + comment)
