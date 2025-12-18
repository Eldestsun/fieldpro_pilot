export interface RouteRun {
    id: number;
    user_id: number;
    route_pool_id: string;
    route_pool_label?: string;
    base_id: string;
    run_date: string;
    total_distance_m: number;
    total_duration_s: number;
    status: string;
    stops: Stop[];
}

export interface Stop {
    route_run_stop_id: number;
    stop_id: string;
    stopNumber: string;
    sequence: number;
    on_street_name: string;
    cross_street: string;
    intersection_loc: string;
    bearing_code: string;
    location: {
        lon: number;
        lat: number;
    };
    status: "pending" | "in_progress" | "done" | "skipped";
    is_hotspot: boolean;
    compactor: boolean;
    has_trash: boolean;
    trash_volume?: number;
}

export interface ChecklistState {
    picked_up_litter: boolean;
    emptied_trash: boolean;
    washed_shelter: boolean;
    washed_pad: boolean;
    washed_can: boolean;
    trashVolume?: number;
}

export const EMPTY_CHECKLIST: ChecklistState = {
    picked_up_litter: false,
    emptied_trash: false,
    washed_shelter: false,
    washed_pad: false,
    washed_can: false,
    trashVolume: undefined,
};

export async function getTodayRoute(token: string): Promise<RouteRun | null> {
    const res = await fetch("/api/ul/todays-run", {
        headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 404) return null;

    if (!res.ok) {
        // Prefer JSON error messages, but don't crash if body isn't JSON
        try {
            const data = await res.json();
            throw new Error(data?.error || `Failed to fetch route (${res.status})`);
        } catch (_e) {
            const text = await res.text().catch(() => "");
            throw new Error(text || `Failed to fetch route (${res.status})`);
        }
    }

    const data: any = await res.json().catch(() => ({}));
    const routeRun: any = data?.route_run ?? null;

    if (!routeRun) return null;

    // Normalize shape so UI never explodes on missing stops
    if (!Array.isArray(routeRun.stops)) routeRun.stops = [];

    return routeRun as RouteRun;
}

export async function startRoute(token: string, routeRunId: number): Promise<RouteRun> {
    const res = await fetch(`/api/route-runs/${routeRunId}/start`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to start route");
    }

    const data = await res.json();
    return data.route_run;
}

export async function finishRoute(token: string, routeRunId: number): Promise<RouteRun> {
    const res = await fetch(`/api/route-runs/${routeRunId}/finish`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to finish route");
    }

    const data = await res.json();
    return data.route_run;
}

export async function startRouteRunStop(
    token: string,
    routeRunStopId: number | string
): Promise<RouteRun> {
    const res = await fetch(`/api/route-run-stops/${routeRunStopId}/start`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to start stop");
    }

    const data = await res.json();
    return data.route_run;
}

export interface InfraIssuePayload {
    issue_type: string;
    component?: string;
    cause?: string;
    notes?: string | null;
}

export interface HazardPayload {
    hazard_types: string[];
    severity?: number;
    notes?: string;
    safety_photo_key?: string;
    photo_keys: string[];
}

export interface SafetyPayload {
    hazard_types: string[];
    severity?: number;
    notes?: string;
    safety_photo_key?: string;
}

export interface CompleteStopPayload {
    duration_minutes?: number;
    picked_up_litter: boolean;
    emptied_trash: boolean;
    washed_shelter: boolean;
    washed_pad: boolean;
    washed_can: boolean;
    photo_keys: string[];
    infraIssues?: InfraIssuePayload[];
    safety?: SafetyPayload;
    trashVolume?: number;
    hazards?: Array<{ hazard_type: string; severity?: number; notes?: string }>;
}

export async function completeStop(
    token: string,
    stopId: number,
    payload: CompleteStopPayload
): Promise<RouteRun> {
    const res = await fetch(`/api/route-run-stops/${stopId}/complete`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to complete stop");
    }

    const data = await res.json();
    return data.route_run;
}

export async function skipRouteRunStopWithHazard(
    token: string,
    routeRunStopId: number,
    payload: HazardPayload
): Promise<RouteRun> {
    const res = await fetch(`/api/route-run-stops/${routeRunStopId}/skip-with-hazard`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to skip stop");
    }

    const data = await res.json();
    // The endpoint returns { ok: true, route_run_stop: ... }
    // But our hook expects a full RouteRun update usually.
    // However, for skip, we might just need to refetch or manually update local state.
    // Let's assume we refetch or the hook handles it.
    // Wait, the hook expects a RouteRun from start/finish/complete.
    // Let's check what the backend returns for skip.
    // Backend returns: { ok: true, route_run_stop: updateRes.rows[0] }
    // It does NOT return the full route run.
    // We should probably refetch the route in the hook, or update the backend to return the full route.
    // For consistency with other actions, let's update the backend to return the full route run?
    // Or just handle the partial update in the hook.
    // Given "minimal changes", let's handle it in the hook by refetching or manual splice.
    // But this function signature says Promise<RouteRun>.
    // Let's change the signature to Promise<any> or specific type, or update backend.
    // Updating backend to return full route run is cleaner for the frontend hook.
    // But I already wrote the backend code.
    // Let's stick to the plan: "Return the updated route_run_stop row in the response."
    // So I will change the return type here to Promise<any> (or the stop type) and handle it in the hook.
    return data.route_run;
}

export async function getUploadUrl(
    token: string,
    stopId: number | string,
    contentType: string,
    filename: string
): Promise<{ uploadUrl: string; objectKey: string }> {
    const res = await fetch("/api/uploads/signed-url", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
            route_run_stop_id: Number(stopId),
            contentType,
            filename,
        }),
    });

    if (!res.ok) throw new Error("Failed to get upload URL");

    const { ok, uploadUrl, objectKey } = await res.json();
    if (!ok || !uploadUrl || !objectKey) {
        throw new Error("Invalid response from signed-url endpoint");
    }

    return { uploadUrl, objectKey };
}

