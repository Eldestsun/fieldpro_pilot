import React, { useState, useEffect } from "react";
import type { Stop, ChecklistState, InfraIssuePayload, PhotoDto } from "../../api/routeRuns";
import type { SafetyState, InfraState } from "../../hooks/useTodayRoute";
import { formatStopLocation } from "../../utils/formatStopLocation";
import { ImagePreviewModal } from "../common/ImagePreviewModal";
import { useAuth } from "../../auth/AuthContext";
import { getQueuedUploadCountForStop, subscribe, hasPendingStartStopForStop, hasPendingSkipStopForStop } from "../../offline/offlineQueue";
import { saveStopDraft, loadStopDraft, clearStopDraft } from "../../offline/stopDraftStore";

const CHECKLIST_ITEMS: { key: keyof ChecklistState; label: string }[] = [
    { key: 'picked_up_litter', label: 'Picked up litter' },
    { key: 'emptied_trash', label: 'Emptied trash' },
    { key: 'washed_shelter', label: 'Washed shelter' },
    { key: 'washed_pad', label: 'Washed pad' },
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
    onSkipStop?: () => void;
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
        // (Safety and Infra state are managed by parent via onSetSafety/onSetInfra)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stop.route_run_stop_id]);

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


    // Skip Modal State
    const [showSkipModal, setShowSkipModal] = useState(false);

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
            style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "0.3rem 0.9rem",
                borderRadius: "9999px",
                fontSize: "0.875rem",
                fontWeight: 500,
                lineHeight: 1.1,
                border: stop.is_hotspot ? "1px solid #2f855a" : "1px solid #d69e2e",
                background: stop.is_hotspot ? "#f0fff4" : "#fffaf0",
                color: stop.is_hotspot ? "#2f855a" : "#975a16",
                cursor: "pointer",
            }}
        >
            {stop.is_hotspot ? "🔥 Hotspot" : "Mark Hotspot"}
        </button>
    );

    // 1. Not Started View
    // 1. Not Started View
    if (!effectiveHasStartedThisStop && !isReadOnly) {
        return (
            <UlLayout>
                <button
                    onClick={onBack}
                    style={{
                        marginBottom: "1rem",
                        background: "none",
                        border: "none",
                        color: "#3182ce",
                        cursor: "pointer",
                    }}
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
                        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                            {/* MAP HERO */}
                            <div
                                style={{
                                    position: "relative",
                                    width: "100%",
                                    height: 240,
                                    background: "#f7fafc",
                                }}
                            >
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
                                    <div
                                        style={{
                                            height: "100%",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            color: "#a0aec0",
                                            fontSize: "0.95rem",
                                        }}
                                    >
                                        Map unavailable for this stop
                                    </div>
                                )}

                                {/* STATUS OVERLAY */}
                                <div
                                    style={{
                                        position: "absolute",
                                        top: 14,
                                        left: 14,
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 10,
                                        padding: "10px 14px",
                                        borderRadius: 9999,
                                        background: "rgba(255,255,255,0.92)",
                                        boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
                                        backdropFilter: "blur(6px)",
                                    }}
                                >
                                    <span
                                        style={{
                                            width: 10,
                                            height: 10,
                                            borderRadius: 9999,
                                            background: normalizedStatus === "in_progress" ? "#3182ce" : "#d69e2e",
                                        }}
                                    />
                                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                                        <span style={{ fontWeight: 700, color: "#111827" }}>Status:</span>
                                        <span style={{ letterSpacing: 0.2, color: "#111827" }}>
                                            {(stop.status || "pending").toUpperCase()}
                                        </span>
                                    </div>
                                </div>

                                {/* NAVIGATE OVERLAY */}
                                <button
                                    type="button"
                                    onClick={openGoogleMaps}
                                    disabled={!hasCoords}
                                    style={{
                                        position: "absolute",
                                        left: "50%",
                                        bottom: 14,
                                        transform: "translateX(-50%)",
                                        padding: "10px 14px",
                                        borderRadius: 9999,
                                        border: "1px solid rgba(17,24,39,0.10)",
                                        background: "rgba(255,255,255,0.92)",
                                        color: hasCoords ? "#374151" : "#9ca3af",
                                        fontWeight: 700,
                                        cursor: hasCoords ? "pointer" : "not-allowed",
                                        boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
                                        backdropFilter: "blur(6px)",
                                    }}
                                >
                                    Navigate to Stop
                                </button>
                            </div>

                            {/* CONTENT */}
                            <div style={{ padding: 24 }}>
                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "flex-start",
                                        gap: 16,
                                        marginBottom: 10,
                                    }}
                                >
                                    <div>
                                        <div
                                            style={{
                                                fontSize: 14,
                                                color: "#6b7280",
                                                fontWeight: 700,
                                                marginBottom: 6,
                                            }}
                                        >
                                            Stop {stop.stopNumber}
                                        </div>
                                        <div
                                            style={{
                                                fontSize: 28,
                                                lineHeight: 1.15,
                                                fontWeight: 800,
                                                color: "#111827",
                                            }}
                                        >
                                            {locationString}
                                        </div>
                                    </div>
                                </div>

                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 10,
                                        marginBottom: 18,
                                        flexWrap: "wrap",
                                    }}
                                >
                                    {renderHotspotToggle()}
                                    {stop.compactor && (
                                        <span
                                            style={{
                                                background: "#e0f2fe",
                                                color: "#075985",
                                                padding: "0.25rem 0.5rem",
                                                borderRadius: "9999px",
                                                fontSize: "0.8rem",
                                                fontWeight: 700,
                                            }}
                                        >
                                            Compactor
                                        </span>
                                    )}
                                </div>

                                <button
                                    onClick={onStartStop}
                                    disabled={isCompletingStop || isStartQueued}
                                    className="btn-primary"
                                    style={{
                                        fontSize: "1.15rem",
                                        width: "100%",
                                        opacity: (isCompletingStop || isStartQueued) ? 0.6 : 1
                                    }}
                                >
                                    {isStartQueued ? "Start Queued..." : "Start Stop"}
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
        return (
            <UlLayout>
                <button onClick={onBack} style={{ marginBottom: "1rem", background: "none", border: "none", color: "#3182ce", cursor: "pointer" }}>
                    ← Back to Route
                </button>
                <div className="card">
                    <h2 style={{ marginTop: 0 }}>Stop {stop.stopNumber} — {locationString}</h2>
                    <div style={{ margin: "1rem 0", padding: "1rem", background: stop.status === "skipped" ? "#fff5f5" : "#f0fff4", borderRadius: "8px", border: `1px solid ${stop.status === "skipped" ? "#feb2b2" : "#9ae6b4"}` }}>
                        <h3 style={{ marginTop: 0, color: stop.status === "skipped" ? "#c53030" : "#2f855a" }}>
                            {stop.status === "skipped" ? "⚠ Skipped" : "✓ Completed"}
                            {renderHotspotToggle()}
                        </h3>
                        {stop.status === "skipped" && <p>Reason: {safety?.hazardTypes?.join(", ") || "Safety Concern"}</p>}
                    </div>

                    {/* Safety Summary */}
                    {isReadOnly && (
                        <div style={{ marginTop: "1rem", borderTop: "1px solid #e2e8f0", paddingTop: "1rem" }}>
                            <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem", marginTop: 0 }}>Safety</h3>

                            {safety?.hasConcern ? (
                                <div style={{ fontSize: "0.875rem" }}>
                                    <div style={{ marginBottom: "0.25rem" }}>
                                        <span style={{ fontWeight: 500 }}>Concerns:</span>{" "}
                                        {safety.hazardTypes?.join(", ") ?? "Reported"}
                                    </div>
                                    {safety.severity && (
                                        <div style={{ marginBottom: "0.25rem" }}>
                                            <span style={{ fontWeight: 500 }}>Severity:</span>{" "}
                                            {safety.severity}
                                        </div>
                                    )}
                                    {safety.notes && (
                                        <div style={{ marginBottom: "0.25rem" }}>
                                            <span style={{ fontWeight: 500 }}>Notes:</span>{" "}
                                            {safety.notes}
                                        </div>
                                    )}
                                    {stop.status === "skipped" && (
                                        <div style={{ fontSize: "0.75rem", color: "#c53030", marginTop: "0.25rem" }}>
                                            This stop was skipped for safety.
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <p style={{ fontSize: "0.875rem", color: "#718096", margin: 0 }}>
                                    No safety concerns reported.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Infra Summary */}
                    {isReadOnly && (
                        <div style={{ marginTop: "1rem", borderTop: "1px solid #e2e8f0", paddingTop: "1rem" }}>
                            <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem", marginTop: 0 }}>Infrastructure</h3>

                            {infra?.issues && infra.issues.length > 0 ? (
                                <ul style={{ fontSize: "0.875rem", paddingLeft: "1.2rem", margin: 0 }}>
                                    {infra.issues.map((issue, idx) => (
                                        <li key={idx} style={{ marginBottom: "0.25rem" }}>
                                            <span style={{ fontWeight: 500 }}>
                                                {issue.issue_type ?? "Issue"}
                                            </span>
                                            {issue.component && ` • Component: ${issue.component}`}
                                            {issue.cause && ` • Cause: ${issue.cause}`}
                                            {infra.notes && (
                                                <>
                                                    <br />
                                                    <span style={{ fontWeight: 500 }}>Notes:</span>{" "}
                                                    {infra.notes}
                                                </>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p style={{ fontSize: "0.875rem", color: "#718096", margin: 0 }}>
                                    No infrastructure issues reported.
                                </p>
                            )}
                        </div>
                    )}
                    {/* Show Checklist Summary if not skipped */}
                    {stop.status === "done" && (
                        <div style={{ marginTop: "1.5rem" }}>
                            <h4>Tasks Completed</h4>
                            <div style={{ display: "grid", gap: "0.5rem" }}>
                                {CHECKLIST_ITEMS.map((item) => (
                                    <div key={item.key} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                        <span style={{ color: checklist[item.key] ? "#48bb78" : "#a0aec0" }}>
                                            {checklist[item.key] ? "✓" : "○"}
                                        </span>
                                        <span style={{ color: checklist[item.key] ? "#2d3748" : "#a0aec0", textDecoration: checklist[item.key] ? "none" : "line-through" }}>
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
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1.5rem", padding: "0 1rem" }}>
            {steps.map((step, index) => {
                const isActive = index === currentStepIndex;
                const isCompleted = index < currentStepIndex;
                let label = step.charAt(0).toUpperCase() + step.slice(1);

                return (
                    <div key={step} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                        <div style={{
                            width: "30px",
                            height: "30px",
                            borderRadius: "50%",
                            background: isActive ? "#3182ce" : isCompleted ? "#48bb78" : "#e2e8f0",
                            color: isActive || isCompleted ? "white" : "#718096",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: "bold",
                            marginBottom: "0.25rem",
                            fontSize: "0.8rem"
                        }}>
                            {isCompleted ? "✓" : index + 1}
                        </div>
                        <span style={{ fontSize: "0.75rem", color: isActive ? "#2d3748" : "#a0aec0", fontWeight: isActive ? "bold" : "normal" }}>
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
        checklist.washed_pad;
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <button onClick={onBack} style={{ background: "none", border: "none", color: "#718096", cursor: "pointer" }}>
                    ← Back
                </button>
                <div style={{ fontSize: "0.9rem", color: "#718096" }}>
                    Stop {stop.stopNumber}
                </div>
            </div>

            <h2 style={{ marginTop: 0, marginBottom: "0.5rem", textAlign: "center" }}>{locationString}</h2>

            {(stop as any).syncState === "queued" && (
                <div style={{ color: '#ff9800', fontSize: '0.85rem', marginBottom: '8px', textAlign: 'center' }}>
                    This stop will sync when you're back online.
                </div>
            )}
            {(stop as any).syncState === "conflict" && (
                <div style={{ color: '#f44336', fontSize: '0.85rem', marginBottom: '8px', textAlign: 'center' }}>
                    There was an issue syncing this stop. Server truth will reload when online.
                </div>
            )}
            {queuedUploadCount > 0 && (
                <div style={{
                    color: '#dd6b20',
                    fontSize: '0.85rem',
                    marginBottom: '8px',
                    textAlign: 'center',
                    fontWeight: 500
                }}>
                    📷 {queuedUploadCount} photo{queuedUploadCount > 1 ? 's' : ''} queued for upload
                </div>
            )}

            {/* Top Controls: Report Buttons */}
            <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
                <button
                    onClick={() => setIsReportSafetyOpen(!isReportSafetyOpen)}
                    style={{
                        flex: 1,
                        padding: "0.75rem",
                        background: "#fffaf0",
                        border: "1px solid #ed8936",
                        color: "#c05621",
                        borderRadius: "8px",
                        fontWeight: "bold",
                        display: "flex", justifyContent: "center", alignItems: "center", gap: "0.5rem"
                    }}
                >
                    ⚠️ REPORT SAFETY
                </button>
                <button
                    onClick={() => setIsReportInfraOpen(!isReportInfraOpen)}
                    style={{
                        flex: 1,
                        padding: "0.75rem",
                        background: "#ebf8ff",
                        border: "1px solid #4299e1",
                        color: "#2b6cb0",
                        borderRadius: "8px",
                        fontWeight: "bold",
                        display: "flex", justifyContent: "center", alignItems: "center", gap: "0.5rem"
                    }}
                >
                    🏗 REPORT INFRASTRUCTURE
                </button>
            </div>

            {/* Safety Modal */}
            {isReportSafetyOpen && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: "1rem" }}>
                    <div style={{ background: "white", width: "100%", maxWidth: "500px", maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: "12px", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)" }}>
                        {/* Header */}
                        <div style={{ padding: "1rem", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f7fafc" }}>
                            <h3 style={{ margin: 0, color: "#c05621" }}>Report Safety Concern</h3>
                            <button
                                onClick={() => setIsReportSafetyOpen(false)}
                                style={{ background: "none", border: "none", fontSize: "1.5rem", color: "#718096", cursor: "pointer", padding: "0 0.5rem" }}
                            >
                                ✕
                            </button>
                        </div>

                        <div style={{ padding: "1.5rem", flex: 1, overflowY: "auto" }}>
                            <div style={{ marginBottom: "1rem", background: "#fff5f5", padding: "1rem", borderRadius: "8px", border: "1px solid #feb2b2" }}>
                                <p style={{ marginTop: 0, color: "#c53030", fontWeight: "bold" }}>Is there a safety issue preventing work?</p>
                                <p style={{ margin: 0, fontSize: "0.9rem", color: "#e53e3e" }}>Select hazards below. If unsafe to work, you can Skip Stop.</p>
                            </div>

                            <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold" }}>Hazards (Required):</label>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "1.5rem" }}>
                                {[
                                    { val: "encampment", label: "Encampment" },
                                    { val: "fire", label: "Fire" },
                                    { val: "dangerous_activity", label: "Dangerous Activity" },
                                    { val: "active_drug_use", label: "Active Drug Use" },
                                    { val: "violence", label: "Violence" },
                                    { val: "biohazard", label: "Biohazard" },
                                    { val: "traffic", label: "Traffic / Access" },
                                    { val: "other", label: "Other" },
                                ].map((opt) => (
                                    <label
                                        key={opt.val}
                                        style={{
                                            display: "flex", alignItems: "center", padding: "0.75rem",
                                            background: localSafety.hazardTypes?.includes(opt.val) ? "#fff5f5" : "white",
                                            border: `1px solid ${localSafety.hazardTypes?.includes(opt.val) ? "#c53030" : "#e2e8f0"}`,
                                            borderRadius: "8px", fontSize: "0.9rem", transition: "all 0.2s"
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={localSafety.hazardTypes?.includes(opt.val) || false}
                                            onChange={(e) => {
                                                const current = localSafety.hazardTypes || [];
                                                const next = e.target.checked ? [...current, opt.val] : current.filter((h) => h !== opt.val);
                                                setLocalSafety(prev => ({ ...prev, hazardTypes: next }));
                                            }}
                                            style={{ marginRight: "0.75rem", transform: "scale(1.2)" }}
                                        />
                                        {opt.label}
                                    </label>
                                ))}
                            </div>

                            <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold" }}>Safety Photo (For Skipping):</label>
                            <div style={{ marginBottom: "1.5rem" }}>
                                <input
                                    type="file" accept="image/*" id="safety-photo-upload-modal" style={{ display: "none" }}
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
                                    style={{ width: "100%", padding: "1rem", background: localSafety.safetyPhotoKey ? "#c6f6d5" : "white", border: localSafety.safetyPhotoKey ? "1px solid #48bb78" : "1px dashed #cbd5e0", borderRadius: "8px", color: localSafety.safetyPhotoKey ? "#276749" : "#718096", fontWeight: "bold" }}
                                >
                                    {localSafety.safetyPhotoKey ? "✓ Photo Attached (Click to Replace)" : "📷 Add Safety Photo"}
                                </button>
                            </div>

                            <textarea
                                value={localSafety.notes || ""}
                                onChange={(e) => setLocalSafety(prev => ({ ...prev, notes: e.target.value }))}
                                style={{ width: "100%", padding: "1rem", minHeight: "100px", marginBottom: "1rem", borderRadius: "8px", border: "1px solid #cbd5e0", fontSize: "1rem" }}
                                placeholder={
                                    localSafety.hazardTypes?.length === 1 && localSafety.hazardTypes[0] === "other"
                                        ? "Please describe the issue (Required)..."
                                        : "Safety notes..."
                                }
                            />
                        </div>

                        {/* Footer / Actions */}
                        <div style={{ padding: "1rem", borderTop: "1px solid #e2e8f0", background: "white", display: "flex", gap: "1rem" }}>
                            {(() => {
                                const hasHazards = localSafety.hazardTypes && localSafety.hazardTypes.length > 0;
                                const isOtherOnly = localSafety.hazardTypes?.length === 1 && localSafety.hazardTypes[0] === "other";
                                const hasNotes = !!(localSafety.notes && localSafety.notes.trim().length > 0);
                                const isContentValid = hasHazards && (!isOtherOnly || hasNotes);
                                const hasPhoto = !!localSafety.safetyPhotoKey;

                                return (
                                    <>
                                        {/* Skip Button - Gated by Hazard AND Photo (AND Notes if Other only) */}
                                        <button
                                            onClick={() => {
                                                onSetSafety?.({ ...localSafety, wantsToSkip: true, hasConcern: true });
                                                onSkipStop?.();
                                            }}
                                            disabled={!(isContentValid && hasPhoto)}
                                            style={{
                                                flex: 1, padding: "1rem",
                                                background: (isContentValid && hasPhoto) ? "#c53030" : "#fed7d7",
                                                color: (isContentValid && hasPhoto) ? "white" : "#e53e3e",
                                                borderRadius: "8px", border: "none", fontWeight: "bold",
                                                cursor: (isContentValid && hasPhoto) ? "pointer" : "not-allowed"
                                            }}
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
                                            style={{
                                                flex: 1, padding: "1rem",
                                                background: isContentValid ? "#ed8936" : "#fbd38d",
                                                color: isContentValid ? "white" : "#7b341e",
                                                borderRadius: "8px", border: "none", fontWeight: "bold",
                                                cursor: isContentValid ? "pointer" : "not-allowed"
                                            }}
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
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: "1rem" }}>
                    <div style={{ background: "white", width: "100%", maxWidth: "500px", maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: "12px", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)" }}>
                        {/* Header */}
                        <div style={{ padding: "1rem", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f7fafc" }}>
                            <h3 style={{ margin: 0, color: "#2b6cb0" }}>Report Infrastructure</h3>
                            <button
                                onClick={() => setIsReportInfraOpen(false)}
                                style={{ background: "none", border: "none", fontSize: "1.5rem", color: "#718096", cursor: "pointer", padding: "0 0.5rem" }}
                            >
                                ✕
                            </button>
                        </div>

                        <div style={{ padding: "1.5rem", flex: 1, overflowY: "auto" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1.5rem" }}>
                                {(Object.keys(INFRA_ISSUE_META) as InfraIssueKey[]).map((key) => {
                                    const meta = INFRA_ISSUE_META[key];
                                    const isSelected = selectedInfraKeys.includes(key);
                                    return (
                                        <label key={key} style={{
                                            display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem",
                                            background: isSelected ? "#ebf8ff" : "white",
                                            border: isSelected ? "1px solid #90cdf4" : "1px solid #e2e8f0",
                                            borderRadius: "8px", fontSize: "0.9rem", transition: "all 0.2s"
                                        }}>
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={(e) => {
                                                    if (e.target.checked) setSelectedInfraKeys([...selectedInfraKeys, key]);
                                                    else setSelectedInfraKeys(selectedInfraKeys.filter(k => k !== key));
                                                }}
                                                style={{ transform: "scale(1.2)" }}
                                            />
                                            {meta.label}
                                        </label>
                                    );
                                })}
                            </div>

                            <textarea
                                value={infraNotes}
                                onChange={(e) => setInfraNotes(e.target.value)}
                                style={{ width: "100%", padding: "1rem", minHeight: "100px", marginBottom: "1rem", borderRadius: "8px", border: "1px solid #cbd5e0", fontSize: "1rem" }}
                                placeholder="Infra notes..."
                            />

                            {/* Infra Photo Upload */}
                            <div style={{ marginBottom: "1.5rem" }}>
                                <input
                                    type="file" accept="image/*" id="infra-photo-upload-modal" style={{ display: "none" }}
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
                                    style={{ width: "100%", padding: "1rem", background: localInfraPhotoKey ? "#c6f6d5" : "white", border: "1px solid #cbd5e0", borderRadius: "8px", color: localInfraPhotoKey ? "#276749" : "#718096", fontWeight: "bold" }}
                                >
                                    {localInfraPhotoKey ? "✓ Infra Photo Attached" : "📷 Add Photo"}
                                </button>
                            </div>

                            <button
                                onClick={handleSaveInfra}
                                style={{ width: "100%", padding: "1rem", background: "#3182ce", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold", fontSize: "1.1rem" }}
                            >
                                Save Infrastructure
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Task Cards */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", marginBottom: "1rem" }}>
                {/* Spot Check Toggle */}
                <div style={{ width: "100%", marginBottom: "0.5rem" }}>
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
                        style={{
                            width: "100%",
                            padding: "1rem",
                            background: checklist.spotCheck ? "#4299e1" : "white",
                            color: checklist.spotCheck ? "white" : "#2b6cb0",
                            border: "2px solid #4299e1",
                            borderRadius: "8px",
                            fontWeight: "bold",
                            fontSize: "1rem",
                            display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
                            cursor: "pointer",
                            transition: "all 0.2s"
                        }}
                    >
                        {checklist.spotCheck ? "✅ SPOT CHECK ENABLED" : "🔍 PERFORM SPOT CHECK"}
                    </button>
                    {checklist.spotCheck && (
                        <div style={{ textAlign: "center", fontSize: "0.85rem", color: "#4299e1", marginTop: "0.25rem" }}>
                            Cleaning tasks are disabled. Photo required.
                        </div>
                    )}
                </div>

                {/* Cleaning Tasks */}
                <div className="card" style={{ flex: "1 1 300px", margin: 0, opacity: checklist.spotCheck ? 0.5 : 1, pointerEvents: checklist.spotCheck ? "none" : "auto" }}>
                    <h3 style={{ marginTop: 0, fontSize: "1rem", color: "#4a5568" }}>CLEANING TASKS</h3>
                    <div style={{ display: "grid", gap: "0.75rem" }}>
                        {CHECKLIST_ITEMS.map((item) => (
                            <label
                                key={item.key}
                                style={{
                                    display: "flex", alignItems: "center", padding: "0.75rem",
                                    background: checklist[item.key] ? "#f0fff4" : "white",
                                    border: `1px solid ${checklist[item.key] ? "#48bb78" : "#e2e8f0"}`,
                                    borderRadius: "8px", transition: "all 0.2s"
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={!!checklist[item.key]}
                                    onChange={(e) => onSetChecklist(item.key, e.target.checked)}
                                    style={{ width: "18px", height: "18px", marginRight: "0.75rem" }}
                                />
                                <span style={{ fontWeight: checklist[item.key] ? "bold" : "normal" }}>{item.label}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Trash Volume */}
                <div className="card" style={{ flex: "1 1 300px", margin: 0, opacity: checklist.spotCheck ? 0.5 : 1, pointerEvents: checklist.spotCheck ? "none" : "auto" }}>
                    <h3 style={{ marginTop: 0, fontSize: "1rem", color: "#4a5568" }}>TRASH VOLUME (Required)</h3>
                    <div style={{ display: "flex", borderRadius: "8px", overflow: "hidden", border: "1px solid #cbd5e0", marginBottom: "1rem" }}>
                        {[0, 1, 2, 3, 4].map(val => (
                            <button
                                key={val}
                                onClick={() => onSetChecklist('trashVolume', val)}
                                style={{
                                    flex: 1, padding: "1rem 0",
                                    background: checklist.trashVolume === val ? "#edf2f7" : "white",
                                    fontWeight: "bold",
                                    border: "none",
                                    borderRight: val < 4 ? "1px solid #cbd5e0" : "none",
                                    color: checklist.trashVolume === val ? "#2d3748" : "#718096",
                                    boxShadow: checklist.trashVolume === val ? "inset 0 2px 4px rgba(0,0,0,0.06)" : "none"
                                }}
                            >
                                {val}
                            </button>
                        ))}
                    </div>
                    <div style={{ textAlign: "center", color: "#718096", fontSize: "0.9rem" }}>
                        {checklist.trashVolume !== undefined ? (
                            <strong>
                                {checklist.trashVolume} - {
                                    ["Empty / Almost Empty", "Low", "Medium", "High", "Overflowing"][checklist.trashVolume]
                                }
                            </strong>
                        ) : "Select volume"}
                    </div>
                </div>
            </div>

            {/* Photos & Finish Action Area */}
            {/* Show any existing photos first */}
            {
                (existingPhotos.length > 0 || selectedFiles.length > 0) && (
                    <div className="card" style={{ padding: "1rem", marginBottom: "1rem" }}>
                        <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "0.9rem", color: "#718096" }}>Attached Photos</h4>
                        <div style={{ display: "flex", gap: "0.5rem", overflowX: "auto", paddingBottom: "0.5rem" }}>
                            {existingPhotos.map(p => (
                                <img key={p.id} src={p.url} style={{ height: "80px", borderRadius: "6px" }} onClick={() => setPreviewUrl(p.url)} alt="existing" />
                            ))}
                            {selectedFiles.map((f, i) => (
                                <div key={i} style={{ position: "relative" }}>
                                    <img src={URL.createObjectURL(f)} style={{ height: "80px", borderRadius: "6px", opacity: 0.7 }} alt="pending" />
                                    <button onClick={() => handleRemoveSelectedFile(i)} style={{ position: "absolute", top: 0, right: 0, background: "rgba(0,0,0,0.5)", color: "white", border: "none", borderRadius: "50%", width: "20px", height: "20px", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                                </div>
                            ))}
                        </div>
                        {selectedFiles.length > 0 && (
                            <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem" }}>
                                <button onClick={handleConfirmUpload} style={{ flex: 1, padding: "0.5rem", background: "#48bb78", color: "white", borderRadius: "6px", border: "none", fontWeight: "bold" }}>Upload Now</button>
                                <button onClick={handleDiscardSelection} style={{ flex: 1, padding: "0.5rem", background: "#fff", border: "1px solid #fc8181", color: "#c53030", borderRadius: "6px" }}>Discard</button>
                            </div>
                        )}
                    </div>
                )
            }

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {/* Main DURING photo upload input (always enabled unless uploading) */}
                <input
                    type="file"
                    accept="image/*"
                    multiple
                    id="main-photo-upload"
                    style={{ display: "none" }}
                    onChange={handleFileSelect}
                    disabled={isUploadingPhoto}
                />
                <button
                    onClick={() => document.getElementById("main-photo-upload")?.click()}
                    style={{
                        padding: "1rem",
                        background: "#3182ce",
                        color: "white",
                        border: "none",
                        borderRadius: "8px",
                        fontSize: "1rem",
                        fontWeight: "bold",
                        display: "flex", justifyContent: "center", alignItems: "center", gap: "0.5rem",
                        opacity: isUploadingPhoto ? 0.6 : 1,
                        cursor: isUploadingPhoto ? "not-allowed" : "pointer"
                    }}
                    disabled={isUploadingPhoto}
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
                                style={{
                                    padding: "1rem",
                                    background: "#cbd5e0",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "8px",
                                    fontSize: "1rem",
                                    fontWeight: "bold",
                                    cursor: "not-allowed"
                                }}
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
                                    style={{ display: "none" }}
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
                                    style={{
                                        padding: "1rem",
                                        background: "#2c5282",
                                        color: "white",
                                        border: "none",
                                        borderRadius: "8px",
                                        fontSize: "1rem",
                                        fontWeight: "bold",
                                        display: "flex",
                                        justifyContent: "center",
                                        alignItems: "center",
                                        gap: "0.5rem",
                                        cursor: "pointer",
                                        opacity: isUploadingPhoto ? 0.6 : 1
                                    }}
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
                            style={{
                                padding: "1rem",
                                background: "#2c5282",
                                color: "white",
                                border: "none",
                                borderRadius: "8px",
                                fontSize: "1rem",
                                fontWeight: "bold",
                                cursor: canComplete ? "pointer" : "not-allowed",
                                opacity: canComplete ? 1 : 0.6
                            }}
                        >
                            {isCompletingStop ? "FINISHING..." : "Finish"}
                        </button>
                    );
                })()}
            </div>

            <ImagePreviewModal isOpen={!!previewUrl} imageUrl={previewUrl} onClose={() => setPreviewUrl(null)} />

            {
                showSkipModal && (
                    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}>
                        <div style={{ background: "white", padding: "1.5rem", borderRadius: "12px", width: "100%", maxWidth: "400px" }}>
                            <h3>Confirm Skip?</h3>
                            <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
                                <button onClick={() => setShowSkipModal(false)} style={{ flex: 1, padding: "0.75rem", background: "white", border: "1px solid #cbd5e0", borderRadius: "8px" }}>Cancel</button>
                                <button onClick={() => onSkipStop?.()} style={{ flex: 1, padding: "0.75rem", background: "#c53030", color: "white", border: "none", borderRadius: "8px", fontWeight: "bold" }}>Skip</button>
                            </div>
                        </div>
                    </div>
                )
            }
        </UlLayout >
    );
}
