export interface ExportRequestResponse {
    /** Raw confirmation token — returned exactly once, never retrievable again. */
    confirmation_token: string;
    /** Download URL path for the gzipped bundle (token id embedded). */
    export_path: string;
    /** ISO timestamp — token expiry (7 days from issue). */
    expires_at: string;
    instructions: string;
}

export interface ExecuteDeleteResponse {
    deleted: boolean;
    /** Per-table deleted-row counts, including audit_log. */
    deletion_summary: Record<string, number>;
    executed_at: string;
}

/**
 * Error carrying the HTTP status so the panel can map specific failure
 * modes (410 token expired, 409 already consumed, 403 cross-org) to
 * user-facing copy.
 */
export class ExportDeleteApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = "ExportDeleteApiError";
        this.status = status;
    }
}

async function throwApiError(res: Response, fallback: string): Promise<never> {
    let message = `${fallback} (${res.status})`;
    try {
        const data = await res.json();
        if (data?.error) message = data.error;
    } catch {
        // non-JSON body — keep fallback
    }
    throw new ExportDeleteApiError(message, res.status);
}

export async function requestExport(token: string): Promise<ExportRequestResponse> {
    const res = await fetch("/api/admin/export-and-delete/request", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
        await throwApiError(res, "Failed to request export bundle");
    }

    return res.json();
}

/**
 * Download the gzipped export bundle. The endpoint requires the Bearer
 * header, so this fetches to a blob and triggers a browser download
 * rather than linking to export_path directly.
 */
export async function downloadExport(token: string, exportPath: string): Promise<void> {
    const res = await fetch(exportPath, {
        headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
        await throwApiError(res, "Failed to download export bundle");
    }

    const blob = await res.blob();
    const tokenId = exportPath.split("/").pop() ?? "bundle";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `baseline-export-${tokenId}.json.gz`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export async function executeDelete(
    token: string,
    confirmationToken: string,
): Promise<ExecuteDeleteResponse> {
    const res = await fetch("/api/admin/export-and-delete/execute", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirmation_token: confirmationToken }),
    });

    if (!res.ok) {
        await throwApiError(res, "Failed to execute deletion");
    }

    return res.json();
}
