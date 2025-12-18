
export type OfflineActionStatus = "pending" | "running" | "done" | "failed" | "conflict";
import { isAuthError, isNetworkError, parseApiErrorCode } from "../api/routeRuns";
import { clearTodayRouteCache } from "./todayRouteCache";

export interface OfflineAction {
    id: string;
    type: string;
    routeRunId: string;
    routeRunStopId?: string;
    createdAt: string;
    payload: unknown;
    status: OfflineActionStatus;
    lastError?: string;
}

export interface OfflineQueueState {
    actions: OfflineAction[];
    requiresAuth: boolean;
    lastUpdatedAt?: string;
}

export type OfflineQueueListener = (state: OfflineQueueState) => void;

// In-memory cache
const memoryCache: Record<string, OfflineQueueState> = {};
const subscribers: Record<string, OfflineQueueListener[]> = {};

function getQueueKey(tenantId: string, oid: string): string {
    return `fieldpro-offline-queue:${tenantId}:${oid}`;
}

const DEFAULT_STATE: OfflineQueueState = {
    actions: [],
    requiresAuth: false,
};

function notifySubscribers(key: string, state: OfflineQueueState) {
    const list = subscribers[key];
    if (list) {
        list.forEach((listener) => listener(state));
    }
}

export function clearOfflineStateForUser(
    tenantId: string | undefined,
    oid: string | undefined
): OfflineQueueState {
    if (!tenantId || !oid) {
        // No identity: nothing to clear, return default
        return { ...DEFAULT_STATE };
    }

    const key = getQueueKey(tenantId, oid);

    const emptyState: OfflineQueueState = {
        ...DEFAULT_STATE,
        lastUpdatedAt: new Date().toISOString(),
    };

    // Remove from localStorage
    try {
        localStorage.removeItem(key);
    } catch {
        // ignore storage errors
    }

    // Reset in-memory state
    memoryCache[key] = emptyState;

    // Notify subscribers
    const listeners = subscribers[key];
    if (listeners) {
        for (const listener of listeners) {
            try {
                listener(emptyState);
            } catch {
                // ignore subscriber errors
            }
        }
    }

    // Clear Today’s Route cache too
    clearTodayRouteCache(tenantId, oid);

    return emptyState;
}

function persistState(key: string, state: OfflineQueueState) {
    memoryCache[key] = state;
    try {
        localStorage.setItem(key, JSON.stringify(state));
    } catch (err) {
        console.warn("Failed to persist offline queue to localStorage", err);
    }
}

export function loadQueueForUser(tenantId: string | undefined, oid: string | undefined): OfflineQueueState {
    if (!tenantId || !oid) {
        return { ...DEFAULT_STATE };
    }

    const key = getQueueKey(tenantId, oid);

    // Check memory first
    if (memoryCache[key]) {
        return memoryCache[key];
    }

    // Check storage
    try {
        const stored = localStorage.getItem(key);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed && Array.isArray(parsed.actions)) {
                // Basic validation passed
                memoryCache[key] = parsed;
                return parsed;
            }
        }
    } catch (err) {
        console.warn("Failed to load offline queue from localStorage", err);
    }

    // Default
    return { ...DEFAULT_STATE };
}

export function enqueueAction(
    tenantId: string | undefined,
    oid: string | undefined,
    action: OfflineAction
): OfflineQueueState {
    if (!tenantId || !oid) {
        return { ...DEFAULT_STATE };
    }

    const key = getQueueKey(tenantId, oid);
    const currentState = loadQueueForUser(tenantId, oid);

    const newState: OfflineQueueState = {
        ...currentState,
        actions: [...currentState.actions, action],
        lastUpdatedAt: new Date().toISOString(),
    };

    persistState(key, newState);
    notifySubscribers(key, newState);

    return newState;
}

export function updateActionStatus(
    tenantId: string | undefined,
    oid: string | undefined,
    actionId: string,
    status: OfflineActionStatus,
    lastError?: string
): OfflineQueueState {
    if (!tenantId || !oid) {
        return { ...DEFAULT_STATE };
    }

    const key = getQueueKey(tenantId, oid);
    const currentState = loadQueueForUser(tenantId, oid);

    const actionIndex = currentState.actions.findIndex((a) => a.id === actionId);
    if (actionIndex === -1) {
        return currentState;
    }

    const updatedActions = [...currentState.actions];
    updatedActions[actionIndex] = {
        ...updatedActions[actionIndex],
        status,
        lastError,
    };

    const newState: OfflineQueueState = {
        ...currentState,
        actions: updatedActions,
        lastUpdatedAt: new Date().toISOString(),
    };

    persistState(key, newState);
    notifySubscribers(key, newState);

    return newState;
}

export function getPendingActions(
    tenantId: string | undefined,
    oid: string | undefined
): OfflineAction[] {
    const state = loadQueueForUser(tenantId, oid);
    return state.actions.filter((a) => a.status === "pending");
}

export function subscribe(
    tenantId: string | undefined,
    oid: string | undefined,
    listener: OfflineQueueListener
): () => void {
    if (!tenantId || !oid) {
        return () => { };
    }

    const key = getQueueKey(tenantId, oid);
    if (!subscribers[key]) {
        subscribers[key] = [];
    }

    subscribers[key].push(listener);

    // Emit immediately
    const state = loadQueueForUser(tenantId, oid);
    listener(state);

    return () => {
        if (subscribers[key]) {
            subscribers[key] = subscribers[key].filter((l) => l !== listener);
        }
    };
}

