-- ============================================================================
-- MT-2 (ISSUE-031/MT-2) — flip org-scoped RLS from fail-OPEN to fail-CLOSED.
--
-- Every org_isolation policy (plus audit_log's per-command select/insert policies)
-- carried a pass-all first branch:
--   (COALESCE(current_setting('app.current_org_id', true), '') = '' OR org_id = …)
-- so an UNSET/empty org context matched ALL rows — tenant isolation AND the
-- worker-identity wall evaporated exactly when context was missing. This migration
-- drops that branch. The surviving predicate yields ZERO rows on unset/empty
-- context (NULL comparison is not TRUE) instead of all rows:
--   org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
--
-- Authoritative target set enumerated live from pg_policies (qual contains the
-- pass-all branch, REGARDLESS of policy name — the name filter alone misses
-- audit_log): 34 org_isolation policies (13 core.* + 21 public.*) + audit_log_select
-- + audit_log_insert = 36 policies.
--
--   * export_delete_tokens.org_id is TEXT → text predicate, NO ::bigint cast.
--   * audit_log is org-scoped under per-command names; audit_log_delete is LEFT
--     ALONE (already fail-closed via the app.export_delete_active mechanism).
--   * The *_actor_audit identity sidecars + identity_directory ARE included — the
--     flip makes them MORE protective (fail-closed on unset). Only their
--     org_isolation policy is rewritten; structure, columns, and grants are untouched.
--
-- Now provable at runtime because the app connects as non-super fieldpro (ISSUE-041a).
-- Pairs with ISSUE-013 (application-layer fail-closed resolution), already merged.
-- Idempotent: DROP POLICY IF EXISTS + CREATE; the runner wraps this file in a txn.
-- Migrations run as fieldpro_admin (BYPASSRLS) so this DDL is not self-filtered.
-- ============================================================================

-- ── 33 bigint org_id org_isolation tables (PERMISSIVE, TO public, FOR ALL) ──────
DO $$
DECLARE
  t text;
  bigint_tables text[] := ARRAY[
    'core.asset_locations', 'core.asset_types', 'core.assignment_actor_audit',
    'core.assignments', 'core.evidence', 'core.evidence_actor_audit',
    'core.location_external_ids', 'core.locations', 'core.observation_actor_audit',
    'core.observation_type_registry', 'core.observations', 'core.visit_actor_audit',
    'core.visits',
    'public.asset_external_ids', 'public.assets', 'public.bases', 'public.clean_logs',
    'public.eam_bridge_route_log', 'public.hazards', 'public.identity_directory',
    'public.infrastructure_issues', 'public.lead_route_overrides', 'public.route_pools',
    'public.route_run_stops', 'public.route_runs', 'public.stop_condition_history',
    'public.stop_effort_history', 'public.stop_photos', 'public.stop_pool_memberships',
    'public.stop_risk_snapshot', 'public.stops_legacy', 'public.transit_stop_assets',
    'public.transit_stops'
  ];
BEGIN
  FOREACH t IN ARRAY bigint_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON %s', t);
    EXECUTE format(
      'CREATE POLICY org_isolation ON %s '
      'USING (org_id = NULLIF(current_setting(''app.current_org_id'', true), '''')::bigint) '
      'WITH CHECK (org_id = NULLIF(current_setting(''app.current_org_id'', true), '''')::bigint)',
      t
    );
  END LOOP;
END $$;

-- ── export_delete_tokens: org_id is TEXT — text predicate, NO ::bigint cast ──────
DROP POLICY IF EXISTS org_isolation ON public.export_delete_tokens;
CREATE POLICY org_isolation ON public.export_delete_tokens
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), ''))
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), ''));

-- ── audit_log: the two per-command policies carrying the pass-all branch ─────────
-- (audit_log_delete intentionally untouched — already fail-closed.)
DROP POLICY IF EXISTS audit_log_select ON public.audit_log;
CREATE POLICY audit_log_select ON public.audit_log FOR SELECT
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint);

DROP POLICY IF EXISTS audit_log_insert ON public.audit_log;
CREATE POLICY audit_log_insert ON public.audit_log FOR INSERT
  WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint);
