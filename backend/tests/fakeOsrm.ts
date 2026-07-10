// backend/tests/fakeOsrm.ts
//
// ── FAKE OSRM — THE ONE SANCTIONED EXTERNAL-INFRA STUB IN THIS SUITE ─────────
//
// SCOPE (operator-ruled, SEAM-D CI fix): this stubs OSRM and ONLY OSRM — a
// third-party routing engine with no BASELINE logic, no labor-safety surface,
// and no canonical state. The suite's no-mocking ethos protects the
// CANONICAL/DB layer, which is NEVER mocked: every test that plans a route
// through this fake still writes real rows to the real Postgres and reads its
// assertions back from the real DB. Do NOT grow this file into a general
// external-call mocking framework; a second external stub needs its own
// operator ruling.
//
// WHY IT EXISTS: CI has no OSRM service container (ci.yml runs postgres only),
// and osrmClient has no fallback — POST /route-runs 500s when OSRM is
// unreachable. The fake answers the two endpoints the create path uses:
//   /trip/v1/driving/{coords}   (planRouteWithOsrm — trip optimization)
//   /route/v1/driving/{coords}  (routeLegWithOsrm — curbside leg costs)
// with geometrically plausible, deterministic responses (identity stop order,
// equirectangular distances) so route planning is stable in every environment.
//
// run.ts starts it before runAll() and points OSRM_BASE_URL at it — safely
// before osrmClient's module-load capture, since tests only load the app
// lazily inside test bodies.

import http from "http";
import type { AddressInfo } from "net";

type LonLat = { lon: number; lat: number };

function parseCoords(segment: string): LonLat[] {
  return segment.split(";").map((pair) => {
    const [lon, lat] = pair.split(",").map(Number);
    return { lon, lat };
  });
}

// Rough planar meters between two points — deterministic and plausible;
// routing fidelity is irrelevant to what the suite asserts.
function metersBetween(a: LonLat, b: LonLat): number {
  const kx = Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180)) * 111_320;
  const ky = 110_574;
  const dx = (a.lon - b.lon) * kx;
  const dy = (a.lat - b.lat) * ky;
  return Math.max(1, Math.hypot(dx, dy));
}

const SPEED_MPS = 8; // ~29 km/h urban driving; only needs to be sane

function tripResponse(coords: LonLat[]): object {
  const legs = [];
  let distance = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const d = metersBetween(coords[i], coords[i + 1]);
    legs.push({ distance: d, duration: d / SPEED_MPS, steps: [], summary: "", weight: d / SPEED_MPS });
    distance += d;
  }
  return {
    code: "Ok",
    trips: [
      {
        distance,
        duration: distance / SPEED_MPS,
        legs,
        geometry: { type: "LineString", coordinates: coords.map((c) => [c.lon, c.lat]) },
      },
    ],
    // Identity ordering: waypoint_index = input index. planRouteWithOsrm maps
    // these back onto the caller's stops; the input order is preserved.
    waypoints: coords.map((c, i) => ({
      waypoint_index: i,
      trips_index: 0,
      location: [c.lon, c.lat],
      name: "",
    })),
  };
}

function routeResponse(coords: LonLat[]): object {
  const d = metersBetween(coords[0], coords[coords.length - 1]);
  return { code: "Ok", routes: [{ distance: d, duration: d / SPEED_MPS, legs: [] }] };
}

/**
 * Start the fake OSRM listener on an ephemeral port and point OSRM_BASE_URL
 * at it. Must run before anything loads src/osrmClient.ts (which captures the
 * env var at module load).
 */
export function startFakeOsrm(): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const tripMatch = url.pathname.match(/^\/trip\/v1\/driving\/(.+)$/);
      const routeMatch = url.pathname.match(/^\/route\/v1\/driving\/(.+)$/);
      try {
        if (tripMatch) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(tripResponse(parseCoords(decodeURIComponent(tripMatch[1])))));
          return;
        }
        if (routeMatch) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(routeResponse(parseCoords(decodeURIComponent(routeMatch[1])))));
          return;
        }
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code: "InvalidUrl", message: `fakeOsrm: unhandled path ${url.pathname}` }));
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code: "InvalidQuery", message: String(err) }));
      }
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      process.env.OSRM_BASE_URL = `http://127.0.0.1:${port}`;
      // Never hold the event loop open past the suite.
      server.unref();
      console.log(`tests: fake OSRM (external routing infra stub — DB layer stays real) listening on ${process.env.OSRM_BASE_URL}\n`);
      resolve();
    });
  });
}