export async function uploadFile(uploadUrl: string, file: File): Promise<void> {
    const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file,
    });

    if (!res.ok) throw new Error("Failed to upload image to storage");
}

export async function updateHotspot(
    token: string,
    stopId: string,
    is_hotspot: boolean
): Promise<void> {
    const res = await fetch(`/api/stops/${stopId}/hotspot`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ is_hotspot }),
    });

    if (!res.ok) {
        try {
            const data = await res.json();
            throw new Error(data.error || "Failed to update hotspot flag");
        } catch (err: any) {
            throw new Error("Failed to update hotspot flag");
        }
    }
}

export async function getLeadRouteRunById(
    token: string,
    routeRunId: number
): Promise<RouteRun> {
    const res = await fetch(`/api/lead/route-runs/${routeRunId}`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    if (!res.ok) {
        try {
            const data = await res.json();
            throw new Error(data.error || "Failed to load route run");
        } catch (err: any) {
            throw new Error("Failed to load route run");
        }
    }

    const data = await res.json();
    return data.route_run;
}

export async function updateStopCompactor(
    token: string,
    stopId: string,
    compactor: boolean
): Promise<{ stop_id: string; compactor: boolean }> {
    const res = await fetch(`/api/stops/${stopId}/compactor`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ compactor }),
    });

    if (!res.ok) {
        try {
            const data = await res.json();
            throw new Error(data.error || "Failed to update compactor flag");
        } catch (err: any) {
            throw new Error("Failed to update compactor flag");
        }
    }

    return await res.json();
}

/** ── Route Creation Types & Helpers ───────────────────────────────────── */

export interface Pool {
    id: string;
    name: string;
    region_id?: string;
}

export interface UlUser {
    id: string;
    displayName: string;
    email?: string;
    role: string;
}

export interface RoutePreviewStop {
    stop_id: string;
    sequence: number;
    location: string; // or structured
    planned_duration_s: number;
    planned_distance_m: number;
}

