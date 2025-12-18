import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../auth/AuthContext";
import {
    fetchPools,
    fetchUlUsers,
    previewRouteRun,
    createRouteRun,
    type Pool,
    type UlUser,
    type RoutePreviewResponse,
} from "../api/routeRuns";

interface UseCreateRouteOptions {
    onCreated?: () => void;
}

export function useCreateRoute({ onCreated }: UseCreateRouteOptions = {}) {
    const { getAccessToken } = useAuth();
    const [isOpen, setIsOpen] = useState(false);

    // Form State
    const [selectedPoolId, setSelectedPoolId] = useState<string>("");
    const [selectedUlId, setSelectedUlId] = useState<string>("");
    const [runDate] = useState(() => new Date().toISOString().split("T")[0]); // Default today

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
            setPreview(null);
            setError(null);
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

    const generatePreview = async () => {
        if (!selectedPoolId || !selectedUlId) return;
        setLoadingPreview(true);
        setError(null);
        setPreview(null);

        try {
            const token = await getAccessToken();
            const res = await previewRouteRun(token, {
                poolId: selectedPoolId,
                ulId: selectedUlId,
                runDate,
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
            });
            if (onCreated) onCreated();
            close();
        } catch (err: any) {
            setError(err.message || "Failed to save route");
        } finally {
            setSavingRoute(false);
        }
    };

    const canPreview = !!selectedPoolId && !!selectedUlId && !loadingOptions;
    const canSave = !!preview && !savingRoute;

    return {
        isOpen,
        open,
        close,
        selectedPoolId,
        setPool: setSelectedPoolId,
        selectedUlId,
        setUl: setSelectedUlId,
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
    };
}
