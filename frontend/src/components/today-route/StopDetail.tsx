import React, { useState, useEffect } from "react";
import { cn } from "../../lib/utils";
import type { Stop, ChecklistState, InfraIssuePayload, PhotoDto } from "../../api/routeRuns";
import type { SafetyState, InfraState } from "../../hooks/useTodayRoute";
import { formatStopLocation } from "../../utils/formatStopLocation";
import { ImagePreviewModal } from "../common/ImagePreviewModal";
import { useAuth } from "../../auth/AuthContext";
import { getQueuedUploadCountForStop, subscribe, hasPendingStartStopForStop, hasPendingSkipStopForStop } from "../../offline/offlineQueue";
import { saveStopDraft, loadStopDraft, clearStopDraft } from "../../offline/stopDraftStore";
import { ConfirmDialog } from "../ui/ConfirmDialog";

const CHECKLIST_ITEMS: { key: keyof ChecklistState; label: string }[] = [
    { key: 'picked_up_litter', label: 'Picked up litter' },
    { key: 'emptied_trash', label: 'Emptied trash' },
    { key: 'washed_shelter', label: 'Washed shelter' },
    { key: 'washed_pad', label: 'Washed pad' },
    { key: 'washed_can', label: 'Washed can' },
];

// 1. Define Infra Meta
type InfraIssueKey =
    | 'broken_glass'
    | 'graffiti'
    | 'receptacle_damaged'
    | 'panel_damaged'
    | 'lighting_out'
    | 'contaminated_waste'
    | 'landscaping_blocking'
    | 'structure_damaged'
    | 'other_infra';

const INFRA_ISSUE_META: Record<InfraIssueKey, {
    label: string;
    issueType: string;
    component: string;
    defaultCause: string;
}> = {
    broken_glass: { label: 'Broken glass', issueType: 'glass_broken', component: 'glass', defaultCause: 'vandalism' },
    graffiti: { label: 'Graffiti', issueType: 'graffiti_excessive', component: 'graffiti', defaultCause: 'vandalism' },
    receptacle_damaged: { label: 'Trash can damaged', issueType: 'receptacle_damaged', component: 'receptacle', defaultCause: 'wear_and_tear' },
    panel_damaged: { label: 'Panel damaged/missing', issueType: 'panel_damaged', component: 'panel', defaultCause: 'unknown' },
    lighting_out: { label: 'Lighting not working', issueType: 'lighting_out', component: 'lighting', defaultCause: 'wear_and_tear' },
    contaminated_waste: { label: 'Contaminated waste (biohazard)', issueType: 'contaminated_waste', component: 'contaminated_waste', defaultCause: 'unknown' },
    landscaping_blocking: { label: 'Landscaping blocking access', issueType: 'landscaping_blocking', component: 'landscaping', defaultCause: 'weather' },
    structure_damaged: { label: 'Structure damaged', issueType: 'structure_damaged', component: 'structure', defaultCause: 'unknown' },
    other_infra: { label: 'Other', issueType: 'other_infra_issue', component: 'other', defaultCause: 'other' },
};
// Local WizardStep type for backward compatibility (no longer used in unified UI)
type WizardStep = "safety" | "tasks" | "infra" | "photo";

interface StopDetailProps {
    stop: Stop;
    isRouteCompleted: boolean;
    hasStartedThisStop: boolean;
    checklist: ChecklistState;
    attachedPhotoKeys: string[];
    isUploadingPhoto: boolean;
    isCompletingStop: boolean;
    onBack: () => void;
    onStartStop: () => void;
    onSetChecklist: (field: keyof ChecklistState, value: boolean | number) => void;
    // onFileUpload removed (internal use only now)
    onCompleteStop: () => void;
    onToggleHotspot: (next: boolean) => void;
    safety?: SafetyState;
    infra?: InfraState;
    onSetSafety?: (data: SafetyState) => void;
    onSetInfra?: (data: InfraState) => void;
    onSkipStop?: (hazardTypes: string[]) => void;
    currentStep?: WizardStep;
    onNextStep?: () => void;
    onSetStep?: (step: WizardStep) => void;
    uploadPhotos: (stopId: number, files: File[], kind?: string) => Promise<{ photos: PhotoDto[]; queued: boolean }>;
    fetchPhotos: (stopId: number) => Promise<PhotoDto[]>;
    routeRunId: number | string;
}


import { UlLayout } from "./UlLayout";
import { ULRouteMap } from "../work/ULRouteMap";
import { getDurableAssetKey } from "../../utils/identity";

