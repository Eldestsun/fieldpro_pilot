import { useEffect, useState } from "react";
import { useAuth } from "./auth/AuthContext";

interface RouteRun {
    id: number;
    base_id: string;
    run_date: string;
    total_distance_m: number;
    total_duration_s: number;
    stops: Stop[];
}

interface Stop {
    sequence: number;
    on_street_name: string;
    cross_street: string;
    intersection_loc: string;
    bearing_code: string;
    is_hotspot: boolean;
    compactor: boolean;
    has_trash: boolean;
}

export function UlTodayRoute() {
    const { getAccessToken, isSignedIn } = useAuth();
    const [routeRun, setRouteRun] = useState<RouteRun | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isSignedIn) return;

        const fetchRoute = async () => {
            setLoading(true);
            setError(null);
            try {
                const token = await getAccessToken();
                // Hardcoded user_id=123 for now as requested
                const res = await fetch("http://localhost:4000/api/ul/todays-run?user_id=123", {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error || "Failed to fetch route");
                }

                const data = await res.json();
                setRouteRun(data.route_run);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchRoute();
    }, [isSignedIn, getAccessToken]);

    if (loading) return <div>Loading today's route...</div>;
    if (error) return <div style={{ color: "red" }}>Error: {error}</div>;
    if (!routeRun) return <div>No route found for today.</div>;

    return (
        <div style={{ padding: "1rem", border: "1px solid #ccc", marginTop: "1rem" }}>
            <h2>Today's Route</h2>
            <div style={{ marginBottom: "1rem" }}>
                <strong>Base:</strong> {routeRun.base_id} |{" "}
                <strong>Date:</strong> {new Date(routeRun.run_date).toLocaleDateString()} |{" "}
                <strong>Distance:</strong> {(routeRun.total_distance_m / 1609.34).toFixed(1)} mi |{" "}
                <strong>Drive time:</strong> {(routeRun.total_duration_s / 60).toFixed(0)} min
            </div>

            <ul style={{ listStyle: "none", padding: 0 }}>
                {routeRun.stops.map((stop) => (
                    <li
                        key={stop.sequence}
                        style={{
                            borderBottom: "1px solid #eee",
                            padding: "0.5rem 0",
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.25rem",
                        }}
                    >
                        <div style={{ fontWeight: "bold" }}>
                            #{stop.sequence} {stop.on_street_name}
                        </div>
                        <div style={{ fontSize: "0.9rem", color: "#555" }}>
                            Cross: {stop.cross_street} ({stop.intersection_loc}) - {stop.bearing_code}
                        </div>
                        <div style={{ display: "flex", gap: "0.5rem", fontSize: "0.8rem" }}>
                            {stop.is_hotspot && (
                                <span style={{ background: "#ffcccc", padding: "2px 6px", borderRadius: "4px" }}>
                                    Hotspot
                                </span>
                            )}
                            {stop.compactor && (
                                <span style={{ background: "#ccffcc", padding: "2px 6px", borderRadius: "4px" }}>
                                    Compactor
                                </span>
                            )}
                            {stop.has_trash && (
                                <span style={{ background: "#ccccff", padding: "2px 6px", borderRadius: "4px" }}>
                                    Trash
                                </span>
                            )}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}
