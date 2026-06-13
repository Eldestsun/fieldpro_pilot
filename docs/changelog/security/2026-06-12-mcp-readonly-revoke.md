# 2026-06-12 — Revoke `mcp_readonly` to canonical-only (labor-safety remediation)

## What changed
- Added forward migration `backend/migrations/20260612_mcp_readonly_revoke_canonical_only.sql`
  revoking `SELECT` from the LOGIN role `mcp_readonly` on **13** worker-identity / work-attribution objects:
  - 4 identity sidecars: `core.visit_actor_audit`, `core.observation_actor_audit`, `core.evidence_actor_audit`, `core.assignment_actor_audit`
  - `public.identity_directory` (OID → name + email)
  - 2 worker-OID adapter tables: `public.route_runs` (`assigned_user_oid`/`created_by_oid`), `public.lead_route_overrides` (`created_by` = auth-token worker OID)
  - 6 work-attribution logs: `public.clean_logs`, `public.hazards`, `public.infrastructure_issues`, `public.level3_logs`, `public.stop_photos`, `public.trash_volume_logs`
- Added matching rollback `backend/migrations/rollback/20260612_mcp_readonly_revoke_canonical_only_rollback.sql` (re-grants the 13; carries a warning that rollback re-opens the exposure).
- Migration applied and stamped into `public.schema_migrations` (run as `postgres` superuser — required because the four sidecars are `postgres`-owned and only the owner/superuser can REVOKE; the 9 public tables are `fieldpro`-owned).

## Why
- ISSUE-031 ADR **Q-G** and Calibration **D7** settle: `mcp_readonly` is a LOGIN role that could resolve any actor reference to a named, emailed worker and join work-attribution to individuals — contradicting the auditable-by-grant labor-safety claim. Revoke to canonical-only, no exemption.
- `public.lead_route_overrides` was **not** in the original 12-object dispatch list. Phase 0 found its `created_by` column is populated from the auth-token worker OID (`routeOverrideService.ts:addOverride`), making it the same OID-resolution class as `route_runs`. Surfaced as a stop-condition; operator approved adding it (2026-06-12), bringing the revoke to 13 objects.

## Verification (live, post-apply)
- `has_table_privilege` for all 13 revoked objects → **false**; for the kept canonical surface (`core.observations/visits/assignments/evidence/asset_locations/locations/location_external_ids`, `public.stop_risk_snapshot`, `public.transit_stop_assets`) → **true**.
- Full `role_table_grants` dump for `mcp_readonly`: none of the 13 revoked objects appear; 35 non-identity canonical/diagnostic grants remain.
- Control: `intelligence_reader` grants byte-identical before/after — no other role touched.
- Runtime as `mcp_readonly` (via `SET ROLE`): `SELECT count(*) FROM core.observations` → 18 (success); `core.visit_actor_audit` and `public.identity_directory` → `ERROR: permission denied`.

## Known residual (not solved here — separate ISSUE-031 D2/D3 view-eviction work)
Five retained `core.v_*_transit` views are `fieldpro`-owned and run with owner privileges (PG14, ISSUE-029), so `mcp_readonly` can still reach a worker column **through** them despite the base-table revoke:
`v_clean_logs_transit.user_id`, `v_hazards_transit.reported_by`, `v_infra_transit.reported_by`, `v_level3_logs_transit.user_id`, `v_stop_photos_transit.created_by_oid`. These are evicted by the separate view-eviction work, not this migration.

## Files touched
- `backend/migrations/20260612_mcp_readonly_revoke_canonical_only.sql` (new)
- `backend/migrations/rollback/20260612_mcp_readonly_revoke_canonical_only_rollback.sql` (new)
- `docs/changelog/security/2026-06-12-mcp-readonly-revoke.md` (new)