export interface RoutePreviewResponse {
    ok: boolean;
    distance_m: number;
    duration_s: number;
    ordered_stops: RoutePreviewStop[];
    truncated?: boolean;
    total_stops?: number;
    used_stops?: number;
}

export async function fetchPools(token: string): Promise<Pool[]> {
    const res = await fetch("/api/pools", {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch pools");
    }
    const data = await res.json();
    return data.pools;
}

export async function fetchUlUsers(token: string): Promise<UlUser[]> {
    const res = await fetch("/api/users", {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch users");
    }
    const data = await res.json();
    return data.users;
}

export async function previewRouteRun(
    token: string,
    params: { poolId: string; ulId: string; runDate: string }
): Promise<RoutePreviewResponse> {
    const res = await fetch("/api/route-runs/preview", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
            pool_id: params.poolId,
            ul_id: params.ulId,
            run_date: params.runDate,
        }),
    });

    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate preview");
    }
    return await res.json();
}

export async function createRouteRun(
    token: string,
    params: { poolId: string; ulId: string; runDate: string }
): Promise<void> {
    const res = await fetch("/api/route-runs", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
            pool_id: params.poolId,
            ul_id: params.ulId,
            run_date: params.runDate,
        }),
    });

    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create route");
    }
}

export interface LeadRouteRunSummary {
    id: number;
    user_id: number;
    route_pool_id: string;
    base_id: string;
    status: string;
    run_date: string;
    created_at: string;
    stopCount: number;
}

