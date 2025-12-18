import { pool } from "../db";
import { planRouteWithOsrm, OsrmStop } from "../osrmClient";
import { makeLegCostCache } from "../routing/routeCost";
import { postOptimizeCurbsideOrder } from "../routing/curbsidePostOptimize";
import { regroupCorridorWithinWindow, refineCorridorRuns, enforceCorridorSanity } from "../routing/corridorRefine";
import { getOverridesByPool } from "./routeOverrideService";

/**
 * Load full route run by ID
 */
export async function loadRouteRunById(id: number | string) {
  // ... existing loadRouteRunById body ...
  const query = `
    SELECT
      rr.id                  AS route_run_id,
      rr.user_id,
      rr.route_pool_id,
      rr.base_id,
      rr.run_date,
      rr.status,
      rr.started_at,
      rr.finished_at,
      rr.total_distance_m,
      rr.total_duration_s,
      rr.created_at          AS route_run_created_at,
      rr.updated_at          AS route_run_updated_at,
      rp.label               AS route_pool_label,
      rrs.id                 AS route_run_stop_id,
      rrs.sequence,
      rrs.status             AS stop_status,
      rrs.completed_at,
      rrs.planned_distance_m,
      rrs.planned_duration_s,
      rrs.created_at         AS route_run_stop_created_at,
      rrs.updated_at         AS route_run_stop_updated_at,
      rrs.trash_volume,
      s."STOP_ID",
      s."STOP_ID"            AS stop_number,
      s."TRF_DISTRICT_CODE",
      s."BAY_CODE",
      s."BEARING_CODE",
      s."ON_STREET_NAME",
      s."INTERSECTION_LOC",
      s."HASTUS_CROSS_STREET_NAME",
      s."NUM_SHELTERS",
      s.is_hotspot,
      s.compactor,
      s.has_trash,
      s.lon,
      s.lat,
      s.notes
    FROM route_runs rr
    LEFT JOIN route_pools rp ON rp.id = rr.route_pool_id
    JOIN route_run_stops rrs ON rrs.route_run_id = rr.id
    JOIN stops s ON s."STOP_ID" = rrs.stop_id
    WHERE rr.id = $1
    ORDER BY rrs.sequence;
  `;

  const result = await pool.query(query, [id]);

  if (result.rows.length === 0) {
    return null;
  }

  const first = result.rows[0];
  return {
    id: first.route_run_id,
    user_id: first.user_id,
    route_pool_id: first.route_pool_id,
    route_pool_label: first.route_pool_label,
    base_id: first.base_id,
    run_date: first.run_date,
    status: first.status,
    started_at: first.started_at,
    finished_at: first.finished_at,
    total_distance_m: first.total_distance_m,
    total_duration_s: first.total_duration_s,
    created_at: first.route_run_created_at,
    updated_at: first.route_run_updated_at,
    stops: result.rows.map((r: any) => ({
      route_run_stop_id: r.route_run_stop_id,
      stop_id: r.STOP_ID,
      stopNumber: r.stop_number,
      sequence: r.sequence,
      status: r.stop_status,
      completed_at: r.completed_at,
      planned_distance_m: r.planned_distance_m,
      planned_duration_s: r.planned_duration_s,
      trash_volume: r.trash_volume,
      location: { lon: r.lon, lat: r.lat },
      on_street_name: r.ON_STREET_NAME,
      cross_street: r.HASTUS_CROSS_STREET_NAME,
      intersection_loc: r.INTERSECTION_LOC,
      bearing_code: r.BEARING_CODE,
      trf_district_code: r.TRF_DISTRICT_CODE,
      bay_code: r.BAY_CODE,
      num_shelters: r.NUM_SHELTERS,
      is_hotspot: r.is_hotspot,
      compactor: r.compactor,
      has_trash: r.has_trash,
      notes: r.notes,
    })),
  };
}


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
      s."STOP_ID", 
      s.lon, 
      s.lat,
      s."ON_STREET_NAME",
      s."BEARING_CODE",
      COALESCE(r.combined_risk_score, 0) as combined_risk_score,
      COALESCE(r.hotspot_weight, 0) as hotspot_weight,
      COALESCE(r.l3_urgency_weight, 0) as l3_urgency_weight
    FROM public.stops s
    LEFT JOIN public.stop_risk_snapshot r ON r.stop_id = s."STOP_ID"
    WHERE s.pool_id = $1
    order by combined_risk_score desc
    LIMIT $2
  `;

  const res = await client.query(query, [poolId, RAW_LIMIT]);
  let candidates: CandidateStop[] = res.rows.map((r: any) => ({
    stop_id: r.STOP_ID,
    lon: r.lon,
    lat: r.lat,
    combined_risk_score: Number(r.combined_risk_score),
    hotspot_weight: Number(r.hotspot_weight),
    l3_urgency_weight: Number(r.l3_urgency_weight),
    on_street_name: r.ON_STREET_NAME,
    bearing_code: r.BEARING_CODE,
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
      SELECT "STOP_ID", lon, lat, "ON_STREET_NAME", "BEARING_CODE"
      FROM stops 
      WHERE "STOP_ID" = ANY($1::text[]) AND pool_id = $2
    `;
    const missingRes = await client.query(missingQuery, [missingIncludeIds, poolId]);

    for (const row of missingRes.rows) {
      candidates.push({
        stop_id: row.STOP_ID,
        lon: row.lon,
        lat: row.lat,
        combined_risk_score: 0, // Defaults
        hotspot_weight: 0,
        l3_urgency_weight: 0,
        on_street_name: row.ON_STREET_NAME,
        bearing_code: row.BEARING_CODE,
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
export async function createRouteRun(
  client: any, // PoolClient
  params: {
    stops?: OsrmStop[]; // Optional: if missing, we fetch based on pool_id
    user_id: number;
    route_pool_id: string;
    base_id: string;
    run_date?: string | Date;
  }
) {
  const { stops, user_id, route_pool_id, base_id, run_date } = params;

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

    const insertRunText = `
      INSERT INTO route_runs (
        user_id, route_pool_id, base_id, run_date, status, total_distance_m, total_duration_s
      )
      VALUES ($1, $2, $3, $4, 'planned', $5, $6)
      RETURNING id
    `;
    // Default to today if run_date is missing
    const runDateVal = run_date || new Date();

    const runRes = await client.query(insertRunText, [
      user_id,
      route_pool_id,
      base_id,
      runDateVal,
      totalDist,
      totalDur,
    ]);
    const routeRunId = runRes.rows[0].id;

    const insertStopText = `
      INSERT INTO route_run_stops (
        route_run_id, stop_id, sequence, planned_distance_m, planned_duration_s
      )
      VALUES ($1, $2, $3, $4, $5)
    `;

    // 6) Insert stops with recomputed legs
    for (let i = 0; i < sanityCheckedStops.length; i++) {
      const stop = sanityCheckedStops[i];
      const leg = finalLegs[i];

      await client.query(insertStopText, [
        routeRunId,
        stop.stop_id,
        i, // 0-based sequence for the worker
        leg.dist,
        leg.dur,
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
export async function startRouteRun(id: number | string) {
  // Mark run as in_progress and set started_at if not already set
  const updateQuery = `
    UPDATE route_runs
    SET
      status = 'in_progress',
        started_at = COALESCE(started_at, NOW()),
        updated_at = NOW()
    WHERE id = $1
    RETURNING id;
      `;

  const result = await pool.query(updateQuery, [id]);

  if (result.rowCount === 0) {
    return null;
  }

  // Reload full run
  return await loadRouteRunById(id);
}

/**
 * Finish a route run
 */
export async function finishRouteRun(id: number | string) {
  // Update status
  const updateQuery = `
    UPDATE route_runs
    SET status = 'completed',
        finished_at = NOW(),
        updated_at = NOW()
    WHERE id = $1
    RETURNING id
        `;
  const result = await pool.query(updateQuery, [id]);

  if (result.rowCount === 0) {
    return null;
  }

  // Return updated run
  // Return updated run
  return await loadRouteRunById(id);
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
