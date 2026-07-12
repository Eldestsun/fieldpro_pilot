import { cn } from "../../lib/utils";

type OpsBadgeVariant = "status" | "info" | "danger" | "success" | "warning" | "neutral" | "pending";

interface OpsBadgeProps {
    variant?: OpsBadgeVariant;
    value: string;
}

// Variants per the design-system Badge spec (components/core/Badge.jsx).
// Semantic colors carry asset-condition / operational meaning only.
// The pending pair is hardcoded there too — no token exists for it.
const VARIANT_CLASSES: Record<OpsBadgeVariant, string> = {
    status:  "bg-(--color-brand-50) text-(--color-brand-700)",
    info:    "bg-(--color-brand-50) text-(--color-brand-700)",
    danger:  "bg-(--color-danger-tint) text-(--color-danger)",
    success: "bg-(--color-success-tint) text-(--color-success)",
    warning: "bg-(--color-warning-tint) text-(--color-warning)",
    neutral: "bg-(--gray-100) text-(--gray-600)",
    pending: "bg-[#fef3c7] text-[#92400e]",
};

export function OpsBadge({ variant = "info", value }: OpsBadgeProps) {
    return (
        <span className={cn(
            "inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap",
            VARIANT_CLASSES[variant]
        )}>
            {value}
        </span>
    );
}
