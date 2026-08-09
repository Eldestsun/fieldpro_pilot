import { cn } from "../../lib/utils";
import { ProgressBar } from "../ui/ProgressBar";

interface RouteHeaderProps {
  stats: {
    pending: number;
    done: number;
    miles: string;
  };
  syncStatus: {
    statusKind: "synced" | "offline-queued" | "syncing" | "conflict";
    label: string;
  };
  routeLabel?: string;
}

const SYNC_STYLES: Record<string, string> = {
  synced: "text-green-800",
  "offline-queued": "text-amber-800",
  syncing: "text-blue-700",
  conflict: "text-red-700",
};

export function RouteHeader({ stats, syncStatus, routeLabel }: RouteHeaderProps) {
  const total = stats.done + stats.pending;
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <header className="mb-4 pb-4 border-b border-gray-200">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900 leading-tight truncate">
            {routeLabel ?? "Today's Route"}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">{today}</p>
        </div>
        <span className={cn("shrink-0 text-xs font-medium mt-0.5", SYNC_STYLES[syncStatus.statusKind] ?? "text-gray-500")}>
          {syncStatus.label}
        </span>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-sm mb-1.5 tabular-nums">
          <span className="text-gray-600">
            <strong className="text-gray-900 font-semibold">{stats.done}</strong>
            {" of "}
            <strong className="text-gray-900 font-semibold">{total}</strong>
            {" complete"}
          </span>
          <span className="text-gray-500">{stats.miles} mi</span>
        </div>
        <ProgressBar value={stats.done} max={total} />
      </div>
    </header>
  );
}
