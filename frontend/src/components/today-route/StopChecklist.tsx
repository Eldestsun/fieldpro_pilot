import { cn } from "../../lib/utils";
import type { ChecklistState } from "../../api/routeRuns";

interface StopChecklistProps {
  checklist: ChecklistState;
  isReadOnly: boolean;
  onToggle: (field: keyof ChecklistState) => void;
}

const ITEMS = [
  { key: "picked_up_litter",  label: "Picked up litter" },
  { key: "emptied_trash",     label: "Emptied trash" },
  { key: "washed_shelter",    label: "Pressure washed shelter" },
  { key: "washed_pad",        label: "Scrubbed pad" },
  { key: "washed_can",        label: "Washed trash receptacle" },
] as const;

export function StopChecklist({ checklist, isReadOnly, onToggle }: StopChecklistProps) {
  return (
    <div className="mb-8">
      <h3 className="text-base font-semibold text-gray-700 mb-2">Tasks</h3>
      <div className="flex flex-col gap-3">
        {ITEMS.map(({ key, label }) => {
          const isChecked = !!checklist[key as keyof ChecklistState];
          return (
            <label
              key={key}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg min-h-[44px] transition-colors",
                isReadOnly
                  ? "cursor-default bg-gray-50"
                  : isChecked
                    ? "cursor-pointer bg-green-50 border border-green-300"
                    : "cursor-pointer bg-white border border-gray-200 hover:border-gray-300",
              )}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => onToggle(key as keyof ChecklistState)}
                disabled={isReadOnly}
                className="w-5 h-5 shrink-0 accent-green-600"
              />
              <span className={cn("text-base", isReadOnly ? "text-gray-400" : "text-gray-900")}>
                {label}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
