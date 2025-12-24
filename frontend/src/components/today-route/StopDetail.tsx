import React, { useState, useEffect } from "react";
import type { Stop, ChecklistState, InfraIssuePayload, PhotoDto } from "../../api/routeRuns";
import type { SafetyState, InfraState, WizardStep } from "../../hooks/useTodayRoute";
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
    attachedPhotoKeys,
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
    onNextStep,
    onSetStep,
    uploadPhotos,
    fetchPhotos,
    // routeRunId, // Unused
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

    const isSkipQueued = hasPendingSkipStopForStop(
        account?.tenantId,
        account?.idTokenClaims?.oid || account?.localAccountId,
        stop.route_run_stop_id
    );

    // Safety Photo Queue
    const queuedSafetyCount = getQueuedUploadCountForStop(
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

    // Multi-photo State
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [existingPhotos, setExistingPhotos] = useState<PhotoDto[]>([]);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);







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

    // DRAFTS: Load on mount
    useEffect(() => {
        if (!account?.tenantId || !stop.route_run_stop_id) return;
        const oid = account?.idTokenClaims?.oid || account?.localAccountId;
        const stopId = stop.route_run_stop_id;

        loadStopDraft({ tenantId: account.tenantId, oid, routeRunStopId: stopId })
            .then(draft => {
                if (draft) {
                    // Hydrate state
                    if (draft.checklist) {
                        // We have to set each field individually or update hook to accept bulk?
                        // Hook exposes setChecklistForStop(key, val).
                        Object.entries(draft.checklist).forEach(([k, v]) => {
                            onSetChecklist(k as keyof ChecklistState, v as any);
                        });
                    }
                    if (draft.trashVolume !== undefined) {
                        onSetChecklist('trashVolume', draft.trashVolume);
                    }
                    if (draft.safety) {
                        onSetSafety?.(draft.safety);
                    }
                    if (draft.infra) {
                        onSetInfra?.(draft.infra);
                    }
                    // Restore step - map string back to WizardStep if needed
                    // StopDraft defined stepIndex used string keys as well
                    if (draft.stepKey && onSetStep) {
                        onSetStep(draft.stepKey as WizardStep);
                    }
                }
            })
            .catch(console.error);
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

    // Sync local state with props when entering infra step or when props change
    useEffect(() => {
        if (infra?.issues) {
            // Reverse map issues to keys (simplified matching by issueType)
            const keys: InfraIssueKey[] = [];
            infra.issues.forEach(issue => {
                const foundKey = (Object.keys(INFRA_ISSUE_META) as InfraIssueKey[]).find(
                    k => INFRA_ISSUE_META[k].issueType === issue.issue_type
                );
                if (foundKey) keys.push(foundKey);
            });
            setSelectedInfraKeys(keys);
            // Assuming notes are shared or taking the first one
            if (infra.issues.length > 0) {
                setInfraNotes(infra.issues[0].notes || "");
            }
        }
    }, [infra]);

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

    const renderProgressBar = () => (
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

    const handleSaveInfra = () => {
        const issues: InfraIssuePayload[] = selectedInfraKeys.map(key => {
            const meta = INFRA_ISSUE_META[key];
            return {
                issue_type: meta.issueType,
                component: meta.component,
                cause: meta.defaultCause,
                notes: infraNotes || null,
            };
        });

        onSetInfra?.({
            hasIssues: issues.length > 0,
            issues: issues,
        });
        onNextStep?.();
    };

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

            <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.5rem" }}>
                {renderHotspotToggle()}
            </div>

            {renderProgressBar()}

            <ImagePreviewModal isOpen={!!previewUrl} imageUrl={previewUrl} onClose={() => setPreviewUrl(null)} />

            <div className="card">

                {/* SAFETY STEP */}
                {currentStep === "safety" && (
                    <div>
                        <h3 style={{ marginTop: 0, color: "#c53030", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            ⚠️ Safety Check
                        </h3>
                        <p style={{ fontSize: "1.1rem", marginBottom: "1.5rem" }}>Are there any safety concerns at this stop?</p>

                        <div style={{ display: "flex", gap: "1rem", marginBottom: "2rem" }}>
                            <button
                                onClick={() => onSetSafety?.({ ...safety, hasConcern: true })}
                                style={{
                                    flex: 1,
                                    padding: "1rem",
                                    background: safety?.hasConcern === true ? "#fff5f5" : "white",
                                    color: safety?.hasConcern === true ? "#c53030" : "#4a5568",
                                    border: `2px solid ${safety?.hasConcern === true ? "#c53030" : "#e2e8f0"}`,
                                    borderRadius: "8px",
                                    fontWeight: "bold",
                                    cursor: "pointer",
                                }}
                            >
                                Yes, there is a concern
                            </button>
                            <button
                                onClick={() => {
                                    onSetSafety?.({
                                        hasConcern: false,
                                        hazardTypes: [],
                                        notes: undefined,
                                        wantsToSkip: false,
                                        safetyPhotoKey: undefined,
                                    });
                                    onNextStep?.();
                                }}
                                style={{
                                    flex: 1,
                                    padding: "1rem",
                                    background: "white",
                                    color: "#2c7a7b",
                                    border: "2px solid #e2e8f0",
                                    borderRadius: "8px",
                                    fontWeight: "bold",
                                    cursor: "pointer",
                                }}
                            >
                                No, it's safe
                            </button>
                        </div>

                        {safety?.hasConcern && (
                            <div style={{ animation: "fadeIn 0.3s ease-in-out" }}>
                                <label style={{ display: "block", marginBottom: "0.75rem", fontWeight: "bold" }}>What are the hazards? (Select all that apply)</label>
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
                                                display: "flex",
                                                alignItems: "center",
                                                padding: "0.75rem",
                                                background: safety.hazardTypes?.includes(opt.val) ? "#fff5f5" : "white",
                                                border: `1px solid ${safety.hazardTypes?.includes(opt.val) ? "#c53030" : "#e2e8f0"}`,
                                                borderRadius: "6px",
                                                cursor: "pointer",
                                                fontWeight: safety.hazardTypes?.includes(opt.val) ? "bold" : "normal",
                                                color: safety.hazardTypes?.includes(opt.val) ? "#c53030" : "#4a5568",
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={safety.hazardTypes?.includes(opt.val) || false}
                                                onChange={(e) => {
                                                    const current = safety.hazardTypes || [];
                                                    const next = e.target.checked
                                                        ? [...current, opt.val]
                                                        : current.filter((h) => h !== opt.val);
                                                    onSetSafety?.({ ...safety, hazardTypes: next });
                                                }}
                                                style={{ marginRight: "0.5rem" }}
                                            />
                                            {opt.label}
                                        </label>
                                    ))}
                                </div>

                                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold" }}>Safety Photo (Must Add Photo to Skip Stop):</label>
                                <div style={{ marginBottom: "1.5rem" }}>
                                    {safety.safetyPhotoKey ? (
                                        <div style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.5rem", background: "#f7fafc", borderRadius: "6px" }}>
                                            <span style={{ fontSize: "0.9rem", color: "#2f855a", fontWeight: "bold" }}>
                                                ✓ Photo Attached {queuedSafetyCount > 0 ? "(Queued)" : ""}
                                            </span>
                                            <button
                                                onClick={() => onSetSafety?.({ ...safety, safetyPhotoKey: undefined })}
                                                style={{ color: "#c53030", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontSize: "0.85rem" }}
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                id="safety-photo-upload"
                                                style={{ display: "none" }}
                                                onChange={async (e) => {
                                                    if (e.target.files && e.target.files[0]) {
                                                        try {
                                                            const { photos, queued } = await uploadPhotos(stop.route_run_stop_id, [e.target.files[0]], "safety");
                                                            if (queued) {
                                                                // Use a pseudo-key or similar to indicate persistence in UI, 
                                                                // but mainly just set persistence. 
                                                                // Actually uploading returns `{photos: [], queued: true}`.
                                                                // We need to set safetyPhotoKey to valid string to allow skip.
                                                                // Let's us a placeholder like "queued-safety-timestamp".
                                                                const placeholder = `queued-safety-${Date.now()}`;
                                                                onSetSafety?.({ ...safety, safetyPhotoKey: placeholder });
                                                            } else if (photos.length > 0) {
                                                                onSetSafety?.({ ...safety, safetyPhotoKey: photos[0].s3_key });
                                                            }
                                                        } catch (err: any) {
                                                            alert("Failed to upload safety photo: " + err.message);
                                                        }
                                                    }
                                                }}
                                            />
                                            <button
                                                onClick={() => document.getElementById("safety-photo-upload")?.click()}
                                                style={{
                                                    padding: "0.5rem 1rem",
                                                    background: "white",
                                                    border: "1px solid #cbd5e0",
                                                    borderRadius: "6px",
                                                    cursor: "pointer",
                                                    fontSize: "0.9rem",
                                                    display: "flex", alignItems: "center", gap: "0.5rem"
                                                }}
                                            >
                                                📷 Add Photo
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold" }}>Notes:</label>
                                <textarea
                                    value={safety.notes || ""}
                                    onChange={(e) => onSetSafety?.({ ...safety, notes: e.target.value })}
                                    style={{ width: "100%", padding: "0.75rem", minHeight: "80px", marginBottom: "1.5rem", borderRadius: "6px", border: "1px solid #cbd5e0" }}
                                    placeholder="Describe the situation..."
                                />

                                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                                    <button
                                        onClick={() => {
                                            if (safety.safetyPhotoKey) {
                                                onSetSafety?.({
                                                    ...safety,
                                                    hasConcern: safety?.hasConcern ?? true,
                                                    wantsToSkip: true
                                                });
                                                onSkipStop?.();
                                            } else {
                                                setShowSkipModal(true);
                                            }
                                        }}
                                        disabled={!safety.hazardTypes || safety.hazardTypes.length === 0 || !safety.safetyPhotoKey || isSkipQueued}
                                        style={{
                                            padding: "1rem",
                                            background: "#c53030",
                                            color: "white",
                                            border: "none",
                                            borderRadius: "8px",
                                            fontWeight: "bold",
                                            cursor: (safety.hazardTypes?.length || 0) > 0 && safety.safetyPhotoKey ? "pointer" : "not-allowed",
                                            opacity: (safety.hazardTypes?.length || 0) > 0 && safety.safetyPhotoKey && !isSkipQueued ? 1 : 0.5,
                                        }}
                                    >
                                        {isSkipQueued ? "Skip Queued..." : "Skip Stop for Safety"}
                                    </button>
                                    <button
                                        onClick={() => {
                                            onSetSafety?.({ ...safety, wantsToSkip: false });
                                            onNextStep?.();
                                        }}
                                        disabled={!safety.hazardTypes || safety.hazardTypes.length === 0}
                                        style={{
                                            padding: "1rem",
                                            background: "white",
                                            color: "#2d3748",
                                            border: "1px solid #cbd5e0",
                                            borderRadius: "8px",
                                            fontWeight: "bold",
                                            cursor: (safety.hazardTypes?.length || 0) > 0 ? "pointer" : "not-allowed",
                                            opacity: (safety.hazardTypes?.length || 0) > 0 ? 1 : 0.5,
                                        }}
                                    >
                                        Log Hazard & Continue Cleaning
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* TASKS STEP */}
                {currentStep === "tasks" && (
                    <div>
                        <h3 style={{ marginTop: 0, color: "#2c7a7b", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            📋 Cleaning Tasks
                        </h3>
                        <p style={{ marginBottom: "1.5rem", color: "#718096" }}>Check off completed tasks:</p>

                        <div style={{ display: "grid", gap: "1rem" }}>
                            {CHECKLIST_ITEMS.map((item) => (
                                <label
                                    key={item.key}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        padding: "1rem",
                                        background: checklist[item.key] ? "#ebf8ff" : "white",
                                        border: `2px solid ${checklist[item.key] ? "#3182ce" : "#e2e8f0"}`,
                                        borderRadius: "8px",
                                        cursor: "pointer",
                                        transition: "all 0.2s",
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={!!checklist[item.key]}
                                        onChange={(e) => onSetChecklist(item.key, e.target.checked)}
                                        style={{
                                            width: "20px",
                                            height: "20px",
                                            marginRight: "1rem",
                                            cursor: "pointer",
                                        }}
                                    />
                                    <span style={{ fontSize: "1.1rem", fontWeight: checklist[item.key] ? "bold" : "normal" }}>
                                        {item.label}
                                    </span>
                                </label>
                            ))}
                        </div>

                        {/* Trash Volume Section */}
                        <div style={{ marginTop: "1.5rem", padding: "1rem", background: "#fffaf0", borderRadius: "8px", border: "1px solid #ed8936" }}>
                            <label style={{ display: "block", marginBottom: "0.75rem", fontWeight: "bold", color: "#9c4221" }}>
                                Trash Volume (Required)
                            </label>
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                                {[
                                    { val: 0, label: "0 - Empty / Almost Empty" },
                                    { val: 1, label: "1 - Low" },
                                    { val: 2, label: "2 - Medium" },
                                    { val: 3, label: "3 - High" },
                                    { val: 4, label: "4 - Overflowing" },
                                ].map((opt) => (
                                    <label key={opt.val} style={{ display: "flex", alignItems: "center", cursor: "pointer", padding: "0.25rem 0" }}>
                                        <input
                                            type="radio"
                                            name="trashVolume"
                                            value={opt.val}
                                            checked={checklist.trashVolume === opt.val}
                                            onChange={() => onSetChecklist('trashVolume', opt.val)}
                                            style={{ marginRight: "0.75rem", width: "18px", height: "18px", accentColor: "#dd6b20" }}
                                        />
                                        <span style={{ fontSize: "1rem", color: "#2d3748" }}>{opt.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {(() => {
                            const anyCleaningTask =
                                checklist.picked_up_litter ||
                                checklist.emptied_trash ||
                                checklist.washed_shelter ||
                                checklist.washed_pad;

                            const isTaskValid = anyCleaningTask && checklist.trashVolume !== undefined;

                            return (
                                <button
                                    onClick={onNextStep}
                                    disabled={!isTaskValid}
                                    style={{
                                        width: "100%",
                                        marginTop: "2rem",
                                        padding: "1rem",
                                        background: isTaskValid ? "#3182ce" : "#cbd5e0",
                                        color: "white",
                                        border: "none",
                                        borderRadius: "8px",
                                        fontWeight: "bold",
                                        cursor: isTaskValid ? "pointer" : "not-allowed",
                                    }}
                                >
                                    Save Tasks & Continue
                                </button>
                            );
                        })()}
                    </div>
                )}

                {/* INFRA STEP */}
                {currentStep === "infra" && (
                    <div>
                        <h3 style={{ marginTop: 0, color: "#2b6cb0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            🏗 Infrastructure
                        </h3>
                        <p style={{ marginBottom: "1.5rem" }}>Any infrastructure issues to report?</p>

                        <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
                            <button
                                onClick={() => {
                                    // Just toggle the view state to show checkboxes, doesn't save yet
                                    // We can use local state or just assume if they click yes they want to see options
                                    // But to keep it simple, let's just show options always or toggle a "showOptions"
                                    // Actually, let's just use the presence of keys to determine "Yes" visually,
                                    // but we need a way to say "Yes" initially?
                                    // The previous design had a Yes/No toggle. Let's keep that but drive it by local state?
                                    // Or just show the options directly?
                                    // Let's stick to the Yes/No toggle for clarity.
                                    onSetInfra?.({ ...infra, hasIssues: true, issues: infra?.issues || [] });
                                }}
                                style={{
                                    flex: 1,
                                    padding: "0.75rem",
                                    background: infra?.hasIssues === true ? "#ebf8ff" : "white",
                                    color: infra?.hasIssues === true ? "#2b6cb0" : "#4a5568",
                                    border: `2px solid ${infra?.hasIssues === true ? "#2b6cb0" : "#e2e8f0"}`,
                                    borderRadius: "8px",
                                    fontWeight: "bold",
                                    cursor: "pointer",
                                }}
                            >
                                Yes
                            </button>
                            <button
                                onClick={() => {
                                    // Clear issues and save immediately/continue
                                    setSelectedInfraKeys([]);
                                    setInfraNotes("");
                                    onSetInfra?.({ hasIssues: false, issues: [] });
                                    onNextStep?.();
                                }}
                                style={{
                                    flex: 1,
                                    padding: "0.75rem",
                                    background: "white",
                                    color: "#4a5568",
                                    border: "2px solid #e2e8f0",
                                    borderRadius: "8px",
                                    fontWeight: "bold",
                                    cursor: "pointer",
                                }}
                            >
                                No
                            </button>
                        </div>

                        {infra?.hasIssues && (
                            <div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1.5rem" }}>
                                    {(Object.keys(INFRA_ISSUE_META) as InfraIssueKey[]).map((key) => {
                                        const meta = INFRA_ISSUE_META[key];
                                        const isSelected = selectedInfraKeys.includes(key);
                                        return (
                                            <label key={key} style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "0.5rem",
                                                padding: "0.5rem",
                                                background: isSelected ? "#ebf8ff" : "white",
                                                border: isSelected ? "1px solid #90cdf4" : "1px solid #e2e8f0",
                                                borderRadius: "6px",
                                                fontSize: "0.9rem",
                                                cursor: "pointer"
                                            }}>
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setSelectedInfraKeys([...selectedInfraKeys, key]);
                                                        } else {
                                                            setSelectedInfraKeys(selectedInfraKeys.filter(k => k !== key));
                                                        }
                                                    }}
                                                />
                                                {meta.label}
                                            </label>
                                        );
                                    })}
                                </div>
                                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold" }}>Notes:</label>
                                <textarea
                                    value={infraNotes}
                                    onChange={(e) => setInfraNotes(e.target.value)}
                                    style={{ width: "100%", padding: "0.75rem", minHeight: "80px", borderRadius: "6px", border: "1px solid #cbd5e0" }}
                                    placeholder="Details about the issue..."
                                />

                                <button
                                    onClick={handleSaveInfra}
                                    style={{
                                        width: "100%",
                                        marginTop: "1.5rem",
                                        padding: "1rem",
                                        background: "#3182ce",
                                        color: "white",
                                        border: "none",
                                        borderRadius: "8px",
                                        fontWeight: "bold",
                                        cursor: "pointer",
                                    }}
                                >
                                    Save Infrastructure & Continue
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* PHOTO STEP */}
                {
                    currentStep === "photo" && (
                        <div>
                            <h3 style={{ marginTop: 0, color: "#805ad5", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                📸 Stop Photos
                            </h3>
                            <p style={{ marginBottom: "1.5rem", color: "#4a5568" }}>
                                Take after photo of the stop.
                            </p>

                            {/* Existing Photos Grid */}
                            {existingPhotos.length > 0 && (
                                <div style={{ marginBottom: "2rem" }}>
                                    <h4 style={{ fontSize: "0.9rem", color: "#718096", marginBottom: "0.5rem" }}>Uploaded Photos</h4>
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: "0.5rem" }}>
                                        {existingPhotos.map(p => (
                                            <div
                                                key={p.id}
                                                onClick={() => setPreviewUrl(p.url)}
                                                style={{ aspectRatio: "1", background: "#edf2f7", borderRadius: "8px", overflow: "hidden", cursor: "pointer", position: "relative" }}
                                            >
                                                <img
                                                    src={p.url}
                                                    alt={`Photo ${p.id}`}
                                                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Pending Uploads Preview */}
                            {selectedFiles.length > 0 && (
                                <div style={{ marginBottom: "2rem", background: "#f0fff4", padding: "1rem", borderRadius: "8px", border: "1px solid #9ae6b4" }}>
                                    <h4 style={{ fontSize: "0.9rem", color: "#2f855a", marginBottom: "0.5rem", marginTop: 0 }}>Ready to Upload ({selectedFiles.length})</h4>
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: "0.5rem", marginBottom: "1rem" }}>
                                        {selectedFiles.map((file, idx) => (
                                            <div
                                                key={idx}
                                                style={{ aspectRatio: "1", background: "black", borderRadius: "8px", overflow: "hidden", position: "relative" }}
                                            >
                                                <img
                                                    src={URL.createObjectURL(file)}
                                                    alt="preview"
                                                    style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.8 }}
                                                    onClick={() => setPreviewUrl(URL.createObjectURL(file))}
                                                />
                                                <button
                                                    onClick={() => handleRemoveSelectedFile(idx)}
                                                    style={{
                                                        position: "absolute", top: "2px", right: "2px",
                                                        background: "rgba(0,0,0,0.5)", color: "white",
                                                        border: "none", borderRadius: "50%", width: "20px", height: "20px",
                                                        display: "flex", alignItems: "center", justifyContent: "center",
                                                        cursor: "pointer", fontSize: "12px"
                                                    }}
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    <div style={{ display: "flex", gap: "0.5rem" }}>
                                        <button
                                            onClick={handleConfirmUpload}
                                            style={{
                                                flex: 1,
                                                padding: "0.75rem",
                                                background: "#48bb78",
                                                color: "white",
                                                border: "none",
                                                borderRadius: "6px",
                                                fontWeight: "bold",
                                                cursor: "pointer",
                                            }}
                                        >
                                            Upload & Save
                                        </button>
                                        <button
                                            onClick={handleDiscardSelection}
                                            style={{
                                                padding: "0.75rem",
                                                background: "white",
                                                color: "#e53e3e",
                                                border: "1px solid #fc8181",
                                                borderRadius: "6px",
                                                cursor: "pointer",
                                            }}
                                        >
                                            Discard
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Add Photo Button */}
                            {selectedFiles.length === 0 && (
                                <div style={{ marginBottom: "2rem", textAlign: "center" }}>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        onChange={handleFileSelect}
                                        id="photo-upload"
                                        style={{ display: "none" }}
                                        disabled={isUploadingPhoto}
                                    />
                                    <label
                                        htmlFor="photo-upload"
                                        style={{
                                            display: "block",
                                            padding: "2rem",
                                            border: "2px dashed #cbd5e0",
                                            borderRadius: "12px",
                                            background: "#f7fafc",
                                            cursor: "pointer",
                                            color: "#4a5568",
                                            fontWeight: "bold",
                                        }}
                                    >
                                        {isUploadingPhoto ? "Uploading..." : "📷 Add Photos"}
                                    </label>
                                </div>
                            )}

                            {(() => {
                                const hasAnyPhoto = attachedPhotoKeys.length > 0 || existingPhotos.length > 0 || queuedUploadCount > 0;
                                const hasPendingUploads = selectedFiles.length > 0;
                                const canComplete = hasAnyPhoto && !hasPendingUploads && !isCompletingStop;

                                return (
                                    <button
                                        onClick={onCompleteStop}
                                        disabled={!canComplete}
                                        style={{
                                            width: "100%",
                                            padding: "1.25rem",
                                            background: canComplete ? "#805ad5" : "#cbd5e0",
                                            color: "white",
                                            border: "none",
                                            borderRadius: "8px",
                                            fontSize: "1.1rem",
                                            fontWeight: "bold",
                                            cursor: canComplete ? "pointer" : "not-allowed",
                                        }}
                                    >
                                        {hasPendingUploads ? "Upload photos first" : isCompletingStop ? "Completing..." : "Complete Stop"}
                                    </button>
                                );
                            })()}
                        </div>
                    )
                }
            </div>

            {/* SKIP MODAL */}
            {
                showSkipModal && (
                    <div style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: "rgba(0,0,0,0.5)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 1000,
                        padding: "1rem"
                    }}>
                        <div style={{ background: "white", padding: "1.5rem", borderRadius: "12px", width: "100%", maxWidth: "400px" }}>
                            <h3 style={{ marginTop: 0, color: "#c53030" }}>Confirm Skip</h3>
                            <p>You are about to skip this stop due to: <strong>{safety?.hazardTypes?.join(", ") || "Safety Concern"}</strong></p>

                            <div style={{ marginBottom: "1.5rem" }}>
                                <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold" }}>Photo Required:</label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    id="skip-photo-upload"
                                    style={{ display: "none" }}
                                    disabled={isUploadingPhoto}
                                    onChange={async (e) => {
                                        const f = e.target.files?.[0];
                                        if (!f) return;
                                        try {
                                            const { photos, queued } = await uploadPhotos(stop.route_run_stop_id, [f], "safety");
                                            if (queued) {
                                                const placeholder = `queued-safety-${Date.now()}`;
                                                onSetSafety?.({ ...(safety || { hasConcern: true, hazardTypes: [] }), safetyPhotoKey: placeholder });
                                            } else if (photos?.[0]?.s3_key) {
                                                onSetSafety?.({ ...(safety || { hasConcern: true, hazardTypes: [] }), safetyPhotoKey: photos[0].s3_key });
                                            }
                                        } catch (err: any) {
                                            alert("Failed to upload safety photo: " + (err?.message || "Unknown error"));
                                        } finally {
                                            e.target.value = "";
                                        }
                                    }}
                                />
                                <label
                                    htmlFor="skip-photo-upload"
                                    style={{
                                        display: "block",
                                        padding: "1rem",
                                        border: "2px dashed #cbd5e0",
                                        borderRadius: "8px",
                                        background: "#f7fafc",
                                        cursor: "pointer",
                                        textAlign: "center",
                                        color: safety?.safetyPhotoKey ? "#48bb78" : "#4a5568",
                                        fontWeight: "bold",
                                    }}
                                >
                                    {isUploadingPhoto ? "Uploading..." : safety?.safetyPhotoKey ? "✅ Photo Attached" : "📷 Take Photo"}
                                </label>
                            </div>

                            <div style={{ display: "flex", gap: "1rem" }}>
                                <button
                                    onClick={() => setShowSkipModal(false)}
                                    style={{
                                        flex: 1,
                                        padding: "1rem",
                                        background: "white",
                                        color: "#4a5568",
                                        border: "1px solid #cbd5e0",
                                        borderRadius: "8px",
                                        fontWeight: "bold",
                                        cursor: "pointer",
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        onSetSafety?.({
                                            hasConcern: safety?.hasConcern ?? null,
                                            ...safety,
                                            wantsToSkip: true
                                        });
                                        onSkipStop?.();
                                    }}
                                    disabled={!safety?.safetyPhotoKey || isCompletingStop || isSkipQueued}
                                    style={{
                                        flex: 1,
                                        padding: "1rem",
                                        background: safety?.safetyPhotoKey ? "#c53030" : "#cbd5e0",
                                        color: "white",
                                        border: "none",
                                        borderRadius: "8px",
                                        fontWeight: "bold",
                                        cursor: safety?.safetyPhotoKey ? "pointer" : "not-allowed",
                                    }}
                                >
                                    {isCompletingStop ? "Skipping..." : isSkipQueued ? "Skip Queued..." : "Confirm Skip"}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </UlLayout>
    );
}
