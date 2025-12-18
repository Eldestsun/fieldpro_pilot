import type { ReactNode } from "react";

interface OpsCardProps {
    children: ReactNode;
    padding?: string | number;
    style?: React.CSSProperties;
}

export function OpsCard({ children, padding = "1.5rem", style }: OpsCardProps) {
    return (
        <div
            style={{
                backgroundColor: "white",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
                padding,
                ...style,
            }}
        >
            {children}
        </div>
    );
}
