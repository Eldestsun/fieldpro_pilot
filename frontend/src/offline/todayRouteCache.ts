
export function saveTodayRouteCache(
    tenantId: string | undefined,
    oid: string | undefined,
    routeRun: unknown
): void {
    if (!tenantId || !oid) return;
    const key = `fieldpro-today-route:${tenantId}:${oid}`;
    try {
        localStorage.setItem(key, JSON.stringify(routeRun));
    } catch (err) {
        // Silently swallow errors (quota, disabled storage, etc.)
    }
}

export function clearTodayRouteCache(
    tenantId: string | undefined,
    oid: string | undefined
): void {
    if (!tenantId || !oid) return;
    const key = `fieldpro-today-route:${tenantId}:${oid}`;
    try {
        localStorage.removeItem(key);
    } catch (err) {
        // Silently swallow errors
    }
}
export function loadTodayRouteCache<TRouteRun = any>(
    tenantId: string | undefined,
    oid: string | undefined
): TRouteRun | null {
    if (!tenantId || !oid) return null;
    const key = `fieldpro-today-route:${tenantId}:${oid}`;
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (err) {
        return null;
    }
}
