import type { Stop } from "../../api/routeRuns";
import { StopListItem } from "./StopListItem";
import { getSafeDomId } from "../../utils/identity";

interface StopListProps {
  stops: Stop[];
  onSelectStop: (id: number) => void;
}

export function StopList({ stops, onSelectStop }: StopListProps) {
  return (
    <ul className="list-none p-0 m-0 flex flex-col gap-3">
      {stops.map((stop) => (
        <div key={stop.route_run_stop_id} id={getSafeDomId(stop)}>
          <StopListItem
            stop={stop}
            onClick={() => onSelectStop(stop.route_run_stop_id)}
          />
        </div>
      ))}
    </ul>
  );
}
