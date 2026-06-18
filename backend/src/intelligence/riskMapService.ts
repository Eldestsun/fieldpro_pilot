
import { Pool } from "pg";

/**
 * Rebuilds the stop_risk_snapshot table from primary log tables.
 * Runs in a single transaction: TRUNCATE + INSERT ... SELECT.
 *
 * Risk Scoring V1:
 * - Cleanliness: (Hotspot? HOTSPOT_BASE_WEIGHT:0) + L3_DAYS_WEIGHT*days + TRASH_VOL_WEIGHT*trash_avg
 * - Safety: 3.0 * hazard_severity
 * - Infrastructure: 2.0 * avg_infra_severity
 *
 * @param pool Postgres Pool instance
 * @returns Number of rows inserted
 */
// Hotspot & scoring weights (tunable, must keep scores < 100 for numeric(4,2))
const HOTSPOT_BASE_WEIGHT = 10;  // weight applied only if is_hotspot = true
const L3_DAYS_WEIGHT = 0.20;     // weighting for L3 recency
const TRASH_VOL_WEIGHT = 1.50;   // weighting for trash volume

// Cap days to avoid numeric overflow: 0.20 * 365 = 73
const L3_DAYS_CAP = 365;

// Level 3 target windows (days) by hotspot status
const L3_TARGET_DAYS_HOTSPOT = 21;
const L3_TARGET_DAYS_NORMAL = 30;

// Hazard / safety windows (days)
const HAZARD_WINDOW_DAYS = 7;   // only hazards in this window influence safety_score
const HAZARD_RECENT_DAYS = 1;   // "recent" flag for same-day/next-day caution

// Hazard severity weighting (tunable, must keep safety_score < 100 for numeric(4,2))
const HAZARD_BASE_WEIGHT = 3.0;     // base multiplier (like you already had)
const HAZARD_MAX_DAYS_FOR_EFFECT = 7; // after this many days, hazard effect ≈ 0

