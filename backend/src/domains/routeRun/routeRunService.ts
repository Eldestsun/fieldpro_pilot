import { pool, withOrgContext } from "../../db";
import { loadRouteRunById } from "./loaders/loadRouteRunById";
import { encrypt as encryptOid } from "../../lib/oidCipher";
import { planRouteWithOsrm, OsrmStop } from "../../osrmClient";
import { makeLegCostCache } from "../../routing/routeCost";
import { postOptimizeCurbsideOrder } from "../../routing/curbsidePostOptimize";
import { regroupCorridorWithinWindow, refineCorridorRuns, enforceCorridorSanity } from "../../routing/corridorRefine";
import { getOverridesByPool } from "./routeOverrideService";




const MAX_OSRM_STOPS = 25;

type CandidateStop = OsrmStop & {
  combined_risk_score: number;
  hotspot_weight: number;
  l3_urgency_weight: number;
  on_street_name?: string;
  bearing_code?: string;
};

export async function getCandidateStopsForPoolWithRisk(
  poolId: string,
  limit: number,
  client: any
): Promise<OsrmStop[]> {
  // 1. Fetch raw candidates (limit higher to allow filtering/re-ranking)
  const RAW_LIMIT = 200;

  const query = `
    SELECT
      s.stop_id,
      s.lon,
      s.lat,
      s.on_street_name,
      s.bearing_code,
      COALESCE(r.combined_risk_score, 0) as combined_risk_score,
      COALESCE(r.hotspot_weight, 0) as hotspot_weight,
      COALESCE(r.l3_urgency_weight, 0) as l3_urgency_weight
    FROM public.stops s
    JOIN public.stop_pool_memberships spm
      ON spm.stop_id = s.stop_id
      AND spm.pool_id = $1
      AND spm.active = true
    LEFT JOIN public.stop_risk_snapshot r ON r.stop_id = s.stop_id
    order by combined_risk_score desc
    LIMIT $2
  `;

  const res = await client.query(query, [poolId, RAW_LIMIT]);
  let candidates: CandidateStop[] = res.rows.map((r: any) => ({
    stop_id: r.stop_id,
    lon: r.lon,
    lat: r.lat,
    combined_risk_score: Number(r.combined_risk_score),
    hotspot_weight: Number(r.hotspot_weight),
    l3_urgency_weight: Number(r.l3_urgency_weight),
    on_street_name: r.on_street_name,
    bearing_code: r.bearing_code,
  }));

  // 2. Fetch Overrides
  const overrides = await getOverridesByPool(poolId, client);

  const forceIncludeIds = new Set<string>();
  const forceExcludeIds = new Set<string>();
  const priorityBumps = new Map<string, number>();

  for (const o of overrides) {
    if (o.override_type === "FORCE_EXCLUDE") {
      forceExcludeIds.add(o.stop_id);
    } else if (o.override_type === "FORCE_INCLUDE") {
      forceIncludeIds.add(o.stop_id);
    } else if (o.override_type === "PRIORITY_BUMP") {
      // Sum bumps if multiple (or simply take last, user requirements said "choose a rule", verified: simple map set is fine)
      const existing = priorityBumps.get(o.stop_id) || 0;
      priorityBumps.set(o.stop_id, existing + (Number(o.value) || 0));
    }
  }

  // 3. Apply Excludes
  candidates = candidates.filter(c => !forceExcludeIds.has(c.stop_id!));

  // 4. Apply Includes (fetch missing if needed)
  const existingIds = new Set(candidates.map(c => c.stop_id));
  const missingIncludeIds = [...forceIncludeIds].filter(id => !existingIds.has(id));

  if (missingIncludeIds.length > 0) {
    // Determine the max existing risk to make force-includes higher if needed, 
    // BUT user requirements say "forceIncludeBonus = max_combined_risk_score... + 1" for sorting later.
    // Here we just need the stop data (coords).
    const missingQuery = `
      SELECT s.stop_id, s.lon, s.lat, s.on_street_name, s.bearing_code
      FROM stops s
      JOIN public.stop_pool_memberships spm
        ON spm.stop_id = s.stop_id
        AND spm.pool_id = $2
        AND spm.active = true
      WHERE s.stop_id = ANY($1::text[])
    `;
    const missingRes = await client.query(missingQuery, [missingIncludeIds, poolId]);

    for (const row of missingRes.rows) {
      candidates.push({
        stop_id: row.stop_id,
        lon: row.lon,
        lat: row.lat,
        combined_risk_score: 0, // Defaults
        hotspot_weight: 0,
        l3_urgency_weight: 0,
        on_street_name: row.on_street_name,
        bearing_code: row.bearing_code,
      });
    }
  }

  // 5. Compute Effective Score and Sort
  // Bonus must be higher than any possible risk score. Max risk ~100? Let's use 1000.
  // Actually, let's find the max risk in the current list to be safe.
  const maxRisk = candidates.reduce((max, c) => Math.max(max, c.combined_risk_score), 0);
  const INCLUDE_BONUS = maxRisk + 1000;

  type ScoredCandidate = CandidateStop & { effectiveScore: number };

  const scoredCandidates: ScoredCandidate[] = candidates.map(c => {
    let score = c.combined_risk_score;

    // Add priority bump
    if (priorityBumps.has(c.stop_id!)) {
      score += priorityBumps.get(c.stop_id!)!;
    }

    // Add Force Include Bonus
    if (forceIncludeIds.has(c.stop_id!)) {
      score += INCLUDE_BONUS;
    }

    return { ...c, effectiveScore: score };
  });

  // Sort: EffectiveScore DESC -> Hotspot DESC -> Urgency DESC -> ID ASC
  scoredCandidates.sort((a, b) => {
    if (a.effectiveScore !== b.effectiveScore) return b.effectiveScore - a.effectiveScore;
    if (a.hotspot_weight !== b.hotspot_weight) return b.hotspot_weight - a.hotspot_weight;
    if (a.l3_urgency_weight !== b.l3_urgency_weight) return b.l3_urgency_weight - a.l3_urgency_weight;
    return (a.stop_id || "").localeCompare(b.stop_id || "");
  });

  // 6. Limit
  return scoredCandidates.slice(0, limit).map(c => ({
    stop_id: c.stop_id,
    lon: c.lon,
    lat: c.lat,
    on_street_name: c.on_street_name,
    bearing_code: c.bearing_code,
  })) as any;
}

