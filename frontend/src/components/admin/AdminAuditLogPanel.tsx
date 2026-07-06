import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import {
    listAuditLog,
    downloadAuditLogCsv,
    AUDIT_KNOWN_ACTIONS,
    type AuditLogEntry,
} from "../../api/auditLog";
import { OpsLayout } from "../ui/OpsLayout";
import { OpsButton } from "../ui/OpsButton";
import { DataTable, type DataTableColumn } from "../ui/DataTable";

const PAGE_SIZE = 20;

function isoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
}

function defaultFrom(): string {
    return isoDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
}

function defaultTo(): string {
    return isoDate(new Date());
}

// LABOR SAFETY (T1-A5): actor_oid renders as the RAW OID. No name resolution,
// no role lookup, no join against identity_directory. This panel is the one
// policy-sanctioned actor_oid surface (planning/security/ADMIN_ACCESS_POLICY.md)
// and is Admin-only at the route guard.
const columns: DataTableColumn<AuditLogEntry>[] = [
    {
        key: "occurred_at",
        header: "Occurred At",
        sortable: true,
        getValue: e => e.occurred_at,
        render: e => (
            <span className="whitespace-nowrap text-gray-700">
                {new Date(e.occurred_at).toLocaleString()}
            </span>
        ),
    },
    {
        key: "action",
        header: "Action",
        sortable: true,
        getValue: e => e.action,
        render: e => <span className="font-semibold text-gray-900">{e.action}</span>,
    },
    {
        key: "resource_type",
        header: "Resource Type",
        sortable: true,
        getValue: e => e.resource_type ?? "",
    },
    {
        key: "resource_id",
        header: "Resource ID",
        getValue: e => e.resource_id ?? "",
        render: e => <span className="font-mono text-xs text-gray-600">{e.resource_id ?? ""}</span>,
    },
    {
        key: "actor_oid",
        header: "Actor OID",
        getValue: e => e.actor_oid,
        render: e => <span className="font-mono text-xs text-gray-600">{e.actor_oid}</span>,
    },
    {
        key: "ip_address",
        header: "IP Address",
        getValue: e => e.ip_address ?? "",
        render: e => <span className="font-mono text-xs text-gray-600">{e.ip_address ?? ""}</span>,
    },
];

export function AdminAuditLogPanel() {
    const { getAccessToken } = useAuth();
    const [entries, setEntries] = useState<AuditLogEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [isExporting, setIsExporting] = useState(false);

    const [fromDate, setFromDate] = useState(defaultFrom);
    const [toDate, setToDate] = useState(defaultTo);
    const [actionFilter, setActionFilter] = useState("");

    const fetchEntries = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const token = await getAccessToken();
            const data = await listAuditLog(token, {
                from: fromDate || undefined,
                to: toDate || undefined,
                action: actionFilter || undefined,
            });
            setEntries(data.entries);
            setTotal(data.total);
            setPage(1);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load audit log");
            setEntries([]);
            setTotal(0);
        } finally {
            setIsLoading(false);
        }
    }, [getAccessToken, fromDate, toDate, actionFilter]);

    useEffect(() => {
        fetchEntries();
    }, [fetchEntries]);

    const handleExportCsv = async () => {
        setIsExporting(true);
        setError(null);
        try {
            const token = await getAccessToken();
            await downloadAuditLogCsv(token, {
                from: fromDate || undefined,
                to: toDate || undefined,
                action: actionFilter || undefined,
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to export CSV");
        } finally {
            setIsExporting(false);
        }
    };

    const truncated = total > entries.length;

    return (
        <OpsLayout
            title="Audit Log"
            subtitle="Immutable security audit trail. Reads of this log are themselves logged."
            rightActions={
                <OpsButton
                    variant="secondary"
                    onClick={handleExportCsv}
                    disabled={isExporting || isLoading}
                >
                    {isExporting ? "Exporting…" : "Export CSV"}
                </OpsButton>
            }
        >
            {/* Filters */}
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 mb-6">
                <div className="flex gap-4 items-end flex-wrap">
                    <div>
                        <label htmlFor="audit-from" className="block text-sm font-semibold text-gray-700 mb-1">
                            From
                        </label>
                        <input
                            id="audit-from"
                            type="date"
                            value={fromDate}
                            onChange={e => setFromDate(e.target.value)}
                            className="px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                        />
                    </div>
                    <div>
                        <label htmlFor="audit-to" className="block text-sm font-semibold text-gray-700 mb-1">
                            To
                        </label>
                        <input
                            id="audit-to"
                            type="date"
                            value={toDate}
                            onChange={e => setToDate(e.target.value)}
                            className="px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                        />
                    </div>
                    <div className="flex-1 min-w-[220px] max-w-xs">
                        <label htmlFor="audit-action" className="block text-sm font-semibold text-gray-700 mb-1">
                            Action
                        </label>
                        <select
                            id="audit-action"
                            value={actionFilter}
                            onChange={e => setActionFilter(e.target.value)}
                            className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                        >
                            <option value="">All actions</option>
                            {AUDIT_KNOWN_ACTIONS.map(a => (
                                <option key={a} value={a}>{a}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-6 text-sm" role="alert">
                    {error}
                    <button
                        onClick={fetchEntries}
                        className="ml-3 underline font-medium hover:text-red-900"
                    >
                        Retry
                    </button>
                </div>
            )}

            {truncated && !isLoading && !error && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 mb-6 text-sm">
                    Showing the most recent {entries.length} of {total} entries.
                    Narrow the date window or add an action filter to see older entries.
                </div>
            )}

            <DataTable<AuditLogEntry>
                columns={columns}
                data={entries}
                getRowKey={e => String(e.id)}
                total={entries.length}
                pageSize={PAGE_SIZE}
                page={page}
                onPageChange={setPage}
                isLoading={isLoading}
                emptyMessage="No audit entries in this window."
            />
        </OpsLayout>
    );
}
