import { PoolClient } from "pg";

// ============================================================================
// Canonical State Layer — the one generic write-time normalizer (§4.2).
//
// This is the ONLY place observation meaning is computed. Given a registry row
// and a raw payload it derives the normalized columns intelligence reads —
// (obs_kind, norm_status, norm_severity, intervention, type_id) — never by
// branching on a hardcoded observation_type. New behavior = new registry rows.
//
// Additive discipline (ISSUE-031): normalization NEVER blocks a write. If the
// registry lookup misses, the observation is still inserted with all five
// normalized fields NULL and a warning is logged. The raw payload is never lost.
// ============================================================================

// The registry columns the normalizer needs. Resolved by (org_id, observation_key)
// — observation_key is unique per org (verified live: 30 rows / 30 distinct keys,
// single org). type_id below is registry.id.
export type RegistryRule = {
    id: number;
    observation_key: string;
    obs_kind: string | null; // condition | action | measurement | presence
    ok_rule: any | null;
    severity_map: any | null;
};

// The normalized columns written to core.observations alongside the raw payload.
// All nullable: a kind that does not grade, or a failed registry lookup, leaves
// them NULL.
export type NormalizedFields = {
    obs_kind: string | null;
    norm_status: string | null; // 'ok' | 'not_ok' | null
    norm_severity: number | null; // smallint
    intervention: string | null;
    type_id: number | null;
};

const EMPTY_NORMALIZED: NormalizedFields = {
    obs_kind: null,
    norm_status: null,
    norm_severity: null,
    intervention: null,
    type_id: null,
};

// ----------------------------------------------------------------------------
// Registry lookup — ONE query for a whole batch of observation_types. Callers
// pass the distinct keys; this returns a map keyed by observation_key. No
// per-observation N+1 query.
// ----------------------------------------------------------------------------
export async function loadRegistryRules(
    client: PoolClient,
    orgId: number,
    observationKeys: string[]
): Promise<Map<string, RegistryRule>> {
    const map = new Map<string, RegistryRule>();
    const distinct = [...new Set(observationKeys)];
    if (distinct.length === 0) {
        return map;
    }

    const res = await client.query<RegistryRule>(
        `
        SELECT id, observation_key, obs_kind, ok_rule, severity_map
          FROM core.observation_type_registry
         WHERE org_id = $1
           AND observation_key = ANY($2::text[])
        `,
        [orgId, distinct]
    );

    for (const row of res.rows) {
        map.set(row.observation_key, row);
    }
    return map;
}

// ----------------------------------------------------------------------------
// ok_rule evaluation (§4.2). Minimal: supports only the rule shapes defined in
// the Step 3 Sub-task A migration — {field, lte} for the numeric threshold
// (trash_volume), plus {field, gte} and {field, eq} as the symmetric / boolean
// forms named in the same derivation table. Returns:
//   'ok' | 'not_ok' when the field is present and comparable,
//   null            when rule is null, or the field is absent/null (can't grade —
//                   we never manufacture a not_ok the field did not produce).
// ----------------------------------------------------------------------------
export function evaluateOkRule(rule: any, payload: any): "ok" | "not_ok" | null {
    if (rule == null) {
        return null;
    }
    const field = rule.field;
    if (typeof field !== "string") {
        return null;
    }
    const value = payload?.[field];
    if (value === undefined || value === null) {
        return null;
    }

    if (rule.eq !== undefined) {
        return value === rule.eq ? "ok" : "not_ok";
    }
    if (rule.lte !== undefined && typeof value === "number") {
        return value <= rule.lte ? "ok" : "not_ok";
    }
    if (rule.gte !== undefined && typeof value === "number") {
        return value >= rule.gte ? "ok" : "not_ok";
    }
    return null;
}

// ----------------------------------------------------------------------------
// severity_map evaluation (§4.2). Minimal: {field} reads payload[field] as the
// 0..N severity scale directly (trash_volume level 0..4). Clamped to a smallint
// and rounded; null when no map, or the field is absent/non-numeric.
// ----------------------------------------------------------------------------
export function evaluateSeverityMap(map: any, payload: any): number | null {
    if (map == null) {
        return null;
    }
    const field = map.field;
    if (typeof field !== "string") {
        return null;
    }
    const value = payload?.[field];
    if (typeof value !== "number" || Number.isNaN(value)) {
        return null;
    }
    const n = Math.round(value);
    // smallint guard — never overflow the column.
    if (n < -32768) return -32768;
    if (n > 32767) return 32767;
    return n;
}

// ----------------------------------------------------------------------------
// The normalizer (§4.2). Pure given a registry row. A missing row (unknown
// observation_type) yields all-NULL fields — additive discipline, never throws.
// ----------------------------------------------------------------------------
export function normalizeObservation(
    rule: RegistryRule | undefined,
    observationType: string,
    payload: any
): NormalizedFields {
    if (!rule) {
        console.warn(
            "[observationNormalizer] no registry row for observation_type; writing NULL normalized fields",
            { observation_type: observationType }
        );
        return { ...EMPTY_NORMALIZED };
    }

    const obs_kind = rule.obs_kind ?? null;

    // norm_status: graded only for condition/measurement WITH an ok_rule.
    // presence/action and any rule-less kind stay NULL (§3.3 / §4.2).
    let norm_status: string | null = null;
    if ((obs_kind === "condition" || obs_kind === "measurement") && rule.ok_rule != null) {
        norm_status = evaluateOkRule(rule.ok_rule, payload);
    }

    // norm_severity: only when the type declares a severity_map.
    const norm_severity = evaluateSeverityMap(rule.severity_map, payload);

    // intervention: action rows carry the act identifier — the registry type key
    // itself (design §3.3 / §7 store 'picked_up_litter', 'washed_pad' verbatim, the
    // stable value operational/MV consumers read). Humanization is the §5.1 read-side
    // projection's job, not the stored column. NULL on every other kind.
    const intervention = obs_kind === "action" ? observationType : null;

    return {
        obs_kind,
        norm_status,
        norm_severity,
        intervention,
        type_id: rule.id,
    };
}
