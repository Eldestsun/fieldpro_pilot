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
        stepState,
        handleNextStep,
        uploadPhotos,
        fetchPhotos,
        setStepForStop,
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

    // Loading State
    if (loading) {
        return (
            <div style={{ padding: "2rem", textAlign: "center", color: "#666" }}>
                <div className="spinner" style={{ marginBottom: "1rem" }}>
                    ⏳
                </div>
                Loading today's route...
            </div>
        );
    }

    // Error State
    if (error) {
        return (
            <div style={{ padding: "2rem", color: "crimson", textAlign: "center" }}>
                <h3>Something went wrong</h3>
                <p>{error}</p>
                <button onClick={fetchRoute} style={{ padding: "0.5rem 1rem", marginTop: "1rem" }}>
                    Retry
                </button>
            </div>
        );
    }

    // Empty State
    if (!routeRun) {
        return (
            <div style={{ padding: "2rem", textAlign: "center", color: "#555" }}>
                <h3>No route assigned yet</h3>
                <p>Check with your lead or try again later.</p>
                <button onClick={fetchRoute} style={{ padding: "0.5rem 1rem", marginTop: "1rem" }}>
                    Retry
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
                <div style={{ padding: "1rem" }}>
                    <p>Stop not found.</p>
                    <button onClick={resetStopView}>Back to route</button>
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
                currentStep={stepState[stop.route_run_stop_id]}
                onNextStep={() => handleNextStep(stop.route_run_stop_id)}
                onSetStep={(step) => setStepForStop(stop.route_run_stop_id, step)}

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
                <div style={{
                    backgroundColor: '#f44336',
                    color: 'white',
                    padding: '6px 10px',
                    fontSize: '0.85rem',
                    marginBottom: '8px',
                    borderRadius: '4px'
                }}>
                    Some changes could not be synced. Server truth will reload when you're online.
                </div>
            )}
            <RouteHeader stats={stats} syncStatus={syncStatus} routeLabel={routeLabel} />

            {/* Route Completed Banner */}
            {isRouteCompleted && (
                <div
                    style={{
                        background: "#c6f6d5",
                        color: "#22543d",
                        padding: "1rem",
                        borderRadius: "8px",
                        marginBottom: "1.5rem",
                        textAlign: "center",
                        fontWeight: "bold",
                        border: "1px solid #9ae6b4",
                    }}
                >
                    🎉 Route Completed
                </div>
            )}

            {/* Start Route Action */}
            {routeRun.status === "planned" ? (
                <div style={{ textAlign: "center", marginTop: "4rem" }}>
                    <button
                        onClick={handleStartRoute}
                        disabled={isStartingRoute}
                        className="btn-primary"
                        style={{
                            fontSize: "1.5rem",
                            padding: "1.2rem 2.5rem",
                            marginTop: "2rem"
                        }}
                    >
                        {isStartingRoute ? "Starting..." : "Start Route"}
                    </button>
                    <p style={{ marginTop: "1.5rem", color: "#718096" }}>
                        Ready to roll? Click to begin.
                    </p>
                </div>
            ) : (
                <>
                    {/* Suggested Route Sequence Banner - Map */}
                    <div className="mb-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700"
                        style={{
                            marginBottom: "0.5rem",
                            borderRadius: "0.25rem",
                            border: "1px solid #e2e8f0",
                            backgroundColor: "#f8fafc",
                            padding: "0.5rem 0.75rem",
                            fontSize: "0.875rem",
                            fontWeight: 600,
                            color: "#334155"
                        }}>
                        Suggested Route Sequence
                    </div>

                    {/* Map Viewport - Added */}
                    <div className="card" style={{ padding: 0, overflow: "hidden", position: "relative" }}>
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
                                // Extract valid coords from nextStop
                                const s = nextStop as any;
                                const lat = s?.lat ?? s?.latitude ?? s?.location?.lat;
                                const lon = s?.lon ?? s?.longitude ?? s?.location?.lon;
                                if (Number.isFinite(lat) && Number.isFinite(lon)) {
                                    openGoogleMapsTo(lat, lon);
                                }
                            }}
                            disabled={!nextStop}
                            style={{
                                position: "absolute",
                                left: "16px",
                                bottom: "16px",
                                padding: "8px 12px",
                                borderRadius: "6px",
                                background: "white",
                                color: nextStop ? "#2b6cb0" : "#a0aec0",
                                fontSize: "0.85rem",
                                fontWeight: "bold",
                                border: "1px solid #cbd5e0",
                                boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                                cursor: nextStop ? "pointer" : "not-allowed",
                                zIndex: 10,
                            }}
                        >
                            Navigate to Next Stop
                        </button>
                    </div>

                    {/* Next Suggested Stop Banner - List */}
                    {nextStop && (
                        <div className="mb-2 rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                            style={{
                                marginBottom: "0.5rem",
                                borderRadius: "0.25rem",
                                border: "1px solid #e2e8f0",
                                backgroundColor: "white",
                                padding: "0.5rem 0.75rem",
                                fontSize: "0.875rem",
                                color: "#334155"
                            }}>
                            <span className="font-semibold" style={{ fontWeight: 600 }}>Next suggested:</span>{" "}
                            <span className="font-semibold" style={{ fontWeight: 600 }}>#{nextStop.sequence}</span>{" "}
                            <span className="text-slate-600" style={{ color: "#475569" }}>
                                {nextStop.on_street_name ?? nextStop.intersection_loc ?? ""}
                            </span>
                        </div>
                    )}

                    <div className="card" style={{ padding: "0.5rem" }}>
                        <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
                            <StopList
                                stops={sortedStops}
                                onSelectStop={setSelectedStopId}
                            />
                        </div>
                    </div>

                    {/* Review & Finish Action */}
                    {!isRouteCompleted && (
                        <div style={{ marginTop: "2rem", textAlign: "center", paddingBottom: "3rem" }}>
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
