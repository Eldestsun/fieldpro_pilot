import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../auth/AuthContext";
import {
    fetchPools,
    fetchUlUsers,
    previewRouteRun,
    createRouteRun,
    getStopsScoped,
    type Pool,
    type UlUser,
    type RoutePreviewResponse,
} from "../api/routeRuns";

// SEAM-D D3b — creation mode. "pool" is the existing risk-ranked pool flow;
// "adhoc" hand-picks stops and creates the run with the explicit is_adhoc flag.
export type CreateRouteMode = "pool" | "adhoc";

export interface PickedStop {
    stopId: string;
    label: string;
}

interface UseCreateRouteOptions {
    onCreated?: () => void;
}

export function useCreateRoute({ onCreated }: UseCreateRouteOptions = {}) {
    const { getAccessToken } = useAuth();
    const [isOpen, setIsOpen] = useState(false);

    // Form State
    const [selectedPoolId, setSelectedPoolId] = useState<string>("");
    const [selectedUlId, setSelectedUlId] = useState<string>("");
    const [shiftType, setShiftType] = useState<string>("day");
    const [runDate] = useState(() => new Date().toISOString().split("T")[0]); // Default today

    // Ad-hoc picker state (D3b). The pool stays required in ad-hoc mode — it
    // anchors the base and org invariant; the picked stops override its
    // risk-ranked selection.
    const [mode, setMode] = useState<CreateRouteMode>("pool");
    const [stopSearch, setStopSearch] = useState("");
    const [stopResults, setStopResults] = useState<PickedStop[]>([]);
    const [searchingStops, setSearchingStops] = useState(false);
    const [selectedStops, setSelectedStops] = useState<PickedStop[]>([]);

    // Data State
    const [pools, setPools] = useState<Pool[]>([]);
    const [uls, setUls] = useState<UlUser[]>([]);
    const [preview, setPreview] = useState<RoutePreviewResponse | null>(null);

    // Loading/Error State
    const [loadingOptions, setLoadingOptions] = useState(false);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [savingRoute, setSavingRoute] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch options when opening
    useEffect(() => {
        if (isOpen) {
            // Reset state on open
            setSelectedPoolId("");
            setSelectedUlId("");
            setShiftType("day");
            setPreview(null);
            setError(null);
            setMode("pool");
            setStopSearch("");
            setStopResults([]);
            setSelectedStops([]);
            setLoadingOptions(true);

            const loadData = async () => {
                try {
                    const token = await getAccessToken();
                    const [poolsData, ulsData] = await Promise.all([
                        fetchPools(token),
                        fetchUlUsers(token),
                    ]);
                    setPools(poolsData);
                    setUls(ulsData);
                } catch (err: any) {
                    setError(err.message || "Failed to load options");
                } finally {
                    setLoadingOptions(false);
                }
            };
            loadData();
        }
    }, [isOpen, getAccessToken]);

    const open = useCallback(() => setIsOpen(true), []);
    const close = useCallback(() => setIsOpen(false), []);

    const switchMode = useCallback((next: CreateRouteMode) => {
        setMode(next);
        setPreview(null);
        setError(null);
    }, []);

    const searchStops = async () => {
        if (!stopSearch.trim()) return;
        setSearchingStops(true);
        setError(null);
        try {
            const token = await getAccessToken();
            const data = await getStopsScoped(
                token,
                { page: 1, pageSize: 20, q: stopSearch.trim() },
                "ops",
            );
            setStopResults(
                (data?.items ?? []).map((s: any) => ({
                    stopId: String(s.stop_id),
                    label: [s.stop_id, s.on_street_name].filter(Boolean).join(" — "),
                })),
            );
        } catch (err: any) {
            setError(err.message || "Failed to search stops");
        } finally {
            setSearchingStops(false);
        }
    };

    const addStop = useCallback((stop: PickedStop) => {
        setSelectedStops((prev) =>
            prev.some((s) => s.stopId === stop.stopId) ? prev : [...prev, stop],
        );
        setPreview(null);
    }, []);

    const removeStop = useCallback((stopId: string) => {
        setSelectedStops((prev) => prev.filter((s) => s.stopId !== stopId));
        setPreview(null);
    }, []);

    const generatePreview = async () => {
        if (!selectedPoolId || !selectedUlId) return;
        if (mode === "adhoc" && selectedStops.length < 2) return;
        setLoadingPreview(true);
        setError(null);
        setPreview(null);

        try {
            const token = await getAccessToken();
            const res = await previewRouteRun(token, {
                poolId: selectedPoolId,
                ulId: selectedUlId,
                runDate,
                shiftType,
                ...(mode === "adhoc"
                    ? { stopIds: selectedStops.map((s) => s.stopId) }
                    : {}),
            });
            setPreview(res);
        } catch (err: any) {
            setError(err.message || "Failed to generate preview");
        } finally {
            setLoadingPreview(false);
        }
    };

    const saveRoute = async () => {
        if (!preview) return;
        setSavingRoute(true);
        setError(null);

        try {
            const token = await getAccessToken();
            await createRouteRun(token, {
                poolId: selectedPoolId,
                ulId: selectedUlId,
                runDate,
                shiftType,
                // is_adhoc travels ONLY from this explicit picker mode.
                ...(mode === "adhoc"
                    ? { stopIds: selectedStops.map((s) => s.stopId), isAdhoc: true }
                    : {}),
            });
            if (onCreated) onCreated();
            close();
        } catch (err: any) {
            setError(err.message || "Failed to save route");
        } finally {
            setSavingRoute(false);
        }
    };

    const canPreview =
        !!selectedPoolId && !!selectedUlId && !loadingOptions &&
        (mode === "pool" || selectedStops.length >= 2);
    const canSave = !!preview && !savingRoute;

    return {
        isOpen,
        open,
        close,
        selectedPoolId,
        setPool: setSelectedPoolId,
        selectedUlId,
        setUl: setSelectedUlId,
        shiftType,
        setShiftType,
        runDate,
        pools,
        uls,
        preview,
        loadingOptions,
        loadingPreview,
        savingRoute,
        error,
        generatePreview,
        saveRoute,
        canPreview,
        canSave,
        // D3b ad-hoc picker
        mode,
        switchMode,
        stopSearch,
        setStopSearch,
        stopResults,
        searchingStops,
        searchStops,
        selectedStops,
        addStop,
        removeStop,
    };
}
