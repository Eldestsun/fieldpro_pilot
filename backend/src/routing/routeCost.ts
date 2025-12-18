import { OsrmStop, routeLegWithOsrm } from "../osrmClient";

export type LegCost = { distance_m: number; duration_s: number };

export function makeLegCostCache() {
    const cache = new Map<string, Promise<LegCost>>();

    return {
        getCost: (a: OsrmStop, b: OsrmStop): Promise<LegCost> => {
            // Stable key construction: use stop_id if available, else coords
            const keyA = a.stop_id ?? `${a.lon},${a.lat}`;
            const keyB = b.stop_id ?? `${b.lon},${b.lat}`;
            const key = `${keyA}->${keyB}`;

            if (cache.has(key)) {
                return cache.get(key)!;
            }

            // Create promise for the request
            const promise = routeLegWithOsrm(a, b, { approaches: "curb" });
            cache.set(key, promise);

            return promise;
        }
    };
}
