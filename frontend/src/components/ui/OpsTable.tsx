import type { ReactNode } from "react";

interface OpsTableProps {
    headers: string[];
    children: ReactNode;
    numericColumns?: number[]; // indices of columns that should be right-aligned
}

export function OpsTable({ headers, children, numericColumns = [] }: OpsTableProps) {
    return (
        <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                    <tr style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                        {headers.map((header, idx) => (
                            <th
                                key={idx}
                                style={{
                                    padding: "12px 1rem",
                                    fontSize: "0.75rem",
                                    fontWeight: 600,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.05em",
                                    color: "#4a5568",
                                    textAlign: numericColumns.includes(idx) ? "right" : "left",
                                }}
                            >
                                {header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody style={{ fontSize: "0.875rem", color: "#2d3748" }}>
                    {children}
                </tbody>
            </table>
        </div>
    );
}

export function OpsTableRow({ children, onClick, style }: { children: ReactNode; onClick?: () => void; style?: React.CSSProperties }) {
    return (
        <tr
            onClick={onClick}
            style={{
                borderBottom: "1px solid #edf2f7",
                cursor: onClick ? "pointer" : "default",
                backgroundColor: "transparent",
                transition: "background-color 0.15s ease-in-out",
                ...style,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f7fafc")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
        >
            {children}
        </tr>
    );
}

export function OpsTableCell({ children, alignRight, style, ...props }: { children: ReactNode; alignRight?: boolean; style?: React.CSSProperties } & React.TdHTMLAttributes<HTMLTableCellElement>) {
    return (
        <td
            {...props}
            style={{
                padding: "12px 1rem",
                textAlign: alignRight ? "right" : "left",
                ...style,
            }}
        >
            {children}
        </td>
    );
}