export function setRequiresAuth(
    tenantId: string | undefined,
    oid: string | undefined,
    requiresAuth: boolean
): OfflineQueueState {
    if (!tenantId || !oid) {
        return { ...DEFAULT_STATE };
    }

    const key = getQueueKey(tenantId, oid);
    const currentState = loadQueueForUser(tenantId, oid);

    if (currentState.requiresAuth === requiresAuth) {
        return currentState;
    }

    const newState: OfflineQueueState = {
        ...currentState,
        requiresAuth,
        lastUpdatedAt: new Date().toISOString(),
    };

    persistState(key, newState);
    notifySubscribers(key, newState);

    return newState;
}

export async function runReplay(
    tenantId: string | undefined,
    oid: string | undefined,
    executorMap: Record<string, (action: OfflineAction) => Promise<void>>,
    onAfterReplay?: () => void
): Promise<void> {
    if (!tenantId || !oid) {
        return;
    }

    const pending = getPendingActions(tenantId, oid);
    let anyCompleteStopSucceeded = false;

    for (const action of pending) {
        const executor = executorMap[action.type];
        if (!executor) {
            // No executor registered for this action type yet
            continue;
        }

        // Mark as running
        updateActionStatus(tenantId, oid, action.id, "running");

        try {
            await executor(action);
            // On success, mark done
            updateActionStatus(tenantId, oid, action.id, "done");
            if (action.type === "COMPLETE_STOP") {
                anyCompleteStopSucceeded = true;
            }
        } catch (error: any) {
            if (isAuthError(error)) {
                // Auth problem: flag, reset to pending, and stop replay
                setRequiresAuth(tenantId, oid, true);
                updateActionStatus(tenantId, oid, action.id, "pending");
                break;
            }

            if (isNetworkError(error)) {
                // Network problem: reset to pending, stop replay
                updateActionStatus(tenantId, oid, action.id, "pending");
                break;
            }

            // Check for specific API error codes
            const apiCode = await parseApiErrorCode(error);
            if (apiCode === "ALREADY_COMPLETE") {
                // It's done!
                updateActionStatus(tenantId, oid, action.id, "done");
                if (action.type === "COMPLETE_STOP" || action.type === "SKIP_STOP_WITH_HAZARD") {
                    anyCompleteStopSucceeded = true;
                }
            } else if (apiCode === "ALREADY_SKIPPED") {
                updateActionStatus(tenantId, oid, action.id, "done");
                if (action.type === "SKIP_STOP_WITH_HAZARD") {
                    anyCompleteStopSucceeded = true;
                }
            } else if (apiCode === "ROUTE_NOT_FOUND" || apiCode === "ROUTE_REASSIGNED") {
                // Fatal/Conflict
                updateActionStatus(tenantId, oid, action.id, "conflict", apiCode);
            } else {
                // Other validation or unknown errors: mark failed so we don't loop forever
                updateActionStatus(
                    tenantId,
                    oid,
                    action.id,
                    "failed",
                    error instanceof Error ? error.message : String(error)
                );
            }
        }
    }

    if (anyCompleteStopSucceeded && onAfterReplay) {
        onAfterReplay();
    }
}
export function hasPendingCompleteStopForStop(
    tenantId: string | undefined,
    oid: string | undefined,
    routeRunStopId: string | number
): boolean {
    if (!tenantId || !oid) return false;

    const state = loadQueueForUser(tenantId, oid);
    if (!state || !state.actions) return false;

    const stopIdStr = String(routeRunStopId);

    return state.actions.some(
        (action) =>
            action.type === "COMPLETE_STOP" &&
            (action.status === "pending" || action.status === "running") &&
            String(action.routeRunStopId) === stopIdStr
    );
}

export function hasPendingSkipStopForStop(
    tenantId: string | undefined,
    oid: string | undefined,
    routeRunStopId: string | number
): boolean {
    if (!tenantId || !oid) return false;

    const state = loadQueueForUser(tenantId, oid);
    if (!state || !state.actions) return false;

    const stopIdStr = String(routeRunStopId);

    return state.actions.some(
        (action) =>
            action.type === "SKIP_STOP_WITH_HAZARD" &&
            (action.status === "pending" || action.status === "running") &&
            String(action.routeRunStopId) === stopIdStr
    );
}
export function getQueueSummary(tenantId: string | undefined, oid: string | undefined) {
    const state = loadQueueForUser(tenantId, oid);
    const actions = state.actions || [];
    const totalPending = actions.filter((a) => a.status === "pending").length;
    const totalRunning = actions.filter((a) => a.status === "running").length;
    const totalFailed = actions.filter((a) => a.status === "failed").length;
    const totalConflict = actions.filter((a) => a.status === "conflict").length;
    return {
        totalPending,
        totalRunning,
        totalFailed,
        totalConflict,
        hasPending: totalPending > 0,
        hasConflict: totalConflict > 0,
    };
}

export function getStopSyncState(
    tenantId: string | undefined,
    oid: string | undefined,
    routeRunStopId: string | number
): "conflict" | "queued" | "idle" {
    const state = loadQueueForUser(tenantId, oid);
    const actions = state.actions || [];
    const stopIdStr = String(routeRunStopId);

    // We filter by payload.routeRunStopId OR action.routeRunStopId
    const related = actions.filter(
        (a) =>
            String(a.routeRunStopId) === stopIdStr ||
            (a.payload && (a.payload as any).routeRunStopId === stopIdStr) ||
            (a.payload && (a.payload as any).stopId === stopIdStr)
    );

    if (related.some((a) => a.status === "conflict")) return "conflict";
    if (related.some((a) => a.status === "pending" || a.status === "running")) return "queued";
    return "idle";
}
