import { cn } from "../../lib/utils";
import type { ReactNode } from "react";

// padding prop kept for backward compat with admin callers (Surface 5 will migrate those).
// Surface 4+ callers should use className instead.
const PADDING_CLASS: Record<string, string> = {
    "0": "p-0",
    "0.75rem": "p-3",
    "1rem": "p-4",
    "1.5rem": "p-6",
};

interface OpsCardProps {
    children: ReactNode;
    /** @deprecated Use className instead. Kept for backward compat. */
    padding?: string | number;
    /** @deprecated Use className instead. Kept for backward compat with admin callers. */
    style?: React.CSSProperties;
    className?: string;
}

export function OpsCard({ children, padding = "1.5rem", style, className }: OpsCardProps) {
    const paddingClass = PADDING_CLASS[String(padding)] ?? "p-6";
    return (
        <div
            className={cn(
                "bg-white border border-gray-200 rounded-lg shadow-sm",
                paddingClass,
                className
            )}
            style={style}
        >
            {children}
        </div>
    );
}
