import type { ReactNode } from "react";

type OpsButtonVariant = "primary" | "secondary" | "danger" | "outline";
type OpsButtonSize = "sm" | "md" | "lg";

interface OpsButtonProps {
    variant?: OpsButtonVariant;
    size?: OpsButtonSize;
    onClick?: () => void;
    disabled?: boolean;
    children: ReactNode;
    style?: React.CSSProperties;
    type?: "button" | "submit" | "reset";
}

export function OpsButton({
    variant = "primary",
    size = "md",
    onClick,
    disabled,
    children,
    style,
    type = "button",
}: OpsButtonProps) {
    const getVariantStyles = (v: OpsButtonVariant) => {
        switch (v) {
            case "primary":
                return {
                    bg: "#2b6cb0",
                    color: "white",
                    border: "none",
                    hover: "#2c5282",
                };
            case "secondary":
                return {
                    bg: "#edf2f7",
                    color: "#2d3748",
                    border: "none",
                    hover: "#e2e8f0",
                };
            case "danger":
                return {
                    bg: "#e53e3e",
                    color: "white",
                    border: "none",
                    hover: "#c53030",
                };
            case "outline":
                return {
                    bg: "transparent",
                    color: "#4a5568",
                    border: "1px solid #cbd5e0",
                    hover: "#f7fafc",
                };
            default:
                return {};
        }
    };

    const getSizeStyles = (s: OpsButtonSize) => {
        switch (s) {
            case "sm":
                return { padding: "0.25rem 0.5rem", fontSize: "0.75rem" };
            case "lg":
                return { padding: "0.75rem 1.5rem", fontSize: "1rem" };
            default:
                return { padding: "0.5rem 1rem", fontSize: "0.875rem" };
        }
    };

    const vStyle = getVariantStyles(variant) as any;
    const sStyle = getSizeStyles(size);

    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled}
            style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 600,
                borderRadius: "6px",
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.6 : 1,
                transition: "all 0.2s",
                backgroundColor: vStyle.bg,
                color: vStyle.color,
                border: vStyle.border,
                ...sStyle,
                ...style,
            }}
            onMouseEnter={(e) => {
                if (!disabled) e.currentTarget.style.backgroundColor = vStyle.hover;
            }}
            onMouseLeave={(e) => {
                if (!disabled) e.currentTarget.style.backgroundColor = vStyle.bg;
            }}
        >
            {children}
        </button>
    );
}
