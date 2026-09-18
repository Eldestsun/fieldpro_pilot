-- ============================================================================
-- LABOR-SAFETY STRUCTURAL DEMO — the five-query proof, runnable verbatim.
--
-- Purpose: demonstrate to any evaluator (KCM IT, a union rep, a chief) that
-- per-worker profiling is STRUCTURALLY impossible in BASELINE — not policy,
-- architecture. Run top to bottom in any SQL client connected as
-- fieldpro_admin (VS Code: open this file → Run). Every query is read-only.
--
-- The narrative: (1) the effort table has no worker column; (2) no
-- intelligence table does; (3) the data attaches to stops; (4) following the
-- only foreign-key path out dead-ends at a visits table with no identity
-- either; (5) the one table where identity lives refuses the intelligence
-- role at the database-permission layer, and even there the OID is ciphertext.
--
-- First shown live 2026-09-17 (founder session). Companion doc:
-- docs/dev/founder-db-verification.md (Q3 there proves ciphertext-at-rest).
-- ============================================================================

-- ── 1. THE STRUCTURE ────────────────────────────────────────────────────────
-- Every column of stop_effort_history. Keyed (stop_id, visit_id): effort facts
-- attach to the STOP. There is no worker column — absent, not hidden.
SELECT ordinal_position, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'stop_effort_history'
ORDER BY ordinal_position;

-- ── 2. THE SWEEP ────────────────────────────────────────────────────────────
-- Any identity-shaped column anywhere in the intelligence tables? Expect zero
-- rows. (If you widen the patterns, beware substring false-positives — e.g.
-- 'hazard_decay_factor' contains 'actor'.)
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_name IN ('stop_effort_history','stop_condition_history','stop_risk_snapshot')
  AND (column_name ILIKE '%user%' OR column_name ILIKE '%oid%'
       OR column_name ILIKE '%worker%' OR column_name = 'actor_ref'
       OR column_name ILIKE 'actor%' OR column_name ILIKE '%_actor')
ORDER BY table_name, column_name;

-- ── 3. THE LIVE DATA ────────────────────────────────────────────────────────
-- What the table actually holds: per-stop effort, hazard/infra flags, volume.
-- Everything an operations chief needs about the STOPS; nothing about WHO.
SELECT stop_id, visit_id, run_date, service_minutes, stop_type,
       had_hazard, had_infra_issue, trash_volume
FROM stop_effort_history
ORDER BY run_date DESC, stop_id
LIMIT 50;

-- ── 4. CHASE THE WORKER ─────────────────────────────────────────────────────
-- The only outbound path is visit_id → core.visits. Its full column list:
-- no actor_oid, no created_by — the identity columns were physically DROPPED
-- (2026-06-01 sidecar extraction). The foreign-key chase hits a dead end,
-- not a redaction.
SELECT ordinal_position, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'core' AND table_name = 'visits'
ORDER BY ordinal_position;

-- ── 5. THE PERMISSION WALL ──────────────────────────────────────────────────
-- The guarantee is enforced by the database engine, per role:
--   intelligence_reader: reads effort + visits; REFUSED on the identity sidecar.
--   audit_reader: reads the sidecar via its own logged channel; can't browse
--   effort history. Each role sees exactly its job — the wall runs both ways.
SELECT t.tbl,
       has_table_privilege('intelligence_reader', t.tbl, 'SELECT') AS intelligence_can_read,
       has_table_privilege('audit_reader',        t.tbl, 'SELECT') AS audit_can_read
FROM (VALUES ('public.stop_effort_history'),
             ('core.visits'),
             ('core.visit_actor_audit')) AS t(tbl);

-- ── CODA: even behind the wall, identity is ciphertext ──────────────────────
-- Inside the sidecar itself, actor_ref is the fixed sentinel 'encrypted'; the
-- real Entra OID exists only as an AES-256-GCM envelope. Expect plaintext = 0.
SELECT COUNT(*) FILTER (WHERE actor_ref <> 'encrypted') AS plaintext_rows,
       COUNT(*) AS total_rows
FROM core.visit_actor_audit;
