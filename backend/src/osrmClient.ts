// backend/src/osrmClient.ts

const OSRM_BASE_URL = process.env.OSRM_BASE_URL ?? "http://localhost:5005";

export type OsrmStop = {
  lon: number;
  lat: number;
  stop_id?: string;
  on_street_name?: string;
  bearing_code?: string;
};

export type PlannedRouteLeg = {
  from_index: number;   // index in ordered_stops
  to_index: number;     // index in ordered_stops
  distance_m: number;
  duration_s: number;
};

export type PlannedRoute = {
  distance_m: number;        // total distance of the trip
  duration_s: number;        // total duration of the trip
  ordered_stops: OsrmStop[]; // stops in optimized order
  legs: PlannedRouteLeg[];   // segment-by-segment breakdown
};

export async function planRouteWithOsrm(
  stops: OsrmStop[],
  opts?: { source?: "first" | "any" }
): Promise<PlannedRoute> {
  if (stops.length < 2) {
    throw new Error("At least two stops are required to plan a route.");
  }

  // Build OSRM coordinates string: "lon,lat;lon,lat;..."
  const coords = stops.map((s) => `${s.lon},${s.lat}`).join(";");

  // Use /trip so OSRM can reorder to shortest route
  const url = new URL(`${OSRM_BASE_URL}/trip/v1/driving/${coords}`);
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");

  if (opts?.source === "first") {
    url.searchParams.set("source", "first");
  }

  // Debug logs
  console.log("[OSRM] base=", OSRM_BASE_URL, "env=", process.env.OSRM_BASE_URL);
  console.log("[OSRM] url=", url.toString());

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OSRM error: ${res.status} ${res.statusText} - ${text}`);
  }

  const data = (await res.json()) as any;

  if (!data.trips || data.trips.length === 0) {
    throw new Error("OSRM returned no trips for the given stops.");
  }

  const trip = data.trips[0];

  // waypoints[] is in the same order as input, each with its position in the optimized trip
  const waypoints = data.waypoints as Array<{
    waypoint_index: number;        // position in the optimized route
    location: [number, number];    // [lon, lat]
  }>;

  // Attach original input index to each waypoint
  const withInputIndex = waypoints.map((wp, inputIndex) => ({
    ...wp,
    inputIndex,
  }));

  // Sort by waypoint_index to get the optimized order
  const orderedWaypoints = withInputIndex.sort(
    (a, b) => a.waypoint_index - b.waypoint_index
  );

  // Map back to your original stops array using the original inputIndex
  const ordered_stops: OsrmStop[] = orderedWaypoints.map((wp) => {
    const original = stops[wp.inputIndex];
    const [lon, lat] = wp.location;
    return {
      lon,
      lat,
      stop_id: original?.stop_id,
      on_street_name: original?.on_street_name,
      bearing_code: original?.bearing_code,
    };
  });

  // Legs correspond to each hop between consecutive stops in the optimized trip
  const legs: PlannedRouteLeg[] = (trip.legs as any[]).map((leg, i) => ({
    from_index: i,
    to_index: i + 1,
    distance_m: leg.distance,   // meters
    duration_s: leg.duration,   // seconds
  }));

  return {
    distance_m: trip.distance,
    duration_s: trip.duration,
    ordered_stops,
    legs,
  };
}

/**
 * Calculates the route between two points using OSRM /route service.
 * Supports "approaches" parameter to prefer curbside arrival.
 */
export async function routeLegWithOsrm(
  a: OsrmStop,
  b: OsrmStop,
  opts?: { approaches?: "curb" | "unrestricted" }
): Promise<{ distance_m: number; duration_s: number }> {
  // /route/v1/driving/{lon},{lat};{lon},{lat}
  const coords = `${a.lon},${a.lat};${b.lon},${b.lat}`;
  const url = new URL(`${OSRM_BASE_URL}/route/v1/driving/${coords}`);

  url.searchParams.set("overview", "false"); // We only need metrics, not geometry

  if (opts?.approaches === "curb") {
    // Must provide one value per coordinate
    url.searchParams.set("approaches", "curb;curb");
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OSRM /route error: ${res.status} ${res.statusText} - ${text}`);
  }

  const data = (await res.json()) as any;
  if (!data.routes || data.routes.length === 0) {
    throw new Error("OSRM returned no route for leg.");
  }

  const route = data.routes[0];
  return {
    distance_m: route.distance,
    duration_s: route.duration,
  };
}
