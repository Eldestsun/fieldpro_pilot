import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../auth/AuthContext";
import {
    fetchPools,
    fetchBases,
    fetchUlUsers,
    previewRouteRun,
    createRouteRun,
    getStopsScoped,
    type Pool,
    type Base,
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
    const [selectedBaseId, setSelectedBaseId] = useState<string>("");
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
    const [bases, setBases] = useState<Base[]>([]);
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
            setSelectedBaseId("");
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
                    const [poolsData, basesData, ulsData] = await Promise.all([
                        fetchPools(token),
                        fetchBases(token),
                        fetchUlUsers(token),
                    ]);
                    setPools(poolsData);
                    setBases(basesData);
                    // Single-base orgs never need to think about it — auto-select.
                    if (basesData.length === 1) setSelectedBaseId(basesData[0].id);
                    // Hide CI seed crew (seed-*-oid) from the picker — test inputs,
                    // not real assignable people. Structural rows stay in the DB for CI.
                    setUls(ulsData.filter((u) => !u.id.startsWith("seed-")));
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

    // Selecting a pool defaults the base to that pool's pre-attached base (if any),
    // preserving the old KCM behavior where base was implied by the route. When the
    // pool has none (district pools), the base picker stays for Dispatch to choose.
    const setPool = useCallback((poolId: string) => {
        setSelectedPoolId(poolId);
        setPreview(null);
        const pool = pools.find((p) => p.id === poolId);
        if (pool?.baseId) {
            setSelectedBaseId(pool.baseId);
        }
    }, [pools]);

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
        if (!selectedPoolId || !selectedUlId || !selectedBaseId) return;
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
                ...(selectedBaseId ? { baseId: selectedBaseId } : {}),
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
                ...(selectedBaseId ? { baseId: selectedBaseId } : {}),
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

    // Base is required to preview too: it's the trip origin, so without it the
    // preview miles would be stop-to-stop and then jump on save. Requiring it up
    // front keeps the previewed distance identical to the saved route.
    const canPreview =
        !!selectedPoolId && !!selectedUlId && !!selectedBaseId && !loadingOptions &&
        (mode === "pool" || selectedStops.length >= 2);
    const canSave = !!preview && !!selectedBaseId && !savingRoute;

    return {
        isOpen,
        open,
        close,
        selectedPoolId,
        setPool,
        selectedBaseId,
        setBase: setSelectedBaseId,
        selectedUlId,
        setUl: setSelectedUlId,
        shiftType,
        setShiftType,
        runDate,
        pools,
        bases,
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
