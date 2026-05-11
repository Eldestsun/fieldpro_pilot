import type { RouteRun } from "../api/routeRuns";
import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { finishRoute } from "../api/routeRuns";
import { UlLayout } from "./today-route/UlLayout";
import { cn } from "../lib/utils";

interface RouteSummaryProps {
    routeRun: RouteRun;
    summary: {
        totalStops: number;
        completedStops: number;
        inProgressStops: number;
        pendingStops: number;
        hotspotCount: number;
        compactorCount: number;
        photoList: string[];
    };
    onFinishRoute?: () => void;
    onBack: () => void;
    isFinishing?: boolean;
}

export function RouteSummary({
    routeRun,
    summary,
    onFinishRoute,
    onBack,
    isFinishing,
}: RouteSummaryProps) {
    const { getAccessToken } = useAuth();
    const [localFinishing, setLocalFinishing] = useState(false);
    const isBusy = Boolean(isFinishing) || localFinishing;

    const stops = Array.isArray(routeRun.stops) ? routeRun.stops : [];
    const totalStops = stops.length || summary.totalStops;

    const finishedStopCount = stops.filter(s => s.status === "done" || s.status === "skipped").length;

    const isAllDone = stops.length > 0
        ? stops.every(s => s.status === "done" || s.status === "skipped")
        : (summary.totalStops > 0 && summary.pendingStops === 0 && summary.inProgressStops === 0);

    const hasUnfinished = totalStops > 0
        ? (stops.length > 0 ? finishedStopCount < totalStops : (summary.pendingStops > 0 || summary.inProgressStops > 0))
        : false;

    const isAlreadyFinished = String(routeRun.status || "").toLowerCase() === "completed"
        || String(routeRun.status || "").toLowerCase() === "finished";

    // Debug — remove after demo if you want
    console.log("RouteSummary gates", {
        routeStatus: routeRun.status,
        totalStops,
        finishedStopCount,
        isAllDone,
        hasUnfinished,
        isAlreadyFinished,
        isBusy,
        summary
    });

    const handleFinish = async () => {
        if (!isAllDone || isBusy || isAlreadyFinished) return;
        try {
            setLocalFinishing(true);
            const token = await getAccessToken();
            await finishRoute(token, routeRun.id);
            onFinishRoute?.();
        } catch (err: any) {
            console.error("Failed to finish route run", err);
            alert(err?.message || "Failed to complete route");
        } finally {
            setLocalFinishing(false);
        }
    };

    const isDisabled = !isAllDone || isBusy || isAlreadyFinished;

    return (
        <UlLayout>
            <div className="max-w-xl mx-auto px-4">
                <button
                    onClick={onBack}
                    className="mb-4 px-4 py-2 bg-transparent border border-gray-300 rounded text-base cursor-pointer text-gray-700 min-h-[44px] flex items-center hover:bg-gray-50 transition-colors"
                >
                    ← Back to stops
                </button>

                <h2 className="mb-6 text-2xl font-bold text-gray-800">Route Summary</h2>

                <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 mb-8">
                    <div className="mb-4 font-semibold text-gray-600">
                        {routeRun.base_id} • {new Date(routeRun.run_date).toLocaleDateString()}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <StatBox label="Total Stops" value={summary.totalStops} />
                        <StatBox label="Completed" value={summary.completedStops} color="green" />
                        <StatBox
                            label="Pending"
                            value={summary.pendingStops}
                            color={summary.pendingStops > 0 ? "orange" : undefined}
                        />
                        <StatBox
                            label="In Progress"
                            value={summary.inProgressStops}
                            color={summary.inProgressStops > 0 ? "blue" : undefined}
                        />
                        <StatBox label="Hotspots" value={summary.hotspotCount} icon="🔥" />
                        <StatBox label="Compactors" value={summary.compactorCount} icon="♻" />
                    </div>
                </div>

                {/* Photos Section */}
                {summary.photoList.length > 0 && (
                    <div className="mb-8">
                        <h3 className="text-lg font-semibold mb-2">
                            Photos ({summary.photoList.length})
                        </h3>
                        <div className="flex gap-2 overflow-x-auto pb-2">
                            {summary.photoList.map((_, i) => (
                                <div
                                    key={i}
                                    className="w-20 h-20 bg-gray-200 rounded shrink-0 flex items-center justify-center text-gray-500 text-sm"
                                >
                                    📷
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Warnings */}
                {hasUnfinished && !isAlreadyFinished && (
                    <div className="bg-orange-50 border border-orange-200 text-orange-700 p-4 rounded-lg mb-6 text-center">
                        ⚠️ You still have unfinished stops.
                        <br />
                        Please complete all stops before finishing the route.
                    </div>
                )}

                {/* Action */}
                <button
                    onClick={handleFinish}
                    disabled={isDisabled}
                    className={cn(
                        "w-full py-5 text-xl font-bold text-white border-0 rounded-lg min-h-[44px] transition-colors",
                        isDisabled
                            ? "bg-gray-300 cursor-not-allowed"
                            : "bg-blue-700 cursor-pointer hover:bg-blue-800 shadow-md"
                    )}
                >
                    {isAlreadyFinished ? "Route Completed" : isBusy ? "Finishing..." : "Complete Route"}
                </button>
            </div>
        </UlLayout>
    );
}

const COLOR_CLASSES: Record<string, string> = {
    green:  "text-green-700",
    orange: "text-orange-600",
    blue:   "text-blue-600",
};

function StatBox({ label, value, color, icon }: { label: string; value: number; color?: string; icon?: string }) {
    return (
        <div className="bg-white p-3 rounded-lg border border-gray-100 text-center">
            <div className={cn(
                "text-2xl font-bold",
                color ? COLOR_CLASSES[color] : "text-gray-800"
            )}>
                {icon} {value}
            </div>
            <div className="text-sm text-gray-500 mt-1">{label}</div>
        </div>
    );
}
