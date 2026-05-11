import { cn } from "../../lib/utils";
import type { ReactNode } from "react";

interface OpsTableProps {
    headers: string[];
    children: ReactNode;
    numericColumns?: number[];
}

export function OpsTable({ headers, children, numericColumns = [] }: OpsTableProps) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
                <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                        {headers.map((header, idx) => (
                            <th
                                key={idx}
                                className={cn(
                                    "px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-600",
                                    numericColumns.includes(idx) ? "text-right" : "text-left"
                                )}
                            >
                                {header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="text-sm text-gray-800">
                    {children}
                </tbody>
            </table>
        </div>
    );
}

export function OpsTableRow({
    children,
    onClick,
    className,
    /** @deprecated Use className instead. Kept for backward compat. */
    style,
}: {
    children: ReactNode;
    onClick?: () => void;
    className?: string;
    style?: React.CSSProperties;
}) {
    return (
        <tr
            onClick={onClick}
            className={cn(
                "border-b border-gray-100 transition-colors",
                onClick ? "cursor-pointer hover:bg-gray-50" : "cursor-default",
                className
            )}
            style={style}
        >
            {children}
        </tr>
    );
}

export function OpsTableCell({
    children,
    alignRight,
    className,
    /** @deprecated Use className instead. Kept for backward compat. */
    style,
    ...props
}: {
    children: ReactNode;
    alignRight?: boolean;
    className?: string;
    style?: React.CSSProperties;
} & React.TdHTMLAttributes<HTMLTableCellElement>) {
    return (
        <td
            {...props}
            className={cn(
                "px-4 py-3",
                alignRight ? "text-right" : "text-left",
                className
            )}
            style={style}
        >
            {children}
        </td>
    );
}
