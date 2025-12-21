
import type { Stop } from "../api/routeRuns";

/**
 * Returns the durable asset identity key for a stop.
 * Prefers asset_id, falls back to "stop:<stop_id>".
 * Used for map markers, scroll targets, and identifying "the same physical place".
 */
export function getDurableAssetKey(stop: Stop): string {
    if (stop.asset_id) {
        return stop.asset_id;
    }
    return `stop:${stop.stop_id}`;
}

/**
 * Returns the visit-instance identity key (route_run_stop_id).
 * Used for action execution, list keys, and offline queue idempotency.
 */
export function getVisitKey(stop: Stop): string {
    return String(stop.route_run_stop_id);
}

/**
 * Returns a safe DOM id string derived from the durable key.
 * Sanitizes colons to hyphens to ensure valid querySelector usage.
 * Format: "asset-<sanitized_key>"
 */
export function getSafeDomIdFromKey(key: string): string {
    // Replace colons and other scary chars with hyphens
    const sanitized = key.replace(/[:.]/g, "-");
    return `asset-${sanitized}`;
}

export function getSafeDomId(stop: Stop): string {
    return getSafeDomIdFromKey(getDurableAssetKey(stop));
}
