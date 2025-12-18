

type OpsBadgeVariant = "status" | "info" | "danger" | "success" | "warning" | "neutral";

interface OpsBadgeProps {
    variant?: OpsBadgeVariant;
    value: string;
}

export function OpsBadge({ variant = "info", value }: OpsBadgeProps) {
    const getStyles = (v: OpsBadgeVariant) => {
        switch (v) {
            case "status":
            case "info":
                return { bg: "#ebf8ff", text: "#2b6cb0" };
            case "danger":
                return { bg: "#fff5f5", text: "#c53030" };
            case "success":
                return { bg: "#f0fff4", text: "#2f855a" };
            case "warning":
                return { bg: "#fffaf0", text: "#c05621" };
            case "neutral":
            default:
                return { bg: "#edf2f7", text: "#4a5568" };
        }
    };

    const { bg, text } = getStyles(variant);

    return (
        <span
            style={{
                display: "inline-block",
                padding: "0.125rem 0.625rem",
                borderRadius: "9999px",
                fontSize: "0.75rem",
                fontWeight: 600,
                backgroundColor: bg,
                color: text,
                whiteSpace: "nowrap",
            }}
        >
            {value}
        </span>
    );
}
