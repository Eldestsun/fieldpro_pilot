import { cn } from "../../lib/utils";
import { formatStopLocation } from "../../utils/formatStopLocation";
import type { Stop } from "../../api/routeRuns";

interface StopListItemProps {
  stop: Stop;
  onClick: () => void;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending:     { label: "Pending",     className: "bg-amber-100 text-amber-800" },
  in_progress: { label: "In Progress", className: "bg-blue-100 text-blue-700"  },
  done:        { label: "Done",        className: "bg-green-100 text-green-800" },
  skipped:     { label: "Skipped",     className: "bg-gray-100 text-gray-500"  },
};

export function StopListItem({ stop, onClick }: StopListItemProps) {
  const badge = STATUS_BADGE[stop.status] ?? STATUS_BADGE.pending;
  const syncState = (stop as any).syncState as string | undefined;
  const location = formatStopLocation(stop);

  return (
    <li
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 p-4 bg-white rounded-lg border border-gray-200",
        "min-h-[44px] cursor-pointer shadow-sm select-none",
        "transition-colors active:bg-gray-50 hover:border-gray-300",
        stop.status === "done" && "opacity-70",
      )}
    >
      {/* Sequence number */}
      <div className="shrink-0 min-w-[2rem] text-center text-xs font-bold text-gray-500 bg-gray-100 border border-gray-200 rounded px-1.5 py-1 mt-0.5">
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
              <span className="text-xs" title="Hotspot">🔥 Hotspot</span>
            )}
            {stop.compactor && (
              <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded">
                Compactor
              </span>
            )}
            {stop.has_trash && (
              <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 border border-gray-200 rounded">
                Trash bag
              </span>
            )}
          </div>
        )}

        {/* Offline sync indicator */}
        {syncState === "queued" && (
          <p className="mt-1.5 text-xs text-amber-600 font-medium">⏳ Queued — will sync when online</p>
        )}
        {syncState === "conflict" && (
          <p className="mt-1.5 text-xs text-red-600 font-medium">⚠ Sync conflict</p>
        )}
      </div>
    </li>
  );
}
