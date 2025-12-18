
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
        const query = `
            WITH base AS (
                SELECT
                    "STOP_ID" AS stop_id,
                    is_hotspot
                FROM stops
                WHERE pool_id IS NOT NULL
                  AND (has_trash = TRUE OR compactor = TRUE)
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
                computed_at
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
                NOW() AS computed_at
            FROM scored;
        `;

        const result = await client.query(query);

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
