import type { Stop } from "../api/routeRuns";

export function sortStops(stops: Stop[]): Stop[] {
    const pending = stops.filter((s) => s.status !== "done");
    const done = stops.filter((s) => s.status === "done");
    // Keep original sequence within groups
    return [...pending, ...done];
}
