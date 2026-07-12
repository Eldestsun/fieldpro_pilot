import { OpsButton } from "./OpsButton";

interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "danger" | "warning";
    onConfirm: () => void;
    onCancel: () => void;
}

// Per the design-system Dialog spec (components/feedback/Dialog.jsx): graphite
// scrim, radius-xl card, overlay shadow, actions composed from the Button
// primitive — warning intent maps to the primary (brand) action, danger to danger.
export function ConfirmDialog({
    isOpen,
    title,
    message,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    variant = "danger",
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-[rgba(17,24,39,0.5)] flex items-center justify-center z-[2000] p-4"
            onClick={onCancel}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="confirm-dialog-title"
                className="bg-(--surface-card) rounded-xl shadow-(--shadow-overlay) w-full max-w-[400px] p-6"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 id="confirm-dialog-title" className="text-lg font-bold text-(--text-heading) mb-2">{title}</h3>
                <p className="text-sm text-(--text-muted) mb-6">{message}</p>
                <div className="flex gap-3 justify-end">
                    <OpsButton variant="outline" onClick={onCancel}>
                        {cancelLabel}
                    </OpsButton>
                    <OpsButton variant={variant === "warning" ? "primary" : "danger"} onClick={onConfirm}>
                        {confirmLabel}
                    </OpsButton>
                </div>
            </div>
        </div>
    );
}
