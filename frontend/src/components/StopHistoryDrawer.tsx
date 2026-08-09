import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { getStopHistory, type StopHistoryEntry, type StopHistoryObservation } from "../api/routeRuns";
import { OpsCard } from "./ui/OpsCard";
import { OpsBadge } from "./ui/OpsBadge";
import { OpsButton } from "./ui/OpsButton";

// SEAM-D D5b — read-only per-stop history drawer.
// Intelligence surface: per-STOP condition/effort over time IS the product.
// History attaches to the asset — no worker identity is fetched or rendered.
// Absence is a valid signal: no visits renders "no observations", never an
// assumed state.

interface StopHistoryDrawerProps {
    stopId: string;
    stopLabel?: string;
    onClose: () => void;
}

function humanize(key: string): string {
    return key.replace(/_/g, " ");
}

function ObservationLine({ obs }: { obs: StopHistoryObservation }) {
    return (
        <li className="flex items-center gap-2 py-0.5 text-sm text-gray-700">
            <OpsBadge
                variant={obs.kind === "presence" ? "danger" : obs.kind === "action" ? "info" : "neutral"}
                value={obs.kind}
            />
            <span>{humanize(obs.type)}</span>
            {obs.norm_status && <span className="text-gray-500">({obs.norm_status.replace("_", " ")})</span>}
            {obs.norm_severity != null && (
                <span className="text-xs text-gray-500">severity {obs.norm_severity}</span>
            )}
        </li>
    );
}

function HistoryEntry({ entry }: { entry: StopHistoryEntry }) {
    return (
        <OpsCard className="p-4 mb-3">
            <div className="flex items-center justify-between mb-2">
                <div className="font-semibold text-gray-900">
                    {entry.visit_date ? new Date(`${entry.visit_date}T00:00:00`).toLocaleDateString() : "—"}
                </div>
                <OpsBadge
                    variant={entry.outcome === "completed" ? "success" : entry.outcome === "skipped" ? "danger" : "neutral"}
                    value={entry.outcome ? entry.outcome.replace("_", " ") : "open"}
                />
            </div>
            {entry.reason_code && (
                <p className="m-0 mb-2 text-sm text-red-700">Reason: {humanize(entry.reason_code)}</p>
            )}

            {entry.observations.length > 0 ? (
                <ul className="m-0 mb-2 list-none p-0">
                    {entry.observations.map((o, i) => (
                        <ObservationLine key={`${o.type}-${i}`} obs={o} />
                    ))}
                </ul>
            ) : (
                <p className="m-0 mb-2 text-sm text-gray-500">No observations asserted on this visit.</p>
            )}

            {entry.effort && (
                <p className="m-0 text-xs text-gray-500">
                    {entry.effort.service_minutes != null && <>Service: {Math.round(entry.effort.service_minutes)} min · </>}
                    Type: {entry.effort.stop_type}
                    {entry.effort.trash_volume != null && <> · Trash volume: {entry.effort.trash_volume}</>}
                </p>
            )}
            {entry.condition_scores && (
                <p className="m-0 text-xs text-gray-500">
                    Condition scores — cleanliness {entry.condition_scores.cleanliness ?? "—"} ·
                    {" "}safety {entry.condition_scores.safety ?? "—"} ·
                    {" "}infrastructure {entry.condition_scores.infra ?? "—"}
                </p>
            )}
        </OpsCard>
    );
}

export function StopHistoryDrawer({ stopId, stopLabel, onClose }: StopHistoryDrawerProps) {
    const { getAccessToken } = useAuth();
    const [entries, setEntries] = useState<StopHistoryEntry[] | null>(null);
    const [totalVisits, setTotalVisits] = useState(0);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const token = await getAccessToken();
                const data = await getStopHistory(token, stopId);
                if (!cancelled) {
                    setEntries(data.entries);
                    setTotalVisits(data.total_visits);
                }
            } catch (err: any) {
                if (!cancelled) setError(err.message || "Failed to load stop history");
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [stopId, getAccessToken]);

    return (
        <div
            className="fixed inset-0 bg-black/40 flex justify-end z-[1000] backdrop-blur-sm"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label={`History for stop ${stopLabel || stopId}`}
        >
            <div
                className="w-[480px] max-w-full bg-white h-full p-8 flex flex-col shadow-2xl overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="mb-6">
                    <h2 className="m-0 text-2xl font-bold text-gray-900">Stop History</h2>
                    <p className="mt-2 mb-0 text-gray-500 text-base">
                        Stop {stopLabel || stopId} — condition and effort over time.
                    </p>
                </header>

                {error && (
                    <OpsCard className="bg-red-50 border-red-200 mb-6 p-3">
                        <p className="m-0 text-red-700 text-sm" role="alert">{error}</p>
                    </OpsCard>
                )}

                {!error && entries === null && (
                    <p className="text-center text-gray-500">Loading history…</p>
                )}

                {!error && entries !== null && entries.length === 0 && (
                    <OpsCard className="p-6">
                        <p className="m-0 text-center text-gray-500">
                            No observations recorded for this stop.
                        </p>
                    </OpsCard>
                )}

                {!error && entries !== null && entries.length > 0 && (
                    <div>
                        <p className="mt-0 mb-3 text-xs text-gray-500 uppercase font-semibold tracking-wide">
                            {totalVisits} visit{totalVisits !== 1 ? "s" : ""} on record
                        </p>
                        {entries.map((entry, i) => (
                            <HistoryEntry key={`${entry.started_at ?? "open"}-${i}`} entry={entry} />
                        ))}
                    </div>
                )}

                <div className="mt-auto pt-8">
                    <OpsButton variant="secondary" onClick={onClose} className="w-full">
                        Close
                    </OpsButton>
                </div>
            </div>
        </div>
    );
}
