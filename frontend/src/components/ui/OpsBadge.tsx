import { cn } from "../../lib/utils";

type OpsBadgeVariant = "status" | "info" | "danger" | "success" | "warning" | "neutral";

interface OpsBadgeProps {
    variant?: OpsBadgeVariant;
    value: string;
}

const VARIANT_CLASSES: Record<OpsBadgeVariant, string> = {
    status:  "bg-blue-50 text-blue-700",
    info:    "bg-blue-50 text-blue-700",
    danger:  "bg-red-50 text-red-700",
    success: "bg-green-50 text-green-700",
    warning: "bg-orange-50 text-orange-700",
    neutral: "bg-gray-100 text-gray-600",
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
