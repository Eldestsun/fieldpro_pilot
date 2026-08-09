export interface AuditLogEntry {
    /** bigint — serialized as a string by the backend */
    id: number | string;
    actor_oid: string;
    action: string;
    resource_type: string | null;
    resource_id: string | null;
    detail: Record<string, unknown> | null;
    ip_address: string | null;
    occurred_at: string;
}

export interface AuditLogResponse {
    entries: AuditLogEntry[];
    total: number;
    from: string;
    to: string;
}

export interface AuditLogParams {
    /** ISO date (YYYY-MM-DD). Backend defaults to 30 days ago. */
    from?: string;
    /** ISO date (YYYY-MM-DD). Backend defaults to now. */
    to?: string;
    action?: string;
}

/**
 * Mirror of backend/src/middleware/auditActions.ts AUDIT_KNOWN_ACTIONS.
 * The backend module cannot be imported across the workspace boundary —
 * keep this list in sync with it. Unknown filters are warned-but-queried
 * server-side, so drift degrades gracefully.
 */
export const AUDIT_KNOWN_ACTIONS: readonly string[] = [
    "auth.login",
    "auth.login_failed",
    "assignment.create",
    "assignment.reassign",
    "assignment.cancel",
    "export.data_export",
    "export.delete_confirm",
    "export.delete_execute",
    "admin.config_change",
    "admin.user_role_change",
    "admin.stop_edit",
    "admin.route_edit",
    "upload.rejected",
    "admin.oid_decrypt",
    "auth.dev_bypass",
    "admin.audit_log_read",
    "admin.eam_bridge_populate",
];

function buildQuery(params: AuditLogParams, format?: "csv"): string {
    const q = new URLSearchParams();
    if (params.from) q.set("from", params.from);
    // A bare date parses as midnight UTC — widen `to` to end-of-day so the
    // chosen end date is inclusive, matching what a date picker implies.
    if (params.to) q.set("to", `${params.to}T23:59:59.999Z`);
    if (params.action) q.set("action", params.action);
    if (format) q.set("format", format);
    const s = q.toString();
    return s ? `?${s}` : "";
}

async function throwApiError(res: Response, fallback: string): Promise<never> {
    // Prefer JSON error messages, but don't crash if body isn't JSON
    try {
        const data = await res.json();
        throw new Error(data?.error || `${fallback} (${res.status})`);
    } catch (e) {
        if (e instanceof Error && e.message !== `${fallback} (${res.status})` && !(e instanceof SyntaxError)) {
            throw e;
        }
        throw new Error(`${fallback} (${res.status})`);
    }
}

export async function listAuditLog(
    token: string,
    params: AuditLogParams = {},
): Promise<AuditLogResponse> {
    const res = await fetch(`/api/admin/audit-log${buildQuery(params)}`, {
        headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
        await throwApiError(res, "Failed to fetch audit log");
    }

    return res.json();
}

export async function downloadAuditLogCsv(
    token: string,
    params: AuditLogParams = {},
): Promise<void> {
    const res = await fetch(`/api/admin/audit-log${buildQuery(params, "csv")}`, {
        headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
        await throwApiError(res, "Failed to export audit log CSV");
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${params.from ?? "start"}-to-${params.to ?? "now"}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
