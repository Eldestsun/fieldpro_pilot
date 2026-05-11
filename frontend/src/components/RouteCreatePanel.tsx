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
                <header className="mb-8">
                    <h2 className="m-0 text-2xl font-bold text-gray-900">Create Route</h2>
                    <p className="mt-2 mb-0 text-gray-500 text-base">
                        Configure and preview a new route run.
                    </p>
                </header>

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
                                {hook.preview.ordered_stops.map((s) => (
                                    <OpsTableRow key={s.stop_id}>
                                        <OpsTableCell className="text-gray-500">{s.sequence + 1}</OpsTableCell>
                                        <OpsTableCell>{s.location || s.stop_id.slice(0, 8)}</OpsTableCell>
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