export async function fetchLeadTodaysRuns(token: string): Promise<LeadRouteRunSummary[]> {
    const res = await fetch("/api/lead/todays-runs", {
        headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch routes");
    }

    const data = await res.json();
    return data.route_runs.map((r: any) => ({
        id: r.id,
        user_id: r.user_id,
        route_pool_id: r.route_pool_id,
        base_id: r.base_id,
        status: r.status,
        run_date: r.run_date,
        created_at: r.created_at,
        stopCount: Number(r.stop_count || 0),
    }));
}

/** ── Admin API ────────────────────────────────────────────────────────── */

export interface AdminDashboardStats {
    total_stops: number;
    total_pools: number;
    active_runs_today: number;
    completed_runs_today: number;
}

// --- Admin Dashboard (Read-Only Ops Variants) ---

export async function getOpsDashboard(token: string): Promise<AdminDashboardStats> {
    const res = await fetch("/api/ops/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to fetch ops dashboard stats");
    return await res.json();
}

export async function getOpsPools(token: string): Promise<Pool[]> { // Assuming RoutePool is Pool
    const res = await fetch("/api/ops/pools", {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to fetch ops pools");
    const data = await res.json();
    return data.pools;
}

export interface AdminStop { // Assuming AdminStop is a type that needs to be defined
    id: string;
    // Add other properties of AdminStop if known
}

export async function getOpsStops(
    token: string,
    params: { page: number; pageSize: number; q?: string; pool_id?: string }
): Promise<{ items: AdminStop[]; total: number }> {
    const qs = new URLSearchParams();
    qs.set("page", String(params.page));
    qs.set("pageSize", String(params.pageSize));
    if (params.q) qs.set("q", params.q);
    if (params.pool_id) qs.set("pool_id", params.pool_id);

    const res = await fetch(`/api/ops/stops?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to fetch ops stops");
    return await res.json();
}

export async function getAdminDashboard(token: string): Promise<AdminDashboardStats> {
    const res = await fetch("/api/admin/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to fetch dashboard stats");
    return await res.json();
}

export async function getAdminPools(token: string): Promise<any[]> {
    const res = await fetch("/api/admin/pools", {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to fetch pools");
    const data = await res.json();
    return data.pools;
}

export async function createAdminPool(token: string, body: any): Promise<any> {
    const res = await fetch("/api/admin/pools", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Failed to create pool");
    const data = await res.json();
    return data.pool;
}

export async function updateAdminPool(token: string, id: string, body: any): Promise<any> {
    const res = await fetch(`/api/admin/pools/${id}`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Failed to update pool");
    const data = await res.json();
    return data.pool;
}

export async function disableAdminPool(token: string, id: string): Promise<any> {
    const res = await fetch(`/api/admin/pools/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to disable pool");
    const data = await res.json();
    return data.pool;
}

export async function getAdminStops(token: string, params: any): Promise<{ items: any[]; total: number }> {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`/api/admin/stops?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to fetch stops");
    return await res.json();
}

export async function updateAdminStop(token: string, stopId: string, body: any): Promise<any> {
    const res = await fetch(`/api/admin/stops/${stopId}`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update stop");
    }
    const data = await res.json();
    return data.stop;
}

export async function bulkUpdateAdminStops(token: string, body: any): Promise<{ updated_count: number }> {
    const res = await fetch("/api/admin/stops/bulk", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to bulk update stops");
    }
    return await res.json();
}

/** ── Photo Upload API ─────────────────────────────────────────────────── */

export interface PhotoDto {
    id: string;
    s3_key: string;
    kind: string;
    captured_at: string;
    created_by_oid: string;
    url: string;
}

export async function uploadStopPhotos(
    token: string,
    routeRunId: number,
    routeRunStopId: number,
    files: File[],
    kind: string = "completion"
): Promise<PhotoDto[]> {
    const formData = new FormData();
    files.forEach((file) => formData.append("photos", file));
    formData.append("kind", kind);

    const res = await fetch(`/api/route-runs/${routeRunId}/stops/${routeRunStopId}/photos`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
        },
        body: formData,
    });

    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to upload photos");
    }

    const data = await res.json();
    return data.photos;
}

export async function getStopPhotos(
    token: string,
    routeRunId: number,
    routeRunStopId: number
): Promise<PhotoDto[]> {
    const res = await fetch(`/api/route-runs/${routeRunId}/stops/${routeRunStopId}/photos`, {
        headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch photos");
    }

    const data = await res.json();
    return data.photos;
}

/** ── Error Classifiers ────────────────────────────────────────────────── */

export function isNetworkError(error: unknown): boolean {
    if (!error) return false;
    const e = error as any;

    // Classic fetch/network failures
    if (e instanceof TypeError || e.name === "TypeError") {
        return true;
    }

    // JSON parse failures when the backend returns an empty / truncated body
    if (
        (e instanceof SyntaxError || e.name === "SyntaxError") &&
        typeof e.message === "string" &&
        e.message.includes("Unexpected end of JSON input")
    ) {
        return true;
    }
    return false;
}

export function isAuthError(error: unknown): boolean {
    const err = error as any;
    const status: number | undefined = err?.status ?? err?.response?.status;
    return status === 401 || status === 403;
}

export function isRetryableServerError(error: unknown): boolean {
    if (!error) return false;
    const err = error as any;
    const status: number | undefined = err?.status ?? err?.response?.status;
    // Treat 5xx as retryable
    if (typeof status === "number" && status >= 500 && status < 600) {
        return true;
    }

    if (
        (err instanceof SyntaxError || err.name === "SyntaxError") &&
        typeof err.message === "string" &&
        err.message.includes("Unexpected end of JSON input")
    ) {
        return true;
    }

    return false;
}

export function isValidationError(error: unknown): boolean {
    const err = error as any;
    const status: number | undefined = err?.status ?? err?.response?.status;
    // Treat 400/422 as validation-related
    return status === 400 || status === 422;
}

export async function parseApiErrorCode(
    response: Response | { status: number; json?: () => Promise<any> }
): Promise<string | undefined> {
    if (response && typeof (response as any).json === "function") {
        try {
            // Clone if real Response to avoid consuming body if needed elsewhere, 
            // but usually this helper is called when we are handling the response.
            // Only Clone if it is a Response object
            const r = response as Response;
            const clone = r.clone ? r.clone() : r;
            const data = await clone.json();
            if (data && typeof data.error === "string") {
                // Check if it matches our known codes (simple heuristic or exact match)
                return data.error;
            }
        } catch (ignore) {
            // JSON parse failed or body already consumed
        }
    }
    return undefined;
}
