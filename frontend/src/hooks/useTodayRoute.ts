import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../auth/AuthContext";
import {
    getTodayRoute,
    startRoute,
    finishRoute,
    startRouteRunStop,
    completeStop,
    getUploadUrl,
    uploadFile,
    updateHotspot,
    type RouteRun,
    type ChecklistState,
    type InfraIssuePayload,
    type CompleteStopPayload,

    EMPTY_CHECKLIST,
    uploadStopPhotos as apiUploadStopPhotos,
    getStopPhotos as apiGetStopPhotos,
    type PhotoDto,
} from "../api/routeRuns";



export interface SafetyState {
    hasConcern: boolean | null;
    hazardTypes?: string[]; // Multi-select
    severity?: number;
    notes?: string;
    wantsToSkip?: boolean;
    safetyPhotoKey?: string; // Key of the uploaded safety photo
}

export interface InfraState {
    hasIssues: boolean | null;
    issues: InfraIssuePayload[];
    notes?: string;
}

export interface HazardDetail {
    hazard_type: string;
    severity?: number;
    notes?: string;
    // local only ID for UI
    id: string;
}

export type WizardStep = "safety" | "tasks" | "infra" | "photo";

export function useTodayRoute() {
    const { getAccessToken } = useAuth();
    const [routeRun, setRouteRun] = useState<RouteRun | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedStopId, setSelectedStopId] = useState<number | null>(null);

    // Action loading states
    const [isCompletingStop, setIsCompletingStop] = useState(false);
    const [isFinishingRoute, setIsFinishingRoute] = useState(false);
    const [isStartingRoute, setIsStartingRoute] = useState(false);
    const [isStartingStop, setIsStartingStop] = useState(false);

    // Local gating state for Stop Detail
    const [hasStartedThisStop, setHasStartedThisStop] = useState(false);

    // Photo upload state
    const [photoKeysMap, setPhotoKeysMap] = useState<Record<number, string[]>>({});
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

    // Checklist state map: { [stopId]: ChecklistState }
    const [checklistState, setChecklistState] = useState<Record<number, ChecklistState>>({});

    // Safety & Infra State
    const [safetyState, setSafetyState] = useState<Record<number, SafetyState>>({});
    const [infraState, setInfraState] = useState<Record<number, InfraState>>({});
    const [cleaningHazardsState, setCleaningHazardsState] = useState<Record<number, HazardDetail[]>>({});

    // Wizard Step State: { [stopId]: WizardStep }
    const [stepState, setStepState] = useState<Record<number, WizardStep>>({});

    const fetchRoute = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const token = await getAccessToken();
            const data = await getTodayRoute(token);
            setRouteRun(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [getAccessToken]);

    useEffect(() => {
        fetchRoute();
    }, [fetchRoute]);

    const handleStartRoute = async () => {
        if (!routeRun) return;
        setIsStartingRoute(true);
        try {
            const token = await getAccessToken();
            const updatedRun = await startRoute(token, routeRun.id);
            setRouteRun(updatedRun);
        } catch (err: any) {
            alert("Error starting route: " + err.message);
        } finally {
            setIsStartingRoute(false);
        }
    };

    const handleFinishRoute = async () => {
        if (!routeRun) return;
        setIsFinishingRoute(true);
        try {
            const token = await getAccessToken();
            const updatedRun = await finishRoute(token, routeRun.id);
            setRouteRun(updatedRun);
        } catch (err: any) {
            alert("Error finishing route: " + err.message);
        } finally {
            setIsFinishingRoute(false);
        }
    };

    const handleStartStop = async (stopId: number) => {
        setIsStartingStop(true);
        try {
            const token = await getAccessToken();
            const updatedRun = await startRouteRunStop(token, stopId);
            setRouteRun(updatedRun);
            setHasStartedThisStop(true);
        } catch (err: any) {
            alert("Error starting stop: " + err.message);
        } finally {
            setIsStartingStop(false);
        }
    };

    const handleSkipStop = async (stopId: number) => {
        setIsCompletingStop(true);
        try {
            const token = await getAccessToken();
            const safety = safetyState[stopId];
            const photoKeysForStop = photoKeysMap[stopId] || [];

            if (!safety?.hasConcern) {
                alert("No safety concern reported.");
                setIsCompletingStop(false);
                return;
            }

            if (!safety.hazardTypes || safety.hazardTypes.length === 0) {
                alert("Please select at least one hazard.");
                setIsCompletingStop(false);
                return;
            }

            if (!safety.safetyPhotoKey) {
                alert("A safety photo is required to skip a stop.");
                setIsCompletingStop(false);
                return;
            }

            const { skipRouteRunStopWithHazard } = await import("../api/routeRuns");
            const updatedRun = await skipRouteRunStopWithHazard(token, stopId, {
                hazard_types: safety.hazardTypes || [], // Now array
                severity: safety.severity,
                notes: safety.notes,
                safety_photo_key: safety.safetyPhotoKey,
                photo_keys: photoKeysForStop,
            });

            setRouteRun(updatedRun);
            cleanupStopState(stopId);
        } catch (err: any) {
            alert("Error skipping stop: " + err.message);
        } finally {
            setIsCompletingStop(false);
        }
    };

    const cleanupStopState = (stopId: number) => {
        setSelectedStopId(null);
        setHasStartedThisStop(false);
        setPhotoKeysMap((prev) => {
            const { [stopId]: _, ...rest } = prev;
            return rest;
        });
        // NOTE: We do not clear cleaningHazardsState either if we want persistence (though cleaning hazards are per-completion).
        // Since they are part of completion payload, they are "done" once sent.
        // But if we want to show them in read-only view, we should keep them.
        // Let's keep them.
    };

    const handleCompleteStop = async (stopId: number) => {
        setIsCompletingStop(true);
        try {
            const token = await getAccessToken();
            const safety = safetyState[stopId];
            const infra = infraState[stopId];

            //Check if user wants to skip
            if (safety?.hasConcern && safety.wantsToSkip) {
                // Delegate to skip handler
                // We need to release the lock here because handleSkipStop will take it
                setIsCompletingStop(false);
                await handleSkipStop(stopId);
                return;
            }

            const id = Number(stopId);
            const checklist = checklistState[id] ?? EMPTY_CHECKLIST;

            // Map infra issues
            const infraIssues =
                infra?.hasIssues && infra.issues.length > 0
                    ? infra.issues
                    : [];

            // Persist to local infraState for read-only view
            setInfraState((prev) => ({
                ...prev,
                [id]: {
                    hasIssues: infraIssues.length > 0,
                    issues: infraIssues,
                    notes: infra?.notes,
                },
            }));

            const payload: CompleteStopPayload = {
                duration_minutes: 10,
                picked_up_litter: checklist.picked_up_litter,
                emptied_trash: checklist.emptied_trash,
                washed_shelter: checklist.washed_shelter,
                washed_pad: checklist.washed_pad,
                washed_can: checklist.washed_can,
                photo_keys: photoKeysMap[stopId] || [],
                infraIssues: infraIssues,
                trashVolume: checklist.trashVolume,
                safety: safetyState[stopId]?.hasConcern ? {
                    hazard_types: safetyState[stopId]?.hazardTypes || [],
                    severity: 1,
                    notes: safetyState[stopId]?.notes || "",
                    safety_photo_key: safetyState[stopId]?.safetyPhotoKey,
                } : undefined,
                hazards: cleaningHazardsState[stopId]?.map(h => ({
                    hazard_type: h.hazard_type,
                    severity: h.severity,
                    notes: h.notes
                })) || [],
            };

            const updatedRun = await completeStop(token, stopId, payload);

            setRouteRun(updatedRun);
            cleanupStopState(stopId);
        } catch (err: any) {
            alert("Error completing stop: " + err.message);
        } finally {
            setIsCompletingStop(false);
        }
    };

    const handleFileUpload = async (
        e: React.ChangeEvent<HTMLInputElement>,
        stopId: number | string
    ) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Normalize to a real number
        const numericStopId =
            typeof stopId === "string" ? parseInt(stopId, 10) : stopId;

        if (!Number.isFinite(numericStopId)) {
            alert("Internal error: stop id is not numeric");
            return;
        }

        setIsUploadingPhoto(true);
        try {
            const token = await getAccessToken();
            const { uploadUrl, objectKey } = await getUploadUrl(
                token,
                numericStopId,
                file.type || "image/jpeg",
                `stop-${numericStopId}-${Date.now()}.jpg`
            );

            await uploadFile(uploadUrl, file);

            setPhotoKeysMap((prev) => {
                const existing = prev[numericStopId] || [];
                return { ...prev, [numericStopId]: [...existing, objectKey] };
            });
        } catch (err: any) {
            alert("Photo upload failed: " + err.message);
        } finally {
            setIsUploadingPhoto(false);
            e.target.value = "";
        }
    };

    const handleToggleHotspot = async (stopId: string, nextIsHotspot: boolean) => {
        try {
            const token = await getAccessToken();
            await updateHotspot(token, stopId, nextIsHotspot);
            // Update local routeRun state so UI reflects change immediately
            setRouteRun((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    stops: prev.stops.map((s) =>
                        s.stop_id === stopId ? { ...s, is_hotspot: nextIsHotspot } : s
                    ),
                };
            });
        } catch (err: any) {
            alert("Error updating hotspot flag: " + (err.message || "Unknown error"));
        }
    };

    const ensureChecklist = (routeRunStopId: number): ChecklistState => {
        if (checklistState[routeRunStopId]) {
            return checklistState[routeRunStopId];
        }
        // Hydrate from existing data if possible, else return empty default
        // We find the stop in the current routeRun to see if it has a volume already
        const stop = routeRun?.stops?.find((s) => s.route_run_stop_id === routeRunStopId);
        const base = EMPTY_CHECKLIST;

        if (stop && stop.trash_volume !== undefined && stop.trash_volume !== null) {
            return {
                ...base,
                trashVolume: stop.trash_volume,
            };
        }
        return base;
    };

    const setChecklistForStop = (
        routeRunStopId: number,
        key: keyof ChecklistState,
        value: boolean | number
    ) => {
        setChecklistState((prev) => {
            const id = Number(routeRunStopId);
            const current = prev[id] ?? EMPTY_CHECKLIST;
            return {
                ...prev,
                [id]: { ...current, [key]: value },
            };
        });
    };

    const setSafetyForStop = (stopId: number, data: SafetyState) => {
        setSafetyState((prev) => ({ ...prev, [stopId]: data }));
    };

    const setInfraForStop = (stopId: number, data: InfraState) => {
        setInfraState((prev) => ({ ...prev, [stopId]: data }));
    };

    const setCleaningHazardsForStop = (stopId: number, hazards: HazardDetail[]) => {
        setCleaningHazardsState((prev) => ({ ...prev, [stopId]: hazards }));
    };

    const handleNextStep = (stopId: number) => {
        setStepState((prev) => {
            const current = prev[stopId] || "safety";
            let next: WizardStep = current;
            if (current === "safety") next = "tasks";
            else if (current === "tasks") next = "infra";
            else if (current === "infra") next = "photo";
            return { ...prev, [stopId]: next };
        });
    };

    const resetStopView = () => {
        setSelectedStopId(null);
        setHasStartedThisStop(false);
        // Note: We don't necessarily clear the step state here if we want to persist it
        // when navigating back and forth, but the requirements imply per-stop state.
        // If we want to reset when leaving the stop completely (e.g. back to list), we should probably clear it.
        // But for now, let's keep it so if they come back it remembers where they were?
        // Actually, the prompt says "Gate UL Flow...". If they leave and come back, maybe it should reset?
        // Let's stick to the pattern of other states: they persist in the map until completion.
    };

    const sortedStops = useMemo(() => {
        if (!routeRun) return [];

        const statusOrder: Record<string, number> = {
            in_progress: 0,
            pending: 0,
            // done, skipped → default rank 1
        };

        const getSeq = (s: any): number => {
            // Backend ordering authority should be `sequence`.
            if (typeof s.sequence === "number" && Number.isFinite(s.sequence)) return s.sequence;

            // Fallbacks (should rarely be needed): route_run_stop_id then stopNumber.
            if (typeof s.route_run_stop_id === "number" && Number.isFinite(s.route_run_stop_id)) {
                return s.route_run_stop_id;
            }

            const n = Number(s.stopNumber);
            return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
        };

        const stops = routeRun.stops ?? [];

        return [...stops].sort((a, b) => {
            const rankA = statusOrder[a.status] ?? 1;
            const rankB = statusOrder[b.status] ?? 1;

            if (rankA !== rankB) return rankA - rankB;

            // Within the same status bucket, preserve the route's planned order.
            return getSeq(a) - getSeq(b);
        });
    }, [routeRun]);

    const stats = useMemo(() => {
        if (!routeRun) return { total: 0, done: 0, pending: 0, miles: "0.0", driveMinutes: 0 };
        const stops = routeRun.stops ?? [];
        const total = stops.length;
        const done = stops.filter((s) => s.status === "done").length;
        const pending = total - done;
        const miles = (routeRun.total_distance_m / 1609.34).toFixed(1);
        const driveMinutes = Math.round(routeRun.total_duration_s / 60);
        return { total, done, pending, miles, driveMinutes };
    }, [routeRun]);

    const summary = useMemo(() => {
        if (!routeRun) {
            return {
                totalStops: 0,
                completedStops: 0,
                inProgressStops: 0,
                pendingStops: 0,
                hotspotCount: 0,
                compactorCount: 0,
                photoList: [],
            };
        }

        const stops = routeRun.stops ?? [];
        const totalStops = stops.length;
        const completedStops = stops.filter((s) => s.status === "done").length;
        const inProgressStops = stops.filter((s) => s.status === "in_progress").length;
        const pendingCount = stops.filter((s) => s.status === "pending").length;

        const hotspotCount = stops.filter((s) => s.is_hotspot).length;
        const compactorCount = stops.filter((s) => s.compactor).length;

        // For now, photoList is empty as we don't have persistence yet
        const photoList: string[] = [];

        return {
            totalStops,
            completedStops,
            inProgressStops,
            pendingStops: pendingCount,
            hotspotCount,
            compactorCount,
            photoList,
        };
    }, [routeRun]);

    const uploadPhotos = async (stopId: number, files: File[], kind: string = "completion"): Promise<PhotoDto[]> => {
        if (!routeRun) throw new Error("No active route run");
        const token = await getAccessToken();
        return apiUploadStopPhotos(token, routeRun.id, stopId, files, kind);
    };

    const fetchPhotos = useCallback(async (stopId: number): Promise<PhotoDto[]> => {
        if (!routeRun) return [];
        const token = await getAccessToken();
        return apiGetStopPhotos(token, routeRun.id, stopId);
    }, [routeRun, getAccessToken]);

    return {
        routeRun,
        loading,
        error,
        selectedStopId,
        setSelectedStopId,
        isCompletingStop,
        isFinishingRoute,
        isStartingRoute,
        isStartingStop,
        hasStartedThisStop,
        setHasStartedThisStop,
        photoKeysMap,
        isUploadingPhoto,

        safetyState,
        infraState,
        fetchRoute,
        handleStartRoute,
        handleFinishRoute,
        handleStartStop,
        handleSkipStop,
        handleCompleteStop,
        handleFileUpload,
        handleToggleHotspot,

        checklistState,
        ensureChecklist,
        setChecklistForStop,
        setSafetyForStop,
        setInfraForStop,
        cleaningHazardsState,
        setCleaningHazardsForStop,
        stepState,
        handleNextStep,
        resetStopView,
        sortedStops,
        stats,
        summary,
        uploadPhotos,
        fetchPhotos,
    };

}

