import { useState } from "react";
import { useTodayRoute } from "../hooks/useTodayRoute";
import type { RouteRun } from "../api/routeRuns";
import { useSyncStatus } from "../offline/useSyncStatus";
import { RouteHeader } from "./today-route/RouteHeader";
import { StopList } from "./today-route/StopList";
import { StopDetail } from "./today-route/StopDetail";
import { RouteSummary } from "./RouteSummary";
import { UlLayout } from "./today-route/UlLayout";
import { ULRouteMap } from "./work/ULRouteMap";
import { getDurableAssetKey, getSafeDomIdFromKey } from "../utils/identity";

export function TodayRouteView() {
    const {
        routeRun,
        loading,
        error,
        selectedStopId,
        setSelectedStopId,
        isCompletingStop,
        isFinishingRoute,
        isStartingRoute,
        hasStartedThisStop,
        photoKeysMap,
        isUploadingPhoto,
        fetchRoute,
        handleStartRoute,
        handleFinishRoute,
        handleCompleteStop,

        ensureChecklist,
        setChecklistForStop,
        resetStopView,
        sortedStops,
        stats,
        summary,
        handleToggleHotspot,
        handleStartStop,
        handleSkipStop,
        safetyState,
        infraState,
        setSafetyForStop,
        setInfraForStop,
        uploadPhotos,
        fetchPhotos,
    } = useTodayRoute();




    const syncStatus = useSyncStatus();

    const [showSummary, setShowSummary] = useState(false);

    // Map selection handler
    // Map selection handler
    const handleMapStopSelect = (durableKey: string) => {
        const elementId = getSafeDomIdFromKey(durableKey);
        const element = document.getElementById(elementId);
        if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    };

    const openGoogleMapsTo = (lat: number, lon: number) => {
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`, "_blank", "noopener,noreferrer");
    };

    const routeLabel =
        routeRun?.route_pool_label ||
        (routeRun as any)?.routePool?.label ||
        (routeRun as any)?.route_pool?.label ||
        (routeRun as any)?.pool_label ||
        (routeRun as any)?.pool_name;

    // Determine next stop for navigation
    // Determine next stop logic per pilot request
    // 1. First status "in_progress"
    // 2. First stop not "done" and not "skipped"
    const nextStop = (() => {
        if (!routeRun) return null;
        const stops = sortedStops ?? [];
        return (
            stops.find((s: RouteRun["stops"][number]) => s.status === "in_progress") ??
            stops.find((s: RouteRun["stops"][number]) => s.status !== "done" && s.status !== "skipped") ??
            null
        );
    })();

    // Loading State — skeleton cards
    if (loading) {
        return (
            <div className="max-w-xl mx-auto px-4 pt-4">
                <div className="animate-pulse mb-4 pb-4 border-b border-gray-200">
                    <div className="h-5 bg-gray-200 rounded w-40 mb-2" />
                    <div className="h-3 bg-gray-100 rounded w-24 mb-3" />
                    <div className="h-2 bg-gray-200 rounded-full" />
                </div>
                <div className="flex flex-col gap-3">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="flex items-start gap-3 p-4 bg-white rounded-lg border border-gray-200 animate-pulse">
                            <div className="shrink-0 h-7 w-8 bg-gray-200 rounded" />
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between gap-4">
                                    <div className="h-4 bg-gray-200 rounded w-2/3" />
                                    <div className="h-5 bg-gray-200 rounded-full w-16" />
                                </div>
                                <div className="h-3 bg-gray-100 rounded w-1/2 mt-2" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // Error State
    if (error) {
        return (
            <div className="max-w-xl mx-auto px-4 pt-8 text-center">
                <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                    <h3 className="text-base font-semibold text-red-800 mb-1">Something went wrong</h3>
                    <p className="text-sm text-red-600 mb-4">{error}</p>
                    <button
                        onClick={fetchRoute}
                        className="px-4 py-2 text-sm font-medium text-red-700 border border-red-300 rounded-md hover:bg-red-100 transition-colors"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    // Empty State
    if (!routeRun) {
        return (
            <div className="max-w-xl mx-auto px-4 pt-16 text-center">
                <div className="text-4xl mb-4">📋</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No route assigned today</h3>
                <p className="text-sm text-gray-500 mb-6">
                    Check with your lead to get a route assigned, then refresh.
                </p>
                <button
                    onClick={fetchRoute}
                    className="px-5 py-2.5 text-sm font-medium text-white bg-blue-700 rounded-md hover:bg-blue-800 transition-colors"
                >
                    Check again
                </button>
            </div>
        );
    }

    const isRouteCompleted = routeRun.status === "completed";

    // Summary View
    if (showSummary) {
        return (
            <RouteSummary
                routeRun={routeRun}
                summary={summary}
                onFinishRoute={async () => {
                    await handleFinishRoute();
                    setShowSummary(false);
                }}
                onBack={() => setShowSummary(false)}
                isFinishing={isFinishingRoute}
            />
        );
    }

    // Detail View
    if (selectedStopId !== null) {
        const stop = routeRun.stops.find((s) => s.route_run_stop_id === selectedStopId);

        if (!stop) {
            return (
                <div className="max-w-xl mx-auto px-4 pt-8 text-center">
                    <p className="text-gray-600 mb-3">Stop not found.</p>
                    <button
                        onClick={resetStopView}
                        className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
                    >
                        ← Back to route
                    </button>
                </div>
            );
        }

        return (
            <StopDetail
                stop={stop}
                isRouteCompleted={isRouteCompleted}
                hasStartedThisStop={hasStartedThisStop}
                checklist={ensureChecklist(stop.route_run_stop_id)}
                attachedPhotoKeys={photoKeysMap[stop.route_run_stop_id] || []}
                isUploadingPhoto={isUploadingPhoto}
                isCompletingStop={isCompletingStop}
                onBack={resetStopView}
                onStartStop={() => handleStartStop(stop.route_run_stop_id)}
                onSetChecklist={(field, value) => setChecklistForStop(stop.route_run_stop_id, field, value)}

                onCompleteStop={() => handleCompleteStop(stop.route_run_stop_id)}
                onToggleHotspot={(next) => handleToggleHotspot(stop.stop_id, next)}
                safety={safetyState[stop.route_run_stop_id]}
                infra={infraState[stop.route_run_stop_id]}
                onSetSafety={(data) => setSafetyForStop(stop.route_run_stop_id, data)}
                onSetInfra={(data) => setInfraForStop(stop.route_run_stop_id, data)}
                onSkipStop={() => handleSkipStop(stop.route_run_stop_id)}
                uploadPhotos={uploadPhotos}
                fetchPhotos={fetchPhotos}
                routeRunId={routeRun.id}
            />


        );
    }

    // List View
    return (
        <UlLayout>
            {syncStatus.summary.totalConflict > 0 && (
                <div className="mb-2 px-3 py-2 bg-red-600 text-white text-sm rounded-md">
                    Some changes could not be synced. Server truth will reload when you're online.
                </div>
            )}
            <RouteHeader stats={stats} syncStatus={syncStatus} routeLabel={routeLabel} />

            {/* Route Completed Banner */}
            {isRouteCompleted && (
                <div className="mb-6 p-4 bg-green-100 text-green-800 border border-green-300 rounded-lg text-center font-semibold">
                    🎉 Route Completed
                </div>
            )}

            {/* Start Route Action */}
            {routeRun.status === "planned" ? (
                <div className="text-center mt-16">
                    <button
                        onClick={handleStartRoute}
                        disabled={isStartingRoute}
                        className="w-full sm:w-auto px-10 py-5 text-2xl font-semibold text-white bg-blue-700 rounded-xl hover:bg-blue-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                    >
                        {isStartingRoute ? "Starting…" : "Start Route"}
                    </button>
                    <p className="mt-6 text-gray-500 text-sm">Ready to roll? Tap to begin.</p>
                </div>
            ) : (
                <>
                    {/* Suggested Route Sequence label */}
                    <div className="mb-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                        Suggested Route Sequence
                    </div>

                    {/* Map Viewport */}
                    <div className="bg-white rounded-xl shadow-md mb-4 overflow-hidden relative">
                        <ULRouteMap
                            stops={routeRun.stops}
                            onSelectStop={handleMapStopSelect}
                            activeStopKey={(() => {
                                const active = routeRun.stops.find(s => s.status === "in_progress" || s.status === "pending");
                                return active ? getDurableAssetKey(active) : undefined;
                            })()}
                            style={{ margin: 0, borderRadius: 0, boxShadow: 'none' }}
                        />
                        <button
                            type="button"
                            onClick={() => {
                                const s = nextStop as any;
                                const lat = s?.lat ?? s?.latitude ?? s?.location?.lat;
                                const lon = s?.lon ?? s?.longitude ?? s?.location?.lon;
                                if (Number.isFinite(lat) && Number.isFinite(lon)) {
                                    openGoogleMapsTo(lat, lon);
                                }
                            }}
                            disabled={!nextStop}
                            className={`absolute left-4 bottom-4 z-10 px-3 py-2 bg-white border border-gray-300 rounded-md shadow-md text-sm font-bold transition-colors ${nextStop ? "text-blue-700 cursor-pointer hover:bg-blue-50" : "text-gray-400 cursor-not-allowed"}`}
                        >
                            Navigate to Next Stop
                        </button>
                    </div>

                    {/* Next Suggested Stop Banner */}
                    {nextStop && (
                        <div className="mb-2 rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                            <span className="font-semibold">Next suggested:</span>{" "}
                            <span className="font-semibold">#{nextStop.sequence}</span>{" "}
                            <span className="text-slate-600">
                                {nextStop.on_street_name ?? nextStop.intersection_loc ?? ""}
                            </span>
                        </div>
                    )}

                    {/* Stop list */}
                    <div className="bg-white rounded-xl shadow-sm mb-6 p-2">
                        <div className="max-h-[60vh] overflow-y-auto">
                            <StopList
                                stops={sortedStops}
                                onSelectStop={setSelectedStopId}
                            />
                        </div>
                    </div>

                    {/* Review & Finish Action */}
                    {!isRouteCompleted && (
                        <div className="mt-8 text-center pb-12">
                            <button
                                onClick={() => setShowSummary(true)}
                                className="btn-primary"
                            >
                                {summary.completedStops === summary.totalStops
                                    ? "Review & Finish Route"
                                    : "View Route Summary"}
                            </button>
                        </div>
                    )}
                </>
            )}
        </UlLayout>
    );
}
