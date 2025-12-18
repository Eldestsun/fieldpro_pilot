import type { Stop } from "../api/routeRuns";

export function formatStopLocation(stop: Stop): string {
    const parts = [];
    if (stop.bearing_code) parts.push(`Heading ${stop.bearing_code}`);
    if (stop.on_street_name) parts.push(`on ${stop.on_street_name}`);
    if (stop.intersection_loc) parts.push(stop.intersection_loc);
    if (stop.cross_street) parts.push(stop.cross_street);
    return parts.join(" ");
}