/**
 * Create Route Run (OSRM + Insert)
 */
/**
 * Create Route Run (OSRM + Insert)
 */
export async function createRouteRun(
  client: any, // PoolClient
  params: {
    stops?: OsrmStop[]; // Optional: if missing, we fetch based on pool_id
    user_id?: number;   // [LEGACY] OID is the preferred identity. If provided, inserted for back-compat.
    assigned_user_oid?: string; // Enterprise Assignment OID (UL)
    created_by_oid?: string;    // Enterprise Creator OID (Lead/Admin)
    route_pool_id: string;
    base_id: string;
    run_date?: string | Date;
    shift_type?: string;        // 'day' | 'night' | 'all_day'. Defaults to 'day'.
  }
) {
  const { stops, user_id, assigned_user_oid, created_by_oid, route_pool_id, base_id, run_date, shift_type } = params;

  let stopsToPlan = stops;

  // If no explicit stops provided, fetch from pool using risk logic
  if (!stopsToPlan || stopsToPlan.length === 0) {
    if (!route_pool_id) {
      throw new Error("Cannot create route run: no stops provided and no pool_id specified.");
    }
    stopsToPlan = await getCandidateStopsForPoolWithRisk(route_pool_id, MAX_OSRM_STOPS, client);

    if (stopsToPlan.length < 2) {
      throw new Error(`Not enough stops found in pool '${route_pool_id}' (found ${stopsToPlan.length})`);
    }
  }

  // 0) Validate we have stops to plan
  if (!stopsToPlan || stopsToPlan.length === 0) {
    throw new Error("No stops provided and no stops found in pool");
  }

  // 1) Fetch Base Coordinates
  const baseRes = await client.query(
    `SELECT id, lon, lat FROM bases WHERE id = $1 AND active = true`,
    [base_id]
  );
  if (baseRes.rows.length === 0) {
    // Strict validation as requested
    const error: any = new Error("Base ID required and must be active for route planning");
    error.status = 400;
    throw error;
  }
  const base = baseRes.rows[0];

  // -- NEW: Metadata Preservation --
  // We must preserve on_street_name and bearing_code because OSRM won't verify them.
  // Map<stop_id, { street, bearing }>
  const metadataMap = new Map<string, { street?: string; bearing?: string }>();
  for (const s of stopsToPlan) {
    if (s.stop_id) {
      metadataMap.set(s.stop_id, {
        street: s.on_street_name,
        bearing: s.bearing_code,
      });
    }
  }

  // 2) Prepend Sentinel Base Stop
  // Use __BASE__ sentinel ID to avoid collisions
  const baseWaypoint: OsrmStop = {
    stop_id: "__BASE__",
    lon: base.lon,
    lat: base.lat,
  };
  const osrmStops = [baseWaypoint, ...stopsToPlan];

  // 3) Ask OSRM for an optimized trip starting from base, no roundtrip
  // approaches removed from Trip call as requested
  const planned = await planRouteWithOsrm(osrmStops, {
    source: "first",
    // roundtrip removed
  });

  // 4) Filter out the base sentinel from the result
  // The first stop in planned.ordered_stops should be our base because source=first
  const orderedRealStops = planned.ordered_stops.filter(
    (s) => s.stop_id !== "__BASE__"
  );

  // -- RE-ATTACH METADATA --
  let missingMetadataCount = 0;
  for (const s of orderedRealStops) {
    if (s.stop_id && metadataMap.has(s.stop_id)) {
      const meta = metadataMap.get(s.stop_id)!;
      s.on_street_name = meta.street;
      s.bearing_code = meta.bearing;
    } else {
      missingMetadataCount++;
    }
  }
  if (missingMetadataCount > 0 && process.env.DEBUG_OSRM === "1") {
    console.warn(`[OSRM] WARNING: ${missingMetadataCount} stops missing metadata (street/bearing). Refinement may be skipped for them.`);
  }

  // Debug: Log order before Optimization
  if (process.env.DEBUG_OSRM === "1") {
    console.log(`[OSRM] Order BEFORE Opt: ${orderedRealStops.map(s => s.stop_id).join(",")}`);
  }

  // -- START POST-OPTIMIZATION --
  // Initialize cost cache
  const costCache = makeLegCostCache();

  // 5a. Run post-optimizer (Advanced Insertion)
  const optimizedStops = await postOptimizeCurbsideOrder(
    orderedRealStops,
    costCache.getCost,
    { lookahead: 8, maxMoves: 30, minImprovementSeconds: 5 }
  );

  if (process.env.DEBUG_OSRM === "1") {
    console.log(`[OSRM] Order AFTER Insert-Opt: ${optimizedStops.map(s => s.stop_id).join(",")}`);
  }

  // 5b. Regroup corridors within a small window to avoid scattered runs
  const regroupedStops = regroupCorridorWithinWindow(optimizedStops, 8);

  // 5c. Run Corridor Refinement (Deterministic Monotonic)
  const corridorRefinedStops = refineCorridorRuns(regroupedStops);

  // 5d. Sanity correction for monotonicity within each corridor run
  const sanityCheckedStops = enforceCorridorSanity(corridorRefinedStops, { threshold: 0.8 });

  if (process.env.DEBUG_OSRM === "1") {
    console.log(`[OSRM] Order AFTER Corridor-Refine: ${corridorRefinedStops.map(s => s.stop_id).join(",")}`);
    console.log(`[OSRM] Order AFTER Sanity: ${sanityCheckedStops.map(s => s.stop_id).join(",")}`);
  }

  // -- END POST-OPTIMIZATION --

  // 5) Write to DB in a transaction
  try {
    await client.query("BEGIN");

    // We need to recompute total distance/duration because we reordered
    // But for the run level, planned.distance_m is "okay" as an estimate, 
    // OR we can sum up the legs we are about to calculate.
    // Let's sum them up for accuracy.
    let totalDist = 0;
    let totalDur = 0;

    // We also need to map the legs.
    // We cannot reuse planned.legs because order changed.
    // We will compute them on the fly during insert loop or pre-calc.
    // Let's pre-calc to get totals first for the run insert.

    const finalLegs: { dist: number, dur: number }[] = [];

    // We need the BASE coordinate to calculate the first leg (Base -> Stop 0)
    // baseWaypoint is available.

    let prevStop = baseWaypoint;

    for (const stop of sanityCheckedStops) {
      const legCost = await costCache.getCost(prevStop, stop);
      finalLegs.push({ dist: legCost.distance_m, dur: legCost.duration_s });
      totalDist += legCost.distance_m;
      totalDur += legCost.duration_s;

      prevStop = stop;
    }

    if (process.env.DEBUG_OSRM === "1") {
      const changedRefine = corridorRefinedStops.some((s: OsrmStop, idx: number) => (s.stop_id || "") !== (optimizedStops[idx]?.stop_id || ""));
      // Also check if optimizer changed anything from OSRM
      const changedOpt = optimizedStops.some((s, i) => s.stop_id !== orderedRealStops[i]?.stop_id);

      console.log(`[OSRM] Run Totals: Trip=${planned.duration_s}s, Final=${totalDur.toFixed(1)}s. Logic: Opt=${changedOpt}, Refine=${changedRefine}`);
    }

    // Enterprise Identity: Insert OIDs.
    // user_id is inserted only if provided. If undefined, we pass NULL.
    const insertRunText = `
      INSERT INTO route_runs (
        user_id, route_pool_id, base_id, run_date, status, total_distance_m, total_duration_s,
        assigned_user_oid, created_by_oid, shift_type
      )
      VALUES ($1, $2, $3, $4, 'planned', $5, $6, $7, $8, $9)
      RETURNING id
    `;
    // Default to today if run_date is missing
    const runDateVal = run_date || new Date();

    const runRes = await client.query(insertRunText, [
      user_id ?? null, // Important: Explicitly null if undefined
      route_pool_id,
      base_id,
      runDateVal,
      totalDist,
      totalDur,
      assigned_user_oid ?? null,
      created_by_oid ?? null,
      shift_type ?? 'day',
    ]);
    const routeRunId = runRes.rows[0].id;

    // -- NEW: Resolve asset_id for all stops --
    // Bulk lookup to avoid N+1
    const stopIds = sanityCheckedStops.map((s) => s.stop_id).filter((id): id is string => !!id);
    const assetIdMap = new Map<string, string>();

    if (stopIds.length > 0) {
      const distinctStopIds = Array.from(new Set(stopIds));
      const assetRes = await client.query(
        `SELECT stop_id, asset_id FROM public.stops WHERE stop_id = ANY($1::text[])`,
        [distinctStopIds]
      );

      for (const r of assetRes.rows) {
        if (r.asset_id) {
          assetIdMap.set(r.stop_id, r.asset_id);
        }
      }

      // Logging for resilience check
      const missingCount = distinctStopIds.length - assetRes.rows.filter((r: any) => !!r.asset_id).length;
      if (missingCount > 0) {
        console.warn(`[createRouteRun] WARNING: ${missingCount}/${distinctStopIds.length} stops missing asset_id mapping.`);
        // Optional: Log first few missing for debugging
        const missingIds = distinctStopIds.filter(id => !assetIdMap.has(id)).slice(0, 5);
        console.warn(`[createRouteRun] Missing asset_ids sample: ${missingIds.join(", ")}`);
      }
    }

    const insertStopText = `
      INSERT INTO route_run_stops (
        route_run_id, stop_id, asset_id, sequence, planned_distance_m, planned_duration_s, org_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, (SELECT org_id FROM route_runs WHERE id = $1))
    `;

    // 6) Insert stops with recomputed legs
    for (let i = 0; i < sanityCheckedStops.length; i++) {
      const stop = sanityCheckedStops[i];
      const leg = finalLegs[i];
      const assetId = stop.stop_id ? assetIdMap.get(stop.stop_id) : null;

      await client.query(insertStopText, [
        routeRunId,
        stop.stop_id,
        assetId || null, // Ensure explicit null if undefined
        i, // 0-based sequence for the worker
        leg.dist,
        leg.dur,
      ]);
    }

    // Write canonical assignments — one per stop, within the same transaction.
    // Creator identity goes to the no-grant sidecar core.assignment_actor_audit
    // (§3.2), never onto core.assignments. Fall back to 'system' if Lead OID unavailable.
    const effectiveCreatedByOid = created_by_oid ?? 'system';
    if (!created_by_oid) {
      console.warn('[createRouteRun] created_by_oid not provided — using system placeholder for assignment_actor_audit');
    }
    const assignRes = await client.query(`
      INSERT INTO core.assignments (
        org_id, assignment_type, status, location_id,
        primary_asset_id, planned_for_date,
        source_system, source_ref, meta
      )
      SELECT
        a.org_id, 'transit_stop_clean', 'planned', loc.location_id,
        s.asset_id, $1::date,
        'route_runs', $2::text, '{}'::jsonb
      FROM route_run_stops rrs
      JOIN public.stops s ON s.stop_id = rrs.stop_id
      JOIN public.assets a ON a.id = rrs.asset_id
      LEFT JOIN core.v_locations_transit loc ON loc.stop_id = rrs.stop_id
      WHERE rrs.route_run_id = $2::bigint
      ON CONFLICT DO NOTHING
      RETURNING id, org_id
    `, [runDateVal, routeRunId]);

    // Identity sidecar for the assignments just created (RETURNING yields only the
    // rows actually inserted, so ON CONFLICT-skipped duplicates get no sidecar row).
    // ISSUE-058: actor_ref holds the non-identifying sentinel for every batch row;
    // the real creator OID lives only in actor_ref_ciphertext. One encrypt for the
    // batch (same creator across all assignments). Never write an identifying value
    // into actor_ref.
    if (assignRes.rows.length > 0) {
      const { ciphertext: oidCiphertext, keyId: oidKeyId } =
        await encryptOid(effectiveCreatedByOid, "assignment_create");
      await client.query(`
        INSERT INTO core.assignment_actor_audit
          (assignment_id, org_id, actor_ref, actor_ref_ciphertext, actor_ref_key_id)
        SELECT UNNEST($1::bigint[]), UNNEST($2::bigint[]), $3, $4, $5
        ON CONFLICT (assignment_id) DO NOTHING
      `, [
        assignRes.rows.map((r: any) => r.id),
        assignRes.rows.map((r: any) => r.org_id),
        'encrypted', oidCiphertext, oidKeyId,
      ]);
    }

    await client.query("COMMIT");

    return { routeRunId, planned };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

// Helper to match normalization in refineCorridorRuns (duplicated to keep service self-contained-ish if needed, but using simple one here)
function normalize(s?: string) { return (s || "").trim().toUpperCase(); }

/**
 * Start a route run
 */
export async function startRouteRun(id: number | string, orgId: number) {
  const updateQuery = `
    UPDATE route_runs
    SET
      status = 'in_progress',
        started_at = COALESCE(started_at, NOW()),
        updated_at = NOW()
    WHERE id = $1
    RETURNING id;
      `;

  const result = await withOrgContext(orgId, (client) =>
    client.query(updateQuery, [id]),
  );

  if (result.rowCount === 0) {
    return null;
  }

  return await loadRouteRunById(id, orgId);
}

/**
 * Finish a route run
 */
export async function finishRouteRun(id: number | string, orgId: number) {
  const updateQuery = `
    UPDATE route_runs
    SET status = 'completed',
        finished_at = NOW(),
        updated_at = NOW()
    WHERE id = $1
    RETURNING id
        `;
  const result = await withOrgContext(orgId, (client) =>
    client.query(updateQuery, [id]),
  );

  if (result.rowCount === 0) {
    return null;
  }

  return await loadRouteRunById(id, orgId);
}

/**
 * Check if all stops are terminal (done/skipped) and mark route finished if so.
 */
export async function checkAndCompleteRouteRun(
  client: any,
  routeRunId: number | string
): Promise<void> {
  // 1. Count stops by status
  const countQuery = `
      SELECT
          COUNT(*) FILTER (WHERE status IN ('pending', 'in_progress')) as pending_count,
          COUNT(*) FILTER (WHERE status IN ('done', 'skipped')) as completed_count
      FROM route_run_stops
      WHERE route_run_id = $1
  `;
  const res = await client.query(countQuery, [routeRunId]);
  const { pending_count, completed_count } = res.rows[0];

  const pending = Number(pending_count);
  const completed = Number(completed_count);

  // 2. If no pending stops and at least one completed stop, mark finished
  if (pending === 0 && completed > 0) {
    // Only update if not already finished/completed?
    // We'll update regardless to ensure timestamp or if it was stuck
    const updateQuery = `
       UPDATE route_runs
       SET status = 'finished',
           finished_at = COALESCE(finished_at, NOW()),
           updated_at = NOW()
       WHERE id = $1
         AND status NOT IN ('finished', 'completed') -- Avoid overwriting if already done
    `;
    await client.query(updateQuery, [routeRunId]);
  }
}

/**
 * Assign a route run to a specific user (UL)
 */
export async function assignRouteRun(client: any, routeRunId: number | string, assignedUserOid: string | null) {
  const updateQuery = `
    UPDATE route_runs
    SET assigned_user_oid = $1,
        updated_at = NOW()
    WHERE id = $2
  `;
  const result = await client.query(updateQuery, [assignedUserOid, routeRunId]);

  if (result.rowCount === 0) {
    // throw consistent error
    const error: any = new Error("Route run not found");
    error.status = 404;
    throw error;
  }
}