export function StopDetail({
    stop,
    isRouteCompleted,
    hasStartedThisStop,
    checklist,
    attachedPhotoKeys: _attachedPhotoKeys,
    isUploadingPhoto,
    isCompletingStop,
    onBack,
    onStartStop,
    onSetChecklist,
    // onFileUpload,
    onCompleteStop,
    onToggleHotspot,
    safety,
    infra,
    onSetSafety,
    onSetInfra,
    onSkipStop,
    currentStep = "safety",
    onNextStep: _onNextStep,
    onSetStep,
    uploadPhotos,
    fetchPhotos,
    routeRunId: _routeRunId, // Not used in current implementation
}: StopDetailProps) {
    const { account } = useAuth();
    const queuedUploadCount = getQueuedUploadCountForStop(
        account?.tenantId,
        account?.idTokenClaims?.oid || account?.localAccountId,
        stop.route_run_stop_id,
        "completion" // We only track completion photos for the main badge
    );

    // Check pending actions
    const isStartQueued = hasPendingStartStopForStop(
        account?.tenantId,
        account?.idTokenClaims?.oid || account?.localAccountId,
        stop.route_run_stop_id
    );

    const _isSkipQueued = hasPendingSkipStopForStop(
        account?.tenantId,
        account?.idTokenClaims?.oid || account?.localAccountId,
        stop.route_run_stop_id
    );

    // Safety Photo Queue
    const _queuedSafetyCount = getQueuedUploadCountForStop(
        account?.tenantId,
        account?.idTokenClaims?.oid || account?.localAccountId,
        stop.route_run_stop_id,
        "safety"
    );

    const locationString = formatStopLocation(stop);
    const normalizedStatus = String((stop as any).status ?? "").toLowerCase();
    const isReadOnly = normalizedStatus === "done" || normalizedStatus === "skipped" || isRouteCompleted;
    // Some payloads may arrive with hasStartedThisStop false even when status is already in_progress.
    // Use status as an additional source of truth to avoid showing the Not Started view incorrectly.
    const startedByStatus = normalizedStatus === "in_progress";
    const effectiveHasStartedThisStop = hasStartedThisStop || startedByStatus;

    // Prevent state leakage: Reset per-stop UI state when the active stop changes, before draft hydration runs.
    useEffect(() => {
        // Reset all checklist fields to false, trashVolume undefined
        onSetChecklist('picked_up_litter', false);
        onSetChecklist('emptied_trash', false);
        onSetChecklist('washed_shelter', false);
        onSetChecklist('washed_pad', false);
        onSetChecklist('trashVolume', undefined as any);
        // Reset local UI state related to the stop
        setSelectedFiles([]);
        setExistingPhotos([]);
        setPreviewUrl(null);
        setSelectedInfraKeys([]);
        setInfraNotes("");
        // Reset collapsible state
        setIsReportSafetyOpen(false);
        setIsReportInfraOpen(false);
        // Reset after-photo taken state
        setAfterPhotoTaken(false);
        setShowResumeBanner(false);
        // (Safety and Infra state are managed by parent via onSetSafety/onSetInfra)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stop.route_run_stop_id]);

    // Resume banner state — shown when draft is restored on mount
    const [showResumeBanner, setShowResumeBanner] = useState(false);

    // Multi-photo State
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [existingPhotos, setExistingPhotos] = useState<PhotoDto[]>([]);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [afterPhotoTaken, setAfterPhotoTaken] = useState(false);







    // Queue-driven Refetch
    const [queueTick, setQueueTick] = useState(0);
    useEffect(() => {
        if (!account?.tenantId) return;
        const oid = account?.idTokenClaims?.oid || account?.localAccountId;
        // Subscribe to queue changes
        const unsub = subscribe(account.tenantId, oid, () => {
            // Simple tick to trigger refetch
            setQueueTick(t => t + 1);
        });
        return () => unsub();
    }, [account]);

    // Initial Load of existing photos (plus refetch on queueTick)
    useEffect(() => {
        if (stop.route_run_stop_id) {
            fetchPhotos(stop.route_run_stop_id)
                .then(setExistingPhotos)
                .catch(console.error);
        }
    }, [stop.route_run_stop_id, fetchPhotos, queueTick]);

    // DRAFTS: Load on mount (guarded against stale async results)
    useEffect(() => {
        if (!account?.tenantId || !stop.route_run_stop_id) return;

        const oid = account?.idTokenClaims?.oid || account?.localAccountId;
        const stopIdAtRequestTime = stop.route_run_stop_id;
        let cancelled = false;

        loadStopDraft({
            tenantId: account.tenantId,
            oid,
            routeRunStopId: stopIdAtRequestTime,
        })
            .then(draft => {
                // Guard: only apply if still on the same stop
                if (cancelled) return;
                if (stop.route_run_stop_id !== stopIdAtRequestTime) return;
                if (!draft) return;

                // Only restore drafts less than 24 hours old
                const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
                const isFresh = draft.updatedAt &&
                    (Date.now() - new Date(draft.updatedAt).getTime()) < TWENTY_FOUR_HOURS_MS;
                if (!isFresh) return;

                if (draft.checklist) {
                    Object.entries(draft.checklist).forEach(([k, v]) => {
                        onSetChecklist(k as keyof ChecklistState, v as any);
                    });
                }

                if (draft.trashVolume !== undefined) {
                    onSetChecklist("trashVolume", draft.trashVolume);
                }

                if (draft.safety) {
                    onSetSafety?.(draft.safety);
                }

                if (draft.infra) {
                    onSetInfra?.(draft.infra);
                }

                if (draft.stepKey && onSetStep) {
                    onSetStep(draft.stepKey as WizardStep);
                }

                setShowResumeBanner(true);
            })
            .catch(console.error);

        return () => {
            cancelled = true;
        };
    }, [stop.route_run_stop_id]);

    // DRAFTS: Save on change (Debounced)
    useEffect(() => {
        if (isReadOnly) return; // Don't save drafts for read-only stops
        const handler = setTimeout(() => {
            if (!account?.tenantId || !stop.route_run_stop_id) return;
            const oid = account?.idTokenClaims?.oid || account?.localAccountId;

            saveStopDraft({
                tenantId: account.tenantId,
                oid,
                routeRunStopId: stop.route_run_stop_id,
                draft: {
                    routeRunStopId: stop.route_run_stop_id,
                    stepIndex: 0, // unused/fake
                    stepKey: currentStep,
                    checklist,
                    trashVolume: checklist.trashVolume,
                    safety,
                    infra,
                }
            }).catch(console.error);
        }, 500);

        return () => clearTimeout(handler);
    }, [checklist, safety, infra, currentStep, isReadOnly, stop.route_run_stop_id]);

    // DRAFTS: Clear on complete/read-only
    useEffect(() => {
        if (isReadOnly) {
            if (!account?.tenantId || !stop.route_run_stop_id) return;
            const oid = account?.idTokenClaims?.oid || account?.localAccountId;

            clearStopDraft({
                tenantId: account.tenantId,
                oid,
                routeRunStopId: stop.route_run_stop_id
            }).catch(console.error);
        }
    }, [isReadOnly, stop.route_run_stop_id]);


    // Skip confirm + error state
    const [showSkipModal, setShowSkipModal] = useState(false);
    const [skipError, setSkipError] = useState<string | null>(null);

    // Local state for Infra multi-select
    // We initialize this from props if available, or empty
    const [selectedInfraKeys, setSelectedInfraKeys] = useState<InfraIssueKey[]>([]);
    const [infraNotes, setInfraNotes] = useState("");

    // Active Stop Layout State
    const [isReportSafetyOpen, setIsReportSafetyOpen] = useState(false);
    const [isReportInfraOpen, setIsReportInfraOpen] = useState(false);

    // Local state for Infra Photo (one photo for the whole report context)
    const [localInfraPhotoKey, setLocalInfraPhotoKey] = useState<string | null>(null);

    // Local Safety State for Modal
    const [localSafety, setLocalSafety] = useState<SafetyState>({ hasConcern: false, hazardTypes: [] });

    // Sync safety prop to local when opening
    useEffect(() => {
        if (isReportSafetyOpen) {
            setLocalSafety(safety || { hasConcern: true }); // Default to concern=true when opening report
            setSkipError(null);
        }
    }, [isReportSafetyOpen, safety]);

    // Sync local infra state with props when entering infra step or when props change
    useEffect(() => {
        if (isReportInfraOpen) {
            // Load from props if available
            if (infra?.issues) {
                const keys: InfraIssueKey[] = [];
                infra.issues.forEach(issue => {
                    const foundKey = (Object.keys(INFRA_ISSUE_META) as InfraIssueKey[]).find(
                        k => INFRA_ISSUE_META[k].issueType === issue.issue_type
                    );
                    if (foundKey) keys.push(foundKey);
                });
                setSelectedInfraKeys(keys);
                if (infra.issues.length > 0) {
                    setInfraNotes(infra.issues[0].notes || "");
                    // photo_key not supported in InfraIssuePayload
                }
            } else {
                // Reset if no existing data
                setSelectedInfraKeys([]);
                setInfraNotes("");
                setLocalInfraPhotoKey(null);
            }
        }
    }, [isReportInfraOpen, infra]);

    // Helper to handle file selection
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {

        if (e.target.files && e.target.files.length > 0) {
            const newFiles = Array.from(e.target.files);
            setSelectedFiles((prev) => [...prev, ...newFiles]);
            // Clear input
            e.target.value = "";
        }
    };

    // Helper to handle upload confirmation
    const handleConfirmUpload = async () => {
        if (selectedFiles.length === 0) return;
        try {
            const { photos, queued } = await uploadPhotos(stop.route_run_stop_id, selectedFiles);

            if (queued) {
                // If queued, we clear selection so user knows it "went through" to the queue
                setSelectedFiles([]);
                // But we DO NOT clear existingPhotos or overwrite them with empty
            } else if (photos && photos.length > 0) {
                setExistingPhotos(photos);
                setSelectedFiles([]);
            }
        } catch (err) {
            // Error handled in hook (alert), but we keep selectedFiles so user can retry
            console.error(err);
        }
    };

    // Helper to discard selection
    const handleDiscardSelection = () => {
        setSelectedFiles([]);
    };

    // Helper to remove a single selected file
    const handleRemoveSelectedFile = (idx: number) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== idx));
    };


    // Helper to handle remove selected file (moved up)

    const renderHotspotToggle = () => (
        <button
            type="button"
            onClick={() => onToggleHotspot(!stop.is_hotspot)}
            className={cn(
                "inline-flex items-center px-4 py-2 rounded-full text-sm font-medium min-h-[44px] transition-colors",
                stop.is_hotspot
                    ? "bg-green-50 border border-green-600 text-green-700"
                    : "bg-amber-50 border border-amber-400 text-amber-800",
            )}
        >
            {stop.is_hotspot ? "🔥 Hotspot" : "Mark Hotspot"}
        </button>
    );

    // 1. Not Started View
    if (!effectiveHasStartedThisStop && !isReadOnly) {
        return (
            <UlLayout>
                <button
                    onClick={onBack}
                    className="mb-4 text-blue-600 font-medium hover:text-blue-800 transition-colors min-h-[44px] flex items-center"
                >
                    ← Back to Route
                </button>

                {(() => {
                    const latRaw =
                        (stop as any).lat ??
                        (stop as any).latitude ??
                        (stop as any).stop_lat ??
                        (stop as any).location?.lat;

                    const lonRaw =
                        (stop as any).lon ??
                        (stop as any).lng ??
                        (stop as any).longitude ??
                        (stop as any).stop_lon ??
                        (stop as any).location?.lon ??
                        (stop as any).location?.lng;

                    const stopLat = typeof latRaw === "string" ? Number(latRaw) : latRaw;
                    const stopLon = typeof lonRaw === "string" ? Number(lonRaw) : lonRaw;
                    const hasCoords = Number.isFinite(stopLat) && Number.isFinite(stopLon);

                    const mapStop = {
                        stop_id:
                            (stop as any).stop_id ??
                            (stop as any).id ??
                            String((stop as any).stopNumber ?? ""),
                        sequence: (stop as any).sequence,
                        status: (stop as any).status,
                        location: hasCoords ? { lat: stopLat as number, lon: stopLon as number } : null,
                        on_street_name: (stop as any).on_street_name,
                    };

                    const openGoogleMaps = () => {
                        if (!hasCoords) return;
                        const url = `https://www.google.com/maps/dir/?api=1&destination=${stopLat},${stopLon}`;
                        window.open(url, "_blank", "noopener,noreferrer");
                    };

                    return (
                        <div className="bg-white rounded-xl shadow-md overflow-hidden mb-6">
                            {/* MAP HERO */}
                            <div className="relative w-full h-60 bg-gray-50">
                                {hasCoords ? (
                                    <ULRouteMap
                                        stops={[mapStop as any]}
                                        activeStopKey={getDurableAssetKey(mapStop as any)}
                                        compact={true}
                                        hidePopups={true}
                                        fitPadding={40}
                                        style={{
                                            height: "100%",
                                            width: "100%",
                                            margin: 0,
                                            borderRadius: 0,
                                            boxShadow: "none",
                                        }}
                                    />
                                ) : (
                                    <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                                        Map unavailable for this stop
                                    </div>
                                )}

                                {/* STATUS OVERLAY */}
                                <div className="absolute top-3.5 left-3.5 flex items-center gap-2.5 px-3.5 py-2.5 rounded-full bg-white/90 shadow-lg backdrop-blur-sm">
                                    <span className={cn(
                                        "w-2.5 h-2.5 rounded-full",
                                        normalizedStatus === "in_progress" ? "bg-blue-500" : "bg-amber-400"
                                    )} />
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="font-bold text-gray-900">Status:</span>
                                        <span className="text-gray-900 tracking-wide">
                                            {(stop.status || "pending").toUpperCase()}
                                        </span>
                                    </div>
                                </div>

                                {/* NAVIGATE OVERLAY */}
                                <button
                                    type="button"
                                    onClick={openGoogleMaps}
                                    disabled={!hasCoords}
                                    className={cn(
                                        "absolute left-1/2 -translate-x-1/2 bottom-3.5 px-4 py-2.5 rounded-full bg-white/90 shadow-lg backdrop-blur-sm border border-black/10 font-bold text-sm min-h-[44px] transition-colors",
                                        hasCoords ? "text-gray-700 cursor-pointer hover:bg-white" : "text-gray-400 cursor-not-allowed"
                                    )}
                                >
                                    Navigate to Stop
                                </button>
                            </div>

                            {/* CONTENT */}
                            <div className="p-6">
                                <div className="mb-2.5">
                                    <p className="text-sm text-gray-500 font-bold mb-1.5">Stop {stop.stopNumber}</p>
                                    <h2 className="text-3xl font-extrabold text-gray-900 leading-tight">{locationString}</h2>
                                </div>

                                <div className="flex items-center gap-2.5 mb-5 flex-wrap">
                                    {renderHotspotToggle()}
                                    {stop.compactor && (
                                        <span className="bg-sky-100 text-sky-800 px-3 py-1 rounded-full text-sm font-bold">
                                            Compactor
                                        </span>
                                    )}
                                </div>

                                <button
                                    onClick={onStartStop}
                                    disabled={isCompletingStop || isStartQueued}
                                    className={cn(
                                        "w-full py-4 rounded-xl text-lg font-bold text-white min-h-[44px] transition-colors",
                                        (isCompletingStop || isStartQueued)
                                            ? "bg-blue-300 cursor-not-allowed"
                                            : "bg-blue-700 hover:bg-blue-800 cursor-pointer"
                                    )}
                                >
                                    {isStartQueued ? "Start Queued…" : "Start Stop"}
                                </button>
                            </div>
                        </div>
                    );
                })()}
            </UlLayout>
        );
    }

    // 2. Read Only View (Done/Skipped)
    if (isReadOnly) {
        const isSkipped = stop.status === "skipped";
        return (
            <UlLayout>
                <button
                    onClick={onBack}
                    className="mb-4 bg-transparent border-0 text-blue-600 cursor-pointer font-medium min-h-[44px] flex items-center"
                >
                    ← Back to Route
                </button>
                <div className="bg-white rounded-xl shadow-md p-6">
                    <h2 className="mt-0 mb-4 text-xl font-bold text-gray-900">
                        Stop {stop.stopNumber} — {locationString}
                    </h2>

                    {/* Status banner */}
                    <div className={cn(
                        "my-4 p-4 rounded-lg border",
                        isSkipped
                            ? "bg-red-50 border-red-200"
                            : "bg-green-50 border-green-200"
                    )}>
                        <h3 className={cn(
                            "mt-0 mb-1 font-semibold flex items-center gap-2",
                            isSkipped ? "text-red-700" : "text-green-700"
                        )}>
                            {isSkipped ? "⚠ Skipped" : "✓ Completed"}
                            {renderHotspotToggle()}
                        </h3>
                        {isSkipped && (
                            <p className="m-0 text-sm text-red-700">
                                Reason: {safety?.hazardTypes?.join(", ") || "Safety Concern"}
                            </p>
                        )}
                    </div>

                    {/* Safety Summary */}
                    <div className="mt-4 pt-4 border-t border-gray-200">
                        <h3 className="text-sm font-semibold mb-2 mt-0 text-gray-700">Safety</h3>
                        {safety?.hasConcern ? (
                            <div className="text-sm text-gray-700 flex flex-col gap-1">
                                <div>
                                    <span className="font-medium">Concerns:</span>{" "}
                                    {safety.hazardTypes?.join(", ") ?? "Reported"}
                                </div>
                                {safety.severity && (
                                    <div>
                                        <span className="font-medium">Severity:</span>{" "}
                                        {safety.severity}
                                    </div>
                                )}
                                {safety.notes && (
                                    <div>
                                        <span className="font-medium">Notes:</span>{" "}
                                        {safety.notes}
                                    </div>
                                )}
                                {isSkipped && (
                                    <div className="text-xs text-red-600 mt-1">
                                        This stop was skipped for safety.
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-400 m-0">No safety concerns reported.</p>
                        )}
                    </div>

                    {/* Infra Summary */}
                    <div className="mt-4 pt-4 border-t border-gray-200">
                        <h3 className="text-sm font-semibold mb-2 mt-0 text-gray-700">Infrastructure</h3>
                        {infra?.issues && infra.issues.length > 0 ? (
                            <ul className="text-sm pl-5 m-0 flex flex-col gap-1">
                                {infra.issues.map((issue, idx) => (
                                    <li key={idx}>
                                        <span className="font-medium">{issue.issue_type ?? "Issue"}</span>
                                        {issue.component && ` • Component: ${issue.component}`}
                                        {issue.cause && ` • Cause: ${issue.cause}`}
                                        {infra.notes && (
                                            <>
                                                <br />
                                                <span className="font-medium">Notes:</span>{" "}
                                                {infra.notes}
                                            </>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-gray-400 m-0">No infrastructure issues reported.</p>
                        )}
                    </div>

                    {/* Tasks Completed */}
                    {stop.status === "done" && (
                        <div className="mt-6 pt-4 border-t border-gray-200">
                            <h4 className="text-sm font-semibold mb-3 mt-0 text-gray-700">Tasks Completed</h4>
                            <div className="flex flex-col gap-2">
                                {CHECKLIST_ITEMS.map((item) => (
                                    <div key={item.key} className="flex items-center gap-2">
                                        <span className={checklist[item.key] ? "text-green-500" : "text-gray-500"}>
                                            {checklist[item.key] ? "✓" : "○"}
                                        </span>
                                        <span className={cn(
                                            "text-sm",
                                            checklist[item.key] ? "text-gray-800" : "text-gray-400 line-through"
                                        )}>
                                            {item.label}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </UlLayout>
        );
    }

    // 3. Wizard Flow
    const steps: WizardStep[] = ["safety", "tasks", "infra", "photo"];
    const currentStepIndex = steps.indexOf(currentStep);

    const _renderProgressBar = () => (
        <div className="flex justify-between mb-6 px-4">
            {steps.map((step, index) => {
                const isActive = index === currentStepIndex;
                const isCompleted = index < currentStepIndex;
                const label = step.charAt(0).toUpperCase() + step.slice(1);

                return (
                    <div key={step} className="flex flex-col items-center flex-1">
                        <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center font-bold mb-1 text-xs",
                            isActive ? "bg-blue-600 text-white"
                                : isCompleted ? "bg-green-500 text-white"
                                    : "bg-gray-200 text-gray-500"
                        )}>
                            {isCompleted ? "✓" : index + 1}
                        </div>
                        <span className={cn(
                            "text-xs",
                            isActive ? "text-gray-800 font-bold" : "text-gray-400"
                        )}>
                            {label}
                        </span>
                    </div>
                );
            })}
        </div>
    );

    void _onNextStep;
    void _isSkipQueued;
    void _queuedSafetyCount;
    void _renderProgressBar;
    void _attachedPhotoKeys;


    const handleDismissResumeBanner = () => {
        setShowResumeBanner(false);
        if (!account?.tenantId || !stop.route_run_stop_id) return;
        const oid = account?.idTokenClaims?.oid || account?.localAccountId;
        clearStopDraft({ tenantId: account.tenantId, oid, routeRunStopId: stop.route_run_stop_id })
            .catch(console.error);
    };

    const handleSaveInfra = () => {
        const issues: InfraIssuePayload[] = selectedInfraKeys.map(key => {
            const meta = INFRA_ISSUE_META[key];
            return {
                issue_type: meta.issueType,
                component: meta.component,
                cause: meta.defaultCause,
                notes: infraNotes || null,
                photo_key: localInfraPhotoKey || undefined,
            };
        });

        onSetInfra?.({
            hasIssues: issues.length > 0,
            issues: issues,
        });
        setIsReportInfraOpen(false);
    };

    // Finish requires cleaning + trash volume + AFTER photo (accountability).
    // Validation Logic (Hoisted)
    const anyCleaningTask =
        checklist.picked_up_litter ||
        checklist.emptied_trash ||
        checklist.washed_shelter ||
        checklist.washed_pad ||
        checklist.washed_can;
    const hasCleaning = anyCleaningTask;
    const hasTrashVolume = checklist.trashVolume !== undefined;
    const hasAfterPhoto = afterPhotoTaken;
    const hasPendingUploads = selectedFiles.length > 0;

    // Safety Validation: If concern is yes, MUST have hazards
    const isSafetyValid = !safety?.hasConcern || (safety.hazardTypes && safety.hazardTypes.length > 0);

    const canComplete =
        (
            (hasCleaning && hasTrashVolume) ||
            checklist.spotCheck
        ) &&
        hasAfterPhoto &&
        !hasPendingUploads &&
        !isCompletingStop &&
        isSafetyValid;

    return (
        <UlLayout>
            <div className="flex justify-between items-center mb-4">
                <button
                    onClick={onBack}
                    className="bg-transparent border-0 text-gray-500 cursor-pointer min-h-[44px] flex items-center font-medium"
                >
                    ← Back
                </button>
                <div className="text-sm text-gray-500 font-medium">
                    Stop {stop.stopNumber}
                </div>
            </div>

            <h2 className="mt-0 mb-2 text-center text-xl font-bold text-gray-900">{locationString}</h2>

            {showResumeBanner && (
                <div className="flex items-center justify-between px-4 py-2.5 mb-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                    <span>↩ Resume from where you left off</span>
                    <button
                        onClick={handleDismissResumeBanner}
                        className="bg-transparent border-0 text-blue-700 cursor-pointer font-bold text-base px-1 min-h-[44px] flex items-center"
                    >
                        ✕
                    </button>
                </div>
            )}

            {(stop as any).syncState === "queued" && (
                <div className="text-amber-600 text-sm mb-2 text-center">
                    This stop will sync when you're back online.
                </div>
            )}
            {(stop as any).syncState === "conflict" && (
                <div className="text-red-600 text-sm mb-2 text-center">
                    There was an issue syncing this stop. Server truth will reload when online.
                </div>
            )}
            {queuedUploadCount > 0 && (
                <div className="text-orange-600 text-sm mb-2 text-center font-medium">
                    📷 {queuedUploadCount} photo{queuedUploadCount > 1 ? 's' : ''} queued for upload
                </div>
            )}

            {/* Top Controls: Report Buttons */}
            <div className="flex gap-3 mb-4">
                <button
                    onClick={() => setIsReportSafetyOpen(!isReportSafetyOpen)}
                    className="flex-1 py-3 px-3 bg-orange-50 border border-orange-400 text-orange-700 rounded-lg font-bold flex justify-center items-center gap-2 min-h-[44px] cursor-pointer"
                >
                    ⚠️ REPORT SAFETY
                </button>
                <button
                    onClick={() => setIsReportInfraOpen(!isReportInfraOpen)}
                    className="flex-1 py-3 px-3 bg-blue-50 border border-blue-400 text-blue-700 rounded-lg font-bold flex justify-center items-center gap-2 min-h-[44px] cursor-pointer"
                >
                    🏗 REPORT INFRASTRUCTURE
                </button>
            </div>

            {/* Safety Modal */}
            {isReportSafetyOpen && (
                <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-[2000] p-4">
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="safety-modal-title"
                        className="bg-white w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden rounded-xl shadow-2xl"
                    >
                        {/* Header */}
                        <div className="px-4 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                            <h3 id="safety-modal-title" className="m-0 text-orange-700 font-bold text-lg">Report Safety Concern</h3>
                            <button
                                onClick={() => setIsReportSafetyOpen(false)}
                                className="bg-transparent border-0 text-2xl text-gray-500 cursor-pointer px-2 min-h-[44px] flex items-center"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-6 flex-1 overflow-y-auto">
                            <div className="mb-4 bg-red-50 p-4 rounded-lg border border-red-200">
                                <p className="mt-0 text-red-700 font-bold">Is there a safety issue preventing work?</p>
                                <p className="m-0 text-sm text-red-600">Select hazards below. If unsafe to work, you can Skip Stop.</p>
                            </div>

                            <label className="block mb-2 font-bold text-gray-700">Hazards (Required):</label>
                            <div className="grid grid-cols-2 gap-2 mb-6">
                                {[
                                    { val: "encampment", label: "Encampment" },
                                    { val: "fire", label: "Fire" },
                                    { val: "dangerous_activity", label: "Dangerous Activity" },
                                    { val: "active_drug_use", label: "Active Drug Use" },
                                    { val: "violence", label: "Violence" },
                                    { val: "biohazard", label: "Biohazard" },
                                    { val: "traffic", label: "Traffic / Access" },
                                    { val: "other", label: "Other" },
                                ].map((opt) => {
                                    const isChecked = localSafety.hazardTypes?.includes(opt.val) || false;
                                    return (
                                        <label
                                            key={opt.val}
                                            className={cn(
                                                "flex items-center p-3 rounded-lg text-sm transition-colors min-h-[44px] cursor-pointer",
                                                isChecked
                                                    ? "bg-red-50 border border-red-600"
                                                    : "bg-white border border-gray-200"
                                            )}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={(e) => {
                                                    const current = localSafety.hazardTypes || [];
                                                    const next = e.target.checked ? [...current, opt.val] : current.filter((h) => h !== opt.val);
                                                    setLocalSafety(prev => ({ ...prev, hazardTypes: next }));
                                                }}
                                                className="w-5 h-5 mr-3 shrink-0 accent-red-600"
                                            />
                                            {opt.label}
                                        </label>
                                    );
                                })}
                            </div>

                            {(localSafety.hazardTypes?.length ?? 0) > 0 && (
                                <div className="mb-6">
                                    <label className="block mb-2 font-bold text-gray-700">Severity:</label>
                                    <div className="flex gap-2">
                                        {(["low", "medium", "high"] as const).map((level) => {
                                            const isSelected = localSafety.severity === level;
                                            const colorClass = isSelected
                                                ? level === "low"
                                                    ? "bg-yellow-100 border-yellow-500 text-yellow-800"
                                                    : level === "medium"
                                                        ? "bg-orange-100 border-orange-500 text-orange-800"
                                                        : "bg-red-100 border-red-600 text-red-800"
                                                : "bg-white border-gray-300 text-gray-600";
                                            return (
                                                <button
                                                    key={level}
                                                    type="button"
                                                    onClick={() => setLocalSafety(prev => ({
                                                        ...prev,
                                                        severity: isSelected ? undefined : level,
                                                    }))}
                                                    className={cn(
                                                        "flex-1 py-3 rounded-lg border-2 font-bold text-sm capitalize min-h-[44px] cursor-pointer transition-colors",
                                                        colorClass
                                                    )}
                                                >
                                                    {level.charAt(0).toUpperCase() + level.slice(1)}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            <label className="block mb-2 font-bold text-gray-700">Safety Photo (For Skipping):</label>
                            <div className="mb-6">
                                <input
                                    type="file" accept="image/*" id="safety-photo-upload-modal" className="hidden"
                                    onChange={async (e) => {
                                        if (e.target.files && e.target.files[0]) {
                                            try {
                                                const { photos, queued } = await uploadPhotos(stop.route_run_stop_id, [e.target.files[0]], "safety");
                                                const key = queued ? `queued-safety-${Date.now()}` : photos[0]?.s3_key;
                                                if (key) setLocalSafety(prev => ({ ...prev, safetyPhotoKey: key }));
                                            } catch (e) { console.error(e); alert("Upload failed"); }
                                        }
                                    }}
                                />
                                <button
                                    onClick={() => document.getElementById("safety-photo-upload-modal")?.click()}
                                    className={cn(
                                        "w-full p-4 rounded-lg font-bold min-h-[44px] cursor-pointer",
                                        localSafety.safetyPhotoKey
                                            ? "bg-green-100 border border-green-400 text-green-800"
                                            : "bg-white border border-dashed border-gray-300 text-gray-500"
                                    )}
                                >
                                    {localSafety.safetyPhotoKey ? "✓ Photo Attached (Click to Replace)" : "📷 Add Safety Photo"}
                                </button>
                            </div>

                            <textarea
                                value={localSafety.notes || ""}
                                onChange={(e) => setLocalSafety(prev => ({ ...prev, notes: e.target.value }))}
                                className="w-full p-4 min-h-[100px] mb-4 rounded-lg border border-gray-300 text-base resize-none"
                                placeholder={
                                    localSafety.hazardTypes?.length === 1 && localSafety.hazardTypes[0] === "other"
                                        ? "Please describe the issue (Required)..."
                                        : "Safety notes..."
                                }
                            />
                        </div>

                        {skipError && (
                            <p className="text-red-600 text-sm text-center px-4 pt-3 m-0">{skipError}</p>
                        )}

                        {/* Footer / Actions */}
                        <div className="p-4 border-t border-gray-200 bg-white flex gap-3">
                            {(() => {
                                const hasHazards = !!(localSafety.hazardTypes && localSafety.hazardTypes.length > 0);
                                const isOtherOnly = localSafety.hazardTypes?.length === 1 && localSafety.hazardTypes[0] === "other";
                                const hasNotes = !!(localSafety.notes && localSafety.notes.trim().length > 0);
                                const isContentValid = hasHazards && (!isOtherOnly || hasNotes);
                                const hasPhoto = !!localSafety.safetyPhotoKey;

                                return (
                                    <>
                                        {/* Skip Button — validation AND gate: hazard AND photo both required */}
                                        <button
                                            onClick={() => {
                                                setSkipError(null);
                                                if (!isContentValid) {
                                                    setSkipError("Select a hazard type to skip this stop");
                                                    return;
                                                }
                                                if (!hasPhoto) {
                                                    setSkipError("Add a photo before skipping");
                                                    return;
                                                }
                                                onSetSafety?.({ ...localSafety, wantsToSkip: true, hasConcern: true });
                                                setShowSkipModal(true);
                                            }}
                                            className={cn(
                                                "flex-1 py-4 rounded-lg border-0 font-bold min-h-[44px] cursor-pointer",
                                                (isContentValid && hasPhoto)
                                                    ? "bg-red-700 text-white"
                                                    : "bg-red-100 text-red-400"
                                            )}
                                        >
                                            Skip Stop
                                        </button>

                                        {/* Save Hazards Button - Gated by Hazards (AND Notes if Other only) */}
                                        <button
                                            onClick={() => {
                                                onSetSafety?.({ ...localSafety, hasConcern: true });
                                                setIsReportSafetyOpen(false);
                                            }}
                                            disabled={!isContentValid}
                                            className={cn(
                                                "flex-1 py-4 rounded-lg border-0 font-bold min-h-[44px]",
                                                isContentValid
                                                    ? "bg-orange-500 text-white cursor-pointer"
                                                    : "bg-orange-200 text-orange-400 cursor-not-allowed"
                                            )}
                                        >
                                            Save Hazards
                                        </button>
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {/* Infra Modal */}
            {isReportInfraOpen && (
                <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-[2000] p-4">
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="infra-modal-title"
                        className="bg-white w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden rounded-xl shadow-2xl"
                    >
                        {/* Header */}
                        <div className="px-4 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                            <h3 id="infra-modal-title" className="m-0 text-blue-700 font-bold text-lg">Report Infrastructure</h3>
                            <button
                                onClick={() => setIsReportInfraOpen(false)}
                                className="bg-transparent border-0 text-2xl text-gray-500 cursor-pointer px-2 min-h-[44px] flex items-center"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-6 flex-1 overflow-y-auto">
                            <div className="grid grid-cols-2 gap-3 mb-6">
                                {(Object.keys(INFRA_ISSUE_META) as InfraIssueKey[]).map((key) => {
                                    const meta = INFRA_ISSUE_META[key];
                                    const isSelected = selectedInfraKeys.includes(key);
                                    return (
                                        <label
                                            key={key}
                                            className={cn(
                                                "flex items-center gap-2 p-3 rounded-lg text-sm transition-colors min-h-[44px] cursor-pointer",
                                                isSelected
                                                    ? "bg-blue-50 border border-blue-300"
                                                    : "bg-white border border-gray-200"
                                            )}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={(e) => {
                                                    if (e.target.checked) setSelectedInfraKeys([...selectedInfraKeys, key]);
                                                    else setSelectedInfraKeys(selectedInfraKeys.filter(k => k !== key));
                                                }}
                                                className="w-5 h-5 shrink-0 accent-blue-600"
                                            />
                                            {meta.label}
                                        </label>
                                    );
                                })}
                            </div>

                            <textarea
                                value={infraNotes}
                                onChange={(e) => setInfraNotes(e.target.value)}
                                className="w-full p-4 min-h-[100px] mb-4 rounded-lg border border-gray-300 text-base resize-none"
                                placeholder="Infra notes..."
                            />

                            {/* Infra Photo Upload */}
                            <div className="mb-6">
                                <input
                                    type="file" accept="image/*" id="infra-photo-upload-modal" className="hidden"
                                    onChange={async (e) => {
                                        if (e.target.files && e.target.files[0]) {
                                            try {
                                                const { photos, queued } = await uploadPhotos(stop.route_run_stop_id, [e.target.files[0]], "infra");
                                                const key = queued ? `queued-infra-${Date.now()}` : photos[0]?.s3_key;
                                                if (key) setLocalInfraPhotoKey(key);
                                            } catch (e) { console.error(e); alert("Upload failed"); }
                                        }
                                    }}
                                />
                                <button
                                    onClick={() => document.getElementById("infra-photo-upload-modal")?.click()}
                                    className={cn(
                                        "w-full p-4 rounded-lg font-bold border min-h-[44px] cursor-pointer",
                                        localInfraPhotoKey
                                            ? "bg-green-100 border-green-400 text-green-800"
                                            : "bg-white border-gray-300 text-gray-500"
                                    )}
                                >
                                    {localInfraPhotoKey ? "✓ Infra Photo Attached" : "📷 Add Photo"}
                                </button>
                            </div>

                            <button
                                onClick={handleSaveInfra}
                                className="w-full p-4 bg-blue-600 text-white border-0 rounded-lg font-bold text-lg min-h-[44px] cursor-pointer hover:bg-blue-700"
                            >
                                Save Infrastructure
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Task Cards */}
            <div className="flex flex-wrap gap-4 mb-4">
                {/* Spot Check Toggle */}
                <div className="w-full mb-2">
                    <button
                        onClick={() => {
                            const next = !checklist.spotCheck;
                            onSetChecklist('spotCheck', next);
                            if (next) {
                                // Clear cleaning tasks if spot check is enabled
                                CHECKLIST_ITEMS.forEach(item => onSetChecklist(item.key, false));
                                onSetChecklist('trashVolume', undefined as any);
                            }
                        }}
                        className={cn(
                            "w-full py-4 px-4 border-2 border-blue-400 rounded-lg font-bold text-base flex items-center justify-center gap-2 cursor-pointer transition-colors min-h-[44px]",
                            checklist.spotCheck
                                ? "bg-blue-500 text-white"
                                : "bg-white text-blue-700"
                        )}
                    >
                        {checklist.spotCheck ? "✅ SPOT CHECK ENABLED" : "🔍 PERFORM SPOT CHECK"}
                    </button>
                    {checklist.spotCheck && (
                        <div className="text-center text-sm text-blue-500 mt-1">
                            Cleaning tasks are disabled. Photo required.
                        </div>
                    )}
                </div>

                {/* Cleaning Tasks */}
                <div className={cn(
                    "flex-1 min-w-[300px] bg-white rounded-xl shadow-md p-4 transition-opacity",
                    checklist.spotCheck ? "opacity-50 pointer-events-none" : "opacity-100"
                )}>
                    <h3 className="mt-0 mb-3 text-base font-semibold text-gray-600 uppercase tracking-wide">Cleaning Tasks</h3>
                    <div className="flex flex-col gap-3">
                        {CHECKLIST_ITEMS.map((item) => (
                            <label
                                key={item.key}
                                className={cn(
                                    "flex items-center p-3 rounded-lg transition-colors min-h-[44px] cursor-pointer",
                                    checklist[item.key]
                                        ? "bg-green-50 border border-green-300"
                                        : "bg-white border border-gray-200"
                                )}
                            >
                                <input
                                    type="checkbox"
                                    checked={!!checklist[item.key]}
                                    onChange={(e) => onSetChecklist(item.key, e.target.checked)}
                                    className="w-5 h-5 mr-3 shrink-0 accent-green-600"
                                />
                                <span className={cn("text-base", checklist[item.key] ? "font-semibold text-gray-900" : "text-gray-700")}>
                                    {item.label}
                                </span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Trash Volume */}
                <div className={cn(
                    "flex-1 min-w-[300px] bg-white rounded-xl shadow-md p-4 transition-opacity",
                    checklist.spotCheck ? "opacity-50 pointer-events-none" : "opacity-100"
                )}>
                    <h3 className="mt-0 mb-3 text-base font-semibold text-gray-600 uppercase tracking-wide">
                        Trash Volume <span className="text-red-500">*</span>
                    </h3>
                    <div className="flex rounded-lg overflow-hidden border border-gray-300 mb-3">
                        {[0, 1, 2, 3, 4].map(val => (
                            <button
                                key={val}
                                onClick={() => onSetChecklist('trashVolume', val)}
                                aria-pressed={checklist.trashVolume === val}
                                className={cn(
                                    "flex-1 py-4 font-bold border-0 min-h-[44px] cursor-pointer transition-colors",
                                    val < 4 ? "border-r border-gray-300" : "",
                                    checklist.trashVolume === val
                                        ? "bg-gray-100 text-gray-900 shadow-inner"
                                        : "bg-white text-gray-500 hover:bg-gray-50"
                                )}
                            >
                                {val}
                            </button>
                        ))}
                    </div>
                    <div className="text-center text-gray-500 text-sm">
                        {checklist.trashVolume !== undefined ? (
                            <strong className="text-gray-800">
                                {checklist.trashVolume} — {
                                    ["Empty / Almost Empty", "Low", "Medium", "High", "Overflowing"][checklist.trashVolume]
                                }
                            </strong>
                        ) : "Select volume"}
                    </div>
                </div>
            </div>

            {/* Photos & Finish Action Area */}
            {(existingPhotos.length > 0 || selectedFiles.length > 0) && (
                <div className="bg-white rounded-xl shadow-md p-4 mb-4">
                    <h4 className="m-0 mb-2 text-sm text-gray-500 font-medium">Attached Photos</h4>
                    <div className="flex gap-2 overflow-x-auto pb-2">
                        {existingPhotos.map(p => (
                            <img
                                key={p.id}
                                src={p.url}
                                className="h-20 rounded-md shrink-0 cursor-pointer"
                                onClick={() => setPreviewUrl(p.url)}
                                alt="existing"
                            />
                        ))}
                        {selectedFiles.map((f, i) => (
                            <div key={i} className="relative shrink-0">
                                <img src={URL.createObjectURL(f)} className="h-20 rounded-md opacity-70" alt="pending" />
                                <button
                                    onClick={() => handleRemoveSelectedFile(i)}
                                    className="absolute top-0 right-0 bg-black/50 text-white border-0 rounded-full w-5 h-5 flex items-center justify-center text-xs cursor-pointer"
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>
                    {selectedFiles.length > 0 && (
                        <div className="mt-2 flex gap-2">
                            <button
                                onClick={handleConfirmUpload}
                                className="flex-1 py-2 bg-green-500 text-white rounded-lg border-0 font-bold min-h-[44px] cursor-pointer"
                            >
                                Upload Now
                            </button>
                            <button
                                onClick={handleDiscardSelection}
                                className="flex-1 py-2 bg-white border border-red-300 text-red-700 rounded-lg font-medium min-h-[44px] cursor-pointer"
                            >
                                Discard
                            </button>
                        </div>
                    )}
                </div>
            )}

            <div className="flex flex-col gap-4">
                {/* Main DURING photo upload input (always enabled unless uploading) */}
                <input
                    type="file"
                    accept="image/*"
                    multiple
                    id="main-photo-upload"
                    className="hidden"
                    onChange={handleFileSelect}
                    disabled={isUploadingPhoto}
                />
                <button
                    onClick={() => document.getElementById("main-photo-upload")?.click()}
                    disabled={isUploadingPhoto}
                    className={cn(
                        "py-4 bg-blue-600 text-white border-0 rounded-lg text-base font-bold flex justify-center items-center gap-2 min-h-[44px]",
                        isUploadingPhoto ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:bg-blue-700"
                    )}
                >
                    📸 Document Conditions (Optional)
                </button>

                {/* After photo is the final accountability gate before completion. */}
                {(() => {
                    // Not ready: cleaning or trash volume missing (AND not spot check)
                    if (!((hasCleaning && hasTrashVolume) || checklist.spotCheck)) {
                        return (
                            <button
                                disabled
                                className="py-4 bg-gray-300 text-white border-0 rounded-lg text-base font-bold cursor-not-allowed min-h-[44px]"
                            >
                                Finish
                            </button>
                        );
                    }

                    // Ready for after photo
                    if (!hasAfterPhoto) {
                        return (
                            <>
                                <input
                                    type="file"
                                    accept="image/*"
                                    id="after-photo-upload"
                                    className="hidden"
                                    onChange={async (e) => {
                                        if (!e.target.files || !e.target.files[0]) return;
                                        setAfterPhotoTaken(true);
                                        handleFileSelect(e);
                                    }}
                                    disabled={isUploadingPhoto}
                                />
                                <button
                                    onClick={() => document.getElementById("after-photo-upload")?.click()}
                                    disabled={isUploadingPhoto}
                                    className={cn(
                                        "py-4 bg-blue-900 text-white border-0 rounded-lg text-base font-bold flex justify-center items-center gap-2 min-h-[44px]",
                                        isUploadingPhoto ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:bg-blue-950"
                                    )}
                                >
                                    📷 Take After Photo
                                </button>
                            </>
                        );
                    }

                    // All requirements met → Finish enabled
                    return (
                        <button
                            onClick={onCompleteStop}
                            disabled={!canComplete}
                            className={cn(
                                "py-4 bg-blue-900 text-white border-0 rounded-lg text-base font-bold min-h-[44px]",
                                canComplete ? "cursor-pointer hover:bg-blue-950" : "opacity-60 cursor-not-allowed"
                            )}
                        >
                            {isCompletingStop ? "FINISHING..." : "Finish"}
                        </button>
                    );
                })()}
            </div>

            <ImagePreviewModal isOpen={!!previewUrl} imageUrl={previewUrl} onClose={() => setPreviewUrl(null)} />

            <ConfirmDialog
                isOpen={showSkipModal}
                title="Skip this stop?"
                message="This stop will be recorded as skipped due to a safety hazard. This cannot be undone."
                confirmLabel="Skip Stop"
                cancelLabel="Cancel"
                variant="danger"
                onConfirm={() => {
                    setShowSkipModal(false);
                    onSkipStop?.(localSafety.hazardTypes || []);
                }}
                onCancel={() => setShowSkipModal(false)}
            />
        </UlLayout>
    );
}
