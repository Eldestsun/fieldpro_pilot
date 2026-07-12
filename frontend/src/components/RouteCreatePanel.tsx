import { useCreateRoute } from "../hooks/useCreateRoute";
import { OpsCard } from "./ui/OpsCard";
import { OpsButton } from "./ui/OpsButton";
import { OpsTable, OpsTableRow, OpsTableCell } from "./ui/OpsTable";

interface RouteCreatePanelProps {
    isOpen: boolean;
    onClose: () => void;
    hook: ReturnType<typeof useCreateRoute>;
}

export function RouteCreatePanel({ isOpen, onClose, hook }: RouteCreatePanelProps) {
    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black/40 flex justify-end z-[1000] backdrop-blur-sm"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
        >
            <div
                className="w-[480px] max-w-full bg-white h-full p-8 flex flex-col shadow-2xl overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="mb-6">
                    <h2 className="m-0 text-2xl font-bold text-gray-900">Create Route</h2>
                    <p className="mt-2 mb-0 text-gray-500 text-base">
                        Configure and preview a new route run.
                    </p>
                </header>

                {/* D3b — creation mode. Pool = risk-ranked selection from the pool;
                    Ad-hoc = hand-picked stops (explicit is_adhoc flag on create). */}
                <div className="flex gap-2 mb-6" role="tablist" aria-label="Creation mode">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={hook.mode === "pool"}
                        onClick={() => hook.switchMode("pool")}
                        className={
                            hook.mode === "pool"
                                ? "flex-1 px-3 py-2 rounded-md text-sm font-semibold bg-blue-700 text-white"
                                : "flex-1 px-3 py-2 rounded-md text-sm font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }
                    >
                        From Pool
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={hook.mode === "adhoc"}
                        onClick={() => hook.switchMode("adhoc")}
                        className={
                            hook.mode === "adhoc"
                                ? "flex-1 px-3 py-2 rounded-md text-sm font-semibold bg-blue-700 text-white"
                                : "flex-1 px-3 py-2 rounded-md text-sm font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }
                    >
                        Ad-hoc Stops
                    </button>
                </div>

                {hook.error && (
                    <OpsCard className="bg-red-50 border-red-200 mb-6 p-3">
                        <p className="m-0 text-red-700 text-sm">{hook.error}</p>
                    </OpsCard>
                )}

                <div className="flex flex-col gap-5">
                    <div>
                        <label className="block mb-2 font-semibold text-sm text-gray-700">
                            Route Pool <span className="text-red-500">*</span>
                        </label>
                        <select
                            value={hook.selectedPoolId}
                            onChange={(e) => hook.setPool(e.target.value)}
                            disabled={hook.loadingOptions || hook.loadingPreview || hook.savingRoute}
                            className="w-full px-3 py-2.5 rounded-md border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] disabled:bg-gray-50 disabled:text-gray-400"
                        >
                            <option value="">-- Select Pool --</option>
                            {hook.pools.map((p) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block mb-2 font-semibold text-sm text-gray-700">
                            Dispatch Base <span className="text-red-500">*</span>
                        </label>
                        <select
                            value={hook.selectedBaseId}
                            onChange={(e) => hook.setBase(e.target.value)}
                            disabled={hook.loadingOptions || hook.loadingPreview || hook.savingRoute}
                            className="w-full px-3 py-2.5 rounded-md border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] disabled:bg-gray-50 disabled:text-gray-400"
                        >
                            <option value="">-- Select Base --</option>
                            {hook.bases.map((b) => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                        <p className="mt-1 mb-0 text-xs text-gray-400">
                            The depot the route is dispatched from. Defaults to the pool's base when it has one.
                        </p>
                    </div>

                    <div>
                        <label className="block mb-2 font-semibold text-sm text-gray-700">
                            Assigned Field Crew <span className="text-red-500">*</span>
                        </label>
                        <select
                            value={hook.selectedUlId}
                            onChange={(e) => hook.setUl(e.target.value)}
                            disabled={hook.loadingOptions || hook.loadingPreview || hook.savingRoute}
                            className="w-full px-3 py-2.5 rounded-md border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] disabled:bg-gray-50 disabled:text-gray-400"
                        >
                            <option value="">-- Select Crew member --</option>
                            {hook.uls.map((u) => (
                                <option key={u.id} value={u.id}>{u.displayName}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block mb-2 font-semibold text-sm text-gray-700">Date</label>
                        <input
                            type="text"
                            value={hook.runDate}
                            readOnly
                            className="w-full px-3 py-2.5 rounded-md border border-gray-200 bg-gray-50 text-gray-500 text-sm min-h-[44px]"
                        />
                    </div>

                    <div>
                        <label className="block mb-2 font-semibold text-sm text-gray-700">Shift</label>
                        <select
                            value={hook.shiftType}
                            onChange={(e) => hook.setShiftType(e.target.value)}
                            disabled={hook.loadingOptions || hook.loadingPreview || hook.savingRoute}
                            className="w-full px-3 py-2.5 rounded-md border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] disabled:bg-gray-50 disabled:text-gray-400"
                        >
                            <option value="day">Day</option>
                            <option value="night">Night</option>
                            <option value="all_day">All Day</option>
                        </select>
                    </div>

                    {hook.mode === "adhoc" && (
                        <div>
                            <label htmlFor="adhoc-stop-search" className="block mb-2 font-semibold text-sm text-gray-700">
                                Stops <span className="text-red-500">*</span>{" "}
                                <span className="font-normal text-gray-500">(pick at least 2)</span>
                            </label>
                            <div className="flex gap-2">
                                <input
                                    id="adhoc-stop-search"
                                    type="text"
                                    placeholder="Search stop number or street…"
                                    value={hook.stopSearch}
                                    onChange={(e) => hook.setStopSearch(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            hook.searchStops();
                                        }
                                    }}
                                    className="flex-1 px-3 py-2.5 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                                />
                                <OpsButton
                                    variant="secondary"
                                    onClick={hook.searchStops}
                                    disabled={hook.searchingStops || !hook.stopSearch.trim()}
                                >
                                    {hook.searchingStops ? "Searching…" : "Search"}
                                </OpsButton>
                            </div>

                            {hook.stopResults.length > 0 && (
                                <OpsCard className="p-0 max-h-[180px] overflow-y-auto mt-2">
                                    <ul className="m-0 p-0 list-none divide-y divide-gray-100">
                                        {hook.stopResults.map((s) => (
                                            <li key={s.stopId}>
                                                <button
                                                    type="button"
                                                    onClick={() => hook.addStop(s)}
                                                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50"
                                                >
                                                    + {s.label}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </OpsCard>
                            )}

                            {hook.selectedStops.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-3" aria-label="Selected stops">
                                    {hook.selectedStops.map((s) => (
                                        <span
                                            key={s.stopId}
                                            className="inline-flex items-center gap-1 bg-blue-50 text-blue-800 text-xs font-semibold px-2 py-1 rounded"
                                        >
                                            {s.stopId}
                                            <button
                                                type="button"
                                                aria-label={`Remove stop ${s.stopId}`}
                                                onClick={() => hook.removeStop(s.stopId)}
                                                className="bg-transparent border-0 cursor-pointer text-blue-800 font-bold px-0.5"
                                            >
                                                ×
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    <OpsButton
                        onClick={hook.generatePreview}
                        disabled={!hook.canPreview || hook.loadingPreview}
                        variant="primary"
                        className="mt-2 w-full"
                    >
                        {hook.loadingPreview ? "Generating..." : "Generate Preview"}
                    </OpsButton>
                </div>

                {hook.preview && (
                    <div className="mt-8 border-t border-gray-200 pt-6">
                        <h3 className="text-base font-bold mb-4 text-gray-900">Route Analytics</h3>

                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <OpsCard className="p-4">
                                <div className="text-xs text-gray-500 uppercase font-semibold tracking-wide mb-1">Stops</div>
                                <div className="text-xl font-bold text-gray-900">{hook.preview.ordered_stops.length}</div>
                            </OpsCard>
                            <OpsCard className="p-4">
                                <div className="text-xs text-gray-500 uppercase font-semibold tracking-wide mb-1">Miles</div>
                                <div className="text-xl font-bold text-gray-900">
                                    {(hook.preview.distance_m / 1609.34).toFixed(1)}
                                </div>
                            </OpsCard>
                        </div>

                        {hook.preview.truncated && (
                            <OpsCard className="bg-orange-50 border-orange-200 mb-6 p-3">
                                <p className="m-0 text-orange-700 text-sm font-semibold">
                                    ⚠️ Capped at {hook.preview.used_stops} stops.
                                </p>
                            </OpsCard>
                        )}

                        <OpsCard className="p-0 max-h-[300px] overflow-y-auto mb-6">
                            <OpsTable headers={["#", "Location"]}>
                                {hook.preview.ordered_stops.map((s, i) => (
                                    <OpsTableRow key={s.stop_id}>
                                        {/* Optimized order is the array order; the planner
                                            emits no `sequence` field, so index it here (was
                                            `s.sequence + 1` → NaN). */}
                                        <OpsTableCell className="text-gray-500">{i + 1}</OpsTableCell>
                                        <OpsTableCell>{s.on_street_name || s.location || s.stop_id}</OpsTableCell>
                                    </OpsTableRow>
                                ))}
                            </OpsTable>
                        </OpsCard>

                        <OpsButton
                            onClick={hook.saveRoute}
                            disabled={!hook.canSave || hook.savingRoute}
                            variant="primary"
                            className="w-full"
                        >
                            {hook.savingRoute ? "Saving..." : "Save Route"}
                        </OpsButton>
                    </div>
                )}

                <div className="mt-auto pt-8">
                    <OpsButton variant="secondary" onClick={onClose} className="w-full">
                        Cancel
                    </OpsButton>
                </div>
            </div>
        </div>
    );
}
