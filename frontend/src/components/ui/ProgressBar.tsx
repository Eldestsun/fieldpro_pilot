import { cn } from "../../lib/utils";

type ProgressBarTone = "success" | "brand" | "warning";

interface ProgressBarProps {
    value?: number;
    max?: number;
    tone?: ProgressBarTone;
    /** Track height in px. */
    height?: number;
    /** Renders a "{value} of {max}" / percent row above the track. */
    showLabel?: boolean;
    className?: string;
}

// Per the design-system ProgressBar spec (components/data/ProgressBar.jsx): a
// thin completion track for route / aggregate progress — never per-worker.
const TONE_CLASSES: Record<ProgressBarTone, string> = {
    success: "bg-(--color-success)",
    brand:   "bg-(--color-brand-700)",
    warning: "bg-(--color-warning)",
};

export function ProgressBar({
    value = 0,
    max = 100,
    tone = "success",
    height = 8,
    showLabel = false,
    className,
}: ProgressBarProps) {
    const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
    return (
        <div className={cn("w-full", className)}>
            {showLabel && (
                <div className="flex justify-between text-sm text-(--text-muted) mb-1.5 tabular-nums">
                    <span className="text-(--text-body)">{value} of {max}</span>
                    <span>{Math.round(pct)}%</span>
                </div>
            )}
            <div className="bg-(--gray-200) rounded-full overflow-hidden" style={{ height }}>
                {/* Fill width is data-driven — inline style is the documented exception */}
                <div
                    className={cn("h-full rounded-full transition-[width] duration-300", TONE_CLASSES[tone])}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
}
