import { cn } from "../../lib/utils";
import { OpsCard } from "./OpsCard";

type StatCardTone = "default" | "brand" | "success" | "warning" | "danger";

interface StatCardProps {
    label: string;
    value: number | string;
    /** Colors the value — only reach for a status tone when the number itself carries condition meaning. */
    tone?: StatCardTone;
    /** Small trailing unit, e.g. "m" for minutes. */
    unit?: string;
    className?: string;
}

// Per the design-system StatCard spec (components/core/StatCard.jsx): uppercase
// eyebrow label over a large tabular-numeral value. The unit of the dashboards
// & Control Center snapshot. Aggregate metrics only — never per-worker.
const TONE_CLASSES: Record<StatCardTone, string> = {
    default: "text-(--gray-800)",
    brand:   "text-(--color-brand-700)",
    success: "text-(--color-success)",
    warning: "text-(--color-warning)",
    danger:  "text-(--color-danger)",
};

export function StatCard({ label, value, tone = "default", unit, className }: StatCardProps) {
    return (
        <OpsCard className={className}>
            <div className="text-xs font-semibold uppercase tracking-wide text-(--text-muted) mb-2">
                {label}
            </div>
            <div className={cn("text-4xl font-bold leading-none tabular-nums lining-nums", TONE_CLASSES[tone])}>
                {value}
                {unit && <span className="text-xl font-semibold ml-0.5">{unit}</span>}
            </div>
        </OpsCard>
    );
}
