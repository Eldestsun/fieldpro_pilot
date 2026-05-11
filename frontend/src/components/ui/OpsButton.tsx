import { cn } from "../../lib/utils";
import type { ReactNode } from "react";

type OpsButtonVariant = "primary" | "secondary" | "danger" | "outline";
type OpsButtonSize = "sm" | "md" | "lg";

interface OpsButtonProps {
    variant?: OpsButtonVariant;
    size?: OpsButtonSize;
    onClick?: () => void;
    disabled?: boolean;
    children: ReactNode;
    className?: string;
    /** @deprecated Use className instead. Kept for backward compat. */
    style?: React.CSSProperties;
    type?: "button" | "submit" | "reset";
}

const VARIANT_CLASSES: Record<OpsButtonVariant, string> = {
    primary:   "bg-blue-700 text-white border-0 hover:bg-blue-800",
    secondary: "bg-gray-100 text-gray-800 border-0 hover:bg-gray-200",
    danger:    "bg-red-500 text-white border-0 hover:bg-red-600",
    outline:   "bg-transparent text-gray-600 border border-gray-300 hover:bg-gray-50",
};

const SIZE_CLASSES: Record<OpsButtonSize, string> = {
    sm: "px-2 py-1 text-xs min-h-[32px]",
    md: "px-4 py-2 text-sm min-h-[44px]",
    lg: "px-6 py-3 text-base min-h-[44px]",
};

export function OpsButton({
    variant = "primary",
    size = "md",
    onClick,
    disabled,
    children,
    className,
    style,
    type = "button",
}: OpsButtonProps) {
    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled}
            className={cn(
                "inline-flex items-center justify-center font-semibold rounded-md transition-colors",
                VARIANT_CLASSES[variant],
                SIZE_CLASSES[size],
                disabled && "opacity-60 cursor-not-allowed",
                !disabled && "cursor-pointer",
                className
            )}
            style={style}
        >
            {children}
        </button>
    );
}
