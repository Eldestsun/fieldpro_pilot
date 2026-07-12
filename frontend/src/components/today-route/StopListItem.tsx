import { cn } from "../../lib/utils";
import { formatStopLocation } from "../../utils/formatStopLocation";
import type { Stop } from "../../api/routeRuns";

interface StopListItemProps {
  stop: Stop;
  onClick: () => void;
  id?: string;
}

// Status pills follow the DS Badge variants: pending (amber pair), status
// (brand tint), success, neutral.
const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending:     { label: "Pending",     className: "bg-[#fef3c7] text-[#92400e]" },
  in_progress: { label: "In Progress", className: "bg-(--color-brand-100) text-(--color-brand-700)" },
  done:        { label: "Done",        className: "bg-(--color-success-tint) text-(--color-success)" },
  skipped:     { label: "Skipped",     className: "bg-(--gray-100) text-(--gray-600)" },
};

export function StopListItem({ stop, onClick, id }: StopListItemProps) {
  const badge = STATUS_BADGE[stop.status] ?? STATUS_BADGE.pending;
  const syncState = (stop as any).syncState as string | undefined;
  const location = formatStopLocation(stop);

  return (
    <li
      id={id}
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 p-4 bg-(--surface-card) rounded-lg border border-(--border-default)",
        "min-h-[44px] cursor-pointer shadow-sm select-none",
        "transition-colors active:bg-(--surface-sunken) hover:border-(--border-strong)",
        stop.status === "done" && "opacity-70",
      )}
    >
      {/* Sequence number */}
      <div className="shrink-0 min-w-[2rem] text-center text-xs font-bold font-mono text-(--gray-600) bg-(--surface-fill) border border-(--border-default) rounded px-1.5 py-1 mt-0.5">
        #{Number.isFinite(stop.sequence) ? stop.sequence : Number(stop.stopNumber)}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Location + status badge */}
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-gray-900 leading-snug">
            {location || `Stop ${stop.stopNumber}`}
          </p>
          <span
            className={cn(
              "shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide",
              badge.className,
            )}
          >
            {badge.label}
          </span>
        </div>

        {/* Metadata badges */}
        {(stop.is_hotspot || stop.compactor || stop.has_trash) && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {stop.is_hotspot && (
              <span className="text-xs px-1.5 py-0.5 bg-(--color-warning-tint) text-(--color-warning) border border-(--color-warning)/30 rounded" title="Hotspot">
                Hotspot
              </span>
            )}
            {stop.compactor && (
              <span className="text-xs px-1.5 py-0.5 bg-(--color-brand-50) text-(--color-brand-700) border border-(--color-brand-100) rounded">
                Compactor
              </span>
            )}
            {stop.has_trash && (
              <span className="text-xs px-1.5 py-0.5 bg-(--surface-fill) text-(--gray-600) border border-(--border-default) rounded">
                Trash bag
              </span>
            )}
          </div>
        )}

        {/* Offline sync indicator */}
        {syncState === "queued" && (
          <p className="mt-1.5 text-xs text-(--color-warning) font-medium">Queued — will sync when online</p>
        )}
        {syncState === "conflict" && (
          <p className="mt-1.5 text-xs text-(--color-danger) font-medium">Sync conflict</p>
        )}
      </div>
    </li>
  );
}
