-- ============================================================
-- Canonical State Layer — normalized observation shape, STEP 6:
--   backfill the normalized columns on EXISTING core.observations rows
-- 2026-06-14 — feat/issue-031-canon-norm-step6-backfill — ISSUE-031 / CANON-NORM
--
-- Steps 1–5 added the five normalized columns (obs_kind / norm_status /
-- norm_severity / intervention / type_id), populated the registry contract
-- (obs_kind + ok_rule + severity_map), and wired the write-time normalizer so
-- NEW observations carry normalized values. The 18 rows that predate the
-- normalizer still have all five normalized columns NULL. This migration runs
-- the normalizer logic as a one-shot SQL UPDATE to bring history into the
-- canonical shape. It closes CANONICAL_STATE_LAYER_DESIGN.md §9 item 4.
--
-- ── DERIVATION (registry JOIN, not hardcoded type strings) ──────────────────────
-- The classification is DERIVED by joining each observation to its registry row on
-- the text key (observation_type = observation_key). We do NOT enumerate type
-- strings in the UPDATE — that is the seeder-shape anti-pattern §3.3/§4 replaces.
-- The registry is the single source of obs_kind / ok_rule / severity_map.
--
--   type_id       <- r.id  (the FK the normalizer resolves by string today, §9 item)
--   obs_kind      <- r.obs_kind
--   norm_status   <- measurement + ok_rule  -> evaluate ok_rule vs payload (ok/not_ok)
--                    everything else         -> NULL  (no manufactured state, §3.3/§4.2)
--   norm_severity <- measurement + severity_map -> payload[severity_map.field]::smallint
--                    everything else             -> NULL
--   intervention  <- action -> observation_type (the key; humanization is a read
--                    concern, §4.2) ; everything else -> NULL
--
-- ── LIVE STATE AT BACKFILL TIME (18 rows, ids 39–56) ────────────────────────────
--   action      (8): picked_up_litter ×4, emptied_trash ×4   -> intervention = key
--   measurement (4): trash_volume {level: 2,2,3,2}           -> ok_rule level<=1 =>
--                                                               all not_ok; sev 2,2,3,2
--   condition   (2): spot_check {} (ids 45,50)               -> all normalized NULL
--   presence    (4): encampment_present, graffiti_present,
--                    shelter_panel_damage_present,
--                    biohazard_present                        -> all normalized NULL
--   Every one of the 18 observation_type values resolves to a registry row; there
--   are NO orphan rows, so none land type_id = NULL.
--
-- ── §9 item 4 ARRIVAL-STATE RECONCILIATION (invariant #5) ───────────────────────
-- §9 item 4 requires that rows which "look like arrival state" be reconciled against
-- invariant #5 (no stored arrival state). The ONLY condition rows in live data are
-- the two spot_check rows (ids 45, 50), each with payload '{}', a real visit_id, and
-- a worker observed_at. A spot_check is a worker-recorded check (§4.2 / §A: it is
-- kind=condition, not legacy arrival state), NOT an auto-generated "dirty on arrival"
-- assertion. The retired arrival-phase write (emitObservationsForStop phase:"arrival")
-- produced NO surviving rows here. Therefore there is nothing to reclassify or mark
-- legacy — the invariant #5 check passes cleanly and this backfill performs no
-- arrival-state remediation. (Were such a row to exist, the rule is: surface it for a
-- decision, do not silently reclassify.)
--
-- ── RLS NOTE (apply as superuser / bypassrls) ───────────────────────────────────
-- core.observations is FORCE ROW LEVEL SECURITY. An UPDATE under a non-superuser role
-- WITHOUT app.current_org_id set would silently affect ZERO rows (CLAUDE.md § RLS
-- Context Gotcha / PATTERN-001). Apply as the postgres superuser (repo migration
-- convention), which bypasses RLS. The normalization is a property of the type
-- SEMANTICS, not the org, so an org-agnostic backfill by key is correct.
--
-- ── IDEMPOTENCY ─────────────────────────────────────────────────────────────────
-- Re-running re-derives the same values from the registry + payload; rows already
-- normalized resolve to the identical result. Safe to re-apply.
-- ============================================================

BEGIN;

UPDATE core.observations o
   SET type_id       = r.id,
       obs_kind      = r.obs_kind,
       norm_status   = CASE
                         WHEN r.obs_kind = 'measurement' AND r.ok_rule IS NOT NULL
                         THEN CASE
                                WHEN (o.payload->>(r.ok_rule->>'field'))::numeric
                                       <= (r.ok_rule->>'lte')::numeric
                                THEN 'ok'
                                ELSE 'not_ok'
                              END
                         ELSE NULL
                       END,
       norm_severity = CASE
                         WHEN r.obs_kind = 'measurement' AND r.severity_map IS NOT NULL
                         THEN (o.payload->>(r.severity_map->>'field'))::smallint
                         ELSE NULL
                       END,
       intervention  = CASE
                         WHEN r.obs_kind = 'action' THEN o.observation_type
                         ELSE NULL
                       END
  FROM core.observation_type_registry r
 WHERE r.observation_key = o.observation_type;

COMMIT;
