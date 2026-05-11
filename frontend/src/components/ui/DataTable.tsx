import { cn } from "../../lib/utils";
import { useState, useMemo, type ReactNode } from "react";

type SortDir = "asc" | "desc";

export interface DataTableColumn<T = any> {
    key: string;
    header: string;
    sortable?: boolean;
    /** Used for client-side sorting. Return a primitive comparable value. */
    getValue?: (row: T) => string | number | boolean | null | undefined;
    /** Custom cell renderer. Falls back to getValue() as a string. */
    render?: (row: T) => ReactNode;
    /** className applied to every <td> in this column */
    className?: string;
    /** className applied to the <th> */
    headerClassName?: string;
}

interface DataTableProps<T = any> {
    columns: DataTableColumn<T>[];
    data: T[];
    getRowKey: (row: T) => string;
    /** Total record count across all pages (used for pagination display). */
    total: number;
    pageSize: number;
    page: number;
    onPageChange: (page: number) => void;
    /**
     * When true: data is already the current page slice (server-side).
     * Sort applies only within the provided slice; DataTable does not re-paginate.
     * When false (default): data contains ALL records; DataTable sorts + paginates.
     */
    serverPagination?: boolean;
    isLoading?: boolean;
    emptyMessage?: string;
    onRowClick?: (row: T) => void;
    className?: string;
}

export function DataTable<T>({
    columns,
    data,
    getRowKey,
    total,
    pageSize,
    page,
    onPageChange,
    serverPagination = false,
    isLoading = false,
    emptyMessage = "No results.",
    onRowClick,
    className,
}: DataTableProps<T>) {
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<SortDir>("asc");

    const handleSort = (key: string) => {
        if (sortKey === key) {
            setSortDir(d => d === "asc" ? "desc" : "asc");
        } else {
            setSortKey(key);
            setSortDir("asc");
        }
    };

    const sortedData = useMemo(() => {
        if (!sortKey) return data;
        const col = columns.find(c => c.key === sortKey);
        if (!col?.getValue) return data;
        return [...data].sort((a, b) => {
            const av = col.getValue!(a) ?? "";
            const bv = col.getValue!(b) ?? "";
            const cmp = String(av).localeCompare(String(bv), undefined, {
                numeric: true,
                sensitivity: "base",
            });
            return sortDir === "asc" ? cmp : -cmp;
        });
    }, [data, sortKey, sortDir, columns]);

    // For client-side pagination, slice after sort. For server-side, data is already paged.
    const displayData = useMemo(() => {
        if (serverPagination) return sortedData;
        const start = (page - 1) * pageSize;
        return sortedData.slice(start, start + pageSize);
    }, [sortedData, serverPagination, page, pageSize]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const showingTo = Math.min(page * pageSize, total);

    return (
        <div className={cn("overflow-hidden bg-white border border-gray-200 rounded-lg shadow-sm", className)}>
            <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                            {columns.map(col => (
                                <th
                                    key={col.key}
                                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                                    className={cn(
                                        "px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600",
                                        col.sortable && "cursor-pointer select-none hover:text-gray-900 hover:bg-gray-100",
                                        col.headerClassName
                                    )}
                                >
                                    <span className="inline-flex items-center gap-1">
                                        {col.header}
                                        {col.sortable && (
                                            <span className="text-gray-300 font-normal">
                                                {sortKey === col.key
                                                    ? (sortDir === "asc" ? "↑" : "↓")
                                                    : "↕"}
                                            </span>
                                        )}
                                    </span>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="text-sm text-gray-800 divide-y divide-gray-100">
                        {isLoading ? (
                            <tr>
                                <td colSpan={columns.length} className="px-4 py-8 text-center text-gray-400">
                                    Loading…
                                </td>
                            </tr>
                        ) : displayData.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length} className="px-4 py-8 text-center text-gray-400">
                                    {emptyMessage}
                                </td>
                            </tr>
                        ) : (
                            displayData.map((row) => (
                                <tr
                                    key={getRowKey(row)}
                                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                                    className={cn(
                                        "transition-colors",
                                        onRowClick && "cursor-pointer hover:bg-gray-50"
                                    )}
                                >
                                    {columns.map(col => (
                                        <td
                                            key={col.key}
                                            className={cn("px-4 py-3", col.className)}
                                        >
                                            {col.render
                                                ? col.render(row)
                                                : String(col.getValue?.(row) ?? "")}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination footer */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                <span className="text-sm text-gray-500">
                    {total === 0
                        ? "No results"
                        : `Showing ${showingFrom}–${showingTo} of ${total}`}
                </span>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => onPageChange(page - 1)}
                        disabled={page <= 1}
                        className={cn(
                            "px-3 py-1.5 text-sm rounded border transition-colors",
                            page <= 1
                                ? "border-gray-200 text-gray-300 cursor-not-allowed"
                                : "border-gray-300 text-gray-600 hover:bg-gray-50 cursor-pointer"
                        )}
                    >
                        ← Prev
                    </button>
                    <span className="text-sm text-gray-600 px-1">
                        Page {page} of {totalPages}
                    </span>
                    <button
                        onClick={() => onPageChange(page + 1)}
                        disabled={page >= totalPages}
                        className={cn(
                            "px-3 py-1.5 text-sm rounded border transition-colors",
                            page >= totalPages
                                ? "border-gray-200 text-gray-300 cursor-not-allowed"
                                : "border-gray-300 text-gray-600 hover:bg-gray-50 cursor-pointer"
                        )}
                    >
                        Next →
                    </button>
                </div>
            </div>
        </div>
    );
}
