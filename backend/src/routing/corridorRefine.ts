import { OsrmStop } from "../osrmClient";

/**
 * Normalizes a string for comparison (trim, uppercase).
 */
function normalize(s?: string): string {
  return (s || "").trim().toUpperCase();
}

/**
 * Extracts all cardinal components from a bearing code.
 * "NB" -> ["N"]
 * "SE" -> ["S", "E"]
 * "Northwest" -> ["N", "W"]
 */
function getBearingComponents(bearingCode: string): string[] {
  const b = normalize(bearingCode);
  const components: string[] = [];
  if (b.includes("N") || b.includes("NORTH")) components.push("N");
  if (b.includes("S") || b.includes("SOUTH")) components.push("S");
  if (b.includes("E") || b.includes("EAST")) components.push("E");
  if (b.includes("W") || b.includes("WEST")) components.push("W");
  return components;
}

type RunMeta = {
  sortKey: "lon" | "lat";
  direction: "ASC" | "DESC";
};

function resolveRunMeta(run: OsrmStop[], bearing: string): RunMeta | null {
  if (!run.length) return null;

  let minLon = run[0].lon, maxLon = run[0].lon;
  let minLat = run[0].lat, maxLat = run[0].lat;

  for (const s of run) {
    if (s.lon < minLon) minLon = s.lon;
    if (s.lon > maxLon) maxLon = s.lon;
    if (s.lat < minLat) minLat = s.lat;
    if (s.lat > maxLat) maxLat = s.lat;
  }

  const lonRange = Math.abs(maxLon - minLon);
  const latRange = Math.abs(maxLat - minLat);
  const isHorizontal = lonRange >= latRange; // Prefer horizontal if equal

  const components = getBearingComponents(bearing);
  let sortDirection: "ASC" | "DESC" | null = null;
  let sortKey: "lon" | "lat" = isHorizontal ? "lon" : "lat";

  if (isHorizontal) {
    if (components.includes("E")) sortDirection = "ASC";
    else if (components.includes("W")) sortDirection = "DESC";
  } else {
    if (components.includes("N")) sortDirection = "ASC";
    else if (components.includes("S")) sortDirection = "DESC";
  }

  if (!sortDirection) return null;
  return { sortKey, direction: sortDirection };
}

export function scoreMonotonicRun(run: OsrmStop[], bearing: string): number {
  if (run.length < 2) return 1;
  const meta = resolveRunMeta(run, bearing);
  if (!meta) return 1;

  const { sortKey, direction } = meta;
  let ok = 0;
  const total = run.length - 1;

  for (let i = 0; i < run.length - 1; i++) {
    const a = sortKey === "lon" ? run[i].lon : run[i].lat;
    const b = sortKey === "lon" ? run[i + 1].lon : run[i + 1].lat;
    const good = direction === "ASC" ? b >= a : b <= a;
    if (good) ok++;
  }

  return ok / total;
}

/**
 * Regroup nearby stops that share street+bearing to reduce corridor fragmentation.
 * Pulls matching stops within a sliding window forward (stable order within group).
 */
export function regroupCorridorWithinWindow(stops: OsrmStop[], window = 8): OsrmStop[] {
  const arr = [...stops];
  let i = 0;

  while (i < arr.length) {
    const base = arr[i];
    const street = normalize(base.on_street_name);
    const bearing = normalize(base.bearing_code);
    if (!street || !bearing) {
      i++;
      continue;
    }

    const matches: number[] = [];
    const limit = Math.min(arr.length, i + window);
    for (let j = i + 1; j < limit; j++) {
      const s = arr[j];
      if (normalize(s.on_street_name) === street && normalize(s.bearing_code) === bearing) {
        matches.push(j);
      }
    }

    if (matches.length) {
      const pulled: OsrmStop[] = [];
      for (let m = 0; m < matches.length; m++) {
        const idx = matches[m] - m; // adjust for prior removals
        pulled.push(arr.splice(idx, 1)[0]);
      }
      arr.splice(i + 1, 0, ...pulled);
    }

    i++;
  }

  return arr;
}

/**
 * Refines the order of stops by enforcing monotonic sorting within contiguous runs
 * of stops that share the same street name and bearing.
 * 
 * Uses coordinate variance to determine the primary axis of the street (E-W vs N-S)
 * to handle diagonal bearings (e.g., "SE" on an East-West street) correctly.
 */
export function refineCorridorRuns(stops: OsrmStop[]): OsrmStop[] {
  // Work on a copy to ensure immutability
  const out = [...stops];
  let i = 0;

  while (i < out.length) {
    const startNode = out[i];
    const street = normalize(startNode.on_street_name);
    const bearing = normalize(startNode.bearing_code);

    // Strict metadata requirement
    if (!street || !bearing) {
      i++;
      continue;
    }

    // Identify contiguous run [i, j-1]
    let j = i + 1;
    while (j < out.length) {
      const current = out[j];
      const curStreet = normalize(current.on_street_name);
      const curBearing = normalize(current.bearing_code);

      if (curStreet !== street || curBearing !== bearing) {
        break;
      }
      j++;
    }

    const runLength = j - i;

    // Only refine if we have at least 2 stops in the run
    if (runLength >= 2) {
      const run = out.slice(i, j);

      const meta = resolveRunMeta(run, bearing);

      // 3. Sort if direction resolved
      if (meta) {
        run.sort((a, b) => {
          const valA = meta.sortKey === "lon" ? a.lon : a.lat;
          const valB = meta.sortKey === "lon" ? b.lon : b.lat;

          if (meta.direction === "ASC") {
            return valA - valB;
          } else {
            return valB - valA;
          }
        });

        // Apply back to output
        for (let k = 0; k < run.length; k++) {
          out[i + k] = run[k];
        }
      }
    }

    // Advance
    i = j;
  }

  return out;
}

export function enforceCorridorSanity(
  stops: OsrmStop[],
  opts: { threshold?: number } = {}
): OsrmStop[] {
  const out = [...stops];
  const threshold = opts.threshold ?? 0.8;
  let i = 0;

  while (i < out.length) {
    const start = out[i];
    const street = normalize(start.on_street_name);
    const bearing = normalize(start.bearing_code);
    if (!street || !bearing) {
      i++;
      continue;
    }

    let j = i + 1;
    while (j < out.length) {
      const cur = out[j];
      if (normalize(cur.on_street_name) !== street || normalize(cur.bearing_code) !== bearing) {
        break;
      }
      j++;
    }

    const run = out.slice(i, j);
    if (run.length >= 2) {
      const score = scoreMonotonicRun(run, bearing);
      if (process.env.DEBUG_OSRM === "1") {
        console.log(`[OSRM][sanity] run=${street}|${bearing} score=${score.toFixed(2)} ids=${run.map(r => r.stop_id).join(",")}`);
      }

      const meta = resolveRunMeta(run, bearing);
      if (meta && score < threshold) {
        const sorted = [...run].sort((a, b) => {
          const valA = meta.sortKey === "lon" ? a.lon : a.lat;
          const valB = meta.sortKey === "lon" ? b.lon : b.lat;
          return meta.direction === "ASC" ? valA - valB : valB - valA;
        });

        if (process.env.DEBUG_OSRM === "1") {
          console.warn(`[OSRM][sanity] correcting run ${street}|${bearing} (score ${score.toFixed(2)}). before=${run.map(r => r.stop_id).join("->")} after=${sorted.map(r => r.stop_id).join("->")}`);
        }

        for (let k = 0; k < sorted.length; k++) {
          out[i + k] = sorted[k];
        }
      }
    }

    i = j;
  }

  return out;
}