export async function rebuildStopRiskSnapshot(pool: Pool): Promise<number> {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // 1. Clear existing snapshot
        await client.query("TRUNCATE TABLE stop_risk_snapshot");

        // 2. Recompute and Insert
        //
        // Tier 2 migration: source CTEs now read from core.observations and core.visits
        // instead of level3_logs / trash_volume_logs / hazards / infrastructure_issues.
        // CANON-NORM-3: the hazard CTE additionally reads severity from the normalized
        // read seam core.v_observation_normalized (its first real reader).
        //
        // Stop-identity translation uses Path B/C from planning/architecture/ADAPTER_BOUNDARY.md:
        //   asset_id (canonical) → transit_stop_assets (one-hop adapter lookup) → stop_id
        // Path E (core.visits.route_run_stop_id) is not yet available — that column lands in Tier 5.
        //
        // Schema notes that deviate from the plan SQL in planning/TIER_2_INTELLIGENCE_MIGRATION.md:
        //   - core.observations has no observed_value column; numeric values live in payload jsonb.
        //     trash_volume payload is { level: 0|1|2|3|4 } per submitObservations().
        //   - The generic 'safety_concern_present' and 'infrastructure_issue_present'
        //     umbrellas have BOTH been retired (canonical state layer §1, dual
        //     retirements 2026-05-25). Hazard signal is the OR over the 8
        //     specific safety *_present types; infra signal is the OR over the
        //     8 specific infra *_present types.
        //   - CANON-NORM-3 (this change): hazard severity is now READ from the real
        //     normalized magnitude core.v_observation_normalized.norm_severity (this
        //     view's first reader), replacing the synthesized 1.0. norm_severity is an
        //     OPAQUE 0..N magnitude whose encoding (range, spacing, category mapping)
        //     is owned by INTEL-SEVERITY-WEIGHTING; this reader makes NO assumption
        //     about the scale — it multiplies the existing HAZARD_BASE_WEIGHT by
        //     whatever magnitude the column holds, so any future re-encoding is
        //     inherited automatically. There is deliberately no low/medium/high logic
        //     and no 1/2/3 literal here.
        //   - Infra severity has NO canonical magnitude source today (every infra
        //     presence row has norm_severity NULL). Swapping its COUNT(*)-capped
        //     presence proxy for a magnitude read would collapse the infra signal to
        //     zero — a scoring/weighting decision that is NOT state's to make. Per
        //     CANON-NORM-3's stop condition the COUNT(*)-capped-at-5 proxy is PRESERVED
        //     here and the magnitude swap is flagged for INTEL-SEVERITY-WEIGHTING.
        const query = `
            WITH base AS (
                SELECT
                    ts.stop_id,
                    ts.is_hotspot,
                    ts.org_id
                FROM transit_stops ts
                WHERE ts.pool_id IS NOT NULL
                  AND (ts.has_trash = TRUE OR ts.compactor = TRUE)
            ),
            -- Days since last completed visit (replaces level3_logs).
            -- core.visits → transit_stop_assets (asset_id translation) → stop_id.
            l3 AS (
                SELECT
                    lei.external_id AS stop_id,
                    DATE_PART('day', NOW() - MAX(v.ended_at))::int AS days_since_last_l3
                FROM core.visits v
                JOIN core.asset_locations al
                  ON al.asset_id = v.primary_asset_id
                 AND al.active = TRUE
                 AND al.role = 'primary'
                JOIN core.location_external_ids lei
                  ON lei.location_id = al.location_id
                 AND lei.source_system = 'metro_stop'
                WHERE v.outcome = 'completed'
                  AND v.ended_at IS NOT NULL
                GROUP BY lei.external_id
            ),
            -- Trash volume from canonical observations (replaces trash_volume_logs).
            -- Payload shape: { level: 0|1|2|3|4 }.
            trash AS (
                SELECT
                    lei.external_id AS stop_id,
                    AVG((o.payload->>'level')::numeric)::numeric(4,2) AS recent_trash_volume_avg
                FROM core.observations o
                JOIN core.asset_locations al
                  ON al.asset_id = o.asset_id
                 AND al.active = TRUE
                 AND al.role = 'primary'
                JOIN core.location_external_ids lei
                  ON lei.location_id = al.location_id
                 AND lei.source_system = 'metro_stop'
                WHERE o.observation_type = 'trash_volume'
                  AND o.observed_at >= NOW() - INTERVAL '7 days'
                  AND (o.payload ? 'level')
                GROUP BY lei.external_id
            ),
            -- Hazard signals from canonical observations (replaces hazards table).
            -- CANON-NORM-3 repoint: severity is the REAL normalized magnitude
            -- core.v_observation_normalized.norm_severity (this view's first reader),
            -- NOT a synthesized 1.0. norm_severity is an opaque 0..N magnitude owned by
            -- INTEL-SEVERITY-WEIGHTING; this reader makes no assumption about its range
            -- or spacing — safety_score just multiplies HAZARD_BASE_WEIGHT by it, so a
            -- future re-encoding is inherited automatically.
            --
            -- The seam exposes type_id (not observation_type), so the 8 pinned safety
            -- presence types are resolved via the registry observation_key — same hazard
            -- definition as before, sourced canonically.
            --
            -- DISTINCT ON keeps last_hazard_at / hazard_days_ago = the MOST RECENT hazard
            -- (matching the old MAX(observed_at)) and pairs THAT row's magnitude as
            -- last_hazard_severity (matches the column name and the recency-decay applied
            -- in safety_score).
            --
            -- NULL handling: every row produced here IS a present hazard (the type filter
            -- + window guarantee it), so COALESCE(norm_severity, 1) floors a present-but-
            -- unmagnituded hazard to the MULTIPLICATIVE IDENTITY 1 — i.e. "still counts as
            -- a hazard, no magnitude multiplier." The 1 is the identity element of the
            -- BASE * severity product, NOT a severity-scale literal; it is encoding-
            -- independent (real magnitudes pass straight through). The "no hazard at all"
            -- case is the LEFT JOIN miss handled downstream (COALESCE(..., 0) → 0), so a
            -- NULL-magnitude hazard is never silently dropped or zeroed.
            haz AS (
                SELECT DISTINCT ON (lei.external_id)
                    lei.external_id AS stop_id,
                    o.observed_at AS last_hazard_at,
                    COALESCE(o.norm_severity, 1)::numeric(4,2) AS last_hazard_severity,
                    DATE_PART('day', NOW() - o.observed_at)::int AS hazard_days_ago
                FROM core.v_observation_normalized o
                JOIN core.observation_type_registry r
                  ON r.id = o.type_id
                JOIN core.asset_locations al
                  ON al.asset_id = o.asset_id
                 AND al.active = TRUE
                 AND al.role = 'primary'
                JOIN core.location_external_ids lei
                  ON lei.location_id = al.location_id
                 AND lei.source_system = 'metro_stop'
                WHERE r.observation_key IN (
                    'encampment_present',
                    'fire_present',
                    'dangerous_activity_present',
                    'drug_use_present',
                    'violence_present',
                    'biohazard_present',
                    'access_blocked',
                    'other_safety_concern_present'
                  )
                  AND o.observed_at >= NOW() - INTERVAL '${HAZARD_WINDOW_DAYS} days'
                ORDER BY lei.external_id, o.observed_at DESC
            ),
            -- Infrastructure scores from canonical observations (replaces infrastructure_issues).
            -- CANON-NORM-3: infra has NO canonical severity magnitude today — every infra
            -- presence row has norm_severity NULL (the capture path carries no severity at
            -- the source; see CANON-NORM-2). Repointing this to a norm_severity read would
            -- zero the infra signal, a scoring/weighting change that is an INTELLIGENCE
            -- decision, not state's. Per CANON-NORM-3's stop condition the existing
            -- COUNT(*)-capped-at-5 presence proxy (stands in for AVG(severity)) is PRESERVED
            -- unchanged here; the magnitude swap is FLAGGED for INTEL-SEVERITY-WEIGHTING.
            -- The generic 'infrastructure_issue_present' umbrella was retired
            -- (canonical state layer §2.1, 2026-05-25); presence is now the OR over
            -- the 8 specific infra *_present types.
            infra AS (
                SELECT
                    lei.external_id AS stop_id,
                    LEAST(COUNT(*)::numeric, 5)::numeric(4,2) AS infra_issue_score
                FROM core.observations o
                JOIN core.asset_locations al
                  ON al.asset_id = o.asset_id
                 AND al.active = TRUE
                 AND al.role = 'primary'
                JOIN core.location_external_ids lei
                  ON lei.location_id = al.location_id
                 AND lei.source_system = 'metro_stop'
                WHERE o.observation_type IN (
                    'glass_damage_present',
                    'graffiti_present',
                    'receptacle_damage_present',
                    'shelter_panel_damage_present',
                    'lighting_failure_present',
                    'access_obstructed_by_landscape',
                    'structural_damage_present',
                    'other_infrastructure_issue_present'
                  )
                  AND o.observed_at >= NOW() - INTERVAL '30 days'
                GROUP BY lei.external_id
            ),
            scored AS (
                SELECT
                    b.stop_id,
                    b.is_hotspot,
                    b.org_id,

                    -- Cap days_since_last_l3 at 365 so scores fit into numeric(4,2)
                    LEAST(COALESCE(l3.days_since_last_l3, ${L3_DAYS_CAP}), ${L3_DAYS_CAP}) AS days_since_last_l3,

                    t.recent_trash_volume_avg,
                    h.last_hazard_at,
                    h.last_hazard_severity,
                    h.hazard_days_ago,
                    i.infra_issue_score,

                    (CASE WHEN b.is_hotspot THEN ${HOTSPOT_BASE_WEIGHT} ELSE 0 END)::numeric(4,2) AS hotspot_weight,

                    -- Hazard recency flag (for routing caution)
                    (CASE
                        WHEN h.last_hazard_at IS NOT NULL
                         AND h.hazard_days_ago <= ${HAZARD_RECENT_DAYS}
                        THEN TRUE
                        ELSE FALSE
                    END) AS has_recent_hazard,

                    -- Hazard decay factor (0–1 range)
                    GREATEST(
                        0,
                        LEAST(
                            1,
                            (${HAZARD_MAX_DAYS_FOR_EFFECT} - COALESCE(h.hazard_days_ago, ${HAZARD_MAX_DAYS_FOR_EFFECT}))
                            / ${HAZARD_MAX_DAYS_FOR_EFFECT}::numeric
                        )
                    ) AS hazard_decay_factor,

                    -- Level 3 urgency: only counts days *over* the target window (21 hotspot / 30 normal)
                    (
                        ${L3_DAYS_WEIGHT} * GREATEST(
                            LEAST(COALESCE(l3.days_since_last_l3, ${L3_DAYS_CAP}), ${L3_DAYS_CAP}) -
                            CASE WHEN b.is_hotspot THEN ${L3_TARGET_DAYS_HOTSPOT} ELSE ${L3_TARGET_DAYS_NORMAL} END,
                            0
                        )
                    )::numeric(4,2) AS l3_urgency_weight,

                    -- Cleanliness Score
                    (
                        (CASE WHEN b.is_hotspot THEN ${HOTSPOT_BASE_WEIGHT} ELSE 0 END) +
                        (${TRASH_VOL_WEIGHT} * COALESCE(t.recent_trash_volume_avg, 0)) +
                        (
                            ${L3_DAYS_WEIGHT} * GREATEST(
                                LEAST(COALESCE(l3.days_since_last_l3, ${L3_DAYS_CAP}), ${L3_DAYS_CAP}) -
                                CASE WHEN b.is_hotspot THEN ${L3_TARGET_DAYS_HOTSPOT} ELSE ${L3_TARGET_DAYS_NORMAL} END,
                                0
                            )
                        )
                    )::numeric(4,2) AS cleanliness_score,

                    -- Safety Score (updated with decay)
                    (
                        ${HAZARD_BASE_WEIGHT}
                        * COALESCE(h.last_hazard_severity, 0)
                        * GREATEST(
                            0,
                            LEAST(
                                1,
                                (${HAZARD_MAX_DAYS_FOR_EFFECT} - COALESCE(h.hazard_days_ago, ${HAZARD_MAX_DAYS_FOR_EFFECT}))
                                / ${HAZARD_MAX_DAYS_FOR_EFFECT}::numeric
                            )
                        )
                    )::numeric(4,2) AS safety_score,

                    -- Infrastructure Score
                    (2.0 * COALESCE(i.infra_issue_score, 0))::numeric(4,2) AS infrastructure_score

                FROM base b
                LEFT JOIN l3 ON b.stop_id = l3.stop_id
                LEFT JOIN trash t ON b.stop_id = t.stop_id
                LEFT JOIN haz h ON b.stop_id = h.stop_id
                LEFT JOIN infra i ON b.stop_id = i.stop_id
            )
            INSERT INTO stop_risk_snapshot (
                stop_id,
                is_hotspot,
                days_since_last_l3,
                l3_urgency_weight,
                recent_trash_volume_avg,
                last_hazard_at,
                last_hazard_severity,
                hazard_days_ago,
                hazard_decay_factor,
                has_recent_hazard,
                infra_issue_score,
                hotspot_weight,
                cleanliness_score,
                safety_score,
                infrastructure_score,
                combined_risk_score,
                computed_at,
                org_id
            )
            SELECT
                stop_id,
                is_hotspot,
                days_since_last_l3,
                l3_urgency_weight,
                recent_trash_volume_avg,
                last_hazard_at,
                last_hazard_severity,
                hazard_days_ago,
                hazard_decay_factor,
                has_recent_hazard,
                infra_issue_score,
                hotspot_weight,
                cleanliness_score,
                safety_score,
                infrastructure_score,
                (cleanliness_score + safety_score + infrastructure_score)::numeric(6,3) AS combined_risk_score,
                NOW() AS computed_at,
                org_id
            FROM scored;
        `;

        const result = await client.query(query);

        // R10 Change 3 — write stop_condition_history for stops with a visit in the last day.
        // route_run_stop_id is not yet on core.visits (Tier 5), so we use the transit_stop_assets
        // one-hop translation (Path B/C, tolerated per ADAPTER_BOUNDARY.md §5).
        await client.query(`
            INSERT INTO stop_condition_history (stop_id, visit_id, scored_at, cleanliness_score, safety_score, infra_score, asset_id, org_id)
            SELECT
                srs.stop_id,
                v.id,
                NOW(),
                srs.cleanliness_score,
                srs.safety_score,
                srs.infrastructure_score,
                al.asset_id,
                v.org_id
            FROM stop_risk_snapshot srs
            JOIN core.location_external_ids lei
              ON lei.external_id = srs.stop_id
             AND lei.source_system = 'metro_stop'
            JOIN core.asset_locations al
              ON al.location_id = lei.location_id
             AND al.active = TRUE
             AND al.role = 'primary'
            JOIN core.visits v ON v.primary_asset_id = al.asset_id
            WHERE v.ended_at >= NOW() - INTERVAL '1 day'
            ON CONFLICT (stop_id, visit_id) DO NOTHING
        `);

        await client.query("COMMIT");
        console.log(`[riskMap] stop_risk_snapshot rebuilt with ${result.rowCount} rows`);
        return result.rowCount ?? 0;
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("[riskMap] Failed to rebuild snapshot:", err);
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Legacy snapshot rebuild — reads from level3_logs / trash_volume_logs / hazards /
 * infrastructure_issues. Preserved verbatim under Tier 2 additive discipline so the
 * canonical rebuildStopRiskSnapshot() output can be diffed against the legacy output
 * during the verification window. Delete once verified (Tier 2 done-definition).
 *
 * @see planning/TIER_2_INTELLIGENCE_MIGRATION.md Change 2 — Additive Verification Period
 */
export async function rebuildStopRiskSnapshotLegacy(pool: Pool): Promise<number> {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        await client.query("TRUNCATE TABLE stop_risk_snapshot");

        const query = `
            WITH base AS (
                SELECT
                    ts.stop_id,
                    ts.is_hotspot,
                    ts.org_id
                FROM transit_stops ts
                WHERE ts.pool_id IS NOT NULL
                  AND (ts.has_trash = TRUE OR ts.compactor = TRUE)
            ),
            l3 AS (
                SELECT
                    stop_id,
                    DATE_PART('day', NOW() - MAX(cleaned_at))::int AS days_since_last_l3
                FROM level3_logs
                GROUP BY stop_id
            ),
            trash AS (
                SELECT
                    stop_id,
                    AVG(volume)::numeric(4,2) AS recent_trash_volume_avg
                FROM trash_volume_logs
                WHERE logged_at >= NOW() - INTERVAL '7 days'
                GROUP BY stop_id
            ),
            haz AS (
                SELECT
                    stop_id,
                    MAX(reported_at) AS last_hazard_at,
                    MAX(severity)    AS last_hazard_severity,
                    DATE_PART('day', NOW() - MAX(reported_at))::int AS hazard_days_ago
                FROM hazards
                WHERE reported_at >= NOW() - INTERVAL '${HAZARD_WINDOW_DAYS} days'
                GROUP BY stop_id
            ),
            infra AS (
                SELECT
                    stop_id,
                    AVG(severity)::numeric(4,2) AS infra_issue_score
                FROM infrastructure_issues
                WHERE reported_at >= NOW() - INTERVAL '30 days'
                GROUP BY stop_id
            ),
            scored AS (
                SELECT
                    b.stop_id,
                    b.is_hotspot,
                    b.org_id,

                    LEAST(COALESCE(l3.days_since_last_l3, ${L3_DAYS_CAP}), ${L3_DAYS_CAP}) AS days_since_last_l3,

                    t.recent_trash_volume_avg,
                    h.last_hazard_at,
                    h.last_hazard_severity,
                    h.hazard_days_ago,
                    i.infra_issue_score,

                    (CASE WHEN b.is_hotspot THEN ${HOTSPOT_BASE_WEIGHT} ELSE 0 END)::numeric(4,2) AS hotspot_weight,

                    (CASE
                        WHEN h.last_hazard_at IS NOT NULL
                         AND h.hazard_days_ago <= ${HAZARD_RECENT_DAYS}
                        THEN TRUE
                        ELSE FALSE
                    END) AS has_recent_hazard,

                    GREATEST(
                        0,
                        LEAST(
                            1,
                            (${HAZARD_MAX_DAYS_FOR_EFFECT} - COALESCE(h.hazard_days_ago, ${HAZARD_MAX_DAYS_FOR_EFFECT}))
                            / ${HAZARD_MAX_DAYS_FOR_EFFECT}::numeric
                        )
                    ) AS hazard_decay_factor,

                    (
                        ${L3_DAYS_WEIGHT} * GREATEST(
                            LEAST(COALESCE(l3.days_since_last_l3, ${L3_DAYS_CAP}), ${L3_DAYS_CAP}) -
                            CASE WHEN b.is_hotspot THEN ${L3_TARGET_DAYS_HOTSPOT} ELSE ${L3_TARGET_DAYS_NORMAL} END,
                            0
                        )
                    )::numeric(4,2) AS l3_urgency_weight,

                    (
                        (CASE WHEN b.is_hotspot THEN ${HOTSPOT_BASE_WEIGHT} ELSE 0 END) +
                        (${TRASH_VOL_WEIGHT} * COALESCE(t.recent_trash_volume_avg, 0)) +
                        (
                            ${L3_DAYS_WEIGHT} * GREATEST(
                                LEAST(COALESCE(l3.days_since_last_l3, ${L3_DAYS_CAP}), ${L3_DAYS_CAP}) -
                                CASE WHEN b.is_hotspot THEN ${L3_TARGET_DAYS_HOTSPOT} ELSE ${L3_TARGET_DAYS_NORMAL} END,
                                0
                            )
                        )
                    )::numeric(4,2) AS cleanliness_score,

                    (
                        ${HAZARD_BASE_WEIGHT}
                        * COALESCE(h.last_hazard_severity, 0)
                        * GREATEST(
                            0,
                            LEAST(
                                1,
                                (${HAZARD_MAX_DAYS_FOR_EFFECT} - COALESCE(h.hazard_days_ago, ${HAZARD_MAX_DAYS_FOR_EFFECT}))
                                / ${HAZARD_MAX_DAYS_FOR_EFFECT}::numeric
                            )
                        )
                    )::numeric(4,2) AS safety_score,

                    (2.0 * COALESCE(i.infra_issue_score, 0))::numeric(4,2) AS infrastructure_score

                FROM base b
                LEFT JOIN l3 ON b.stop_id = l3.stop_id
                LEFT JOIN trash t ON b.stop_id = t.stop_id
                LEFT JOIN haz h ON b.stop_id = h.stop_id
                LEFT JOIN infra i ON b.stop_id = i.stop_id
            )
            INSERT INTO stop_risk_snapshot (
                stop_id,
                is_hotspot,
                days_since_last_l3,
                l3_urgency_weight,
                recent_trash_volume_avg,
                last_hazard_at,
                last_hazard_severity,
                hazard_days_ago,
                hazard_decay_factor,
                has_recent_hazard,
                infra_issue_score,
                hotspot_weight,
                cleanliness_score,
                safety_score,
                infrastructure_score,
                combined_risk_score,
                computed_at,
                org_id
            )
            SELECT
                stop_id,
                is_hotspot,
                days_since_last_l3,
                l3_urgency_weight,
                recent_trash_volume_avg,
                last_hazard_at,
                last_hazard_severity,
                hazard_days_ago,
                hazard_decay_factor,
                has_recent_hazard,
                infra_issue_score,
                hotspot_weight,
                cleanliness_score,
                safety_score,
                infrastructure_score,
                (cleanliness_score + safety_score + infrastructure_score)::numeric(6,3) AS combined_risk_score,
                NOW() AS computed_at,
                org_id
            FROM scored;
        `;

        const result = await client.query(query);

        await client.query("COMMIT");
        console.log(`[riskMap:legacy] stop_risk_snapshot rebuilt with ${result.rowCount} rows`);
        return result.rowCount ?? 0;
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("[riskMap:legacy] Failed to rebuild snapshot:", err);
        throw err;
    } finally {
        client.release();
    }
}
