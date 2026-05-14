import { cn } from "../../lib/utils";

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
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4"
            onClick={onCancel}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="confirm-dialog-title"
                className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 id="confirm-dialog-title" className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-600 mb-6">{message}</p>
                <div className="flex gap-3 justify-end">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 font-medium text-sm cursor-pointer hover:bg-gray-50 transition-colors min-h-[44px]"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={cn(
                            "px-4 py-2 rounded-lg font-medium text-sm text-white border-0 cursor-pointer transition-colors min-h-[44px]",
                            variant === "danger"
                                ? "bg-red-600 hover:bg-red-700"
                                : "bg-orange-500 hover:bg-orange-600"
                        )}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
