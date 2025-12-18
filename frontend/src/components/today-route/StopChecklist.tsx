
import type { ChecklistState } from "../../api/routeRuns";

interface StopChecklistProps {
    checklist: ChecklistState;
    isReadOnly: boolean;
    onToggle: (field: keyof ChecklistState) => void;
}

export function StopChecklist({ checklist, isReadOnly, onToggle }: StopChecklistProps) {
    const items = [
        { key: "picked_up_litter", label: "Picked up litter" },
        { key: "emptied_trash", label: "Emptied trash" },
        { key: "washed_shelter", label: "Pressure Washed shelter" },
        { key: "washed_pad", label: "Scrubbed pad" },
        { key: "washed_can", label: "Washed Trash Receptacle"}
    ];

    return (
        <div style={{ marginBottom: "2rem" }}>
            <h3 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Tasks</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {items.map(({ key, label }) => {
                    const isChecked = checklist[key as keyof ChecklistState] || false;
                    return (
                        <label
                            key={key}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.75rem",
                                cursor: isReadOnly ? "default" : "pointer",
                                padding: "0.5rem",
                                background: "#f8f9fa",
                                borderRadius: "6px",
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={!!isChecked}
                                onChange={() => onToggle(key as keyof ChecklistState)}
                                disabled={isReadOnly}
                                style={{ width: "1.3rem", height: "1.3rem" }}
                            />
                            <span style={{ fontSize: "1.1rem", color: isReadOnly ? "#777" : "#000" }}>
                                {label}
                            </span>
                        </label>
                    );
                })}
            </div>
        </div>
    );
}
